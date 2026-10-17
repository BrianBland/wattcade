import { describe, expect, it } from 'vitest';
import { BASE_X, BASE_Y, PADS, ROAD_LENGTH, roadAt } from '../sim/defs';
import { FIELD_H, FIELD_W, PAINT_BOXES, TURRET_R, worldToPaint } from '../sim/road';
import { LIGHT_BUDGET, boundedLights } from '../render/battlefieldMath';
import { face, fieldRect, toScreen, toWorld, type FieldView } from '../render/fieldView';
import { layout } from '../render/layout';

describe('field view', () => {
  const views: FieldView[] = [{ x: 30, y: 160, k: 7.3, turned: false }, { x: 284, y: 12, k: 6.6, turned: true }];
  it('round-trips world and screen in both orientations', () => {
    for (const v of views) for (const p of [{ x: 0, y: 0 }, { x: FIELD_W, y: FIELD_H }, { x: BASE_X, y: BASE_Y }, ...PADS]) {
      const back = toWorld(v, toScreen(v, p));
      expect(back.x).toBeCloseTo(p.x, 9); expect(back.y).toBeCloseTo(p.y, 9);
    }
  });
  it('keeps one scale, and turns landscape so the turret is left and the spawn edge right', () => {
    const [up, turned] = views;
    const d = (v: FieldView, a: { x: number; y: number }, b: { x: number; y: number }) => { const p = toScreen(v, a), q = toScreen(v, b); return Math.hypot(p.x - q.x, p.y - q.y); };
    for (const v of views) expect(d(v, { x: 0, y: 0 }, { x: 10, y: 0 })).toBeCloseTo(d(v, { x: 0, y: 0 }, { x: 0, y: 10 }));
    expect(toScreen(turned, { x: BASE_X, y: BASE_Y }).x).toBeLessThan(toScreen(turned, roadAt(0)).x);
    expect(toScreen(up, { x: BASE_X, y: BASE_Y }).y).toBeGreaterThan(toScreen(up, roadAt(0)).y);
    const r = fieldRect(turned); expect(r.w).toBeCloseTo(FIELD_H * turned.k); expect(r.h).toBeCloseTo(FIELD_W * turned.k);
  });
  it('turns world headings with the field: a step along `face(a)` on screen matches the world step', () => {
    for (const v of views) for (const a of [0, 0.7, -1.2, 2.5]) {
      const p = { x: 40, y: 60 }, q = { x: p.x + Math.sin(a), y: p.y - Math.cos(a) }, s0 = toScreen(v, p), s1 = toScreen(v, q), b = face(v, a);
      expect((s1.x - s0.x) / v.k).toBeCloseTo(Math.sin(b), 9); expect((s1.y - s0.y) / v.k).toBeCloseTo(-Math.cos(b), 9);
    }
  });
  it('the turret, its apron and the whole road stay inside the field above the HUD', () => {
    for (const [w, h] of [[1366, 1024], [1180, 820], [820, 1180], [390, 844], [844, 390]]) for (const inset of [0, 90, 160]) {
      const L = layout(w, h, inset, true), r = fieldRect(L.field);
      expect(r.y + r.h).toBeLessThanOrEqual(h - inset + 0.5);
      const apron = toScreen(L.field, { x: BASE_X, y: BASE_Y + TURRET_R });
      expect(L.field.turned ? toScreen(L.field, { x: BASE_X + TURRET_R, y: BASE_Y }).y : apron.y).toBeLessThanOrEqual(h - inset + 0.5);
      for (let d = 0; d <= ROAD_LENGTH; d += 5) { const q = toScreen(L.field, roadAt(d)); expect(q.y).toBeLessThanOrEqual(h - inset + 0.5); }
    }
  });
  it('paintings cover their own boxes, and landscape keeps more hive than portrait', () => {
    expect(PAINT_BOXES.landscape.y0).toBeLessThan(PAINT_BOXES.portrait.y0);
    for (const o of ['portrait', 'landscape'] as const) {
      const a = worldToPaint(o, { x: PAINT_BOXES[o].x0, y: PAINT_BOXES[o].y0 }), b = worldToPaint(o, { x: PAINT_BOXES[o].x1, y: PAINT_BOXES[o].y1 });
      expect(Math.abs(b.x - a.x) * Math.abs(b.y - a.y)).toBeCloseTo(1536 * 1024, -2);
    }
  });
});

describe('light-map budget', () => {
  it('a busy wave cannot grow light work beyond the fixed budget; static lights retain priority', () => {
    const sources=Array.from({length:1000},(_,i)=>i);
    const lights=boundedLights(sources);
    expect(lights).toHaveLength(LIGHT_BUDGET);
    expect(lights[0]).toBe(0);
    expect(boundedLights(sources,0)).toEqual([]);
    expect(boundedLights([1,2])).toEqual([1,2]);
  });
});

describe('incremental alien frame baking', () => {
  it('publishes rest poses fairly, bakes only one pose per pump, and clears in-progress work on resize', async () => {
    const { FrameCache } = await import('../render/aliens/puppets');
    type FrameSet = import('../render/aliens/puppets').FrameSet;
    type Puppet = import('../render/aliens/puppets').Puppet;
    const a = { walk: [] } as unknown as FrameSet, b = { walk: [] } as unknown as FrameSet;
    let poses = 0;
    function* steps(p: Puppet): Generator<FrameSet> { for (let i=0;i<3;i++) { poses++; yield p.species.id === 'skitter' ? a : b; } }
    const puppets = new Map([['skitter', { species: { id: 'skitter' } }], ['warrior', { species: { id: 'warrior' } }]]) as unknown as Map<import('../render/aliens/species').SpeciesId, Puppet>;
    const cache = new FrameCache(puppets, steps);
    expect(cache.get('skitter', 20, '#fff')).toBeNull();
    expect(cache.get('skitter', 20, '#fff')).toBeNull();
    cache.get('warrior', 40, '#fff'); expect(cache.pending).toBe(2);
    cache.pump(); expect(poses).toBe(1); expect(cache.get('skitter',20,'#fff')).toBe(a);
    cache.pump(); expect(poses).toBe(2); expect(cache.get('warrior',40,'#fff')).toBe(b);
    cache.clear(); expect(cache.pending).toBe(0); cache.pump(); expect(poses).toBe(2);
    expect(cache.get('skitter',20,'#fff')).toBeNull();
  });
});
