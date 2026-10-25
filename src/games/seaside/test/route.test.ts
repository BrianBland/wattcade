import { describe, expect, it } from 'vitest';
import { RouteSpline } from '../world/route';

describe('RouteSpline', () => {
  const straight = new RouteSpline([[0, 0, 0], [0, 10, -100], [0, 20, -200]]);
  it('is parameterized by horizontal arc length', () => {
    expect(straight.length).toBeCloseTo(200, 3);
    const p = straight.at(50);
    expect(p.z).toBeCloseTo(-50, 3);
    expect(p.y).toBeCloseTo(5, 1);
    expect(straight.tangent(50).z).toBeCloseTo(-1, 6);
  });
  it('gives signed lateral offsets, + to the right of travel', () => {
    // travelling −z, the right hand points to +x
    expect(straight.nearest(3, -80)!.d).toBeCloseTo(3, 6);
    expect(straight.nearest(-2, -80)!.d).toBeCloseTo(-2, 6);
    expect(straight.nearest(-2, -80)!.s).toBeCloseTo(80, 3);
    expect(straight.offset(80, 3).x).toBeCloseTo(3, 6);
    expect(straight.nearest(100, -80, 20)).toBeNull();
  });
  it('measures distance to squares, 0 when the route crosses them even with both ends outside', () => {
    expect(straight.distToRect(-8, -120, 16)).toBe(0);
    expect(straight.distToRect(10, -120, 16)).toBeCloseTo(10, 6);
    expect(straight.distToRect(-40, 20, 16)).toBeCloseTo(Math.hypot(24, 20), 6);
    const diag = new RouteSpline([[-100, 0, 0], [100, 0, -200]]);
    expect(diag.distToRect(-4, -104, 8)).toBe(0); // centre square, no route vertex inside it
  });
  it('follows curves (Catmull-Rom through the controls)', () => {
    const bend = new RouteSpline([[0, 0, 0], [0, 0, -100], [100, 0, -200]], 2);
    for (const s of [0, 30, 90, 150, bend.length]) {
      const p = bend.at(s), n = bend.nearest(p.x, p.z, 1)!;
      expect(n.s).toBeCloseTo(s, 1);
      expect(Math.abs(n.d)).toBeLessThan(1e-6);
    }
    const b = bend.bbox(0, bend.length);
    expect(b.x0).toBeLessThanOrEqual(0); expect(b.x0).toBeGreaterThan(-10); // Catmull-Rom swings out a little before the bend
    expect(b.x1).toBeCloseTo(100, 1); expect(b.z0).toBeCloseTo(-200, 1);
  });
});
