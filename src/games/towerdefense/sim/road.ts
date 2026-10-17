// Single-road layout (layout D, "organic serpentine"). The sketch page, the paint guides and the sim all read
// this file, so the painted road and the walking road are the same curve. Pure: no DOM.
export interface Pt { x: number; y: number }

/** Field in world units: x across, y from the spawn edge (0) to behind the turret (FIELD_H). */
export const FIELD_W = 80;
export const FIELD_H = 112;
export const TURRET: Pt = { x: 40, y: 101 };
export const TURRET_R = 11;
export const ROAD_HALF_WIDTH = 5.5;
export const SHOULDER = 1.25;
export const PAD_R = 4.2;

/**
 * Waypoints the road passes through. It starts at a burrow mouth deep in the hive, which only tall screens show;
 * enemies enter where it crosses SPAWN_Y, under the status rows.
 */
export const HIVE_MOUTH: Pt = { x: 74, y: -40 };
export const SPAWN_Y = -10;
export const ROAD_WAYPOINTS: readonly Pt[] = [
  HIVE_MOUTH, { x: 70, y: -24 }, { x: 66, y: -10 }, { x: 63, y: 2 }, { x: 44, y: 9 }, { x: 22, y: 5 }, { x: 9, y: 17 }, { x: 16, y: 32 },
  { x: 40, y: 36 }, { x: 62, y: 38 }, { x: 72, y: 50 }, { x: 62, y: 62 }, { x: 38, y: 60 }, { x: 18, y: 64 },
  { x: 12, y: 78 }, { x: 24, y: 88 }, TURRET,
];

/** Eight build pads. Ids are the array index. */
export const ROAD_PADS: readonly Pt[] = [
  { x: 32, y: 21 }, { x: 66, y: 20 }, { x: 54, y: 50 }, { x: 7, y: 48 },
  { x: 32, y: 76 }, { x: 56, y: 79 }, { x: 30, y: 48 }, { x: 10, y: 97 },
];

/** Gliders fly straight from these points to the turret. */
export const FLYER_SPAWNS: readonly Pt[] = [{ x: 6, y: -6 }, { x: 40, y: -6 }, { x: 74, y: -6 }];

/** Centripetal Catmull-Rom through every waypoint, sampled about every half unit. */
export function splineLine(pts: readonly Pt[]): Pt[] {
  const out: Pt[] = [pts[0]];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    const d = (a: Pt, b: Pt) => Math.max(1e-3, Math.sqrt(Math.hypot(b.x - a.x, b.y - a.y)));
    const t0 = 0, t1 = t0 + d(p0, p1), t2 = t1 + d(p1, p2), t3 = t2 + d(p2, p3);
    const n = Math.max(2, Math.ceil(Math.hypot(p2.x - p1.x, p2.y - p1.y) * 2));
    for (let j = 1; j <= n; j++) {
      const t = t1 + (t2 - t1) * j / n;
      const L = (a: Pt, b: Pt, ta: number, tb: number) => ({ x: ((tb - t) * a.x + (t - ta) * b.x) / (tb - ta), y: ((tb - t) * a.y + (t - ta) * b.y) / (tb - ta) });
      const a1 = L(p0, p1, t0, t1), a2 = L(p1, p2, t1, t2), a3 = L(p2, p3, t2, t3);
      const b1 = L(a1, a2, t0, t2), b2 = L(a2, a3, t1, t3);
      out.push(L(b1, b2, t1, t2));
    }
  }
  return out;
}

export const ROAD: readonly Pt[] = splineLine(ROAD_WAYPOINTS);

/** Shortest distance from a point to the sampled road centre line. */
export function distanceToRoad(p: Pt, line: readonly Pt[] = ROAD): number {
  let best = Infinity;
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1], b = line[i], dx = b.x - a.x, dy = b.y - a.y, len2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
    best = Math.min(best, Math.hypot(p.x - a.x - dx * t, p.y - a.y - dy * t));
  }
  return best;
}

/** Road length from the spawn edge (SPAWN_Y) to where it meets the turret deck. */
export function walkedLength(line: readonly Pt[] = ROAD): number {
  let s = 0;
  for (let i = 1; i < line.length; i++) {
    if (line[i].y < SPAWN_Y) continue;
    if (Math.hypot(line[i].x - TURRET.x, line[i].y - TURRET.y) < TURRET_R) break;
    s += Math.hypot(line[i].x - line[i - 1].x, line[i].y - line[i - 1].y);
  }
  return s;
}

/**
 * Paint-guide registration. Both paintings cover the same world box; portrait maps it upright, landscape turns it
 * 90° so the spawn edge is on the right and the turret on the left. Image pixels per world unit = PAINT_PX / box.
 */
export const PAINT_BOX = { x0: -40, y0: -60, x1: 120, y1: 180 } as const;
export type PaintOrientation = 'portrait' | 'landscape';
export function paintSize(o: PaintOrientation, long = 1536) {
  const w = PAINT_BOX.x1 - PAINT_BOX.x0, h = PAINT_BOX.y1 - PAINT_BOX.y0, s = long / Math.max(w, h);
  return o === 'portrait' ? { w: w * s, h: h * s, pxPerUnit: s } : { w: h * s, h: w * s, pxPerUnit: s };
}
/** World point to image pixel for a painting of the given size. */
export function worldToPaint(o: PaintOrientation, p: Pt, long = 1536): Pt {
  const { pxPerUnit: s } = paintSize(o, long);
  return o === 'portrait'
    ? { x: (p.x - PAINT_BOX.x0) * s, y: (p.y - PAINT_BOX.y0) * s }
    : { x: (PAINT_BOX.y1 - p.y) * s, y: (p.x - PAINT_BOX.x0) * s };
}
