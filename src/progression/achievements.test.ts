import { describe, expect, it } from 'vitest';
import type { SessionRecord, SessionSample } from '../contracts';
import { ACHIEVEMENTS, ACHIEVEMENT_GAME, achievementProgress, awardSession, defaultProfile } from './index';
import { addDay, localDay, peakAvg, speedFor, variabilityIndex, virtualRide, weekday, weekOf, weekStreak } from './rideStats';
import { games } from '../games/registry';

const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h).getTime();
const flat = (n: number, power = 150, cadence = 85): SessionSample[] =>
  Array.from({ length: n }, (_, t) => ({ t, power, cadence, hr: null, grade: null, mode: 'erg' as const }));
function rec(over: Partial<SessionRecord> = {}, samples = flat(600)): SessionRecord {
  const kj = samples.reduce((s, x) => s + x.power, 0) / 1000;
  return {
    id: 'r', profileId: 'x', gameId: 'dungeon', startedAt: at(2026, 5, 13), durationS: samples.length, samples, events: [],
    stats: { avgPower: 150, maxPower: Math.max(0, ...samples.map((s) => s.power)), kj, avgHr: null, zoneSeconds: [0, 0, 0, 0, 0], sprints: 0 },
    gameSummary: {}, ...over,
  };
}
const ids = (r: { newAchievements: Array<{ id: string }> }) => r.newAchievements.map((a) => a.id);
const byId = (id: string) => ACHIEVEMENTS.find((a) => a.id === id)!;

describe('rideStats', () => {
  it('speed model is plausible', () => {
    expect(speedFor(200, 0, 75) * 3.6).toBeGreaterThan(30);
    expect(speedFor(200, 0, 75) * 3.6).toBeLessThan(38);
    expect(speedFor(200, 8, 75)).toBeLessThan(speedFor(200, 0, 75) / 2.5);
    expect(speedFor(0, 0, 75)).toBe(0);
  });
  it('virtual distance and climbing', () => {
    const hour = virtualRide(flat(3600, 200), 75);
    expect(hour.km).toBeGreaterThan(30); expect(hour.climbM).toBe(0);
    const hill = virtualRide(flat(600, 250).map((s) => ({ ...s, mode: 'sim' as const, grade: 5 })), 75);
    expect(hill.climbM).toBeGreaterThan(100); expect(hill.climbM).toBeLessThan(250);
    // ERG grade is ignored
    expect(virtualRide(flat(600, 250).map((s) => ({ ...s, grade: 5 })), 75).climbM).toBe(0);
  });
  it('peaks and variability', () => {
    const s = flat(60, 100); s[30].power = 600; s[31].power = 600;
    expect(peakAvg(s, 5)).toBe(100 + 2 * 500 / 5);
    expect(variabilityIndex(flat(600))).toBeCloseTo(1, 5);
    const spiky = flat(600).map((x, i) => ({ ...x, power: Math.floor(i / 60) % 2 ? 300 : 50 }));
    expect(variabilityIndex(spiky)).toBeGreaterThan(1.1);
  });
  it('calendar helpers', () => {
    const wed = localDay(at(2026, 5, 13)), sun = localDay(at(2026, 5, 17)), mon = localDay(at(2026, 5, 18));
    expect(weekday(wed)).toBe(3); expect(weekday(sun)).toBe(0);
    expect(weekOf(sun)).toBe(weekOf(wed)); expect(weekOf(mon)).toBe(weekOf(wed) + 1);
    expect(weekStreak([wed - 14, wed - 7, wed])).toBe(3);
    expect(weekStreak([wed - 21, wed - 7, wed])).toBe(2);
    expect(addDay([3, 1], 2)).toEqual([1, 2, 3]);
    expect(addDay([1, 2], 2)).toEqual([1, 2]);
  });
});

