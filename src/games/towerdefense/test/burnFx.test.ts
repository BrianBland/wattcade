import { describe, expect, it } from 'vitest';
import { CORES, MAX_PATCHES, SCAR_S, SQUASH, TONGUES, coalHeat, fireShares, flameHeat, scorchAlpha, tongues, trackPatches } from '../render/burnFx';

describe('burning ground', () => {
  it('flares on impact, burns steadily, then dies down to nothing', () => {
    expect(flameHeat(1)).toBeGreaterThan(flameHeat(0.7));
    expect(flameHeat(0.7)).toBeCloseTo(1);
    expect(flameHeat(0.2)).toBeLessThan(flameHeat(0.5));
    expect(flameHeat(0)).toBe(0);
  });
  it('coals outlive the flames, then cool during the scar', () => {
    expect(coalHeat(0, 0)).toBeGreaterThan(0);
    expect(coalHeat(0, SCAR_S * 0.25)).toBeLessThan(coalHeat(0, 0));
    expect(coalHeat(0, SCAR_S)).toBe(0);
  });
  it('the scorch burns in fast and fades only after the fire is out', () => {
    expect(scorchAlpha(0, 0)).toBe(0);
    expect(scorchAlpha(0.5, 0)).toBe(1);
    expect(scorchAlpha(4, SCAR_S * 0.2)).toBe(1);
    expect(scorchAlpha(9, SCAR_S)).toBe(0);
  });
  it('tongues stay on their patch, sort back to front, and thin out as the fire dies', () => {
    for (let t = 0; t < 6; t += 0.13) {
      const ts = tongues(42, t, 1.2);
      expect(ts.length).toBeLessThanOrEqual(TONGUES + CORES);
      for (const q of ts) {
        expect(Math.hypot(q.dx, q.dy / SQUASH)).toBeLessThanOrEqual(0.62 + 1e-9);
        expect(q.h).toBeGreaterThan(0); expect(q.h).toBeLessThan(2.5);
        expect(q.w).toBeLessThanOrEqual(q.h * 0.42 + 1e-9);
      }
      for (let i = 1; i < ts.length; i++) expect(ts[i].dy).toBeGreaterThanOrEqual(ts[i - 1].dy);
    }
    const count = (heat: number) => { let n = 0; for (let t = 0; t < 6; t += 0.1) n += tongues(7, t, heat).length; return n; };
    expect(count(0.2)).toBeLessThan(count(1));
    expect(tongues(7, 1, 0)).toEqual([]);
  });
  it('is deterministic for a given patch and time', () => {
    expect(tongues(9, 2.5, 1)).toEqual(tongues(9, 2.5, 1));
  });
  it('keeps a burnt-out patch as a cooling scar, then drops it', () => {
    const b = { x: 10, y: 20, r: 6, k: 1 };
    let ps = trackPatches([], [b], 1);
    expect(ps).toHaveLength(1); expect(ps[0].outT).toBeNull();
    ps = trackPatches(ps, [{ ...b, k: 0.5 }], 3);
    expect(ps).toHaveLength(1); expect(ps[0].k).toBe(0.5); expect(ps[0].bornT).toBe(1);
    ps = trackPatches(ps, [], 5);
    expect(ps).toHaveLength(1); expect(ps[0].outT).toBe(5);
    ps = trackPatches(ps, [], 5 + SCAR_S - 0.1); expect(ps).toHaveLength(1);
    ps = trackPatches(ps, [], 5 + SCAR_S); expect(ps).toHaveLength(0);
  });
  it('a fresh fire on an old scar starts its own patch; a new level clears everything', () => {
    const b = { x: 10, y: 20, r: 6, k: 1 };
    let ps = trackPatches(trackPatches([], [b], 1), [], 2);
    ps = trackPatches(ps, [b], 3);
    expect(ps.filter((p) => p.outT == null)).toHaveLength(1);
    expect(ps.filter((p) => p.outT != null)).toHaveLength(1);
    expect(trackPatches(ps, [], 0.5)).toEqual([]);
  });
  it('caps tracked patches, dropping scars before live fires', () => {
    let ps = trackPatches([], Array.from({ length: MAX_PATCHES }, (_, i) => ({ x: i * 3, y: 0, r: 6, k: 1 })), 1);
    ps = trackPatches(ps, [], 2); // all scars now
    ps = trackPatches(ps, Array.from({ length: 10 }, (_, i) => ({ x: i * 3, y: 50, r: 6, k: 1 })), 3);
    expect(ps).toHaveLength(MAX_PATCHES);
    expect(ps.filter((p) => p.outT == null)).toHaveLength(10);
  });
  it('a newer fire on top of an older one takes over its flames; separate fires keep theirs', () => {
    let ps = trackPatches([], [{ x: 0, y: 0, r: 6, k: 1 }, { x: 30, y: 0, r: 6, k: 1 }], 1);
    ps = trackPatches(ps, [{ x: 0, y: 0, r: 6, k: 0.8 }, { x: 30, y: 0, r: 6, k: 0.8 }, { x: 1, y: 0.5, r: 6, k: 1 }], 2);
    const sh = fireShares(ps), at = (x: number, born: number) => sh[ps.findIndex((p) => p.x === x && p.bornT === born)];
    expect(at(0, 1)).toBeLessThan(0.4);
    expect(at(1, 2)).toBe(1);
    expect(at(30, 1)).toBe(1);
  });
});
