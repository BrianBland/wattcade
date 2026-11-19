import { describe, expect, it } from 'vitest';
import { laneAt } from '../render/lanes';

describe('shipping lanes', () => {
  it('bend around an island with the hull clear of it all the way past', () => {
    for (const [o0, clear] of [[0, 80], [30, 140], [-50, 60], [139, 140]] as const) {
      const isl = [{ u: 500, o: 0, clear }];
      for (let u = 0; u <= 1000; u += 1) { const { o } = laneAt(u, o0, isl); expect(Math.hypot(u - 500, o)).toBeGreaterThanOrEqual(clear - 1e-6); }
    }
  });
  it('moves smoothly, and the slope matches the path', () => {
    const isl = [{ u: 0, o: 10, clear: 120 }];
    let prev = laneAt(-600, 0, isl).o;
    for (let u = -600; u <= 600; u += 0.5) {
      const { o, slope } = laneAt(u, 0, isl);
      expect(Math.abs(o - prev)).toBeLessThan(1);
      expect(slope).toBeCloseTo((laneAt(u + 0.01, 0, isl).o - laneAt(u - 0.01, 0, isl).o) / 0.02, 3);
      prev = o;
    }
  });
  it('leaves a lane alone far from islands', () => {
    expect(laneAt(0, 200, [{ u: 0, o: 0, clear: 100 }])).toEqual({ o: 200, slope: 0 });
    expect(laneAt(2000, 0, [{ u: 0, o: 0, clear: 100 }]).o).toBe(0);
  });
});
