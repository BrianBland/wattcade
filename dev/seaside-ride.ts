// Seaside production engine: ride any world along its route with streaming, looks and the perf fallback.
//   Live / iPad perf:  /dev/seaside-ride.html?world=coast|belly &speed=8.5 &s=0 (start m) &look=morning &dream=0.2
//                      &pixel=auto|on|off &res=1 (resolution scale) &workers=3 &inset=140 (fake HUD height, CSS px)
//   Capture (scripts): &capture=1&w=1280&h=720 → window.__frame(t) renders the frame at time t once its tiles are in;
//                      window.__pose(t) poses + streams without rendering; window.__view is the WorldView.
import { WorldView } from '../src/games/seaside/render/worldView';
import { getWorld } from '../src/games/seaside/world/worlds';
import type { PixelSetting } from '../src/games/seaside/render/perf';

const q = new URLSearchParams(location.search);
const num = (k: string, d: number) => (q.get(k) !== null ? Number(q.get(k)) : d);
const capture = !!q.get('capture');
const canvas = document.getElementById('c') as HTMLCanvasElement, fpsEl = document.getElementById('fps')!, hud = document.getElementById('hud')!;
const world = getWorld(q.get('world') ?? 'coast');
const speed = num('speed', world.id === 'coast' ? 8.5 : 3), s0 = num('s', 0);
const W = capture ? num('w', 1280) : innerWidth, H = capture ? num('h', 720) : innerHeight;
if (capture) { const wrap = document.getElementById('wrap')!; wrap.style.width = `${W}px`; wrap.style.height = `${H}px`; }
const inset = num('inset', 0);
if (inset) { hud.style.display = 'block'; hud.style.height = `${inset}px`; }
const t0 = performance.now();
const view = new WorldView(canvas, world, {
  pixelRatio: capture ? 1 : Math.min(devicePixelRatio, 2) * num('res', 1), pixel: (q.get('pixel') ?? 'auto') as PixelSetting,
  workers: q.get('workers') !== null ? num('workers', 3) : undefined, preserve: capture, overlay: capture ? null : fpsEl,
});
view.resize(W, H);
view.setInsets({ top: 0, right: 0, bottom: inset, left: 0 });
const buildMs = Math.round(performance.now() - t0);
const look = q.get('look') ?? undefined, dream = q.get('dream') !== null ? num('dream', 0) : undefined;
const duration = (world.route.length - s0) / speed;
const at = (t: number) => ({ t, routeS: s0 + speed * t, speed, look, dream });

type Win = { __frame?: (t: number) => Promise<void>; __pose?: (t: number) => void; __view?: WorldView; __ready?: { duration: number; buildMs: number } };
const win = window as unknown as Win;
if (capture) {
  win.__view = view;
  win.__pose = (t) => view.pose(at(t));
  win.__frame = async (t) => { view.pose(at(t)); await view.terrain.whenReady(); view.frame(at(t)); };
  win.__ready = { duration, buildMs };
} else {
  fpsEl.style.display = 'block';
  addEventListener('resize', () => view.resize(innerWidth, innerHeight));
  const start = performance.now();
  const loop = (now: number) => { view.frame(at(((now - start) / 1000) % duration)); requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
}
