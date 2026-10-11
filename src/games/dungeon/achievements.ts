import type { AchievementDef } from '../../contracts';
import { countEvents, feat, hasEvent, num, tally } from '../../progression/kit';

const G = 'dungeon';
const bestFloor = tally(G, 'bestFloor', (r) => num(r, 'Deepest floor'), 'max');
const kills = tally(G, 'kills', (r) => num(r, 'Kills'));
const bosses = tally(G, 'bosses', (r) => num(r, 'Bosses slain'));
const secondWinds = tally(G, 'secondWinds', (r) => Math.max(num(r, 'Second Winds'), countEvents(r, 'secondWind')));
const curses = tally(G, 'curses', (r) => num(r, 'Curses survived'));
const stanceKills = (st: string) => tally(G, `kills_${st}`, (r) => countEvents(r, 'kill', (d) => d.stance === st));
const uniques = tally(G, 'uniques', (r) => Math.max(num(r, 'Uniques found'), countEvents(r, 'uniqueFound')));

export const achievements: AchievementDef[] = [
  bosses({ id: 'dungeon_clear', name: 'Dungeon Clear', desc: 'Defeat 30 bosses in Crank Crawler', bonusXp: 75, goal: 30, unit: ' bosses' }),
  bestFloor({ id: 'dg_floor5', name: 'Delver', desc: 'Reach floor 8 of Crank Crawler', bonusXp: 50, goal: 8, unit: ' floors' }),
  bestFloor({ id: 'dg_floor10', name: 'Deep Delver', desc: 'Reach floor 12 of Crank Crawler', bonusXp: 100, goal: 12, unit: ' floors' }),
  bestFloor({ id: 'dg_floor20', name: 'Abyssal', desc: 'Reach floor 20 of Crank Crawler', bonusXp: 150, goal: 20, unit: ' floors' }),
  uniques({ id: 'dg_unique', name: 'Legendary Loot', desc: 'Find 10 unique weapons', bonusXp: 60, goal: 10, unit: ' uniques' }),
  feat(G, { id: 'dg_elites', name: 'Elite Hunter', desc: 'Slay 75 elites in one dive', bonusXp: 60, check: (r) => num(r, 'Elites slain') >= 75 }),
  feat(G, { id: 'dg_deathless', name: 'Untouchable', desc: 'Defeat 8 bosses in one dive without dying', bonusXp: 80, check: (r) => num(r, 'Bosses slain') >= 8 && num(r, 'Deaths') === 0 }),
  // 12 in one ride needed ~60+ min even for a rider using actions (z2 hour rides see 7-10): 6 is a solid 40-min ride
  feat(G, { id: 'dg_curses', name: 'Curse Breaker', desc: 'Survive 6 curses in one ride', bonusXp: 60, check: (r) => num(r, 'Curses survived') >= 6 }),
  curses({ id: 'dg_curses_total', name: 'Curse Eater', desc: 'Survive 100 curses in Crank Crawler', bonusXp: 100, goal: 100, unit: ' curses' }),
  secondWinds({ id: 'dg_second_wind', name: 'Not Today', desc: 'Get saved by Second Wind 25 times', bonusXp: 60, goal: 25, unit: ' saves' }),
  feat(G, { id: 'dg_perfect_exposure', name: 'Perfect Exposure', desc: 'Land a Strike in every Exposed window of a boss fight (2+ windows)', bonusXp: 60,
    check: (r) => hasEvent(r, 'bossDefeated', (d) => Number(d.windows) >= 2 && Number(d.struck) >= Number(d.windows)) }),
  feat(G, { id: 'dg_full_arsenal', name: 'Full Arsenal', desc: 'Carry a rare or better weapon in every stance in one dive', bonusXp: 50, check: (r) => hasEvent(r, 'fullArsenal') }),
  feat(G, { id: 'dg_spin_doctor', name: 'Spin Doctor', desc: 'Answer 3 called spin-ups in one ride', bonusXp: 50, check: (r) => countEvents(r, 'spinup', (d) => d.ok === true) >= 3 }),
  stanceKills('vanguard')({ id: 'dg_master_vanguard', name: 'Vanguard Mastery', desc: 'Defeat 2,000 monsters as Vanguard', bonusXp: 80, goal: 2000, unit: ' kills' }),
  stanceKills('ranger')({ id: 'dg_master_ranger', name: 'Ranger Mastery', desc: 'Defeat 2,000 monsters as Ranger', bonusXp: 80, goal: 2000, unit: ' kills' }),
  stanceKills('skirmisher')({ id: 'dg_master_skirmisher', name: 'Skirmisher Mastery', desc: 'Defeat 2,000 monsters as Skirmisher', bonusXp: 80, goal: 2000, unit: ' kills' }),
  stanceKills('arcanist')({ id: 'dg_master_arcanist', name: 'Arcanist Mastery', desc: 'Defeat 2,000 monsters as Arcanist', bonusXp: 80, goal: 2000, unit: ' kills' }),
  kills({ id: 'dg_kills', name: 'Monster Masher', desc: 'Defeat 25,000 monsters in Crank Crawler', bonusXp: 150, goal: 25000, unit: ' kills' }),
];
