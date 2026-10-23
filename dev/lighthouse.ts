// Dev harness: run Keeper's Light on the fake bike without the shell.
//   /dev/lighthouse.html?script=z2&min=20&autopilot=1&inset=120&speed=1   (add &gfx=webgl to force the WebGL2 backend)
import { createGameSession, NullInput, testProfile } from '../src/core';
import { InputHub } from '../src/input';
import { module } from '../src/games/lighthouse';
import { gfxStats } from '../src/gfx/stats';

const q = new URLSearchParams(location.search);
const inset = Number(q.get('inset') ?? 120), speed = Number(q.get('speed') ?? 1);
const hub = new InputHub();
hub.attachKeyboard(window);
const session = createGameSession({
  game: module, profile: testProfile(), input: q.get('autopilot') ? new NullInput() : hub, fake: { script: q.get('script') ?? 'z2' },
  seed: Number(q.get('seed') ?? 1), simOpts: q.get('autopilot') ? { autopilot: true } : {},
});
session.step(Math.round(Number(q.get('min') ?? 0) * 60 * 30));
const app = document.getElementById('app')!, bar = document.getElementById('hudfake')!;
bar.style.height = `${inset}px`;
const r = await module.loadRenderer();
(window as any).__r = r;
r.mount(app, { profile: testProfile(), insets: { top: 0, right: 0, bottom: inset, left: 0 } });
let last = performance.now();
const loop = (now: number) => {
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  session.step(Math.max(1, Math.round((dt * speed) / (1 / 30))));
  const b = session.bikeStore.get(), g = gfxStats();
  bar.textContent = `${Math.round(b.power3s)} W · ${Math.round(b.cadence3s)} rpm · t ${session.ctx.clock.now().toFixed(0)} s · ${g.backend} ${g.fps.toFixed(0)} fps`;
  const t0 = performance.now(); r.render(session.sim.snapshot(), b, session.ctx.input()); (window as any).__ms = ((window as any).__ms ?? 0) + performance.now() - t0;
  (window as any).__frames = ((window as any).__frames ?? 0) + 1;
  requestAnimationFrame(loop);
};
requestAnimationFrame(loop);
