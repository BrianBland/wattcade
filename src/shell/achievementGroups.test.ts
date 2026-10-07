import { describe, expect, it } from 'vitest';
import type { AchievementView } from './types';
import { closestGoals, groupAchievements } from './achievementGroups';

const v = (id: string, group: string, extra: Partial<AchievementView> = {}): AchievementView =>
  ({ id, name: id, desc: '', unlocked: false, secret: false, group, progress: null, ...extra });

describe('achievement groups', () => {
  it('puts Everywhere first and keeps game order', () => {
    const g = groupAchievements([v('a', 'Dungeon'), v('b', 'Everywhere', { unlocked: true }), v('c', 'Lighthouse'), v('d', 'Dungeon')]);
    expect(g.map((x) => x.title)).toEqual(['Everywhere', 'Dungeon', 'Lighthouse']);
    expect(g[0].done).toBe(1);
    expect(g[1].items.map((x) => x.id)).toEqual(['a', 'd']);
  });
  it('closest goals skip secrets, unstarted and unlocked ones', () => {
    const p = (frac: number) => ({ frac, label: '' });
    const list = [v('a', 'E', { progress: p(0.2) }), v('b', 'E', { progress: p(0.9) }), v('c', 'E', { progress: p(0) }),
      v('d', 'E', { progress: p(0.95), secret: true }), v('e', 'E', { progress: p(0.5), unlocked: true }), v('f', 'E', { progress: p(0.6) })];
    expect(closestGoals(list, 2).map((x) => x.id)).toEqual(['b', 'f']);
  });
});
