import { describe, expect, it } from 'vitest';
import type { Profile } from '../contracts';
import { defaultProfile } from './defaults';
import { RULES_VERSION, levelForXp } from './levels';
import { rebalanceProfile } from './rebalance';

const old = (over: Partial<Profile>): Profile => ({ ...defaultProfile(), gameData: {}, ...over });

describe('rebalanceProfile', () => {
  it('re-grades a v1 profile once: level from XP, changed feats revoked, unchanged kept, picks above the level dropped', () => {
    const p = old({
      xp: 1500, level: 6,
      achievements: ['first_ride', 'keeper_20', 'lh_clockwork', 'storm_chaser', 'lh_lens'],
      counters: { 'lighthouse.storms': 30 },
      cosmetics: { picks: { 5: 'cruiser' }, loadout: { hat: 'lamp' } },
    });
    const r = rebalanceProfile(p);
    // keeper_20 (60) and lh_clockwork (60) bonuses come back off.
    expect(r.xp).toBe(1500 - 120);
    expect(r.level).toBe(levelForXp(1380));
    expect(r.level).toBeLessThan(5);
    expect(r.achievements).toEqual(['first_ride', 'storm_chaser', 'lh_lens']); // 30 storms still meets the new 25
    expect(r.cosmetics?.picks).toEqual({});
    expect((r.gameData._progression as { rules: number }).rules).toBe(RULES_VERSION);
    expect(rebalanceProfile(r)).toBe(r);
  });
  it('revokes a goal achievement the saved counters no longer meet', () => {
    const r = rebalanceProfile(old({ achievements: ['storm_chaser'], counters: { 'lighthouse.storms': 4 } }));
    expect(r.achievements).toEqual([]);
  });
  it('leaves new profiles alone', () => {
    const p = { ...defaultProfile(), achievements: ['keeper_20'] };
    expect(rebalanceProfile(p)).toBe(p);
  });
});
