import { describe, expect, it } from 'vitest';
import { DOTS_H, carouselSizes, slotLeft, slotOf, wrapIndex } from './carousel';

describe('carousel layout', () => {
  it('wraps slots so the focus has neighbours on both sides', () => {
    expect([0, 1, 2, 3, 4, 5, 6].map((i) => slotOf(i, 0, 7))).toEqual([0, 1, 2, 3, -3, -2, -1]);
    expect([0, 1, 2, 3, 4, 5, 6].map((i) => slotOf(i, 6, 7))).toEqual([1, 2, 3, -3, -2, -1, 0]);
    expect([0, 1, 2, 3].map((i) => slotOf(i, 1, 4))).toEqual([-1, 0, 1, -2]);
    expect(slotOf(0, 0, 1)).toBe(0);
    expect(wrapIndex(-1, 7)).toBe(6);
    expect(wrapIndex(7, 7)).toBe(0);
  });

  for (const [w, h] of [[1180, 500], [820, 820], [1366, 640], [700, 330], [1024, 400], [1920, 900]]) {
    it(`fits a ${w}×${h} area`, () => {
      const s = carouselSizes(w, h);
      expect(s.heroW).toBeLessThanOrEqual(w);
      expect(s.sideW).toBeLessThan(s.heroW / 2);
      if (h >= 400) expect(s.heroH + DOTS_H).toBeLessThanOrEqual(h); // hero + dots fit unless at the minimum size
      expect(s.sideH).toBeLessThan(s.heroH);
      // hero is centred; neighbours never overlap it or each other
      expect(slotLeft(0, s) + s.heroW / 2).toBe(0);
      for (let d = 1; d <= 3; d++) {
        expect(slotLeft(d, s)).toBeGreaterThanOrEqual(slotLeft(d - 1, s) + (d === 1 ? s.heroW : s.sideW) + s.gap - 1e-9);
        expect(slotLeft(-d, s) + s.sideW + s.gap).toBeLessThanOrEqual(slotLeft(-d + 1, s) + 1e-9);
      }
    });
  }
});
