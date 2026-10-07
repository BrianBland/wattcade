import type { AchievementDef } from '../../contracts';
import { feat, hasEvent, num, tally } from '../../progression/kit';

const G = 'dungeon';
const bestFloor = tally(G, 'bestFloor', (r) => num(r, 'Deepest floor'), 'max');
const kills = tally(G, 'kills', (r) => num(r, 'Kills'));

export const achievements: AchievementDef[] = [
  feat(G, { id: 'dungeon_clear', name: 'Dungeon Clear', desc: 'Defeat the boss', bonusXp: 75, check: (r) => hasEvent(r, 'bossDefeated') }),
  bestFloor({ id: 'dg_floor5', name: 'Delver', desc: 'Reach floor 5 of Crank Crawler', bonusXp: 40, goal: 5, unit: ' floors' }),
  bestFloor({ id: 'dg_floor10', name: 'Deep Delver', desc: 'Reach floor 10 of Crank Crawler', bonusXp: 80, goal: 10, unit: ' floors' }),
  bestFloor({ id: 'dg_floor20', name: 'Abyssal', desc: 'Reach floor 20 of Crank Crawler', bonusXp: 150, goal: 20, unit: ' floors' }),
  feat(G, { id: 'dg_unique', name: 'Legendary Loot', desc: 'Find a unique weapon', bonusXp: 50, check: (r) => hasEvent(r, 'uniqueFound') }),
  feat(G, { id: 'dg_elites', name: 'Elite Hunter', desc: 'Slay 25 elites in one dive', bonusXp: 50, check: (r) => num(r, 'Elites slain') >= 25 }),
  feat(G, { id: 'dg_deathless', name: 'Untouchable', desc: 'Defeat 3 bosses in one dive without dying', bonusXp: 60, check: (r) => num(r, 'Bosses slain') >= 3 && num(r, 'Deaths') === 0 }),
  feat(G, { id: 'dg_curses', name: 'Curse Breaker', desc: 'Survive 5 curses in one dive', bonusXp: 40, check: (r) => num(r, 'Curses survived') >= 5 }),
  kills({ id: 'dg_kills', name: 'Monster Masher', desc: 'Defeat 5,000 monsters in Crank Crawler', bonusXp: 100, goal: 5000, unit: ' kills' }),
];
