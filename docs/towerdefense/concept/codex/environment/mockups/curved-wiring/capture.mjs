import {route} from './route.mjs';
import {createRequire} from 'node:module';
import {writeFile,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const {chromium}=createRequire(new URL('../../../../../../../package.json',import.meta.url))('playwright-core');
const art=new URL('../original-direction/background-raw.png',import.meta.url);
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
try {
 const page=await browser.newPage({viewport:{width:1366,height:1024},deviceScaleFactor:2});
 const errors=[];page.on('pageerror',e=>errors.push(String(e)));
 await route(page,art);
 const screenshots=[];
 for(const [name,params] of [['real-sprites','panels=0&alien=1.25&bluetint=0&rim=0'],['readability-aids','panels=0&alien=1.25&bluetint=0.5&rim=0.45']]){
  const url='http://127.0.0.1:5174/dev/td-integration.html?'+params;
  await page.goto(url);await page.waitForFunction(()=>window.__ready);
  await page.screenshot({path:new URL('./'+name+'.png',import.meta.url).pathname});
  screenshots.push({name,url,viewport:[1366,1024],deviceScaleFactor:2,pixels:[2732,2048]});
 }
 const cableRoutes=await page.evaluate(()=>window.__cableReport);
 const provenance={screenshots,errors,cableRoutes,sourceSHA256:createHash('sha256').update(await readFile(art)).digest('hex'),
  sprites:'Actual unchanged tower/outpost exports and all8 animated alien rigs from towerdefense-concept-art integration page',
  geometry:'Restored preceding curved map. Original cubic controls and tower positions unchanged. Six actual socket anchors and curved textured wiring.',
  status:'Direction mockup; production/PR not updated'};
 await writeFile(new URL('./capture.json',import.meta.url),JSON.stringify(provenance,null,2)+'\n');
 if(errors.length)throw new Error(errors.join('\n'));
 console.log('Two 2732×2048 real-puppet mockups captured; no browser errors');
}finally{await browser.close();}
