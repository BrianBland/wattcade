import { describe, expect, it } from 'vitest';
import { rowToCameraY, viewLayout } from '../render/viewLayout';

describe('first-person view around the HUD', () => {
  for (const [H, bottom] of [[800, 0], [800, 180], [1366, 260], [600, 420]] as const) {
    it(`keeps the focus and the hands above the HUD (H ${H}, HUD ${bottom})`, () => {
      const L = viewLayout(H, { top: 0, right: 0, bottom, left: 0 });
      expect(L.centreY).toBeLessThan(H - bottom);
      expect(L.centreY).toBeCloseTo((H - bottom) / 2, 6);
      expect(L.handsY).toBeLessThan(H - bottom);
      expect(L.handsY).toBeGreaterThan(L.centreY);
      expect(L.offsetY).toBeCloseTo(bottom / 2, 6); // image shifted up by half the HUD
      // a point at the hands row, projected back through the camera, lands on that row
      const y = rowToCameraY(L.handsY, L, H, 70, 0.46), row = L.centreY - (y / (Math.tan((35 * Math.PI) / 180) * 0.46)) * (H / 2);
      expect(row).toBeCloseTo(L.handsY, 6);
    });
  }
});
