import { describe, expect, it } from 'vitest';
import { dmgPower, sprintDamageScale } from '../sim/personal';
import { powerCurve, typicalShape } from '../../../progression/powerProfile';

const effort = (w: number) => ({ allTime: { w, at: 1, gameId: 'x' }, recent: [{ w, at: 1, gameId: 'x' }] });
const rider = (b5: number, b15: number) => ({ ftp: 200, power: { v: 1 as const, rides: 1, lastRideAt: 1, bests: { '5': effort(b5), '15': effort(b15) } } });

describe('Purgatour sprint damage from the power profile', () => {
  it('leaves riders with no hard short effort, and riding at or under FTP, alone', () => {
    expect(sprintDamageScale({ ftp: 200 }, 10, 0.5, 1.8)).toBe(1);
    expect(sprintDamageScale(rider(260, 220), 10, 0.5, 1.8)).toBe(1);
    expect(dmgPower(0.7, 0.5)).toBe(0.7); expect(dmgPower(1, 1.8)).toBe(1);
  });
  it('makes every rider\'s own best 10 s hit about as hard as a typical rider\'s', () => {
    const typical = typicalShape(10);
    const at = (b5: number, b15: number) => {
      const r = rider(b5, b15), k = sprintDamageScale(r, 10, 0.2, 3);
      const best10 = powerCurve(r).at(10).w / 200;
      return dmgPower(best10, k);
    };
    expect(at(460, 380)).toBeCloseTo(typical, 1); // typical curve: unchanged
    expect(at(800, 620)).toBeCloseTo(typical, 1); // big sprinter: evened down
    expect(at(330, 280)).toBeCloseTo(typical, 1); // modest sprinter: evened up
  });
  it('clamps the scale', () => {
    expect(sprintDamageScale(rider(1000, 800), 10, 0.5, 1.8)).toBe(0.5);
    expect(sprintDamageScale(rider(310, 265), 10, 0.5, 1.8)).toBe(1.8);
  });
});
