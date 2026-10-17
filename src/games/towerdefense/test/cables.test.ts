import { describe, expect, it } from 'vitest';
import { along, cableRoutes, distanceToLine, strokeCrossings, CABLE_ROAD_CLEAR } from '../render/cables';
import { PAD_R, ROAD, ROAD_HALF_WIDTH, ROAD_PADS, SHOULDER, TURRET, TURRET_R } from '../sim/road';

describe('power cables', () => {
  const routes = cableRoutes();
  it('runs one cable from under the turret deck to every pad', () => {
    expect(routes.map((r) => r.pad)).toEqual(ROAD_PADS.map((_, i) => i));
    for (const r of routes) {
      expect(r.pts[0]).toEqual(TURRET);
      expect(r.pts.at(-1)).toEqual(ROAD_PADS[r.pad]);
      expect(r.length).toBeGreaterThan(10);
    }
  });
  it('never touches the road: every point along every cable stays off the road and its shoulder', () => {
    for (const r of routes) for (let f = 0; f <= 1; f += 0.002) {
      const p = along(r.pts, r.length, f);
      if (Math.hypot(p.x - TURRET.x, p.y - TURRET.y) < TURRET_R - 1) continue; // under the deck, where the road ends
      expect(distanceToLine(p, ROAD), `pad ${r.pad} at ${f.toFixed(3)}`).toBeGreaterThan(ROAD_HALF_WIDTH + SHOULDER + 0.5);
    }
    expect(CABLE_ROAD_CLEAR).toBeGreaterThan(ROAD_HALF_WIDTH + SHOULDER);
  });
  it('passes under another pad only where a pocket leaves no other way in', () => {
    for (const r of routes) for (let f = 0; f <= 1; f += 0.002) {
      const p = along(r.pts, r.length, f);
      ROAD_PADS.forEach((q, k) => {
        if (k !== r.pad && Math.hypot(p.x - q.x, p.y - q.y) < PAD_R) expect(r.through, `pad ${r.pad} under pad ${k}`).toContain(k);
      });
    }
    expect(routes.filter((r) => r.through.length).length).toBeLessThanOrEqual(1);
  });
  it('is deterministic and cached', () => {
    expect(cableRoutes()).toBe(routes);
  });
  it('sends a pulse per pedal half-stroke, none when cadence stops or the reading resets', () => {
    expect(strokeCrossings(10.1, 10.4)).toBe(0);
    expect(strokeCrossings(10.4, 10.5)).toBe(1);
    expect(strokeCrossings(10, 12)).toBe(4);
    expect(strokeCrossings(12, 0)).toBe(0);
    expect(strokeCrossings(0, 1000)).toBeLessThanOrEqual(8);
  });
});
