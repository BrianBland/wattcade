import { describe, expect, it } from 'vitest';
import { cloudAltitude, layout } from '../render/layout';

describe('watershed layout', () => {
  for (const [W, H, b] of [[1180, 820, 160], [820, 1180, 200], [390, 844, 180], [1366, 1024, 0]]) {
    it(`${W}x${H} inset ${b}: everything sits above the shell HUD`, () => {
      const L = layout(W, H, b);
      const limit = H - b;
      for (const box of [L.block, L.stats, L.meter, L.plan, L.popup]) {
        expect(box.y + box.h).toBeLessThanOrEqual(limit);
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.w).toBeLessThanOrEqual(W);
      }
      expect(L.focusY).toBeLessThan(limit);
      expect(L.viewOffsetY).toBeCloseTo(Math.min(b, H / 2) / 2);
    });
  }
});

describe('watershed rain cloud altitude', () => {
  // a valley: ridges at x = 20 / 76 (height 30), floor 10 in between
  const valley = (x: number) => 10 + 20 * Math.max(0, 1 - Math.min(Math.abs(x - 20), Math.abs(x - 76)) / 10);
  for (const radius of [4, 8, 14]) {
    it(`radius ${radius}: carving a gorge under the cloud does not sink it below the ground around it`, () => {
      let depth = 0;
      const ground = (x: number, y: number) => valley(x) - (Math.hypot(x - 48, y - 13) < 3 ? depth : 0);
      const before = cloudAltitude(ground, 48, 13, radius, 0);
      depth = 25;   // the rain cuts a deep hole right under the cloud's centre
      const after = cloudAltitude(ground, 48, 13, radius, 0);
      expect(after).toBeCloseTo(before, 6);
      // the drawn underside (≈ 0.55·radius below centre) stays above every point of the footprint
      for (let a = 0; a < 16; a++) for (const r of [0, radius / 2, radius]) {
        const gx = 48 + Math.cos(a) * r, gy = 13 + Math.sin(a) * r;
        expect(after - 0.55 * radius).toBeGreaterThan(ground(gx, gy) + 2);
      }
    });
  }
  it('clears a ridge at the edge of its footprint', () => {
    const alt = cloudAltitude(valley, 30, 13, 10, 0);
    expect(alt - 0.55 * 10).toBeGreaterThan(30);
  });
});
