import { describe, expect, it } from 'vitest';
import { layout } from '../render/layout';

describe('layout keeps foreground above the HUD', () => {
  for (const [W, H, inset] of [[1024, 768, 120], [768, 1024, 160], [1366, 1024, 90], [390, 844, 180], [800, 360, 100]] as const) {
    it(`${W}x${H} inset ${inset}`, () => {
      const L = layout(W, H, inset);
      const limit = H - inset;
      for (const b of [L.banner, L.meter, L.speed, L.status, L.stamp, L.menu, L.tip]) {
        expect(b.y + b.h).toBeLessThanOrEqual(limit);
        expect(b.x).toBeGreaterThanOrEqual(0);
        expect(b.x + b.w).toBeLessThanOrEqual(W);
      }
      // the rider stands on the road with room for the bike above the HUD
      expect(L.roadY).toBeLessThan(limit - 20);
    });
  }
});
