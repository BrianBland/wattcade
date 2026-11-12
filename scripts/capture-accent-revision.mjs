import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright-core';
const out='docs/visual-polish/accent-revision';await mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
const checks=[],errors=[];
try{
 for(const [width,height] of [[390,844],[1180,820]])for(const view of ['locker','reward']){
  const page=await browser.newPage({viewport:{width,height},hasTouch:true,reducedMotion:'reduce'});page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`${process.env.CHROME_REVIEW_URL??'http://127.0.0.1:5178'}/dev/accent-revision.html?view=${view}&accent=previous`);
  await page.waitForFunction(()=>window.__accentReady);
  await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(400);
  // The locker scrolls internally on desktop; its clipped lazy thumbnails
  // deliberately remain unpainted. Check the opening row and hero artwork.
  await page.waitForFunction(()=>[...document.querySelectorAll('.rider-av canvas')].slice(0,4).every(c=>c.width>1));
  // Freeze the shared artwork for a like-for-like palette comparison.
  await page.evaluate(()=>{window.requestAnimationFrame=()=>0});await page.waitForTimeout(100);
  const geometry=()=>page.locator('button').evaluateAll(bs=>bs.map(b=>{const r=b.getBoundingClientRect();return [r.x,r.y,r.width,r.height]}));
  const before=await geometry();
  await page.screenshot({path:`${out}/${view}-${width}-previous.png`});
  await page.evaluate(()=>document.documentElement.dataset.accent='revised');
  await page.screenshot({path:`${out}/${view}-${width}-revised.png`});
  assert.deepEqual(await geometry(),before,'selection color must not move controls');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  const selected=page.locator(view==='locker'?'.item-tile.on':'.pick-card.selected');
  assert.equal(await selected.evaluate(e=>getComputedStyle(e).borderTopColor),'rgb(239, 202, 112)');
  if(view==='locker'){
   assert.equal(await page.locator('.tabs .on').first().evaluate(e=>getComputedStyle(e).borderBottomColor),'rgb(239, 202, 112)');
   assert.equal(await page.locator('.item-tile.on .item-status').evaluate(e=>getComputedStyle(e).color),'rgb(102, 230, 184)');
  }
  const small=await page.locator('button:not(:disabled)').evaluateAll(bs=>bs.filter(b=>{const r=b.getBoundingClientRect();return r.width>0&&(r.width<44||r.height<44)}).map(b=>b.textContent));
  assert.deepEqual(small,[]);
  checks.push(`${view} ${width}×${height}: gold selection, unchanged geometry, 44px targets, no overflow`);console.log(checks.at(-1));await page.close();
 }
 assert.deepEqual(errors,[]);await writeFile(`${out}/checks.json`,JSON.stringify({checks,errors},null,2)+'\n');
}finally{await browser.close()}
