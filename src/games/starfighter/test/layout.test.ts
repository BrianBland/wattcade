import { describe, expect, it } from 'vitest';
import { layout } from '../render/layout';
import { H, SHIP_Y } from '../sim/sim';

describe('starfighter layout vs HUD inset', () => {
  const sizes: Array<[number, number, number]> = [[1180, 820, 150], [820, 1180, 150], [1366, 1024, 170], [1920, 1080, 150], [800, 600, 100], [390, 844, 160]];
  for (const [W, Hc, inset] of sizes) {
    it(`keeps the field, ship and panels above the HUD at ${W}x${Hc}`, () => {
      const L = layout(W, Hc, inset);
      expect(L.UH).toBe(Hc - inset);
      const lim = Hc - inset + 1e-6;
      expect(L.field.y + L.field.h).toBeLessThanOrEqual(lim);
      expect(L.oy + (SHIP_Y + 5) * L.sc).toBeLessThanOrEqual(lim);
      expect(L.oy + H * L.sc).toBeLessThanOrEqual(lim);
      for (const b of [L.left, L.right]) expect(b.y + b.h).toBeLessThanOrEqual(lim);
      expect(L.field.x).toBeGreaterThanOrEqual(-1e-6);
      expect(L.field.x + L.field.w).toBeLessThanOrEqual(W + 1e-6);
      if (L.mode === 'top') expect(L.left.h).toBeLessThanOrEqual(L.field.y + 1e-6); // top strip never overlaps the field
    });
  }
  it('uses side panels in landscape and a top strip in portrait', () => {
    expect(layout(1180, 820, 150).mode).toBe('sides');
    expect(layout(820, 1180, 150).mode).toBe('top');
  });
});
