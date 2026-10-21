import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync,readFileSync,existsSync} from 'node:fs';
import {chromium} from 'playwright-core';
const base=process.env.REVIEW_URL??'http://127.0.0.1:5212',out=process.argv[2]??'/tmp/wattcade-controller-hud';mkdirSync(out,{recursive:true});
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const results=[], errors=[];
const selected=(value,filter)=>!filter||filter.split(',').includes(value);
try {
 const page=await browser.newPage({viewport:{width:1180,height:820},hasTouch:true});page.setDefaultTimeout(120000);page.on('pageerror',e=>errors.push(e.message));
 for(const [width,height,label] of [[1180,820,'tablet'],[844,390,'short'],[390,844,'phone']].filter(([, ,label])=>selected(label,process.env.HUD_SIZES))){
  await page.setViewportSize({width,height});
  for(const game of ['warmup','towerdefense','dungeon','cadenza','watershed','starfighter','hamster','lighthouse'].filter(g=>selected(g,process.env.HUD_GAMES))){
   await page.goto(`${base}/dev/hud-live.html?game=${game}&manual=1&fake=0`,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.__hudLive?.ready);
   for(const controller of [true,false]){
    await page.evaluate(on=>window.__hudLive.legend(on),controller);await page.waitForTimeout(150);
    const info=await page.evaluate(()=>{
     const rect=el=>{const r=el.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height}};
     const hud=document.querySelector('.ride-hud');return{bar:rect(hud.querySelector('.hud')),insets:window.__hudLive.info().inset,
      controls:[...hud.querySelectorAll('button')].filter(b=>b.getBoundingClientRect().height>0).map(b=>({id:b.dataset.control??b.getAttribute('aria-label'),text:b.textContent,...rect(b),clipped:[...b.querySelectorAll('span')].some(s=>s.scrollHeight>s.clientHeight+1)})),
      statuses:[...hud.querySelectorAll('.action-indicator')].map(el=>({text:el.textContent,...rect(el),buttons:el.querySelectorAll('button').length})),
      groups:[...hud.querySelectorAll('.compact-family')].map(g=>({kind:g.className,ids:[...g.querySelectorAll('[data-control]')].map(b=>b.dataset.control)})),
      expected:(window.__hudLive.hud().controls??[]).filter(h=>h.indicator!==false&&(h.cooldown||h.indicator)).length,
      fakeInBar:!!hud.querySelector('.hud .fake-bike-help,.hud .zw-fake')};
    });
    const tag=`${label}/${game}/${controller?'controller':'touch'}`;
    assert(info.bar.height>0&&info.bar.height<height*.6,tag);assert.equal(info.fakeInBar,false,tag);
    for(const b of [...info.controls,...info.statuses])assert(b.width>0&&b.height>0&&b.x>=-.5&&b.x+b.width<=width+.5&&b.y>=-.5&&b.y+b.height<=height+.5,`${tag}: offscreen ${JSON.stringify(b)}`);
    for(const b of info.controls){assert(!b.clipped,`${tag}: clipped ${b.text}`);assert(b.width>=43.5&&b.height>=43.5,`${tag}: undersized touch target ${b.id}`);}
    if(controller){assert.equal(info.controls.filter(b=>b.id&&['up','down','left','right','a','b','y','z','Gear up','Gear down'].includes(b.id)).length,0,tag);assert.equal(info.statuses.length,info.expected,tag);assert(info.statuses.every(s=>s.buttons===0),tag);}
    else {assert.equal(info.statuses.length,0,tag);if(game==='cadenza')assert.deepEqual(info.groups.find(g=>g.kind.includes('face'))?.ids,['z','a']);}
    for(const g of info.groups){if(g.kind.includes('face'))assert(g.ids.every(id=>['a','b','y','z'].includes(id)),tag);if(g.kind.includes('dpad'))assert(g.ids.every(id=>['left','right','up','down'].includes(id)),tag);}
    // Portrait touch must not regress into separate Move and action rows.
    if(label==='phone'&&!controller&&['warmup','towerdefense'].includes(game))assert(info.insets.bottom<=160,`${tag}: HUD exceeds 160px portrait budget`);
    const occupied=info.insets.occlusions??[];assert(occupied.length>0,tag);assert(Math.abs(info.insets.bottom-Math.max(...occupied.map(r=>height-r.y)))<1,`${tag}: inset misses floating actions`);
    results.push({game,label,controller,...info});writeFileSync(`${out}/checks.json`,JSON.stringify({results,errors},null,2));
    if(controller&&label==='tablet'){
     const top=Math.max(0,Math.floor(Math.min(...occupied.map(r=>r.y)))-6);await page.screenshot({path:`${out}/${game}.png`,clip:{x:0,y:top,width,height:height-top}});
     if(game==='towerdefense')await page.screenshot({path:`${out}/game.png`});
    }
    if(!controller&&game==='towerdefense'&&label==='tablet'){
     const top=Math.max(0,Math.floor(Math.min(...occupied.map(r=>r.y)))-6);await page.screenshot({path:`${out}/touch.png`,clip:{x:0,y:top,width,height:height-top}});
    }
    if(controller&&game==='cadenza'&&label==='short')await page.screenshot({path:`${out}/cadenza-short.png`});
    if(!controller&&game==='towerdefense'&&label==='phone'){
     await page.evaluate(()=>{const hud=window.__hudLive.hud();window.__hudLive.fixture({...hud,controls:hud.controls.map(h=>h.button==='a'?{...h,label:'Upgrade Tesla Coil to Lv 24 · 9,999 scrap'}:h)});});await page.waitForTimeout(200);
     assert.equal(await page.locator('[data-control="a"] span').evaluate(s=>s.scrollHeight>s.clientHeight+1),false,'long quote clips');await page.screenshot({path:`${out}/long-price-phone.png`});
    }
    console.log(tag+' passed');
   }
   await page.evaluate(()=>window.__hudLive.dispose());
  }
 }
 assert.deepEqual(errors,[]);
 // An idle standard gamepad changes Auto without needing a button press.
 await page.addInitScript(()=>{window.__pads=[];Object.defineProperty(navigator,'getGamepads',{value:()=>window.__pads,configurable:true});});
 await page.goto(`${base}/dev/hud-live.html?game=towerdefense&manual=1&layout=auto`,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.__hudLive?.ready);
 assert.equal(await page.locator('.floating-controls').count(),1);
 await page.evaluate(()=>window.__pads=[{connected:true,buttons:[],axes:[]}]);await page.waitForSelector('.action-indicators');assert.equal(await page.locator('.floating-controls').count(),0);
 await page.evaluate(()=>window.__pads=[]);await page.waitForSelector('.floating-controls');assert.equal(await page.locator('.action-indicators').count(),0);
 await page.evaluate(()=>window.__hudLive.legend(true));await page.waitForTimeout(150);
 const before=await page.locator('.hud').evaluate(e=>e.getBoundingClientRect().height);await page.getByRole('button',{name:'Recent effort history',exact:true}).click();assert.equal(await page.locator('.hud').evaluate(e=>e.getBoundingClientRect().height),before);await page.getByRole('button',{name:'Close HUD panel'}).click();
 await page.getByRole('button',{name:'Controller guide',exact:true}).click();assert.equal(await page.locator('.hud-guide .fake-bike-help').count(),1);assert.equal(await page.locator('.hud .fake-bike-help').count(),0);await page.keyboard.press('Escape');
 assert.deepEqual(errors,[]);writeFileSync(`${out}/checks.json`,JSON.stringify({results,errors,autoConnectDisconnect:true,optionalHistory:true,guide:true},null,2));console.log(JSON.stringify({views:results.length,errors,out}));
}finally{await browser.close()}
