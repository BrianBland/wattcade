import { describe, expect, it } from 'vitest';
import { crossingOf, HOPS, hopAt } from '../render/crossing';

describe('Full Send crossings', () => {
  it('the sea and the Moon are reached the dramatic way; other biomes keep their gateway', () => {
    expect(crossingOf({ from: 'snow', to: 'underwater' })).toBe('dive');
    expect(crossingOf({ from: 'underwater', to: 'jungle' })).toBe('surface');
    expect(crossingOf({ from: 'snow', to: 'moon' })).toBe('launch');
    expect(crossingOf({ from: 'moon', to: 'desert' })).toBe('reentry');
    expect(crossingOf({ from: 'desert', to: 'volcano' })).toBeNull();
  });
  it('each flight takes off and lands on the road, peaks at its height, and is airborne over the seam unless it is a dive', () => {
    for (const k of ['dive', 'surface', 'launch', 'reentry'] as const) {
      const { a, b, h } = HOPS[k];
      expect(hopAt(k, a).h).toBe(0); expect(hopAt(k, b).h).toBe(0);
      expect(hopAt(k, (a + b) / 2).h).toBeCloseTo(h);
      expect(hopAt(k, a + 1).slope).toBeGreaterThan(0); expect(hopAt(k, b - 1).slope).toBeLessThan(0);
      if (k !== 'dive') expect(hopAt(k, 0).h).toBeGreaterThan(h * 0.4);
    }
  });
});
