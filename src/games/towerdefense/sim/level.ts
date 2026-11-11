// A level's map as data (TdLevel) and the geometry the sim and renderer derive from it (TdGeometry).
// Level 0 is today's painted serpentine (`road.ts`). Pure: no DOM, no rng.
import {
  FLYER_SPAWNS, HIVE_MOUTH, PAD_R, PAINT_BOXES, PAINTED_PADS, ROAD_HALF_WIDTH, ROAD_PADS, ROAD_PAD_NAMES, ROAD_WAYPOINTS,
  SHOULDER, SPAWN_Y, TURRET, TURRET_R, splineLine, type PaintOrientation, type Pt,
} from './road';

export type { Pt } from './road';
export type PaintBox = { x0: number; y0: number; x1: number; y1: number };

/** One map: everything that differs between levels. Field size (80×112) and pad radius are shared. */
export interface TdLevel {
  id: string;
  name: string;
  /** Ground style (material kit) id; 'painted' = level 0's registered painting. */
  style: string;
  /** Waypoints from the hive mouth to the turret; the road is a centripetal Catmull-Rom through them. */
  waypoints: readonly Pt[];
  pads: ReadonlyArray<Pt & { name: string }>;
  turret: Pt;
  /** Turret deck radius: where the road ends and the apron is drawn. */
  turretR: number;
  roadHalfWidth: number;
  shoulder: number;
  hiveMouth: Pt;
  /** Where the walkable road starts (enemies enter here, under the status rows). */
  spawnY: number;
  /** Gliders fly straight from each of these to the turret. */
  flyerSpawns: readonly Pt[];
  /** Road walkers keep within ± this of the centre line (default 2.25; the boss stays within ±0.5). */
  laneSpread?: number;
  /** The Hive Tyrant's size on this map, in units (default `KINDS.boss.radius`, 5.2). Size only: no balance change. */
  bossRadius?: number;
  /** Generated levels: the seed and road style they came from. */
  seed?: number;
  roadStyle?: string;
  /** Where the road crosses itself; the later pass rides a bridge deck (the final approach is never under one). */
  bridges?: readonly Pt[];
  /**
   * More walking routes (waypoints, entrance to turret) beside `waypoints`: a fork shares its start and splits, a
   * merge comes from its own entrance and joins the road. Shared stretches repeat the same waypoints, so the splines
   * coincide there. Walkers take the routes in turn.
   */
  lanes?: ReadonlyArray<readonly Pt[]>;
  /** Where power cables may pass under the road (a buried conduit), so ground between routes can hold pads. */
  culverts?: readonly Pt[];
  /** Registered terrain paintings (level 0 only). Pads ≥ `pads` get a drawn plate. */
  painted?: { boxes: Readonly<Record<PaintOrientation, PaintBox>>; pads: number };
}

export const LEVEL_0: TdLevel = {
  id: 'level-0', name: 'Outpost', style: 'painted',
  waypoints: ROAD_WAYPOINTS,
  pads: ROAD_PADS.map((p, i) => ({ x: p.x, y: p.y, name: ROAD_PAD_NAMES[i] })),
  turret: TURRET, turretR: TURRET_R, roadHalfWidth: ROAD_HALF_WIDTH, shoulder: SHOULDER,
  hiveMouth: HIVE_MOUTH, spawnY: SPAWN_Y, flyerSpawns: FLYER_SPAWNS,
  painted: { boxes: PAINT_BOXES, pads: PAINTED_PADS },
};

/**
 * The narrower road for generated levels (owner-approved): an 8-unit road with walkers within ±1.5, a smaller boss
 * (size only) and a smaller turret deck. Level 0 keeps its painted 11-unit road.
 */
export const NARROW_ROAD = { roadHalfWidth: 4, laneSpread: 1.5, bossRadius: 4, turretR: 8 } as const satisfies Partial<TdLevel>;
/** A level at the narrow-road sizes (drawn as vector ground: a painting would no longer line up). */
export const narrowed = (level: TdLevel): TdLevel => ({ ...level, ...NARROW_ROAD, id: `${level.id}-narrow`, painted: undefined });
const LANE_SPREAD = 2.25, BOSS_RADIUS = 5.2, BASE_REACH = 8;

