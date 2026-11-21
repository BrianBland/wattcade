import { describe, expect, it } from 'vitest';
import { along, cableRoadClear, cableRoutes, cableRuns, deckSides, distanceToLine, onDeckSide, polyLength, strokeCrossings, CABLE_ROAD_CLEAR } from '../render/cables';
import { cablePlan, lampLook, powerState } from '../render/cableArt';
import { BAKED_LEVELS } from '../sim/baked';
import { levelGeometry } from '../sim/level';
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

describe('shared trunks and bridges', () => {
  const levels = Object.entries(BAKED_LEVELS);
  it('wires every pad of every campaign map, branching most cables off a trunk', () => {
    let branched = 0, total = 0;
    for (const [key, level] of levels) {
      const routes = cableRoutes(level);
      expect(routes.map((r) => r.pad), key).toEqual(level.pads.map((_, i) => i));
      for (const r of routes) {
        expect(r.pts[0], key).toEqual(level.turret);
        if (r.parent != null) {
          const parent = routes.find((p) => p.pad === r.parent)!;
          // the shared stretch is exactly the parent's first `branch` units
          expect(r.pts.slice(0, r.ownFrom).every((p) => distanceToLine(p, parent.pts) < 1e-6), key).toBe(true);
          expect(r.branch).toBeLessThanOrEqual(parent.length + 1e-6);
        }
      }
      branched += routes.filter((r) => r.parent != null).length; total += routes.length;
    }
    expect(branched / total).toBeGreaterThan(0.5);
  }, 60_000);
  it('never lies on bare road: it crosses only along a bridge deck\'s side or through a culvert', () => {
    for (const [key, level] of levels) {
      const roads = levelGeometry(level).roads, sides = deckSides(level), clear = cableRoadClear(level);
      for (const r of cableRoutes(level)) {
        if (r.underDeck) continue; // last resort, none on the baked maps (checked below)
        for (let f = 0; f <= 1; f += 0.002) {
          const p = along(r.pts, r.length, f);
          if (Math.hypot(p.x - level.turret.x, p.y - level.turret.y) < level.turretR - 1) continue;
          if (Math.hypot(p.x - level.pads[r.pad].x, p.y - level.pads[r.pad].y) < PAD_R) continue;
          const onRoad = Math.min(...roads.map((l) => distanceToLine(p, l))) < level.roadHalfWidth + level.shoulder + 0.45;
          const crossing = onDeckSide(sides, p, clear) || (level.culverts ?? []).some((c) => Math.hypot(c.x - p.x, c.y - p.y) < clear * 1.5 + 3);
          expect(onRoad && !crossing, `${key} pad ${r.pad} at ${f.toFixed(3)}`).toBe(false);
        }
      }
      expect(cableRoutes(level).filter((r) => r.underDeck), key).toEqual([]);
    }
  }, 60_000);
  it('some campaign cables use a bridge side', () => {
    const uses = levels.filter(([, level]) => cablePlan(level, new Set(level.pads.map((_, i) => i))).pieces.some((p) => p.bridge));
    expect(uses.length).toBeGreaterThan(3);
  }, 60_000);
  it('counts the towers each stretch feeds: the trunk carries both, each branch its own', () => {
    const level = levels[0][1], routes = cableRoutes(level);
    const child = routes.find((r) => r.parent != null)!, parent = routes.find((r) => r.pad === child.parent)!;
    const runs = cableRuns(routes, new Set([child.pad, parent.pad]));
    expect(Math.max(...runs.map((r) => r.load))).toBeGreaterThanOrEqual(2);
    expect(runs.filter((r) => r.pad === child.pad).every((r) => r.load === 1 && r.spliced)).toBe(true);
    // only the child built: the parent's stretch past the splice is not drawn
    const only = cableRuns(routes, new Set([child.pad]));
    const parentRuns = only.filter((r) => r.pad === parent.pad);
    expect(parentRuns.reduce((s, r) => s + polyLength(r.pts), 0)).toBeLessThanOrEqual(child.branch + 1e-6);
    expect(cableRuns(routes, new Set())).toEqual([]);
  });
});

describe('power indicator', () => {
  it('is quiet at ordinary power, and calls out under power, a stall, overclocking and Overdrive', () => {
    expect(powerState(1, false, false)).toEqual({ kind: 'ok', amount: 0 });
    expect(powerState(0.95, false, false).kind).toBe('ok');
    expect(powerState(0.7, false, false).kind).toBe('low');
    expect(powerState(0, true, false).kind).toBe('off');
    expect(powerState(1.15, false, false).kind).toBe('over');
    expect(powerState(1.6, false, false).amount).toBe(1);
    expect(powerState(1.6, false, true).kind).toBe('overdrive');
    expect(lampLook(powerState(1, false, false), 0).pulses).toBe(false);
    expect(lampLook(powerState(1.2, false, false), 0).pulses).toBe(true);
    // a deeper deficit blinks faster: count blinks over a second
    const blinks = (grid: number) => { let n = 0, was = 1; for (let t = 0; t < 2; t += 0.005) { const on = lampLook(powerState(grid, false, false), t).on; if (on < 0.5 && was >= 0.5) n++; was = on; } return n; };
    expect(blinks(0.4)).toBeGreaterThan(blinks(0.85));
  });
});
