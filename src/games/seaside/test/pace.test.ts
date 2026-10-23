import { describe, expect, it } from 'vitest';
import { effortRate, paceNudge, railSpeed } from '../sim/pace';

const T = { exponent: 1 / 3, gain: 0.002, max: 0.2, maxAhead: 0.2, cap: 1.8 };

describe('pace', () => {
  it('rides at the planned speed at the planned power, on time', () => {
    expect(railSpeed(130, 130, 8, 0, T)).toBeCloseTo(8);
  });
  it('is faster with more power, but sub-linearly', () => {
    const v = railSpeed(260, 130, 8, 0, T);
    expect(v).toBeGreaterThan(8);
    expect(v).toBeCloseTo(8 * Math.cbrt(2));
  });
  it('stops with no power', () => { expect(railSpeed(0, 130, 8, 0, T)).toBe(0); });
  it('nudges gently toward the plan, clamped', () => {
    expect(paceNudge(0, 0.002, 0.2)).toBe(1);
    expect(paceNudge(60, 0.002, 0.2)).toBeCloseTo(1.12);
    expect(paceNudge(-60, 0.002, 0.2)).toBeCloseTo(0.88);
    expect(paceNudge(1e4, 0.002, 0.2)).toBeCloseTo(1.2);
    expect(paceNudge(-1e4, 0.002, 0.2)).toBeCloseTo(0.8);
    expect(railSpeed(130, 130, 8, 120, T)).toBeCloseTo(8 * 1.2);
  });
  it('brakes a rider ahead of the plan less than it helps one behind', () => {
    expect(paceNudge(-1e4, 0.002, 0.2, 0.05)).toBeCloseTo(0.95);
    expect(paceNudge(1e4, 0.002, 0.2, 0.05)).toBeCloseTo(1.2);
  });
  it('caps rail speed', () => { expect(railSpeed(1e5, 130, 8, 600, T)).toBeCloseTo(8 * 1.8); });
  it('effort gating: work at plan runs on schedule; floor and cap', () => {
    expect(effortRate(130, 130, 0.1, 2)).toBe(1);
    expect(effortRate(195, 130, 0.1, 2)).toBeCloseTo(1.5);
    expect(effortRate(0, 130, 0.1, 2)).toBe(0.1);
    expect(effortRate(1000, 130, 0.1, 2)).toBe(2);
  });
});
