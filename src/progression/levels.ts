/** Cumulative XP required to reach level L (L>=1): floor(100 * (L-1)^1.6). */
export function xpForLevel(L: number): number {
  if (L <= 1) return 0;
  return Math.floor(100 * Math.pow(L - 1, 1.6));
}

export function levelForXp(xp: number): number {
  let L = 1;
  while (xpForLevel(L + 1) <= xp) L++;
  return L;
}
