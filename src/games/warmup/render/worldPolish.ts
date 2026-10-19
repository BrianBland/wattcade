// Large, composed scenery. Coordinates are low-resolution world pixels; no
// simulation state, random calls, assets or per-frame object accumulation.
import { hash01, type BiomeId } from '../sim/terrain';
import { rect, type BiomeLook, type G } from './paint';
import { frogPose } from './biomesNew';
import { jaggedSkyRock } from './skyRock';

type Palette = readonly [string, string, string];
const LEAF: Palette = ['#276442', '#428346', '#7aa34e'];
const GOLD: Palette = ['#a75230', '#d47b2e', '#efad3e'];
const AUTUMN: Palette[] = [GOLD,['#9d482d','#c9622e','#e79532'],['#ac742d','#d9a632','#efca56']];
const JUNGLE: Palette = ['#125749', '#247449', '#51934b'];
const poly = (g: G, c: string, points: number[][]) => {
  g.fillStyle = c; g.beginPath(); points.forEach(([x,y], i) => i ? g.lineTo(Math.round(x),Math.round(y)) : g.moveTo(Math.round(x),Math.round(y))); g.closePath(); g.fill();
};
/** Raster ellipses have deliberate chunky edges, including on large crowns. */
function oval(g: G, c: string, x: number, y: number, rx: number, ry: number) {
  for (let v = -Math.ceil(ry); v <= ry; v += 2) {
    const half = Math.round(rx * Math.sqrt(Math.max(0, 1 - v * v / (ry * ry))));
    rect(g, c, x - half, y + v, half * 2, 2);
  }
}
function line(g: G, c: string, pts: number[][], width = 1) {
  g.strokeStyle = c; g.lineWidth = width; g.lineCap = 'butt'; g.beginPath();
  pts.forEach(([x,y], i) => i ? g.lineTo(Math.round(x),Math.round(y)) : g.moveTo(Math.round(x),Math.round(y))); g.stroke();
}
function at(g: G, x: number, y: number, s: number, draw: () => void) {
  g.save(); g.translate(Math.round(x), Math.round(y)); g.scale(s,s); draw(); g.restore();
}
function crown(g: G, x: number, y: number, r: number, p: Palette, seed: number) {
  // Offset, uneven lobes form a leafy contour; highlights are broken leaf planes.
  const lobes = [[-.57,.12,.56],[-.25,-.32,.65],[.32,-.3,.6],[.64,.12,.51],[0,.22,.62]];
  for (const [dx,dy,rr] of lobes) oval(g,p[0],x+dx*r,y+dy*r,r*rr,r*rr*.8);
  for (let i=0;i<4;i++) {
    const [dx,dy,rr] = lobes[i], xx=x+dx*r, yy=y+dy*r;
    oval(g,p[1],xx-2,yy-3,r*rr*.91,r*rr*.65);
    const v=r*rr;
    poly(g,p[2],[[xx-v*.66,yy-v*.2],[xx-v*.48,yy-v*.48],[xx+v*.05,yy-v*.53],[xx+v*.32,yy-v*.3],[xx+v*.09,yy-v*.23],[xx-v*.1,yy-v*.3],[xx-v*.25,yy-v*.15]]);
  }
  for(let i=0;i<13;i++) {
    const h=hash01(seed*37+i*13), xx=x-r*.8+h*r*1.6, yy=y-r*.4+hash01(i+seed*7)*r*.7;
    rect(g,i%3===0?p[2]:p[1],xx,yy,2+hash01(i*7+seed)*3,2);
  }
}
function oak(g: G, x: number, y: number, height: number, p: Palette, seed: number, t: number, vines=false) {
  g.save(); g.translate(x,y); g.scale(height/100*(.86+hash01(seed*7)*.3),height/100); x=0; y=0; height=100;
  const sway=Math.sin(t*.45+seed)*.6;
  // Buttressed trunk and forked limbs remain visible between separate crowns.
  poly(g,'#5b4432',[[x-10,y],[x-5,y-height*.52],[x-22,y-height*.72],[x-29,y-height*.89],[x-23,y-height*.91],[x-16,y-height*.75],[x-3,y-height*.64],[x-4,y-height*.98],[x+1,y-height*1.04],[x+5,y-height*.63],[x+20,y-height*.78],[x+29,y-height*.95],[x+34,y-height*.93],[x+25,y-height*.74],[x+7,y-height*.5],[x+7,y-5],[x+12,y]]);
  poly(g,'#8b6540',[[x-7,y],[x-2,y-height*.53],[x-20,y-height*.75],[x-26,y-height*.89],[x-23,y-height*.9],[x-17,y-height*.76],[x,y-height*.61],[x-1,y-height*.96],[x+2,y-height*.94],[x+3,y-height*.48],[x+1,y-3]]);
  line(g,'#433c30',[[x+4,y-5],[x+1,y-height*.35],[x+4,y-height*.52],[x+21,y-height*.76]],2);
  line(g,'#ad7c47',[[x-4,y-12],[x-2,y-height*.45]],1);
  crown(g,x-height*.25+sway,y-height*.8,height*.26,p,seed+3);
  crown(g,x+height*.26+sway,y-height*.88,height*.27,p,seed+7);
  crown(g,x-height*.02+sway,y-height*1.04,height*.3,p,seed);
  if(vines) for(let i=0;i<3;i++) {
    const vx=x-24+i*19, vy=y-height*.82;
    line(g,'#749348',[[vx,vy],[vx+Math.sin(t*.7+i)*2,vy+22],[vx+7,vy+33],[vx+11,vy+29]],1.5);
    rect(g,'#91aa52',vx+2,vy+19,3,2);
  }
  // Root grass is an irregular tuft, not a rectangular pedestal.
  for(let i=0;i<7;i++)line(g,p[0],[[x-12+i*4,y],[x-14+i*4,y-2-hash01(seed+i)*3]],1);
  g.restore();
}
function boulder(g:G,x:number,y:number,s:number,p:Palette) {
  poly(g,p[0],[[x-s,y],[x-s*.8,y-s*.6],[x-s*.2,y-s],[x+s*.5,y-s*.8],[x+s,y-s*.2],[x+s*.8,y]]);
  poly(g,p[1],[[x-s,y],[x-s*.8,y-s*.6],[x-s*.2,y-s],[x+s*.1,y-s*.2],[x,y]]);
  poly(g,p[2],[[x-s*.8,y-s*.6],[x-s*.2,y-s],[x+s*.5,y-s*.8],[x+s*.1,y-s*.6]]);
}
function grass(g:G,x:number,y:number,c:string,t:number,seed:number) {
  for(let i=0;i<7;i++) {const ht=3+hash01(i+seed)*6; line(g,c,[[x+i*2,y],[x+i*2+Math.sin(t*.7+i)*.5-2,y-ht]],1);}
}
function fence(g:G,x:number,y:number,n=5) {
  rect(g,'#93683e',x,y-7,n*9,2); rect(g,'#6d5036',x,y-3,n*9,1);
  for(let i=0;i<=n;i++){rect(g,'#694d37',x+i*9,y-10,2,12);rect(g,'#ac8050',x+i*9,y-10,1,10);}
}
function barn(g:G,x:number,y:number) {
  rect(g,'#b64b3a',x-20,y-24,40,24);poly(g,'#6a3a37',[[x-24,y-24],[x,y-43],[x+24,y-24]]);
  line(g,'#edcf9d',[[x-22,y-25],[x,y-41],[x+22,y-25]],1);
  for(let i=0;i<9;i++)rect(g,'#9b3f34',x-18+i*4,y-23,1,23);
  rect(g,'#e8d6ad',x-7,y-18,14,18);line(g,'#9c8667',[[x-7,y-18],[x+7,y],[x+7,y-18],[x-7,y]],1);
  rect(g,'#e5d5ae',x-3,y-33,6,6);rect(g,'#4a4c45',x-2,y-32,4,4);
}
function sheep(g:G,x:number,y:number) {
  oval(g,'#e9edda',x,y-6,7,4);oval(g,'#f9f6e6',x-2,y-8,5,3);
  rect(g,'#343f3c',x+5,y-7,3,4);rect(g,'#343f3c',x-4,y-3,1,3);rect(g,'#343f3c',x+3,y-3,1,3);
}
function mill(g:G,x:number,y:number,t:number) {
  poly(g,'#dbc89e',[[x-6,y],[x-3,y-29],[x+3,y-29],[x+7,y]]);rect(g,'#785c46',x-2,y-7,4,7);
  for(let i=0;i<4;i++){const a=t*.42+i*Math.PI/2; const dx=Math.cos(a),dy=Math.sin(a);poly(g,'#faf0ce',[[x+dx*3,y-29+dy*3],[x+dx*23,y-29+dy*23],[x+dx*23-dy*3,y-29+dy*23+dx*3],[x+dx*5-dy*2,y-29+dy*5+dx*2]]);}
}
function palm(g:G,x:number,y:number,h:number,t:number) {
  const tx=x+12,ty=y-h;
  poly(g,'#83613e',[[x-5,y],[x+1,y-h*.55],[tx-3,ty],[tx+3,ty],[x+8,y-h*.5],[x+4,y]]);
  line(g,'#b5864c',[[x-2,y],[x+3,y-h*.5],[tx,ty]],2);
  for(let i=0;i<7;i++){const a=-Math.PI+ i*Math.PI/6+Math.sin(t*.6)*.02;const dx=Math.cos(a),dy=Math.sin(a); const len=28+ (i%2)*9;
    poly(g,i%2?'#43864a':'#266c44',[[tx,ty],[tx+dx*len*.6,ty+dy*len*.7-5],[tx+dx*len,ty+dy*len+9],[tx+dx*len*.6,ty+dy*len*.7+2]]);
    line(g,'#81a64e',[[tx,ty],[tx+dx*len*.6,ty+dy*len*.7-2]],1);
  }
  oval(g,'#6b4c32',tx-3,ty+3,3,4);oval(g,'#956b3e',tx+3,ty+4,3,3);
}
function huts(g:G,x:number,y:number) {
  for(let i=0;i<3;i++){const bx=x+i*19,c=['#4e96ad','#dbb559','#c7624b'][i];rect(g,c,bx,y-24,17,24);poly(g,'#f3e9cc',[[bx-2,y-24],[bx+8,y-35],[bx+19,y-24]]);
    rect(g,'#f1e9cb',bx+5,y-20,8,20);rect(g,c,bx+6,y-19,6,18);rect(g,'#f1e9cb',bx+10,y-11,1,1);line(g,'#ffffff55',[[bx+2,y-22],[bx+2,y-2]],1);}
  rect(g,'#af8b59',x-2,y,62,3);
}
function parasol(g:G,x:number,y:number,t:number) {
  line(g,'#7d6045',[[x,y],[x-2,y-25]],2);
  for(let i=0;i<4;i++) poly(g,i%2?'#f3e6c5':'#d76550',[[x-2,y-30],[x-21+i*10,y-21],[x-11+i*10,y-21]]);
  grass(g,x+9,y,'#8d9f56',t,7);
}
function kelp(g:G,x:number,y:number,h:number,t:number,seed:number) {
  for(let k=0;k<5;k++) {
    const bx=x+k*7,ht=h*(.7+hash01(seed+k)*.3),pts:number[][]=[];
    for(let j=0;j<=8;j++){const yy=y-j*ht/8;pts.push([bx+Math.sin(t*.65+j*.7+k)*j*.8,yy]);}
    line(g,k%2?'#2c805b':'#246e56',pts,3);
    for(let j=2;j<8;j++){const [px,py]=pts[j];poly(g,k%2?'#63a04d':'#398e61',[[px,py+3],[px+(j%2?1:-1)*8,py-4],[px+(j%2?1:-1)*5,py-10],[px,py-4]]);}
  }
}
function coral(g:G,x:number,y:number,c:string) {
  const branch=(bx:number,by:number,len:number,a:number,depth:number)=>{const ex=bx+Math.cos(a)*len,ey=by+Math.sin(a)*len;line(g,c,[[bx,by],[ex,ey]],depth+1);if(depth){branch(ex,ey,len*.65,a-.65,depth-1);branch(ex,ey,len*.7,a+.6,depth-1);}};
  branch(x,y,13,-Math.PI/2,3);
  for(let i=0;i<4;i++){const hh=8+(i%3)*4;rect(g,'#b774a7',x+15+i*5,y-hh,4,hh);oval(g,'#e8a0bf',x+17+i*5,y-hh,3,2);rect(g,'#745888',x+16+i*5,y-hh,2,1);}
}
function wreck(g:G,x:number,y:number,t:number) {
  poly(g,'#715b46',[[x-40,y-20],[x-23,y-12],[x+22,y-15],[x+40,y-29],[x+29,y-2],[x-20,y+1]]);
  for(let i=0;i<4;i++) line(g,i%2?'#473f3c':'#998061',[[x-31+i*3,y-15+i*4],[x+29-i*2,y-21+i*5]],1);
  line(g,'#5c4c3d',[[x-6,y-9],[x-23,y-76]],3);line(g,'#a08b64',[[x-38,y-58],[x+9,y-68]],2);
  poly(g,'#c3c5a5',[[x-22,y-63],[x+9,y-65],[x+4,y-39],[x-2,y-44],[x-6,y-38],[x-10,y-48],[x-15,y-43]]);
  line(g,'#4a514a',[[x+9,y-65],[x+24,y-17]],1);
  for(let i=0;i<3;i++)rect(g,'#243d48',x-16+i*13,y-12,5,3);
  grass(g,x-35,y,'#438754',t,4);
}
function temple(g:G,x:number,y:number) {
  for(let i=0;i<5;i++){const ww=65-i*11;rect(g,i%2?'#929b79':'#7c8b71',x-ww/2,y-8-i*9,ww,9);rect(g,'#b3b696',x-ww/2,y-8-i*9,ww,2);
    for(let j=0;j<ww/12;j++)rect(g,'#677e67',x-ww/2+j*12+(i%2)*5,y-6-i*9,1,6);}
  rect(g,'#344e47',x-4,y-44,8,8);poly(g,'#69934b',[[x-30,y-16],[x-8,y-16],[x-18,y-6],[x-28,y-5]]);
  rect(g,'#65954c',x+9,y-37,4,15);rect(g,'#84aa58',x+12,y-30,4,2);
}
function fern(g:G,x:number,y:number,t:number) {
  for(let i=-3;i<=3;i++)poly(g,i%2?'#5e9c49':'#31754a',[[x,y],[x+i*5,y-19-Math.abs(i)],[x+i*9+Math.sin(t*.6),y-9],[x+i*4,y-11]]);
}
function cactus(g:G,x:number,y:number,h:number) {
  rect(g,'#386b43',x-5,y-h,10,h);rect(g,'#54884a',x-4,y-h,4,h);rect(g,'#79a552',x-3,y-h+3,1,h-5);
  for(const [dir,ht] of [[-1,.55],[1,.75]]){rect(g,'#386b43',x+dir*15-3,y-h*ht,6,h*.24);rect(g,'#386b43',Math.min(x,x+dir*15),y-h*ht+h*.19,17,5);rect(g,'#69a052',x+dir*15-2,y-h*ht+1,2,h*.2);}
  for(let i=0;i<5;i++)rect(g,'#a5b672',x+2,y-h+7+i*8,1,1);
}
function basalt(g:G,x:number,y:number,seed:number) {
  for(let i=0;i<6;i++){const ht=14+hash01(seed+i)*43,xx=x+i*8;poly(g,'#34323d',[[xx,y],[xx,y-ht],[xx+4,y-ht-3],[xx+8,y-ht],[xx+8,y]]);rect(g,'#4b4653',xx+1,y-ht,3,ht);line(g,'#656070',[[xx,y-ht],[xx+4,y-ht-3],[xx+8,y-ht]],1);}
}
function deadTree(g:G,x:number,y:number) {line(g,'#363239',[[x,y],[x-2,y-20],[x+1,y-40]],3);line(g,'#363239',[[x-1,y-17],[x-12,y-27],[x-12,y-34]],2);line(g,'#363239',[[x-1,y-25],[x+9,y-34],[x+11,y-42]],2);}
function pine(g:G,x:number,y:number,height:number) {
  rect(g,'#685442',x-2,y-height*.6,4,height*.6);
  for(let i=0;i<5;i++){const yy=y-height*.13-i*height*.16,ww=height*(.28-i*.045);poly(g,'#24584d',[[x-ww,yy],[x-ww*.63,yy-height*.08],[x-ww*.7,yy-height*.12],[x,yy-height*.31],[x+ww*.65,yy-height*.12],[x+ww,yy]]);
    poly(g,'#e9f1ed',[[x-ww*.9,yy-height*.08],[x-ww*.53,yy-height*.15],[x,yy-height*.31],[x+ww*.64,yy-height*.12],[x+ww*.29,yy-height*.08],[x+ww*.07,yy-height*.14],[x-ww*.2,yy-height*.09]]);
    line(g,'#bacfdc',[[x-ww*.7,yy-height*.08],[x-ww*.3,yy-height*.12],[x,yy-height*.2]],1);}
}
function cabin(g:G,x:number,y:number,t:number) {
  rect(g,'#87603f',x-27,y-29,54,29);for(let j=0;j<6;j++)rect(g,'#654d3a',x-27,y-26+j*5,54,1);
  poly(g,'#eaf1f0',[[x-33,y-28],[x,y-54],[x+33,y-28],[x+29,y-23],[x,y-47],[x-29,y-23]]);
  poly(g,'#644c3b',[[x-23,y-29],[x,y-47],[x+23,y-29]]);rect(g,'#533f35',x-4,y-19,9,19);
  for(const dx of [-17,13]){rect(g,'#d9a65a',x+dx-4,y-22,9,10);rect(g,'#f4d687',x+dx-3,y-21,7,8);rect(g,'#82653c',x+dx,y-21,1,8);rect(g,'#82653c',x+dx-3,y-17,7,1);}
  rect(g,'#9c7863',x+15,y-51,6,16);rect(g,'#eaf1f0',x+14,y-52,8,2);
  for(let i=0;i<4;i++){const a=(t*4+i*6)%24;g.save();g.globalAlpha=.35*(1-a/24);oval(g,'#eaf1f0',x+18+a*.4,y-55-a,3+a*.2,2+a*.15);g.restore();}
}
function crater(g:G,x:number,y:number,r:number) {
  oval(g,'#a3a4ad',x,y,r,r*.27);oval(g,'#666977',x,y-2,r*.87,r*.21);oval(g,'#797c8a',x+2,y,r*.7,r*.12);
  for(let i=0;i<7;i++){const xx=x-r*.7+i*r*.23;rect(g,'#b9b9c0',xx,y-4-Math.sin(i/6*Math.PI)*r*.13,3,1);}
}
function lander(g:G,x:number,y:number,t:number) {
  for(const dir of [-1,1]){line(g,'#d8cba6',[[x+dir*8,y-14],[x+dir*19,y]],2);line(g,'#aa8f55',[[x+dir*8,y-14],[x+dir*8,y-2],[x+dir*19,y]],1);rect(g,'#d9d9d6',x+dir*19-4,y-1,8,2);}
  rect(g,'#bf963e',x-12,y-24,24,12);rect(g,'#edc569',x-12,y-24,11,12);poly(g,'#deded5',[[x-9,y-24],[x-9,y-36],[x-4,y-41],[x+7,y-38],[x+10,y-24]]);rect(g,'#9cabb2',x+1,y-36,7,8);rect(g,'#34434d',x+2,y-35,5,5);
  line(g,'#e2e3db',[[x-1,y-41],[x-1,y-49],[x+5,y-49]],1);rect(g,Math.sin(t*2)>0?'#dca46a':'#7a6454',x-3,y-28,2,2);
  line(g,'#d2cba9',[[x-4,y-14],[x-4,y]],1);for(let i=0;i<4;i++)rect(g,'#d2cba9',x-5,y-12+i*3,4,1);
}
function dish(g:G,x:number,y:number,t:number) {
  line(g,'#b6bec1',[[x-6,y],[x,y-16],[x+7,y]],2);at(g,x,y-20,1,()=>{g.rotate(-.5+Math.sin(t*.2)*.06);oval(g,'#e7e7df',0,0,12,5);oval(g,'#bfc5c5',0,-1,10,3);line(g,'#faf5df',[[0,0],[0,-10],[4,-10]],1);});
}
function footbridge(g:G,x:number,y:number) {
  poly(g,'#76aebb',[[x-40,y-4],[x-16,y-9],[x+18,y-7],[x+40,y-2],[x+28,y+3],[x-15,y-1]]);
  rect(g,'#6c5137',x-24,y-8,48,3);rect(g,'#ad8150',x-25,y-11,50,3);fence(g,x-24,y-11,5);
  rect(g,'#674f38',x-20,y-6,3,8);rect(g,'#674f38',x+19,y-6,3,8);
  boulder(g,x-33,y,8,['#686954','#858370','#aaa089']);boulder(g,x+36,y,6,['#686954','#858370','#aaa089']);
}
function crane(g:G,x:number,y:number,t:number,seed:number) {
  // A reflected silhouette shares the exact pose and waterline.
  const draw=()=>{
    line(g,'#3e6268',[[x-3,y],[x-2,y-15],[x+3,y-19]],1);line(g,'#3e6268',[[x+4,y],[x+4,y-14]],1);
    poly(g,'#f1f2dc',[[x-10,y-17],[x-5,y-25],[x+4,y-27],[x+8,y-23],[x+3,y-17]]);
    poly(g,'#c9dcd2',[[x-10,y-17],[x-5,y-25],[x+1,y-24],[x-1,y-19]]);
    const dip=(Math.sin(t*.32+seed)>.7?Math.sin(t*.32+seed)-.7:0)*18;
    line(g,'#f5f3df',[[x+4,y-23],[x+9,y-29],[x+6,y-36+dip],[x+10,y-39+dip]],3);
    rect(g,'#f5f3df',x+8,y-41+dip,6,4);poly(g,'#d0a75c',[[x+14,y-40+dip],[x+22,y-38+dip],[x+14,y-38+dip]]);rect(g,'#304c51',x+12,y-40+dip,1,1);
  };
  g.save();g.globalAlpha*=.2;g.translate(0,y+1);g.scale(1,-.55);g.translate(0,-y);draw();g.restore();draw();
  line(g,'#b0d5c6',[[x-10,y+2],[x+12,y+2]],1);
}
function reedbed(g:G,x:number,y:number,t:number,seed:number) {
  oval(g,'#719859',x+12,y,23,3);
  for(let i=0;i<18;i++){const xx=x+i*2,ht=9+hash01(seed+i)*26,sw=Math.sin(t*.7+i)*1.2;
    line(g,i%2?'#608a51':'#92ac59',[[xx,y],[xx+sw-2,y-ht]],1);
    if(i%3===0)rect(g,'#c2ab5c',xx+sw-2,y-ht-4,2,5);}
}
function lily(g:G,x:number,y:number,flower:boolean) {
  oval(g,'#7f9b4f',x,y,6,2);poly(g,'#a9bd65',[[x,y],[x+5,y-1],[x+3,y+1]]);
  if(flower){rect(g,'#f3edce',x-1,y-5,3,3);rect(g,'#fff4d9',x-3,y-4,7,1);rect(g,'#dabb6a',x,y-4,1,1);}
}
function frog(g:G,x:number,y:number,t:number,seed:number){const p=frogPose(t,seed);const xx=x+p.x, yy=y-p.lift;oval(g,'#77a344',xx,yy-3,4,2);rect(g,'#acd15b',xx+p.dir*3-1,yy-6,3,3);rect(g,'#334e43',xx+p.dir*3,yy-5,1,1);line(g,'#5a843c',[[xx-4-p.stretch*2,yy],[xx-2,yy-2],[xx+2,yy]],1);if(p.ripple!==null){g.save();g.globalAlpha*=1-p.ripple;oval(g,'#b9d5bb',xx,y+1,4+p.ripple*6,1);g.restore();}}
function stall(g:G,x:number,y:number,c:string,seed:number) {
  rect(g,'#735240',x-18,y-32,36,32);rect(g,'#2b3545',x-15,y-30,30,21);
  poly(g,c,[[x-21,y-33],[x-16,y-45],[x+16,y-45],[x+21,y-33]]);
  for(let i=0;i<4;i++)poly(g,'#eddbb4',[[x-16+i*10,y-45],[x-12+i*10,y-45],[x-8+i*10,y-33],[x-14+i*10,y-33]]);
  for(let i=0;i<8;i++)rect(g,i%2?c:'#eddbb4',x-21+i*5.3,y-33,5,4);
  rect(g,'#a77d51',x-18,y-10,36,3);rect(g,'#9b6b48',x-17,y-6,34,6);rect(g,'#5d463e',x-2,y-6,1,6);
  for(let i=0;i<9;i++) {const xx=x-13+(i%5)*6,yy=y-12-Math.floor(i/5)*3;oval(g,['#d3b85e','#d57f49','#8ba45a'][Math.floor(hash01(seed+i)*3)],xx,yy,2,2);}
  for(const dx of [-13,12]){rect(g,'#aa7945',x+dx-2,y-28,5,7);rect(g,'#f3d17e',x+dx-1,y-27,3,5);}
}
function marketGroup(g:G,x:number,y:number,t:number,seed:number) {
  for(let i=0;i<3;i++)stall(g,x+i*44,y,['#b4554d','#398b82','#c2a477'][i],seed+i);
  line(g,'#263441',[[x-25,y],[x-25,y-70]],2);line(g,'#263441',[[x+113,y],[x+113,y-70]],2);
  const pts:number[][]=[];for(let i=0;i<=12;i++)pts.push([x-25+i*11.5,y-70+Math.sin(i/12*Math.PI)*8]);line(g,'#24303e',pts,1);
  for(let i=0;i<6;i++){const xx=x-15+i*23+Math.sin(t*.8+i)*.7,yy=y-68+Math.sin((i+.5)/6*Math.PI)*8;
    rect(g,'#334049',xx,yy,1,4);rect(g,'#ba8747',xx-3,yy+4,7,9);rect(g,'#f5d687',xx-2,yy+5,5,7);rect(g,'#fff0b4',xx-1,yy+6,2,4);}
  for(const dx of [-27,111]){rect(g,'#71513e',x+dx,y-11,13,11);rect(g,'#a27b4e',x+dx,y-10,13,2);line(g,'#4c4039',[[x+dx,y],[x+dx+13,y-10]],1);}
}

