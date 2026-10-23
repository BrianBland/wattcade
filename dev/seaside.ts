// Seaside later-story prototype scenes (perf references for the engine).
//   /dev/seaside.html?still=belly|drill|monkey|lava|reentry[&look=…][&stats=1]
//   &play=1 plays live with the fps / triangles / draw calls overlay and the automatic chunky-pixel fallback (&pixel=auto|on|off).
import type { Stage } from '../src/games/seaside/stills/stage';
import { stillBelly } from '../src/games/seaside/stills/later/belly';
import { stillMonkey } from '../src/games/seaside/stills/later/monkey';
import { stillLava } from '../src/games/seaside/stills/later/lava';
import { stillReentry } from '../src/games/seaside/stills/later/reentry';
import { stillDrill } from '../src/games/seaside/stills/later/drill';
import { applyLook, chunky } from '../src/games/seaside/render/looks';
import { PostFX } from '../src/games/seaside/render/post';
import { PerfGovernor } from '../src/games/seaside/render/perf';

type Still = { make: (c: HTMLCanvasElement, w: number, h: number) => Stage; overlay?: string; look?: string; time?: number };
const bubble = (s: string) => `<div class="bubble">${s}</div>`;
const STILLS: Record<string, Still> = {
  monkey: { make: stillMonkey, overlay: bubble('Well. In we go.'), look: 'jungle', time: 2 },
  lava: { make: stillLava, overlay: bubble('Those are fish.'), look: 'lava', time: 5 },
  reentry: { make: stillReentry, look: 'reentry', time: 7 },
  drill: { make: stillDrill, overlay: bubble('Bone. Bone is close to out.'), look: 'belly', time: 4 },
  belly: { make: stillBelly, overlay: bubble('That’s my old rod.'), look: 'belly', time: 3 },
};

const q = new URLSearchParams(location.search);
const name = q.get('still') ?? 'belly', still = STILLS[name] ?? STILLS.belly;
const live = !!q.get('play') && !q.get('w');
const W = live ? Math.round(innerWidth * Math.min(devicePixelRatio, 2)) : Number(q.get('w') ?? 1600), H = live ? Math.round(innerHeight * Math.min(devicePixelRatio, 2)) : Number(q.get('h') ?? 900);
const wrap = document.getElementById('wrap')!;
if (live) { wrap.style.width = '100vw'; wrap.style.height = '100vh'; (document.getElementById('c') as HTMLCanvasElement).style.cssText = 'width:100%;height:100%'; }
else if (q.get('w')) { wrap.style.width = `${W}px`; wrap.style.height = `${H}px`; }
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
if (q.get('play')) {
  // live: the perf governor drops to chunky pixels when the scene can't hold 40 fps
  const gov = new PerfGovernor({}, q.get('pixel') === 'on' ? 2 : 0), auto = (q.get('pixel') ?? 'auto') === 'auto', base = { ...(post?.p ?? {}) };
  if (!post) { post = new PostFX(st.renderer, W, H); Object.assign(post.p, look.post ?? {}); }
  if (gov.level) Object.assign(post.p, chunky({ ...post.p }, gov.level));
  pre.style.opacity = '1';
  const t0 = performance.now();
  let last = t0, n = 0, acc = 0, worst = 0, shown = '';
  const loop = (now: number) => {
    const dt = now - last; last = now; n++; acc += dt; worst = Math.max(worst, dt);
    if (acc > 1000) { shown = `${((n * 1000) / acc).toFixed(1)} fps · worst ${worst.toFixed(0)} ms`; n = 0; acc = 0; worst = 0; }
    if (auto && gov.sample(dt / 1000)) Object.assign(post!.p, chunky({ ...post!.p, ...base, pixel: 1 }, gov.level));
    (window as any).__frame(((now - t0) / 1000) % (st.duration || 8));
    const info = st.renderer.info.render;
    pre.textContent = `${shown}\n${W}×${H} · ${(info.triangles / 1e6).toFixed(2)} M tris · ${info.calls} calls · pixel ×${post!.p.pixel} (governor ${gov.level})`;
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}
