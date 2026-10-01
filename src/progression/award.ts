import type { Profile, SessionRecord } from '../contracts';
import { ACHIEVEMENTS } from './achievements';
import { levelForXp } from './levels';

export interface AwardResult {
  profile: Profile;
  xpGained: number;
  baseXp: number;
  levelUps: number[];          // each new level reached
  newAchievements: Array<{ id: string; name: string; bonusXp: number }>;
}

/**
 * storm_chaser needs a lifetime storm count. Lighthouse should emit `stormWeathered`
 * events (or gameSummary.stormsWeathered); we accumulate into profile.gameData._progression.stormsWeathered.
 */
function stormsIn(record: SessionRecord): number {
  const ev = record.events.filter((e) => e.type === 'stormWeathered').length;
  if (ev > 0) return ev;
  const s = Number(record.gameSummary?.stormsWeathered ?? 0);
  return Number.isFinite(s) ? s : 0;
}

export function awardSession(profile: Profile, record: SessionRecord): AwardResult {
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
  };
  const storms = stormsIn(record);
  if (storms > 0) {
    const prev = (p.gameData['_progression'] as Record<string, unknown> | undefined) ?? {};
    p.gameData['_progression'] = { ...prev, stormsWeathered: Number(prev.stormsWeathered ?? 0) + storms };
  }

  const newAchievements: AwardResult['newAchievements'] = [];
  for (const a of ACHIEVEMENTS) {
    if (p.achievements.includes(a.id)) continue;
    if (a.check(p, record)) {
      p.achievements.push(a.id);
      newAchievements.push({ id: a.id, name: a.name, bonusXp: a.bonusXp });
    }
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
