import { describe, expect, it } from 'vitest';
import { profileSprintScale } from '../sim/personal';

const effort = (w: number) => ({ allTime: { w, at: 1, gameId: 'x' }, recent: [{ w, at: 1, gameId: 'x' }] });
const rider = (b15: number, b30 = Math.round(b15 * 0.84)) =>
  ({ ftp: 200, power: { v: 1 as const, rides: 1, lastRideAt: 1, bests: { '15': effort(b15), '30': effort(b30) } } });

describe('personal sprint floors (shared power profile)', () => {
  it('keeps the zone floor with no profile, an easy profile, or a typical sprinter', () => {
    expect(profileSprintScale({ ftp: 200 }, 15, 1.5)).toBe(1);
    expect(profileSprintScale(rider(230), 15, 1.5)).toBe(1); // 1.15 FTP: not a hard 15 s
    expect(profileSprintScale(rider(380), 15, 1.5)).toBeCloseTo(1, 2); // 1.9 FTP = the typical curve
    expect(profileSprintScale(rider(300), 15, 1.5)).toBe(1); // weaker than typical: never easier than the zone
  });
  it('raises it for a strong sprinter, capped', () => {
    expect(profileSprintScale(rider(475), 15, 1.5)).toBeCloseTo(1.25, 2);
    expect(profileSprintScale(rider(900), 15, 1.5)).toBe(1.5);
  });
});
