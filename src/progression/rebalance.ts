import type { AchievementDef, Profile } from '../contracts';
import { ACHIEVEMENTS, achievementValue } from './achievements';
import { RULES_VERSION, levelForXp } from './levels';

/*
 * Saved profiles are re-graded once per RULES_VERSION bump: the level is recomputed from XP, and achievements that
 * changed are revoked unless the profile still meets the new goal. Unlocks are derived, so revoked achievements and
 * levels take their items with them.
 */

/**
 * v2 (Oct 2026): steeper level curve; achievements earned on a first ride became lifetime tallies or got
 * bigger one-ride goals. Ids whose rules changed.
 */
const V2_CHANGED = [
  'ride_30', 'steady_eddie', 'kilojoule_1000',
  'keeper_20', 'storm_chaser', 'lh_storm_season', 'lh_lifeboat', 'lh_clockwork', 'lh_harbour',
  'dungeon_clear', 'dg_floor5', 'dg_floor10', 'dg_unique', 'dg_elites', 'dg_deathless', 'dg_curses', 'dg_kills',
  'td_wave10', 'td_wave25', 'td_wave50', 'td_boss', 'td_spotless', 'td_surges', 'td_kills',
  'sf_boss', 'sf_combo', 'sf_flawless', 'sf_goldens', 'sf_kills',
  'hm_golden', 'hm_strike', 'hm_trial', 'hm_spin',
  'cz_clean', 'cz_chain', 'cz_sharp', 'cz_songs',
  'ws_cloud', 'ws_canyon', 'ws_miller', 'ws_dam_buster', 'ws_breadbasket',
];

type ProgressionData = { rules?: number; stormsWeathered?: number };
const dataOf = (p: Readonly<Profile>): ProgressionData => (p.gameData?.['_progression'] as ProgressionData | undefined) ?? {};

/** Re-grade a profile saved under older rules (no-op, same object, when it's current). */
export function rebalanceProfile(p: Profile, list: readonly AchievementDef[] = ACHIEVEMENTS): Profile {
  const data = dataOf(p);
  if ((data.rules ?? 1) >= RULES_VERSION) return p;
  const byId = new Map(list.map((a) => [a.id, a]));
  const changed = new Set(V2_CHANGED);
  // A changed goal achievement stays if the saved counters/lifetime already meet the new goal; a changed feat is revoked.
  const revoked = (p.achievements ?? []).filter((id) => {
    if (!changed.has(id)) return false;
    const a = byId.get(id);
    return !a || a.goal == null || achievementValue(a, p) < a.goal;
  });
  const bonus = revoked.reduce((s, id) => s + (byId.get(id)?.bonusXp ?? 0), 0);
  const xp = Math.max(0, p.xp - bonus), level = levelForXp(xp);
  // Picks at levels no longer reached are forgotten: the rider picks again on the way back up.
  const picks = Object.fromEntries(Object.entries(p.cosmetics?.picks ?? {}).filter(([l]) => Number(l) <= level));
  return {
    ...p,
    xp, level,
    achievements: p.achievements.filter((id) => !revoked.includes(id)),
    cosmetics: { ...p.cosmetics, picks },
    gameData: { ...p.gameData, _progression: { ...data, rules: RULES_VERSION } },
  };
}
