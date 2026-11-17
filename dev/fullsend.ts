// Full Send live preview: the real sim on the fake bike, with the renderer. `?script=hook-responsive&tour=quick&sec=300&inset=100&manual=1`.
import { createGameSession, NullInput, testProfile } from '../src/core';
import { module as game } from '../src/games/fullsend';
import type { FullSendSnapshot } from '../src/games/fullsend/sim/sim';

const q = new URLSearchParams(location.search), app = document.getElementById('app')!, hud = document.getElementById('hud')!;
const inset = Number(q.get('inset') ?? 100);
hud.style.height = `${inset}px`;
const session = createGameSession({
  game, profile: testProfile({ color: '#4cc9f0' }), input: new NullInput(),
  fake: { script: q.get('script') ?? 'hook-responsive' }, seed: Number(q.get('seed') ?? 1),
  simOpts: { ...(q.get('tour') ? { tour: q.get('tour') } : {}), autolean: q.get('autolean') !== '0', autojet: q.get('autojet') === '1', ...(q.get('forks') ? { forks: q.get('forks') } : {}) },
});
session.step(Math.round(Number(q.get('sec') ?? 0) * 30));
const r = await game.loadRenderer();
const insets = { top: 0, right: 0, bottom: inset, left: 0 };
r.mount(app, { profile: session.ctx.profile, insets });
r.setInsets?.(insets);
const draw = () => r.render(session.sim.snapshot(), session.bikeStore.get(), session.ctx.input());
const snap = () => session.sim.snapshot() as FullSendSnapshot;
/** Step until `pred(snapshot)` holds (or `maxS` sim seconds pass). */
const until = (pred: (s: FullSendSnapshot) => boolean, maxS = 1800) => {
  for (let i = 0; i < maxS * 30 && !pred(snap()); i++) session.step(1);
  draw(); return snap();
};
(window as unknown as { __fs: unknown }).__fs = { step: (n: number) => { session.step(n); draw(); return snap(); }, until, snapshot: snap, draw };
window.addEventListener('resize', () => { r.resize?.(app.clientWidth, app.clientHeight); draw(); });
if (!q.has('manual')) {
  let last = performance.now(), acc = 0;
  const frame = (now: number) => {
    acc += Math.min(0.1, (now - last) / 1000); last = now;
    const n = Math.floor(acc * 30); acc -= n / 30; if (n) session.step(n);
    draw(); requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
} else draw();
