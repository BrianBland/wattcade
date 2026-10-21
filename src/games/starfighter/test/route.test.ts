import { describe, expect, it } from 'vitest';
import { WorldRoute, planTurns, toLocal, toWorld, fwd, TURN } from '../sim/route';

describe('world route', () => {
  it('is continuous in position and heading through arcs', () => {
    const r = new WorldRoute(); r.turn(100, Math.PI / 3);
    for (let s = 0; s < 800; s += 0.5) {
      const a = r.pose(s), b = r.pose(s + 0.5);
      expect(Math.hypot(b.x - a.x, b.z - a.z)).toBeCloseTo(0.5, 2); expect(Math.abs(b.h - a.h)).toBeLessThan(0.002);
    }
    expect(r.pose(1000).h).toBeCloseTo(Math.PI / 3, 6);
    // Positive heading turns left: forward swings toward −x.
    expect(fwd(r.pose(1000).h).x).toBeLessThan(-0.8);
  });
  it('maps world ↔ flight frame consistently', () => {
    const p = { x: 30, z: -40, h: 0.7 }, w = toWorld(p, 12, 55), l = toLocal(p, w.x, w.z);
    expect(l.lx).toBeCloseTo(12, 9); expect(l.ahead).toBeCloseTo(55, 9);
  });
  it('plans gentle turns only where allowed, clear of segment ends, snapped to phrases', () => {
    let seed = 3; const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const r = new WorldRoute(); planTurns(r, 0, 6000, true, rand, s => Math.ceil(s / 352) * 352);
    let turning = 0, starts = 0, prev = 0;
    for (let s = 0; s < 6000; s += 4) { const k = r.curvature(s); if (k && !prev) { starts++; expect(s % 352).toBeLessThan(4); } prev = k; if (k) turning += 4; expect(Math.abs(k)).toBeLessThanOrEqual(TURN.curvature + 1e-9); }
    expect(starts).toBeGreaterThan(1); expect(r.curvature(6000 - TURN.endClear + 1)).toBe(0); expect(turning / 6000).toBeLessThan(0.35);
    const s2 = new WorldRoute(); planTurns(s2, 0, 6000, false, rand); for (let s = 0; s < 6000; s += 50) expect(s2.curvature(s)).toBe(0);
  });
});
