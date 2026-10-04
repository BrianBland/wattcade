import { describe, expect, it } from 'vitest';
import { dealEvents, GeoEvents, MAT } from '../sim/events';
import { makePlan } from '../sim/plan';
import { makeTerrain, NX, NY } from '../sim/terrain';

const plan = makePlan(45);
const run = (g: GeoEvents, seconds: number, at: (t: number) => [number, number, number], w: Float32Array) => {
  const cues: string[] = [];
  for (let t = 0; t < seconds; t += 1 / 30) { const [i, bt, len] = at(t); for (const c of g.update(1 / 30, i, bt, len, w)) cues.push(`${c.type}:${c.kind}`); }
  return cues;
};

describe('geological events', () => {
  it('deals a deterministic deck: ~25 % none, rare meteors, each event in its fitting block', () => {
    expect(dealEvents(42, plan)).toEqual(dealEvents(42, plan));
    let none = 0, meteors = 0;
    for (let s = 0; s < 1000; s++) { const d = dealEvents(s * 7919, plan); if (!d.length) none++; if (d.some((e) => e.kind === 'meteor')) meteors++; }
    expect(none).toBeGreaterThan(180); expect(none).toBeLessThan(320);
    expect(meteors).toBeGreaterThan(20); expect(meteors).toBeLessThan(110);
    const forced = dealEvents(1, plan, ['volcano', 'earthquake', 'landslide']);
    expect(plan[forced[0].block].job).toBe('grist');
    expect(plan[forced[1].block].beavers).toBe(true);
    expect(plan[forced[2].block].job).toBe('village');
  });
  it('a meteor warns, then digs a crater (in h and h0 alike) and scorches it', () => {
    const t = makeTerrain(5), w = new Float32Array(NX * NY);
    const g = new GeoEvents(t, dealEvents(5, plan, ['meteor']), 5);
    const e = g.events[0], len = 120;
    const before = t.h.slice(), base = t.h0.slice();
    const cues = run(g, 6, (s) => [e.block, len * e.frac - 4.5 + s, len], w);
    expect(cues).toEqual(['eventWarn:meteor', 'eventHit:meteor', 'eventDone:meteor']);
    const k = Math.round(e.y) * NX + Math.round(e.x);
    expect(t.h[k]).toBeLessThan(before[k] - 2);
    expect(t.h[k] - t.h0[k]).toBeCloseTo(before[k] - base[k], 4);   // events never count as carving
    expect(g.mat[k]).toBe(MAT.scorched);
  });
  it('a volcano lays a hard lava tongue over the easiest saddle of ridge 1', () => {
    const t = makeTerrain(7), w = new Float32Array(NX * NY);
    const g = new GeoEvents(t, dealEvents(7, plan, ['volcano']), 7);
    const e = g.events[0];
    const sd = t.saddles.filter((s) => s.ridge === t.ridges[0]).reduce((a, s) => (s.depth > a.depth ? s : a));
    const k = (t.ridges[0] + 2) * NX + sd.x, h0 = t.h[k];
    run(g, 40, (s) => [e.block, 240 * e.frac - 6 + s, 240], w);
    expect(t.h[k]).toBeGreaterThan(h0 + 1.5);
    expect(t.hard[k]).toBeLessThan(0.2);
    expect(g.mat[k]).toBe(MAT.lava);
  });
  it('nothing happens outside the event block', () => {
    const t = makeTerrain(9), w = new Float32Array(NX * NY), h = t.h.slice();
    const g = new GeoEvents(t, dealEvents(9, plan, ['earthquake']), 9);
    expect(run(g, 5, (s) => [0, s, 240], w)).toEqual([]);
    expect(t.h).toEqual(h);
  });
});
