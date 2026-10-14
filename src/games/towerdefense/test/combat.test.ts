import { describe, expect, it } from 'vitest';
import { createGameSession, makeRng, testProfile, TimelineInput } from '../../../core';
import type { Button, GameEvent, InputState } from '../../../contracts';
import { module } from '../index';
import { advanceBoss, bossColors, bossHpFloor, createBossState } from '../sim/boss';
import { ELEMENTS, MATCHUP, suggestedTower, TOWER_KINDS, TOWER_WEAPON, WEAPONS } from '../sim/defs';
import { effortMet, scheduleCall, type EffortView } from '../sim/efforts';
import type { TdSnapshot } from '../sim/types';
import { matchupCopy } from '../render/panels';

const snapshot = (s: ReturnType<typeof createGameSession>) => s.sim.snapshot() as TdSnapshot;
const timing = { phaseCountdownS: 3, exposedEveryS: 20, telegraphS: 3, exposedS: 5 };

describe('element matchups', () => {
  it('has exactly one strong, neutral and resisted element per weapon, with towers sharing their row', () => {
    expect(MATCHUP).toEqual({ gatling: { blue: 1.5, red: 1, purple: 0.5 }, flame: { blue: 0.5, red: 1.5, purple: 1 }, rail: { blue: 1, red: 0.5, purple: 1.5 } });
    for (const w of WEAPONS) expect(Object.values(MATCHUP[w]).sort()).toEqual([0.5, 1, 1.5]);
    expect(TOWER_KINDS.map((k) => TOWER_WEAPON[k])).toEqual(['gatling', 'flame', 'rail']);
  });
  it('registers all nine live tunables and exposes overrides to the UI', () => {
    const s = createGameSession({ game: module, profile: testProfile(), input: new TimelineInput([]), fake: { script: 'z2' } });
    const keys = s.tuning.list('towerdefense').map((e) => e.name);
    expect(keys.filter((k) => k.startsWith('match_'))).toHaveLength(9);
    expect(keys).not.toContain('goodMult'); expect(keys).not.toContain('badMult'); expect(keys).not.toContain('bossShieldCycleS');
    for (const w of WEAPONS) for (const e of ELEMENTS) {
      s.tuning.set(`towerdefense.match_${w}_${e}`, 1.25);
      expect(snapshot(s).matchup[w][e]).toBe(1.25);
    }
    expect(matchupCopy({ matchup: MATCHUP }, 'red')).toContain('FLAMER ✓');
    expect(matchupCopy({ matchup: MATCHUP }, 'red')).toContain('RAILGUN ✗');
  });
  it('suggests strong off-colour coverage, never a resisted tower, including live matrix overrides', () => {
    for (const brood of ELEMENTS) for (const target of ELEMENTS.filter((e) => e !== brood)) {
      const counts = { blue: 0, red: 0, purple: 0, [brood]: 100, [target]: 20 };
      const k = suggestedTower(counts, brood);
      expect(MATCHUP[TOWER_WEAPON[k]][target]).toBe(1.5);
    }
    const tuned = { ...MATCHUP, gatling: { ...MATCHUP.gatling, red: 2 }, flame: { ...MATCHUP.flame, red: 0.5 } };
    expect(suggestedTower({ blue: 100, red: 20, purple: 0 }, 'blue', tuned)).toBe('tesla');
  });
  it('chains fire kills with a shared burst budget and emits renderer events', () => {
    const events: GameEvent[] = [];
    const s = createGameSession({ game: module, profile: testProfile(), input: new TimelineInput([]), fake: { script: 'z2' }, seed: 1, simOpts: { autopilot: true }, onEmit: (e) => events.push(e) });
    s.tuning.set('towerdefense.ignitionChance', 1);
    s.tuning.set('towerdefense.ignitionRadius', 25);
    s.tuning.set('towerdefense.ignitionDamage', 100);
    s.tuning.set('towerdefense.ignitionChainCap', 3);
    s.step(30 * 60 * 10);
    const bursts = events.filter((e) => e.type === 'burst');
    expect(bursts.length).toBeGreaterThan(10);
    expect(bursts.some((e) => e.data?.ordinal === 3)).toBe(true);
    const chains = new Map<number, number>();
    for (const e of bursts) {
      const id = Number(e.data?.chain);
      chains.set(id, (chains.get(id) ?? 0) + 1);
      expect(e.data?.radius).toBe(25);
    }
    expect(Math.max(...chains.values())).toBe(3);
    s.tuning.set('towerdefense.ignitionChainCap', 0);
    const before = bursts.length;
    s.step(30 * 60 * 2);
    expect(events.filter((e) => e.type === 'burst')).toHaveLength(before);
  });
});

