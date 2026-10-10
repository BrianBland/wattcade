import { describe, expect, it } from 'vitest';
import { layout, viewOffsetY } from '../render/layout';

describe('HUD layout honors insets.bottom', () => {
  for (const [W, H, B] of [[1024, 768, 0], [1024, 768, 140], [768, 1024, 220], [600, 300, 200], [400, 260, 240]]) {
    it(`${W}x${H} inset ${B}`, () => {
      const L = layout(W, H, B);
      const lim = Math.max(120, H - B);
      expect(L.UH).toBe(lim);
      for (const r of [L.status, L.toast]) expect(r.y + r.h).toBeLessThanOrEqual(lim);
      expect(L.focusY).toBeLessThan(lim);
      expect(viewOffsetY(B)).toBeGreaterThanOrEqual(0);
    });
  }
});
