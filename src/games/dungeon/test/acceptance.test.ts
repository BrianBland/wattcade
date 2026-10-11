// Acceptance checks for the redesign issues that have no direct test elsewhere (#89; #88/#90 are covered in dungeon.test.ts).
import { describe, expect, it } from 'vitest';
import { createGameSession, testProfile, NullInput } from '../../../core';
import { module } from '../index';
import { DEFAULT_TARGETS, type Seg } from '../sim/director';

describe('#89 interval pacing', () => {
  it('ERG holds the segment target for every segment it visits', () => {
    const profile = testProfile(), ftp = profile.ftp;
    const s = createGameSession({ game: module, profile, input: new NullInput(), fake: { script: 'target-follow' }, seed: 13, simOpts: { autopilot: true, erg: true, skipCamp: true } });
    const seen = new Map<Seg, Set<number>>();
    for (let sec = 0; sec < 25 * 60; sec++) {
      s.step(30);
      const seg = (s.sim.snapshot() as { pace?: { seg: Seg } }).pace?.seg;
      const last = [...s.commands].reverse().find((c) => (c as { mode?: string }).mode === 'erg') as { watts: number } | undefined;
      if (seg && last) { const w = seen.get(seg) ?? new Set(); w.add(Math.round(last.watts)); seen.set(seg, w); }
    }
    for (const seg of ['warmup', 'explore', 'ambush', 'recover', 'spinup', 'boss'] as Seg[]) {
      expect(seen.has(seg), `segment ${seg} visited`).toBe(true);
      expect([...seen.get(seg)!], `ERG target in ${seg}`).toContain(Math.round(ftp * DEFAULT_TARGETS[seg].erg));
    }
    // never left in grade mode once ERG is on
    const firstErg = s.commands.findIndex((c) => (c as { mode?: string }).mode === 'erg');
    expect(s.commands.slice(firstErg).some((c) => (c as { mode?: string }).mode === 'sim')).toBe(false);
  }, 30_000);
  it('a floor takes about 7 minutes on z2 (5.5-9 min per floor, no deaths)', () => {
    let floors = 0, minutes = 0;
    for (const seed of [11, 12]) {
      const s = createGameSession({ game: module, profile: testProfile(), input: new NullInput(), fake: { script: 'z2' }, seed, simOpts: { autopilot: true, skipCamp: true, invulnerable: true } });
      s.step(30 * 60 * 30);
      floors += Number(s.finish().gameSummary['Deepest floor']) - 1; minutes += 30;
    }
    const perFloor = minutes / floors;
    expect(perFloor).toBeGreaterThan(5.5);
    expect(perFloor).toBeLessThan(9);
  }, 30_000);
});
