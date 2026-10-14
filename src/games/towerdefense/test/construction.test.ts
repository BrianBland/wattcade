import { describe, expect, it } from 'vitest';
import { createGameSession, NullInput, testProfile, TimelineInput } from '../../../core';
import { module } from '../index';
import { readSave } from '../sim/sim';
import { suggestBuild, type ConstructionState } from '../sim/construction';
import { PADS, towerUpgradeCost } from '../sim/defs';
import type { TdSnapshot } from '../sim/types';

const snap = (s: ReturnType<typeof createGameSession>) => s.sim.snapshot() as TdSnapshot;
const forecast = () => ({ blue: 0, red: 0, purple: 0, prism: 0, gold: 0 });
const state = (patch: Partial<ConstructionState> = {}): ConstructionState => ({
  wave: 4, brood: 'blue', lanes: [forecast(), { ...forecast(), red: 6 }, forecast()], towers: [],
  scrap: 1000, costMult: 1, baseHp: 100, baseMaxHp: 100, repairCost: 42, ...patch,
});
function session(input = new TimelineInput(), extra: Record<string, unknown> = {}, profile = testProfile()) {
  return createGameSession({ game: module, profile, input, fake: { script: 'z2' }, seed: 1, simOpts: { skipGarage: true, autoCrew: false, ...extra } });
}

describe('crew recommendation', () => {
  it('covers the threatened lane’s off-colour heavies, without spending beyond scrap', () => {
    const s = state({ scrap: 80 }), a = suggestBuild(s)!;
    expect(a.tower).toBe('mortar'); expect(PADS[a.pad].lane).toBe(1); expect(a.cost).toBeLessThanOrEqual(s.scrap);
    expect(suggestBuild(state({ scrap: 59 }))).toBeNull();
    expect(suggestBuild(s)).toEqual(a);
  });
  it('uses existing coverage and ranks upgrades as well as empty pads', () => {
    const towers = PADS.map(p => ({ pad: p.id, kind: 'mortar' as const, level: 1 }));
    const a = suggestBuild(state({ towers, scrap: 112 }))!;
    expect(a.kind).toBe('upgrade'); expect(a.targetLevel).toBe(2); expect(a.cost).toBe(towerUpgradeCost('mortar', 1));
    expect(suggestBuild(state({ towers: towers.map(t => ({ ...t, level: 5 })), baseHp: 100 }))).toBeNull();
  });
  it('quotes every level in a funded upgrade order, and offers repairs for a damaged base', () => {
    const towers = PADS.map(p => ({ pad: p.id, kind: 'tesla' as const, level: 1 }));
    const a = suggestBuild(state({ towers, scrap: 400 }))!;
    expect(a.targetLevel).toBe(3); expect(a.cost).toBe(towerUpgradeCost('tesla', 1) + towerUpgradeCost('tesla', 2));
    expect(suggestBuild(state({ baseHp: 20 }))?.kind).toBe('repair');
  });
});

