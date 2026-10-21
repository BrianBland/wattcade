import { describe, expect, it } from 'vitest';
import { runLayout } from '../render/layout';

describe('run layout', () => {
  for (const [W, H, inset, u] of [[1180, 820, 90, 1.2], [820, 1180, 120, 1.2], [2360, 1640, 180, 2.4], [640, 480, 60, 1]]) {
    it(`${W}x${H} inset ${inset}: one slim stance row above the HUD inset, chips right of the card`, () => {
      const L = runLayout(W, H, inset, u);
      for (const r of [L.card, L.stance]) {
        expect(r.y + r.h).toBeLessThanOrEqual(H - inset + 1e-6);
        expect(r.x).toBeGreaterThanOrEqual(0); expect(r.x + r.w).toBeLessThanOrEqual(W + 1e-6);
        expect(r.h).toBeLessThanOrEqual(30 * u); // slim
      }
      expect(L.stance.x).toBeGreaterThanOrEqual(L.card.x + L.card.w);
      expect(L.playH).toBeLessThanOrEqual(L.card.y);
      expect((L.card.w + L.stance.w) * L.card.h / (W * H)).toBeLessThan(0.03); // under 3% of the screen
    });
  }
});
