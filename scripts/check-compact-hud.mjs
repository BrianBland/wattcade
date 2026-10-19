import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync,readFileSync,existsSync} from 'node:fs';
import {chromium} from 'playwright-core';
const base=process.env.REVIEW_URL??'http://127.0.0.1:5211',out=process.argv[2]??'/tmp/wattcade-compact-hud';mkdirSync(out,{recursive:true});
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
const results=[];
try {
 const page=await browser.newPage({viewport:{width:1180,height:820}}),errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error('PAGE ERROR',e.stack);});
 for(const [width,height,label] of [[1180,820,'tablet'],[844,390,'short'],[390,844,'phone']].filter(([, ,label])=>!process.env.HUD_SIZES||process.env.HUD_SIZES.split(',').includes(label))){
  await page.setViewportSize({width,height});
  for(const game of ['warmup','towerdefense','dungeon','cadenza','watershed','starfighter','hamster','lighthouse'].filter(id=>!process.env.HUD_GAMES||process.env.HUD_GAMES.split(',').includes(id))){
   console.log(`${label}/${game}`);
   await page.goto(`${base}/dev/hud-live.html?game=${game}&manual=1&fake=1`);await page.waitForFunction(()=>window.__hudLive?.ready);await page.waitForSelector('.hud-ribbon',{state:'attached'}).catch(async e=>{console.error(await page.evaluate(()=>({html:document.querySelector('#hud')?.outerHTML,game:window.__hudLive?.hud(),info:window.__hudLive?.info()})));throw e;});await page.waitForTimeout(200);
   const info=await page.evaluate(()=>{
    const el=document.querySelector('.hud'),rect=el.getBoundingClientRect();
    return {game: new URLSearchParams(location.search).get('game'),hudHeight:rect.height,viewport:[innerWidth,innerHeight],fakeInBand:!!el.querySelector('.fake-bike-help,.zw-fake'),
     groups:[...el.querySelectorAll('.compact-family')].map(g=>({kind:g.className,ids:[...g.querySelectorAll('[data-control]')].map(b=>b.dataset.control)})),
     controls:[...el.querySelectorAll('button')].map(b=>{const r=b.getBoundingClientRect();return {id:b.dataset.control??b.getAttribute('aria-label'),text:b.textContent,x:r.x,y:r.y,width:r.width,height:r.height,textOverflow:[...b.querySelectorAll('span')].some(s=>s.scrollHeight>s.clientHeight+1)}})};
   });
   assert.ok(info.hudHeight>0&&info.hudHeight<height*.8,`${label}/${game}: invalid HUD height ${info.hudHeight}`);
   assert.equal(info.fakeInBand,false);
   for(const b of info.controls){assert(b.width>0&&b.height>0&&b.x>=-.5&&b.x+b.width<=width+.5&&b.y>=rectTop(info)-.5&&b.y+b.height<=height+.5,`${label}/${game}: out of HUD ${JSON.stringify(b)}`);assert(!b.textOverflow,`${label}/${game}: clipped text ${b.text}`);}
   for(const g of info.groups){if(g.kind.includes('face'))assert(g.ids.every(id=>['a','b','y','z'].includes(id)));if(g.kind.includes('dpad'))assert(g.ids.every(id=>['left','right','up','down'].includes(id)));}
   if(game==='cadenza')assert.deepEqual(info.groups.find(g=>g.kind.includes('face'))?.ids,['z','a']);
   results.push({...info,label});
   await page.screenshot({path:`${out}/${game}-${label}.png`});
   await page.locator('.hud-ribbon').screenshot({path:`${out}/${game}-${label}-strip.png`});
   if(game==='towerdefense'&&label==='tablet'){
    const before=info.hudHeight;await page.getByRole('button',{name:'Controller guide',exact:true}).click();assert.equal(await page.locator('.hud-guide .fake-bike-help').count(),1);assert.equal(await page.locator('.hud-ribbon .fake-bike-help').count(),0);
    assert.equal(await page.locator('.hud-ribbon').evaluate(e=>e.getBoundingClientRect().height),before);await page.screenshot({path:`${out}/controller-guide.png`});await page.keyboard.press('Escape');assert.equal(await page.locator('.hud-peek').count(),0);
    await page.evaluate(()=>window.__hudLive.legend(false));await page.waitForTimeout(200);const ids=await page.locator('.hud-actions [data-control]').evaluateAll(es=>es.map(e=>e.dataset.control));assert.deepEqual(ids.filter(id=>['a','b','y','z'].includes(id)),['a','b','y','z']);await page.screenshot({path:`${out}/touch-tablet.png`});
   }
   await page.evaluate(()=>window.__hudLive.dispose());
  }
 }
 assert.deepEqual(errors,[]);const file=`${out}/checks.json`;const prior=existsSync(file)?JSON.parse(readFileSync(file,'utf8')):[];const merged=prior.filter(r=>!results.some(n=>n.game===r.game&&n.label===r.label)).concat(results);writeFileSync(file,JSON.stringify(merged,null,2));console.log(JSON.stringify({views:results.length,errors,out}));
}finally{await browser.close()}
function rectTop(info){return info.viewport[1]-info.hudHeight;}
