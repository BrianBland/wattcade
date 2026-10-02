import { describe, it, expect } from 'vitest';
import { createGameSession, runHeadless, testProfile, NullInput } from '../../../core';
import { module } from '../index';
import { scenarios } from '../scenarios';
import { biomeAt, biomeIdAt, BIOMES, makeTerrain } from '../sim/terrain';
import type { WarmupSnapshot } from '../sim/sim';

describe('scenarios via runHeadless', () => {
  for (const sc of scenarios) {
    it(sc.name, () => {
      const r = runHeadless({ game: module, script: sc.script, minutes: sc.minutes, seed: sc.seed, simOpts: sc.simOpts });
      expect(sc.assert(r.summary, r.stats, r)).toEqual([]);
    });
  }
  it('is deterministic', () => {
    const a = runHeadless({ game: module, script: 'mash', minutes: 4, seed: 9 });
    const b = runHeadless({ game: module, script: 'mash', minutes: 4, seed: 9 });
    expect(a.summary).toEqual(b.summary);
  });
});

describe('terrain', () => {
  it('elev is the integral of grade', () => {
    const t = makeTerrain(42, 3);
    for (const d of [0, 137, 900, 5021]) {
      const slope = (t.elev(d + 0.5) - t.elev(d - 0.5)) * 100;
      expect(slope).toBeCloseTo(t.grade(d), 2);
    }
  });
  it('grade stays within maxGrade', () => {
    const t = makeTerrain(7, 3);
    for (let d = 0; d < 20000; d += 13) expect(Math.abs(t.grade(d))).toBeLessThanOrEqual(3 + 1e-9);
  });
  it('biomes loop and blend near the boundary', () => {
    expect(biomeAt(0, 1000, 0).cur).toBe(BIOMES[0]);
    expect(biomeAt(1000 * BIOMES.length + 10, 1000, 0).cur).toBe(BIOMES[0]);
    expect(biomeAt(500, 1000, 0).mix).toBe(0);
    expect(biomeAt(990, 1000, 0).mix).toBeGreaterThan(0.9);
    expect(biomeIdAt(999.9, 1000, 0)).toBe(BIOMES[1]);
  });
});

function session(simOpts?: Record<string, unknown>) {
  const s = createGameSession({ game: module, profile: testProfile(), input: new NullInput(), fake: { script: 'z2' }, seed: 2, simOpts });
  return { s, snap: () => s.sim.snapshot() as WarmupSnapshot };
}

describe('sim', () => {
  it('continues from startDistance', () => {
    const { s, snap } = session({ startDistance: 2500 });
    s.step(30 * 30);
    expect(snap().d).toBeGreaterThan(2500);
    expect(snap().rodeM).toBeCloseTo(snap().d - 2500, 6);
  });
  it('hills off flattens the road and the trainer grade', () => {
    const { s, snap } = session();
    s.tuning.set('warmup.hills', false);
    s.step(30 * 10);
    expect(snap().hill).toBe(0);
    expect(snap().grade).toBe(0);
    const last = s.commands[s.commands.length - 1];
    expect(last.mode === 'sim' && Math.abs(last.gradePct)).toBeLessThan(0.01);
  });
  it('hud asks for a Z1-Z2 warm-up with gears', () => {
    const { s } = session();
    const h = s.sim.hud!();
    expect(h.targetZone).toMatchObject({ min: 1, max: 2 });
    expect(h.gears).toBe(true);
  });
});
