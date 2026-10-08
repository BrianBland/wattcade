import type { AchievementDef, Profile, SessionRecord } from '../contracts';
import { allGames, games } from '../games/registry';
import { activeSeconds, localDay, localHour, longestRun, peakAvg, popcount, variabilityIndex, virtualRide, weekday, weekOf, weekStreak } from './rideStats';

/** Kept for existing imports: the achievement shape lives in contracts. */
export type Achievement = AchievementDef;

const WEEK_MS = 7 * 24 * 3600 * 1000;
const ARCADE = games.map((g) => g.id);
const isArcade = (id: string) => ARCADE.includes(id);
const playedGames = (p: Readonly<Profile>) => ARCADE.filter((g) => p.lastPlayed[g] != null).length;
const day = (r: Readonly<SessionRecord>) => localDay(r.startedAt);
const hour = (r: Readonly<SessionRecord>) => localHour(r.startedAt);
/** Ride days before this ride's day. */
const earlierDays = (p: Readonly<Profile>, r: Readonly<SessionRecord>) => (p.rideDays ?? []).filter((d) => d < day(r));
const km = (r: Readonly<SessionRecord>, p: Readonly<Profile>) => virtualRide(r.samples, p.weightKg || 75);

const total = (id: string, name: string, desc: string, bonusXp: number, goal: number, unit: string, value: (p: Readonly<Profile>) => number): AchievementDef =>
  ({ id, name, desc, bonusXp, goal, unit, value });
const sum = (key: string, of: (r: Readonly<SessionRecord>, p: Readonly<Profile>) => number) =>
  (id: string, name: string, desc: string, bonusXp: number, goal: number, unit: string): AchievementDef =>
    ({ id, name, desc, bonusXp, goal, unit, count: { key, of, agg: 'sum' } });
const kmTotal = sum('ride.km', (r, p) => km(r, p).km);
const climbTotal = sum('ride.climbM', (r, p) => km(r, p).climbM);