/** Build pads beside the road. `s` = road distance of the nearest stretch. */
export interface Pad { id: number; x: number; y: number; name: string; s: number }
export type RoadPoint = { x: number; y: number; nx: number; ny: number };

/** One walking route: its sampled centre line and the walk along it. */
export interface Lane {
  /** The whole sampled centre line, from its hive mouth to the turret (for drawing). */
  line: readonly Pt[];
  /** Walkable length, from the spawn edge to the turret. */
  length: number;
  /** Point `d` units along the route from the spawn edge, with the unit normal (pointing to the walker's left). */
  at(d: number): RoadPoint;
  /** Where the route enters the field (its hive mouth). */
  mouth: Pt;
}

export interface TdGeometry {
  level: TdLevel;
  /** Lane 0's sampled centre line, from the hive mouth to the turret (for drawing). */
  road: readonly Pt[];
  /** Every route's centre line (lane 0 first); shared stretches appear once per route. */
  roads: ReadonlyArray<readonly Pt[]>;
  /** The walking routes (lane 0 = `waypoints`). */
  lanes: readonly Lane[];
  /** Lane 0's walkable length, from the spawn edge to the turret. */
  roadLength: number;
  /** Point `d` units along lane 0 from the spawn edge, with the unit normal (pointing to the walker's left). */
  roadAt(d: number): RoadPoint;
  /** Road distance of the nearest road point to (x, y). */
  roadDistanceOf(x: number, y: number): number;
  /** Shortest distance from a point to any route's sampled centre line. */
  distanceToRoad(p: Pt): number;
  /** The walkable road for drawing (every `step` samples, always ending at the turret). */
  roadPolyline(step?: number): Pt[];
  routes: number;
  flightLength(route: number): number;
  flightAt(route: number, d: number): RoadPoint;
  pads: Pad[];
  /** Road walkers' lateral half-spread; the boss's radius; the turret's art scale vs level 0 (deck radius / 11). */
  laneSpread: number;
  bossRadius: number;
  deckScale: number;
  /** An alien this close to the end of its road (or flight) has reached the turret (8 on level 0's deck). */
  baseR: number;
  /** The workshop's pseudo-pad for the base (repair): one past the last pad. */
  basePad: number;
  base: Pt;
  /** Aim angle from the base to a point: 0 = straight up, negative = left. */
  angleTo(x: number, y: number): number;
  distTo(x: number, y: number): number;
  /**
   * Pads and the base (basePad) in on-screen order for ◀▶. Portrait reads in rows, top to bottom and left to right;
   * a turned (landscape) field reads in columns, left (turret) to right (hive) and top to bottom. Points within
   * `band` world units across the main axis share a row/column.
   */
  padOrder(turned: boolean, band?: number): number[];
}

/** Shortest distance from a point to a polyline. */
export function distanceToLine(p: Pt, line: readonly Pt[]): number {
  let best = Infinity;
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1], b = line[i], dx = b.x - a.x, dy = b.y - a.y, len2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
    best = Math.min(best, Math.hypot(p.x - a.x - dx * t, p.y - a.y - dy * t));
  }
  return best;
}

const FIELD_H = 112;
const cache = new WeakMap<TdLevel, TdGeometry>();

/** The walkable part of a centre line (from just above the spawn edge) and its running length. */
function walkOf(line: readonly Pt[], spawnY: number) {
  const first = Math.max(0, line.findIndex((p) => p.y >= spawnY) - 1);
  const pts = line.slice(first), cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
  return { pts, cum };
}
function laneOf(waypoints: readonly Pt[], spawnY: number): Lane {
  const line = splineLine(waypoints), { pts, cum } = walkOf(line, spawnY), len = cum[cum.length - 1];
  const at = (d: number): RoadPoint => {
    const dd = Math.max(0, Math.min(len, d));
    let lo = 0, hi = pts.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cum[m] <= dd) lo = m; else hi = m; }
    const seg = cum[hi] - cum[lo] || 1, k = (dd - cum[lo]) / seg, a = pts[lo], b = pts[hi];
    const tx = b.x - a.x, ty = b.y - a.y, tl = Math.hypot(tx, ty) || 1;
    return { x: a.x + tx * k, y: a.y + ty * k, nx: ty / tl, ny: -tx / tl };
  };
  return { line, length: len, at, mouth: waypoints[0] };
}

