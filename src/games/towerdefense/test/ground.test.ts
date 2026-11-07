import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { LEVEL_0, levelGeometry, narrowed } from '../sim/level';
import { GROUND_STYLES, generateLevel } from '../sim/generator';
import { composeGround, scatterPlan, screenBox, type Img, type KitPixels } from '../render/ground/compose';
import { decks, onDeck, underDeck } from '../render/ground/deck';
import { KIT_STYLES, kitStyle } from '../render/ground/bake';
import type { KitManifest } from '../render/ground/kit';

/** A flat-colour image (opaque, or a centred opaque disc on transparent). */
const flat = (rgb: [number, number, number], w = 48, h = 48, ppu = 12, disc = false): Img => {
  const d = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const o = (y * w + x) * 4, inside = !disc || Math.hypot(x + 0.5 - w / 2, y + 0.5 - h / 2) < Math.min(w, h) / 2;
    d[o] = rgb[0]; d[o + 1] = rgb[1]; d[o + 2] = rgb[2]; d[o + 3] = inside ? 255 : 0;
  }
  return { d, w, h, ppu };
};
const GROUND: [number, number, number] = [60, 90, 40], ROAD: [number, number, number] = [220, 210, 190], CLEAR: [number, number, number] = [200, 40, 40], APRON: [number, number, number] = [30, 30, 200];
const MANIFEST: KitManifest = {
  style: 'test', source: 'test', ppu: 12, roadHalf: 4, roadRim: 1, roadBand: 9,
  files: { groundA: 'a', groundB: 'b', gravel: 'g', road: 'r', hive: 'h' },
  apron: { file: 'ap', w: 26, h: 26 }, clearing: { file: 'cl', w: 10, h: 10 },
  decals: [{ file: 'd0', w: 4, h: 4 }], props: [{ file: 'p0', w: 3, h: 3 }, { file: 'p1', w: 5, h: 4 }], deck: { file: 'dk', w: 30, h: 10 },
  hiveMouth: { file: 'm', w: 12, h: 12 },
};
const PIXELS: KitPixels = {
  groundA: flat(GROUND), groundB: flat(GROUND), gravel: flat([120, 120, 120]), road: flat(ROAD, 120, 216), hive: flat([0, 0, 0], 48, 48, 12, true),
  apron: flat(APRON, 312, 312, 12, true), clearing: flat(CLEAR, 120, 120, 12, true),
};
function bake(level = narrowed(LEVEL_0), K = 2) {
  const box = { x0: 0, y0: 30, w: 80, h: 82 }, out = new Uint8ClampedArray(box.w * K * box.h * K * 4);
  let slices = 0; for (const _ of composeGround(level, MANIFEST, PIXELS, box, K, out, 8)) slices++;
  const at = (x: number, y: number) => { const o = ((Math.floor((y - box.y0) * K)) * box.w * K + Math.floor((x - box.x0) * K)) * 4; return [out[o], out[o + 1], out[o + 2]]; };
  return { at, slices, out };
}
const near = (a: number[], b: number[], tol = 12) => a.every((v, i) => Math.abs(v - b[i]) <= tol);

