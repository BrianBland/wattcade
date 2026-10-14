"""Production cutouts from approved candidate pixels, no generated/redesigned art.
Requires Pillow, NumPy and SciPy. Run build.py, then render.py.
"""
from pathlib import Path
import sys,json,math,shutil
sys.dont_write_bytecode=True
HERE=Path(__file__).resolve().parent
sys.path.insert(0,str(HERE.parent/'puppet-tools'))
from PIL import Image,ImageDraw
import numpy as np
from scipy import ndimage
from build_all import polygon,arclength,warp,render_species
from rig import Puppet,font,GROUND
PAD=6
SOURCE=HERE.parent/'skitter-redesign/candidate.png'
BODY=[(320,58),(340,95),(343,111),(362,101),(383,146),(375,166),(393,183),(402,212),(388,241),(384,282),(388,313),(379,344),(376,375),(357,407),(337,428),(302,428),(281,414),(258,384),(246,352),(251,324),(251,296),(247,272),(242,236),(239,214),(248,187),(264,171),(252,152),(263,118),(279,100),(290,114),(299,93)]
PLATES=[('head',0,208,[320,187],'thorax_1',60),('thorax_1',188,278,[320,248],'thorax_2',54),('thorax_2',258,344,[320,297],None,53),('thorax_3',324,398,[320,344],'thorax_2',52),('thorax_4',380,442,[320,401],'thorax_3',51)]
LEGS=[
 ('front',[[380,192],[413,184],[458,127],[516,192]],[(372,183),(390,160),(410,155),(428,126),(449,105),(480,91),(497,106),(507,130),(523,160),(525,199),(513,196),(505,169),(484,149),(460,148),(439,192),(417,207),(391,215)],'thorax_1'),
 ('mid_front',[[383,290],[418,273],[479,236],[561,317]],[(374,251),(409,236),(427,230),(450,214),(475,197),(499,205),(527,226),(555,257),(565,292),(564,319),(553,302),(539,282),(518,257),(481,249),(450,276),(419,283),(382,286)],'thorax_2'),
 ('mid_rear',[[383,344],[418,333],[483,339],[508,443]],[(375,313),(403,309),(427,311),(459,317),(481,318),(503,327),(514,348),(529,372),(529,408),(514,441),(501,447),(507,407),(495,385),(477,364),(449,365),(411,357),(382,347)],'thorax_3'),
 ('rear',[[363,385],[389,413],[432,431],[425,501]],[(350,371),(377,368),(399,384),(429,385),(447,409),(464,427),(459,456),(447,483),(426,507),(420,498),(434,465),(424,447),(400,438),(374,421),(351,401)],'thorax_4')]
TAIL=[[320,425],[320,455],[320,480],[320,503],[320,523],[320,580]]
TAIL_POLY=[(300,416),(339,416),(350,447),(345,482),(350,512),(339,545),(320,584),(301,554),(289,518),(295,483),(290,447)]

def split_emission(image):
    a=np.array(image).astype(float);rgb=a[...,:3];r,g,b=rgb.transpose(2,0,1)
    blue=np.clip((b-r-25)/65,0,1)
    hot=np.clip((g-r-30)/120,0,1)*np.clip((b-140)/90,0,1)*blue
    # Only a fraction of blue light is removed: base retains the approved blue plates,
    # material folds and eye cavities; adding emission reconstructs original RGB.
    energy=rgb*(hot*.48)[...,None]
    base=a.copy();base[...,:3]=rgb-energy
    glow=np.zeros_like(a);glow[...,:3]=energy;glow[...,3]=a[...,3]
    active=energy.max(axis=2)>1;glow[~active]=0
    base[a[...,3]==0]=0
    return Image.fromarray(np.uint8(base),'RGBA'),Image.fromarray(np.uint8(glow),'RGBA')

