"""Level-ground tactical layout; corner clearances and coverage measured in field units."""
import json
from pathlib import Path
import numpy as np
from PIL import Image,ImageDraw
ROOT=Path(__file__).resolve().parent
lanes=[dict(id=0,waypoints=[[-3,15],[18,15],[18,72],[34,72],[34,80],[50,90]]),
       dict(id=1,waypoints=[[50,-3],[50,90]]),
       dict(id=2,waypoints=[[103,15],[82,15],[82,72],[66,72],[66,80],[50,90]])]
pos=[[5,28],[31,59],[64,20],[36,47],[95,28],[69,59]]
pads=[dict(id=i,lane=i//2,near=bool(i%2),position=p,footprintRadius=4.2) for i,p in enumerate(pos)]
def dist(p,c):
 a=np.array(c[:-1],float);d=np.diff(c,axis=0);p=np.array(p)
 t=np.clip(((p-a)*d).sum(1)/(d*d).sum(1),0,1)
 return np.linalg.norm(p-a-t[:,None]*d,axis=1).min()
def sample(c):
 c=np.array(c,float);d=np.diff(c,axis=0);lens=np.linalg.norm(d,axis=1);s=np.r_[0,lens.cumsum()];t=np.linspace(0,s[-1],round(s[-1]*20)+1)
 i=np.minimum(np.searchsorted(s,t,side='right')-1,len(d)-1);u=(t-s[i])/lens[i]
 return c[i]+d[i]*u[:,None],s[-1]
for l in lanes:l.update(floorWidth=13,bankWidth=1.25)
metrics=[]
for p in pads:
 distances=[float(dist(p['position'],l['waypoints'])) for l in lanes]
 assert min(distances)>=12.95 and 13<=distances[p['lane']]<=16
 assert np.linalg.norm(np.array(p['position'])-[50,90])>=17
 assert all(np.linalg.norm(np.array(p['position'])-q['position'])>=10 for q in pads if q['id']!=p['id'])
 m={'id':p['id'],'laneDistances':distances,'coverageAtBaseRanges':{}}
 for kind,r in [('tesla',24),('mortar',36),('lens',44)]:
  v=[]
  for l in lanes:
   pts,total=sample(l['waypoints']);v.append(round(float((np.linalg.norm(pts-p['position'],axis=1)<=r).mean()*total),2))
  m['coverageAtBaseRanges'][kind]=v
 metrics.append(m)
data=dict(size=[1536,1024],field=dict(x=318,y=32,size=900,units=100),lanes=lanes,pads=pads,outpost=dict(position=[50,90],footprintRadius=11),
 integration='Tactical direction mockup only. Waypoints replace cubic controls; movement should round turns inside the wide corridor and interpolate heading. No sim code changed.')
(ROOT/'map-layout.json').write_text(json.dumps(data,indent=2)+'\n')
(ROOT/'placement-check.json').write_text(json.dumps({'padClearance':metrics,'laneLengths':[round(sample(l['waypoints'])[1],2) for l in lanes],'coverageMethod':'uniform arc-length sampling at0.05unit; base ranges from sim/defs.ts; not a balance simulation'},indent=2)+'\n')
g=Image.new('RGB',(1536,1024),(49,49,51));d=ImageDraw.Draw(g)
def px(p):return (318+9*p[0],32+9*p[1])
for width,col in [(15.5,(80,76,68)),(13,(110,80,58))]:
 for l in lanes:
  c=np.array(l['waypoints'],float);c=np.vstack([c[0]+(c[0]-c[1])*5,c]);ps=[px(p) for p in c]
  d.line(ps,fill=col,width=round(width*9),joint='curve')
  for x,y in ps:
   r=width*9/2;d.ellipse((x-r,y-r,x+r,y+r),fill=col)
x,y=px([50,90]);r=99;d.ellipse((x-r,y-r,x+r,y+r),fill=(110,80,58))
g.save(ROOT/'path-guide.png')
print(json.dumps({'laneLengths':[round(sample(l['waypoints'])[1],2) for l in lanes],'minPadToAnyLane':min(min(m['laneDistances']) for m in metrics),'pads':pos}))
