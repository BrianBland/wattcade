import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright-core';
const base=process.env.REVIEW_URL??'http://127.0.0.1:5220';
const out=process.argv[2]??'/tmp/hud-alignment'; mkdirSync(out,{recursive:true});
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const results=[];
try {
 for(const [id,width,height,controller,hasTouch=true] of [['desktop-mouse',1180,820,false,false],['desktop-controller',1180,820,true],['desktop-touch',1180,820,false],['phone-touch',390,844,false],['small-phone',320,568,false],['short-landscape',844,390,false],['medium-controller',768,1024,true],['medium-touch',768,1024,false],['narrow-tablet',701,900,false],['small-desktop',1051,820,false]]) {
  const page=await browser.newPage({viewport:{width,height},hasTouch});page.setDefaultTimeout(120000);
  await page.goto(`${base}/dev/hud-live.html?game=warmup&manual=1&fake=0&sec=754&legend=${controller?1:0}`);
  await page.waitForFunction(()=>window.__hudLive?.ready);await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(200);
  const measure=()=>page.evaluate(()=>{
   const rect=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};};
   return {bar:rect(document.querySelector('.hud-ribbon')),compact:document.querySelector('.ride-hud').classList.contains('compact-instruments'),
    readings:[...document.querySelectorAll('.zw-reading b')].map(e=>({text:e.textContent,...rect(e),font:getComputedStyle(e).fontFamily,size:getComputedStyle(e).fontSize})),
    gears:[...document.querySelectorAll('.zw-gear-controls .pk')].map(e=>({hit:rect(e),symbol:rect(e.querySelector('b'))})),
    zone:rect(document.querySelector('.zw-bar')),tools:[...document.querySelectorAll('.hud-utilities button>b')].filter(e=>e.getBoundingClientRect().width).map(rect),
    cells:[...document.querySelectorAll('.zw-nums>div')].map(rect),nums:rect(document.querySelector('.zw-nums')),insets:window.__hudLive.info().inset};
  });
  const info=await measure();
  for(const r of [...info.cells,info.zone,...info.tools])assert(r.x>=0&&r.x+r.width<=width+.6,`${id}: content leaves viewport`);
  assert.equal(info.bar.height,info.compact?51:59,`${id}: instrument height grew`);
  const check=(m,tag)=>{
   assert(m.readings.every(r=>r.font.includes('Oxanium')),`${tag}: numeric face missing`);
   assert.equal(new Set(m.readings.map(r=>r.size)).size,1,`${tag}: mixed numeric sizes`);
   assert(Math.max(...m.readings.map(r=>r.y))-Math.min(...m.readings.map(r=>r.y))<.6,`${tag}: numeric baselines differ`);
   for(let i=0;i<m.cells.length-1;i++)assert(m.cells[i].x+m.cells[i].width<=m.cells[i+1].x+.6,`${tag}: overlapping cells`);
   assert(m.cells.at(-1).x+m.cells.at(-1).width<=m.nums.x+m.nums.width+.6,`${tag}: readings escape metric group ${JSON.stringify({cells:m.cells,nums:m.nums})}`);
   if(!m.compact){const cy=m.readings[0].y+m.readings[0].height/2;assert(Math.abs(m.zone.y+m.zone.height/2-cy)<.6,`${tag}: zone centerline differs`);for(const g of m.gears){assert(g.hit.width>=44&&g.hit.height>=44,`${tag}: gear touch target shrank`);assert(Math.abs(g.symbol.y+g.symbol.height/2-cy)<.6,`${tag}: gear symbol centerline differs`);assert(Math.abs(g.hit.y+g.hit.height/2-cy)<.6,`${tag}: gear hit target centerline differs`);}if(m.gears.length===2){const [down,up]=m.gears, value=m.readings.at(-1);const leftGap=value.x-(down.symbol.x+down.symbol.width),rightGap=up.symbol.x-(value.x+value.width);assert(leftGap>=0&&rightGap>=0&&Math.abs(leftGap-rightGap)<.6,`${tag}: gear stepper is not balanced around its value`);assert(down.hit.x+down.hit.width<=value.x&&value.x+value.width<=up.hit.x,`${tag}: gear targets overlap the readout`);}for(const t of m.tools)assert(Math.abs(t.y+t.height/2-cy)<.6,`${tag}: utility centerline differs`);}
  };
  check(info,id);
  await page.screenshot({path:`${out}/after-${id}.png`});
  await page.screenshot({path:`${out}/after-${id}-bar.png`,clip:{x:0,y:info.bar.y,width,height:height-info.bar.y}});
  // Exercise actual font widths without advancing the game simulation for hours.
  await page.evaluate(()=>{const values=['1234','199','120','1:23:45','24'];document.querySelectorAll('.zw-reading b').forEach((e,i)=>e.textContent=values[i]);});
  const long=await measure();check(long,`${id}/long`);assert.equal(long.bar.height,info.bar.height,`${id}: long values increase bar height`);
  results.push({id,width,height,controller,...info,long});console.log(`${id} passed`);await page.close();
 }
 writeFileSync(`${out}/after-measurements.json`,JSON.stringify(results,null,2));
}finally{await browser.close();}
