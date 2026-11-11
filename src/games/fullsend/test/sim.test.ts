import { describe, expect, it } from 'vitest';
import { createGameSession, runHeadless, testProfile } from '../../../core';
import type { InputState } from '../../../contracts';
import { module } from '../index';
import { scenarios } from '../scenarios';
import { landingGrade, leapRange, loopExit, loopRadius, medalFor, smashCount, targetSpeed } from '../sim/physics';
import { TOURS } from '../sim/tour';

describe('scenarios via runHeadless', () => {
  for (const sc of scenarios) {
    it(sc.name, () => {
      const r = runHeadless({ game: module, script: sc.script, minutes: sc.minutes, seed: sc.seed, simOpts: sc.simOpts });
      expect(sc.assert(r.summary, r.stats, r)).toEqual([]);
    });
  }
  it('is deterministic', () => {
    const a = runHeadless({ game: module, script: 'mash', minutes: 8, seed: 9, simOpts: { tour: 'quick' } });
    const b = runHeadless({ game: module, script: 'mash', minutes: 8, seed: 9, simOpts: { tour: 'quick' } });
    expect(a.summary).toEqual(b.summary);
  });
});

describe('physics', () => {
  const g = 40, v = targetSpeed(1.1, 200 / 3.6);
  it('a leap gap sized for bronze is cleared at bronze speed', () => {
    const gap = leapRange(v, 35, g);
    expect(leapRange(v * 1.01, 35, g)).toBeGreaterThan(gap);
    expect(leapRange(v * 0.95, 35, g)).toBeLessThan(gap);
  });
  it('a loop sized for a speed is completed at that speed and not below', () => {
    const R = loopRadius(v, g);
    expect(loopExit(v, R, g)).toBeNull();
    const off = loopExit(v * 0.9, R, g)!;
    expect(off.slide).toBe(false);
    expect(off.angle).toBeGreaterThan(Math.PI / 2);
    expect(off.angle).toBeLessThan(Math.PI);
    expect(loopExit(v * 0.5, R, g)!.slide).toBe(true);
  });
  it('medals and smash counts rise with power', () => {
    const th = [1.2, 1.5, 1.8] as const;
    expect([1.0, 1.25, 1.6, 2].map((f) => medalFor(f, th))).toEqual([0, 1, 2, 3]);
    expect(smashCount(1.8, th, 10)).toBe(10);
    expect(smashCount(1.5, th, 10)).toBeGreaterThan(smashCount(1.2, th, 10));
    expect(smashCount(0.5, th, 10)).toBe(0);
  });
});

describe('tours', () => {
  it('end with a finale and stay near their advertised length', () => {
    for (const t of Object.values(TOURS)) {
      expect(t.sets.at(-1)!.finale).toBe(true);
      const total = t.warmupS + t.cooldownS + t.sets.reduce((a, s) => a + 20 + s.effortS + 5 + s.recoveryS, 0);
      expect(total / 60).toBeLessThan(t.id === 'quick' ? 20 : 31);
    }
  });
});

import { bumpAt, bumpH, takesOff } from '../sim/track';
describe('bumps (Line Rider hops)', () => {
  it('are continuous and come back to the road', () => {
    for (let x = 0; x < 20000; x += 0.25) expect(Math.abs(bumpH(x + 0.25, 7) - bumpH(x, 7))).toBeLessThan(0.6);
    const b = [...Array(200).keys()].map((k) => bumpAt(k * 140 + 70, 7)).find((q) => q?.kind === 'kicker')!;
    expect(bumpH(b.x0 - 0.01, 7)).toBe(0);
    expect(bumpH(b.x0 + b.len + 0.01, 7)).toBe(0);
    expect(bumpH(b.x0 + b.up, 7)).toBeCloseTo(b.h, 5);
  });
  it('fast riders take off over a crest that slow riders roll over', () => {
    const curv = -0.03; // 1/m, a roller crest
    expect(takesOff(40, curv, 30)).toBe(true);
    expect(takesOff(20, curv, 30)).toBe(false);
  });
  it('a Z2 cruise already gets airtime, a faster cruise gets more', () => {
    const z2 = runHeadless({ game: module, script: 'z2', minutes: 6, seed: 4, simOpts: { tour: 'quick' } }).summary;
    expect(Number(z2.hops)).toBeGreaterThan(10);
    expect(Number(z2.longestHopS)).toBeGreaterThan(0.4);
  });
});

