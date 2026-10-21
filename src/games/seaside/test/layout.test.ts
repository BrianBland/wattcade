import { describe, expect, it } from 'vitest';
import { layout } from '../render/layout';

describe('seaside layout vs HUD inset', () => {
  const sizes: Array<[number, number, number]> = [[1180, 820, 150], [820, 1180, 150], [1366, 1024, 170], [1920, 1080, 150], [800, 600, 100], [1024, 600, 220]];
  for (const [W, H, inset] of sizes) {
    it(`keeps foreground above the HUD at ${W}x${H} (inset ${inset})`, () => {
      const L = layout(W, H, { top: 0, right: 0, bottom: inset, left: 0 }, 4);
      expect(L.UH).toBe(H - inset);
      for (const b of [L.bubble, L.plate, L.card, L.stage, ...L.menu]) {
        expect(b.y + b.h).toBeLessThanOrEqual(H - inset + 1e-6);
        expect(b.y).toBeGreaterThanOrEqual(0);
        expect(b.x).toBeGreaterThanOrEqual(0);
        expect(b.x + b.w).toBeLessThanOrEqual(W + 1e-6);
      }
    });
  }
  it('puts the monologue bubble top-left', () => {
    const L = layout(1180, 820, { top: 0, right: 0, bottom: 150, left: 0 });
    expect(L.bubble.x).toBeLessThan(1180 / 4);
    expect(L.bubble.y).toBeLessThan(820 / 8);
  });
});
