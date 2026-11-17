import { describe, expect, it } from 'vitest';
import { createGameSession, NullInput, testProfile } from '../../../core';
import { module } from '../index';
import { BASE_PAD, BASE_R, KINDS, PADS, ROAD_LENGTH, flightAt, padOrder, roadAt } from '../sim/defs';
import { LEVEL_0, NARROW_ROAD, levelGeometry, narrowed, type TdLevel } from '../sim/level';
import { layout, fieldClearsHud } from '../render/layout';
import { along, cableRoutes } from '../render/cables';
import type { TdSnapshot } from '../sim/types';

/** Level 0 mirrored left-right, with only its first eight pads: a different map with the same proven shape. */
const MIRROR: TdLevel = {
  ...LEVEL_0, id: 'mirror', name: 'Mirror', style: 'test', painted: undefined,
  waypoints: LEVEL_0.waypoints.map((p) => ({ x: 80 - p.x, y: p.y })),
  pads: LEVEL_0.pads.slice(0, 8).map((p) => ({ ...p, x: 80 - p.x })),
  hiveMouth: { x: 80 - LEVEL_0.hiveMouth.x, y: LEVEL_0.hiveMouth.y },
  flyerSpawns: [{ x: 20, y: -6 }, { x: 60, y: -6 }],
};

describe('level data seam', () => {
  it('level 0 geometry is the old single-map geometry', () => {
    const g = levelGeometry(LEVEL_0);
    expect(g.roadLength).toBe(ROAD_LENGTH);
    expect(g.pads).toEqual(PADS);
    expect(g.basePad).toBe(BASE_PAD);
    expect(g.padOrder(true)).toEqual(padOrder(true));
    for (const d of [0, 50, 130, ROAD_LENGTH]) expect(g.roadAt(d)).toEqual(roadAt(d));
    expect(g.flightAt(1, 20)).toEqual(flightAt(1, 20));
    expect(levelGeometry(LEVEL_0)).toBe(g); // cached per level
  });

  it('another level mirrors the road, pads and order', () => {
    const g = levelGeometry(MIRROR), g0 = levelGeometry(LEVEL_0);
    expect(g.roadLength).toBeCloseTo(g0.roadLength, 6);
    expect(g.roadAt(100).x).toBeCloseTo(80 - g0.roadAt(100).x, 6);
    expect(g.pads).toHaveLength(8);
    expect(g.basePad).toBe(8);
    expect(g.routes).toBe(2);
    expect([...g.padOrder(false)].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('the sim plays the level it is given: road walkers on its road, towers only on its pads', () => {
    const s = createGameSession({ game: module, profile: testProfile(), input: new NullInput(), fake: { script: 'sprints' }, seed: 5,
      simOpts: { autopilot: true, level: MIRROR } });
    const g = levelGeometry(MIRROR);
    let walkers = 0, routes = new Set<number>();
    for (let i = 0; i < 12 * 60 * 10; i++) {
      s.step(6);
      const snap = s.sim.snapshot() as TdSnapshot;
      expect(snap.level).toBe(MIRROR);
      for (const e of snap.enemies) {
        if (e.flying) { routes.add(e.route); continue; }
        walkers++;
        expect(g.distanceToRoad(e)).toBeLessThan(MIRROR.roadHalfWidth + 1);
      }
      for (const tw of snap.towers) expect(tw.pad).toBeLessThan(8);
      if (snap.wavesSurvived >= 4) break;
    }
    const end = s.sim.snapshot() as TdSnapshot;
    expect(walkers).toBeGreaterThan(100);
    expect([...routes].every((r) => r < 2)).toBe(true);
    expect(end.towers.length).toBeGreaterThan(0);
  });

  it('layout clearance and cables follow the level', () => {
    for (const [W, H] of [[820, 1180], [1180, 820]]) {
      const L = layout(W, H, { top: 0, bottom: 120, left: 0, right: 0 }, false, MIRROR);
      expect(fieldClearsHud(L.field, [{ x: 0, y: H - 120, w: W, h: 120 }], MIRROR)).toBe(true);
    }
    const routes = cableRoutes(MIRROR), g = levelGeometry(MIRROR);
    expect(routes.length).toBe(8);
    const T = MIRROR.turret;
    for (const r of routes) for (let f = 0; f <= 1; f += 0.002) {
      const p = along(r.pts, r.length, f);
      if (Math.hypot(p.x - T.x, p.y - T.y) < MIRROR.turretR - 1) continue; // under the deck, where the road ends
      expect(g.distanceToRoad(p), `pad ${r.pad}`).toBeGreaterThan(MIRROR.roadHalfWidth + MIRROR.shoulder + 0.5);
    }
  });

  it('level 0 keeps its sizes: lane spread, boss radius, turret reach and art scale', () => {
    const g = levelGeometry(LEVEL_0);
    expect(g.laneSpread).toBe(2.25);
    expect(g.bossRadius).toBe(KINDS.boss.radius);
    expect(g.baseR).toBe(BASE_R);
    expect(g.deckScale).toBe(1);
  });

  it('a narrow level keeps walkers within ±1.5 of its 8-unit road, with a smaller boss and turret', () => {
    const level = narrowed(LEVEL_0), g = levelGeometry(level);
    expect(level.roadHalfWidth * 2).toBe(8);
    expect(level.painted).toBeUndefined();
    expect(g.deckScale).toBeCloseTo(8 / 11, 6);
    expect(g.baseR).toBeCloseTo(BASE_R * 8 / 11, 6);
    const s = createGameSession({ game: module, profile: testProfile(), input: new NullInput(), fake: { script: 'sprints' }, seed: 3,
      simOpts: { autopilot: true, level } });
    let walkers = 0, bosses = 0;
    for (let i = 0; i < 30 * 60 * 2 && bosses < 50; i++) {
      s.step(10);
      const snap = s.sim.snapshot() as TdSnapshot;
      for (const e of snap.enemies) {
        if (e.flying) continue;
        walkers++;
        if (e.kind === 'boss') { bosses++; expect(e.radius).toBe(NARROW_ROAD.bossRadius); }
        // lane offset plus the walkers' wobble, inside the road
        expect(g.distanceToRoad(e)).toBeLessThan(level.roadHalfWidth);
      }
    }
    expect(walkers).toBeGreaterThan(200);
    expect(bosses).toBeGreaterThan(0);
  });

  it('a narrow level clears the HUD in portrait and landscape', () => {
    const level = narrowed(LEVEL_0);
    for (const [W, H] of [[820, 1180], [1180, 820], [390, 844], [844, 390]]) {
      const L = layout(W, H, { top: 0, bottom: 110, left: 0, right: 0 }, false, level);
      expect(fieldClearsHud(L.field, [{ x: 0, y: H - 110, w: W, h: 110 }], level)).toBe(true);
    }
  });
});
