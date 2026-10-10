// Dev harness for the arcade card clips (scripts/capture-cards.ts): one game's real renderer on the fake bike, no shell, no HUD.
//   /dev/capture.html?game=hamster&script=z2&sec=900&seed=1&opts={"autopilot":true}&media=edm
//   &timeline=[{"t":2,"press":"right"},...] scripts controller input (seconds from session start, incl. `sec`)
// Steps the sim `sec` seconds headlessly first so the clip shows a game in full swing, then renders in real time.
import { createGameSession, NullInput, testProfile, TimelineInput } from '../src/core';
import { synthTimeline } from '../src/media/synth/queue';
import { getGame } from '../src/games/registry';

const q = new URLSearchParams(location.search);
const game = getGame(q.get('game') ?? '')!;
const profile = testProfile({ color: q.get('color') ?? '#ff2bd6' });
const media = q.get('media') ? { timeline: synthTimeline({ style: q.get('media') as 'edm', songs: 2, seed: 1, mix: 'automix' }) } : undefined;
const session = createGameSession({
  game, profile, input: q.get('timeline') ? new TimelineInput(JSON.parse(q.get('timeline')!)) : new NullInput(), fake: { script: q.get('script') ?? 'z2' }, seed: Number(q.get('seed') ?? 1),
  simOpts: JSON.parse(q.get('opts') ?? '{}'), ...(media ? { media } : {}),
});
session.step(Math.round(Number(q.get('sec') ?? 0) * 30));
const r = await game.loadRenderer();
r.mount(document.getElementById('app')!, { profile, send: (a) => session.sim.receive?.(a), insets: { top: 0, right: 0, bottom: 0, left: 0 } });
r.setInsets?.({ top: 0, right: 0, bottom: 0, left: 0 });
type W = { __frames?: number; __advance?: (ms: number) => void; __vclock?: (ms: number) => void };
const w = window as unknown as W;
const frame = () => { r.render(session.sim.snapshot(), session.bikeStore.get(), session.ctx.input()); w.__frames = (w.__frames ?? 0) + 1; };
// manual=1 (capture script): time only moves when the script calls __advance(ms); performance.now is virtual (__vclock).
if (q.get('manual')) {
  let acc = 0;
  w.__advance = (ms) => { w.__vclock?.(ms); acc += ms / 1000; const n = Math.floor(acc * 30); acc -= n / 30; if (n) session.step(n); frame(); };
} else {
let last = performance.now(), acc = 0;
const loop = (now: number) => {
  acc += Math.min(0.1, (now - last) / 1000); last = now;
  const n = Math.floor(acc * 30); acc -= n / 30;
  if (n) session.step(n);
  frame();
  requestAnimationFrame(loop);
};
requestAnimationFrame(loop);
}
