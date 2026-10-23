import { describe, expect, it } from 'vitest';
import { shopLayout } from '../render/shopLayout';
import { overlaps } from '../render/layout';

describe('shop paper above the shell HUD', () => {
  it.each([[1180, 820, 140], [1024, 768, 120], [390, 844, 120], [320, 568, 100], [844, 390, 76]])('%s × %s (HUD %s)', (W, H, bottom) => {
    const insets = { top: 0, left: 0, right: 0, bottom }, L = shopLayout(W, H, insets);
    for (const [name, b] of Object.entries(L)) {
      expect(b.x, name).toBeGreaterThanOrEqual(0); expect(b.y, name).toBeGreaterThanOrEqual(0);
      expect(b.x + b.w, name).toBeLessThanOrEqual(W); expect(b.y + b.h, name).toBeLessThanOrEqual(H - bottom);
      expect(b.w, name).toBeGreaterThan(0); expect(b.h, name).toBeGreaterThan(0);
    }
    for (const name of ['bonus', 'prev', 'next', 'buy', 'leave'] as const) { expect(L[name].h).toBeGreaterThanOrEqual(44); expect(L[name].w).toBeGreaterThanOrEqual(44); }
    expect(overlaps(L.tag, L.receipt)).toBe(false);
    expect(overlaps(L.receipt, L.message)).toBe(false);
    expect(overlaps(L.bonus, L.buy)).toBe(false);
  });
});
