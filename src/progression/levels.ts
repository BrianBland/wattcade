/**
 * Cumulative XP required to reach level L (L>=1): floor(400 * (L-1)^1.5). A 30-minute zone 2 ride earns ~330 XP:
 * level 5 takes ~10 such rides, level 10 ~30, level 50 (the end of the cosmetic track) a year or more of riding.
 */
export function xpForLevel(L: number): number {
  if (L <= 1) return 0;
  return Math.floor(400 * Math.pow(L - 1, 1.5));
}

export function levelForXp(xp: number): number {
  let L = 1;
  while (xpForLevel(L + 1) <= xp) L++;
  return L;
}

/** Progression rules version (`gameData._progression.rules`); bump with a step in rebalance.ts when things get harder. */
export const RULES_VERSION = 2;
