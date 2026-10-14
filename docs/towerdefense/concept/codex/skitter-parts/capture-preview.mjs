// Run with npm run dev already serving localhost:5173. Device scale factor is 2.
import { chromium } from 'playwright-core';
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
const context=await browser.newContext({viewport:{width:1560,height:1024},deviceScaleFactor:2});
const root=new URL('../',import.meta.url).pathname;
const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(String(e)));page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`)});
for(const [name,url]of[['aids','dev/td-aids.html'],['roster','dev/td-roster.html?view=grid']]){await page.goto('http://localhost:5173/'+url);await page.waitForFunction(()=>window.__ready===true);await page.locator('canvas').screenshot({path:`${root}skitter-parts/preview-${name}-2x.png`});console.log(name,await page.evaluate(()=>({dpr:devicePixelRatio,canvas:[document.querySelector('canvas').width,document.querySelector('canvas').height]})));}await page.goto('http://localhost:5173/dev/td-aids.html');await page.waitForFunction(()=>window.__ready===true);
await page.evaluate(async()=>{
 const {SPECS,loadRig,place}=await import('/dev/td-rig.ts');
 const rigs=await Promise.all(SPECS.slice(0,2).map(loadRig));
 const bg=await new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=reject;i.src='/td/environment/background.webp'});
 const cv=document.querySelector('canvas'),D=devicePixelRatio,W=1280,H=380,CW=160,CH=170;cv.width=W*D;cv.height=H*D;cv.style.width=W+'px';cv.style.height=H+'px';const g=cv.getContext('2d');g.setTransform(D,0,0,D,0,0);
 const cases=[['skitter',40],['skitter',45],['skitter',50],['glider',45]];
 cases.forEach(([name,length],k)=>{[true,false].forEach((emission,b)=>{const col=k*2+b,r=rigs.find(r=>r.spec.id===name);g.fillStyle='#111';g.fillRect(col*CW,0,CW,H);g.fillStyle='#eee';g.font='12px system-ui';g.fillText(name+' '+length+'px '+(emission?'glow':'base only'),col*CW+5,16);[[768,560],[590,640]].forEach(([sx,sy],row)=>{const x=col*CW,y=26+row*CH,scale=.9822;g.save();g.beginPath();g.rect(x,y,CW-2,CH-2);g.clip();g.drawImage(bg,sx-CW/2/scale,sy-CH/2/scale,CW/scale,CH/scale,x,y,CW,CH);const original=r.glow;if(!emission){r.glow=new Map([...r.glow].map(([n,img])=>{const c=document.createElement('canvas');c.width=img.width;c.height=img.height;return[n,c]}))}place(g,r,x+CW/2,y+CH/2,-Math.PI/2,length,{t:.3},{});r.glow=original;g.restore();});});});
});
await page.locator('canvas').screenshot({path:`${root}glider-parts/as-is-game-size-2x.png`});
console.log({errors});await browser.close();if(errors.length)process.exitCode=1;
