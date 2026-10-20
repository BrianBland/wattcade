// Seaside motion test.
//   Live / iPad perf:  /dev/seaside-ride.html   knobs: ?look=raw|crafted|illustrated|pixel|morning|midday|fever &lod=1 &bake=1 &greedy=1 &mid=0 &far=0 &shadows=0 &close=0 &res=0.75 &midv=2 &farv=12 &smap=2048 &t=12 (start time)
//                      ?lite=1 = close=0 midv=2 farv=12 smap=2048 res=0.75
//   Capture (script):  /dev/seaside-ride.html?capture=1&w=1280&h=720  → window.__frame(t) renders one frame at time t
import { createRide, type Overlay } from '../src/games/seaside/stills/ride';
import { applyLook } from '../src/games/seaside/render/looks';
import { PostFX } from '../src/games/seaside/render/post';

const q = new URLSearchParams(location.search);
const on = (k: string) => q.get(k) !== '0';
const capture = !!q.get('capture');
const canvas = document.getElementById('c') as HTMLCanvasElement, ov = document.getElementById('ov')!, fpsEl = document.getElementById('fps')!;
const lite = !!q.get('lite');
const res = Number(q.get('res') ?? (lite ? 0.75 : 1));
const W = capture ? Number(q.get('w') ?? 1280) : Math.round(innerWidth * Math.min(devicePixelRatio, 2) * res);
const H = capture ? Number(q.get('h') ?? 720) : Math.round(innerHeight * Math.min(devicePixelRatio, 2) * res);
if (capture) { const wrap = document.getElementById('wrap')!; wrap.style.width = `${W}px`; wrap.style.height = `${H}px`; }
const t0 = performance.now();
const num = (k: string, d?: number) => (q.get(k) ? Number(q.get(k)) : d);
const knobs = { routeLod: num('routelod'), hyst: num('hyst'), fade: num('fade'), road: q.get('road') === '1', cluster: num('cluster'), workers: num('workers'), bake: q.get('bake') === '1', lodK: num('lodk'), lodRes: num('lodres'), lodMin: num('lodmin'), skirt: num('skirt'), aoFrom: num('aofrom'), lod: q.get('lod') === '1', farAO: q.get('farao') !== '0', greedy: Number(q.get('greedy') ?? 0) as 0 | 1 | 2, mid: on('mid'), far: on('far'), shadows: on('shadows'), close: lite ? q.get('close') === '1' : on('close'), midVoxel: num('midv', lite ? 2 : undefined), farVoxel: num('farv', lite ? 12 : undefined), shadowMap: num('smap', lite ? 2048 : undefined) };
const ride = createRide(canvas, W, H, knobs);
ride.stage.camera.aspect = W / H; ride.stage.camera.updateProjectionMatrix();
const buildMs = Math.round(performance.now() - t0);
const look = applyLook(q.get('look') ?? 'raw', q.get('detail') !== null ? Number(q.get('detail')) : undefined); // ?detail=0..1 mixed-size cubes
const post = look.post ? new PostFX(ride.stage.renderer, W, H) : null;
if (post) {
  Object.assign(post.p, look.post);
  for (const k of Object.keys(post.p)) if (q.get(`p_${k}`) !== null && typeof (post.p as any)[k] === 'number') (post.p as any)[k] = Number(q.get(`p_${k}`)); // ?p_outline=0 etc.
}
console.log(ride.stage.stats.join('\n'));

function drawOverlay(o: Overlay) {
  ov.innerHTML = (o.bubble ? `<div class="bubble">${o.bubble}</div>` : '') + (o.bang ? '<div class="bang">!</div>' : '')
    + (o.prompt ? `<div class="prompt">${o.prompt}</div>` : '') + (o.meter !== undefined ? `<div class="meter"><i style="width:${Math.round(o.meter * 100)}%"></i></div>` : '')
    + (o.fade ? `<div class="fade" style="opacity:${o.fade.toFixed(3)}"></div>` : '');
}
function frame(t: number) { ride.setTime(t); if (post) post.render(ride.stage.scene, ride.stage.camera, t); else ride.stage.renderer.render(ride.stage.scene, ride.stage.camera); drawOverlay(ride.overlay(t)); }
/** Capture: wait until every terrain tile for this camera is built (workers are async), then render. */
async function frameExact(t: number) { ride.setTime(t); await ride.terrain?.whenReady(); frame(t); }

type Win = { __frame?: (t: number) => Promise<void>; __ready?: { duration: number; buildMs: number } };
if (capture) {
  (window as unknown as Win).__frame = frameExact;
  (window as unknown as { __ride: unknown }).__ride = ride;
  (window as unknown as Win).__ready = { duration: ride.duration, buildMs };
} else {
  fpsEl.style.display = 'block';
  const start = performance.now() - Number(q.get('t') ?? 0) * 1000;
  let n = 0, acc = 0, worst = 0, last = performance.now(), shown = '';
  const loop = (now: number) => {
    const dt = now - last; last = now; n++; acc += dt; worst = Math.max(worst, dt);
    if (acc > 1000) { shown = `${(n * 1000 / acc).toFixed(1)} fps · worst ${worst.toFixed(0)} ms`; n = 0; acc = 0; worst = 0; }
    frame(((now - start) / 1000) % ride.duration);
    const info = ride.stage.renderer.info.render;
    const ts = ride.terrain?.stats;
    fpsEl.textContent = `${shown}\n${W}×${H} · ${(info.triangles / 1e6).toFixed(2)} M tris · ${info.calls} calls\nbuild ${buildMs} ms${ts ? ` · tiles ${ts.leaves} in ${ts.clusters} clusters · pending ${ts.pending} · ${ts.workers} workers` : ''}\n${JSON.stringify(knobs)}`;
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}
