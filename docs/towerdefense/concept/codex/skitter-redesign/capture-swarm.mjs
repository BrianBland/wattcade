// Unrigged Skitter candidate: 16-sprite swarms at 28/35/45px on the game's actual map, DPR2.
// Existing Vite server on localhost:5173; Chromium via installed playwright-core.
import {chromium} from 'playwright-core';
import fs from 'node:fs';
const root=new URL('.',import.meta.url).pathname;
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
const page=await browser.newPage({viewport:{width:1024,height:900},deviceScaleFactor:2});const errors=[];page.on('pageerror',e=>errors.push(String(e)));page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`)});
await page.goto('http://localhost:5173/dev/td-aids.html');await page.waitForFunction(()=>window.__ready===true);
const data=await page.evaluate(async()=>{
 const image=url=>new Promise((res,rej)=>{const i=new Image();i.onload=()=>res(i);i.onerror=rej;i.src=url;});
 const[bg,candidate]=await Promise.all([image('/td/environment/background.webp'),image('/docs/towerdefense/concept/codex/skitter-redesign/candidate.png')]);
 const a=document.createElement('canvas');a.width=candidate.width;a.height=candidate.height;const ag=a.getContext('2d');ag.drawImage(candidate,0,0);const pixels=ag.getImageData(0,0,a.width,a.height).data;let x0=a.width,y0=a.height,x1=0,y1=0;for(let y=0;y<a.height;y++)for(let x=0;x<a.width;x++)if(pixels[(y*a.width+x)*4+3]>128){x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);}
 const cv=document.querySelector('canvas'),D=devicePixelRatio,W=960,H=660,CW=320,CH=310;cv.width=W*D;cv.height=H*D;cv.style.width=W+'px';cv.style.height=H+'px';const g=cv.getContext('2d');
 window.__draw=t=>{g.setTransform(D,0,0,D,0,0);g.fillStyle='#111';g.fillRect(0,0,W,H);[28,35,45].forEach((length,col)=>{g.fillStyle='#eee';g.font='15px system-ui';g.fillText('SKITTER SWARM · '+length+'px',col*CW+8,20);[[768,560],[590,640]].forEach(([sx,sy],row)=>{const x=col*CW,y=30+row*CH,scale=.9822;g.save();g.beginPath();g.rect(x,y,CW-3,CH-3);g.clip();g.drawImage(bg,sx-CW/2/scale,sy-CH/2/scale,CW/scale,CH/scale,x,y,CW,CH);const k=length/(y1-y0+1);for(let i=0;i<16;i++){const ix=i%4,iy=Math.floor(i/4),dx=43+ix*77+Math.sin(i*1.7+t)*7,dy=44+iy*71+Math.sin(i*2.1)*9-((t-.3)*35);g.save();g.translate(x+dx,y+dy);g.rotate(Math.sin(i*2.3)*.25);g.scale(k,k);g.drawImage(candidate,-(x0+x1)/2,-(y0+y1)/2);g.restore();}g.restore();});});};
 window.__draw(.3);
 return{deviceScaleFactor:D,candidateBounds:[x0,y0,x1,y1],nominalLengthsPx:[28,35,45],creaturesPerSwarm:16,rows:['tan floor','dark rock'],rendererAids:{},candidateIsUnsegmented:true,previewMotion:'Whole sprites translate; no articulated gait',background:'/td/environment/background.webp'};
});
await page.locator('canvas').screenshot({path:root+'swarm-map-2x.png'});
fs.writeFileSync(root+'preview-validation.json',JSON.stringify({...data,errors},null,2)+'\n');await browser.close();console.log({...data,errors});if(errors.length)process.exitCode=1;
