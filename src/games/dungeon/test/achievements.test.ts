import { describe, expect, it } from 'vitest';
import type { SessionRecord } from '../../../contracts';
import { achievements } from '../achievements';
import { createGameSession, testProfile, NullInput, TuningRegistry } from '../../../core';
import { module } from '../index';
import type { DungeonSnapshot } from '../sim/types';

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
  it('depth rewards require boss clears, not entering or starting on a deep floor', () => {
    for (const [id, goal] of [['dg_floor5', 10], ['dg_floor10', 15], ['dg_floor20', 20]] as const) {
      expect(byId(id).goal).toBe(goal);
      expect(count(id, rec({ 'Deepest floor': 30 }))).toBe(0);
      expect(count(id, rec({}, [{ type: 'bossDefeated', data: { floor: goal - 1 } }]))).toBe(goal - 1);
      expect(count(id, rec({}, [{ type: 'bossDefeated', data: { floor: goal } }]))).toBe(goal);
      expect(count(id, rec({}, [{ type: 'bossDefeated', data: { floor: goal } }], 'tower'))).toBe(0);
      expect(byId(id).count?.key).toBe('dungeon.bestClearedFloor');
    }
  });
  const bosses = (n: number, floor = 5, windows = 2, struck = windows) =>
    Array.from({ length: n }, (_, i) => ({ type: 'bossDefeated', data: { floor: floor + i, windows, struck } }));
  it('Perfect Exposure needs three floor-5+ perfect bosses in the same dive', () => {
    expect(feat('dg_perfect_exposure', rec({}, bosses(3)))).toBe(true);
    expect(feat('dg_perfect_exposure', rec({}, bosses(2)))).toBe(false);
    expect(feat('dg_perfect_exposure', rec({}, bosses(3, 4)))).toBe(false);
    expect(feat('dg_perfect_exposure', rec({}, bosses(3, 5, 1)))).toBe(false);
    expect(feat('dg_perfect_exposure', rec({}, bosses(3, 5, 3, 2)))).toBe(false);
    expect(feat('dg_perfect_exposure', rec({}, bosses(3, 5, 2, 3)))).toBe(false);
    expect(feat('dg_perfect_exposure', rec({}, [...bosses(2), { type: 'death' }, ...bosses(1)]))).toBe(false);
    expect(feat('dg_perfect_exposure', rec({}, [{ type: 'death' }, ...bosses(3), { type: 'death' }]))).toBe(true);
    expect(feat('dg_perfect_exposure', rec({}, bosses(3), 'tower'))).toBe(false);
  });
  it('Untouchable counts eight bosses within any one dive, even after an earlier death', () => {
    expect(feat('dg_deathless', rec({}, bosses(7)))).toBe(false);
    expect(feat('dg_deathless', rec({}, [...bosses(4), { type: 'death' }, ...bosses(4)]))).toBe(false);
    expect(feat('dg_deathless', rec({}, [{ type: 'death' }, ...bosses(8), { type: 'death' }]))).toBe(true);
    expect(feat('dg_deathless', rec({ 'Bosses slain': 8, Deaths: 0 }))).toBe(false);
  });
  it('Elite Hunter cannot combine kills across deaths or count ordinary kills', () => {
    const kills = (n: number, elite = true) => Array.from({ length: n }, () => ({ type: 'kill', data: { elite } }));
    expect(feat('dg_elites', rec({}, kills(74)))).toBe(false);
    expect(feat('dg_elites', rec({}, [...kills(40), { type: 'death' }, ...kills(35)]))).toBe(false);
    expect(feat('dg_elites', rec({}, kills(75, false)))).toBe(false);
    expect(feat('dg_elites', rec({}, [{ type: 'death' }, ...kills(75), { type: 'death' }]))).toBe(true);
    expect(feat('dg_elites', rec({ 'Elites slain': 75 }))).toBe(false);
  });
  it('Full Arsenal, Spin Doctor and Second Wind saves read their events', () => {
    expect(feat('dg_full_arsenal', rec({}, [{ type: 'fullArsenal', data: { stances: 4, minRarity: 3 } }]))).toBe(true);
    expect(feat('dg_full_arsenal', rec({}, [{ type: 'fullArsenal', data: { stances: 3 } }]))).toBe(false);
    expect(feat('dg_full_arsenal', rec({}, [{ type: 'fullArsenal', data: { stances: 4 } }]))).toBe(false);
    expect(feat('dg_full_arsenal', rec({}, [{ type: 'fullArsenal', data: { stances: 4, minRarity: 2 } }]))).toBe(false);
    expect(feat('dg_full_arsenal', rec({}))).toBe(false);
    const spins = (n: number) => rec({}, [...Array(n)].map(() => ({ type: 'spinup', data: { ok: true } })).concat([{ type: 'spinup', data: { ok: false } }]));
    expect(feat('dg_spin_doctor', spins(3))).toBe(true);
    expect(feat('dg_spin_doctor', spins(2))).toBe(false);
    expect(count('dg_second_wind', rec({ 'Second Winds': 2 }, [{ type: 'secondWind' }, { type: 'secondWind' }, { type: 'secondWind' }]))).toBe(3);
  });
  it('stance veteran counts kills made in that stance only', () => {
    const r = rec({}, [{ type: 'kill', data: { stance: 'vanguard' } }, { type: 'kill', data: { stance: 'vanguard' } }, { type: 'kill', data: { stance: 'ranger' } }]);
    expect(count('dg_master_vanguard', r)).toBe(2);
    expect(count('dg_master_ranger', r)).toBe(1);
    expect(count('dg_master_skirmisher', r)).toBe(0);
    expect(byId('dg_master_arcanist').goal).toBe(2000);
  });
});

