// Personal sprint floors from the shared power profile. Pure.
import { powerCurve, shapeRatio } from '../../../progression/powerProfile';
import type { Profile } from '../../../contracts';

/**
 * How much to raise a sprint's zone floor for this rider: your best mean power for the sprint's length over what a
 * typical curve makes of your FTP, between 1 and `maxK`. A typical or weaker sprinter keeps the zone floor (1); a
 * stronger one is asked for proportionally more. 1 without a hard effort near the length.
 */
export const profileSprintScale = (profile: Pick<Profile, 'ftp' | 'power'>, sprintS: number, maxK: number, reach?: number) =>
  Math.min(Math.max(1, maxK), Math.max(1, shapeRatio(powerCurve(profile), profile.ftp, sprintS, reach) ?? 1));
