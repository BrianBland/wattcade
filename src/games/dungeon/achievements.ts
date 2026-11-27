import type { AchievementDef, SessionRecord } from '../../contracts';
import { countEvents, feat, hasEvent, num, tally } from '../../progression/kit';

const G = 'dungeon';
// Entering a floor (including a camp start) is not evidence of defeating its boss.
// Use a new counter so saved bestFloor progress cannot satisfy the new goals.
const bestClear = tally(G, 'bestClearedFloor', (r) => r.events.reduce((best, e) =>
  e.type === 'bossDefeated' ? Math.max(best, Number(e.data?.floor) || 0) : best, 0), 'max');
const kills = tally(G, 'kills', (r) => num(r, 'Kills'));
const bosses = tally(G, 'bosses', (r) => num(r, 'Bosses slain'));
const secondWinds = tally(G, 'secondWinds', (r) => Math.max(num(r, 'Second Winds'), countEvents(r, 'secondWind')));
const curses = tally(G, 'curses', (r) => num(r, 'Curses survived'));
const archKills = (arch: string) => tally(G, `kills_${arch}`, (r) => countEvents(r, 'kill', (d) => d.archetype === arch));
const uniques = tally(G, 'uniques', (r) => Math.max(num(r, 'Uniques found'), countEvents(r, 'uniqueFound')));

/** Best count within a descent, including a successful dive before a later death. */
function bestDive(r: Readonly<SessionRecord>, type: string, predicate = (_d: Record<string, number | string | boolean>) => true): number {
  let current = 0, best = 0;
  for (const e of r.events) {
    if (e.type === 'death') current = 0;
    else if (e.type === type && predicate(e.data ?? {})) best = Math.max(best, ++current);
  }
  return best;
}

export const achievements: AchievementDef[] = [
  bosses({ id: 'dungeon_clear', name: 'Dungeon Clear', desc: 'Defeat 30 bosses in Purgatour', bonusXp: 75, goal: 30, unit: ' bosses' }),
  // The descent is 7 floors (sim/descent.ts): the Lycra Lich, the last Deep boss, and the Grim Sweeper.
  bestClear({ id: 'dg_floor5', name: 'Delver', desc: 'Defeat the Lycra Lich (floor 4) in Purgatour', bonusXp: 50, goal: 4, unit: ' boss floor' }),
  bestClear({ id: 'dg_floor10', name: 'Deep Delver', desc: 'Defeat the Headwind Wyrm (floor 6) in Purgatour', bonusXp: 100, goal: 6, unit: ' boss floor' }),
  bestClear({ id: 'dg_floor20', name: 'Swept Away', desc: 'Defeat the Grim Sweeper (floor 7) in Purgatour', bonusXp: 150, goal: 7, unit: ' boss floor' }),
  feat(G, { id: 'dg_finish', name: 'Over the Line', desc: 'Finish a Purgatour descent from floor 1', bonusXp: 100, check: (r) => hasEvent(r, 'descentWon', (d) => Number(d.startFloor) === 1) }),
  feat(G, { id: 'dg_world_tour', name: 'World Tour', desc: 'Finish a Purgatour descent in the World Tour category', bonusXp: 200, check: (r) => hasEvent(r, 'descentWon', (d) => Number(d.tier) >= 5) }),
  uniques({ id: 'dg_unique', name: 'Legendary Loot', desc: 'Find 10 unique weapons', bonusXp: 60, goal: 10, unit: ' uniques' }),
  feat(G, { id: 'dg_elites', name: 'Elite Hunter', desc: 'Slay 75 elites in one dive', bonusXp: 60, check: (r) => bestDive(r, 'kill', (d) => d.elite === true) >= 75 }),
  feat(G, { id: 'dg_deathless', name: 'Untouchable', desc: 'Defeat all 7 bosses of a descent without dying', bonusXp: 80, check: (r) => bestDive(r, 'bossDefeated') >= 7 }),
  feat(G, { id: 'dg_curses', name: 'Curse Breaker', desc: 'Survive 6 curses in one ride', bonusXp: 60, check: (r) => num(r, 'Curses survived') >= 6 }),
  curses({ id: 'dg_curses_total', name: 'Curse Eater', desc: 'Survive 100 curses in Purgatour', bonusXp: 100, goal: 100, unit: ' curses' }),
  secondWinds({ id: 'dg_second_wind', name: 'Not Today', desc: 'Get saved by Second Wind 25 times', bonusXp: 60, goal: 25, unit: ' saves' }),
  feat(G, { id: 'dg_perfect_exposure', name: 'Perfect Exposure', desc: 'In one dive, defeat 3 bosses on floor 3+ with a Strike in every Exposed window (2+ windows each)', bonusXp: 60,
    check: (r) => bestDive(r, 'bossDefeated', (d) => Number(d.floor) >= 3 && Number(d.windows) >= 2 && Number(d.struck) === Number(d.windows)) >= 3 }),
  feat(G, { id: 'dg_capstone', name: 'Keystone Master', desc: 'Unlock a Tier 4 Capstone Keystone in any Hero skill tree', bonusXp: 60,
    check: (r) => hasEvent(r, 'skillInvest', (d) => Number(d.tier) === 4) }),
  feat(G, { id: 'dg_spin_doctor', name: 'Spin Doctor', desc: 'Answer 3 called spin-ups in one ride', bonusXp: 50, check: (r) => countEvents(r, 'spinup', (d) => d.ok === true) >= 3 }),
  archKills('rouleur')({ id: 'dg_master_rouleur', name: 'Diesel Veteran', desc: 'Defeat 2,000 monsters as The Rouleur', bonusXp: 80, goal: 2000, unit: ' kills' }),
  archKills('puncheur')({ id: 'dg_master_puncheur', name: 'Crit Veteran', desc: 'Defeat 2,000 monsters as The Puncheur', bonusXp: 80, goal: 2000, unit: ' kills' }),
  archKills('grimpeur')({ id: 'dg_master_grimpeur', name: 'Mountain Goat', desc: 'Defeat 2,000 monsters as The Grimpeur', bonusXp: 80, goal: 2000, unit: ' kills' }),
  kills({ id: 'dg_kills', name: 'Monster Masher', desc: 'Defeat 25,000 monsters in Purgatour', bonusXp: 150, goal: 25000, unit: ' kills' }),
];
