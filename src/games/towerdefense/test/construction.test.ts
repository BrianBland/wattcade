import { describe, expect, it } from 'vitest';
import { createGameSession, NullInput, testProfile, TimelineInput } from '../../../core';
import { module } from '../index';
import { readSave } from '../sim/sim';
import { padCover, suggestBuild, type ConstructionState } from '../sim/construction';
import { LEVEL_0, levelGeometry } from '../sim/level';
const PAD_COVER = padCover(levelGeometry(LEVEL_0));
import { BASE_PAD, MATCHUP, PADS, towerUpgradeCost } from '../sim/defs';
import type { TdSnapshot } from '../sim/types';

const snap = (s: ReturnType<typeof createGameSession>) => s.sim.snapshot() as TdSnapshot;
const forecast = () => ({ blue: 0, red: 0, purple: 0, prism: 0, gold: 0, air: 0 });
const state = (patch: Partial<ConstructionState> = {}): ConstructionState => ({
  wave: 4, brood: 'blue', counts: { ...forecast(), red: 6 }, towers: [],
  scrap: 1000, costMult: 1, baseHp: 100, baseMaxHp: 100, repairCost: 42, ...patch,
});
function session(input = new TimelineInput(), extra: Record<string, unknown> = {}, profile = testProfile()) {
  return createGameSession({ game: module, profile, input, fake: { script: 'z2' }, seed: 1, simOpts: { stars: 99, skipGarage: true, ...extra } });
}

describe('build bot recommendation (headless only)', () => {
  it('follows live matchup overrides and excludes towers resisted by the off-colour push', () => {
    const matchup = { ...MATCHUP, gatling: { ...MATCHUP.gatling, red: 2 }, flame: { ...MATCHUP.flame, red: 0.5 } };
    expect(suggestBuild(state({ matchup }))?.tower).toBe('tesla');
  });
  it('covers the off-colour heavies from the pad that sees the most road, without spending beyond scrap', () => {
    const s = state({ scrap: 80 }), a = suggestBuild(s)!;
    expect(a.tower).toBe('flamer'); expect(a.cost).toBeLessThanOrEqual(s.scrap);
    expect(PAD_COVER.flamer[a.pad]).toBe(Math.max(...PAD_COVER.flamer));
    expect(a.label).toContain(PADS[a.pad].name);
    expect(suggestBuild(state({ scrap: 59 }))).toBeNull();
    expect(suggestBuild(s)).toEqual(a);
  });
  it('values dangerous off-colour reds before excluding the Flamethrower against a larger blue swarm', () => {
    const s = state({ brood: 'purple', counts: { ...forecast(), red: 10, blue: 30, air: 30 }, scrap: 80 });
    expect(suggestBuild(s)?.tower).toBe('flamer');
    // A genuinely blue-dominated push still gets anti-air coverage.
    expect(suggestBuild({ ...s, counts: { ...s.counts, red: 1 } })?.tower).toBe('tesla');
  });
  it('uses existing coverage and ranks upgrades as well as empty pads', () => {
    const towers = PADS.map(p => ({ pad: p.id, kind: 'flamer' as const, level: 1 }));
    const a = suggestBuild(state({ towers, scrap: 112 }))!;
    expect(a.kind).toBe('upgrade'); expect(a.targetLevel).toBe(2); expect(a.cost).toBe(towerUpgradeCost('flamer', 1));
    expect(suggestBuild(state({ towers: towers.map(t => ({ ...t, level: 5 })), baseHp: 100 }))).toBeNull();
  });
  it('quotes every level in a funded upgrade order, and offers repairs for a damaged base', () => {
    const towers = PADS.map(p => ({ pad: p.id, kind: 'tesla' as const, level: 1 }));
    const a = suggestBuild(state({ towers, scrap: 400 }))!;
    expect(a.targetLevel).toBe(3); expect(a.cost).toBe(towerUpgradeCost('tesla', 1) + towerUpgradeCost('tesla', 2));
    expect(suggestBuild(state({ baseHp: 20 }))?.kind).toBe('repair');
  });
  it('funds new towers at useful levels in one quoted order instead of hoarding the bank', () => {
    const s = state({ scrap: 1000 });
    const order = suggestBuild(s)!;
    expect(order.kind).toBe('build');
    expect(order.targetLevel).toBeGreaterThan(2);
    expect(order.cost).toBeLessThanOrEqual(s.scrap);
    expect(order.label).toContain(`Lv ${order.targetLevel}`);
    expect(suggestBuild({ ...s, scrap: 80 })?.targetLevel).toBe(1);
  });
});