def build():
    raw=Image.open(SOURCE).convert('RGBA');shutil.copyfile(SOURCE,HERE/'sheet-raw.png')
    arr=np.array(raw);h,w=arr.shape[:2];yy,xx=np.mgrid[:h,:w]
    ys,xs=np.nonzero(arr[...,3]>128);scale=480/(ys.max()-ys.min()+1)
    mapping=np.array([[scale,0,320-320*scale],[0,scale,80-ys.min()*scale],[0,0,1.]])
    warp(raw,mapping).save(HERE/'source-colour-frame.png')
    masks={};records=[]
    def add(n,select,pivot,parent,z,group='body',end=None,radius=10,probe=2):
        rgba=arr.copy();rgba[...,3]=np.uint8(rgba[...,3]*select);rgba[rgba[...,3]==0]=0
        image=warp(Image.fromarray(rgba,'RGBA'),mapping);assert image.getbbox(),n;masks[n]=image
        point=lambda p:np.round((mapping@[*p,1])[:2],3).tolist()
        p=dict(name=n,file=f'parts/{n}.png',glow=f'parts/{n}_glow.png',offset=[0,0],pivot=point(pivot),parent=parent,z=z,group=group,mirror=group=='limb',probeRadiusPx=probe,jointRadiusPx=radius)
        if end is not None:p['end']=point(end)
        records.append(p)
    regions=[polygon(BODY,(h,w),2)]+[polygon(leg[2],(h,w),2) for leg in LEGS]+[polygon(TAIL_POLY,(h,w),2)]
    # Keep every source silhouette pixel. Any tissue omitted by an anatomical
    # polygon is assigned to its nearest semantic region, including mirrored legs.
    symmetrical=[]
    reflected_x=np.clip(640-xx,0,w-1)
    for i,region in enumerate(regions):
        symmetrical.append(region | region[yy,reflected_x] if i in range(1,5) else region)
    visible=arr[...,3]>0;covered=np.logical_or.reduce(symmetrical);missing=visible&~covered
    distances=np.stack([ndimage.distance_transform_edt(~(r&(arr[...,3]>128))) for r in symmetrical])
    nearest=distances.argmin(axis=0)
    for i in range(6):regions[i]|=missing&(nearest==i)
    body=regions[0]
    for n,top,bottom,pivot,parent,z in PLATES:
        slope=.20*np.abs(xx-320)
        band=np.clip(yy+slope-top+1,0,1)*np.clip(bottom-yy-slope+1,0,1)
        add(n,body*band,pivot,parent,z,radius=12)
    for leg_index,(group,points,poly,parent) in enumerate(LEGS):
        roi=regions[leg_index+1]&(xx>=320);arc,lengths,_=arclength(points,yy,xx)
        for i,seg in enumerate(['coxa','femur','claw']):
            length=lengths[i+1]-lengths[i];lo=lengths[i]-(.20*length if i else 8);hi=lengths[i+1]+5
            sel=np.clip((arc-lo+2)/3,0,1)*np.clip((hi-arc+2)/3,0,1)*roi
            name=f'{seg}_{group}_r';add(name,sel,points[i],parent,10+i*5,'limb',points[i+1],radius=11,probe=2);parent=name
    roi=regions[-1];arc,lengths,_=arclength(TAIL,yy,xx);parent='thorax_4'
    for i in range(5):
        length=lengths[i+1]-lengths[i];sel=np.clip((arc-lengths[i]+.25*length+1)/2,0,1)*np.clip((lengths[i+1]+3-arc+1)/2,0,1)*roi
        n='tail_tip' if i==4 else f'tail_{i+1:02d}';add(n,sel,TAIL[i],parent,48-i,'tail',TAIL[i+1],radius=7,probe=2);parent=n
    by={p['name']:p for p in records};fy,fx=np.mgrid[:640,:640];adjust=[]
    for p in records:
        if p['parent'] is None:continue
        ca=np.array(masks[p['name']].getchannel('A'))>128;pa=np.array(masks[p['parent']].getchannel('A'))>128
        dist=ndimage.distance_transform_edt(ca|pa);x,y=p['pivot'];common=ca&pa&(dist>3)&(np.hypot(fx+.5-x,fy+.5-y)<24)
        if common.any():
            py,px=np.nonzero(common);i=np.argmin((px+.5-x)**2+(py+.5-y)**2);pt=[float(px[i]+.5),float(py[i]+.5)]
            if np.linalg.norm(np.array(pt)-p['pivot'])>1:adjust.append(dict(part=p['name'],before=p['pivot'],after=pt))
            p['pivot']=pt
            if 'end' in by[p['parent']]:by[p['parent']]['end']=pt
    finished={};under=[]
    def finish(n):
        if n in finished:return finished[n]
        p=by[n];image=masks[n]
        if p['parent'] is None:finished[n]=image;return image
        parent=finish(p['parent']);pr=np.array(parent);covered=ndimage.binary_erosion(pr[...,3]>250,iterations=1)
        point=np.array(p['pivot']);direction=np.array(by[p['parent']]['pivot'])-point;direction/=max(np.linalg.norm(direction),.001)
        span=np.linalg.norm(np.array(p.get('end',point+[0,60]))-point);depth=span*(.25 if p['group']!='limb' else .20);vector=direction*depth
        along=np.clip(((fx+.5-point[0])*vector[0]+(fy+.5-point[1])*vector[1])/max(vector@vector,.001),0,1)
        distance=np.hypot(fx+.5-point[0]-along*vector[0],fy+.5-point[1]-along*vector[1]);mask=np.clip((p['jointRadiusPx']-distance)/1.2,0,1)*covered
        pr[...,3]=np.uint8(mask*255);pr[pr[...,3]==0]=0;result=Image.fromarray(pr,'RGBA');result.alpha_composite(image)
        added=(np.array(result.getchannel('A'))>128)&(np.array(image.getchannel('A'))<=128);assert np.all(~added|covered)
        under.append(dict(part=n,addedOpaquePixels=int(added.sum()),outsideParentPixels=0,tongueDepthPx=round(depth,3)))
        finished[n]=result;return result
    for p in records:
        im=finish(p['name']);x0,y0,x1,y1=im.getbbox();box=[x0-PAD,y0-PAD,x1+PAD,y1+PAD];assert min(box[:2])>=0 and max(box[2:])<=640
        base,glow=split_emission(im.crop(box));base.save(HERE/p['file']);glow.save(HERE/p['glow']);p['offset']=box[:2];p['hasEmission']=bool(glow.getbbox())
    manifest=dict(size=[640,640],centerX=320,lengthPx=480,light='top',paddingPx=6,root='thorax_2',parts=records,neutralGlow=False,colour='blue',gamePreviewLengthPx=45,referenceTransform=mapping.tolist(),visibleSource='../skitter-redesign/candidate.png: approved source pixels',description='Approved compact Skitter: broad blue plates, eight three-section hooked legs, five short tail links.',tailSegmentCount=5,hiddenUnderlaps=under,pivotAdjustments=adjust,mirror=dict(suffix='_r',centerX=320,rule='Reflect right geometry and negate local rotation.'),glowBlend='additive RGB weighted by alpha',lightingNote='Approved source highlights retained; symmetric mirrored legs use the same top-lit material.')
    (HERE/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
    print('Built',len(records),'parts with matching emission; 8 mirrored legs, 5 tail links',flush=True)

def render():
    render_species('skitter')
    p=Puppet(HERE);source=Image.open(HERE/'source-colour-frame.png');comparison=Image.new('RGBA',(1280,704),GROUND);comparison.alpha_composite(source,(0,32));comparison.alpha_composite(p.render(),(640,32));d=ImageDraw.Draw(comparison)
    d.text((20,8),'APPROVED COMPACT CANDIDATE',font=font(18),fill='white');d.text((660,8),'PRODUCTION PUPPET · SOURCE PIXELS',font=font(18),fill='white');d.text((20,676),'Right-side limbs mirrored; source material, proportions and colours retained.',font=font(14),fill='white');comparison.convert('RGB').save(HERE/'comparison.png')
    p.render().resize((60,60),Image.Resampling.LANCZOS).save(HERE/'game-scale.png')
