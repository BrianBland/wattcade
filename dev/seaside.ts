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
const W = 1600, H = 900;
const canvas = document.getElementById('c') as HTMLCanvasElement;
const t0 = performance.now();
const look = applyLook(q.get('look') ?? still.look ?? 'raw');
const st = still.make(canvas, W, H);
document.getElementById('overlay')!.innerHTML = still.overlay ?? '';
if (look.post) {
  const post = new PostFX(st.renderer, W, H); Object.assign(post.p, look.post);
  for (const k of Object.keys(post.p)) if (q.get(`p_${k}`) !== null && typeof (post.p as any)[k] === 'number') (post.p as any)[k] = Number(q.get(`p_${k}`)); post.render(st.scene, st.camera, still.time ?? 0); }
else st.renderer.render(st.scene, st.camera);
const info = st.renderer.info.render;
const stats = [...st.stats, `tris ${info.triangles.toLocaleString()} · calls ${info.calls} · build+render ${Math.round(performance.now() - t0)} ms`].join('\n');
const pre = document.getElementById('stats')!;
pre.textContent = stats;
if (q.get('stats')) pre.style.opacity = '1';
console.log(stats);
(window as unknown as { __done: string; __st: Stage }).__st = st;
(window as unknown as { __done: string }).__done = stats;
