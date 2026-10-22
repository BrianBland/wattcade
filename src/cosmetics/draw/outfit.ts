import type { OutfitLook, WearLook, WearSlot } from '../types';
import { circle, line, oval, poly, rect, ring, shade, SKIN, TAU, type G, type P } from './prims';

type WearValue = OutfitLook[keyof OutfitLook];
const CONCEPTS: Record<string, WearLook> = {
  club: { kind: 'shorts', base: '#243857', ink: '#e7eee6', pattern: 'stripe' },
  aurora: { kind: 'tights', base: '#164d58', ink: '#5cedcf', pattern: 'chevron' },
  disco: { kind: 'flares', base: '#ac287d', ink: '#ffcf58', accent: '#f778bc' },
  road: { kind: 'road', base: '#f3f1df', ink: '#5a92a5', accent: '#344a62' },
  winged: { kind: 'winged', base: '#327e88', ink: '#fff0b4', accent: '#f7cb60' },
  ducks: { kind: 'ducks', base: '#ffce3d', ink: '#f7852d', accent: '#263241' },
  shades: { kind: 'shades', base: '#202938', ink: '#6cabb9' },
  visor: { kind: 'visor', base: '#e44da5', ink: '#80f4e7', accent: '#923867' },
  stars: { kind: 'stars', base: '#ffcf48', ink: '#2b7f9e' },
  mitts: { kind: 'mitts', base: '#f0eee0', ink: '#487786' },
  gauntlets: { kind: 'charged', base: '#7a8b9e', ink: '#4de3bf', accent: '#cedbdc' },
  claws: { kind: 'claws', base: '#dd493d', ink: '#ff8a63', accent: '#983938' },
  musette: { kind: 'musette', base: '#435d54', ink: '#91a38a', accent: '#ead7a5' },
  courier: { kind: 'courier', base: '#b94e2f', ink: '#ed9452', accent: '#f5cb8a' },
  rocket: { kind: 'rocket', base: '#dee3d9', ink: '#df5942', accent: '#46677a' },
};
export const resolveWear = (value: WearValue): WearLook | undefined => typeof value === 'string' ? CONCEPTS[value] : value;
const inactive = (w?: WearLook) => !w || w.kind === 'none' || w.kind === 'legacy';
const fullLeg = new Set(['tights', 'trousers', 'waders', 'dungarees', 'chaps', 'fireproof', 'space', 'pajamas', 'flares']);
export function bottomColors(value: OutfitLook['bottoms']) {
  const w = resolveWear(value); if (inactive(w)) return undefined;
  return { thigh: w!.kind === 'censor' ? SKIN : w!.base, shin: fullLeg.has(w!.kind) ? w!.base : null };
}
export function bottomLength(value: OutfitLook['bottoms']): number {
  const kind = resolveWear(value)?.kind;
  return kind === 'hotpants' || kind === 'fur' ? .3 : kind === 'tutu' || kind === 'censor' ? .2 : kind === 'cargo' || kind === 'steel' ? .75 : .55;
}
function segment(g: G, a: P, b: P, draw: (length: number) => void) {
  g.save(); g.translate(...a); g.rotate(Math.atan2(b[1] - a[1], b[0] - a[0]));
  draw(Math.hypot(b[0] - a[0], b[1] - a[1])); g.restore();
}
function star(g: G, color: string, x: number, y: number, radius: number) {
  poly(g, color, ...Array.from({ length: 10 }, (_, i): P => {
    const a = i * Math.PI / 5 - Math.PI / 2, r = radius * (i % 2 ? .48 : 1);
    return [x + Math.cos(a) * r, y + Math.sin(a) * r];
  }));
}
export function drawBottomDetail(g: G, value: OutfitLook['bottoms'], hip: P, knee: P, foot: P, near: boolean, t = 0) {
  const w = resolveWear(value); if (inactive(w)) return;
  const { kind, base, ink, accent = ink, pattern } = w!;
  const col = (c: string) => near ? c : shade(c, .65);
  segment(g, hip, knee, l => {
    const end = fullLeg.has(kind) ? l : l * bottomLength(value);
    if (pattern === 'stripe' || kind === 'bib') rect(g, col(ink), Math.max(.4, end - .7), -1.65, .65, 3.3);
    if (pattern === 'spots') for (let i = 0; i < 3; i++) ring(g, col(ink), .45, .7 + i * .6, (i % 2 ? .7 : -.6), .35);
    if (pattern === 'eq') for (let i = 0; i < 3; i++) rect(g, col(ink), .4, -1.2 + i * .85, .6 + Math.abs(Math.sin(t * 3 + i)) * 1.2, .5);
    if (kind === 'steel') { rect(g, col(ink), .5, -1.4, end - 1, .6); for (const v of [-1.1, 1.1]) circle(g, col(accent), end - .8, v, .3); }
    if (kind === 'fur') for (let i = 0; i < 4; i++) poly(g, col(ink), [end - .4, -1.8 + i], [end + .8, -1.5 + i], [end - .4, -.9 + i]);
    if (kind === 'cargo' || pattern === 'patch') { rect(g, col(ink), end * .35, -.9, 1.8, 1.7); rect(g, col(accent), end * .35, -.9, 1.8, .5); }
    if (kind === 'chaps') rect(g, col(ink), .7, -.6, end - 1, 1.2);
    if (kind === 'space') { rect(g, col(ink), l - 1, -1.5, 1, 3); rect(g, col(accent), l - .7, -.6, .5, 1.2); }
    if (kind === 'fireproof') rect(g, col(accent), l - 1.7, -1.5, 1.7, 3);
    if (pattern === 'bones') { line(g, col(ink), .8, [.8, 0], [l - .6, 0]); for (const u of [.7, l - .6]) for (const v of [-.4,.4]) circle(g, col(ink), u, v, .5); }
  });
  segment(g, knee, foot, l => {
    if (pattern === 'chevron') poly(g, col(ink), [l * .3, -1], [l * .5, 0], [l * .3, 1], [l * .55, 1], [l * .8, 0], [l * .55, -1]);
    if (pattern === 'bones') { line(g, col(ink), .65, [.6, -.4], [l - .6, -.4]); line(g, col(ink), .65, [.6, .5], [l - .6, .5]); }
    if (kind === 'pajamas') { rect(g, col(ink), .5, -.8, l - .5, .4); circle(g, '#f6eedb', l * .55, .6, .35); }
    if (kind === 'waders') { rect(g, col(ink), l * .25, -1.25, l * .7, 2.5); rect(g, col(accent), l - 1, -1.4, 1, 2.8); }
    if (kind === 'flares') {
      poly(g, col(base), [0, -1.2], [l, -2.7], [l, 2.7], [0, 1.2]);
      poly(g, col(accent), [1, -.4], [l - .7, -1.5], [l - .7, -.5], [1, .3]); rect(g, col(ink), l - .7, -2.6, .7, 5.2);
    }
  });
}
/** Skirts and the featureless bare pelvis span both legs and stay anchored to the hips. */
export function drawHipWear(g: G, value: OutfitLook['bottoms'], hip: P, t: number) {
  const w = resolveWear(value); if (inactive(w)) return;
  const { kind, base, ink, accent = ink } = w!;
  g.save(); g.translate(...hip);
  if (kind === 'tutu') {
    const flutter = Math.sin(t * 5) * .35;
    poly(g, base, [-2, -1], [1.8, -.7], [6.4, 2.1 + flutter], [4, 3.1], [0, 2.5], [-4.9, 3], [-6.2, 1.9 - flutter]);
    for (let i = -2; i <= 2; i++) line(g, i % 2 ? ink : accent, .6, [i * .7, -.3], [i * 2.1, 2.6]);
    rect(g, ink, -2.1, -.9, 4.4, .7);
  }
  if (kind === 'censor') {
    // The censor is a later scene effect; only the unclothed cartoon body goes here.
    oval(g, SKIN, 0, .5, 2.1, 1.8);
  }
  if (kind === 'bib' || kind === 'dungarees') { rect(g, base, -.5, -2.6, 2.8, 3.3); rect(g, ink, .1, -2.2, 1.5, .9); }
  g.restore();
}