describe('achievement catalogue', () => {
  it('every arcade game (and the warm-up) has achievements', () => {
    // games still in early development may hold their achievements back (keep this list short)
    const PENDING = new Set(['gtpedal']);
    for (const g of games) if (!PENDING.has(g.id)) expect((g.achievements ?? []).length, g.id).toBeGreaterThan(3);
  });
  it('goal achievements are well formed; shared counter keys agree', () => {
    const aggs = new Map<string, string>();
    for (const a of ACHIEVEMENTS) {
      expect(a.goal != null || !!a.check, a.id).toBe(true);
      if (a.goal != null) expect(!!a.value || !!a.count, a.id).toBe(true);
      if (a.count) {
        const prev = aggs.get(a.count.key);
        if (prev) expect(a.count.agg ?? 'sum', a.count.key).toBe(prev);
        aggs.set(a.count.key, a.count.agg ?? 'sum');
      }
    }
  });
  it('game achievements never fire from another game', () => {
    let p = defaultProfile();
    // A ride stuffed with every summary key at a huge value, in the warm-up.
    const summary: Record<string, number> = {};
    for (const k of ['Deepest floor', 'Kills', 'Elites slain', 'Bosses slain', 'wavesSurvived', 'surgesWon', 'spinsWon', 'sector', 'maxCombo', 'goldens',
      'Era reached', 'Peak Kardashev', 'shipsDocked', 'shipsRescued', 'lensTier', 'districtsOpen', 'bloomPct', 'maxChain', 'perfectLaunches', 'songsDone']) summary[k] = 1e6;
    p = awardSession(p, rec({ gameId: 'warmup', gameSummary: summary })).profile;
    const leaked = p.achievements.filter((id) => ACHIEVEMENT_GAME[id] && ACHIEVEMENT_GAME[id] !== 'warmup');
    expect(leaked).toEqual([]);
  });
});

describe('counters and goals', () => {
  it('max keeps the best, with progress', () => {
    let p = defaultProfile();
    p = awardSession(p, rec({ gameId: 'towerdefense', gameSummary: { wavesSurvived: 14 } })).profile;
    p = awardSession(p, rec({ gameId: 'towerdefense', gameSummary: { wavesSurvived: 4 } })).profile;
    expect(p.counters!['towerdefense.bestWave']).toBe(14);
    expect(achievementProgress(byId('td_wave10'), p)).toEqual({ frac: 0.7, label: 'Best 14/20 waves' });
    const r = awardSession(p, rec({ gameId: 'towerdefense', gameSummary: { wavesSurvived: 24 } }));
    expect(ids(r)).toContain('td_wave10');
    expect(ids(r)).not.toContain('td_wave25');
  });
  it('sum accumulates across rides', () => {
    let p = defaultProfile();
    for (let i = 0; i < 4; i++) p = awardSession(p, rec({ gameId: 'starfighter', gameSummary: { kills: 13000 } })).profile;
    expect(p.counters!['starfighter.kills']).toBe(52000);
    expect(p.achievements).toContain('sf_kills');
  });
  it('bits collect warm-up biomes', () => {
    let p = defaultProfile();
    const reach = (...b: string[]) => rec({ gameId: 'warmup', events: b.map((biome, t) => ({ t, type: 'biomeReached', data: { biome } })) });
    p = awardSession(p, reach('seaside', 'underwater')).profile;
    p = awardSession(p, reach('underwater', 'jungle')).profile;
    expect(achievementProgress(byId('wu_globetrotter'), p)!.label).toBe('3/8 biomes');
    const r = awardSession(p, reach('countryside', 'desert', 'volcano', 'snow', 'moon'));
    expect(ids(r)).toEqual(expect.arrayContaining(['wu_globetrotter', 'wu_moon']));
  });
  it('the old storm tally carries over', () => {
    const p = { ...defaultProfile(), gameData: { _progression: { stormsWeathered: 24 } } };
    const r = awardSession(p, rec({ gameId: 'lighthouse', events: [{ t: 1, type: 'stormWeathered' }] }));
    expect(ids(r)).toContain('storm_chaser');
    expect(r.profile.counters!['lighthouse.storms']).toBe(25);
  });
  it('lifetime totals use the updated profile', () => {
    const p = { ...defaultProfile(), lifetime: { kj: 9950, seconds: 0, sessions: 9, sprints: 0 } };
    expect(ids(awardSession(p, rec()))).toEqual(expect.arrayContaining(['kj_10k', 'sessions_10', 'kilojoule_1000']));
  });
});

