const reviewUrl = process.env.REVIEW_URL ?? 'http://127.0.0.1:5199';
import { chromium } from 'playwright-core';
import { mkdirSync,writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
const out=process.argv.find((arg,i)=>i>1&&!arg.startsWith('--'))??'/tmp/wattcade-rewards';mkdirSync(out,{recursive:true});
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
try{
  const page=await browser.newPage({viewport:{width:1536,height:1024},deviceScaleFactor:1});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  for(const mode of ['c1','c2','lightcycle']){
    await page.goto(`${reviewUrl}/dev/cosmetic-review.html?mode=${mode}`);await page.waitForFunction(()=>window.__reviewReady);await page.screenshot({path:`${out}/${mode}-actual.png`});
  }
  // The bike's own art must not emit pixels behind its chassis. The trail must
  // render on an ordinary road bike, then disappear at a stop.
  const check=await page.evaluate(async()=>{
    const {drawRider}=await import('/src/cosmetics/draw/rider.ts');const {riderLook}=await import('/src/cosmetics/unlocks.ts');const base=riderLook({color:'#19b5bc',level:1,achievements:[]});
    const c=document.createElement('canvas');c.width=320;c.height=160;const g=c.getContext('2d',{willReadFrequently:true});
    const behind=(bike,trail,speed)=>{g.setTransform(1,0,0,1,0,0);g.clearRect(0,0,320,160);g.translate(240,125);g.scale(2,2);drawRider(g,{...base,bike,trail},.3,1,{t:1.2,speed});const p=g.getImageData(0,0,190,160).data;let n=0;for(let i=3;i<p.length;i+=4)if(p[i]>0)n++;return n;};
    const standalone=behind('tron','none',6),independent=behind('road','lightcycle',6),stopped=behind('tron','lightcycle',0);
    if(standalone!==0||independent===0||stopped!==0)throw new Error(`Trail coupling: ${standalone}/${independent}/${stopped}`);
    return {standaloneBikeHasTrail:false,trailWorksOnRoadBike:true,trailHiddenWhenStopped:true};
  });
  writeFileSync(`${out}/light-cycle-check.json`,JSON.stringify(check,null,2));
  if(!process.argv.includes('--stills')){
  const encoder=spawn('ffmpeg',['-y','-loglevel','error','-framerate','30','-f','image2pipe','-vcodec','png','-i','-','-an','-c:v','libx264','-preset','fast','-crf','17','-pix_fmt','yuv420p','-movflags','+faststart',`${out}/light-cycle-motion.mp4`],{stdio:['pipe','ignore','inherit']});const complete=once(encoder,'exit');
  for(let i=0;i<195;i++){await page.evaluate(t=>window.__cosmeticFrame(t),i/30);const frame=await page.screenshot();if(!encoder.stdin.write(frame))await once(encoder.stdin,'drain');}
  encoder.stdin.end();const[code]=await complete;if(code!==0)throw new Error('ffmpeg failed');
  }
  for(const [width,height,label]of [[1200,800,'desktop'],[390,844,'phone']]){
    await page.setViewportSize({width,height});
    for(const mode of ['unlock','pick','locker']){
      await page.goto(`${reviewUrl}/dev/cosmetic-review.html?mode=${mode}&hour=21`);await page.waitForFunction(()=>window.__reviewReady);await page.waitForTimeout(500);
      const overflow=await page.evaluate(()=>({screen:document.querySelector('.screen').scrollWidth,viewport:innerWidth}));if(overflow.screen>width+1)throw new Error(`${mode} overflow at ${width}: ${JSON.stringify(overflow)}`);
      await page.screenshot({path:`${out}/${mode}-${label}.png`});
    }
  }
  if(errors.length)throw new Error(errors.join('\n'));console.log(JSON.stringify(check));console.log('C1/C2, C3 desktop/phone, Locker and independent-trail motion captured.');
}finally{await browser.close();}
