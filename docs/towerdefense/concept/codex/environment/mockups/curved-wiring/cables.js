const cableTexture = await loadImg('/td-cable-texture.png');
function drawRichCables(g,t){
 const socketFor=[5,6,1,4,2,3];
 const routes=[[[34,90],[24,84],[15,72],[17,61]],
 [[43,79],[43,72],[44,62],[45,55],[45,51]],
 [[57,79],[60,72],[64,63],[69,53],[72,42],[69,30],[66,24]],
 [[40,97],[38,92],[42,83],[45,75],[42.5,63],[43,54],[43,46],[42,41]],
 [[66,90],[77,86],[88,77],[94,68]],
 [[62,98],[64,94],[64,85],[60,78],[59.5,72],[62.5,63],[67.5,54]]];
 const laneCurves=layoutJson.lanes.map(l=>Array.from({length:101},(_,i)=>bez(l.controls,i/100)));
 const laneDistance=p=>{
  let best=Infinity;
  for(const c of laneCurves)for(let i=1;i<c.length;i++){
   const a=c[i-1],b=c[i],dx=b[0]-a[0],dy=b[1]-a[1],u=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(dx*dx+dy*dy)));
   best=Math.min(best,Math.hypot(p[0]-a[0]-u*dx,p[1]-a[1]-u*dy));
  }return best;
 };
 const report=[];
 for(let id=0;id<6;id++){
  const P=towers[[0,1,2,0,1,2][id]],pad=layoutJson.pads[id],op=layoutJson.outpost;
  const oa=outpost.m.anchors['cable_'+socketFor[id]].position,ta=P.m.anchors.cable.position;
  const start=oa.map((v,i)=>op.position[i]+(v-260)*op.footprintRadius*2/440);
  const end=ta.map((v,i)=>pad.position[i]+(v-112)*pad.footprintRadius*2/136);
  const control=[start,...routes[id],end],extended=[control[0],...control,control.at(-1)],points=[];
  for(let i=1;i<extended.length-2;i++){
   const [a,b,c,d]=extended.slice(i-1,i+3);
   for(let j=0;j<70;j++){
    const u=j/70;
    points.push(b.map((_,n)=>.5*((2*b[n])+(-a[n]+c[n])*u+(2*a[n]-5*b[n]+4*c[n]-d[n])*u*u+(-a[n]+3*b[n]-3*c[n]+d[n])*u*u*u)));
   }
  }points.push(end);
  const visible=points.map(p=>laneDistance(p)>7.7||Math.hypot(p[0]-50,p[1]-90)<12.5);
  // Real conduit texture, bent along an arc-length UV. Short floor crossings are buried.
  let arc=0,buried=0,total=0,transitions=[];
  g.save();g.lineCap='round';g.lineJoin='round';
  // Draw the contact shadows before the entire hose; per-segment shadows would
  // repeatedly darken the already-painted texture at neighbouring joints.
  for(let i=1;i<points.length;i++){
   if(!visible[i]||!visible[i-1])continue;
   const a=points[i-1],b=points[i],x=X(a[0]),y=Y(a[1]),angle=Math.atan2(b[1]-a[1],b[0]-a[0]);
   // Soft contact shadow and a narrow braided return hose next to the armoured feed.
   g.strokeStyle='rgba(0,0,0,.42)';g.lineWidth=1.35*k;g.beginPath();g.moveTo(x+1,y+2);g.lineTo(X(b[0])+1,Y(b[1])+2);g.stroke();
   const nx=-Math.sin(angle),ny=Math.cos(angle),offset=.61*k;
   g.strokeStyle='#17191a';g.lineWidth=.32*k;g.beginPath();g.moveTo(x+nx*offset,y+ny*offset);g.lineTo(X(b[0])+nx*offset,Y(b[1])+ny*offset);g.stroke();
   g.strokeStyle='#706963';g.lineWidth=.075*k;g.beginPath();g.moveTo(x+nx*offset-.5,y+ny*offset-.5);g.lineTo(X(b[0])+nx*offset-.5,Y(b[1])+ny*offset-.5);g.stroke();
  }
  for(let i=1;i<points.length;i++){
   const a=points[i-1],b=points[i],len=Math.hypot(b[0]-a[0],b[1]-a[1]);total+=len;
   if(visible[i]!==visible[i-1])transitions.push(points[i]);
   if(!visible[i]||!visible[i-1]){arc+=len;buried+=len;continue;}
   const x=X(a[0]),y=Y(a[1]),angle=Math.atan2(b[1]-a[1],b[0]-a[0]);
   const width=.83*k,scale=width/cableTexture.height,period=cableTexture.width*scale/k;
   const sx=(arc%period)*k/scale,sw=Math.max(.3,len*k/scale);
   g.save();g.translate(x,y);g.rotate(angle);
   if(sx+sw<=cableTexture.width)g.drawImage(cableTexture,sx,0,sw,cableTexture.height,-.25,-width/2,len*k+.5,width);
   else g.drawImage(cableTexture,Math.max(0,cableTexture.width-sw),0,Math.min(sw,cableTexture.width),cableTexture.height,-.25,-width/2,len*k+.5,width);
   g.restore();arc+=len;
  }
  // Small flush access covers at transitions, never a raised barricade across a lane.
  for(const p of transitions){
   const x=X(p[0]),y=Y(p[1]);g.fillStyle='#302f2a';g.strokeStyle='#776858';g.lineWidth=.6;
   g.beginPath();g.roundRect(x-5,y-4,10,8,1.5);g.fill();g.stroke();
   g.fillStyle='#a08b68';for(const dx of [-3,3])for(const dy of [-2,2])g.fillRect(x+dx-.5,y+dy-.5,1,1);
  }
  g.restore();report.push({tower:id,outpostSocket:'cable_'+socketFor[id],towerSocket:'cable',start,end,waypoints:routes[id],totalLength:total,buriedLength:buried});
 }
 window.__cableReport=report;
}