export function drawFootwear(g: G, value: OutfitLook['footwear'], foot: P, near: boolean, t = 0) {
  const w = resolveWear(value); if (inactive(w)) return;
  const { kind, base, ink, accent = '#344a42' } = w!;
  g.save(); g.translate(...foot);
  const col = (c: string) => near ? c : shade(c, .68);
  if (kind === 'ducks') {
    poly(g, col(base), [-1.7, -.9], [.6, -1.8], [2.3, -1.5], [2.8, -.6], [2.6, 1], [-1.7, 1]);
    rect(g, col(ink), 2, -.3, 1.6, .9); rect(g, col(accent), 1.3, -1.2, .5, .5);
    poly(g, col('#efb027'), [-1, -.4], [.3, -.7], [.8, .4], [-.8, .6]);
  } else {
    const tall = !['road','sandals','spikes','flames'].includes(kind), h = ['wellies','pirate','warmers','socks'].includes(kind) ? 4 : tall ? 2.8 : 1.1;
    poly(g, col(kind === 'sandals' ? SKIN : base), [-1.3, -h], [.6, -h], [.8, -.8], [2, -.3], [2, .8], [-1.4, .8]);
    rect(g, col(accent), -1.4, .6, 3.4, .5);
    if (kind !== 'sandals') rect(g, col(ink), -.5, -.8, .65, 1.2);
    if (kind === 'sandals') { rect(g, col(base), -1.3, -1.4, .8, 1.8); rect(g, col(base), .7, -.6, .6, 1.3); }
    if (['socks','warmers'].includes(kind)) for (let y = -h + .4; y < -1; y += 1) rect(g, col(ink), -1.3, y, 2, .45);
    if (['work','combat','hightops','pirate'].includes(kind)) for (let y = -h + .4; y < -.5; y += .7) rect(g, col(ink), -.2, y, .8, .35);
    if (kind === 'pirate') { rect(g, col(ink), -1.7, -h, 2.7, .7); rect(g, col(ink), -.4, -1.7, 1, .9); rect(g, col(base), -.1, -1.4, .4, .3); }
    if (kind === 'winged' || kind === 'wind') poly(g, col(ink), [-.5, -1], [-3.4, -3], [-2.7, -.9], [-2, -1.3], [-1.7, -.3]);
    if (kind === 'clockwork') { ring(g, col(ink), .5, -1, -2.5, 1); line(g, col(accent), .45, [-1,-2.5], [-2.5,-3.4]); circle(g,col(ink),-2.6,-3.4,.55); }
    if (kind === 'launch') poly(g, col(ink), [-1, -2.6], [.3,-2.1], [-1,-1.6], [-.5,-1.6], [.8,-2.1], [-.5,-2.6]);
    if (kind === 'spikes') for (let x = -1; x <= 2; x++) poly(g, col(ink), [x,.8], [x+.4,1.5], [x+.7,.8]);
    if (kind === 'flames') for (let i = 0; i < 3; i++) poly(g, col(i % 2 ? accent : ink), [-1.1,-.6+i*.5], [-3.4-Math.sin(t*8+i)*.5,-1+i*.5], [-1.1,.1+i*.5]);
    if (kind === 'rubber') { rect(g, col(ink), -1.4,-2.7,2.2,.7); rect(g,col(ink),.8,-.5,1,.6); }
  }
  g.restore();
}
export function drawEyewear(g: G, value: OutfitLook['eyewear']) {
  const w = resolveWear(value); if (inactive(w)) return;
  const { kind, base, ink, accent = ink } = w!;
  if (kind === 'bubble') {
    g.save(); g.fillStyle = '#c9f3ff30'; g.strokeStyle = ink; g.lineWidth = .6; g.beginPath(); g.arc(0,0,5,0,TAU);g.fill();g.stroke();
    rect(g,accent,-3,4.2,6,.9);rect(g,'#ffffffaa',2,-3.3,1.1,1.3);g.restore();return;
  }
  if (kind === 'stars') {
    line(g, base, .65, [-2.5,-.8],[3,-.8]);star(g,base,2,-.6,2.6);star(g,ink,2,-.6,1.15);star(g,base,-.9,-.9,1.4);circle(g,ink,-.9,-.9,.45);return;
  }
  if (kind === 'monocle' || kind === 'runes') {
    ring(g,base,.6,1.7,-.5,1.5);circle(g,ink,1.7,-.5,.9);line(g,accent,.35,[1.5,1],[.5,3.7]);
    if(kind==='runes'){star(g,accent,3,-1.9,.7);rect(g,base,-1.1,-1.4,1.3,1.7);}return;
  }
  line(g, base, .6, [-2.7,-1.2],[2.8,-1.2]);
  if (['goggles','welding','aviator'].includes(kind)) {
    oval(g,base,.8,-.5,2.1,1.4);oval(g,ink,1.5,-.5,1.4,.9);rect(g,accent,-1.1,-1,1,1.3);rect(g,'#f5f2d6',1,-1,.5,.4);
  } else {
    poly(g,base,[0,-1.6],[3.3,-1.6],[3.5,-.4],[2.7,.7],[.3,.4]);
    if (kind !== 'mask') poly(g,ink,[.5,-1.1],[2.9,-1.1],[1.3,.1],[.5,.1]);
    if(kind==='mask')star(g,accent,1.5,-.5,.7);
    if(kind==='reticle'){ring(g,accent,.35,2,-.4,.65);line(g,accent,.3,[2,-1.3],[2,.5]);}
    if(kind==='shades')rect(g,base,.2,.1,3,.5);
    if(kind==='ski')rect(g,accent,-2.3,-1.4,1.7,.8);
  }
}

