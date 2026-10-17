"""Round-one review compositions, using original asset pixels and generated head concepts."""
from PIL import Image, ImageDraw, ImageFont, ImageChops
from pathlib import Path
import json
ROOT=Path(__file__).resolve().parents[5]
OUT=Path(__file__).resolve().parent
BG=(33,29,25,255)
FONT=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',19)
SMALL=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',15)
def tower(kind,level,headless=False):
 root=ROOT/'public/td/towers'/kind;m=json.loads((root/'manifest.json').read_text());im=Image.new('RGBA',(224,224))
 for p in sorted(m['parts'],key=lambda x:x['z']):
  if p['minLevel']>level or (headless and (p['name'] in ['head','barrel','upgrade_l3','upgrade_l5'])):continue
  im.alpha_composite(Image.open(root/p['file']).convert('RGBA'),tuple(p['offset']))
 return im

def outpost(weapon=None,angle=0):
 root=ROOT/'public/td/outpost';m=json.loads((root/'manifest.json').read_text());im=Image.new('RGBA',(520,520))
 mask_applied=False
 for p in sorted(m['parts'],key=lambda x:x['z']):
  if p['z']>=44 and not mask_applied:
   mask=Image.open(root/'masks/cab_window.png').convert('RGBA').getchannel('A')
   im.putalpha(ImageChops.subtract(im.getchannel('A'),mask));mask_applied=True
  if p.get('weapon') and p.get('weapon')!=weapon:continue
  if p.get('damageStage') or p.get('minCharge') or p.get('emissiveOnly'):continue
  layer=Image.new('RGBA',im.size);layer.alpha_composite(Image.open(root/p['file']).convert('RGBA'),tuple(p['offset']))
  if p.get('weapon'):layer=layer.rotate(-angle,resample=Image.Resampling.BICUBIC,center=(260,260))
  im.alpha_composite(layer)
 return im

def refs():
 im=Image.new('RGBA',(1792,1344),BG);d=ImageDraw.Draw(im)
 for row,level in enumerate([1,3,5]):
  for col,kind in enumerate(['tesla','mortar','prism','flamer']):
   obj=tower('mortar' if kind=='flamer' else kind,level,headless=kind=='flamer')
   im.alpha_composite(obj.resize((448,448),Image.Resampling.NEAREST),(col*448,row*448))
   d.text((col*448+12,row*448+12),f'{kind.upper()} L{level}'+(' ADD HEAD HERE' if kind=='flamer' else ''),font=SMALL,fill='#e6d8bd')
 im.save(OUT/'reference-tower.png')
 im=Image.new('RGBA',(1560,1040),BG);d=ImageDraw.Draw(im)
 for i,weapon in enumerate(['gatling','flamer','rail']):
  im.alpha_composite(outpost(weapon),(i*520,0));d.text((i*520+20,15),weapon.upper()+' EXISTING',font=FONT,fill='#e6d8bd')
 im.alpha_composite(outpost(None),(520,520));d.text((540,535),'ADD FIREBALL HEAD HERE',font=FONT,fill='#e6d8bd')
 im.save(OUT/'reference-turret.png')
if __name__=='__main__':refs()

def extract_concepts():
 src=Image.open(OUT/'generated-tower-refined.png').convert('RGBA').resize((1792,1344),Image.Resampling.LANCZOS)
 # Tight hand-selected masks extract generated machinery; the surrounding pad/base
 # is restored from the original production PNGs in every comparison cell.
 bounds=[[(74,52),(149,52),(145,66),(150,77),(155,89),(155,98),(160,102),(160,121),(153,132),(138,136),(125,133),(121,143),(99,143),(96,133),(82,136),(70,130),(64,117),(64,102),(69,98),(69,83),(77,77),(81,68)],
 [(72,37),(151,37),(152,48),(147,66),(151,79),(155,89),(155,98),(160,102),(160,121),(152,132),(138,136),(124,133),(122,144),(98,144),(96,133),(82,136),(70,130),(64,117),(64,102),(69,98),(69,83),(76,76),(76,66)],
 [(71,37),(152,37),(153,47),(149,67),(158,72),(162,86),(159,98),(164,107),(164,125),(153,138),(137,143),(124,138),(122,149),(98,149),(96,138),(82,143),(68,134),(62,120),(64,104),(65,88),(63,77),(74,69),(75,62)]]
 for row,level in enumerate([1,3,5]):
  part=src.crop((1344,row*448,1792,(row+1)*448)).resize((224,224),Image.Resampling.LANCZOS)
  mask=Image.new('L',(224,224));ImageDraw.Draw(mask).polygon(bounds[row],fill=255)
  part.putalpha(mask);clean=Image.new('RGBA',part.size);clean.alpha_composite(part);clean.save(OUT/f'concept-tower-head-l{level}.png',optimize=True)
  tower('mortar',level,True).save(OUT/f'real-chassis-l{level}.png')
 src=Image.open(OUT/'generated-turret.png').convert('RGBA').resize((1560,1040),Image.Resampling.LANCZOS).crop((520,520,1040,1040))
 mask=Image.new('L',(520,520));ImageDraw.Draw(mask).polygon([(260,111),(281,117),(294,132),(300,152),(298,174),(292,190),(304,215),(313,240),(308,261),(295,280),(289,291),(273,302),(245,302),(229,290),(222,277),(206,261),(204,239),(214,210),(224,189),(222,174),(219,154),(222,136),(239,118)],fill=255)
 src.putalpha(mask);clean=Image.new('RGBA',src.size);clean.alpha_composite(src);clean.save(OUT/'concept-fireball-head.png',optimize=True)