describe('steering and landings', () => {
  const deg = (d: number) => (d * Math.PI) / 180;
  it('grades a landing by how far the bike is from the slope', () => {
    expect(landingGrade(deg(5))).toBe('perfect');
    expect(landingGrade(deg(-12))).toBe('good');
    expect(landingGrade(deg(20))).toBe('ok');
    expect(landingGrade(deg(-35))).toBe('bad');
  });
  it('hands-off riding never crashes and earns no flow; good steering is faster for the same watts', () => {
    const run = (autolean: boolean) => runHeadless({ game: module, script: 'z2', minutes: 10, seed: 3, simOpts: { tour: 'quick', autolean } }).summary;
    const hands = run(false), steer = run(true);
    expect(Number(hands.badLandings)).toBe(0);
    expect(Number(hands.flowPeakPct)).toBeLessThan(10);
    expect(Number(steer.perfectLandings)).toBeGreaterThan(20);
    expect(Number(steer.flowPeakPct)).toBeGreaterThanOrEqual(20);
    expect(Number(steer.distanceKm)).toBeGreaterThan(Number(hands.distanceKm) * 1.08);
  });
  it('holding a hard forward lean crashes landings, which bounce and cost speed', () => {
    const lean: InputState = { held: new Set(), pressed: new Set(), released: new Set(), paddleL: 0, paddleR: 1, paddleIdleS: 0, source: 'script' };
    const s = createGameSession({ game: module, profile: testProfile(), input: { beginTick() {}, state: () => lean }, fake: { script: 'z2' }, simOpts: { tour: 'quick' }, seed: 3 });
    const snap = () => (s.sim as unknown as { snapshot(): { mode: string; v: number; landGrade: string | null } }).snapshot();
    let bad = 0, lost = 0, prevV = 0, prevMode = '';
    for (let i = 0; i < 60 * 240; i++) {
      s.step(1);
      const q = snap();
      if (prevMode === 'hop' && q.landGrade === 'bad' && q.v < prevV * 0.9) { bad++; lost += 1 - q.v / prevV; }
      prevV = q.v; prevMode = q.mode;
    }
    expect(bad).toBeGreaterThan(3);
    expect(lost / bad).toBeGreaterThan(0.12);
  });
});

describe('altitude: momentum takes you up to the sky islands and the moon', () => {
  it('a rider who keeps their flow up launches to the sky, then the moon, falls into the sea and breaches back', () => {
    const r = runHeadless({ game: module, script: 'z2', minutes: 10, seed: 3, simOpts: { tour: 'quick', autolean: true } });
    const sm = r.summary;
    expect(Number(sm.skyVisits)).toBeGreaterThanOrEqual(1);
    expect(Number(sm.moonVisits)).toBeGreaterThanOrEqual(1);
    expect(Number(sm.splashdowns)).toBeGreaterThanOrEqual(1);
    const order = r.events.filter((e) => e.type === 'launch').map((e) => (e.data as { to: string }).to);
    expect(order.slice(0, 4)).toEqual(['sky', 'moon', 'sea', 'ground']); // thrown off the moon, then the breach out of the sea
  });
  it('a hands-off rider stays on the road', () => {
    const sm = runHeadless({ game: module, script: 'z2', minutes: 10, seed: 3, simOpts: { tour: 'quick' } }).summary;
    expect(Number(sm.skyVisits)).toBe(0);
    expect(Number(sm.peakAltM)).toBeLessThan(30);
  });
});

describe('jet, rings and stars up high', () => {
  it('a rider who jets (above the power line) to the rings catches them', () => {
    const sm = runHeadless({ game: module, script: 'target-follow', minutes: 10, seed: 3, simOpts: { tour: 'quick', autolean: true, autojet: true } }).summary;
    expect(Number(sm.jetS)).toBeGreaterThan(2);
    expect(Number(sm.rings)).toBeGreaterThanOrEqual(3);
    expect(Number(sm.stars)).toBeGreaterThanOrEqual(1);
  });
  it('holding the jet at Z2 power does nothing', () => {
    const jetIn: InputState = { held: new Set(['b']), pressed: new Set(), released: new Set(), paddleL: 0, paddleR: 0, paddleIdleS: 0, source: 'script' };
    const s = createGameSession({ game: module, profile: testProfile(), input: { beginTick() {}, state: () => jetIn }, fake: { script: 'z2' }, simOpts: { tour: 'quick', autolean: true }, seed: 3 });
    let weak = 0;
    for (let i = 0; i < 30 * 300; i++) { s.step(1); if ((s.sim as unknown as { snapshot(): { jet: string | null } }).snapshot().jet === 'weak') weak++; }
    expect(weak).toBeGreaterThan(0);
    expect(Number(s.sim.summary().jetS)).toBe(0);
  });
});
