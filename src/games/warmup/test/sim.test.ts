import { describe, it, expect } from 'vitest';
import { createGameSession, runHeadless, testProfile, NullInput } from '../../../core';
import { module } from '../index';
import { scenarios } from '../scenarios';
import { biomeAt, biomeOfSeg, biomeWeights, BIOMES, makeTerrain, type BiomeId } from '../sim/terrain';
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
  it('biomes loop and dissolve over a window centred on the boundary', () => {
    expect(biomeAt(0, 1000, 0).cur).toBe(BIOMES[0]);
    expect(biomeAt(1000 * BIOMES.length + 10, 1000, 0).dom).toBe(BIOMES[0]);
    expect(biomeAt(500, 1000, 0).mix).toBe(0);
    const before = biomeAt(900, 1000, 0, 200), at = biomeAt(1000, 1000, 0, 200), after = biomeAt(1099, 1000, 0, 200);
    expect(before).toMatchObject({ cur: BIOMES[0], next: BIOMES[1], dom: BIOMES[0] });
    expect(before.mix).toBeCloseTo(0, 1);
    expect(at.mix).toBeCloseTo(0.5, 6);
    expect(after).toMatchObject({ cur: BIOMES[0], next: BIOMES[1], dom: BIOMES[1] });
    expect(after.mix).toBeGreaterThan(0.99);
    expect(biomeAt(1101, 1000, 0, 200)).toMatchObject({ cur: BIOMES[1], mix: 0 });
  });
  it('the dissolve never flips: every biome weight moves smoothly as you ride through', () => {
    const w = (d: number) => { const m = new Map<BiomeId, number>(biomeWeights(biomeAt(d, 1200, 3, 300))); return m; };
    for (let d = 0; d < 1200 * BIOMES.length; d += 2) {
      const a = w(d), b = w(d + 2);
      for (const id of BIOMES) expect(Math.abs((a.get(id) ?? 0) - (b.get(id) ?? 0))).toBeLessThanOrEqual(2 / 300 + 1e-9);
    }
  });
  it('weights sum to one and segment 0 starts clean', () => {
    for (let d = 0; d < 6000; d += 37) expect(biomeWeights(biomeAt(d, 1200, 2)).reduce((a, [, x]) => a + x, 0)).toBeCloseTo(1, 9);
    expect(biomeAt(0, 1200, 2).mix).toBe(0);
    expect(biomeOfSeg(-1, 0)).toBe(BIOMES[BIOMES.length - 1]);
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
  it('Drive-In blends in and out smoothly over driveInS, never flipping', () => {
    const { s, snap } = session();
    expect(snap().driveIn).toBe(0);
    s.sim.receive!({ type: 'driveIn', on: true });
    let prev = 0;
    for (let i = 0; i < 30 * 20; i++) {
      s.step(1);
      expect(snap().driveIn - prev).toBeLessThanOrEqual(1 / (30 * 8) + 1e-9); // 8 s default
      prev = snap().driveIn;
    }
    expect(snap().driveIn).toBe(1);
    s.sim.receive!({ type: 'driveIn', on: false });
    s.step(30 * 3);
    expect(snap().driveIn).toBeGreaterThan(0.5); expect(snap().driveIn).toBeLessThan(0.7);
    s.step(30 * 10);
    expect(snap().driveIn).toBe(0);
  });
  it('Drive-In leaves the road, grade and distance untouched', () => {
    const run = (on: boolean) => {
      const { s, snap } = session(on ? { driveIn: true } : undefined);
      s.step(30 * 120);
      return { d: snap().d, grade: snap().grade, cmds: s.commands.length };
    };
    expect(run(true)).toEqual(run(false));
  });
  it('can start with the Drive-In already on, and is deterministic', () => {
    const a = session({ driveIn: true }), b = session({ driveIn: true });
    expect(a.snap().driveIn).toBe(1);
    a.s.step(900); b.s.step(900);
    expect(a.snap()).toEqual(b.snap());
  });
});