describe('ground compositor', () => {
  it('lays the road on the road, clearings on pads, the apron at the turret and ground elsewhere', () => {
    const level = narrowed(LEVEL_0), geo = levelGeometry(level), { at, slices } = bake(level);
    expect(slices).toBeGreaterThan(5); // yields in slices
    const mid = geo.roadAt(120);
    expect(near(at(mid.x, mid.y), ROAD)).toBe(true);
    for (const p of level.pads.filter(q => q.y > 34)) expect(near(at(p.x, p.y), CLEAR), `pad ${p.name}`).toBe(true);
    expect(near(at(level.turret.x + 3, level.turret.y - 3), APRON)).toBe(true);
    // a point well clear of road, pads and turret shows the ground material
    let found = 0;
    for (let y = 40; y < 100; y += 3) for (let x = 2; x < 78; x += 3) {
      const p = { x, y };
      if (geo.distanceToRoad(p) < 16 || level.pads.some(q => Math.hypot(q.x - x, q.y - y) < 8) || Math.hypot(x - 40, y - 101) < 20) continue;
      expect(near(at(x, y), GROUND), `${x},${y}`).toBe(true); found++;
    }
    expect(found).toBeGreaterThan(5);
  });

  it('is deterministic', () => {
    expect(bake().out).toEqual(bake().out);
  });

  it('scatters props clear of the road, pads and turret, and the same way every time', () => {
    const level = generateLevel(7, { style: 'ring', iterations: 200 }).level, geo = levelGeometry(level), box = { x0: -8, y0: -16, w: 96, h: 132 };
    const plan = scatterPlan(level, MANIFEST, box);
    expect(plan).toEqual(scatterPlan(level, MANIFEST, box));
    expect(plan.filter(p => p.kind === 'prop').length).toBeGreaterThan(3);
    for (const p of plan.filter(q => q.kind !== 'mouth')) {
      const st = p.kind === 'prop' ? MANIFEST.props[p.i] : MANIFEST.decals[p.i], r = p.kind === 'prop' ? Math.max(st.w, st.h) / 2 : 1;
      expect(geo.distanceToRoad(p)).toBeGreaterThan(level.roadHalfWidth + level.shoulder + r - 1e-9);
      for (const q of level.pads) expect(Math.hypot(q.x - p.x, q.y - p.y)).toBeGreaterThan(6 + r - 1e-9);
    }
  }, 30_000);

  it('finds the world box a screen shows, upright and turned', () => {
    const P = (x: number, y: number) => ({ x: 100 + x * 9, y: 20 + y * 9 });
    const b = screenBox(P, 820, 1180);
    expect(b.x0).toBeLessThanOrEqual(-100 / 9); expect(b.x0 + b.w).toBeGreaterThanOrEqual(720 / 9);
    expect(b.y0).toBeLessThanOrEqual(-20 / 9); expect(b.y0 + b.h).toBeGreaterThanOrEqual(1160 / 9);
    const T = (x: number, y: number) => ({ x: (130 - y) * 7, y: (x + 10) * 7 }); // turned: world y runs right-to-left
    const t = screenBox(T, 1180, 820);
    expect(t.x0).toBeLessThanOrEqual(-10); expect(t.x0 + t.w).toBeGreaterThanOrEqual(820 / 7 - 10);
    expect(t.y0).toBeLessThanOrEqual(130 - 1180 / 7); expect(t.y0 + t.h).toBeGreaterThanOrEqual(130);
  });
});

describe('bridge decks', () => {
  it('a ring level puts the later pass on the deck and the earlier one under it', () => {
    for (const seed of [1, 2, 3]) {
      const level = generateLevel(seed, { style: 'ring', iterations: 200 }).level, ds = decks(level), geo = levelGeometry(level);
      expect(ds.length).toBe(level.bridges?.length ?? 0);
      for (const d of ds) {
        expect(d.under[1]).toBeLessThan(d.over[0]);
        expect(underDeck(ds, (d.under[0] + d.under[1]) / 2)).toBe(true);
        expect(underDeck(ds, (d.over[0] + d.over[1]) / 2)).toBe(false);
        const p = geo.roadAt((d.under[0] + d.under[1]) / 2);
        expect(onDeck(ds, p)).toBe(true);
        expect(d.line.length).toBeGreaterThan(10);
      }
    }
    expect(decks(LEVEL_0)).toEqual([]);
  }, 60_000);
});

describe('packed kits', () => {
  it('every generator ground style has a kit, and every file a kit names is packed', () => {
    expect([...GROUND_STYLES]).toEqual([...KIT_STYLES]);
    expect(kitStyle('painted')).toBe('outpost');
    for (const style of KIT_STYLES) {
      const dir = join(process.cwd(), 'public', 'td', 'kits', style);
      const m = JSON.parse(readFileSync(join(dir, 'kit.json'), 'utf8')) as KitManifest;
      expect(m.style).toBe(style);
      const files = [...Object.values(m.files), m.apron.file, m.deck.file, ...m.decals.map(s => s.file), ...m.props.map(s => s.file),
        ...(m.clearing ? [m.clearing.file] : []), ...(m.hiveMouth ? [m.hiveMouth.file] : [])];
      for (const f of files) expect(existsSync(join(dir, f)), `${style}/${f}`).toBe(true);
      expect(m.props.length).toBeGreaterThan(2);
    }
  });
});
