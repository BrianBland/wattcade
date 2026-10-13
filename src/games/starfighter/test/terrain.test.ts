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
