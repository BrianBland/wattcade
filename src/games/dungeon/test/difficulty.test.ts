import { describe, expect, it } from 'vitest';
import { createGameSession, runHeadless, testProfile, NullInput } from '../../../core';
import { FIXED_DT } from '../../../contracts';
import { module } from '../index';

const SEEDS = [11, 12, 13, 14];
const ride = (script: string, seed: number, simOpts: Record<string, unknown> = {}) =>
  runHeadless({ game: module, script, minutes: 40, seed, simOpts: { autopilot: true, ...simOpts } });

describe('dungeon difficulty', () => {
  it('a steady z2 rider dies; a rider who answers the game with actions progresses faster and dies less', () => {
    const z2 = SEEDS.map((s) => ride('z2', s)), pro = SEEDS.map((s) => ride('hook-responsive', s, { actionBot: true }));
    const sum = (rs: typeof z2, k: string) => rs.reduce((a, r) => a + Number(r.summary[k]), 0);
    expect(sum(z2, 'Deaths')).toBeGreaterThanOrEqual(3); // ~1 per 15-30 min
    expect(sum(pro, 'Deaths')).toBeLessThan(sum(z2, 'Deaths'));
    expect(sum(pro, 'Bosses slain')).toBeGreaterThan(sum(z2, 'Bosses slain'));
    // floor 1 stays gentle: nobody dies there
    for (const r of [...z2, ...pro]) expect(r.events.filter((e) => e.type === 'death' && (e.data as { floor: number }).floor === 1)).toEqual([]);
  }, 90_000);

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