describe('variety and calendar', () => {
  it('games played', () => {
    let p = defaultProfile();
    const arcade = games.map((g) => g.id);
    for (const g of arcade.slice(0, 4)) p = awardSession(p, rec({ gameId: g })).profile;
    expect(p.achievements).toContain('triple_threat'); expect(p.achievements).not.toContain('sampler');
    expect(p.achievements).toContain('double_feature');
    for (const g of arcade.slice(4)) p = awardSession(p, rec({ gameId: g })).profile;
    expect(p.achievements).toEqual(expect.arrayContaining(['sampler', 'arcade_rat']));
  });
  it('the warm-up alone is not a double feature', () => {
    let p = awardSession(defaultProfile(), rec({ gameId: 'warmup' })).profile;
    p = awardSession(p, rec({ gameId: 'dungeon' })).profile;
    expect(p.achievements).not.toContain('double_feature');
  });
  it('weekends, weeks and streaks', () => {
    let p = awardSession(defaultProfile(), rec({ startedAt: at(2026, 5, 16) })).profile; // Saturday
    expect(ids(awardSession(p, rec({ startedAt: at(2026, 5, 17) })))).toContain('weekend_warrior');
    p = defaultProfile();
    for (const d of [11, 13]) p = awardSession(p, rec({ startedAt: at(2026, 5, d) })).profile;
    expect(ids(awardSession(p, rec({ startedAt: at(2026, 5, 15) })))).toContain('three_day_week');
    p = defaultProfile();
    for (let w = 0; w < 3; w++) p = awardSession(p, rec({ startedAt: at(2026, 5, 4 + 7 * w) })).profile;
    expect(achievementProgress(byId('week_streak_4'), p)!.label).toBe('Best 3/4 weeks');
    expect(ids(awardSession(p, rec({ startedAt: at(2026, 5, 25) })))).toContain('week_streak_4');
  });
  it('welcome back after two weeks off', () => {
    const p = awardSession(defaultProfile(), rec({ startedAt: at(2026, 5, 1) })).profile;
    expect(ids(awardSession(p, rec({ startedAt: at(2026, 5, 10) })))).not.toContain('welcome_back');
    expect(ids(awardSession(p, rec({ startedAt: at(2026, 5, 20) })))).toContain('welcome_back');
  });
  it('time of day and dates', () => {
    const p = defaultProfile();
    expect(ids(awardSession(p, rec({ startedAt: at(2026, 5, 13, 22) })))).toContain('night_owl');
    expect(ids(awardSession(p, rec({ startedAt: at(2026, 5, 13, 5) })))).toContain('early_bird');
    expect(ids(awardSession(p, rec({ startedAt: at(2026, 5, 13, 2) })))).toContain('witching_hour');
    expect(ids(awardSession(p, rec({ startedAt: at(2027, 1, 1) })))).toContain('new_year');
    expect(ids(awardSession(p, rec({ startedAt: at(2028, 2, 29) })))).toContain('leap_rider');
  });
});

describe('one-ride feats', () => {
  it('long rides, zone 2 and spin', () => {
    const hour = flat(3700, 150, 92).map((s) => ({ ...s, mode: 'resistance' as const }));
    const r = awardSession(defaultProfile(), { ...rec({}, hour), stats: { ...rec({}, hour).stats, zoneSeconds: [0, 3650, 0, 0, 0] } });
    expect(ids(r)).toEqual(expect.arrayContaining(['ride_60', 'diesel', 'spin_doctor', 'steady_eddie']));
    expect(ids(r)).not.toContain('ride_90');
    expect(ids(r)).not.toContain('ride_30'); // 10 half-hour rides
    expect(achievementProgress(byId('ride_30'), r.profile)!.label).toBe('1/10 rides');
  });
  it('steady power in ERG mode is not Steady Eddie', () => {
    expect(ids(awardSession(defaultProfile(), rec({}, flat(3700, 150, 92))))).not.toContain('steady_eddie');
  });
  it('rocket legs, leg day and hummingbird', () => {
    const s = flat(600); for (let i = 100; i < 106; i++) s[i] = { ...s[i], power: 1050, cadence: 135 };
    for (let i = 200; i < 212; i++) s[i] = { ...s[i], cadence: 132 };
    expect(ids(awardSession(defaultProfile(), rec({}, s)))).toEqual(expect.arrayContaining(['rocket_legs', 'leg_day', 'hummingbird']));
  });
  it('overachiever needs 5 in one ride', () => {
    const s = flat(600); for (let i = 100; i < 106; i++) s[i] = { ...s[i], power: 1050, cadence: 135 };
    for (let i = 200; i < 212; i++) s[i] = { ...s[i], cadence: 132 };
    // first_ride, rocket_legs, leg_day, hummingbird, night_owl = 5
    expect(ids(awardSession(defaultProfile(), rec({ startedAt: at(2026, 5, 13, 22) }, s)))).toContain('overachiever');
    expect(ids(awardSession(defaultProfile(), rec({}, s)))).not.toContain('overachiever');
  });
});
