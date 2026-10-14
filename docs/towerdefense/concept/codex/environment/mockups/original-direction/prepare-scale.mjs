import {createRequire} from 'node:module';
import {writeFile} from 'node:fs/promises';
const {chromium}=createRequire(new URL('../../../../../../../package.json',import.meta.url))('playwright-core');
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
try {
 const page=await browser.newPage({viewport:{width:1536,height:1040},deviceScaleFactor:2});
 await page.route('**/td/environment/background.webp',r=>r.fulfill({path:new URL('../../map-layout-guide.png',import.meta.url).pathname,contentType:'image/png'}));
 await page.goto('http://127.0.0.1:5174/dev/td-integration.html?w=1536&h=1040&panels=0&alien=1.25&bluetint=0&rim=0');
 await page.waitForFunction(()=>window.__ready);
 const data=await page.evaluate(async()=>{
  const c=document.createElement('canvas');c.width=1536;c.height=1024;const g=c.getContext('2d');
  const bg=new Image();bg.src='/td/environment/background-guide.png';await bg.decode();g.drawImage(bg,0,0);
  g.drawImage(document.getElementById('c'),0,0,3072,1840,0,22,1536,920);
  return c.toDataURL('image/png').split(',')[1];
 });
 await writeFile(new URL('./scale-guide-with-real-rigs.png',import.meta.url),Buffer.from(data,'base64'));
} finally {await browser.close();}
