import { describe, expect, it } from 'vitest';
import { runHeadless } from '../../../core';
import { module } from '../index';
import { scenarios } from '../scenarios';
import { leapRange, loopExit, loopRadius, medalFor, smashCount, targetSpeed } from '../sim/physics';
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
