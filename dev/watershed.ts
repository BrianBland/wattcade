// Dev harness: run Watershed on the fake bike without the shell.
//   /dev/watershed.html?script=cadence-follow&min=15&autopilot=1&inset=120&speed=1
import { createGameSession, NullInput, testProfile } from '../src/core';
import { InputHub } from '../src/input';
import { module } from '../src/games/watershed';

const q = new URLSearchParams(location.search);
const script = q.get('script') ?? 'cadence-follow';
const inset = Number(q.get('inset') ?? 120), speed = Number(q.get('speed') ?? 1);
const hub = new InputHub();
hub.attachKeyboard(window);
const session = createGameSession({
  game: module, profile: testProfile(), input: q.get('autopilot') ? new NullInput() : hub, fake: { script }, seed: Number(q.get('seed') ?? 1),
  // ?menu=1 shows the pre-game ride-length menu; otherwise ?length= (default 45) starts straight away
  simOpts: { ...(q.get('autopilot') ? { autopilot: true } : {}), ...(q.get('menu') ? {} : { length: Number(q.get('length') ?? 45) }), ...(q.get('events') ? { events: q.get('events')!.split(',') } : {}) },
});
session.step(Math.round(Number(q.get('min') ?? 0) * 60 * 30));
const app = document.getElementById('app')!, bar = document.getElementById('hudfake')!;
bar.style.height = `${inset}px`;
const r = await module.loadRenderer();
r.mount(app, { profile: testProfile(), insets: { top: 0, right: 0, bottom: inset, left: 0 } });
let last = performance.now();
const loop = (now: number) => {
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  session.step(Math.max(1, Math.round((dt * speed) / (1 / 30))));
  const b = session.bikeStore.get();
  bar.textContent = `${Math.round(b.power3s)} W · ${Math.round(b.cadence3s)} rpm · ${b.trainerMode} · t ${session.ctx.clock.now().toFixed(0)} s`;
  r.render(session.sim.snapshot(), b, session.ctx.input());
  (window as any).__frames = ((window as any).__frames ?? 0) + 1;
  requestAnimationFrame(loop);
};
requestAnimationFrame(loop);
