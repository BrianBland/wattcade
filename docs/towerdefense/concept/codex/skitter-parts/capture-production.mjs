// Existing game renderer/pages, DPR2. Vite on5173; integration requires #135 towers/#136 outpost/#138 environment.
import {chromium} from 'playwright-core';
import fs from 'node:fs';
const root=new URL('.',import.meta.url).pathname;fs.mkdirSync(root+'walk-frames',{recursive:true});
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
const page=await browser.newPage({viewport:{width:1560,height:1024},deviceScaleFactor:2});const errors=[];page.on('pageerror',e=>errors.push(String(e)));page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`)});
for(const[name,url]of[['roster','dev/td-roster.html?view=grid'],['aids','dev/td-aids.html'],['integration','dev/td-integration.html?panels=0&alien=1.25&rim=0']]){await page.goto('http://localhost:5173/'+url);await page.waitForFunction(()=>window.__ready===true);await page.locator('canvas').screenshot({path:root+`preview-${name}-2x.png`});}
await page.goto('http://localhost:5173/dev/td-roster.html?view=grid');await page.waitForFunction(()=>window.__ready===true);
const gait=await page.evaluate(async()=>{
 const{SPECS,loadRig,place}=await import('/dev/td-rig.ts');const rig=await loadRig(SPECS.find(s=>s.id==='skitter'));const cv=document.querySelector('canvas');cv.width=512;cv.height=560;cv.style.width='256px';cv.style.height='280px';const g=cv.getContext('2d');
 window.__walk=t=>{g.setTransform(2,0,0,2,0,0);g.fillStyle='#211d19';g.fillRect(0,0,256,280);place(g,rig,128,137,-Math.PI/2,180,{t},{});g.fillStyle='#eee';g.font='12px system-ui';g.fillText('GAME RIG · t='+t.toFixed(3)+'s',8,268);};
 return{groups:rig.walking.map(l=>({group:l.group,chain:l.chain})),logicalLegCount:rig.walking.length*2,tailLinks:rig.tails,root:rig.m.parts.find(p=>p.parent===null).name,gaitHz:rig.spec.gaitHz,source:'Unmodified dev/td-rig.ts',deviceScaleFactor:devicePixelRatio};
});
if(gait.logicalLegCount!==8||gait.groups.some(g=>g.chain.length!==3)||gait.tailLinks.length!==5||gait.root!=='thorax_2')throw Error('Rig topology mismatch');
const frames=[];for(let i=0;i<8;i++){const t=i/(8*gait.gaitHz);await page.evaluate(t=>window.__walk(t),t);await page.locator('canvas').screenshot({path:root+`walk-frames/${String(i).padStart(2,'0')}.png`});frames.push(t);}
await page.evaluate(async()=>{
 const {SPECS,loadRig,place}=await import('/dev/td-rig.ts');const rig=await loadRig(SPECS.find(s=>s.id==='skitter'));
 const bg=await new Promise((res,rej)=>{const i=new Image();i.onload=()=>res(i);i.onerror=rej;i.src='/td/environment/background.webp';});
 const cv=document.querySelector('canvas');cv.width=640;cv.height=1280;cv.style.width='320px';cv.style.height='640px';const g=cv.getContext('2d');g.setTransform(2,0,0,2,0,0);g.fillStyle='#111';g.fillRect(0,0,320,640);g.fillStyle='#eee';g.font='14px system-ui';g.fillText('PRODUCTION SKITTER · 52px · NO AIDS',6,20);
 [[768,560],[590,640]].forEach(([sx,sy],row)=>{const y=30+row*300,scale=.9822;g.save();g.beginPath();g.rect(0,y,320,296);g.clip();g.drawImage(bg,sx-160/scale,sy-150/scale,320/scale,300/scale,0,y,320,300);for(let i=0;i<3;i++)place(g,rig,65+i*95,y+85+i*55,-Math.PI/2,52,{t:i*.15},{});g.restore();});
});
await page.locator('canvas').screenshot({path:root+'map-52px-2x.png'});
fs.writeFileSync(root+'browser-validation.json',JSON.stringify({pages:['dev/td-roster.html?view=grid','dev/td-aids.html','dev/td-integration.html?panels=0&alien=1.25&rim=0'],gait,frames,integrationFooterObservedSkitterPx:40,supplementalSkitterPx:52,errors},null,2)+'\n');await browser.close();console.log({gait,errors});if(errors.length)process.exitCode=1;
