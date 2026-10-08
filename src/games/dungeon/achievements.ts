import type { AchievementDef } from '../../contracts';
import { countEvents, feat, hasEvent, num, tally } from '../../progression/kit';

const G = 'dungeon';
const bestFloor = tally(G, 'bestFloor', (r) => num(r, 'Deepest floor'), 'max');
const kills = tally(G, 'kills', (r) => num(r, 'Kills'));
const bosses = tally(G, 'bosses', (r) => num(r, 'Bosses slain'));
const uniques = tally(G, 'uniques', (r) => Math.max(num(r, 'Uniques found'), countEvents(r, 'uniqueFound')));

export const achievements: AchievementDef[] = [
  bosses({ id: 'dungeon_clear', name: 'Dungeon Clear', desc: 'Defeat 30 bosses in Crank Crawler', bonusXp: 75, goal: 30, unit: ' bosses' }),
  bestFloor({ id: 'dg_floor5', name: 'Delver', desc: 'Reach floor 8 of Crank Crawler', bonusXp: 50, goal: 8, unit: ' floors' }),
  bestFloor({ id: 'dg_floor10', name: 'Deep Delver', desc: 'Reach floor 12 of Crank Crawler', bonusXp: 100, goal: 12, unit: ' floors' }),
  bestFloor({ id: 'dg_floor20', name: 'Abyssal', desc: 'Reach floor 20 of Crank Crawler', bonusXp: 150, goal: 20, unit: ' floors' }),
  uniques({ id: 'dg_unique', name: 'Legendary Loot', desc: 'Find 10 unique weapons', bonusXp: 60, goal: 10, unit: ' uniques' }),
  feat(G, { id: 'dg_elites', name: 'Elite Hunter', desc: 'Slay 75 elites in one dive', bonusXp: 60, check: (r) => num(r, 'Elites slain') >= 75 }),
  feat(G, { id: 'dg_deathless', name: 'Untouchable', desc: 'Defeat 8 bosses in one dive without dying', bonusXp: 80, check: (r) => num(r, 'Bosses slain') >= 8 && num(r, 'Deaths') === 0 }),
  feat(G, { id: 'dg_curses', name: 'Curse Breaker', desc: 'Survive 12 curses in one dive', bonusXp: 60, check: (r) => num(r, 'Curses survived') >= 12 }),
  kills({ id: 'dg_kills', name: 'Monster Masher', desc: 'Defeat 25,000 monsters in Crank Crawler', bonusXp: 150, goal: 25000, unit: ' kills' }),
];
