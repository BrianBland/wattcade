import { describe, expect, it } from 'vitest';
import type { SessionRecord } from '../../../contracts';
import { achievements } from '../achievements';

const rec = (gameSummary: Record<string, number | string>, events: Array<{ type: string; data?: Record<string, number | string | boolean> }> = [], gameId = 'dungeon') =>
  ({ id: 'r', profileId: 'p', gameId, startedAt: 0, durationS: 2400, samples: [], stats: {}, gameSummary, events: events.map((e) => ({ t: 0, data: {}, ...e })) }) as unknown as SessionRecord;
const byId = (id: string) => { const a = achievements.find((x) => x.id === id); if (!a) throw new Error(id); return a; };
const feat = (id: string, r: SessionRecord) => !!byId(id).check?.({} as never, r, []);
const count = (id: string, r: SessionRecord) => byId(id).count!.of(r, {} as never);

describe('dungeon achievements (synthetic summaries)', () => {
  it('ids are unique', () => expect(new Set(achievements.map((a) => a.id)).size).toBe(achievements.length));
  it('Curse Breaker: 6 curses in one ride (reachable in a 40-min ride)', () => {
    expect(feat('dg_curses', rec({ 'Curses survived': 6 }))).toBe(true);
    expect(feat('dg_curses', rec({ 'Curses survived': 5 }))).toBe(false);
    expect(feat('dg_curses', rec({ 'Curses survived': 9 }, [], 'tower'))).toBe(false);
    expect(count('dg_curses_total', rec({ 'Curses survived': 7 }))).toBe(7);
  });
  it('Perfect Exposure needs a Strike in every window of a 2+ window boss fight', () => {
    expect(feat('dg_perfect_exposure', rec({}, [{ type: 'bossDefeated', data: { windows: 3, struck: 3 } }]))).toBe(true);
    expect(feat('dg_perfect_exposure', rec({}, [{ type: 'bossDefeated', data: { windows: 3, struck: 2 } }]))).toBe(false);
    expect(feat('dg_perfect_exposure', rec({}, [{ type: 'bossDefeated', data: { windows: 1, struck: 1 } }]))).toBe(false);
  });
  it('Full Arsenal, Spin Doctor and Second Wind saves read their events', () => {
    expect(feat('dg_full_arsenal', rec({}, [{ type: 'fullArsenal', data: { stances: 3 } }]))).toBe(true);
    expect(feat('dg_full_arsenal', rec({}))).toBe(false);
    const spins = (n: number) => rec({}, [...Array(n)].map(() => ({ type: 'spinup', data: { ok: true } })).concat([{ type: 'spinup', data: { ok: false } }]));
    expect(feat('dg_spin_doctor', spins(3))).toBe(true);
    expect(feat('dg_spin_doctor', spins(2))).toBe(false);
    expect(count('dg_second_wind', rec({ 'Second Winds': 2 }, [{ type: 'secondWind' }, { type: 'secondWind' }, { type: 'secondWind' }]))).toBe(3);
  });
  it('stance mastery counts kills made in that stance only', () => {
    const r = rec({}, [{ type: 'kill', data: { stance: 'vanguard' } }, { type: 'kill', data: { stance: 'vanguard' } }, { type: 'kill', data: { stance: 'ranger' } }]);
    expect(count('dg_master_vanguard', r)).toBe(2);
    expect(count('dg_master_ranger', r)).toBe(1);
    expect(count('dg_master_skirmisher', r)).toBe(0);
    expect(byId('dg_master_arcanist').goal).toBe(2000);
  });
});

describe('the sim emits the achievement events', () => {
  it('kills carry the stance, boss kills carry Exposed windows/strikes, Second Wind and Full Arsenal are emitted', async () => {
    const { runHeadless } = await import('../../../core');
    const { module } = await import('../index');
    const r = runHeadless({ game: module, script: 'hook-responsive', minutes: 25, seed: 15, simOpts: { autopilot: true, actionBot: true } });
    const kill = r.events.find((e) => e.type === 'kill')!;
    expect(kill.data).toHaveProperty('stance');
    const boss = r.events.find((e) => e.type === 'bossDefeated');
    expect(boss?.data).toMatchObject({ windows: expect.any(Number), struck: expect.any(Number) });
    expect(r.events.some((e) => e.type === 'fullArsenal')).toBe(true);
    const z2 = runHeadless({ game: module, script: 'z2', minutes: 25, seed: 15, simOpts: { autopilot: true } });
    const sw = z2.events.filter((e) => e.type === 'secondWind').length;
    expect(sw).toBeGreaterThan(0);
    expect(sw).toBeGreaterThanOrEqual(Number(z2.summary['Second Winds'])); // the summary counts the last run; events count the ride
  }, 30_000);
});
