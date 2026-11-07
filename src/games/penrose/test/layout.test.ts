import { describe, expect, it } from 'vitest';
import { layout } from '../render/layout';

describe('penrose layout vs HUD insets', () => {
  const sizes: Array<[number, number, number]> = [[1180, 820, 150], [820, 1180, 150], [1366, 1024, 170], [1920, 1080, 150], [800, 600, 100]];
  for (const [W, H, inset] of sizes) {
    it(`keeps the stage and status line above the HUD at ${W}x${H}`, () => {
      const { stage, status } = layout(W, H, { top: 0, right: 0, bottom: inset, left: 0 });
      for (const b of [stage, status]) expect(b.y + b.h).toBeLessThanOrEqual(H - inset + 1e-6);
      expect(stage.y + stage.h).toBeCloseTo(H - inset);
      expect(stage.y).toBeGreaterThanOrEqual(status.y + status.h);
    });
  }
  it('fills the surface with no insets', () => {
    const { stage, status } = layout(1000, 600, { top: 0, right: 0, bottom: 0, left: 0 });
    expect(status.h + stage.h).toBe(600);
    expect(stage.w).toBe(1000);
  });
});
