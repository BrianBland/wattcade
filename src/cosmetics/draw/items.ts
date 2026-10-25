import type { Item, RiderLook } from '../types';
import { drawBikeItem } from './rider';
import { drawHat } from './hats';
import { drawJerseyItem } from './jersey';
import { drawPet, FLIERS } from './pets';
import { drawTrail } from './trails';
import { drawWearItem } from './outfit';
import { drawCensor } from './censor';
import { rect, TAU, type G } from './prims';

export function itemBox(it: Item) {
  switch(it.slot) {
    case 'bottoms': return {x0:-9,x1:9,y0:-15,y1:3};
    case 'hands': return {x0:-8,x1:9,y0:-11,y1:3};
    case 'feet': return {x0:-9,x1:10,y0:-8,y1:3};
    case 'eyewear': return {x0:-11,x1:11,y0:-14,y1:8};
    case 'back': return {x0:-17,x1:13,y0:-17,y1:8};
    case 'hat': return {x0:-9,x1:9,y0:-13,y1:3};
    case 'jersey': return {x0:-9,x1:9,y0:-12,y1:2};
    case 'pet': return {x0:-7,x1:8,y0:-11,y1:3};
    case 'trail': return {x0:-52,x1:4,y0:-14,y1:4};
    default: return {x0:-20,x1:20,y0:-34,y1:3};
  }
}
const surfaces = new WeakMap<G,{canvas:HTMLCanvasElement;g:G}>();
export function drawCosmeticItem(g:G,it:Item,look:RiderLook,t:number) {
  const paint=(g:G)=>{
    switch(it.slot){
      case 'bottoms':case 'hands':case 'feet':case 'eyewear':case 'back':drawWearItem(g,it.slot,it.look,t);break;
      case 'hat':if(it.id==='none')rect(g,'#8b9dab',-2,-3,4,.6);else drawHat(g,it.id,{t,color:look.color,speed:6,crank:t*.8});break;
      case 'jersey':drawJerseyItem(g,look.jersey,t);break;
      case 'pet':
        if(it.id==='none')rect(g,'#8b9dab',-2,-3,4,.6);
        else {g.save();if(FLIERS.has(it.id))g.translate(0,-4);drawPet(g,it.id,{t,speed:6,gait:t*4.5/1.1*TAU,color:look.color});g.restore();}break;
      case 'trail':
        if(it.id==='none')rect(g,'#8b9dab',-25,-5,4,.6);
        else drawTrail(g,it.id,{t,speed:6,color:look.color,x0:0});break;
      case 'paint':drawBikeItem(g,{...look,bike:'road',pet:'none',trail:'none'},t,false);break;
      case 'bike':drawBikeItem(g,look,t);break;
    }
  };
  if(typeof document==='undefined'){paint(g);return;}
  let s=surfaces.get(g);
  if(!s){const canvas=document.createElement('canvas');canvas.width=160;canvas.height=110;const ctx=canvas.getContext('2d',{willReadFrequently:true})!;s={canvas,g:ctx};surfaces.set(g,s);}
  s.g.setTransform(1,0,0,1,0,0);s.g.clearRect(0,0,160,110);s.g.setTransform(2,0,0,2,112,86);paint(s.g);
  if(it.slot!=='eyewear'&&it.slot!=='trail'&&(it.slot==='bottoms'||it.slot==='hands'||it.slot==='feet'||it.slot==='back'||it.slot==='jersey'||it.slot==='hat'&&!['halo','lamp','bubble'].includes(it.id)||it.slot==='pet'&&!['hamsterball','ghost'].includes(it.id))){
    const pixels=s.g.getImageData(0,0,160,110);for(let i=3;i<pixels.data.length;i+=4)pixels.data[i]=pixels.data[i]>=128?255:0;s.g.putImageData(pixels,0,0);
  }
  g.save();g.imageSmoothingEnabled=false;g.drawImage(s.canvas,-56,-43,80,55);g.restore();
  if(it.slot==='bottoms'&&it.look.kind==='censor')drawCensor(g,[0,-10],t);
}
