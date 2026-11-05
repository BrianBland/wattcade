import { describe, expect, it } from 'vitest';
import { biomeParams, cityRoads, mulberry, riverX } from '../render/terrain';

describe('seeded terrain', () => {
  it('is deterministic per seed and varies between seeds', () => {
    expect(biomeParams(1, 42)).toEqual(biomeParams(1, 42)); expect(biomeParams(1, 42).u).not.toEqual(biomeParams(1, 43).u);
    const a = mulberry(7), b = mulberry(7); expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });
  it('city streets match the shader lattice and space blocks sensibly', () => {
    for (let seed = 1; seed < 40; seed++) {
      const P = biomeParams(1, seed), { xs } = cityRoads(P, -130, 130), [sx, ox] = P.u;
      expect(sx).toBeGreaterThanOrEqual(30); expect(sx).toBeLessThan(45);
      for (const x of xs) expect(Math.abs((((x - ox) % sx) + sx) % sx - sx / 2)).toBeLessThan(1e-6);
      for (let i = 1; i < xs.length; i++) expect(xs[i] - xs[i - 1]).toBeCloseTo(sx, 6);
      if (P.highway) expect(Math.abs(P.highwayX)).toBeGreaterThan(55);
    }
  });
  it('canyon rivers wind within the play field and differ by seed', () => {
    const A = biomeParams(2, 5), B = biomeParams(2, 6);
    let diff = 0; for (let t = 0; t < 4000; t += 50) { expect(Math.abs(riverX(t, A))).toBeLessThanOrEqual(22); diff += Math.abs(riverX(t, A) - riverX(t, B)); }
    expect(diff).toBeGreaterThan(100);
  });
});
describe('sea islands', () => {
  it('are seeded per cell, stable across query windows, and well spread', async () => {
    const { seaIslands, SEA_CELL } = await import('../render/terrain');
    const a = seaIslands(7, -1000, 1000, -1000, 1000), b = seaIslands(7, -400, 1400, -900, 1100);
    const key = (i: { x: number; z: number }) => `${i.x.toFixed(3)},${i.z.toFixed(3)}`;
    const common = a.filter(i => b.some(j => key(j) === key(i)));
    expect(common.length).toBeGreaterThan(3);
    for (const i of common) expect(b.find(j => key(j) === key(i))).toEqual(i);
    expect(a.length).toBeGreaterThan(8); expect(a.length).toBeLessThan(40);
    for (const i of a) for (const j of a) if (i !== j) expect(Math.hypot(i.x - j.x, i.z - j.z)).toBeGreaterThan(SEA_CELL * 0.5 - 1);
    expect(new Set(a.map(i => i.kind)).size).toBe(3);
  });
});