/** Rides anywhere: cross-game, lifetime totals, calendar, and one-ride fitness feats. */
export const CORE_ACHIEVEMENTS: AchievementDef[] = [
  { id: 'first_ride', name: 'First Ride', desc: 'Finish any session', bonusXp: 25, check: () => true },
  // --- variety ---
  total('triple_threat', 'Triple Threat', 'Play 3 different games', 50, 3, ' games', playedGames),
  total('sampler', 'Sampler', 'Play 5 different games', 75, 5, ' games', playedGames),
  total('arcade_rat', 'Arcade Rat', 'Play every game in the arcade', 150, ARCADE.length, ' games', playedGames),
  {
    id: 'balanced_week', name: 'Balanced Week', desc: 'Play 3 different games within 7 days', bonusXp: 100,
    check: (p, r) => ARCADE.filter((g) => (p.lastPlayed[g] ?? -Infinity) >= r.startedAt - WEEK_MS).length >= 3,
  },
  {
    id: 'double_feature', name: 'Double Feature', desc: 'Play 2 different games on the same day', bonusXp: 40,
    check: (p, r) => isArcade(r.gameId) && ARCADE.some((g) => g !== r.gameId && p.lastPlayed[g] != null && localDay(p.lastPlayed[g]) === day(r)),
  },
  // --- calendar ---
  {
    id: 'weekend_warrior', name: 'Weekend Warrior', desc: 'Ride on a Saturday and the Sunday after', bonusXp: 40,
    check: (p, r) => weekday(day(r)) === 0 && (p.rideDays ?? []).includes(day(r) - 1),
  },
  {
    id: 'three_day_week', name: 'Three-Day Week', desc: 'Ride on 3 different days in one week (Mon–Sun)', bonusXp: 60,
    check: (p, r) => (p.rideDays ?? []).filter((d) => weekOf(d) === weekOf(day(r))).length >= 3,
  },
  { id: 'week_streak_4', name: 'Regular', desc: 'Ride every week for 4 weeks running', bonusXp: 100, goal: 4, unit: ' weeks', count: { key: 'days.weekStreak', agg: 'max', of: (_r, p) => weekStreak(p.rideDays ?? []) } },
  { id: 'week_streak_12', name: 'Habit Forming', desc: 'Ride every week for 12 weeks running', bonusXp: 250, goal: 12, unit: ' weeks', count: { key: 'days.weekStreak', agg: 'max', of: (_r, p) => weekStreak(p.rideDays ?? []) } },
  {
    id: 'welcome_back', name: 'Welcome Back', desc: 'Ride again after two weeks or more off', bonusXp: 30,
    check: (p, r) => { const e = earlierDays(p, r); return e.length > 0 && day(r) - e[e.length - 1] >= 14; },
  },
  { id: 'night_owl', name: 'Night Owl', desc: 'Start a ride after 9 pm', bonusXp: 30, check: (_p, r) => hour(r) >= 21 },
  { id: 'early_bird', name: 'Early Bird', desc: 'Start a ride before 7 am', bonusXp: 30, check: (_p, r) => hour(r) >= 4 && hour(r) < 7 },
  { id: 'new_year', name: 'New Year, New Watts', desc: 'Ride on New Year’s Day', bonusXp: 50, check: (_p, r) => { const d = new Date(r.startedAt); return d.getMonth() === 0 && d.getDate() === 1; } },
  // --- lifetime ---
  total('kilojoule_1000', 'Kilojoule Club', '2,500 kJ lifetime', 100, 2500, ' kJ', (p) => p.lifetime.kj),
  total('kj_10k', 'Megajoule Maker', '10,000 kJ lifetime', 200, 10000, ' kJ', (p) => p.lifetime.kj),
  total('kj_50k', 'Power Station', '50,000 kJ lifetime', 400, 50000, ' kJ', (p) => p.lifetime.kj),
  total('hours_10', 'Saddle Time', 'Ride for 10 hours (lifetime)', 100, 10, ' h', (p) => p.lifetime.seconds / 3600),
  total('hours_50', 'Iron Bottom', 'Ride for 50 hours (lifetime)', 250, 50, ' h', (p) => p.lifetime.seconds / 3600),
  total('hours_100', 'Hundred-Hour Club', 'Ride for 100 hours (lifetime)', 400, 100, ' h', (p) => p.lifetime.seconds / 3600),
  total('sessions_10', 'Regular Rider', 'Finish 10 rides', 60, 10, ' rides', (p) => p.lifetime.sessions),
  total('sessions_50', 'Devoted', 'Finish 50 rides', 150, 50, ' rides', (p) => p.lifetime.sessions),
  total('sessions_200', 'Lifer', 'Finish 200 rides', 300, 200, ' rides', (p) => p.lifetime.sessions),
  total('sprints_100', 'Sprint Machine', '100 sprints (lifetime)', 80, 100, ' sprints', (p) => p.lifetime.sprints),
  total('sprints_500', 'Kick Merchant', '500 sprints (lifetime)', 200, 500, ' sprints', (p) => p.lifetime.sprints),
  kmTotal('km_100', 'Metric Century', 'Ride 100 km (virtual distance from your power)', 60, 100, ' km'),
  kmTotal('km_1000', 'Thousand-K Club', 'Ride 1,000 km', 150, 1000, ' km'),
  kmTotal('km_3400', 'Tour de France', 'Ride 3,400 km, the length of the Tour', 300, 3400, ' km'),
  climbTotal('climb_1000', 'Hill Climber', 'Climb 1,000 m on sim-mode grades', 60, 1000, ' m'),
  climbTotal('climb_8848', 'Everest', 'Climb 8,848 m, the height of Everest', 250, 8848, ' m'),
  // --- one ride ---
  { id: 'sprinter_10', name: 'Sprinter', desc: '10 sprints in one session', bonusXp: 50, check: (_p, r) => r.stats.sprints >= 10 },
  { id: 'ride_30', name: 'Half Hour Hero', desc: 'Pedal 30+ minutes in 10 different rides', bonusXp: 60, goal: 10, unit: ' rides', count: { key: 'ride.halfHours', agg: 'sum', of: (r) => (activeSeconds(r) >= 30 * 60 ? 1 : 0) } },
  { id: 'ride_60', name: 'The Hour', desc: 'Pedal 60 minutes in one ride', bonusXp: 80, check: (_p, r) => activeSeconds(r) >= 60 * 60 },
  { id: 'ride_90', name: 'Ninety', desc: 'Pedal 90 minutes in one ride', bonusXp: 120, check: (_p, r) => activeSeconds(r) >= 90 * 60 },
  { id: 'diesel', name: 'Diesel Engine', desc: '60 minutes in zone 2 in one ride', bonusXp: 100, check: (_p, r) => (r.stats.zoneSeconds[1] ?? 0) >= 60 * 60 },
  { id: 'big_day', name: 'Big Day', desc: '500 kJ in one ride', bonusXp: 100, check: (_p, r) => r.stats.kj >= 500 },
  { id: 'spin_doctor', name: 'Spin Doctor', desc: '20 minutes at 90+ rpm in one ride', bonusXp: 60, check: (_p, r) => r.samples.filter((s) => s.cadence >= 90).length >= 20 * 60 },
  { id: 'rocket_legs', name: 'Rocket Legs', desc: 'Hold twice your FTP for 5 seconds', bonusXp: 60, check: (p, r) => p.ftp > 0 && peakAvg(r.samples, 5) >= 2 * p.ftp },
  {
    id: 'steady_eddie', name: 'Steady Eddie', desc: 'Ride 45+ minutes with very even power (variability ≤ 1.05), not in ERG mode', bonusXp: 80,
    // ERG holds the power for you, so it doesn't count.
    check: (_p, r) => { if (activeSeconds(r) < 45 * 60 || r.samples.filter((s) => s.mode === 'erg').length > r.samples.length / 4) return false; const vi = variabilityIndex(r.samples); return vi > 0 && vi <= 1.05; },
  },
  // --- secret ---
  { id: 'leg_day', name: 'Leg Day', desc: 'Hit 1,000 W', bonusXp: 50, secret: true, check: (_p, r) => r.stats.maxPower >= 1000 },
  { id: 'hummingbird', name: 'Hummingbird', desc: 'Spin at 130+ rpm for 10 seconds', bonusXp: 40, secret: true, check: (_p, r) => longestRun(r.samples, (s) => s.cadence >= 130) >= 10 },
  { id: 'witching_hour', name: 'Witching Hour', desc: 'Start a ride between midnight and 4 am', bonusXp: 40, secret: true, check: (_p, r) => hour(r) < 4 },
  { id: 'leap_rider', name: 'Leap Rider', desc: 'Ride on February 29th', bonusXp: 60, secret: true, check: (_p, r) => { const d = new Date(r.startedAt); return d.getMonth() === 1 && d.getDate() === 29; } },
];

