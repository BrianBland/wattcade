import {readFile} from 'node:fs/promises';
export async function route(page,background){
 await page.route('**/td/environment/background.webp',r=>r.fulfill({path:background.pathname,contentType:'image/png'}));
 await page.route('**/td/environment/map-layout.json',r=>r.fulfill({path:new URL('./map-layout.json',import.meta.url).pathname,contentType:'application/json'}));
 await page.route('**/td-cable-texture.png',r=>r.fulfill({path:new URL('./cable-texture.png',import.meta.url).pathname,contentType:'image/png'}));
 await page.route('**/dev/td-integration.ts',async r=>{
  const response=await r.fetch();let s=await response.text();
  const a=s.indexOf('const c = anchor('),b=s.indexOf('g.stroke();',a);
  if(a<0||b<0)throw new Error('Could not locate placeholder cable drawing');
  s=s.slice(0,a)+s.slice(b+11);
  const helper=await readFile(new URL('./cables.js',import.meta.url),'utf8');
  s=s.replace('function draw(t) {',helper+'\nfunction draw(t) {');
  s=s.replace('const op = layoutJson.outpost,','drawRichCables(g,t);\nconst op = layoutJson.outpost,');
  await r.fulfill({response,body:s});
 });
}
