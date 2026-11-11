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
  it('v2 to v3 revokes the retired Dynamo Defense achievements with their frozen bonus XP, and nothing else', () => {
    const p = old({
      xp: 2000, level: levelForXp(2000), gameData: { _progression: { rules: 2 } },
      achievements: ['first_ride', 'td_wave10', 'td_wave50', 'td_workshop', 'td_boss', 'keeper_20'],
    });
    const r = rebalanceProfile(p);
    expect(r.achievements).toEqual(['first_ride', 'td_boss', 'keeper_20']); // keeper_20 changed in v2, already re-graded
    expect(r.xp).toBe(2000 - 40 - 150 - 150);
    expect((r.gameData._progression as { rules: number }).rules).toBe(3);
  });
  it('a v1 profile takes both steps: retired ids lose their old bonus too', () => {
    const r = rebalanceProfile(old({ xp: 1000, achievements: ['td_spotless', 'keeper_20'], counters: {} }));
    expect(r.achievements).toEqual([]);
    expect(r.xp).toBe(1000 - 60 - 60);
  });
  it('leaves new profiles alone', () => {
    const p = { ...defaultProfile(), achievements: ['keeper_20'] };
    expect(rebalanceProfile(p)).toBe(p);
  });
});