/** Checked last: sees everything earned earlier in the same ride. */
const FINALE: AchievementDef[] = [
  { id: 'overachiever', name: 'Overachiever', desc: 'Unlock 5 achievements in one ride', bonusXp: 50, secret: true, check: (_p, _r, earned) => earned.length >= 5 },
];

/** Every achievement, in display/check order: core, then each game's (arcade order, warm-up last), then the finale. */
export const ACHIEVEMENTS: AchievementDef[] = [...CORE_ACHIEVEMENTS, ...allGames.flatMap((g) => g.achievements ?? []), ...FINALE];

/** Which game an achievement belongs to (undefined = rides anywhere). */
export const ACHIEVEMENT_GAME: Readonly<Record<string, string>> = Object.fromEntries(
  allGames.flatMap((g) => (g.achievements ?? []).map((a) => [a.id, g.id] as const)),
);

/** Current value of a goal achievement for `p` (0 for feats). */
export function achievementValue(a: AchievementDef, p: Readonly<Profile>): number {
  if (a.value) return a.value(p);
  if (!a.count) return 0;
  const v = p.counters?.[a.count.key] ?? 0;
  return a.count.agg === 'bits' ? popcount(v) : v;
}

/** Progress toward a goal achievement (0..1 plus a label); null for one-ride feats. */
export function achievementProgress(a: AchievementDef, p: Readonly<Profile>): { frac: number; label: string } | null {
  if (a.goal == null) return null;
  const v = achievementValue(a, p), shown = Math.min(a.goal, Math.floor(v));
  const label = `${a.count?.agg === 'max' ? 'Best ' : ''}${shown.toLocaleString('en-US')}/${a.goal.toLocaleString('en-US')}${a.unit ?? ''}`;
  return { frac: Math.max(0, Math.min(1, v / a.goal)), label };
}
