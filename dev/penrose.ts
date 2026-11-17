// Dev harness: run Penrose Pedals on the fake bike without the shell.
//   /dev/penrose.html?script=z2&inset=120&level=0
// Machines: keyboard face buttons (see src/input). window.__pp exposes the session and renderer for scripted checks.
import { createGameSession, testProfile } from '../src/core';
import { InputHub } from '../src/input';
import { module } from '../src/games/penrose';

const q = new URLSearchParams(location.search);
const inset = Number(q.get('inset') ?? 120);
const hub = new InputHub();
hub.attachKeyboard(window);
const profile = testProfile();
if (q.get('level')) profile.gameData.penrose = { done: [], at: Number(q.get('level')) };
const session = createGameSession({ game: module, profile, input: hub, fake: { script: q.get('script') ?? 'z2' }, seed: 1 });
const app = document.getElementById('app')!, bar = document.getElementById('hudfake')!;
bar.style.height = `${inset}px`;
const r = await module.loadRenderer();
r.mount(app, { profile, insets: { top: 0, right: 0, bottom: inset, left: 0 }, send: (a) => session.sim.receive?.(a) });
(window as unknown as { __pp: unknown }).__pp = { session, r };
let last = performance.now();
const loop = (now: number) => {
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  session.frame(dt);
  const b = session.bikeStore.get();
  bar.textContent = `${Math.round(b.power3s)} W · ${Math.round(b.cadence3s)} rpm · gear ${b.gear} · ${JSON.stringify(session.sim.hud?.().controls?.map((c) => c.button + ' ' + c.label))}`;
  r.render(session.sim.snapshot(), b, session.ctx.input());
  requestAnimationFrame(loop);
};
requestAnimationFrame(loop);
