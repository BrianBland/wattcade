import {readFile} from 'node:fs/promises';
const root=new URL('./',import.meta.url);
export async function route(page,background){
 await page.route('**/td/environment/background.webp',r=>r.fulfill({path:background.pathname,contentType:'image/png'}));
 await page.route('**/td/environment/map-layout.json',r=>r.fulfill({path:new URL('./map-layout.json',root).pathname,contentType:'application/json'}));
 await page.route('**/dev/td-integration.ts',async r=>{
  const response=await r.fetch();let s=await response.text();
  const start=s.indexOf('function laneAt('),end=s.indexOf('const SPEC_OF',start);
  s=s.slice(0,start)+`function laneAt(li,u){
   const c=layoutJson.lanes[li].waypoints;
   const lens=c.slice(1).map((p,i)=>Math.hypot(p[0]-c[i][0],p[1]-c[i][1]));
   let distance=u*lens.reduce((a,b)=>a+b,0),i=0;
   while(i<lens.length-1 && distance>lens[i]){distance-=lens[i];i++;}
   const t=distance/lens[i],a=c[i],b=c[i+1];
   return {p:[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t],a:Math.atan2(b[1]-a[1],b[0]-a[0])};
  }\n`+s.slice(end);
  s=s.replace('X(58), Y(28)','X(33), Y(38)').replace('X(26), Y(40)','X(67), Y(43)');
  await r.fulfill({response,body:s});
 });
}
