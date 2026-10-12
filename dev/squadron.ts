import '../src/styles/main.css';
import { createGameSession, NullInput, testProfile } from '../src/core';
import { synthTimeline } from '../src/media/synth/queue';
import { module } from '../src/games/starfighter';
import { SfRenderer } from '../src/games/starfighter/render/renderer';
const q = new URLSearchParams(location.search), profile = testProfile({ color: '#73c6d9' });
if (q.get('unlocked') === '1' || q.get('craft') === 'escort') profile.gameData.starfighter = { bank: 1000 };
// ?level=N seeds both craft at level N (minutes from the level table); ?pace=N speeds in-ride arsenal tiers.
const LEVEL_MIN = [0, 45, 90, 150, 210, 285, 360, 450, 540, 630], seedMin = LEVEL_MIN[Math.max(0, Math.min(9, Number(q.get('level') ?? 1) - 1))];
if (q.get('level')) profile.gameData.starfighter = { v: 3, best: 0, legacyBest: 0, runs: 1, onTargetS: seedMin * 60, unlockCredit: 1000, craft: q.get('craft') ?? 'cruiser', totals: { kills: 0, bosses: 0 }, craftS: { cruiser: seedMin * 60, escort: seedMin * 60 }, unlocked: ['cruiser', 'escort'] };
const session = createGameSession({ game: module, profile, input: new NullInput(), fake: { script: q.get('script') ?? 'z2' },
  seed: Number(q.get('seed') ?? 1), simOpts: { skipHangar: q.get('menu') !== '1', craft: q.get('craft') ?? 'cruiser' },
  media: { timeline: synthTimeline({ style: (q.get('style') ?? 'mixed') as 'mixed', songs: Number(q.get('songs') ?? 20), seed: Number(q.get('mseed') ?? 3) }) } });
if (q.get('tester') === '1') session.tuning.set('starfighter.testerUnlockAll', 1);
if (q.get('weave')) session.tuning.set('starfighter.weave', Number(q.get('weave')));
if (q.get('pace')) session.tuning.set('starfighter.arsenalPace', Number(q.get('pace')));
const renderer = new SfRenderer();
renderer.mount(document.getElementById('app')!, { profile, send: a => session.sim.receive?.(a), insets: { top: 0, left: 0, right: 0, bottom: Number(q.get('inset') ?? 100) } });
session.step(Math.round(Number(q.get('sec') ?? 0) * 30));
const frame = () => renderer.render(session.sim.snapshot(), session.ctx.bike(), session.ctx.input());
const api = { advance(seconds: number, render = true) { session.step(Math.round(seconds * 30)); if(render) frame(); }, snapshot: () => session.sim.snapshot(),
  resources: () => renderer.debugResources(), position: () => session.ctx.media?.positionS() ?? 0, script: (name: string) => session.fakeBike?.useScript(name),
  dispose: () => { renderer.unmount(); session.sim.dispose?.(); } };
Object.assign(window, { __squadron: api });
if (q.get('manual') === '1') frame(); else { let last = performance.now(); const loop = (now: number) => { session.frame(Math.min(0.1, (now - last) / 1000)); last = now; frame(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); }
