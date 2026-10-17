import { describe, expect, it } from 'vitest';
import { fieldClearsHud, layout, type Box } from '../render/layout';
import { radialLayout } from '../render/construction';
import { fieldRect } from '../render/fieldView';
import { BASE_X, BASE_Y } from '../sim/defs';
import { TURRET_R } from '../sim/road';
import type { Insets } from '../../../contracts';

const bottom = (b: Box) => b.y + b.h;
const overlaps = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

describe('Dynamo Defense layout vs HUD inset', () => {
  const sizes: Array<[number, number]> = [[1180, 820], [1366, 1024], [1024, 768], [820, 1180], [390, 844], [844, 390], [1920, 1080]];
  for (const [W, H] of sizes) for (const inset of [0, 90, 160]) for (const hudControls of [false, true]) {
    it(`${W}x${H} inset ${inset} HUD controls ${hudControls}: nothing foreground under the HUD`, () => {
      const L = layout(W, H, inset, hudControls);
      const limit = H - inset + 0.5;
      const field = fieldRect(L.field);
      for (const [name, b] of Object.entries({ field, status: L.status, current: L.current, workshop: L.workshop, garage: L.garage, brood: L.brood, ...(L.objective ? { objective: L.objective } : {}), ...(!hudControls ? { construct: L.dock.construct, workshopButton: L.dock.workshop, ...Object.fromEntries(L.dock.actions.map((b, i) => [`action${i}`, b])) } : {}) })) {
        expect(bottom(b), name).toBeLessThanOrEqual(limit);
        expect(b.y, name).toBeGreaterThanOrEqual(0);
        expect(b.x, name).toBeGreaterThanOrEqual(0);
        expect(b.x + b.w, name).toBeLessThanOrEqual(W + 0.5);
      }
      expect(bottom(field), 'field, turret apron included, above HUD or fallback dock').toBeLessThanOrEqual(hudControls ? limit : L.dock.construct.y + 0.5);
      if (hudControls) expect(L.field.k).toBeGreaterThanOrEqual(layout(W, H, inset).field.k);
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
      for (const b of [L.status, L.current, ...(L.objective ? [L.objective] : []), ...(!hudControls ? [L.dock.construct, ...L.dock.actions] : [])]) {
        expect(overlaps(field, b), 'map does not overlap HUD').toBe(false);
        expect(overlaps(L.brood, b), 'announcement does not overlap HUD').toBe(false);
      }
      expect(overlaps(L.status, L.current)).toBe(false);
    });
  }
  it('landscape iPad keeps status in a left column and turns the field, turret left', () => {
    const L = layout(1180, 820, 168, true);
    expect(L.wide && L.column && L.field.turned).toBe(true);
    expect(L.status.x + L.status.w).toBeLessThanOrEqual(fieldRect(L.field).x);
    expect(L.field.k).toBeGreaterThan(6.4); // vs ~6.0 with status rows on top
    expect(L.brood.h).toBeGreaterThanOrEqual(280);
    expect(L.field.k).toBeGreaterThan(layout(1180, 820, 168, false).field.k);
    const P = layout(820, 1180, 188, true);
    expect(P.field.turned).toBe(false); expect(P.column).toBe(false);
    expect(P.field.y + (BASE_Y + TURRET_R) * P.field.k).toBeCloseTo(fieldRect(P.field).y + fieldRect(P.field).h); // turret just above the HUD
    expect(BASE_X).toBe(40);
  });
  it('balances tablet landscape with brood/forecast at lower left above either control layout', () => {
    for (const [W, H] of [[1180, 820], [1366, 1024], [1024, 768]]) for (const inset of [90, 160]) for (const controls of [false, true]) {
      const L = layout(W, H, inset, controls);
      const controlTop = controls ? L.UH : L.dock.construct.y;
      expect(L.status.y).toBe(12);
      expect(L.current.y).toBeGreaterThan(L.UH / 2);
      expect(bottom(L.current)).toBe(controlTop - 12);
      expect(L.current.x + L.current.w).toBeLessThan(fieldRect(L.field).x);
      expect(overlaps(L.status, L.current)).toBe(false);
    }
  });
  it('uses the empty strip above a compact HUD without changing legacy inset layout', () => {
    const legacy = layout(820, 1180, 188, true);
    const inset: Insets = { top: 0, right: 0, left: 0, bottom: 188, occlusions: [{ x: 8, y: 1075, w: 804, h: 101 }] };
    const shaped = layout(820, 1180, inset, true);
    expect(shaped.UH - legacy.UH).toBe(83);
    expect(shaped.field.k).toBeGreaterThan(legacy.field.k);
    expect(fieldClearsHud(shaped.field, inset.occlusions!)).toBe(true);
    expect(layout(820, 1180, { ...inset, occlusions: undefined }, true)).toEqual(legacy);
  });
  it('fits the objective card between the landscape panels and uses field announcements on compact screens', () => {
    for (const [W, H] of [[1180, 820], [1366, 1024], [1024, 768]]) {
      const L = layout(W, H, 160, true), card = L.objective!;
      expect(card).not.toBeNull();
      expect(card.y).toBeGreaterThan(bottom(L.status));
      expect(bottom(card)).toBeLessThan(L.current.y);
      expect(overlaps(card, fieldRect(L.field))).toBe(false);
      expect(card.h).toBeGreaterThanOrEqual(240);
    }
    expect(layout(844, 390, 158, true).objective).toBeNull();
    expect(layout(820, 1180, 188, true).objective).toBeNull();
  });
  it('keeps short landscape status in a column so it leaves room for the turned road', () => {
    const L = layout(844, 390, 158, true);
    expect(L.column).toBe(true);
    expect(L.field.k).toBeGreaterThan(2.7);
    const minimum = layout(844, 390, 190, true);
    expect(minimum.column).toBe(true);
    expect(bottom(minimum.current)).toBeLessThan(minimum.UH);
  });
  for (const [W, H] of sizes) it(`${W}x${H}: protects combat sprites and menus around tall hoods`, () => {
    const h = Math.min(188, H * .3), side = Math.min(160, W * .2);
    const inset: Insets = { top: 0, right: 0, left: 0, bottom: h, occlusions: [
      { x: 4, y: H - h, w: side, h }, { x: side + 10, y: H - h + 75, w: W - 2 * side - 20, h: h - 79 },
      { x: W - side - 4, y: H - h, w: side, h },
    ] };
    const L = layout(W, H, inset, true);
    expect(L.field.k).toBeGreaterThanOrEqual(layout(W, H, h, true).field.k);
    expect(fieldClearsHud(L.field, inset.occlusions!)).toBe(true);
    for (const b of [L.status, L.current, L.garage, L.workshop, L.brood, ...(L.objective ? [L.objective] : [])]) {
      expect(inset.occlusions!.some(hood => overlaps(b, hood))).toBe(false);
    }
  });
});
