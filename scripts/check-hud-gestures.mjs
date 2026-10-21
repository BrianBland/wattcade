import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {chromium} from 'playwright-core';
const base=process.env.REVIEW_URL??'http://127.0.0.1:5212',out=process.argv[2]??'/tmp/hud-gestures';mkdirSync(out,{recursive:true});
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try {
 const page=await browser.newPage({viewport:{width:390,height:844},hasTouch:true}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{window.__pads=[];Object.defineProperty(navigator,'getGamepads',{value:()=>window.__pads,configurable:true});});
 await page.goto(`${base}/dev/hud-live.html?game=warmup&manual=1&fake=0&layout=auto`);await page.waitForFunction(()=>window.__hudLive?.ready);
 assert.equal(await page.locator('.controller-navigation').count(),0);assert.equal(await page.locator('.floating-controls').count(),0);
 await page.screenshot({path:`${out}/overworld-touch.png`});
 await page.evaluate(()=>window.__pads=[{connected:true,buttons:[],axes:[]}]);await page.waitForSelector('.controller-navigation');await page.waitForTimeout(150);
 assert.match(await page.locator('.controller-navigation').textContent(),/ASelect.*BBack/);assert.equal(await page.locator('.controller-navigation button').count(),0);
 const guide=await page.locator('.controller-navigation').boundingBox();assert(guide.x>=0&&guide.x+guide.width<=390&&guide.y>=0);
 const controllerHeight=await page.evaluate(()=>window.__hudLive.info().inset.bottom);await page.screenshot({path:`${out}/overworld-controller.png`});
 await page.evaluate(()=>window.__pads=[]);await page.waitForSelector('.controller-navigation',{state:'detached'});await page.waitForTimeout(150);
 const touchHeight=await page.evaluate(()=>window.__hudLive.info().inset.bottom);assert(touchHeight<controllerHeight);
 await page.goto(`${base}/dev/hud-live.html?game=hamster&manual=1&legend=0&fake=0&shop=1`);await page.waitForFunction(()=>window.__hudLive?.ready);
 assert.equal(await page.locator('.floating-controls [data-control="up"],.floating-controls [data-control="down"]').count(),0);
 assert.equal(await page.locator('.floating-controls button>b').count(),0);
 // An unlocked shop contains enough rows to scroll. Tap, scroll, and cancellation use real canvas events.
 const cdp=await page.context().newCDPSession(page);
 const initial=await page.evaluate(()=>{const r=window.__hudLive.renderer(),s=window.__hudLive.snapshot();return{box:r.listRect,scroll:r.scroll,max:r.maxScroll,buySeq:s.buySeq}});
 const x=initial.box.x+50,y=initial.box.y+initial.box.h-30;
 await page.mouse.move(x,y);await page.mouse.wheel(0,-10000);await page.waitForTimeout(100);await page.evaluate(()=>window.__hudLive.advance(0));
 initial.scroll=await page.evaluate(()=>window.__hudLive.renderer().scroll);assert.equal(initial.scroll,0);assert(initial.max>0,'shop fixture has no overflow');
 await page.screenshot({path:`${out}/shop-before.png`});
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:11,x,y}]});
 await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{id:11,x,y:y-120}]});
 await page.evaluate(()=>window.__hudLive.advance(0));
 const moved=await page.evaluate(()=>window.__hudLive.renderer().scroll);assert(moved>Math.min(40,initial.max/2),'swipe did not scroll list');
 await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 await page.evaluate(()=>window.__hudLive.advance(.05));assert.equal(await page.evaluate(()=>window.__hudLive.snapshot().buySeq),initial.buySeq,'swipe purchased a row');
 await page.screenshot({path:`${out}/shop-after.png`});
 await page.mouse.move(x,y);await page.mouse.wheel(0,10000);await page.waitForTimeout(100);await page.evaluate(()=>window.__hudLive.advance(0));
 const bottom=await page.evaluate(()=>{const r=window.__hudLive.renderer();return{scroll:r.scroll,max:r.maxScroll}});assert.equal(bottom.scroll,bottom.max,'wheel misses final row');
 await page.mouse.wheel(0,-10000);await page.waitForTimeout(100);await page.evaluate(()=>window.__hudLive.advance(0));assert.equal(await page.evaluate(()=>window.__hudLive.renderer().scroll),0);
 // Controller row navigation resumes automatic centering after a manual swipe.
 const oldRow=await page.evaluate(()=>window.__hudLive.snapshot().row);await page.keyboard.down('ArrowUp');await page.evaluate(()=>window.__hudLive.advance(.05));await page.keyboard.up('ArrowUp');
 assert.equal(await page.evaluate(()=>window.__hudLive.renderer().manualScroll),false);assert((await page.evaluate(()=>window.__hudLive.snapshot().row))<oldRow);
 // A normal tap still purchases; cancellation never dispatches a tap.
 await page.goto(`${base}/dev/hud-live.html?game=hamster&manual=1&legend=0&fake=0`);await page.waitForFunction(()=>window.__hudLive?.ready);
 const row=await page.evaluate(()=>window.__hudLive.renderer().rowRects[0]);const cx=row.x+40,cy=row.y+20;
 const buySeq=await page.evaluate(()=>window.__hudLive.snapshot().buySeq);
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:14,x:cx,y:cy}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});
 await page.evaluate(()=>window.__hudLive.advance(.05));assert.equal(await page.evaluate(()=>window.__hudLive.snapshot().buySeq),buySeq);
 await page.mouse.click(cx,cy);await page.evaluate(()=>window.__hudLive.advance(.05));assert.equal(await page.evaluate(()=>window.__hudLive.snapshot().buySeq),buySeq+1);
 await page.screenshot({path:`${out}/hamster-touch.png`});
 await page.goto(`${base}/dev/hud-live.html?game=towerdefense&manual=1&legend=0&fake=0`);await page.waitForFunction(()=>window.__hudLive?.ready);
 assert.equal(await page.locator('.floating-controls button>b').count(),0);await page.screenshot({path:`${out}/towerdefense-touch.png`});
 assert.deepEqual(errors,[]);writeFileSync(`${out}/checks.json`,JSON.stringify({errors,controllerHeight,touchHeight,swipe:true,wheel:true,noPurchaseOnDrag:true,cancel:true,tapPurchase:true,liveAttachDetach:true,touchLabels:true},null,2));console.log('Native gesture, touch-label and controller-guide checks passed');
}finally{await browser.close()}
