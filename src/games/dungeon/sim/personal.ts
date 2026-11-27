// Evening out sprint damage between riders, from the shared power profile. Pure.
import { powerCurve, shapeRatio, typicalShape } from '../../../progression/powerProfile';
import type { Profile } from '../../../contracts';

/**
 * The scale for the part of your power above FTP, so that your own best short effort hits as hard as a typical
 * rider's: (typical − 1) / (yours − 1) in FTP multiples at `durS`, clamped to [minK, maxK]. 1 without a hard effort
 * near `durS`. Riding at or under FTP is never affected.
 */
export function sprintDamageScale(profile: Pick<Profile, 'ftp' | 'power'>, durS: number, minK: number, maxK: number): number {
  const ratio = shapeRatio(powerCurve(profile), profile.ftp, durS);
  if (ratio === null) return 1;
  const typical = typicalShape(durS), yours = Math.max(1.05, ratio * typical);
  return Math.max(minK, Math.min(maxK, (typical - 1) / (yours - 1)));
}

/** Power (FTP fraction) as it counts for damage: unchanged up to FTP, the part above it × `k`. */
export const dmgPower = (ftpFraction: number, k: number) => (ftpFraction <= 1 ? ftpFraction : 1 + (ftpFraction - 1) * k);
