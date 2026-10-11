import { describe, expect, it } from 'vitest';
import { createGameSession, runHeadless, SCRIPTS, testProfile, NullInput } from '../../../core';
import { FIXED_DT } from '../../../contracts';
import { module } from '../index';

const SEEDS = [11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22];
const ride = (script: string, seed: number, simOpts: Record<string, unknown> = {}) =>
  runHeadless({ game: module, script, minutes: 40, seed, simOpts: { autopilot: true, ...simOpts } });

// Long balance rides (minutes of CPU): not part of the gating suite. Run with `npm run test:balance`.
// The gating checks are the z2-hour / action-hour scenarios and the fast stance parity test.
describe.skipIf(!process.env.BALANCE)('dungeon difficulty (BALANCE=1)', () => {
  it('a steady z2 rider dies; a rider who answers the game with actions progresses faster and dies less', () => {
    const z2 = SEEDS.map((s) => ride('z2', s)), pro = SEEDS.map((s) => ride('hook-responsive', s, { actionBot: true }));
    const sum = (rs: typeof z2, k: string) => rs.reduce((a, r) => a + Number(r.summary[k]), 0);
    expect(sum(z2, 'Deaths')).toBeGreaterThanOrEqual(3); // ~1 per 15-30 min
    expect(sum(pro, 'Deaths')).toBeLessThan(sum(z2, 'Deaths'));
    const sp = SEEDS.map((s) => ride('sprints', s));
    expect(sum(sp, 'Deaths')).toBeLessThan(sum(z2, 'Deaths')); // sprinting alone beats steady z2
    expect(sum(sp, 'Bosses slain')).toBeGreaterThan(sum(z2, 'Bosses slain'));
    expect(sum(pro, 'Bosses slain')).toBeGreaterThan(sum(z2, 'Bosses slain'));
    // floor 1 stays gentle: well under 10% of fresh rides die there on their first run
    const f1 = [...z2, ...sp, ...pro].filter((r) => (r.events.find((e) => e.type === 'death')?.data as { floor?: number } | undefined)?.floor === 1).length;
    expect(f1 / (3 * SEEDS.length)).toBeLessThan(0.1);
  }, 300_000);

  it('camp upgrades carry a z2 rider deeper across three rides', () => {
    // two independent riders (one chain alone is too seed-noisy): their 3rd rides together go deeper than their 1st
    const deepest = [0, 0, 0], deaths = [0, 0, 0];
    for (const base of [130, 140]) {
      const profile = testProfile();
      for (let n = 1; n <= 3; n++) {
        const s = createGameSession({ game: module, profile, input: new NullInput(), fake: { script: 'z2' }, seed: base + n, simOpts: { autopilot: true }, onSave: (d) => { profile.gameData[module.id] = d; } });
        for (let i = 0, end = Math.round(2400 / FIXED_DT); i < end && !s.sim.isOver(); i++) s.step(1);
        const g = s.finish().gameSummary; deepest[n - 1] += Number(g['Deepest floor']); deaths[n - 1] += Number(g.Deaths);
      }
    }
    expect(deepest[2]).toBeGreaterThan(deepest[0]);
    expect(deaths[2]).toBeGreaterThan(0); // upgraded riders still die at depth (not immortal)
  }, 60_000);
});

describe.skipIf(!process.env.BALANCE)('stance parity over long rides (BALANCE=1)', () => {
  const mk = (name: string, rpm: number) => { SCRIPTS[name] = { ...SCRIPTS.z2, name, cadence: (t: number) => rpm + 2 * Math.sin(t / 5) }; };
  mk('test-rpm76', 76); mk('test-rpm96', 96);
  const rooms = (script: string, stance: string) => [11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22].reduce((a, seed) =>
    a + (runHeadless({ game: module, script, minutes: 15, seed, simOpts: { autopilot: true, stance } }).summary['Rooms cleared'] as number), 0);
  it('rooms cleared at 76 vs 96 rpm land within 10% for every stance', () => {
    for (const st of ['vanguard', 'ranger', 'skirmisher']) {
      const lo = rooms('test-rpm76', st), hi = rooms('test-rpm96', st);
      expect(Math.abs(lo - hi) / Math.max(lo, hi), `${st} ${lo} vs ${hi}`).toBeLessThanOrEqual(0.1);
    }
  }, 450_000);
});
