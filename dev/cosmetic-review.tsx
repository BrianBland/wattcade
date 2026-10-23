import { render } from 'preact';
import { useState } from 'preact/hooks';
import '../src/styles/main.css';
import { testProfile, createGameSession, NullInput } from '../src/core';
import { module as warmup } from '../src/games/warmup';
import { COSMETICS_VERSION, item as currentItem } from '../src/cosmetics/catalog';
import { ORIGINAL_ITEMS } from '../src/cosmetics/legacyCatalog';
// Historical art boards can still inspect source art; the actual Locker uses only the current catalog.
const item = (slot: Slot, id: string) => currentItem(slot, id) ?? ORIGINAL_ITEMS.find(it => it.slot === slot && it.id === id);
import { riderLook, withItem, choosePick, pickOptions } from '../src/cosmetics/unlocks';
import { drawCosmeticItem, itemBox } from '../src/cosmetics/draw/items';
import { drawRider } from '../src/cosmetics/draw/rider';
import type { Item, RiderLook, Slot } from '../src/cosmetics/types';
import { RewardPick } from '../src/shell/screens/RewardPick';
import { UnlockReveal } from '../src/shell/screens/UnlockReveal';
import { Locker } from '../src/shell/screens/Locker';

const mode=new URLSearchParams(location.search).get('mode')??'c1';
let profile=testProfile({name:'Rider',color:'#19b5bc',level:mode==='pick'?5:7});
if(mode==='wardrobe-locker'){
  const {ACHIEVEMENTS}=await import('../src/progression/achievements');
  profile={...profile,level:150,achievements:ACHIEVEMENTS.map(a=>a.id),cosmetics:{rotation:COSMETICS_VERSION}};
  for(let level=5;level<=150;level+=5){const option=pickOptions(profile,level)[0];if(option)profile=choosePick(profile,level,option.id);}
}
const base=riderLook(profile);
const app=document.querySelector<HTMLDivElement>('#app')!;app.style.background='transparent';
const c=document.createElement('canvas');c.width=1536;c.height=1024;
const g=c.getContext('2d')!;
function label(text:string,x:number,y:number,size=19,center=false){g.fillStyle='#182132';g.font=`${size>23?'bold ':''}${size}px system-ui`;g.textAlign=center?'center':'left';g.fillText(text,x,y);}
function showItem(it:Item,x:number,y:number,w:number,h:number,t:number){
  const box=itemBox(it),s=Math.min(w/(box.x1-box.x0),h/(box.y1-box.y0));
  g.save();g.translate(x-(box.x0+box.x1)*s/2,y-box.y1*s);g.scale(s,s);drawCosmeticItem(g,it,withItem(base,it),t);g.restore();
}
function showRider(look:RiderLook,x:number,y:number,s:number,t:number){g.save();g.translate(x,y);g.scale(s,s);drawRider(g,look,t*1.33,t*6,{t,speed:6});g.restore();}
function board(t:number){
  g.fillStyle='#f4f0e5';g.fillRect(0,0,1536,1024);
  label(`WATTCADE / ${mode==='c1'?'C1 · HEADWEAR & KITS':mode==='c2'?'C2 · RIDES & COMPANIONS':'LIGHT CYCLE / INDEPENDENT TRAIL'}`,32,47,30);
  label('Actual shared Canvas art · flat pixel shapes · existing item identities',32,79);
  if(mode==='c1'){
    label('HEADWEAR / DISTINCT SILHOUETTES',32,126,24);
    ['road','cap','beanie','cowboy','wizard','cone','cloud','lamp'].forEach((id,i)=>{const x=96+i*192;showItem(item('hat',id)!,x,304,158,150,t);label(item('hat',id)!.name,x,337,18,true);});
    label('KITS / ONE BOLD IDEA PER JERSEY',32,397,24);
    ['polka','stars','lighthouse','hawaiian'].forEach((id,i)=>{const x=192+i*384;showRider(withItem(base,item('jersey',id)!),x,664,7.5,t);label(item('jersey',id)!.name,x,700,20,true);});
    label('ITEM SHELF / THE COSMETIC ITSELF',32,762,24);
    ['checker','lightning','bee','cape'].forEach((id,i)=>{const x=192+i*384;showItem(item('jersey',id)!,x,945,200,160,t);label(item('jersey',id)!.name,x,984,20,true);});
  }else if(mode==='c2'){
    label('BIKES / DIFFERENT SILHOUETTES',32,126,24);
    ['cruiser','cargo','pennyfarthing','sofa'].forEach((id,i)=>{let look=withItem(base,item('bike',id)!);look=withItem(look,item('paint',id==='sofa'?'red':id==='cargo'?'mint':'silver')!);if(id==='cargo')look=withItem(look,item('pet','corgi')!);showRider(look,192+i*384,412,id==='pennyfarthing'?7:8.5,t);label(item('bike',id)!.name,192+i*384,451,20,true);});
    label('PETS / SMALL SHAPES, BIG PERSONALITY',32,510,24);
    ['corgi','dragon','hamsterball','trex'].forEach((id,i)=>{const x=192+i*384;showItem(item('pet',id)!,x,721,230,180,t);label(item('pet',id)!.name,x,755,20,true);});
    label('TRAILS & PAINT / SEPARATE CHOICES',32,813,24);
    const row:Array<[Slot,string]>=[['trail','sparks'],['trail','leaves'],['trail','lightcycle'],['paint','silver'],['paint','mint'],['paint','pink'],['paint','gold']];
    row.forEach(([slot,id],i)=>{const x=110+i*220;showItem(item(slot,id)!,x,960,195,110,t);label(item(slot,id)!.name,x,993,17,true);});
  }else{
    const speed=t<5?6:0;
    const looks=[{...base,bike:'tron',trail:'none'},{...base,bike:'road',trail:'lightcycle'},{...base,bike:'tron',trail:'lightcycle'}];
    ['Light Cycle / no trail','Road Bike / Light Cycle Trail','Light Cycle / Light Cycle Trail'].forEach((name,i)=>{
      const y=300+i*290;g.fillStyle='#152d3c';g.fillRect(20,y-190,1496,235);
      g.save();g.translate(1100,y);g.scale(7,7);drawRider(g,looks[i],Math.min(t,5)*1.33,Math.min(t,5)*6,{t,speed});g.restore();g.fillStyle='#f4f0e5';g.font='24px system-ui';g.textAlign='left';g.fillText(name,50,y-140);
    });
    label(speed?'Separate slots · either cosmetic works on its own':'Stopped · all trails disappear',32,1000,21);
  }
}
declare global{interface Window{__cosmeticFrame?:(t:number)=>void;__reviewReady?:boolean;}}
if(['c1','c2','lightcycle'].includes(mode)){
  document.body.style.background='#f4f0e5';app.append(c);c.style.cssText='width:100%;height:100%;object-fit:contain;image-rendering:pixelated';board(1.2);window.__cosmeticFrame=board;window.__reviewReady=true;
}else{
  const session=createGameSession({game:warmup,profile,input:new NullInput(),fake:{script:'z2'},seed:2,simOpts:{startDistance:500}});session.step(30*15);
  const renderer=await warmup.loadRenderer();const world=document.querySelector<HTMLDivElement>('#world')!;renderer.mount(world,{profile,send(){},insets:{top:0,bottom:0,left:0,right:0}});renderer.resize?.(innerWidth,innerHeight);renderer.render(session.sim.snapshot(),session.ctx.bike(),session.ctx.input());
  function Review(){const[p,setP]=useState(profile),[done,setDone]=useState(false);return done?<p>Choice saved</p>:mode==='pick'?<RewardPick profile={p} onProfile={setP} onDone={()=>setDone(true)}/>:mode==='unlock'?<UnlockReveal profile={p} items={[{slot:'pet',id:'corgi',name:'Corgi'}]} onProfile={setP} onDone={()=>setDone(true)}/>:<Locker profile={p} onProfile={setP} onPick={()=>{}} onBack={()=>{}}/>;}
  render(<Review/>,app);window.__reviewReady=true;
}
