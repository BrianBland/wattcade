// Dev harness: ride the Seaside story (placeholder scenes) on the fake bike without the shell.
//   /dev/seaside-play.html?script=z2&speed=30&scene=drill1&inset=120
// ?scene=<id> starts there (as if resuming a save); ?menu=1 shows the chapter-select menu; keys 1–5 set ×1/×10/×30/×60/×120.
import { createGameSession, testProfile } from '../src/core';
import { InputHub } from '../src/input';
import { module } from '../src/games/seaside';

const q = new URLSearchParams(location.search);
const script = q.get('script') ?? 'z2';
const inset = Number(q.get('inset') ?? 120);
let speed = Number(q.get('speed') ?? 1);
const scene = q.get('scene');
const save = { v: 1, rides: q.get('menu') ? 1 : 0, chapterSelect: !!q.get('menu'), checkpoint: scene ? { sceneId: scene, progress: 0 } : null };
const hub = new InputHub();
hub.attachKeyboard(window);
const session = createGameSession({
  game: module, profile: testProfile(), input: hub, fake: { script }, seed: Number(q.get('seed') ?? 1),
  simOpts: { save, ...(q.get('menu') ? {} : { skipMenu: true }) },
});
const SPEEDS = [1, 10, 30, 60, 120];
window.addEventListener('keydown', (e) => { const i = Number(e.key) - 1; if (SPEEDS[i]) speed = SPEEDS[i]; });
const app = document.getElementById('app')!, bar = document.getElementById('hudfake')!;
bar.style.height = `${inset}px`;
const r = await module.loadRenderer();
r.mount(app, { profile: testProfile(), insets: { top: 0, right: 0, bottom: inset, left: 0 }, send: (a) => session.sim.receive?.(a) });
let last = performance.now(), acc = 0;
const loop = (now: number) => {
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  acc += dt * speed * 30;
  const n = Math.floor(acc); acc -= n;
  if (n > 0) session.step(n);
  const b = session.bikeStore.get(), d = session.debugValues();
  bar.textContent = `×${speed} · ${Math.round(b.power3s)} W · ${Math.round(b.cadence3s)} rpm · ${b.trainerMode} · t ${(session.ctx.clock.now() / 60).toFixed(1)} min · ${d.scene ?? ''} ${d.progress ?? ''} · lag ${d.lagS ?? 0} s${session.sim.isOver() ? ' · THE END' : ''}`;
  r.render(session.sim.snapshot(), b, session.ctx.input());
  (window as any).__frames = ((window as any).__frames ?? 0) + 1;
  requestAnimationFrame(loop);
};
requestAnimationFrame(loop);
