// Seaside fishing (#187) in the voxel world: the live sim at the turnout with the fishing rig in hand.
//   /dev/seaside-fishing.html?script=z2&scene=turnout1&inset=140 — arrows / N M pick a spot, L = A (cast, strike);
//   keys 1–3 = ×1/×4/×10. Capture: window.__session, window.__view, window.__frame() renders once tiles are in.
import { createGameSession, testProfile } from '../src/core';
import { InputHub } from '../src/input';
import { module } from '../src/games/seaside';
import { FishingRig } from '../src/games/seaside/render/fishingRig';
import { WorldView } from '../src/games/seaside/render/worldView';
import type { SeasideSnapshot } from '../src/games/seaside/sim/types';
import { edgeD, roadX, sAtZ, SEA_LEVEL } from '../src/games/seaside/world/coast';
import { getWorld } from '../src/games/seaside/world/worlds';

const q = new URLSearchParams(location.search);
const capture = !!q.get('capture'), inset = Number(q.get('inset') ?? 0);
const scene = q.get('scene') ?? 'turnout1';
const hub = new InputHub();
hub.attachKeyboard(window);
const session = createGameSession({
  game: module, profile: testProfile(), input: hub, fake: { script: q.get('script') ?? 'z2' }, seed: Number(q.get('seed') ?? 1),
  simOpts: { skipMenu: true, save: { v: 1, rides: 0, chapterSelect: false, checkpoint: { sceneId: scene, progress: 0 } } },
});
const canvas = document.getElementById('c') as HTMLCanvasElement, info = document.getElementById('info')!, hud = document.getElementById('hud')!;
if (inset) { hud.style.display = 'block'; hud.style.height = `${inset}px`; }
const W = capture ? Number(q.get('w') ?? 1280) : innerWidth, H = capture ? Number(q.get('h') ?? 720) : innerHeight;
if (capture) { const wrap = document.getElementById('wrap')!; wrap.style.width = `${W}px`; wrap.style.height = `${H}px`; }
const view = new WorldView(canvas, getWorld('coast'), { preserve: capture, pixelRatio: capture ? 1 : undefined, overlay: capture ? null : document.getElementById('fps') });
view.resize(W, H);
view.setInsets({ top: 0, right: 0, bottom: inset, left: 0 });
const rig = new FishingRig(view.stage);

// standing at the turnout's sea edge, looking out and down at the water (the prototype's shot)
const tz = -71, s = sAtZ(tz), lateral = edgeD(tz) + 1.5, aim = { x: roadX(tz) + lateral - 30, y: SEA_LEVEL + 6, z: tz - 4 };
const SPEEDS = [1, 4, 10];
let speed = 1;
window.addEventListener('keydown', (e) => { const i = Number(e.key) - 1; if (SPEEDS[i]) speed = SPEEDS[i]; });

const draw = () => {
  const snap = session.sim.snapshot() as SeasideSnapshot, f = snap.fishing, t = session.ctx.clock.now();
  view.frame({ t, routeS: s, speed: 0, lateral, aim, bars: !f, look: 'morning', dream: snap.look.dream });
  rig.update(f, t, { waterY: SEA_LEVEL });
  const b = session.bikeStore.get();
  info.textContent = f
    ? `${snap.scene.title} · ${f.spots[f.spot].name} · ${f.phase}${f.fish ? ` · ${f.fish.name} ${f.fish.kg} kg $${f.fish.value}` : ''}\n`
      + `tension ${f.tension.toFixed(2)} · stamina ${f.stamina.toFixed(2)} · caught ${f.caught.length}/${f.slots} · ${Math.round(b.power3s)} W ${Math.round(b.cadence3s)} rpm · ×${speed}`
    : `${snap.scene.title} (not fishing)`;
};

type Win = { __session?: unknown; __view?: WorldView; __frame?: () => Promise<void> };
const win = window as unknown as Win;
win.__session = session; win.__view = view;
win.__frame = async () => { draw(); await view.terrain.whenReady(); draw(); };
if (!capture) {
  addEventListener('resize', () => view.resize(innerWidth, innerHeight));
  let last = performance.now(), acc = 0;
  const loop = (now: number) => {
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    acc += dt * speed * 30;
    const n = Math.floor(acc); acc -= n;
    if (n > 0) session.step(n);
    draw();
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}
