"""Export selected A without repainting: technical masks, emission extraction, transforms.
Run from any directory. Generated production files and previews use committed approved masters.
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageChops
import numpy as np
import json,hashlib,subprocess,math,os
from functools import lru_cache
OUT=Path(__file__).resolve().parent
ROOT=OUT.parents[4]
KIT=ROOT/'public/td/towers';DEST=KIT/'flamer';SOURCE=OUT/'source'
BASELINE='44514c3'
REVIEW=Path(os.environ.get('TD_ART_REVIEW_OUT','/tmp/wattcade-td-art/flamer'));REVIEW.mkdir(parents=True,exist_ok=True)
BG=(33,29,25,255)
FONT=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',15)
MUZZLES={'1':[112,64],'3':[112,51],'5':[112,44]}
NOZZLE_BOUNDS={1:(104,59,121,89),3:(106,45,119,65),5:(105,37,121,65)}
def write(path,value):path.write_text(json.dumps(value,indent=2)+'\n')
def blank():return Image.new('RGBA',(224,224))
def emission(frame,level,nozzle=False):
 a=np.asarray(frame).astype(float);y,x=np.indices(a.shape[:2]);mx,my=MUZZLES[str(level)]
 region=(abs(x-mx)<=5)&(abs(y-my)<=5)
 if not nozzle and level>=3:region|=(abs(x-112)<=4)&(abs(y-(110 if level==3 else 105))<=7)
 # Only orange-red pixels inside the existing pilot/tip windows emit; brass/steel stay dark.
 hot=(a[:,:,0]>150)&(a[:,:,0]>a[:,:,1]*1.22)&(a[:,:,1]>a[:,:,2]*1.5)
 hot|=(abs(x-mx)<=2)&(abs(y-my)<=2)&(a[:,:,0]>180)&(a[:,:,1]>70)
 region&=hot
 a[:,:,3]*=region;a[a[:,:,3]==0,:3]=0
 return Image.fromarray(a.astype('uint8'))
def export_part(name,frame,level,nozzle=False):
 box=frame.getbbox();assert box
 box=(box[0]-4,box[1]-4,box[2]+4,box[3]+4)
 image=frame.crop(box);glow=emission(frame,level,nozzle).crop(box)
 image.save(DEST/'parts'/f'{name}.png',optimize=True);glow.save(DEST/'parts'/f'{name}_glow.png',optimize=True)
 return {'name':name,'file':f'parts/{name}.png','glow':f'parts/{name}_glow.png','offset':list(box[:2]),'pivot':[112,112]}
def effects():
 source=Image.open(SOURCE/'A-l1.png').convert('RGBA');tip=emission(source,1,True);box=tip.getbbox();anchor=(112-box[0],64-box[1]);tip=tip.crop(box)
 for state,scales,strengths in [('passive',[(1,1),(1.1,1.2),(1,1.1),(.9,1)], [.40,.65,.50,.35]),('attack',[(1.1,1.1),(1.5,1.6),(1.3,1.4),(1,1.1)],[.65,1,.85,.45])]:
  strip=Image.new('RGBA',(96,24))
  for index,((sx,sy),strength) in enumerate(zip(scales,strengths)):
   # Four small alpha/scale poses of approved hot-tip pixels, not new painted flames.
   tile=Image.new('RGBA',(24,24));size=(max(1,round(tip.width*sx)),max(1,round(tip.height*sy)));art=tip.resize(size,Image.Resampling.LANCZOS)
   a=np.asarray(art).copy();a[:,:,3]=(a[:,:,3].astype(float)*strength).astype('uint8');a[a[:,:,3]==0,:3]=0;art=Image.fromarray(a)
   tile.alpha_composite(art,(12-round(anchor[0]*sx),14-round(anchor[1]*sy)));strip.alpha_composite(tile,(index*24,0))
  strip.save(DEST/'effects'/f'{state}.png',optimize=True)
def build():
 (DEST/'parts').mkdir(parents=True,exist_ok=True);(DEST/'effects').mkdir(exist_ok=True)
 mortar=json.loads(subprocess.check_output(['git','show',f'{BASELINE}:public/td/towers/mortar/manifest.json'],cwd=ROOT));manifest={k:v for k,v in mortar.items() if k not in ['parts','anchors','upgrades']}
 manifest['upgrades']='Cumulative L1 head + L3 shield/supplies + L5 reinforced casing/gauges; retain all unlocked parts.'
 manifest['anchors']={'muzzle':{'parent':'nozzle','position':MUZZLES['1'],'positionsByLevel':MUZZLES},'cable':mortar['anchors']['cable'],'range_center':mortar['anchors']['range_center']}
 parts=[]
 for name in ['pad','base','upgrade_l2','upgrade_l4']:
  p=next(x.copy() for x in mortar['parts'] if x['name']==name)
  if name!='pad':
   p['file']='../mortar/'+p['file'];p['glow']='../mortar/'+p['glow']
  parts.append(p)
 for level in [1,3,5]:
  src=Image.open(SOURCE/f'A-l{level}.png').convert('RGBA');mask=Image.new('L',(224,224));ImageDraw.Draw(mask).rectangle(NOZZLE_BOUNDS[level],fill=255)
  nozzle=src.copy();nozzle.putalpha(ImageChops.multiply(src.getchannel('A'),mask))
  body=src.copy();body.putalpha(ImageChops.subtract(src.getchannel('A'),nozzle.getchannel('A')))
  name='head' if level==1 else f'upgrade_l{level}'
  p=export_part(name,body,level);p.update(parent='base' if level==1 else 'head',z={1:40,3:45,5:55}[level],minLevel=level)
  if level==1:p.update(aims=True,mountPosition=[112,112])
  parts.append(p)
  name='nozzle' if level==1 else f'nozzle_l{level}'
  p=export_part(name,nozzle,level,True);p.update(parent='head' if level==1 else 'nozzle',z={1:42,3:50,5:60}[level],minLevel=level)
  if level==1:p['recoil']={'axis':[0,1],'distancePx':2.5}
  parts.append(p)
 manifest['parts']=sorted(parts,key=lambda p:p['z'])
 animations={}
 for state in ['passive','attack']:
  animations[state]={'durationMs':1600 if state=='passive' else 640,'loop':state=='passive','frameDurationMs':400 if state=='passive' else 160,
   'glowGain':[[0,.75],[800,1.1],[1600,.75]] if state=='passive' else [[0,.85],[160,1.2],[320,1],[640,.75]],
   'glowStrength':[[0,.15],[800,.4],[1600,.15]] if state=='passive' else [[0,.25],[160,.65],[320,.45],[640,.15]],
   'effectOpacity':[[0,.3],[800,.55],[1600,.3]] if state=='passive' else [[0,.5],[160,1],[320,.8],[640,.3]],
   'effect':{'file':f'effects/{state}.png','frames':4,'frameSize':[24,24],'offset':[100,50],'offsetsByLevel':{k:[v[0]-12,v[1]-14] for k,v in MUZZLES.items()},'parent':'nozzle','blend':'additive'}}
 manifest['animations']=animations;write(DEST/'manifest.json',manifest);effects()
 index=json.loads((KIT/'manifest.json').read_text());index['towers']['flamer']='flamer/manifest.json';write(KIT/'manifest.json',index)

def tier(mapping,level,fallback):
 keys=[int(k) for k in mapping if int(k)<=level];return mapping[str(max(keys))] if keys else fallback

def curve(keys,t):
 for i in range(1,len(keys)):
  a,b=keys[i-1],keys[i]
  if t<=b[0]:return a[1]+(b[1]-a[1])*(t-a[0])/(b[0]-a[0])
 return keys[-1][1]
def transforms(m,p,angle,recoil):
 shift=[0,0];aim=False
 while p:
  aim|=p.get('aims',False)
  if p.get('recoil'):
   axis=p['recoil'].get('axis',[0,1]);shift=[shift[i]+axis[i]*p['recoil']['distancePx']*recoil for i in range(2)]
  p=next((q for q in m['parts'] if q['name']==p['parent']),None)
 return aim,shift

def posed_layer(im,offset,m,p,angle,recoil):
 layer=blank();aim,shift=transforms(m,p,angle,recoil);layer.alpha_composite(im,(round(offset[0]+shift[0]),round(offset[1]+shift[1])))
 if aim:layer=layer.rotate(-angle,Image.Resampling.BICUBIC,center=(112,112))
 return layer

def add(im,light,strength):
 a=np.asarray(im).copy();b=np.asarray(light).astype(float);a[:,:,:3]=np.clip(a[:,:,:3]+b[:,:,:3]*b[:,:,3:4]/255*strength,0,255).astype('uint8');a[:,:,3]=np.maximum(a[:,:,3],(b[:,:,3]*strength).clip(0,255).astype('uint8'));return Image.fromarray(a)

@lru_cache(maxsize=None)
def manifest(kind):return json.loads((KIT/kind/'manifest.json').read_text())
@lru_cache(maxsize=None)
def png(path):return Image.open(path).convert('RGBA')

def render(kind,level,angle=0,state='passive',ms=800,recoil=None,with_glow=True):
 root=KIT/kind;m=manifest(kind);im=blank();animation=m.get('animations',{}).get(state)
 if recoil is None:recoil=max(0,1-ms/300) if state=='attack' else 0
 for p in sorted(m['parts'],key=lambda p:p['z']):
  if p.get('minLevel',1)>level:continue
  layer=posed_layer(png(root/p['file']),p['offset'],m,p,angle,recoil);im.alpha_composite(layer)
  if with_glow and p.get('glow'):
   light=posed_layer(png(root/p['glow']),p['offset'],m,p,angle,recoil)
   strength=min(.6,.4*curve(animation['glowGain'],ms)*curve(animation['glowStrength'],ms)) if animation else .4
   im=add(im,light,strength)
 if animation and with_glow:
  e=animation['effect'];frame=int(ms/animation['frameDurationMs'])%e['frames'];w,h=e['frameSize'];strip=png(root/e['file']);art=strip.crop((frame*w,0,(frame+1)*w,h))
  off=tier(e.get('offsetsByLevel',{}),level,e['offset']);parent=next(p for p in m['parts'] if p['name']==e['parent']);light=posed_layer(art,off,m,parent,angle,recoil);im=add(im,light,curve(animation['effectOpacity'],ms))
 return im

def previews():
 preview=Image.new('RGBA',(2096,1095),BG);d=ImageDraw.Draw(preview);d.text((20,12),'TESLA / PRISM / APPROVED A FLAMETHROWER — manifest-rendered production parts',font=FONT,fill='#eadac0')
 for row,kind in enumerate(['tesla','prism','flamer']):
  y=45+row*345;d.text((8,y+100),kind.upper(),font=FONT,fill='#cdbb9d')
  for group,level in enumerate([1,3,5]):
   for pose in range(3):
    angle=[0,45,180][pose] if kind in ['mortar','flamer'] else 0;state='attack' if pose==2 else 'passive';ms=160 if state=='attack' else (800 if pose else 0)
    x=100+(group*3+pose)*220;d.text((x+24,y),f'L{level} {angle}° / {state.upper()}',font=FONT,fill='#bfae92');obj=render(kind,level,angle,state,ms);preview.alpha_composite(obj,(x,y+24));preview.alpha_composite(obj.resize((112,112),Image.Resampling.LANCZOS),(x+56,y+220))
 preview.convert('RGB').quantize(colors=256,method=Image.Quantize.MEDIANCUT).save(KIT/'preview.png',optimize=True)
 proof=Image.new('RGBA',(1540,1080),BG);d=ImageDraw.Draw(proof);d.text((20,12),'APPROVED A / PRODUCTION — passive + attack, 224px frame + 68px pad',font=FONT,fill='#eadac0')
 for row,level in enumerate([1,3,5]):
  y=45+row*340
  for col,(state,angle) in enumerate([(s,a) for s in ['passive','attack'] for a in [0,45,180]]):
   x=60+col*240;d.text((x+25,y),f'L{level} {angle}° / {state}',font=FONT,fill='#cabb9e');obj=render('flamer',level,angle,state,160 if state=='attack' else 800);proof.alpha_composite(obj,(x,y+23));proof.alpha_composite(obj.resize((112,112),Image.Resampling.LANCZOS),(x+56,y+218))
 proof.convert('RGB').save(REVIEW/'production-proof.png',optimize=True)
 frames=[]
 for index in range(12):
  frame=Image.new('RGBA',(672,224),BG)
  for col,level in enumerate([1,3,5]):frame.alpha_composite(render('flamer',level,45,'attack',index*50),(col*224,0))
  frames.append(frame.convert('RGB').quantize(colors=128))
 frames[0].save(REVIEW/'attack.gif',save_all=True,append_images=frames[1:],duration=50,loop=0,optimize=True)

def inventories():
 files=sorted(str(p.relative_to(KIT)) for p in KIT.rglob('*') if p.is_file() and p.name!='SHA256SUMS.txt');(KIT/'FILES.txt').write_text('\n'.join(sorted(set(files+['SHA256SUMS.txt'])))+'\n')
 files=sorted(p for p in KIT.rglob('*') if p.is_file() and p.name!='SHA256SUMS.txt');(KIT/'SHA256SUMS.txt').write_text(''.join(hashlib.sha256(p.read_bytes()).hexdigest()+'  '+str(p.relative_to(KIT))+'\n' for p in files))

def validate():
 report={'baseline':BASELINE,'approved_source':'flamer-production-1/source/A-l{1,3,5}.png','muzzles':MUZZLES,'recoilPx':2.5,'new_art':'none: approved pixels split and emission transformed','poses':0,'animationSamples':0}
 protected=[p for p in KIT.rglob('*') if p.is_file() and (str(p.relative_to(KIT)).split('/')[0] in ['tesla','mortar','prism','parts'])]
 for p in protected:
  original=subprocess.check_output(['git','show',f'{BASELINE}:{p.relative_to(ROOT)}'],cwd=ROOT);assert original==p.read_bytes(),p
 report['unchangedSiblingAndPadFiles']=len(protected)
 m=json.loads((DEST/'manifest.json').read_text())
 for p in m['parts']:
  if not p['file'].startswith('parts/'):continue
  art=Image.open(DEST/p['file']).convert('RGBA');glow=Image.open(DEST/p['glow']).convert('RGBA');assert art.size==glow.size
  assert np.all(np.asarray(glow)[:,:,3]<=np.asarray(art)[:,:,3])
  for im in [art,glow]:
   b=im.getbbox()
   if b:assert b[0]>=4 and b[1]>=4 and b[2]<=im.width-4 and b[3]<=im.height-4,(p['name'],b,im.size)
 for a in m['animations'].values():
  e=a['effect'];strip=Image.open(DEST/e['file']);w,h=e['frameSize'];assert strip.size==(w*4,h)
  for i in range(4):
   box=strip.crop((i*w,0,(i+1)*w,h)).getbbox();assert box and box[0]>=4 and box[1]>=4 and box[2]<=w-4 and box[3]<=h-4,box
 for level in [1,2,3,4,5]:
  for angle in range(0,360,5):
   for recoil in [0,.5,1]:
    im=render('flamer',level,angle,'attack',160,recoil,with_glow=False);b=im.getbbox();assert b and min(b[:2])>=4 and max(b[2:])<=220,(level,angle,b)
    # Emission PNG alpha is a subset of its padded body; effect-frame corners
    # conservatively bound every nonzero strip pixel under the same parent motion.
    mx,my=MUZZLES[str(max(k for k in [1,3,5] if k<=level))];a=math.radians(angle)
    for x,y in [(mx-12,my-14),(mx+12,my-14),(mx+12,my+10),(mx-12,my+10)]:
     dx,dy=x-112,y+2.5*recoil-112;px=112+dx*math.cos(a)-dy*math.sin(a);py=112+dx*math.sin(a)+dy*math.cos(a);assert 4<=px<=220 and 4<=py<=220
    report['poses']+=1
  for ms in range(0,1600,40):
   render('flamer',level,45,'passive',ms);report['animationSamples']+=1
 report['decodedFiles']=len(list(DEST.rglob('*.png')))
 report['flamerBytes']=sum(p.stat().st_size for p in DEST.rglob('*') if p.is_file());report['totalKitBytes']=sum(p.stat().st_size for p in KIT.rglob('*') if p.is_file())
 assert report['flamerBytes']<200000;assert report['totalKitBytes']<1500000
 report['passed']=True;write(OUT/'validation.json',report);print(json.dumps(report,indent=2))
if __name__=='__main__':build();previews();inventories();validate()
