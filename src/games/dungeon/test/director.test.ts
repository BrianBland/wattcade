import { describe, expect, it } from 'vitest';
import { createGameSession, testProfile, NullInput } from '../../../core';
import { module } from '../index';
import { cadenceSpeed } from '../sim/ai';
import { DEFAULT_CFG, ambushesWanted, newFloor, spinupCalled, stepDirector, type DirectorIn } from '../sim/director';

const run = (s: ReturnType<typeof newFloor>, secs: number, i: Partial<DirectorIn> = {}) => {
  const ev: string[] = [];
  for (let k = 0; k < secs * 10; k++) ev.push(...stepDirector(s, { dt: 0.1, rideMin: 5, inFight: true, bossActive: false, bossDone: false, ...i }));
  return ev;
};

describe('floor director (pure)', () => {
  it('first floor of a run: warm-up, then explore, ambush, recover, called spin-up, explore', () => {
    const s = newFloor(true);
    expect(s.seg).toBe('warmup');
    expect(run(s, DEFAULT_CFG.warmupS - 1)).toEqual([]);
    run(s, 1.5); expect(s.seg).toBe('ambush'); // warm-up is past the first-ambush time, and we're in a fight
    expect(run(s, DEFAULT_CFG.ambushS)).toContain('ambushEnd'); expect(s.seg).toBe('recover');
    run(s, DEFAULT_CFG.recoverS + 0.1); expect(s.seg).toBe('explore');
    expect(run(s, DEFAULT_CFG.spinupAfterS + 0.1)).toContain('spinup'); expect(spinupCalled(s)).toBe(true);
    expect(run(s, DEFAULT_CFG.spinupS)).toContain('spinupEnd'); expect(s.seg).toBe('explore');
    expect(run(s, 300)).toEqual([]); // one ambush + one spin-up per floor on a short ride
  });
  it('later floors skip the warm-up; ambushes wait for a fight', () => {
    const s = newFloor(false);
    expect(s.seg).toBe('explore');
    run(s, 200, { inFight: false }); expect(s.seg).toBe('explore');
    run(s, 0.1); expect(s.seg).toBe('ambush');
  });
  it('the boss overrides everything, then cool-down until the stairs', () => {
    const s = newFloor(false);
    run(s, 10, { bossActive: true }); expect(s.seg).toBe('boss');
    run(s, 1, { bossDone: true }); expect(s.seg).toBe('cooldown');
  });
  it('longer rides add a second effort per floor', () => {
    expect(ambushesWanted(10)).toBe(1); expect(ambushesWanted(45)).toBe(2);
    const s = newFloor(false); const ev = run(s, 400, { rideMin: 45 });
    expect(ev.filter((e) => e === 'ambush').length).toBe(2);
  });
});

describe('pacing in the game', () => {
  const sess = (script: string, simOpts: Record<string, unknown> = {}) => createGameSession({ game: module, profile: testProfile(), input: new NullInput(), fake: { script }, seed: 13, simOpts: { autopilot: true, ...simOpts } });
  it('cadence above 90 rpm only pays during a called spin-up; 60-90 rpm is flat', () => {
    const pts: Array<[number, number]> = [[0, 0.35], [60, 1], [90, 1], [110, 1.15]];
    expect(cadenceSpeed(106, false, pts)).toBe(1);
    expect(cadenceSpeed(76, false, pts)).toBe(1);
    expect(cadenceSpeed(106, true, pts)).toBeGreaterThan(1.1);
    expect(cadenceSpeed(30, false, pts)).toBeLessThan(1);
  });
  it('the HUD target follows the segment, and ERG hides the gears', () => {
    const s = sess('z2', { erg: true });
    s.step(30 * 5);
    expect(s.sim.hud!().gears).toBe(false);
    expect(s.sim.hud!().targetZone?.label).toMatch(/Warm up · ERG 50%/);
  });
});
