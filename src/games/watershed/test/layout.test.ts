import { describe, expect, it } from 'vitest';
import { layout } from '../render/layout';

describe('watershed layout', () => {
  for (const [W, H, b] of [[1180, 820, 160], [820, 1180, 200], [390, 844, 180], [1366, 1024, 0]]) {
    it(`${W}x${H} inset ${b}: everything sits above the shell HUD`, () => {
      const L = layout(W, H, b);
      const limit = H - b;
      for (const box of [L.block, L.stats, L.meter, L.plan]) {
        expect(box.y + box.h).toBeLessThanOrEqual(limit);
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.w).toBeLessThanOrEqual(W);
      }
      expect(L.focusY).toBeLessThan(limit);
      expect(L.viewOffsetY).toBeCloseTo(Math.min(b, H / 2) / 2);
    });
  }
});
