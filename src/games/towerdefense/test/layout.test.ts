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
      const field = { x: L.field.x, y: Math.max(0, L.field.y), w: L.field.w, h: Math.min(L.field.s, L.UH - Math.max(0, L.field.y)) };
      for (const [name, b] of Object.entries({ field, status: L.status, current: L.current, workshop: L.workshop, garage: L.garage, brood: L.brood, ...(!hudControls ? { construct: L.dock.construct, workshopButton: L.dock.workshop, ...Object.fromEntries(L.dock.actions.map((b, i) => [`action${i}`, b])) } : {}) })) {
        expect(bottom(b), name).toBeLessThanOrEqual(limit);
        expect(b.y, name).toBeGreaterThanOrEqual(0);
        expect(b.x, name).toBeGreaterThanOrEqual(0);
        // Landscape stretches the field past the right edge so the spawn mouths meet it.
        if (name !== 'field' || !L.wide) expect(b.x + b.w, name).toBeLessThanOrEqual(W + 0.5);
      }
      if (!(L.wide && hudControls)) expect(L.field.y + L.field.s * 1.03, 'padded outpost above HUD or fallback dock').toBeLessThanOrEqual(hudControls ? limit : L.dock.construct.y);
      if (L.wide && hudControls) expect(L.field.s, 'landscape field fits the height').toBeLessThanOrEqual(H - inset);
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
        if (!(L.wide && hudControls) || b === L.dock.construct) expect(overlaps(field, b), 'map does not overlap HUD').toBe(false);
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
  it('landscape shell covers the width instead of leaving empty side bands', () => {
    for (const [W, H, inset] of [[1180, 820, 110], [1366, 1024, 140], [1920, 1080, 120], [844, 390, 90]] as const) {
      const L = layout(W, H, inset, true);
      const pad = Math.min(12, W / 30, (H - inset) / 30);
      expect(L.wide).toBe(true);
      expect(L.field.s).toBeLessThanOrEqual(H - inset); // height is the status-to-HUD gap
      expect(L.field.w).toBeGreaterThan(L.field.s); // stretched so the hive reaches the right edge
      expect(L.field.x + L.field.w * 0.84).toBeGreaterThan(W - 40); // spawn mouths (world y ≈ 16) reach the right edge
      expect(L.field.x).toBeLessThan(30); // the turret side sits at the left edge of the screen
      expect(L.field.y).toBeGreaterThanOrEqual(0);
      expect(L.field.y + L.field.sy * 50 + L.field.drop).toBeCloseTo(H / 2, 0); // the turret is vertically centered
      expect(L.garage.y).toBeGreaterThanOrEqual(L.current.y + L.current.h); // the menu starts under the glass rows
      expect(L.garage.h).toBeLessThanOrEqual(540 * L.u); // short enough that the upgrade rows fit without clipping
      expect(L.garage.y + L.garage.h).toBeLessThanOrEqual(H - inset - 100); // and stops above the ride stats
    }
    const portrait = layout(820, 1180, 140, true);
    expect(portrait.field.y).toBeGreaterThanOrEqual(portrait.current.y + portrait.current.h);
    expect(portrait.field.y + portrait.field.s).toBeLessThanOrEqual(1180 - 140 + 0.5);
  });
});
