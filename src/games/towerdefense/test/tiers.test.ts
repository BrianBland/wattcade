import { describe, expect, it } from 'vitest';
import { RAIL, GATLING, FIREBALL, TIER_FTP_DEFAULT, beamHits, clampTier, effortFactor, fireballPeriod, riderTier, roman } from '../sim/tiers';

describe('intensity tiers (pure)', () => {
  it('five tiers, rated power climbing; every weapon grows with the tier', () => {
    expect(TIER_FTP_DEFAULT).toHaveLength(5);
    for (const table of [TIER_FTP_DEFAULT, GATLING.dmg, GATLING.pierce, FIREBALL.radius, FIREBALL.burnS, RAIL.dmg, RAIL.pierce, RAIL.width]) {
      for (let i = 1; i < table.length; i++) expect(table[i]).toBeGreaterThanOrEqual(table[i - 1]);
    }
    // output grows faster than effort: the top tier pays more per watt than the bottom one
    expect(GATLING.dmg[4] / GATLING.dmg[0]).toBeGreaterThan(TIER_FTP_DEFAULT[4] / TIER_FTP_DEFAULT[0]);
    expect(RAIL.dmg[4] / RAIL.dmg[0]).toBeGreaterThan(TIER_FTP_DEFAULT[4] / TIER_FTP_DEFAULT[0]);
    expect([clampTier(0), clampTier(7), clampTier(2.6)]).toEqual([1, 5, 3]);
    expect(roman(4)).toBe('IV');
  });
  it('effort is watts over the tier\'s rating, capped; a rider sits in the highest tier they can make', () => {
    expect(effortFactor(0.45, 0.9)).toBeCloseTo(0.5);
    expect(effortFactor(2, 0.9)).toBe(1.2);
    expect(effortFactor(0.5, 0)).toBe(0);
    const rated = (t: number) => TIER_FTP_DEFAULT[t - 1];
    expect(riderTier(0.65, rated)).toBe(2);
    expect(riderTier(0.95, rated)).toBe(4);
    expect(riderTier(0.2, rated)).toBe(1);
    expect(riderTier(1.5, rated)).toBe(5);
  });
  it('the Fireball lobs quicker when spinning faster, within bounds', () => {
    expect(fireballPeriod(0.7, 85, 85)).toBeCloseTo(0.7);
    expect(fireballPeriod(0.7, 110, 85)).toBeLessThan(0.7);
    expect(fireballPeriod(0.7, 10, 85)).toBeCloseTo(0.7 * 1.7);
    expect(fireballPeriod(0.7, 300, 85)).toBeCloseTo(0.7 * 0.65);
  });
  it('a beam hits what overlaps it, nearest first, up to its pierce', () => {
    // straight up the screen (angle 0) from the origin: y decreases
    const ts = [{ x: 0, y: -30, r: 1 }, { x: 0.8, y: -10, r: 1 }, { x: 6, y: -20, r: 1 }, { x: 0, y: 20, r: 1 }, { x: 0, y: -90, r: 1 }];
    expect(beamHits(ts, 0, 0, 0, 1, 75, Infinity)).toEqual([1, 0]); // off to the side, behind, and out of reach are missed
    expect(beamHits(ts, 0, 0, 0, 1, 75, 1)).toEqual([1]);
    expect(beamHits(ts, 0, 0, 0, 12, 75, Infinity)).toEqual([1, 2, 0]); // a wide beam takes the side one too
    expect(beamHits(ts, 0, 0, Math.PI / 2, 1, 75, Infinity)).toEqual([]);
  });
});
