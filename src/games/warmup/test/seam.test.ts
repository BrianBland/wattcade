import { describe, expect, it } from 'vitest';
import { coverage, edgeOffset, layerSpans, ownerAt, roadSeams, SEAM, softValue, softWeights, type Seam } from '../render/seam';
import { biomeOfSeg } from '../sim/terrain';

const seam: Seam = { x: 1000, from: 'desert', to: 'volcano' };
/** A layer with parallax p, rider at screen 100, camera at road position d. */
const layer = (d: number, p: number, ppm = 9) => (x: number) => 100 + (x - d) * ppm * p;

describe('biome seams', () => {
  it('split each layer where the boundary falls in it: far layers first, all meeting at the rider', () => {
    const W = 400;
    // 300 m out: the far hills already show the next biome; the road does not
    const far = layerSpans('desert', [seam], layer(700, 0.05), W), road = layerSpans('desert', [seam], layer(700, 1), W);
    expect(far.map((s) => s.id)).toEqual(['desert', 'volcano']);
    expect(far[0].x1).toBeCloseTo(100 + 300 * 9 * 0.05);
    expect(road.map((s) => s.id)).toEqual(['desert']);
    // at the seam every layer cuts exactly at the rider
    for (const p of [0.05, 0.5, 1, 1.35]) expect(layerSpans('desert', [seam], layer(1000, p), W)[0].x1).toBeCloseTo(100);
    // well past it: only the new biome
    expect(layerSpans('volcano', [seam], layer(1400, 1), W).map((s) => s.id)).toEqual(['volcano']);
  });
  it('a seam off screen only decides which biome fills it; no seams means the given biome', () => {
    expect(layerSpans('snow', [], layer(0, 1), 400)).toEqual([{ x0: -Infinity, x1: Infinity, id: 'snow' }]);
    expect(layerSpans('desert', [seam], layer(2000, 1), 400)[0].id).toBe('volcano');
    expect(layerSpans('desert', [seam], layer(0, 1), 400)[0].id).toBe('desert');
  });
  it('props belong wholly to the side they stand on', () => {
    const sp = layerSpans('desert', [seam], layer(990, 1), 400);
    expect(ownerAt(sp, 0)).toBe('desert'); expect(ownerAt(sp, sp[0].x1 - 0.5)).toBe('desert');
    expect(ownerAt(sp, sp[0].x1 + 0.5)).toBe('volcano'); expect(ownerAt(sp, 399)).toBe('volcano');
  });
  it('the cut is ragged but stays close to the seam', () => {
    const offs = Array.from({ length: 200 }, (_, y) => edgeOffset(y, 3));
    expect(Math.max(...offs.map(Math.abs))).toBeLessThanOrEqual(SEAM.jag);
    expect(new Set(offs).size).toBeGreaterThan(3);
    expect(edgeOffset(10, 3)).toBe(edgeOffset(11, 3)); // stepped in pixel rows
  });
  it('coverage sums to one; the sky front is soft and monotonic', () => {
    const sp = layerSpans('desert', [seam], layer(990, 1), 400); // cut 10 m ahead: 190 px
    const cov = coverage(sp, 400);
    expect(cov.reduce((a, [, w]) => a + w, 0)).toBeCloseTo(1);
    expect(cov.find(([id]) => id === 'desert')![1]).toBeCloseTo(190 / 400);
    let last = -1;
    for (let x = 0; x < 400; x += 5) {
      const v = softValue(sp, x, 160, (id) => (id === 'volcano' ? 1 : 0));
      expect(v).toBeGreaterThanOrEqual(last - 1e-9); last = v;
      expect(softWeights(sp, x, 160).reduce((a, [, w]) => a + w, 0)).toBeCloseTo(1);
    }
    expect(softValue(sp, sp[0].x1, 160, (id) => (id === 'volcano' ? 1 : 0))).toBeCloseTo(0.5);
  });
  it('overworld seams sit on every biome boundary and chain', () => {
    const s = roadSeams(5000, 2000, 1200, (k) => biomeOfSeg(k, 2));
    expect(s[0].x).toBe(2400); expect(s.at(-1)!.x).toBe(7200);
    for (let i = 1; i < s.length; i++) expect(s[i].from).toBe(s[i - 1].to);
    expect(s.every((q) => q.to === biomeOfSeg(q.x / 1200, 2))).toBe(true);
    expect(roadSeams(100, 500, 1200, (k) => biomeOfSeg(k, 0))[0].x).toBe(1200); // none before the start
  });
});