export function drawBack(g: G, value: OutfitLook['back'], hip: P, shoulder: P, t: number, speed: number) {
  const w = resolveWear(value); if (inactive(w)) return;
  const { kind, base, ink, accent = ink } = w!;
  if (kind === 'cape' || kind === 'scarf') {
    const wave = Math.sin(t*7)*.8, length = kind === 'cape' ? 13 : 15;
    poly(g,base,shoulder,[shoulder[0]-length,shoulder[1]+2+wave],[shoulder[0]-length+1,shoulder[1]+(kind==='cape'?10:4)+wave],[shoulder[0]-2,shoulder[1]+5]);
    line(g,ink,.7,[shoulder[0]-2,shoulder[1]+3],[shoulder[0]-length+2,shoulder[1]+4+wave]);return;
  }
  g.save();g.translate(...hip);g.rotate(Math.atan2(shoulder[1]-hip[1],shoulder[0]-hip[0]));
  if (kind === 'dyson') {
    ring(g,accent,.6,5,-6,5.8);
    for(let i=0;i<4;i++){const a=t*.3+i*TAU/4;const x=5+Math.cos(a)*5.8,y=-6+Math.sin(a)*5.8;rect(g,base,x-1.5,y-.9,3,1.8);line(g,ink,.3,[x-1.2,y],[x+1.2,y]);}
    circle(g,ink,5,-6,1.2);
  } else if (kind === 'lifebuoy') {
    ring(g,base,2.2,4,-5,3.4);for(let i=0;i<4;i++){const a=i*TAU/4;line(g,ink,1.4,[4+Math.cos(a)*2.5,-5+Math.sin(a)*2.5],[4+Math.cos(a)*4.2,-5+Math.sin(a)*4.2]);}
  } else if (kind === 'rocket' || kind === 'tanks' || kind === 'flamer') {
    for(const v of [-4.5,-7.8]){
      poly(g,base,[1.8,v-1.1],[6,v-1.1],[7.7,v],[6,v+1.1],[1.8,v+1.1]);rect(g,ink,2.4,v-1.1,1,2.2);rect(g,accent,1,v-.8,1,1.6);
      if(kind==='rocket'&&speed>.6){const flicker=Math.sin(t*19+v)*.8;poly(g,'#f47935',[1,v-.8],[-3.5-flicker,v],[1,v+.8]);poly(g,'#ffe68c',[1,v-.4],[-1.8-flicker,v],[1,v+.4]);}
    }
    line(g,accent,1.2,[3.8,-7.5],[5.5,-1]);
    if(kind==='flamer'){line(g,ink,.7,[2,-7],[0,-9],[-2,-5]);circle(g,ink,6,-6,1);}
    if(kind==='tanks')line(g,accent,.8,[7,-6],[9,-3],[7,0]);
  } else if (kind === 'arsenal') {
    poly(g,base,[1,-2],[7,-2],[7,-5],[1,-5]);line(g,ink,1.1,[0,-7],[9,-3]);line(g,accent,.8,[0,-2],[9,-7]);
    poly(g,ink,[9,-3],[11,-2],[10,-4]);ring(g,accent,.7,5,-7,4);rect(g,base,0,-8,2,3);
  } else {
    const small=kind==='musette';
    poly(g,base,[.5,-1.7],[small?4.5:7.8,-1.7],[small?4.7:8.4,small?-5:-6.7],[1.2,small?-5.3:-7],[.2,-5]);
    rect(g,ink,1,-5.4,small?3.4:5.7,1.2);line(g,accent,.7,[2,-4.3],[7.3,-1]);
    switch(kind){
      case 'musette':rect(g,accent,2,-4,.8,.9);break;
      case 'courier':rect(g,accent,2,-6.9,5.4,1.3);rect(g,'#4e3d38',3,-6.4,.8,4.3);rect(g,accent,2.7,-3.9,1.4,.8);break;
      case 'popcorn':for(let i=0;i<3;i++)rect(g,ink,1+i*2,-6,1,4.5);for(let i=0;i<5;i++)circle(g,accent,3+i,-7-(i%2)*.6,.9);break;
      case 'bread':for(let i=0;i<3;i++){line(g,ink,1.5,[3+i*1.6,-5],[6+i*.8,-9]);line(g,accent,.3,[4+i,-7],[5+i,-6.7]);}break;
      case 'speaker':circle(g,accent,4,-4.8,2.1);circle(g,base,4,-4.8,1.4);circle(g,ink,4,-4.8,.55);rect(g,ink,1.4,-2.7,5,.5);break;
      case 'coil':for(let i=0;i<4;i++)ring(g,ink,.7,2+i*1.3,-5.3,2.1);circle(g,accent,4,-5,1);break;
      case 'hydration':line(g,ink,.7,[7,-5],[9,-3],[8,0]);rect(g,accent,2,-4,2,1);break;
      case 'chute':for(let i=0;i<3;i++)line(g,accent,.5,[1+i*2,-6],[1+i*2,-2.4]);line(g,ink,.7,[2,-6],[6,-2.5]);break;
    }
  }
  g.restore();
}
export function drawGloves(g: G, value: OutfitLook['gloves'], elbow: P, hand: P) {
  const w = resolveWear(value); if (inactive(w)) return;
  const { kind, base, ink, accent = ink } = w!;
  segment(g,elbow,hand,l=>{
    if(kind==='claws'){
      poly(g,base,[l-2,-1],[l,-2.3],[l+2.9,-2.1],[l+3.5,-.8],[l+.7,-.4],[l+3.1,.7],[l+2.2,2.1],[l,2.1],[l-1.7,1.1]);
      poly(g,ink,[l-1.3,-.7],[l,-1.7],[l+2.5,-1.6],[l+2.8,-1],[l+.3,-.9]);rect(g,accent,l-2,-1.2,.7,2.4);return;
    }
    const long=kind==='opera'?l:kind==='gauntlets'||kind==='charged'?3.2:1.8;
    rect(g,base,Math.max(0,l-long),-1,kind==='bands'?1.3:long+.8,2);
    rect(g,ink,Math.max(0,l-long),-1.1,.65,2.2);
    if(kind==='fingerless'||kind==='mitts')rect(g,SKIN,l+.4,-.7,.5,1.4);
    if(kind==='charged')for(let i=0;i<3;i++)rect(g,ink,l-2.2+i*.8,-.6,.5,1.2);
    if(kind==='gauntlets'){rect(g,accent,l-2.8,-1.4,.6,2.8);rect(g,ink,l-.5,-1.2,1.5,.5);}
    if(kind==='spikes')for(let i=0;i<3;i++)poly(g,ink,[l-1.4+i*.7,-1],[l-1+i*.7,-2.1],[l-.7+i*.7,-1]);
    if(kind==='wraps')for(let i=0;i<4;i++)line(g,ink,.3,[l-2+i*.7,-1],[l-1.5+i*.7,1]);
    if(kind==='paws'){oval(g,base,l+.4,0,1.5,1.6);circle(g,ink,l+.5,.2,.6);for(let i=0;i<3;i++)circle(g,ink,l+.1+i*.5,-.7,.25);}
    if(kind==='split')rect(g,ink,l-.8,-.1,1.7,1.2);
    if(kind==='work')rect(g,accent,l-.5,-.7,.7,.7);
    if(kind==='flight')line(g,ink,.7,[l-1.3,-.7],[l+.8,-.7]);
  });
}
/** Isolated shelf art shares the same drawers and colors as the worn item. */
export function drawWearItem(g: G, slot: WearSlot, look: WearLook, t: number) {
  if(inactive(look)){
    if(slot==='bottoms'){drawWearItem(g,slot,{...look,kind:'shorts'},t);return;}
    if(slot==='feet'){drawWearItem(g,slot,{...look,kind:'road'},t);return;}
    if(slot==='hands'){oval(g,SKIN,-1,-3,1.5,2);return;}
    rect(g,'#8b9dab',-2,-3,4,.6);return;
  }
  if(slot==='bottoms'){
    const hip:P=[0,-10];
    for(const side of [-1,1]){
      const knee:P=[side*2,-5],foot:P=[side*2,0];
      const colors=bottomColors(look)!;
      if(colors.shin)line(g,colors.shin,2,knee,foot);line(g,colors.thigh,3.2,hip,[hip[0]+(knee[0]-hip[0])*(colors.shin?1:bottomLength(look)),hip[1]+(knee[1]-hip[1])*(colors.shin?1:bottomLength(look))]);
      drawBottomDetail(g,look,hip,knee,foot,true,t);
    }
    drawHipWear(g,look,hip,t);
  } else if(slot==='feet') {drawFootwear(g,look,[-3,0],true,t);drawFootwear(g,look,[3,-1],true,t);}
  else if(slot==='hands'){drawGloves(g,look,[-5,-7],[-3,-2]);drawGloves(g,look,[2,-7],[4,-2]);}
  else if(slot==='eyewear'){g.save();g.translate(-1,-3);g.scale(1.7,1.7);drawEyewear(g,look);g.restore();}
  else drawBack(g,look,[0,1],[0,-7],t,6);
}