/** A planted island above a composition of uneven triangular rock shards. */
export function gardenIsland(g:G,x:number,y:number,size:number,seed:number,t:number,near=false) {
  jaggedSkyRock(g,x-size,size*2,()=>y,seed,size*.95,near);
  // Broken terrace shoulders and a thick sod cap tie the shards together.
  rect(g,'#829964',x-size,y-3,size*2,5);rect(g,'#b3c780',x-size+3,y-5,size*2-8,3);
  for(let i=0;i<5;i++){const xx=x-size*.8+i*size*.37,yy=y-5-hash01(i+seed)*4;rect(g,'#a4bd73',xx,yy,size*.24,5);}
  for(let i=0;i<3;i++){const xx=x-size*.7+i*size*.6,len=12+hash01(seed*11+i*7)*11;line(g,'#759264',[[xx,y-1],[xx+Math.sin(t*.6+i),y+len]],1);for(let j=5;j<len;j+=5)rect(g,'#96ad6f',xx+(j%2?-2:1),y+j,3,2);}
  if(size>25){oak(g,x-size*.36,y-5,size*.8,['#698662','#88a26e','#b0bf81'],seed,t);}
  if(size>42){for(let i=0;i<3;i++){rect(g,'#e4dec6',x+size*.15+i*7,y-21,3,17);rect(g,'#f4e9ce',x+size*.12+i*7,y-23,6,3);}rect(g,'#e4dec6',x+size*.1,y-25,22,3);}
  if(size>45){
    rect(g,'#91b9c6',x+size*.64,y+1,5,size*.68);rect(g,'#c9dedb',x+size*.64,y+1,2,size*.68);
    for(let j=0;j<4;j++)rect(g,'#f0ebdf',x+size*.64+(j%2)*2,y+((t*12+j*8)%(size*.65)),1,3);
  }
}
function scenery(id:BiomeId,g:G,w:number,yAt:(x:number)=>number,scroll:number,t:number) {
  const span=id==='market'?320:280;
  for(let k=Math.floor((scroll-160)/span);k<=(scroll+w+160)/span;k++) {
    const seed=hash01(k*97+41), x=k*span-scroll+22+seed*26;
    const y=yAt(x)-4, b=x+142, by=yAt(b)-7, variant=Math.floor(hash01(k*19+73)*3);
    // Smaller groves use a slower apparent depth and a raised ground line.
    if(id==='countryside'||id==='autumn'||id==='jungle') {
      const p=id==='autumn'?AUTUMN[Math.floor(hash01(k*13+7)*3)]:id==='jungle'?JUNGLE:LEAF;
      oak(g,x+73,yAt(x+73)-21,39,id==='autumn'?AUTUMN[(variant+1)%3]:p,k+2,t);oak(g,x+106,yAt(x+106)-18,48,id==='autumn'?AUTUMN[variant]:p,k+5,t);
      oak(g,x,y,98+seed*32,p,k,t,id==='jungle');
    }
    switch(id){
      case 'countryside':
        if(variant===0) { mill(g,b+18,by,t);sheep(g,b-23,by);sheep(g,b+48,by); } else {barn(g,b+9,by);sheep(g,b-20,by-1);sheep(g,b+47,by);} fence(g,b-29,by+7,8);break;
      case 'autumn':
        if(variant===1) {oak(g,b,by,63,['#b46b2f','#d79931','#eabe52'],k+13,t);} else footbridge(g,b,by);fence(g,x-28,y-1,5);
        for(let i=0;i<18;i++){const xx=x-44+hash01(i+k*19)*94;rect(g,i%2?'#e6a43b':'#b56331',xx,yAt(xx)-2-hash01(i+k)*10,2+(i%3),1);}
        boulder(g,b+39,by+7,9,['#60685d','#858676','#aaa18b']);break;
      case 'seaside':
        palm(g,x,y,95+seed*20,t);palm(g,x+28,yAt(x+28)-7,68,t);if(variant!==1) huts(g,b-8,by);parasol(g,b-34,by+5,t);boulder(g,b+53,by+1,8,['#7d8988','#a4aaa0','#c8c4af']);boulder(g,x-18,y,11,['#7d8988','#a4aaa0','#c8c4af']);grass(g,x+12,y,'#81934e',t,k);break;
      case 'underwater':
        kelp(g,x-15,y,108,t,k);coral(g,x+28,y,'#d88b9e');if(variant!==1) wreck(g,b+10,by,t);else {kelp(g,b,by,62,t,k+3);coral(g,b+30,by,'#dca16a');}boulder(g,b-29,by+1,12,['#466776','#60838b','#85a4a5']);
        for(let i=0;i<6;i++){const fx=b-28+i*7+Math.sin(t*.35)*5,fy=by-52+(i%3)*4;oval(g,'#e7c76c',fx,fy,3,1);poly(g,'#e7c76c',[[fx-2,fy],[fx-5,fy-2],[fx-5,fy+2]]);rect(g,'#3d605d',fx+2,fy,1,1);}break;
      case 'jungle':
        temple(g,b+8,by);fern(g,x-23,y,t);fern(g,b+45,by,t);boulder(g,b-32,by,10,['#456b5a','#6c8a6b','#9eaa80']);break;
      case 'desert':
        cactus(g,x,y,76+seed*22);cactus(g,x+35,yAt(x+35)-14,41);boulder(g,x-14,y,17,['#994c3d','#b86743','#d29159']);boulder(g,b+32,by,13,['#994c3d','#b86743','#d29159']);
        rect(g,'#73563c',b,by-24,3,24);poly(g,'#977044',[[b-13,by-27],[b+14,by-29],[b+15,by-20],[b-14,by-18]]);rect(g,'#b6925c',b-10,by-25,18,1);grass(g,b-29,by,'#8c8f54',t,k);break;
      case 'volcano':
        basalt(g,x-21,y,k*8);deadTree(g,x+53,yAt(x+53)-2);boulder(g,b,by,22,['#252630','#44404d','#625966']);boulder(g,b+30,by+5,12,['#252630','#44404d','#625966']);
        line(g,'#c7542e',[[b-42,by-10],[b-34,by-8],[b-39,by-5],[b-19,by]],3);line(g,'#f3a94a',[[b-42,by-10],[b-34,by-8],[b-39,by-5],[b-19,by]],1);break;
      case 'snow':
        pine(g,x+47,yAt(x+47)-12,62);pine(g,x,y,115+seed*15);pine(g,x-24,yAt(x-24)-8,75);if(variant!==1){cabin(g,b+11,by,t);fence(g,b-32,by+5,8);}else {pine(g,b,by,68);pine(g,b+39,by+2,91);}boulder(g,b+58,by+7,12,['#6f879d','#9eafbd','#eaf0ea']);break;
      case 'moon':
        crater(g,x+17,y-2,45);boulder(g,x-20,y,18,['#505563','#7b808b','#a5a6ab']);if(variant!==1)lander(g,b,by,t);else crater(g,b,by,30);dish(g,b+45,by+3,t);rect(g,'#e0dfd3',b+70,by-30,1,31);rect(g,'#b3c4c4',b+71,by-30,14,8);rect(g,'#d7c570',b+71,by-29,14,2);break;
      case 'marsh':
        reedbed(g,x-18,y,t,k*17);crane(g,x+53,yAt(x+53)-19,t,k);if(variant!==1)at(g,b+35,by-10,.72,()=>crane(g,0,0,t,k+2));reedbed(g,b+66,by,t,k*23);
        for(let i=0;i<7;i++)lily(g,x+39+i*18,yAt(x+39+i*18)-6-(i%3)*5,i%3===0);
        frog(g,b-21,by+2,t,seed);break;
      case 'market':
        oak(g,x-17,y,61,['#213f47','#2e5651','#4c6d59'],k,t);marketGroup(g,x+69,yAt(x+69)-4,t,k);break;
      case 'sky':
        // Garden furniture follows the planted stretches of the road islands.
        rect(g,'#8fa86a',x-27,y-1,65,7);rect(g,'#b4c681',x-25,y-3,61,3);
        rect(g,'#8fa86a',b-10,by-1,44,9);rect(g,'#b4c681',b-8,by-3,40,3);
        oak(g,x,y,67,['#648356','#87a361','#b2c378'],k,t);for(let i=0;i<5;i++)lily(g,x+29+i*6,yAt(x+29+i*6)-2,true);
        for(let i=0;i<3;i++){rect(g,'#d8d3b9',b+i*9,by-23,4,23);rect(g,'#f2e5c3',b-1+i*9,by-25,6,3);}rect(g,'#f2e5c3',b-3,by-28,28,3);break;
    }
  }
}

