import { describe, expect, it } from 'vitest';
import { createGameSession, NullInput, testProfile, TuningRegistry } from '../../../core';
import { module } from '../index';
import { FLOORS, TIERS, floorRoomCount } from '../sim/descent';
import { STANCES } from '../sim/stances';
import type { DungeonSnapshot } from '../sim/types';

describe('distinct stances with cadence overlap', () => {
  it('forms an ascending 70-100 rpm ladder where adjacent stances overlap cleanly', () => {
    const ladder = [STANCES.vanguard, STANCES.arcanist, STANCES.skirmisher, STANCES.ranger];
    for (let i = 0; i < ladder.length; i++) {
      expect(ladder[i].band[0]).toBeGreaterThanOrEqual(70);
      expect(ladder[i].band[1]).toBeLessThanOrEqual(100);
      expect(ladder[i].cdRefillBonus).toBeGreaterThanOrEqual(0.2);
      if (i > 0) {
        expect(ladder[i].band[0]).toBeGreaterThan(ladder[i - 1].band[0]);
        expect(ladder[i].band[1]).toBeGreaterThan(ladder[i - 1].band[1]);
        // Comfortable overlap between adjacent stances
        expect(ladder[i].band[0]).toBeLessThan(ladder[i - 1].band[1]);
      }
    }
    expect(STANCES.vanguard.strikeRadiusMult).toBeGreaterThan(1);
    expect(STANCES.arcanist.exposeBonusS).toBeGreaterThanOrEqual(1.5);
    expect(STANCES.skirmisher.rollCdMult).toBeLessThan(1);
    expect(STANCES.ranger.projSpeedMult).toBeGreaterThan(1.1);
    expect(STANCES.ranger.critBonus).toBeGreaterThan(0);
  });
});

describe('Category-scaled stage length', () => {
  it('scales floor room counts from Cat 4 Criterium up to World Tour Grand Tour', () => {
    expect(floorRoomCount(1, 0)).toBe(10); // Cat 4 floor 1 unchanged
    expect(floorRoomCount(FLOORS, 0, 4)).toBe(4); // Cat 4 Broom Wagon unchanged
    for (let t = 1; t < TIERS.length; t++) {
      expect(floorRoomCount(1, t)).toBeGreaterThan(floorRoomCount(1, t - 1));
      expect(floorRoomCount(FLOORS, t, 4)).toBeGreaterThan(floorRoomCount(FLOORS, t - 1, 4));
      expect(floorRoomCount(6, t)).toBeLessThanOrEqual(18);
    }

    // World Tour generates a larger Floor 7 Broom Wagon than Cat 4
    const pCat4 = testProfile();
    (pCat4.gameData as Record<string, unknown>).dungeon = { ver: 3, bank: 0, upgrades: {}, bestFloor: 7, runs: 1, tierUnlocked: 5, tier: 0, autoInvest: false };
    const s4 = createGameSession({ game: module, profile: pCat4, input: new NullInput(), fake: { script: 'z2' }, seed: 4, simOpts: { skipCamp: true, floor: 7 } });

    const pWT = testProfile();
    (pWT.gameData as Record<string, unknown>).dungeon = { ver: 3, bank: 0, upgrades: {}, bestFloor: 7, runs: 1, tierUnlocked: 5, tier: 5, autoInvest: false };
    const sWT = createGameSession({ game: module, profile: pWT, input: new NullInput(), fake: { script: 'z2' }, seed: 4, simOpts: { skipCamp: true, floor: 7 } });

    expect((s4.sim.snapshot() as DungeonSnapshot).world.rooms.length).toBe(4);
    expect((sWT.sim.snapshot() as DungeonSnapshot).world.rooms.length).toBe(9);
  });
});

describe('Find-Your-Bike & Cross-the-Finish-Line victory sequence', () => {
  it('walks to the reclaimed bike, mounts and sprints across the finish line, celebrates, and wins', () => {
    const reg = new TuningRegistry({ profileId: 'victory-seq' });
    reg.set('dungeon.bossHp', 350);
    const profile = testProfile();
    (profile.gameData as Record<string, unknown>).dungeon = { ver: 3, bank: 0, upgrades: {}, bestFloor: 7, runs: 0, autoInvest: false };
    const s = createGameSession({
      game: module, profile, input: new NullInput(), fake: { script: 'z2' }, seed: 4, tuningRegistry: reg,
      simOpts: { skipCamp: true, floor: 7, invulnerable: true, perks: 'none' },
    });
    const stages = new Set<string>();
    for (let i = 0; i < 60 * 60 * 15 && (s.sim.snapshot() as DungeonSnapshot).phase === 'run'; i++) {
      s.step(1);
      const snap = s.sim.snapshot() as DungeonSnapshot;
      if (snap.finishSeq) stages.add(snap.finishSeq.stage);
    }
    expect(stages.has('findBike')).toBe(true);
    expect(stages.has('rideToLine')).toBe(true);
    expect(stages.has('celebrate')).toBe(true);
    const endSnap = s.sim.snapshot() as DungeonSnapshot;
    expect(endSnap.phase).toBe('camp');
    expect(endSnap.camp?.lastRun?.won).toBe(true);
  });
});
