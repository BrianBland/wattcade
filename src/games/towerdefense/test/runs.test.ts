import { describe, expect, it } from 'vitest';
import { createGameSession, testProfile, TimelineInput } from '../../../core';
import { module } from '../index';
import type { TdSave } from '../sim/sim';
import type { TdSnapshot } from '../sim/types';

function ride(script = 'z2') {
  const other = { ver: 42, town: ['port'] };
  const profile = testProfile({ gameData: { lighthouse: other } });
  let saved: TdSave | undefined;
  const s = createGameSession({ game: module, profile, input: new TimelineInput([]), fake: { script }, seed: 1,
    onSave: (data) => { saved = data as TdSave; profile.gameData.towerdefense = data; } });
  const snap = () => s.sim.snapshot() as TdSnapshot;
  s.step(1);
  return { s, snap, saved: () => saved!, profile, other };
}

describe('endless runs', () => {
  it('clears a boss announcement when bailing during its recovery lull or an active phase', () => {
    const profile = testProfile({ gameData: { towerdefense: { v: 2, runs: 1, bestWave: 12, upgrades: { headstart: 4 } } } });
    const s = createGameSession({ game: module, profile, input: new TimelineInput([]), fake: { script: 'z2' }, seed: 1, simOpts: { skipGarage: true } });
    s.step(1);
    expect((s.sim.snapshot() as TdSnapshot).boss).not.toBeNull();
    s.sim.receive!({ type: 'bail' }); s.step(1);
    expect(s.sim.snapshot()).toMatchObject({ phase: 'garage', boss: null, effort: null, lull: 0, swapLeft: 0 });
    s.sim.receive!({ type: 'garageRow', row: 0 }); s.step(1);
    for (let i = 0; i < 30 * 120 && (s.sim.snapshot() as TdSnapshot).phase === 'run' && !(s.sim.snapshot() as TdSnapshot).boss; i++) s.step(1);
    expect((s.sim.snapshot() as TdSnapshot).boss).not.toBeNull();
    s.sim.receive!({ type: 'bail' }); s.step(1);
    expect(s.sim.snapshot()).toMatchObject({ phase: 'garage', boss: null, effort: null });
    s.finish();
  });

  it('idle falls by wave 2, banks parts, stays in the Garage, then can start again', () => {
    const { s, snap, saved } = ride('idle');
    let steps = 0;
    while (snap().phase === 'run' && steps++ < 30 * 180) s.step(1);
    expect(snap().phase).toBe('garage');
    expect(snap().wave).toBeLessThanOrEqual(2);
    expect(saved().bank).toBe(s.sim.summary().partsEarned);
    expect(saved().totals.runsFallen).toBe(1);
    expect(s.sim.isOver()).toBe(false);
    expect(s.sim.inMenu?.()).toBe(true);
    s.step(30 * 60);
    expect(snap().phase).toBe('garage');
    expect(saved().runs).toBe(1);
    s.sim.receive!({ type: 'garageRow', row: 0 }); s.step(1);
    expect(snap()).toMatchObject({ phase: 'run', wave: 1, baseHp: 100, partsRun: 0 });
    expect(saved().runs).toBe(2);
    expect(s.finish().events.filter((e) => e.type === 'runEnded')).toMatchObject([{ data: { reason: 'fell' } }]);
  });

  it('bails mid-wave once, preserves parts and other game saves, and resets combat on restart', () => {
    const { s, snap, saved, profile, other } = ride();
    s.step(30 * 170); // past the first wave's 45 s lull and its 90 s interval
    expect(snap().phase).toBe('run');
    expect(snap().partsRun).toBeGreaterThan(0);
    const parts = snap().partsRun, bank = snap().bank, kills = saved().totals.kills;
    s.sim.receive!({ type: 'bail' }); s.sim.receive!({ type: 'bail' }); s.step(1);
    expect(snap()).toMatchObject({ phase: 'garage', bank, enemies: [], towers: [], shells: [], workshop: null, surge: null, spin: null, railCharges: 0 });
    expect(saved().totals).toMatchObject({ runsBailed: 1, runsFallen: 0 });
    expect(saved().totals.kills).toBeGreaterThanOrEqual(kills);
    expect(profile.gameData.lighthouse).toEqual(other);
    s.step(1);
    expect(s.mixer.debug().activeEffects).toContainEqual(expect.objectContaining({ id: 'weapon', mode: 'sim', gradePct: 0 }));
    s.sim.receive!({ type: 'garageRow', row: 0 }); s.step(1);
    expect(snap()).toMatchObject({ phase: 'run', baseHp: 100, partsRun: 0, railCharges: 0, towers: [], enemies: [], waveElapsed: 0 });
    expect(s.sim.summary()).toMatchObject({ runs: 2, runsBailed: 1, partsEarned: parts });
    const before = structuredClone(saved());
    const record = s.finish();
    expect(saved()).toEqual(before); // dispose doesn't double-bank kills or parts
    expect(record.events.filter((e) => e.type === 'runEnded')).toMatchObject([{ data: { reason: 'bail', parts } }]);
  });

  it('gives a breather before accumulating pedalling time for auto-start', () => {
    const { s, snap } = ride();
    s.step(30 * 70); s.sim.receive!({ type: 'bail' }); s.step(1);
    expect(snap().garage).toMatchObject({ breatherLeft: 6, autoLeft: 30 });
    s.step(30 * 5);
    expect(snap().garage!.autoLeft).toBe(30);
    s.step(30 * 29);
    expect(snap().phase).toBe('garage');
    s.step(30 * 3);
    expect(snap().phase).toBe('run');
    expect(s.sim.summary().runs).toBe(2);
  });

  it('keeps achievement wave progress per run and ride totals across runs', () => {
    const { s } = ride();
    s.step(30 * 70); s.sim.receive!({ type: 'bail' }); s.step(1);
    const first = Number(s.sim.summary().wavesSurvived);
    s.sim.receive!({ type: 'garageRow', row: 0 }); s.step(1); s.step(30 * 70);
    expect(s.sim.summary().wavesSurvived).toBe(first);
    expect(s.sim.summary().wavesCleared).toBe(first * 2);
  });
});