function volcanoBackdrop(g:G,w:number,y:number,u:number,t:number) {
  const span=340;
  for(let k=Math.floor(u/span)-1;k<(u+w)/span+1;k++){
    const x=k*span-u;
    poly(g,'#4e3b49',[[x-30,y+30],[x+18,y-1],[x+48,y-29],[x+74,y-35],[x+101,y-65],[x+125,y-54],[x+139,y-60],[x+160,y-40],[x+181,y-42],[x+211,y-14],[x+255,y+10],[x+320,y+30]]);
    for(let i=0;i<7;i++){const xx=x+45+i*25;poly(g,'#3e3542',[[xx,y+24],[xx+5,y-20-i%3*13],[xx+19,y-35-i%3*10],[xx+14,y+20]]);}
    for(let i=0;i<3;i++){const pts=[[x+123+i*8,y-53],[x+134+i*16,y-35],[x+126+i*24,y-22],[x+148+i*29,y-9],[x+170+i*35,y+11]];line(g,'#c15b3b',pts,5);line(g,'#ef9a46',pts,2);}
    for(let i=0;i<5;i++){const a=(t*4+i*8)%40;g.save();g.globalAlpha=.45*(1-a/45);oval(g,'#695663',x+132+a*.9,y-63-a,9+a*.4,5+a*.25);g.restore();}
  }
}
function skyBackdrop(g:G,w:number,y:number,u:number,t:number) {
  for(let k=Math.floor(u/120)-1;k<(u+w)/120+1;k++) {const h=hash01(k*31+17);gardenIsland(g,k*120-u,y-25-h*39,28+h*24,k,t);}
  for(let i=0;i<7;i++){const x=((i*83-u*.4)%(w+80)+w+80)%(w+80)-40, yy=y+36+(i%3)*10;rect(g,'#eee9f1',x-25,yy,50,9);rect(g,'#eee9f1',x-17,yy-6,33,6);rect(g,'#f8f0ed',x-8,yy-10,15,5);}
}

