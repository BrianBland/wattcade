import type { Profile, SessionRecord } from '../contracts';

export interface Achievement {
  id: string;
  name: string;
  desc: string;
  bonusXp: number;
  /** `profile` is the already-updated profile (lifetime/lastPlayed include this session). */
  check(profile: Readonly<Profile>, record: Readonly<SessionRecord>): boolean;
}

const GAMES = ['dungeon', 'lighthouse', 'towerdefense'];
const WEEK_MS = 7 * 24 * 3600 * 1000;

const hasEvent = (r: SessionRecord, type: string, pred?: (d: Record<string, number | string | boolean>) => boolean) =>
  r.events.some((e) => e.type === type && (!pred || pred(e.data ?? {})));

export const ACHIEVEMENTS: Achievement[] = [
  { id: 'first_ride', name: 'First Ride', desc: 'Finish any session', bonusXp: 25, check: () => true },
  {
    id: 'triple_threat', name: 'Triple Threat', desc: 'Play all three games', bonusXp: 50,
    check: (p) => GAMES.every((g) => p.lastPlayed[g] != null),
  },
  {
    id: 'balanced_week', name: 'Balanced Week', desc: 'Play all three games within 7 days', bonusXp: 100,
    check: (p) => {
      const ts = GAMES.map((g) => p.lastPlayed[g]);
      if (ts.some((t) => t == null)) return false;
      return Math.max(...ts) - Math.min(...ts) <= WEEK_MS;
    },
  },
  {
    id: 'keeper_20', name: 'Keeper', desc: '20 min in zone 2 in one Lighthouse session', bonusXp: 50,
    check: (_p, r) => r.gameId === 'lighthouse' && (r.stats.zoneSeconds[1] ?? 0) >= 20 * 60,
  },
  {
    id: 'storm_chaser', name: 'Storm Chaser', desc: 'Weather 3 storms (lifetime)', bonusXp: 50,
    check: (p) => {
      const d = p.gameData['_progression'] as { stormsWeathered?: number } | undefined;
      return (d?.stormsWeathered ?? 0) >= 3;
    },
  },
  { id: 'sprinter_10', name: 'Sprinter', desc: '10 sprints in one session', bonusXp: 50, check: (_p, r) => r.stats.sprints >= 10 },
  {
    id: 'triple_rail', name: 'Triple Rail', desc: 'Fire the rail with 3 charges', bonusXp: 40,
    check: (_p, r) => hasEvent(r, 'railFired', (d) => Number(d.charges) === 3),
  },
  { id: 'dungeon_clear', name: 'Dungeon Clear', desc: 'Defeat the boss', bonusXp: 75, check: (_p, r) => hasEvent(r, 'bossDefeated') },
  // Watershed
  { id: 'ws_cycle', name: 'The Water Cycle', desc: 'Finish a Watershed ride, sea to sky to sea', bonusXp: 50, check: (_p, r) => r.gameId === 'watershed' && hasEvent(r, 'rideDone') },
  { id: 'ws_cloud', name: 'Head in the Clouds', desc: 'Soak up 20 cloudlets in one Watershed ride', bonusXp: 40, check: (_p, r) => r.gameId === 'watershed' && Number(r.gameSummary.cloudlets ?? 0) >= 20 },
  { id: 'ws_canyon', name: 'Grand Canyon', desc: 'Carve a 40 m gorge', bonusXp: 40, check: (_p, r) => r.gameId === 'watershed' && Number(r.gameSummary.deepestCut ?? 0) >= 10 },
  { id: 'ws_delta', name: 'Delta Builder', desc: 'Build a big delta (800+) in one ride', bonusXp: 40, check: (_p, r) => r.gameId === 'watershed' && Number(r.gameSummary.delta ?? 0) >= 8000 },
  { id: 'ws_salmon', name: 'Salmon Shepherd', desc: 'Bring 50 salmon home in one ride', bonusXp: 60, check: (_p, r) => r.gameId === 'watershed' && Number(r.gameSummary.salmonHome ?? 0) >= 50 },
  { id: 'ws_clean_run', name: 'No Fish Left Behind', desc: 'Finish a salmon run without losing a fish', bonusXp: 40, check: (_p, r) => hasEvent(r, 'salmonHome', (d) => Number(d.lost) === 0 && Number(d.fish) >= 10) },
  { id: 'ws_maestro', name: 'Cadence Maestro', desc: 'Hold the cadence band 90% of a Watershed ride', bonusXp: 50, check: (_p, r) => r.gameId === 'watershed' && Number(r.gameSummary.bandPct ?? 0) >= 90 },
  { id: 'kilojoule_1000', name: 'Kilojoule Club', desc: '1000 kJ lifetime', bonusXp: 100, check: (p) => p.lifetime.kj >= 1000 },
];
