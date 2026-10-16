import { describe, expect, it } from 'vitest';
import { layout, type Box } from '../render/layout';
import { radialLayout } from '../render/construction';

const bottom = (b: Box) => b.y + b.h;
const overlaps = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

describe('Dynamo Defense layout vs HUD inset', () => {
  const sizes: Array<[number, number]> = [[1180, 820], [1366, 1024], [1024, 768], [820, 1180], [390, 844], [844, 390], [1920, 1080]];
  for (const [W, H] of sizes) for (const inset of [0, 90, 160]) for (const hudControls of [false, true]) {
    it(`${W}x${H} inset ${inset} HUD controls ${hudControls}: nothing foreground under the HUD`, () => {
      const L = layout(W, H, inset, hudControls);
      const limit = H - inset + 0.5;
      const field = { x: L.field.x, y: L.field.y, w: L.field.s, h: L.field.s };
      for (const [name, b] of Object.entries({ field, status: L.status, current: L.current, workshop: L.workshop, garage: L.garage, brood: L.brood, ...(!hudControls ? { construct: L.dock.construct, workshopButton: L.dock.workshop, ...Object.fromEntries(L.dock.actions.map((b, i) => [`action${i}`, b])) } : {}) })) {
        expect(bottom(b), name).toBeLessThanOrEqual(limit);
        expect(b.y, name).toBeGreaterThanOrEqual(0);
        expect(b.x, name).toBeGreaterThanOrEqual(0);
        expect(b.x + b.w, name).toBeLessThanOrEqual(W + 0.5);
      }
      expect(L.field.y + L.field.s * 1.03, 'padded outpost above HUD or fallback dock').toBeLessThanOrEqual(hudControls ? limit : L.dock.construct.y);
      if (hudControls) expect(L.field.s).toBeGreaterThanOrEqual(layout(W, H, inset).field.s);
      expect(L.banner.y).toBeLessThan(limit);
      for (const a of hudControls ? [] : L.dock.actions) { expect(a.h).toBeGreaterThanOrEqual(44); expect(overlaps(field, a)).toBe(false); }
      for (const p of [{ x: 0, y: 0 }, { x: W, y: H }, { x: W / 2, y: H / 2 }]) {
        for (const count of [2, 3, 4]) {
          const r = radialLayout(W, L.UH, p, count);
          for (const b of [r.body, ...r.options, r.close]) {
            expect(b.x).toBeGreaterThanOrEqual(0); expect(b.y).toBeGreaterThanOrEqual(0);
            expect(b.x + b.w).toBeLessThanOrEqual(W); expect(bottom(b)).toBeLessThanOrEqual(H - inset);
          }
          for (const b of [...r.options, r.close]) expect(b.h).toBeGreaterThanOrEqual(44);
        }
      }
      expect(L.brood.y + L.brood.h, 'announcement above HUD or fallback dock').toBeLessThanOrEqual(hudControls ? limit : L.dock.construct.y);
      for (const b of [L.status, L.current, ...(!hudControls ? [L.dock.construct, ...L.dock.actions] : [])]) {
        expect(overlaps(field, b), 'map does not overlap HUD').toBe(false);
        expect(overlaps(L.brood, b), 'announcement does not overlap HUD').toBe(false);
      }
      expect(overlaps(L.status, L.current)).toBe(false);
    });
  }
  it('landscape iPad reclaims dock space when using shared HUD controls', () => {
    const L = layout(1180, 820, 110, true);
    expect(L.wide).toBe(true);
    expect(L.field.s).toBeGreaterThan(500);
    expect(L.brood.h).toBeGreaterThanOrEqual(280);
    expect(L.field.s).toBeGreaterThan(layout(1180, 820, 110, false).field.s);
  });
});
