import { describe, expect, it } from 'vitest';
import { createGameSession, runHeadless, SCRIPTS, testProfile, NullInput } from '../../../core';
import { FIXED_DT } from '../../../contracts';
import { module } from '../index';

const SEEDS = [11, 12, 13, 14];
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
    // floor 1 stays gentle: nobody dies there
    for (const r of [...z2, ...pro]) expect(r.events.filter((e) => e.type === 'death' && (e.data as { floor: number }).floor === 1)).toEqual([]);
  }, 180_000);

  it('camp upgrades carry a z2 rider deeper across three rides', () => {
    const profile = testProfile(), deepest: number[] = [];
    for (let n = 1; n <= 3; n++) {
      const s = createGameSession({ game: module, profile, input: new NullInput(), fake: { script: 'z2' }, seed: 130 + n, simOpts: { autopilot: true }, onSave: (d) => { profile.gameData[module.id] = d; } });
      for (let i = 0, end = Math.round(2400 / FIXED_DT); i < end && !s.sim.isOver(); i++) s.step(1);
      deepest.push(Number(s.finish().gameSummary['Deepest floor']));
    }
    expect(deepest[2]).toBeGreaterThan(deepest[0]);
  }, 60_000);
});

describe.skipIf(!process.env.BALANCE)('stance parity over long rides (BALANCE=1)', () => {
  const mk = (name: string, rpm: number) => { SCRIPTS[name] = { ...SCRIPTS.z2, name, cadence: (t: number) => rpm + 2 * Math.sin(t / 5) }; };
  mk('test-rpm76', 76); mk('test-rpm96', 96);
  const rooms = (script: string, stance: string) => [11, 12, 13, 14, 15, 16, 17, 18].reduce((a, seed) =>
    a + (runHeadless({ game: module, script, minutes: 15, seed, simOpts: { autopilot: true, stance } }).summary['Rooms cleared'] as number), 0);
  it('rooms cleared at 76 vs 96 rpm land within 10% for every stance', () => {
    for (const st of ['vanguard', 'ranger', 'skirmisher']) {
      const lo = rooms('test-rpm76', st), hi = rooms('test-rpm96', st);
      expect(Math.abs(lo - hi) / Math.max(lo, hi), `${st} ${lo} vs ${hi}`).toBeLessThanOrEqual(0.1);
    }
  }, 300_000);
});