function townBackdrop(g:G,w:number,y:number,u:number) {
  for(const row of [0,1])for(let k=Math.floor(u*(1+row*.4)/45)-1;k<(u*(1+row*.4)+w)/45+1;k++) {
    const h=hash01(k*31+row*19),x=k*45-u*(1+row*.4),base=y+19+row*18,ht=24+h*39;
    const c=row?'#2e3b5b':'#34476a';rect(g,c,x,base-ht,42,ht+12);
    poly(g,c,[[x-3,base-ht],[x+19,base-ht-9-h*9],[x+45,base-ht]]);
    rect(g,c,x+30,base-ht-9,4,10);
    for(let yy=base-ht+7;yy<base-3;yy+=12)for(let xx=x+7;xx<x+37;xx+=12)if(hash01(Math.floor(xx)+Math.floor(yy)*3)>.62)rect(g,row?'#b99e69':'#7b806d',xx,yy,2,4);
    if(h>.8){rect(g,c,x+14,base-ht-25,10,20);poly(g,c,[[x+10,base-ht-25],[x+19,base-ht-40],[x+29,base-ht-25]]);rect(g,'#c8aa6b',x+18,base-ht-23,3,6);}
  }
}
function jungleBackdrop(g:G,w:number,y:number,u:number,t:number) {
  for(let k=Math.floor(u/43)-1;k<(u+w)/43+1;k++){const x=k*43-u;oak(g,x,y+29,42+hash01(k*13)*20,['#4d846b','#659879','#7da481'],k,t);}
  const span=360;
  for(let k=Math.floor(u/span)-1;k<(u+w)/span+1;k++){
    const x=k*span-u+100;poly(g,'#568473',[[x-31,y+45],[x-27,y-21],[x-9,y-26],[x+25,y-16],[x+37,y+45]]);
    rect(g,'#88c3c3',x-10,y-21,22,63);rect(g,'#c0e2dc',x-8,y-20,5,63);rect(g,'#d9eee1',x+3,y-18,3,60);
    for(let i=0;i<10;i++)rect(g,'#e4f2e4',x-9+(i%4)*6,y-18+((t*15+i*9)%56),2,5);
    oval(g,'#9dccbf',x+1,y+42,20,4);crown(g,x-21,y-23,18,['#386f58','#4f8864','#79a074'],k);crown(g,x+24,y-21,14,['#386f58','#4f8864','#79a074'],k+1);
  }
}
function snowBackdrop(g:G,w:number,y:number,u:number) {
  for(const row of [0,1])for(let k=Math.floor(u*(.6+row*.4)/86)-1;k<(u*(.6+row*.4)+w)/86+1;k++){
    const x=k*86-u*(.6+row*.4),ht=48+hash01(k*37+row)*30,base=y+24+row*9, c=row?'#8ca8c0':'#b7cadb';
    poly(g,c,[[x-40,base],[x-25,base-ht*.4],[x-16,base-ht*.39],[x+1,base-ht],[x+12,base-ht*.73],[x+18,base-ht*.79],[x+32,base-ht*.4],[x+44,base-ht*.32],[x+57,base]]);
    poly(g,'#eaf2ee',[[x-16,base-ht*.39],[x+1,base-ht],[x+12,base-ht*.73],[x+18,base-ht*.79],[x+29,base-ht*.45],[x+13,base-ht*.59],[x+10,base-ht*.49],[x+3,base-ht*.72],[x-4,base-ht*.48],[x-9,base-ht*.52]]);
    poly(g,row?'#718fae':'#9eb8cd',[[x+1,base-ht],[x+10,base-ht*.49],[x+17,base-ht*.34],[x+9,base-ht*.37],[x+15,base],[x-4,base-ht*.2]]);
  }
}

export function polishWorld(looks:Record<BiomeId,BiomeLook>):Record<BiomeId,BiomeLook> {
  for(const id of Object.keys(looks) as BiomeId[]) {
    const look=looks[id], original=look.midProp;
    look.roadside=(g,w,y,scroll,t)=>scenery(id,g,w,y,scroll,t);
    // Keep distant life and modest background detail, with ample open patches.
    look.midProp=(g,h,x,y,t)=>{if(id==='sky'||id==='market'||id==='marsh'||id==='autumn')return;if(h<.18)original(g,h,x,y,t);};
  }
  looks.sky.openSky=true;looks.sky.backdrop=skyBackdrop;
  looks.volcano.backdrop=volcanoBackdrop;
  looks.seaside.ridge='#67b7be';
  looks.marsh.ridge='#81b9b5';
  looks.market.backdrop=townBackdrop;
  looks.jungle.backdrop=jungleBackdrop;
  looks.snow.backdrop=snowBackdrop;
  return looks;
}