def concept_tower(level,angle=0):
 base=tower('mortar',level,True)
 head=Image.open(OUT/f'concept-tower-head-l{level}.png')
 base.alpha_composite(head.rotate(-angle,resample=Image.Resampling.BICUBIC,center=(112,112)))
 return base

def final_sheets():
 # Same level/state matrix and 224/68 footprint pairing as production preview.
 width,height=2096,1440
 im=Image.new('RGBA',(width,height),BG);d=ImageDraw.Draw(im)
 d.text((28,15),'ROUND 1 / FLAMETHROWER — real pad + Mortar chassis, generated concept heads',font=FONT,fill='#ecdfc8')
 for row,kind in enumerate(['tesla','mortar','prism','flamer']):
  y=70+row*340;d.text((12,y+105),kind.upper(),font=SMALL,fill='#ecdfc8')
  for group,level in enumerate([1,3,5]):
   for pose,angle in enumerate([0,45,180]):
    x=100+(group*3+pose)*220
    obj=concept_tower(level,angle) if kind=='flamer' else tower(kind,level)
    # Fixed Tesla/Prism references intentionally repeat; Mortar uses real aiming.
    if kind=='mortar' and angle:
     root=ROOT/'public/td/towers/mortar';m=json.loads((root/'manifest.json').read_text());obj=tower(kind,level,True)
     for p in sorted(m['parts'],key=lambda p:p['z']):
      if p['minLevel']<=level and p['name'] in ['head','barrel','upgrade_l3','upgrade_l5']:
       layer=Image.new('RGBA',(224,224));layer.alpha_composite(Image.open(root/p['file']),tuple(p['offset']));obj.alpha_composite(layer.rotate(-angle,resample=Image.Resampling.BICUBIC,center=(112,112)))
    state=f'{angle}°' if kind in ['mortar','flamer'] else 'REST'
    d.text((x+55,y),f'L{level} / {state}',font=SMALL,fill='#c5b99f')
    im.alpha_composite(obj,(x,y+25))
    # Pad is 136 px in the 224 frame; 0.5 scale gives exact 68 px pad.
    im.alpha_composite(obj.resize((112,112),Image.Resampling.LANCZOS),(x+56,y+224))
 im.convert('RGB').save(OUT/'concept-tower.png',optimize=True)
 im=Image.new('RGBA',(1000,1160),BG);d=ImageDraw.Draw(im)
 d.text((26,22),'ROUND 1 / FIREBALL LAUNCHER',font=FONT,fill='#ecdfc8')
 d.text((26,52),'Real deck / original sibling heads / exact 220px deck at game scale',font=SMALL,fill='#b8ad96')
 for row,weapon in enumerate(['gatling','fireball','rail']):
  for col,angle in enumerate([0,-60,60]):
   x=25+325*col;y=95+350*row
   d.line((x,y,x+300,y),fill='#534836');d.text((x+2,y+14),f'{weapon.upper()} / {angle:+}°',font=SMALL,fill='#cabb9e')
   if weapon=='fireball':
    obj=outpost(None);obj.alpha_composite(Image.open(OUT/'concept-fireball-head.png').rotate(-angle,resample=Image.Resampling.BICUBIC,center=(260,260)))
   else:obj=outpost(weapon,angle)
   im.alpha_composite(obj.resize((260,260),Image.Resampling.LANCZOS),(x+20,y+55))
 im.convert('RGB').save(OUT/'concept-turret.png',optimize=True)

if __name__=='__main__':
 extract_concepts();final_sheets()
