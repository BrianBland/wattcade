import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {chromium} from 'playwright-core';
const base=process.env.REVIEW_URL??'http://127.0.0.1:5212',out=process.argv[2]??'/tmp/wattcade-hud-flow';mkdirSync(out,{recursive:true});
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']}),results=[];
async function hudTool(page,name){const button=page.getByRole('button',{name,exact:true});if(!await button.isVisible())await page.getByRole('button',{name:'Ride tools',exact:true}).click();await button.click();}
try{
 for(const [game,width,height,label] of [['towerdefense',1180,820,'desktop'],['dungeon',1180,820,'desktop'],['towerdefense',390,844,'phone']]){
  const page=await browser.newPage({viewport:{width,height}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{window.__pads=[{connected:true,buttons:[],axes:[]}];Object.defineProperty(navigator,'getGamepads',{value:()=>window.__pads});localStorage.setItem('wattcade.hudLayout','auto');});
  await page.goto(`${base}/dev/hud-flow.html?game=${game}`);await page.waitForFunction(()=>window.__hudFlow?.session()&&!document.querySelector('.game-loading'));
  if(game==='dungeon'){assert.equal(await page.locator('.controls-card').count(),0);await page.keyboard.press('k');}
  await page.locator('.controls-card').waitFor();await page.waitForTimeout(150);
  const initial=await page.locator('.controls-card').evaluate(el=>{const b=el.querySelector('.intro-actions .primary').getBoundingClientRect();return{scroll:el.scrollTop,scrollHeight:el.scrollHeight,height:el.clientHeight,buttonTop:b.top,buttonBottom:b.bottom}});
  assert.equal(initial.scroll,0,'initial focus skips the guide');assert(initial.buttonTop>=0&&initial.buttonBottom<=height,`start action hidden: ${JSON.stringify(initial)}`);
  assert.equal(await page.locator('.action-indicators').count(),0);
  const bindings=await page.locator('.legend-binding').allTextContents();assert(bindings.some(b=>b.includes(game==='dungeon'?'Strike':'Overcharge')),'shows gameplay mappings after selection');
  await page.screenshot({path:`${out}/${game}-${label}-intro.png`});
  if(label==='phone'){await page.keyboard.press('ArrowDown');await page.waitForFunction(()=>document.querySelector('.controls-card').scrollTop>0);await page.getByRole('button',{name:'Start ride',exact:false}).click();}
  else await page.keyboard.press('l');
  await page.waitForSelector('.intro-count');await page.waitForSelector('.intro-count',{state:'hidden'});await page.waitForSelector('.action-indicators');
  assert.equal(await page.locator('.floating-controls').count(),0,'idle controller lost after keyboard start');
  await hudTool(page,'Controller guide');await page.locator('.controls-card').waitFor();
  if(game==='dungeon')await page.keyboard.press('k');else await page.keyboard.press('Escape');
  await page.locator('.modal.pause').waitFor();assert.equal(await page.getByRole('button',{name:'Finish ride',exact:true}).count(),1);
  assert.equal(await page.getByRole('button',{name:'Return to Garage',exact:false}).count(),game==='towerdefense'?1:0);
  await page.getByRole('button',{name:'Resume',exact:false}).click();await page.waitForSelector('.modal.pause',{state:'hidden'});
  await page.evaluate(()=>window.__pads=[]);await page.waitForSelector('.floating-controls');
  await page.evaluate(()=>window.__pads=[{connected:true,buttons:[],axes:[]}]);await page.waitForSelector('.action-indicators');
  await hudTool(page,'Open game menu');await page.locator('.modal.pause').waitFor();
  await page.locator('.field').filter({hasText:'Control layout'}).getByRole('button',{name:'›',exact:true}).click();
  assert.equal(await page.evaluate(()=>localStorage.getItem('wattcade.hudLayout')),'touch');await page.getByRole('button',{name:'Resume',exact:false}).click();await page.waitForSelector('.floating-controls');assert.equal(await page.locator('.action-indicators').count(),0,'manual touch override lost');
  assert.deepEqual(errors,[]);results.push({game,label,bindings,initial,errors,loadoutGuide:true,pauseHelp:true,autoFallback:true,touchOverride:true});writeFileSync(`${out}/checks.json`,JSON.stringify(results,null,2));await page.close();console.log(game+'/'+label+' flow passed');
 }
}finally{await browser.close()}