/** The level's derived geometry, built once per level object. */
export function levelGeometry(level: TdLevel): TdGeometry {
  const hit = cache.get(level);
  if (hit) return hit;
  const base = level.turret;
  const lanes = [level.waypoints, ...(level.lanes ?? [])].map((w) => laneOf(w, level.spawnY));
  const road = lanes[0].line, roads = lanes.map((l) => l.line);
  const { pts, cum } = walkOf(road, level.spawnY), len = lanes[0].length, roadAt = lanes[0].at;
  const roadDistanceOf = (x: number, y: number): number => {
    let best = Infinity, at = 0;
    for (let i = 0; i < pts.length; i++) { const p = pts[i], d = Math.hypot(p.x - x, p.y - y); if (d < best) { best = d; at = cum[i]; } }
    return at;
  };
  const flightLength = (route: number): number => Math.hypot(base.x - level.flyerSpawns[route].x, base.y - level.flyerSpawns[route].y);
  const flightAt = (route: number, d: number): RoadPoint => {
    const a = level.flyerSpawns[route], fl = flightLength(route), k = Math.max(0, Math.min(1, d / fl));
    const tx = (base.x - a.x) / fl, ty = (base.y - a.y) / fl;
    return { x: a.x + (base.x - a.x) * k, y: a.y + (base.y - a.y) * k, nx: ty, ny: -tx };
  };
  const pads: Pad[] = level.pads.map((p, id) => ({ id, x: p.x, y: p.y, name: p.name, s: roadDistanceOf(p.x, p.y) }));
  const basePad = pads.length;
  const padOrder = (turned: boolean, band = 12): number[] => {
    const all = [...pads.map((p) => ({ id: p.id, x: p.x, y: p.y })), { id: basePad, x: base.x, y: base.y }]
      // screen axes: `main` runs down the rows (portrait) or across the columns (landscape); `cross` along them
      .map((p) => turned ? { id: p.id, main: FIELD_H - p.y, cross: p.x } : { id: p.id, main: p.y, cross: p.x })
      .sort((a, b) => a.main - b.main || a.cross - b.cross);
    const rows: Array<typeof all> = [];
    for (const p of all) {
      const row = rows.at(-1);
      if (row && p.main - row[0].main <= band) row.push(p); else rows.push([p]);
    }
    return rows.flatMap((r) => r.sort((a, b) => a.cross - b.cross).map((p) => p.id));
  };
  const geo: TdGeometry = {
    level, road, roads, lanes, roadLength: len, roadAt, roadDistanceOf,
    distanceToRoad: (p) => Math.min(...roads.map((l) => distanceToLine(p, l))),
    roadPolyline: (step = 4) => pts.filter((_, i) => i % step === 0 || i === pts.length - 1),
    routes: level.flyerSpawns.length, flightLength, flightAt,
    pads, basePad, base,
    laneSpread: level.laneSpread ?? LANE_SPREAD, bossRadius: level.bossRadius ?? BOSS_RADIUS,
    deckScale: level.turretR / TURRET_R, baseR: BASE_REACH * level.turretR / TURRET_R,
    angleTo: (x, y) => Math.atan2(x - base.x, base.y - y),
    distTo: (x, y) => Math.hypot(x - base.x, y - base.y),
    padOrder,
  };
  cache.set(level, geo);
  return geo;
}

/** Pad radius, shared by every level. */
export { PAD_R };

/** The geometry of a snapshot's level (level 0 for fixtures that predate levels). */
export const geoOf = (s: { level?: TdLevel }): TdGeometry => levelGeometry(s.level ?? LEVEL_0);
