import { describe, expect, it } from 'vitest';
import { createGameSession, testProfile, NullInput, TuningRegistry } from '../../../core';
import { module } from '../index';
import { BOSS_NAMES, DESCENT, FLOORS, SWEEPER, TIERS, ZONE_STARTS, planFor, startFloors, unlockAfterWin } from '../sim/descent';
import { runResultLine } from '../render/runResult';
import type { DungeonSnapshot } from '../sim/types';

describe('the descent (pure)', () => {
  it('is 7 floors through the four zones, every boss once, the Grim Sweeper last', () => {
    expect(FLOORS).toBe(7);
    expect(DESCENT.map((p) => p.zone)).toEqual([0, 0, 2, 1, 3, 3, 1]);
    expect(new Set(DESCENT.map((p) => p.boss)).size).toBe(BOSS_NAMES.length);
    expect(planFor(FLOORS)).toMatchObject({ boss: SWEEPER, final: true });
    expect(DESCENT.filter((p) => p.final)).toHaveLength(1);
    expect(planFor(0).floor).toBe(1); expect(planFor(99).floor).toBe(FLOORS);
  });
  it('shortcut starts are zone starts, never the final floor, and need the floor reached', () => {
    expect(ZONE_STARTS).toEqual([1, 3, 4, 5]);
    expect(startFloors(0, 7)).toEqual([1]);
    expect(startFloors(3, 7)).toEqual([1, 3, 4, 5]);
    expect(startFloors(3, 3)).toEqual([1, 3]);
  });
  it('a win unlocks the next Category only from the top unlocked one, capped at World Tour', () => {
    expect(unlockAfterWin(0, 0)).toBe(1);
    expect(unlockAfterWin(0, 3)).toBe(3);
    expect(unlockAfterWin(TIERS.length - 1, TIERS.length - 1)).toBe(TIERS.length - 1);
    for (let i = 1; i < TIERS.length; i++) { expect(TIERS[i].hp).toBeGreaterThan(TIERS[i - 1].hp); expect(TIERS[i].coins).toBeGreaterThan(TIERS[i - 1].coins); }
  });
  it('the camp summary line names a win or a fall', () => {
    const base = { floor: 7, startFloor: 1, tier: 0, timeS: 2712, kills: 400, bosses: 7, perks: 6, banked: 4200, level: 14, weapon: 'Bow' };
    expect(runResultLine({ ...base, won: true, unlocked: 'Cat 3' }, false)).toMatch(/finished in 45:12 · Cat 4 · 7 bosses.*Cat 3 unlocked/);
    expect(runResultLine({ ...base, won: false, floor: 3 }, true)).toBe('Fell on floor 3 (The Catacombs). Coins banked.');
  });
});

describe('finishing a descent (sim)', () => {
  it('beating the Grim Sweeper and riding through the finish wins: camp, Cat 3 unlocked, save and event', () => {
    const reg = new TuningRegistry();
    reg.set('dungeon.bossHp', 400); // a short fight; the rules under test are the floor plan and the win
    let saved: any = null;
    const profile = testProfile();
    (profile.gameData as Record<string, unknown>).dungeon = { ver: 3, bank: 0, upgrades: {}, bestFloor: 7, runs: 0, autoInvest: false };
    const s = createGameSession({ game: module, profile, input: new NullInput(), fake: { script: 'z2' }, seed: 4, tuningRegistry: reg,
      simOpts: { autopilot: true, floor: 7, invulnerable: true, perks: 'none' }, onSave: (d) => { saved = d; } });
    const snap = () => s.sim.snapshot() as DungeonSnapshot;
    expect(snap().run).toMatchObject({ floors: 7, final: true, tier: 'Cat 4' });
    expect(snap().world.rooms.length).toBe(4);
    let sawSweeper = false;
    for (let i = 0; i < 60 * 60 * 15 && snap().phase === 'run'; i++) { s.step(1); if (snap().boss?.name === 'The Grim Sweeper') sawSweeper = true; }
    expect(sawSweeper).toBe(true);
    const c = snap().camp!;
    expect(snap().phase).toBe('camp');
    expect(c.lastRun).toMatchObject({ won: true, floor: 7, tier: 0, unlocked: 'Cat 3' });
    expect(saved).toMatchObject({ tierUnlocked: 1, tier: 1, wins: [1, 0, 0, 0, 0, 0] });
    expect(c.rows.some((r) => r.kind === 'tier')).toBe(true);
    const ev = s.finish().events.filter((e) => e.type === 'descentWon');
    expect(ev).toHaveLength(1);
    expect(ev[0].data).toMatchObject({ tier: 0, startFloor: 7 });
  });
});
