import { describe, expect, it } from 'vitest';
import { createGameSession, NullInput, testProfile, TuningRegistry } from '../../../core';
import { module } from '../index';
import { FLOORS, TIERS, floorRoomCount } from '../sim/descent';
import type { DungeonSnapshot } from '../sim/types';

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
    (pCat4.gameData as Record<string, unknown>).dungeon = { ver: 4, bank: 0, upgrades: {}, bestFloor: 7, runs: 1, tierUnlocked: 5, tier: 0, autoInvest: false };
    const s4 = createGameSession({ game: module, profile: pCat4, input: new NullInput(), fake: { script: 'z2' }, seed: 4, simOpts: { skipCamp: true, floor: 7 } });

    const pWT = testProfile();
    (pWT.gameData as Record<string, unknown>).dungeon = { ver: 4, bank: 0, upgrades: {}, bestFloor: 7, runs: 1, tierUnlocked: 5, tier: 5, autoInvest: false };
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
    (profile.gameData as Record<string, unknown>).dungeon = { ver: 4, bank: 0, upgrades: {}, bestFloor: 7, runs: 0, autoInvest: false };
    const s = createGameSession({
      game: module, profile, input: new NullInput(), fake: { script: 'z2' }, seed: 4, tuningRegistry: reg,
      simOpts: { skipCamp: true, floor: 7, invulnerable: true, skills: 'none' },
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
