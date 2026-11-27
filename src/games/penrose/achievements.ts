import type { AchievementDef, SessionRecord } from '../../contracts';
import { feat, hasEvent, num, tally } from '../../progression/kit';
import { virtualRide } from '../../progression/rideStats';
import { CAMPAIGN } from './campaign';

/**
 * Penrose Pedals achievements. Summary keys and events come from sim/sim.ts; thresholds for the mastery ones are its
 * `MASTERY`. Solves (Watch a solve) never count, and the early chapters are left out of the no-fall feats because
 * their levels are easy to clear clean. While Penrose is under construction these are not awarded (progression skips
 * games in `wipGames`).
 */
const G = 'penrose';
const chapters = (r: Readonly<SessionRecord>) => num(r, 'chaptersDone');
const chapterTiers = tally(G, 'chapters', chapters, 'bits');

export const achievements: AchievementDef[] = [
  chapterTiers({ id: 'pp_cartographer', name: 'Cartographer', desc: 'Clear every level in 3 Penrose Pedals chapters', bonusXp: 60, goal: 3, unit: ' chapters' }),
  feat(G, { id: 'pp_cube', name: 'The Cube', desc: 'Clear The Cube', bonusXp: 100, check: (r) => hasEvent(r, 'level-cleared', (d) => d.id === 'x-cube') }),
  chapterTiers({ id: 'pp_monument', name: 'Monument', desc: 'Clear every level in every Penrose Pedals chapter', bonusXp: 200, goal: CAMPAIGN.length, unit: ' chapters' }),
  feat(G, { id: 'pp_grand_tour', name: 'Grand Tour', desc: 'Clear 8 different levels in one Penrose Pedals ride', bonusXp: 60, check: (r) => num(r, 'levelsRidden') >= 8 }),
  tally(G, 'clean', (r) => num(r, 'cleanLevels'), 'max')({ id: 'pp_sure_wheel', name: 'Sure Wheel', desc: 'Clear 20 levels from chapter 3 on without a fall, a hint or a solve', bonusXp: 80, goal: 20, unit: ' levels' }),
  feat(G, { id: 'pp_unbroken', name: 'Unbroken', desc: 'Clear 5 levels in a row from chapter 4 on without a fall, a hint, a solve or a skip', bonusXp: 80, check: (r) => num(r, 'bestStreak') >= 5 }),
  feat(G, { id: 'pp_own_eyes', name: 'Own Eyes', desc: 'Clear every level of a chapter from 5 to 8 in one ride, without a hint or a solve', bonusXp: 80, check: (r) => num(r, 'unaidedChapters') >= 1 }),
  feat(G, { id: 'pp_spring_tide', name: 'Spring Tide', desc: 'Hold the tide fully in for a minute in one ride', bonusXp: 60, check: (r) => num(r, 'tideFullS') >= 60 }),
  {
    id: 'pp_escher', name: "Escher's Staircase", desc: 'Climb 2,000 m in Penrose Pedals (machine load sets the grade)', bonusXp: 100, goal: 2000, unit: ' m',
    count: { key: 'penrose.climbM', agg: 'sum', of: (r, p) => (r.gameId === G ? virtualRide(r.samples, p.weightKg || 75).climbM : 0) },
  },
  tally(G, 'falls', (r) => num(r, 'falls'))({ id: 'pp_gravity', name: 'Gravity Always Wins', desc: 'Fall 100 times in Penrose Pedals', bonusXp: 30, goal: 100, unit: ' falls', secret: true }),
];
