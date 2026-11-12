import {mkdir,writeFile,readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
const out='docs/visual-polish/arcade-refinements';
const after=process.env.UI_AFTER_URL??'http://127.0.0.1:5178';
const before=process.env.UI_BEFORE_URL??'http://127.0.0.1:5180';
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH??'/usr/bin/chromium',args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const checks=JSON.parse(await readFile(`${out}/capture-checks.json`,'utf8').catch(()=>'{"checks":[]}')).checks;
try {
 for(const [version,base] of [['after',after],['before',before]].filter(([v])=>!process.env.UI_CAPTURE_VERSION||v===process.env.UI_CAPTURE_VERSION)) {
  await mkdir(`${out}/${version}`,{recursive:true});
  for(const [width,height] of [[390,844],[1180,820]]) {
   const page=await browser.newPage({viewport:{width,height},reducedMotion:'reduce'});
   const errors=[];page.on('pageerror',e=>errors.push(e.message));
   for(const view of (process.env.UI_CAPTURE_VIEWS??'pause,connect,riders,arcade,controls,locker,reward').split(',')) {
    const cosmetic=['locker','reward'].includes(view);
    const path=cosmetic?`/dev/cosmetic-review.html?mode=${view==='reward'?'pick':'locker'}`:`/dev/chrome-review.html?game=warmup&manual=1&fake=0&legend=0&view=${view}`;
    await page.goto(base+path);
    await page.waitForFunction(c=>c?window.__reviewReady:window.__chromeReview?.ready&&window.__hudLive?.ready,cosmetic);
    await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(250);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${version} ${view} ${width}: overflow`);
    if(version==='after'&&view==='pause') {
     const bs=await page.locator('.pause-ride-actions button').evaluateAll(bs=>bs.map(b=>{const r=b.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height}}));
     assert.equal(bs.length,2);assert.equal(bs[0].y,bs[1].y);assert.equal(bs[0].w,bs[1].w);assert.ok(bs.every(b=>b.h>=44&&b.x+b.w<=width));
     const controls=await page.locator('.fields .ui-stepper,.fields .ui-choice').evaluateAll(es=>es.map(e=>{const r=e.getBoundingClientRect();return {x:r.x,w:r.width,left:e.firstElementChild.getBoundingClientRect().width,right:e.lastElementChild.getBoundingClientRect().width}}));
     assert.equal(controls[0].x,controls[1].x);assert.equal(controls[0].w,controls[1].w);assert.ok(controls.every(c=>c.left===44&&c.right===44));
    }
    if(version==='after'&&view==='riders'){
     const r=await page.locator('.rider-portrait .rider-av').boundingBox();assert.equal(r.width,r.height);assert.ok(r.width<=220);
    }
    if(version==='after'&&view==='connect')assert.ok(await page.locator('[data-connection=disconnected] .device-state').first().innerText().then(t=>t.includes('Not connected')));
    await page.screenshot({path:`${out}/${version}/${view}-${width}.png`});
    const label=`${version}: ${view} ${width}×${height}`;if(!checks.includes(label))checks.push(label);console.log(label);
   }
   assert.deepEqual(errors,[]);await page.close();
  }
 }
 await writeFile(`${out}/capture-checks.json`,JSON.stringify({checks},null,2)+'\n');
}finally{await browser.close()}
