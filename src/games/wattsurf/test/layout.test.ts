import { describe, expect, it } from 'vitest';
import { layout } from '../render/layout';

describe('Wattsurf layout keeps the HUD above the shell HUD', () => {
  for (const [W, H, inset] of [[1180, 820, 150], [820, 1180, 170], [1366, 1024, 120], [600, 500, 140], [1920, 1080, 0]] as const) {
    it(`${W}×${H}, inset ${inset}`, () => {
      const L = layout(W, H, inset);
      for (const [name, b] of Object.entries(L)) {
        if (typeof b !== 'object') continue;
        expect(b.y + b.h, name).toBeLessThanOrEqual(H - inset + 1e-6);
        expect(b.x, name).toBeGreaterThanOrEqual(0);
        expect(b.x + b.w, name).toBeLessThanOrEqual(W + 1e-6);
      }
      expect(L.UH).toBe(H - inset);
    });
  }
});
