import { createGameSession, NullInput, testProfile } from '../src/core';
import { synthTimeline } from '../src/media/synth/queue';
import { module } from '../src/games/starfighter';
import { SfRenderer } from '../src/games/starfighter/render/renderer';
const q = new URLSearchParams(location.search), profile = testProfile({ color: '#73c6d9' });
if (q.get('unlocked') === '1' || q.get('craft') === 'escort') profile.gameData.starfighter = { bank: 1000 };
const session = createGameSession({ game: module, profile, input: new NullInput(), fake: { script: q.get('script') ?? 'z2' },
  seed: Number(q.get('seed') ?? 1), simOpts: { skipHangar: q.get('menu') !== '1', craft: q.get('craft') ?? 'cruiser' },
  media: { timeline: synthTimeline({ style: 'mixed', songs: 20, seed: 3 }) } });
const renderer = new SfRenderer();
renderer.mount(document.getElementById('app')!, { profile, send: a => session.sim.receive?.(a), insets: { top: 0, left: 0, right: 0, bottom: Number(q.get('inset') ?? 100) } });
session.step(Math.round(Number(q.get('sec') ?? 0) * 30));
const frame = () => renderer.render(session.sim.snapshot(), session.ctx.bike(), session.ctx.input());
const api = { advance(seconds: number, render = true) { session.step(Math.round(seconds * 30)); if(render) frame(); }, snapshot: () => session.sim.snapshot(),
  resources: () => renderer.debugResources(), script: (name: string) => session.fakeBike?.useScript(name),
  dispose: () => { renderer.unmount(); session.sim.dispose?.(); } };
Object.assign(window, { __squadron: api });
if (q.get('manual') === '1') frame(); else { let last = performance.now(); const loop = (now: number) => { session.frame(Math.min(0.1, (now - last) / 1000)); last = now; frame(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); }
