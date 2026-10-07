import type { AchievementDef, Profile, SessionRecord } from '../contracts';
import { ACHIEVEMENTS, achievementValue } from './achievements';
import { levelForXp } from './levels';
import { addDay, localDay } from './rideStats';

export interface AwardResult {
  profile: Profile;
  xpGained: number;
  baseXp: number;
  levelUps: number[];          // each new level reached
  newAchievements: Array<{ id: string; name: string; bonusXp: number }>;
}

/** Fold this ride into the counters every `count` achievement reads (once per key). */
export function updateCounters(p: Readonly<Profile>, record: Readonly<SessionRecord>, list: readonly AchievementDef[] = ACHIEVEMENTS): Record<string, number> {
  const out = { ...migratedCounters(p) };
  const seen = new Set<string>();
  for (const a of list) {
    const c = a.count;
    if (!c || seen.has(c.key)) continue;
    seen.add(c.key);
    const v = c.of(record, p), prev = out[c.key] ?? 0;
    if (!Number.isFinite(v)) continue;
    out[c.key] = c.agg === 'max' ? Math.max(prev, v) : c.agg === 'bits' ? (prev | v) >>> 0 : prev + v;
  }
  return out;
}

/** Counters, seeded from the pre-counter storm tally (`gameData._progression.stormsWeathered`). */
function migratedCounters(p: Readonly<Profile>): Record<string, number> {
  const c = { ...(p.counters ?? {}) };
  const old = Number((p.gameData?.['_progression'] as { stormsWeathered?: number } | undefined)?.stormsWeathered ?? 0);
  if (c['lighthouse.storms'] == null && old > 0) c['lighthouse.storms'] = old;
  return c;
}

export function awardSession(profile: Profile, record: SessionRecord, list: readonly AchievementDef[] = ACHIEVEMENTS): AwardResult {
  const activeMin = record.samples.filter((s) => s.cadence > 20).length / 60;
  const z2Min = (record.stats.zoneSeconds[1] ?? 0) / 60;
  const baseXp = Math.round(record.stats.kj) + Math.round(2 * activeMin) + Math.round(z2Min) + 5 * record.stats.sprints;

  const p: Profile = {
    ...profile,
    lifetime: {
      kj: profile.lifetime.kj + record.stats.kj,
      seconds: profile.lifetime.seconds + record.durationS,
      sessions: profile.lifetime.sessions + 1,
      sprints: profile.lifetime.sprints + record.stats.sprints,
    },
    lastPlayed: { ...profile.lastPlayed, [record.gameId]: record.startedAt },
    gameData: { ...profile.gameData },
    achievements: [...profile.achievements],
    rideDays: addDay(profile.rideDays, localDay(record.startedAt)),
  };
  // Counters see the updated profile (e.g. the week streak includes today).
  p.counters = updateCounters(p, record, list);

  const newAchievements: AwardResult['newAchievements'] = [];
  const earned: string[] = [];
  for (const a of list) {
    if (p.achievements.includes(a.id)) continue;
    const ok = a.goal != null ? achievementValue(a, p) >= a.goal : !!a.check?.(p, record, earned);
    if (!ok) continue;
    p.achievements.push(a.id);
    earned.push(a.id);
    newAchievements.push({ id: a.id, name: a.name, bonusXp: a.bonusXp });
  }
  const bonus = newAchievements.reduce((s, a) => s + a.bonusXp, 0);
  const xpGained = baseXp + bonus;
  p.xp = profile.xp + xpGained;
  const oldLevel = levelForXp(profile.xp);
  p.level = levelForXp(p.xp);
  const levelUps: number[] = [];
  for (let l = oldLevel + 1; l <= p.level; l++) levelUps.push(l);
  return { profile: p, xpGained, baseXp, levelUps, newAchievements };
}
