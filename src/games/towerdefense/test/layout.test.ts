import { describe, expect, it } from 'vitest';
import { layout, type Box } from '../render/layout';

const bottom = (b: Box) => b.y + b.h;
const overlaps = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

describe('Dynamo Defense layout vs HUD inset', () => {
  const sizes: Array<[number, number]> = [[1180, 820], [1366, 1024], [1024, 768], [820, 1180], [390, 844], [844, 390], [1920, 1080]];
  for (const [W, H] of sizes) for (const inset of [0, 90, 160]) {
    it(`${W}x${H} inset ${inset}: nothing foreground under the HUD`, () => {
      const L = layout(W, H, inset);
      const limit = Math.max(220, H - inset) + 0.5;
      const field = { x: L.field.x, y: L.field.y, w: L.field.s, h: L.field.s };
      for (const [name, b] of Object.entries({ field, left: L.left, right: L.right, workshop: L.workshop, garage: L.garage })) {
        expect(bottom(b), name).toBeLessThanOrEqual(limit);
        expect(b.y, name).toBeGreaterThanOrEqual(0);
        expect(b.x, name).toBeGreaterThanOrEqual(0);
        expect(b.x + b.w, name).toBeLessThanOrEqual(W + 0.5);
      }
      expect(L.banner.y).toBeLessThan(limit);
      if (L.wide) { expect(overlaps(field, L.left)).toBe(false); expect(overlaps(field, L.right)).toBe(false); }
      else { expect(overlaps(field, L.left)).toBe(false); expect(overlaps(field, L.right)).toBe(false); }
    });
  }
  it('landscape iPad puts panels beside a large field', () => {
    const L = layout(1180, 820, 110);
    expect(L.wide).toBe(true);
    expect(L.field.s).toBeGreaterThan(550);
  });
});