describe('construction input and persistence', () => {
  it('A opens Construction; nothing is bought until the rider picks a row', () => {
    const s = session(new TimelineInput([{ t: 0.2, press: 'a' }, { t: 0.3, release: 'a' }])); s.step(10);
    expect(snap(s).workshop).not.toBeNull(); expect(snap(s).towers).toHaveLength(0);
    s.sim.receive!({ type: 'construct' }); s.step(1);
    expect(snap(s).towers).toHaveLength(0);
  });
  it('old saves drop the Auto-crew setting with the Garage', () => {
    const old = readSave({ bestWave: 10, bank: 420, autoInvest: true });
    expect(old).toMatchObject({ v: 4, veteran: true, endlessBest: 0 });
    for (const k of ['bank', 'bestWave', 'autoCrew']) expect(old).not.toHaveProperty(k);
  });
  it('a rider builds and upgrades as often as scrap allows in one lull; a stale menu row cannot buy twice', () => {
    const s = session(); s.tuning.set('towerdefense.startScrap', 1000); s.step(1);
    s.sim.receive!({ type: 'pad', pad: 1 }); s.step(1);
    const ws = snap(s).workshop!;
    s.sim.receive!({ type: 'row', row: 0, pad: 1, revision: ws.revision });
    s.sim.receive!({ type: 'row', row: 0, pad: 1, revision: ws.revision }); s.step(1);
    expect(snap(s).towers).toHaveLength(1); expect(snap(s).towers[0].level).toBe(1);
    s.sim.receive!({ type: 'row', row: 0, pad: 1, revision: ws.revision }); s.step(1);
    expect(snap(s).towers[0].level).toBe(1);
    const up = snap(s).workshop!;
    expect(up.rows[0].kind).toBe('upgrade');
    s.sim.receive!({ type: 'row', row: 0, pad: 1, revision: up.revision }); s.step(1);
    expect(snap(s).towers[0].level).toBe(2);
    s.sim.receive!({ type: 'pad', pad: 2 }); s.step(1);
    s.sim.receive!({ type: 'row', row: 0, pad: 2, revision: snap(s).workshop!.revision }); s.step(1);
    expect(snap(s).towers).toHaveLength(2);
    expect(snap(s).lull).toBeGreaterThan(0);
  });
  it('nothing builds itself for a rider; the headless build bot spends at the lull’s end', () => {
    const rider = session(new NullInput()); rider.step(30 * 50); expect(snap(rider).towers).toHaveLength(0);
    const bot = session(new NullInput(), { botBuild: true }); bot.step(1);
    bot.step(30 * 44); expect(snap(bot).towers).toHaveLength(0);
    bot.step(30 * 2); expect(snap(bot).towers.length).toBeGreaterThan(0);
  });
  it('controller navigation reaches repairs', () => {
    const s = session(); s.step(1); s.sim.receive!({ type: 'pad', pad: BASE_PAD }); s.step(1);
    expect(snap(s).workshop!.rows.map((r) => r.kind)).toEqual(['repair']);
  });
  it('rejects fractional and non-finite pad and row indices', () => {
    const s = session(); s.step(1);
    for (const pad of [NaN, Infinity, 0.5, BASE_PAD + 1]) s.sim.receive!({ type: 'pad', pad });
    s.step(1); expect(snap(s).workshop).toBeNull();
    s.sim.receive!({ type: 'pad', pad: 1 }); s.step(1);
    for (const row of [NaN, Infinity, 0.5, -1, 100]) s.sim.receive!({ type: 'row', row });
    s.step(1); expect(snap(s).towers).toHaveLength(0);
  });
});