describe('boss ladder', () => {
  it('announces HP-gated phases, then switches after the full countdown with a stagger', () => {
    const b = createBossState(bossColors('red', 3));
    expect(b.colors).toEqual(['red', 'purple', 'blue']);
    expect(bossColors('blue', 2)).toHaveLength(2);
    expect(bossHpFloor(b, 300)).toBe(200);
    expect(advanceBoss(b, 0.1, 2 / 3, timing)).toContain('phaseAnnounced');
    expect(b.phase).toBe(0); expect(b.pending).toBe(true);
    advanceBoss(b, 2.9, 2 / 3, timing); expect(b.phase).toBe(0);
    expect(advanceBoss(b, 0.1, 2 / 3, timing)).toContain('phaseStarted');
    expect(b.phase).toBe(1); expect(b.staggerS).toBeGreaterThan(0);
    expect(bossHpFloor(b, 300)).toBe(100);
    expect(advanceBoss(b, 0.1, 1 / 3, timing)).toContain('phaseAnnounced');
    advanceBoss(b, 3, 1 / 3, timing);
    expect(b.phase).toBe(2); expect(bossHpFloor(b, 300)).toBe(0);
    expect(advanceBoss(b, 0.1, 0.01, timing)).not.toContain('phaseAnnounced');
  });
  it('telegraphs each 5-second Exposed window and repeats at 20-second intervals', () => {
    const b = createBossState(bossColors('blue', 3));
    advanceBoss(b, 16, 1, timing); expect(b.telegraph).toBe(false);
    expect(advanceBoss(b, 1, 1, timing)).toContain('telegraph');
    expect(b.windowLeftS).toBe(3); expect(b.exposed).toBe(false);
    expect(advanceBoss(b, 3, 1, timing)).toContain('exposed');
    expect(b.windowLeftS).toBe(5); expect(b.exposed).toBe(true);
    advanceBoss(b, 5, 1, timing); expect(b.exposed).toBe(false);
    expect(advanceBoss(b, 12, 1, timing)).toContain('telegraph');
    expect(advanceBoss(b, 3, 1, timing)).toContain('exposed');
  });
  it('an optional hold-A push makes a Rail opening sprintable without changing trainer mode', () => {
    const held = new Set<Button>();
    const state: InputState = { held, pressed: new Set(), released: new Set(), paddleL: 0, paddleR: 0, paddleIdleS: 99, source: 'script' };
    const s = createGameSession({ game: module,
      profile: testProfile({ gameData: { towerdefense: { v: 2, runs: 1, bestWave: 8, upgrades: { headstart: 2 } } } }),
      input: { beginTick() {}, state: () => state }, fake: { script: 'z2' }, seed: 2, simOpts: { skipGarage: true, cores: 0 } });
    s.tuning.set('towerdefense.railLaserDps', 1); // keep the first Rail phase alive through its opening
    const effect = () => s.mixer.debug().activeEffects.find((e) => e.id === 'weapon')!;
    for (let i = 0; i < 30 * 40 && !snapshot(s).boss?.telegraph; i++) s.step(1);
    expect(snapshot(s).boss?.weapon).toBe('rail');
    expect(snapshot(s).boss?.telegraph).toBe(true);
    expect(effect().ftpFraction).toBe(0.95);
    expect(s.sim.hud!().controls!.some((c) => c.button === 'a')).toBe(true);
    held.add('a'); s.step(1);
    expect(effect().mode).toBe('erg'); expect(effect().ftpFraction).toBe(1.35);
    expect(snapshot(s).boss?.sprintBoost).toBe(true);
    let sprinted = false;
    for (let i = 0; i < 30 * 7; i++) { s.step(1); sprinted ||= Boolean(snapshot(s).boss?.exposed && s.ctx.bike().sprinting); }
    expect(sprinted).toBe(true);
    held.delete('a'); s.step(1);
    expect(effect().mode).toBe('erg'); expect(effect().ftpFraction).toBe(0.95);
    expect(snapshot(s).boss?.sprintBoost).toBe(false);
  });
  it('sprinting only in Exposed windows kills a boss faster at the same cadence and power', () => {
    const ride = (sprint: boolean) => {
      const events: Array<GameEvent & { t: number }> = [];
      const s = createGameSession({ game: module,
        profile: testProfile({ gameData: { towerdefense: { v: 2, runs: 1, bestWave: 8, upgrades: { headstart: 2 } } } }),
        input: new TimelineInput([]), fake: { script: 'z2' }, seed: 1, simOpts: { skipGarage: true, cores: 0 }, onEmit: (e) => events.push(e) });
      // Hold watts and cadence identical to isolate the sprint bonus from extra fire rate / watts.
      const bike = s.ctx.bike;
      s.ctx.bike = () => ({ ...bike(), sprinting: sprint && Boolean(snapshot(s).boss?.exposed) });
      const stops: number[] = [];
      for (let i = 0; i < 30 * 80; i++) {
        s.step(1);
        for (const f of snapshot(s).fx) if (f.kind === 'hitStop') stops.push(f.seconds);
      }
      expect(stops.length).toBeGreaterThan(0);
      expect(Math.max(...stops)).toBeLessThanOrEqual(0.1);
      expect(events.filter((e) => e.type === 'bossPhaseStarted')).toHaveLength(3);
      expect(events.some((e) => e.type === 'bossTelegraph')).toBe(true);
      expect(events.some((e) => e.type === 'bossExposed')).toBe(true);
      return events.find((e) => e.type === 'bossKilled')!.t;
    };
    expect(ride(true)).toBeLessThan(ride(false) - 0.2);
  });
});