describe('the sim emits the achievement events', () => {
  it('an unlocked, upgraded rider can complete the epic collection', () => {
    const profile = testProfile({ gameData: { dungeon: { upgrades: { arcanist: 1, luck: 15 }, autoInvest: false } } });
    const s = createGameSession({ game: module, profile, input: new NullInput(), fake: { script: 'hook-responsive' }, seed: 11,
      simOpts: { autopilot: true, actionBot: true, invulnerable: true } });
    for (let i = 0; i < 25 * 60 * 30; i++) s.step(1);
    const r = s.finish();
    const completed = r.events.filter(e => e.type === 'fullArsenal');
    expect(completed).toHaveLength(1);
    expect(completed[0].data).toMatchObject({ stances: 4, minRarity: 3 });
    expect(feat('dg_full_arsenal', r)).toBe(true);
  }, 30_000);
  it('includes a killing Strike in the boss-defeat exposure tally', () => {
    const profile = testProfile();
    const tuning = new TuningRegistry({ profileId: profile.id, storage: null });
    const s = createGameSession({ game: module, profile, input: new NullInput(), fake: { script: 'z2' }, seed: 15,
      simOpts: { autopilot: true, invulnerable: true }, tuningRegistry: tuning });
    tuning.set('dungeon.strikeDamageMult', 30);
    tuning.set('dungeon.strikeRadius', 8);
    let killed = false;
    for (let i = 0; i < 10 * 60 * 30 && !killed; i++) {
      const before = s.sim.snapshot() as DungeonSnapshot;
      const boss = before.enemies.find(e => e.kind === 'boss');
      const strike = boss && before.boss?.cycle === 'exposed' && boss.hp < boss.maxHp * 0.2
        && Math.hypot(boss.x - before.player.x, boss.y - before.player.y) < 8
        && before.actions.find(a => a.id === 'strike')!.usable && !before.frozen;
      if (strike) s.sim.receive?.({ type: 'action', id: 'strike' });
      s.step(1);
      const after = s.sim.snapshot() as DungeonSnapshot;
      killed = !!strike && !!after.boss && !after.boss.active;
    }
    expect(killed).toBe(true);
    const bosses = s.finish().events.filter(e => e.type === 'bossDefeated');
    expect(bosses).toHaveLength(1);
    expect(bosses[0].data?.struck).toBe(1);
  });
  it('kills carry the stance, boss kills carry Exposed windows/strikes, Second Wind is counted once and a fresh dive cannot earn Full Arsenal', async () => {
    const { runHeadless } = await import('../../../core');
    const { module } = await import('../index');
    const r = runHeadless({ game: module, script: 'hook-responsive', minutes: 25, seed: 15, simOpts: { autopilot: true, actionBot: true } });
    const kill = r.events.find((e) => e.type === 'kill')!;
    expect(kill.data).toHaveProperty('stance');
    const boss = r.events.find((e) => e.type === 'bossDefeated');
    expect(boss?.data).toMatchObject({ windows: expect.any(Number), struck: expect.any(Number) });
    expect(r.events.some((e) => e.type === 'fullArsenal')).toBe(false);
    const z2 = runHeadless({ game: module, script: 'z2', minutes: 25, seed: 15, simOpts: { autopilot: true } });
    const sw = z2.events.filter((e) => e.type === 'secondWind').length;
    expect(sw).toBeGreaterThan(0);
    expect(sw).toBe(Number(z2.summary['Second Winds']));
  }, 30_000);
});
