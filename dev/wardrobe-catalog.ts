import { ITEMS, itemKey } from '../src/cosmetics/catalog';
import { riderLook, withItem } from '../src/cosmetics/unlocks';
import { drawRider } from '../src/cosmetics/draw/rider';
import { drawCosmeticItem, itemBox } from '../src/cosmetics/draw/items';
import { ACHIEVEMENTS } from '../src/progression/achievements';
import type { Item, RiderLook } from '../src/cosmetics/types';

const params=new URLSearchParams(location.search);
let section=params.get('slot')??'featured',playing=false,time=1.2,seed=42;
const sections=['featured','bottoms','jersey','hands','feet','eyewear','back'];
const names:Record<string,string>={featured:'Highlights',bottoms:'Bottoms',jersey:'Tops',hands:'Hands',feet:'Feet',eyewear:'Eyewear',back:'Back'};
const featured=['Tutu','Censored blocks','Striped bikini top','Spiked punk gloves','Welding goggles','Dyson array','Sequin crop top','Duck slippers','Bread basket','Aurora tights','Lobster claws','Twin rocket pack'];
const base=riderLook({level:1,achievements:[],color:'#25aab2'});
const canvas=document.querySelector<HTMLCanvasElement>('#board')!,g=canvas.getContext('2d')!;
const tabs=document.querySelector('#tabs')!;
for(const key of sections){const b=document.createElement('button');b.textContent=names[key];b.dataset.section=key;b.addEventListener('click',()=>{section=key;draw(time);});tabs.append(b);}
function selectedItems(){return section==='featured'?featured.map(n=>ITEMS.find(i=>i.name===n)!):ITEMS.filter(i=>i.slot===section&&(!('default'in i.source))&&(section!=='jersey'||i.id.startsWith('w_')));}
function label(text:string,x:number,y:number,size=12,color='#65765f'){g.fillStyle=color;g.font=`${size>=17?'700':'500'} ${size}px system-ui`;g.textAlign='left';g.fillText(text,x,y);}
function rider(look:RiderLook,x:number,y:number,scale:number,t:number){g.save();g.translate(x,y);g.scale(scale,scale);drawRider(g,look,.18+(t-1.2)*1.2,t*6,{t,speed:6});g.restore();}
function mix(i:number):RiderLook{
 const ids=[['hat',['cowboy','wizard','mohawk','headphones','chef','propeller']],['jersey',['checker','galaxy','tux','dynamo','royal','plain']],['bike',['road','cruiser','bmx','mtb','chopper','bamboo']]] as const;
 let look=base;for(const [slot,opts]of ids){const it=ITEMS.find(it=>it.slot===slot&&it.id===opts[(i*7+seed+(slot==='hat'?1:slot==='jersey'?2:3))%opts.length]);if(it)look=withItem(look,it);}
 return look;
}
function source(it:Item){const s=it.source;return 'level'in s?`LEVEL ${s.level}`:'pick'in s?`LEVEL ${s.pick} PICK`:'achievement'in s?ACHIEVEMENTS.find(a=>a.id===s.achievement)?.name??s.achievement:'STARTER';}
function draw(t:number){
 const items=selectedItems();canvas.width=1536;canvas.height=102+Math.ceil(items.length/4)*320;
 g.fillStyle='#eeeade';g.fillRect(0,0,canvas.width,canvas.height);
 label(`WATTCADE / ${names[section].toUpperCase()}`,28,34,13);label(section==='featured'?'A little more personality, from head to toe.':`${names[section]} / the active reward collection`,28,75,30,'#233342');
 items.forEach((it,i)=>{
  const x=16+(i%4)*384,y=102+Math.floor(i/4)*320;
  g.fillStyle='#fffdf5';g.beginPath();g.roundRect(x,y,368,304,10);g.fill();label(it.name,x+16,y+28,18,'#233342');label(source(it),x+16,y+50,11,'#9c5a41');
  const box=itemBox(it),s=Math.min(92/(box.x1-box.x0),95/(box.y1-box.y0));
  g.save();g.translate(x+64-(box.x0+box.x1)*s/2,y+139-box.y1*s);g.scale(s,s);drawCosmeticItem(g,it,withItem(base,it),t);g.restore();label('ITEM',x+43,y+161,9);
  rider(withItem(base,it),x+235,y+201,5.4,t);label('VANILLA + ITEM',x+163,y+223,9);
  rider(withItem(mix(i),it),x+112,y+290,2.1,t);label('EXISTING MIX',x+177,y+267,9);
  rider(withItem(base,it),x+292,y+292,1.2,t);
 });
 document.querySelectorAll<HTMLButtonElement>('[data-section]').forEach(b=>b.classList.toggle('on',b.dataset.section===section));
}
document.querySelector('#shuffle')!.addEventListener('click',()=>{seed++;draw(time);});
document.querySelector('#motion')!.addEventListener('click',e=>{playing=!playing;(e.currentTarget as HTMLElement).textContent=playing?'Pause pedaling':'Play pedaling';});
let previous=0;function frame(now:number){if(playing&&now-previous>1000/24){time+=.045;draw(time);previous=now;}requestAnimationFrame(frame);}draw(time);requestAnimationFrame(frame);
declare global{interface Window{__catalogReady?:boolean;__catalogFrame?:(t:number)=>void;__catalogKeys?:string[]}}
window.__catalogFrame=t=>{time=t;draw(t);};window.__catalogKeys=ITEMS.map(itemKey);window.__catalogReady=true;
