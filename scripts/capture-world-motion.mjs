const reviewUrl = process.env.REVIEW_URL ?? 'http://127.0.0.1:5199';
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdirSync, writeFileSync } from 'node:fs';
const out=process.argv[2] ?? '/tmp/wattcade-biomes'; mkdirSync(out,{recursive:true});
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
try {
  const page=await browser.newPage({viewport:{width:1200,height:860},deviceScaleFactor:1});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  for(const group of ['new','green','other']){
    await page.goto(`${reviewUrl}/dev/biome-review.html?manual=1&hour=14&group=${group}`);
    await page.waitForFunction(()=>window.__biomesAdvance);
    await page.evaluate(()=>{for(let i=0;i<450;i++)window.__biomesAdvance(1/30);});
    const encoder=spawn('ffmpeg',['-y','-loglevel','error','-framerate','30','-f','image2pipe','-vcodec','png','-i','-','-an','-c:v','libx264','-preset','fast','-crf','17','-pix_fmt','yuv420p','-movflags','+faststart',`${out}/${group}-motion.mp4`],{stdio:['pipe','ignore','inherit']});
    const complete=once(encoder,'exit');
    for(let i=0;i<240;i++){
      await page.evaluate(()=>window.__biomesAdvance(1/30));
      const frame=await page.screenshot();if(!encoder.stdin.write(frame))await once(encoder.stdin,'drain');
      if(i===30)await page.screenshot({path:`${out}/${group}-actual.png`});
    }
    encoder.stdin.end();const [code]=await complete;if(code!==0)throw new Error(`ffmpeg exit ${code}`);
    console.log(`${group}: captured eight seconds of actual game animation`);
  }
  if(errors.length)throw new Error(errors.join('\n'));
  writeFileSync(`${out}/motion-list.txt`,['new','green','other'].map(x=>`file '${x}-motion.mp4'`).join('\n'));
  const merge=spawn('ffmpeg',['-y','-loglevel','error','-f','concat','-safe','0','-i',`${out}/motion-list.txt`,'-c','copy','-movflags','+faststart',`${out}/all-biomes-motion.mp4`],{stdio:'inherit'});
  const [code]=await once(merge,'exit');if(code!==0)throw new Error(`ffmpeg merge exit ${code}`);
} finally {await browser.close();}
