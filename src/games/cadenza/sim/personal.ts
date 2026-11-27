// Personal sprint floors from the shared power profile. Pure.
import { powerCurve, typicalShape, type PowerCurve } from '../../../progression/powerProfile';
import type { Profile } from '../../../contracts';

/**
 * How much to raise a sprint's zone floor for this rider: your best mean power for the sprint's length over what a
 * typical curve makes of your FTP, between 1 and `maxK`. A typical or weaker sprinter keeps the zone floor (1); a
 * stronger one is asked for proportionally more. 1 without a hard effort within `reach`× of the length.
 */
export function sprintFloorScale(curve: PowerCurve, ftpW: number, sprintS: number, maxK: number, reach = 3): number {
  if (!(ftpW > 0) || !curve.hasHard(sprintS / reach, sprintS * reach)) return 1;
  const e = curve.at(sprintS);
  if (!e.hard) return 1;
  const k = e.w / (ftpW * typicalShape(sprintS));
  return Math.min(Math.max(1, maxK), Math.max(1, k));
}

export const profileSprintScale = (profile: Pick<Profile, 'ftp' | 'power'>, sprintS: number, maxK: number, reach?: number) =>
  sprintFloorScale(powerCurve(profile), profile.ftp, sprintS, maxK, reach);
