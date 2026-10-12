import { expect, it } from 'vitest';
import { FIXED_DT } from '../../contracts';
import { SimClock } from '../../core/clock';
import { GameLoop } from '../../core/loop';
import type { WarmupSnapshot } from '../../games/warmup/sim/sim';
import { biomeAt } from '../../games/warmup/sim/terrain';
import { VisualSnapshot } from './visualSnapshot';

const snapshot = (t: number, d: number): WarmupSnapshot => {
  const b = biomeAt(d, 1000, 0, 300);
  return { t, d, v: 6, grade: 2, hill: 1, hillsOn: true, maxGrade: 3, exaggeration: 2,
    biomeM: 1000, blendM: 300, terrainSeed: 1, startBiome: 0, biome: b.dom, nextBiome: b.next,
    from: b.cur, to: b.next, mix: b.mix, toNextM: b.toNextM, driveIn: 0, driveInOn: false,
    rodeM: d, climbM: 4, topKph: 22, hooks: {} };
};

it('fills the intervening display frame between 30 Hz ticks without advancing physics', () => {
  const clock = new SimClock(); let ticks = 0;
  const loop = new GameLoop(clock, dt => { ticks++; clock.advance(dt); });
  const visual = new VisualSnapshot(), session = {};
  visual.sample(snapshot(0, 600), 0, session);
  loop.frame(FIXED_DT);
  const raw = snapshot(clock.now(), 600.2);
  expect(visual.sample(raw, loop.interpolationAlpha, session).d).toBe(600);
  loop.frame(FIXED_DT / 2);
  expect(loop.interpolationAlpha).toBeCloseTo(.5);
  expect(visual.sample(raw, loop.interpolationAlpha, session).d).toBeCloseTo(600.1);
  expect(ticks).toBe(1); expect(raw.d).toBe(600.2); expect(raw.rodeM).toBe(600.2);
  loop.frame(FIXED_DT / 2);
  expect(visual.sample(snapshot(clock.now(), 600.4), loop.interpolationAlpha, session).d).toBeCloseTo(600.2);
});

it('keeps displayed biome weights consistent with the interpolated road position', () => {
  const visual = new VisualSnapshot(), session = {};
  visual.sample(snapshot(0, 999.9), 0, session);
  const raw = snapshot(FIXED_DT, 1000.1), drawn = visual.sample(raw, .25, session);
  const b = biomeAt(drawn.d, raw.biomeM, raw.startBiome, raw.blendM);
  expect(drawn.d).toBeCloseTo(999.95);
  expect([drawn.biome, drawn.from, drawn.to, drawn.mix]).toEqual([b.dom, b.cur, b.next, b.mix]);
  expect(drawn.nextBiome).toBe(biomeAt(drawn.d + b.toNextM + 1, raw.biomeM, raw.startBiome, 1).dom);
  expect(raw.d).toBe(1000.1);
});

it('resets on a new session, a rewind, or missed ticks instead of animating a long jump', () => {
  const visual = new VisualSnapshot(), session = {};
  visual.sample(snapshot(0, 600), 0, session);
  expect(visual.sample(snapshot(2, 612), .5, session).d).toBe(612);
  expect(visual.sample(snapshot(0, 0), .5, session).d).toBe(0);
  expect(visual.sample(snapshot(FIXED_DT, 1200), .5, {}).d).toBe(1200);
});

it('does not accumulate display movement while the simulation is paused', () => {
  const clock = new SimClock(), loop = new GameLoop(clock, dt => clock.advance(dt));
  loop.frame(FIXED_DT * 1.5); loop.pause();
  loop.frame(10);
  expect(clock.now()).toBe(FIXED_DT); expect(loop.interpolationAlpha).toBeCloseTo(.5);
});
