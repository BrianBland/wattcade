import { describe, expect, it } from 'vitest';
import { runLayout } from '../render/layout';

describe('run layout', () => {
  for (const [W, H, inset, u] of [[1180, 820, 90, 1.2], [820, 1180, 120, 1.2], [2360, 1640, 180, 2.4], [640, 480, 60, 1]]) {
    it(`${W}x${H} inset ${inset}: dock sits above the HUD inset and the play view ends at the dock`, () => {
      const L = runLayout(W, H, inset, u);
      expect(L.dock.y + L.dock.h).toBeCloseTo(H - inset, 6);
      expect(L.playH).toBe(L.dock.y);
      for (const r of [L.card, ...L.buttons]) {
        expect(r.y).toBeGreaterThanOrEqual(L.dock.y - 1e-6);
        expect(r.y + r.h).toBeLessThanOrEqual(H - inset + 1e-6);
        expect(r.x).toBeGreaterThanOrEqual(0); expect(r.x + r.w).toBeLessThanOrEqual(W + 1e-6);
      }
      const bs = L.buttons; for (let i = 1; i < bs.length; i++) expect(bs[i].x).toBeGreaterThanOrEqual(bs[i - 1].x + bs[i - 1].w);
      expect(bs[0].x).toBeGreaterThan(L.card.x + L.card.w);
      expect(L.stance.x).toBeGreaterThanOrEqual(L.card.x + L.card.w);
      expect(L.stance.x + L.stance.w).toBeLessThanOrEqual(bs[0].x);
      expect(L.stance.y + L.stance.h).toBeLessThanOrEqual(H - inset + 1e-6);
    });
  }
});
