import { describe, expect, it } from 'vitest';
import { achievementProgress } from './achievementProgress';
import { testProfile } from '../core';

describe('achievementProgress', () => {
  it('measures lifetime kJ', () => {
    const p = { ...testProfile(), lifetime: { kj: 250, seconds: 0, sessions: 2, sprints: 0 } };
    expect(achievementProgress('kilojoule_1000', p)).toEqual({ frac: 0.25, label: '250/1000 kJ' });
  });
  it('counts games played and caps at done', () => {
    const p = { ...testProfile(), lastPlayed: { dungeon: 1, lighthouse: 2, towerdefense: 3, starfighter: 4 } };
    expect(achievementProgress('triple_threat', p)).toEqual({ frac: 1, label: '3/3 games' });
  });
  it('returns null for one-ride feats', () => {
    expect(achievementProgress('sprinter_10', testProfile())).toBeNull();
  });
});
