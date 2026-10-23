import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';
const out=process.argv[2]??'docs/visual-polish/wardrobe/implemented';
const url=process.env.REVIEW_URL??'http://127.0.0.1:5199';
mkdirSync(out,{recursive:true});
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox','--enable-unsafe-swiftshader']});
try{
 const page=await browser.newPage({viewport:{width:1536,height:1100},deviceScaleFactor:1});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 for(const slot of (process.argv.includes('--ui-only')?[]:['featured','bottoms','jersey','hands','feet','eyewear','back'])){
  await page.goto(`${url}/dev/wardrobe-catalog.html?slot=${slot}`);await page.waitForFunction(()=>window.__catalogReady);
  await page.locator('#board').screenshot({path:`${out}/${slot}.png`});
 }
 if(process.argv.includes('--ui-only')){await page.goto(`${url}/dev/wardrobe-catalog.html`);await page.waitForFunction(()=>window.__catalogReady);}
 const checks=await page.evaluate(async()=>{
  const {ITEMS,itemKey,item}=await import('/src/cosmetics/catalog.ts');
  const {riderLook,withItem,isUnlocked}=await import('/src/cosmetics/unlocks.ts');
  const {drawRider}=await import('/src/cosmetics/draw/rider.ts');
  const {drawCosmeticItem}=await import('/src/cosmetics/draw/items.ts');
  const {BIKES}=await import('/src/cosmetics/draw/bikes.ts');
  const base=riderLook({level:1,achievements:[],color:'#25aab2'});
  const c=document.createElement('canvas');c.width=600;c.height=400;const g=c.getContext('2d',{willReadFrequently:true});
  function pixels(look,crank=.18){g.setTransform(1,0,0,1,0,0);g.clearRect(0,0,600,400);g.translate(400,330);g.scale(5,5);drawRider(g,look,crank,7.2,{t:1.2,speed:6});return g.getImageData(0,0,600,400).data;}
  function diff(a,b){let n=0;for(let i=0;i<a.length;i+=4)if(a[i]!==b[i]||a[i+1]!==b[i+1]||a[i+2]!==b[i+2]||a[i+3]!==b[i+3])n++;return n;}
  pixels(base);const plain=pixels(base);if(diff(plain,pixels(base)))throw new Error('Unstable baseline');
  const wearable=ITEMS.filter(i=>i.id.startsWith('w_')&&'look'in i),proof=[];
  for(const it of wearable){
   const changed=diff(plain,pixels(withItem(base,it)));if(!changed)throw new Error(`Invisible worn item ${itemKey(it)}`);
   g.setTransform(1,0,0,1,0,0);g.clearRect(0,0,600,400);g.translate(300,250);g.scale(8,8);drawCosmeticItem(g,it,withItem(base,it),1.2);
   const data=g.getImageData(0,0,600,400).data;let ink=0;for(let k=3;k<data.length;k+=4)if(data[k])ink++;
   if(!ink)throw new Error(`Empty shelf art ${itemKey(it)}`);proof.push({name:it.name,slot:it.slot,wornPixels:changed,iconPixels:ink});
  }
  let poses=0;
  for(const bike of Object.keys(BIKES))for(const phase of [0,.25,.5,.75])for(const bottoms of ['Tutu','Censored blocks','Disco flares']){
   let look={...base,bike};for(const name of [bottoms,'Spiked punk gloves','Winged boots','Space Bubble','Dyson array'])look=withItem(look,ITEMS.find(i=>i.name===name));pixels(look,phase);poses++;
  }
  const {ORIGINAL_ITEMS}=await import('/src/cosmetics/legacyCatalog.ts');
  const removed=ORIGINAL_ITEMS.filter(it=>it.slot!=='ship'&&!item(it.slot,it.id));
  const old={level:150,achievements:ORIGINAL_ITEMS.flatMap(it=>'achievement'in it.source?[it.source.achievement]:[]),cosmetics:{rotation:1,legacy:removed.map(itemKey)}};
  for(const it of removed)if(isUnlocked(old,it))throw new Error(`Retired item still unlocked: ${itemKey(it)}`);
  return {activeItems:ITEMS.length,removedItems:removed.length,wearableDesigns:proof.length,poses,proof};
 });
 writeFileSync(`${out}/render-checks.json`,JSON.stringify(checks,null,2)+'\n');
 // Exercise the actual Locker, not a mock of its controls.
 for(const [width,height,label]of [[1200,850,'desktop'],[390,844,'phone']]){
  await page.setViewportSize({width,height});await page.goto(`${url}/dev/cosmetic-review.html?mode=wardrobe-locker`);await page.waitForFunction(()=>window.__reviewReady);
  await page.getByRole('button',{name:'Rider',exact:true}).click();await page.getByRole('button',{name:'Bottoms',exact:true}).click();
  if(!await page.getByRole('button',{name:'Tutu, unlocked',exact:true}).count()){
    await page.screenshot({path:`${out}/locker-debug.png`});
    throw new Error('Missing tutu: '+JSON.stringify(await page.locator('.item-tile').evaluateAll(els=>els.map(e=>e.getAttribute('aria-label'))))+' errors: '+errors.join(';'));
  }
  await page.getByRole('button',{name:'Tutu, unlocked',exact:true}).click();await page.getByRole('button',{name:'Tutu, equipped',exact:true}).waitFor();
  await page.screenshot({path:`${out}/locker-${label}.png`});
  if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw new Error(`Locker overflows ${label}`);
  if(await page.getByRole('button',{name:/legacy/i}).count())throw new Error('Legacy collection is still accessible');
  await page.getByRole('button',{name:'Helmets & hats',exact:true}).click();
  if(await page.getByRole('button',{name:/^Beanie,/}).count())throw new Error('Retired headwear still appears');
 }
 await page.setViewportSize({width:1200,height:850});
 await page.goto(`${url}/dev/cadenza.html?menu=1&ships=1&speed=0&inset=140&manual=1`);
 await page.waitForFunction(()=>window.__cadenzaReady);
 await page.locator('.ws-row[data-i="4"]').click();await page.waitForFunction(()=>document.querySelector('.ws-row[data-i="4"]')?.textContent.includes('Lancer'));
 await page.screenshot({path:`${out}/cadenza-ships.png`});
 const bounds=await page.locator('.ws-menu').boundingBox();if(bounds.y+bounds.height>710.5)throw new Error('Ship menu overlaps HUD');
 await page.goto(`${url}/dev/cadenza.html?menu=1&speed=0&inset=140&manual=1`);await page.waitForFunction(()=>window.__cadenzaReady);
 await page.locator('.ws-row[data-i="4"]').click();await page.waitForTimeout(100);
 if(!(await page.locator('.ws-row[data-i="4"]').textContent()).includes('Triad'))throw new Error('Locked ship selected');
 await page.screenshot({path:`${out}/cadenza-locked.png`});
 if(errors.length)throw new Error(errors.join('\n'));
 console.log(JSON.stringify({activeItems:checks.activeItems,removedItems:checks.removedItems,wearableDesigns:checks.wearableDesigns,poses:checks.poses,locker:'desktop/phone/tutu/current-only',ships:'unlocked/locked/insets'}));
}finally{await browser.close();}
