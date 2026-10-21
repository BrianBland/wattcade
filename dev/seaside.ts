// Seaside art-direction stills.  /dev/seaside.html?still=highway|turnout|shop|lou|belly|monkey|lava|reentry[&look=…][&stats=1]
import type { Stage } from '../src/games/seaside/stills/stage';
import { stillHighway, stillTurnout } from '../src/games/seaside/stills/coastStills';
import { stillShop, shopOverlay, stillLouSheet } from '../src/games/seaside/stills/shopStill';
import { stillBelly } from '../src/games/seaside/stills/later/belly';
import { stillMonkey } from '../src/games/seaside/stills/later/monkey';
import { stillLava } from '../src/games/seaside/stills/later/lava';
import { stillReentry } from '../src/games/seaside/stills/later/reentry';
import { stillDrill } from '../src/games/seaside/stills/later/drill';
import { applyLook } from '../src/games/seaside/render/looks';
import { PostFX } from '../src/games/seaside/render/post';

type Still = { make: (c: HTMLCanvasElement, w: number, h: number) => Stage; overlay?: string; look?: string; time?: number };
const bubble = (s: string) => `<div class="bubble">${s}</div>`;
const STILLS: Record<string, Still> = {
  highway: { make: stillHighway, overlay: bubble('Good day for it.') },
  turnout: { make: stillTurnout, overlay: bubble('Lunch, maybe.') },
  shop: { make: stillShop, overlay: shopOverlay() },
  lou: { make: stillLouSheet },
  monkey: { make: stillMonkey, overlay: bubble('Well. In we go.'), look: 'jungle', time: 2 },
  lava: { make: stillLava, overlay: bubble('Those are fish.'), look: 'lava', time: 5 },
  reentry: { make: stillReentry, look: 'reentry', time: 7 },
  drill: { make: stillDrill, overlay: bubble('Bone. Bone is close to out.'), look: 'belly', time: 4 },
  belly: { make: stillBelly, overlay: bubble('That’s my old rod.'), look: 'belly', time: 3 },
};

const q = new URLSearchParams(location.search);
const name = q.get('still') ?? 'highway', still = STILLS[name] ?? STILLS.highway;
const W = Number(q.get('w') ?? 1600), H = Number(q.get('h') ?? 900);
if (q.get('w')) { const wrap = document.getElementById('wrap')!; wrap.style.width = `${W}px`; wrap.style.height = `${H}px`; }
const canvas = document.getElementById('c') as HTMLCanvasElement;
const t0 = performance.now();
const look = applyLook(q.get('look') ?? still.look ?? 'raw');
const st = still.make(canvas, W, H);
document.getElementById('overlay')!.innerHTML = still.overlay ?? '';
let post: PostFX | null = null;
if (look.post) {
  post = new PostFX(st.renderer, W, H); Object.assign(post.p, look.post);
  for (const k of Object.keys(post.p)) if (q.get(`p_${k}`) !== null && typeof (post.p as any)[k] === 'number') (post.p as any)[k] = Number(q.get(`p_${k}`)); st.tick?.(0); post.render(st.scene, st.camera, still.time ?? 0); }
else { st.tick?.(0); st.renderer.render(st.scene, st.camera); }
const info = st.renderer.info.render;
const stats = [...st.stats, `tris ${info.triangles.toLocaleString()} · calls ${info.calls} · build+render ${Math.round(performance.now() - t0)} ms`].join('\n');
const pre = document.getElementById('stats')!;
pre.textContent = stats;
if (q.get('stats')) pre.style.opacity = '1';
console.log(stats);
(window as unknown as { __done: string; __st: Stage }).__st = st;
(window as unknown as { __done: string }).__done = stats;
// animated scenes: window.__frame(t) poses the scene at time t and renders it (the clip recorder steps this)
(window as unknown as { __frame: (t: number) => void; __duration: number }).__duration = st.duration ?? 0;
(window as unknown as { __frame: (t: number) => void }).__frame = (t: number) => {
  st.tick?.(t);
  if (post) post.render(st.scene, st.camera, (still.time ?? 0) + t); else st.renderer.render(st.scene, st.camera);
};
if (q.get('play')) { const t0 = performance.now(); const loop = () => { (window as any).__frame(((performance.now() - t0) / 1000) % (st.duration || 8)); requestAnimationFrame(loop); }; requestAnimationFrame(loop); }
