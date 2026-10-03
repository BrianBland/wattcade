import { describe, expect, it } from 'vitest';
import { layout } from '../render/layout';

describe('hamster layout vs HUD inset', () => {
  const sizes: Array<[number, number, number]> = [[1180, 820, 150], [820, 1180, 150], [1366, 1024, 170], [1920, 1080, 150], [800, 600, 100]];
  for (const [W, H, inset] of sizes) {
    it(`keeps scene and panel above the HUD at ${W}x${H}`, () => {
      const { scene, panel, UH } = layout(W, H, inset);
      expect(UH).toBe(H - inset);
      for (const b of [scene, panel]) expect(b.y + b.h).toBeLessThanOrEqual(H - inset + 1e-6);
      expect(Math.max(scene.y + scene.h, panel.y + panel.h)).toBeCloseTo(UH);
    });
  }
  it('is unchanged with no inset', () => {
    const { scene } = layout(1000, 600, 0);
    expect(scene.h).toBe(600);
  });
});
