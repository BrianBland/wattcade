// Compare a fresh, unsegmented design with the current manifest puppet using the game's own painted map and renderer.
// Requires npm run dev on port5173; uses Chromium with device scale2.
import {chromium} from 'playwright-core';
import fs from 'node:fs';
const root=new URL('.',import.meta.url).pathname;
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
const page=await browser.newPage({viewport:{width:1024,height:900},deviceScaleFactor:2});const errors=[];page.on('pageerror',e=>errors.push(String(e)));page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`)});
await page.goto('http://localhost:5173/dev/td-aids.html');await page.waitForFunction(()=>window.__ready===true);
const data=await page.evaluate(async()=>{
 const{SPECS,loadRig,place}=await import('/dev/td-rig.ts');const rig=await loadRig(SPECS.find(s=>s.id==='glider'));
 const image=url=>new Promise((res,rej)=>{const i=new Image();i.onload=()=>res(i);i.onerror=rej;i.src=url;});
 const [bg,candidate]=await Promise.all([image('/td/environment/background.webp'),image('/docs/towerdefense/concept/codex/glider-redesign/candidate.png')]);
 const a=document.createElement('canvas');a.width=candidate.width;a.height=candidate.height;const ag=a.getContext('2d');ag.drawImage(candidate,0,0);const pixels=ag.getImageData(0,0,a.width,a.height).data;let x0=a.width,y0=a.height,x1=0,y1=0;for(let y=0;y<a.height;y++)for(let x=0;x<a.width;x++)if(pixels[(y*a.width+x)*4+3]>128){x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);}
 const cv=document.querySelector('canvas'),D=devicePixelRatio,W=1000,H=610,CW=250,CH=280;cv.width=W*D;cv.height=H*D;cv.style.width=W+'px';cv.style.height=H+'px';const g=cv.getContext('2d');g.setTransform(D,0,0,D,0,0);g.fillStyle='#111';g.fillRect(0,0,W,H);
 const labels=['CURRENT PUPPET · 45px','FRESH CANDIDATE · 45px','CURRENT PUPPET · 140px','FRESH CANDIDATE · 140px'];
 labels.forEach((text,col)=>{g.fillStyle='#eee';g.font='13px system-ui';g.fillText(text,col*CW+8,20);[[768,560],[590,640]].forEach(([sx,sy],row)=>{const x=col*CW,y=30+row*CH,scale=.9822;g.save();g.beginPath();g.rect(x,y,CW-3,CH-3);g.clip();g.drawImage(bg,sx-CW/2/scale,sy-CH/2/scale,CW/scale,CH/scale,x,y,CW,CH);const length=col<2?45:140;if(col%2===0)place(g,rig,x+CW/2,y+CH/2,-Math.PI/2,length,{t:.3},{});else{const k=length/(y1-y0+1);g.translate(x+CW/2,y+CH/2);g.scale(k,k);g.drawImage(candidate,-(x0+x1)/2,-(y0+y1)/2);}g.restore();});});
 return{deviceScaleFactor:D,candidateBounds:[x0,y0,x1,y1],nominalLengthsPx:[45,140],rendererAids:{},candidateIsUnsegmented:true,background:'/td/environment/background.webp'};
});
await page.locator('canvas').screenshot({path:root+'map-comparison-2x.png'});fs.writeFileSync(root+'preview-validation.json',JSON.stringify({...data,errors},null,2)+'\n');await browser.close();console.log({...data,errors});if(errors.length)process.exitCode=1;