describe('called-effort scheduler', () => {
  it('spaces calls 2–3 waves apart, postpones boss calls, and matches the weapon', () => {
    const rng = makeRng(9), scheduler = { nextWave: 2, lastWave: 0 };
    let last = 0, count = 0;
    for (let wave = 1; wave <= 200; wave++) {
      const weapon = WEAPONS[wave % 3];
      const call = scheduleCall(scheduler, wave, wave % 5 === 0, weapon, rng, 2, 3);
      if (!call) continue;
      expect(call).toBe({ gatling: 'spin', flame: 'grind', rail: 'hold' }[weapon]);
      expect(wave % 5).not.toBe(0);
      if (last) { expect(wave - last).toBeGreaterThanOrEqual(2); expect(wave - last).toBeLessThanOrEqual(4); }
      last = wave; count++;
    }
    expect(count).toBeGreaterThan(60);
  });
  it('requires cadence and power together; hold also has a power ceiling', () => {
    const e: EffortView = { kind: 'grind', wave: 2, state: 'active', countdownS: 0, heldS: 0, needS: 8, leftS: 18,
      minRpm: 45, maxRpm: 81, minFtp: 0.6, maxFtp: 3, targetFtp: 0.65 };
    expect(effortMet(e, 70, 0.65)).toBe(true);
    expect(effortMet(e, 90, 0.65)).toBe(false);
    expect(effortMet(e, 70, 0.3)).toBe(false);
    expect(effortMet(e, 0, 0)).toBe(false);
    expect(effortMet({ ...e, kind: 'hold', minRpm: 60, maxRpm: 140, maxFtp: 0.73 }, 90, 1)).toBe(false);
  });
});