describe('construction input and persistence', () => {
  it('migrates old saves additively and preserves an explicit Commander choice', () => {
    expect(readSave({ bestWave: 10, bank: 420, autoInvest: true })).toMatchObject({ bestWave: 10, bank: 420, autoInvest: true, autoCrew: true });
    expect(readSave({ v: 2, autoCrew: false }).autoCrew).toBe(false);
  });
  it('controller A and a suggestion tap accept the same work order once per lull', () => {
    const input = new TimelineInput([{ t: 0.2, press: 'a' }, { t: 0.3, release: 'a' }]);
    const a = session(input), b = session(); a.step(1); b.step(1);
    const suggestion = snap(b).suggestion!;
    expect(suggestion.wave).toBe(snap(b).brood.wave); expect(suggestion.wave).not.toBe(snap(b).nextBrood!.wave);
    b.sim.receive!({ type: 'construct', suggestion });
    b.sim.receive!({ type: 'construct', suggestion });
    a.step(10); b.step(10);
    expect(snap(a).towers.map(({ pad, kind, level }) => ({ pad, kind, level }))).toEqual(snap(b).towers.map(({ pad, kind, level }) => ({ pad, kind, level })));
    expect(snap(a).scrap).toBe(snap(b).scrap);
    expect(snap(a).constructionDone).toBe(true); expect(snap(a).workshop).toBeNull();
  });
  it('a stale quote or stale menu row cannot purchase a replacement operation', () => {
    const s = session(); s.step(1);
    s.sim.receive!({ type: 'construct', suggestion: { ...snap(s).suggestion!, cost: 1 } }); s.step(1);
    expect(snap(s).towers).toHaveLength(0);
    s.sim.receive!({ type: 'pad', pad: 1 }); s.step(1);
    const ws = snap(s).workshop!;
    s.sim.receive!({ type: 'row', row: 0, pad: 1, revision: ws.revision });
    s.sim.receive!({ type: 'row', row: 0, pad: 1, revision: ws.revision }); s.step(1);
    expect(snap(s).towers).toHaveLength(1); expect(snap(s).towers[0].level).toBe(1);
    s.sim.receive!({ type: 'row', row: 0, pad: 1, revision: ws.revision }); s.step(1);
    expect(snap(s).towers[0].level).toBe(1);
  });
  it('Auto-crew builds at the lull’s end without autopilot or manual input', () => {
    const s = session(new NullInput(), { autoCrew: true }); s.step(1);
    expect(snap(s).towers).toHaveLength(0);
    s.step(30 * 14); expect(snap(s).towers).toHaveLength(0);
    s.step(30 * 2); expect(snap(s).towers).toHaveLength(1);
    expect(snap(s).constructionDone).toBe(true);
    const commander = session(); commander.step(30 * 20); expect(snap(commander).towers).toHaveLength(0);
  });
  it('manual overrides consume the lull’s crew purchase and can be entered by touch, confirmed by controller', () => {
    const s = session(new TimelineInput([{ t: 0.2, press: 'a' }, { t: 0.3, release: 'a' }]), { autoCrew: true });
    s.step(1); s.sim.receive!({ type: 'pad', pad: 1 }); s.step(1);
    s.step(10); expect(snap(s).towers).toHaveLength(1);
    s.sim.receive!({ type: 'close' }); s.step(30 * 20);
    expect(snap(s).towers).toHaveLength(1); expect(snap(s).towers[0].level).toBe(1);
  });
  it('controller navigation reaches repairs and the saved Auto-crew toggle', () => {
    let saved: unknown;
    const input = new TimelineInput([{ t: 0.2, press: 'down' }, { t: 0.3, release: 'down' }, { t: 0.4, press: 'a' }]);
    const s = createGameSession({ game: module, profile: testProfile(), input, fake: { script: 'z2' }, seed: 1,
      simOpts: { skipGarage: true }, onSave: d => { saved = d; } });
    s.step(1); s.sim.receive!({ type: 'pad', pad: 6 }); s.step(1);
    expect(snap(s).workshop!.rows[0].kind).toBe('repair');
    s.step(15); expect(snap(s).autoCrew).toBe(false);
    expect(readSave(saved).autoCrew).toBe(false);
    const reload = session(new NullInput(), { autoCrew: undefined }, testProfile({ gameData: { towerdefense: saved } }));
    reload.step(30 * 20); expect(snap(reload).autoCrew).toBe(false); expect(snap(reload).towers).toHaveLength(0);
  });
  it('rejects fractional and non-finite pad and row indices', () => {
    const s = session(); s.step(1);
    for (const pad of [NaN, Infinity, 0.5, 7]) s.sim.receive!({ type: 'pad', pad });
    s.step(1); expect(snap(s).workshop).toBeNull();
    s.sim.receive!({ type: 'pad', pad: 1 }); s.step(1);
    for (const row of [NaN, Infinity, 0.5, -1, 100]) s.sim.receive!({ type: 'row', row });
    s.step(1); expect(snap(s).towers).toHaveLength(0);
  });
});
