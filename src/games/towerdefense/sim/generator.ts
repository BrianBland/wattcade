// Seeded level generator: a deliberately drawn road in one of eight styles (two with two routes: fork, merge), pads placed by a coverage search, and
// validators. Pure and deterministic (its own seeded rng): no DOM, no Math.random. Findings behind the numbers:
// docs/towerdefense/LEVELS-HANDOFF.md §5 (branch td-ground-spike) and scripts/td-map-lab.
import { makeRng } from '../../../core/rng';
import { NARROW_ROAD, distanceToLine, type TdLevel } from './level';
import { FIELD_H, FIELD_W, PAD_R, splineLine, type Pt } from './road';

export type RoadStyle = 'zigzag' | 'trident' | 'lasso' | 'ring' | 'switchback' | 'crossover' | 'fork' | 'merge';
export const ROAD_STYLES: readonly RoadStyle[] = ['zigzag', 'trident', 'lasso', 'ring', 'switchback', 'crossover', 'fork', 'merge'];
/** Ground kits (docs/towerdefense/ground-kit): the renderer draws a level in its style's kit. */
export const GROUND_STYLES = ['outpost', 'scrapyard', 'badlands', 'volcanic', 'overgrown', 'blight'] as const;
export type GroundStyle = typeof GROUND_STYLES[number];

const TURRET: Pt = { x: 40, y: 101 };
const FLYERS: Pt[] = [{ x: 6, y: -6 }, { x: 40, y: -6 }, { x: 74, y: -6 }];
const HIVE: Pt[] = [{ x: 74, y: -40 }, { x: 71, y: -24 }];
/** A second hive, top left, for roads with two entrances. */
const HIVE_WEST: Pt[] = [{ x: 6, y: -40 }, { x: 9, y: -24 }];
const SPAWN_Y = -10;
const SHOULDER = 1;
/** Pads stay where both orientations' HUDs leave them visible (short landscape is the tightest). */
export const PAD_BOX = { x0: PAD_R + 1, x1: 71, y0: 14, y1: 97 };
/** Walked length band (level 0 is 257): long roads need more pads or faster aliens. */
export const LENGTH_BAND = { min: 230, max: 335 };
/** Separate road passes keep this far apart (centre lines), away from bridges: a visible strip of ground between. */
const MIN_SELF_CLEAR = 13;
/** A level may hold fewer pads than asked for when its road leaves less room, but never fewer than this (for 12 asked). */
export const MIN_PADS = 10;
/** The fewest pads a level asking for `n` may settle for: two short of `n`, at most MIN_PADS, at least 4. */
export const minPads = (n: number) => Math.min(MIN_PADS, Math.max(4, n - 2));
const PAD_GAP = PAD_R * 2 + 4; // centre to centre
const PAD_ROAD = NARROW_ROAD.roadHalfWidth + SHOULDER + PAD_R + 1; // centre to road centre line

export interface GenOpts {
  style?: RoadStyle; ground?: GroundStyle; pads?: number; iterations?: number;
  /** Collects why attempts were rejected (tuning and tests). */
  log?: string[];
}
export interface Generated { level: TdLevel; style: RoadStyle; attempts: number; metrics: LevelMetrics }

/** Builds roads from straight runs and circular arcs, so bends are deliberate. */
class Path {
  pts: Pt[];
  constructor(...start: Pt[]) { this.pts = [...start]; }
  get at() { return this.pts[this.pts.length - 1]; }
  line(to: Pt, step = 6) {
    const a = this.at, n = Math.max(1, Math.round(Math.hypot(to.x - a.x, to.y - a.y) / step));
    for (let i = 1; i <= n; i++) this.pts.push({ x: a.x + (to.x - a.x) * i / n, y: a.y + (to.y - a.y) * i / n });
    return this;
  }
  /** Arc around centre c from the current point, sweeping `deg` degrees (positive = clockwise on screen). */
  arc(c: Pt, deg: number, step = 4) {
    const a = this.at, r = Math.hypot(a.x - c.x, a.y - c.y), a0 = Math.atan2(a.y - c.y, a.x - c.x), sweep = deg * Math.PI / 180;
    const n = Math.max(2, Math.round(Math.abs(sweep) * r / step));
    for (let i = 1; i <= n; i++) { const t = a0 + sweep * i / n; this.pts.push({ x: c.x + Math.cos(t) * r, y: c.y + Math.sin(t) * r }); }
    return this;
  }
  /** Spiral around c, sweeping `deg` while the radius eases to r1 (x stretched by `sx`). */
  spiral(c: Pt, deg: number, r1: number, sx = 1, step = 4) {
    const a = this.at, dx = (a.x - c.x) / sx, dy = a.y - c.y, r0 = Math.hypot(dx, dy), a0 = Math.atan2(dy, dx), sweep = deg * Math.PI / 180;
    const n = Math.max(2, Math.round(Math.abs(sweep) * Math.max(r0, r1) / step));
    for (let i = 1; i <= n; i++) { const k = i / n, t = a0 + sweep * k, r = r0 + (r1 - r0) * k; this.pts.push({ x: c.x + Math.cos(t) * r * sx, y: c.y + Math.sin(t) * r }); }
    return this;
  }
}

type Rng = () => number;
const between = (rng: Rng, a: number, b: number) => a + (b - a) * rng();

/** Even switchbacks across the field, then down the middle into the turret. */
function zigzag(rng: Rng): Pt[] {
  const rows = rng() < 0.5 ? 3 : 4, sp = rows === 3 ? between(rng, 24, 27) : between(rng, 22, 23.5), r = sp / 2;
  // runs go from xL to xR; the U-turns bulge r beyond them, and stay inside the field
  const xR = between(rng, 68, 72) - r, xL = between(rng, 8, 12) + r, y0 = between(rng, 12, 18);
  const p = new Path(...HIVE, { x: xR + r, y: -8 }).line({ x: xR + r, y: y0 - r }).arc({ x: xR, y: y0 - r }, 90);
  let left = true;
  for (let i = 0; i < rows; i++) {
    const y = y0 + i * sp;
    if (i === rows - 1) break;
    if (left) p.line({ x: xL, y }).arc({ x: xL, y: y + r }, -180);
    else p.line({ x: xR, y }).arc({ x: xR, y: y + r }, 180);
    left = !left;
  }
  const yl = y0 + (rows - 1) * sp, r2 = Math.min(10, (TURRET.y - yl) / 2.5);
  if (left) p.line({ x: 40 + r2, y: yl }).arc({ x: 40 + r2, y: yl + r2 }, -90);
  else p.line({ x: 40 - r2, y: yl }).arc({ x: 40 - r2, y: yl + r2 }, 90);
  return p.line(TURRET).pts;
}

/** Dive down one side, climb the middle, descend the other side into the turret. */
function trident(rng: Rng): Pt[] {
  const xR = between(rng, 68, 72), pitch = between(rng, 22, 24.5), r = pitch / 2;
  const yb = between(rng, 64, 76), yt = between(rng, 20, 30), yb2 = between(rng, 76, 84);
  const xM = xR - pitch, xL = xR - 2 * pitch;
  return new Path(...HIVE, { x: xR, y: -8 }).line({ x: xR, y: yb }).arc({ x: xR - r, y: yb }, 180)
    .line({ x: xM, y: yt }).arc({ x: xM - r, y: yt }, -180).line({ x: xL, y: yb2 })
    .arc({ x: TURRET.x, y: yb2 }, -60).line(TURRET).pts;
}

/** Down one side, a loop back up, and through its own road on a bridge into the turret. */
function lasso(rng: Rng): Pt[] {
  const xR = between(rng, 64, 70), yLow = between(rng, 74, 80), top = between(rng, 24, 34), R = between(rng, 13, 15.5);
  const xLoop = TURRET.x - 2 * R, rr = 11;
  return new Path(...HIVE, { x: xR, y: -8 }).line({ x: xR, y: yLow - rr }).arc({ x: xR - rr, y: yLow - rr }, 90)
    .line({ x: xLoop + 13, y: yLow }).arc({ x: xLoop + 13, y: yLow - 13 }, 90).line({ x: xLoop, y: top })
    .arc({ x: xLoop + R, y: top }, 180).line({ x: TURRET.x, y: yLow + 12 }).line(TURRET).pts;
}

/** Spiral in around a point above the turret, then straight out across the ring on a bridge. */
function ring(rng: Rng): Pt[] {
  const c = { x: 40, y: between(rng, 46, 50) }, r0 = between(rng, 31, 33), r1 = between(rng, 16, 19), a0 = -50 * Math.PI / 180, sx = 0.95;
  const entry = { x: c.x + Math.cos(a0) * r0 * sx, y: c.y + Math.sin(a0) * r0 };
  return new Path(...HIVE, { x: 68, y: -6 }).line(entry).spiral(c, between(rng, 320, 345), r1, sx)
    .line({ x: 40, y: 92 }).line(TURRET).pts;
}

/** Tight switchbacks in a narrow middle column (no room for pads between rows): pads line the flanks. */
function switchback(rng: Rng): Pt[] {
  const rows = 5, sp = between(rng, 16.5, 17.5), r = sp / 2; // rows a visible strip apart, too close for pads between
  const xL = between(rng, 19, 21) + r, xR = between(rng, 59, 61) - r, y0 = between(rng, 14, 17);
  const p = new Path(...HIVE, { x: xR + r, y: -8 }).line({ x: xR + r, y: y0 - r }).arc({ x: xR, y: y0 - r }, 90);
  let left = true;
  for (let i = 0; i < rows - 1; i++) {
    const y = y0 + i * sp;
    if (left) p.line({ x: xL, y }).arc({ x: xL, y: y + r }, -180);
    else p.line({ x: xR, y }).arc({ x: xR, y: y + r }, 180);
    left = !left;
  }
  const yl = y0 + (rows - 1) * sp, r2 = Math.min(8, (TURRET.y - yl) / 2.5);
  if (left) p.line({ x: 40 + r2, y: yl }).arc({ x: 40 + r2, y: yl + r2 }, -90);
  else p.line({ x: 40 - r2, y: yl }).arc({ x: 40 - r2, y: yl + r2 }, 90);
  return p.line(TURRET).pts;
}

/** Down the side, back across in two rows climbing the field, then straight down the middle over both on bridges. */
function crossover(rng: Rng): Pt[] {
  const xS = between(rng, 75.3, 76), yA = between(rng, 76, 80), sp = between(rng, 26, 29), yB = yA - sp, rA = between(rng, 11, 13), rU = sp / 2;
  const xUL = between(rng, 29, 32), xUR = between(rng, 45, 47), rT = between(rng, 4.5, 5.5);
  return new Path(...HIVE, { x: xS, y: -8 }).line({ x: xS, y: yA - rA }).arc({ x: xS - rA, y: yA - rA }, 90)
    .line({ x: xUL, y: yA }).arc({ x: xUL, y: yA - rU }, 180)
    .line({ x: xUR, y: yB }).arc({ x: xUR, y: yB - rU }, -180)
    .line({ x: TURRET.x + rT, y: yB - sp }).arc({ x: TURRET.x + rT, y: yB - sp + rT }, -90)
    .line(TURRET).pts;
}

/**
 * A fork: a zigzag trunk across the top, then at the middle of its second row the road splits. One route carries on
 * east and down the east side, the other turns south, crosses the middle and comes down the west side; they reach the
 * turret from either side, so the ground between them (above the turret) holds pads.
 */
function fork(rng: Rng): Pt[][] {
  const r = between(rng, 11, 12.5), y0 = between(rng, 13, 16), y1 = y0 + 2 * r, xL = between(rng, 7, 9) + r, xS = between(rng, 69, 71);
  const jx = between(rng, 38, 42);
  const trunk = () => new Path(...HIVE, { x: xS, y: -8 }).line({ x: xS, y: y0 - r }).arc({ x: xS - r, y: y0 - r }, 90)
    .line({ x: xL, y: y0 }).arc({ x: xL, y: y0 + r }, -180).line({ x: jx, y: y1 });
  const xE = between(rng, 67, 69), rE = between(rng, 9, 11), yE = between(rng, 84, 88), RE = 101 - yE;
  const east = trunk().line({ x: xE - rE, y: y1 }).arc({ x: xE - rE, y: y1 + rE }, 90)
    .line({ x: xE, y: yE }).arc({ x: xE - RE, y: yE }, 90).line(TURRET).pts;
  const rT = between(rng, 9, 10.5), yW = between(rng, 66, 70), xW = between(rng, 13, 16), rW = between(rng, 9, 10.5), yW2 = between(rng, 84, 88), RW = 101 - yW2;
  const xD = jx + rT; // the west route's drop through the middle
  const west = trunk().arc({ x: jx, y: y1 + rT }, 90).line({ x: xD, y: yW - rT }).arc({ x: xD - rT, y: yW - rT }, 90)
    .line({ x: xW + rW, y: yW }).arc({ x: xW + rW, y: yW + rW }, -90).line({ x: xW, y: yW2 }).arc({ x: xW + RW, y: yW2 }, -90).line(TURRET).pts;
  return [east, west];
}
/**
 * A merge: two hives, top left and top right. Each route comes down its side and turns in along the top; they meet
 * in the middle and join one trunk that zigzags down the field to the turret.
 */
function merge(rng: Rng): Pt[][] {
  const yR = between(rng, 14, 17), rA = between(rng, 10, 12), xS = between(rng, 69, 71), jx = 40, rJ = between(rng, 10, 12);
  const y2 = between(rng, 38, 42), rU = between(rng, 11, 12.5), y3 = y2 + 2 * rU, y4 = y3 + 2 * rU;
  const xL = between(rng, 8, 10) + rU, xR = between(rng, 70, 72) - rU;
  // the shared trunk, from the junction (heading south) down to the turret
  const R4 = Math.max(8, Math.min(13, 101 - y4));
  const trunk = new Path({ x: jx, y: yR + rJ }).line({ x: jx, y: y2 - rJ }).arc({ x: jx - rJ, y: y2 - rJ }, 90)
    .line({ x: xL, y: y2 }).arc({ x: xL, y: y2 + rU }, -180).line({ x: xR, y: y3 }).arc({ x: xR, y: y3 + rU }, 180)
    .line({ x: jx + R4, y: y4 }).arc({ x: jx + R4, y: y4 + R4 }, -90).line(TURRET).pts;
  const head = (hive: Pt[], x: number, side: 1 | -1) => new Path(...hive, { x, y: -8 }).line({ x, y: yR - rA })
    .arc({ x: x - side * rA, y: yR - rA }, side * 90).line({ x: jx + side * rJ, y: yR }).arc({ x: jx + side * rJ, y: yR + rJ }, -side * 90).pts;
  return [[...head(HIVE, xS, 1), ...trunk.slice(1)], [...head(HIVE_WEST, 80 - xS, -1), ...trunk.slice(1)]];
}

const BUILDERS: Record<RoadStyle, (rng: Rng) => Pt[] | Pt[][]> = { zigzag, trident, lasso, ring, switchback, crossover, fork, merge };
/**
 * What each style can hold and the coverage bar it is searched to (a lower bar is the style's character, not a miss):
 * a switchback's rows sit too close for pads between them, so pads line its ends and the flamer reaches about half
 * the road; a crossover's two bridges leave the middle loop open. Bars measured over seeds 1–3 at 6–16 pads.
 */
export const STYLE_FIT: Record<RoadStyle, { pads: [number, number]; flame: number; gap: number; length?: { min: number; max: number } }> = {
  zigzag: { pads: [6, 16], flame: 0.88, gap: 22 },
  trident: { pads: [6, 16], flame: 0.88, gap: 22 },
  lasso: { pads: [6, 14], flame: 0.88, gap: 22 },
  ring: { pads: [6, 16], flame: 0.88, gap: 22 },
  switchback: { pads: [10, 14], flame: 0.58, gap: 28 },
  crossover: { pads: [8, 14], flame: 0.76, gap: 22 },
  // two routes each carry half the walkers, so each may be a little shorter
  fork: { pads: [8, 12], flame: 0.8, gap: 24, length: { min: 205, max: 335 } },
  merge: { pads: [8, 16], flame: 0.8, gap: 24, length: { min: 205, max: 335 } },
};
/** The walked length each route of a style must have. */
export const lengthBand = (style?: string) => STYLE_FIT[style as RoadStyle]?.length ?? LENGTH_BAND;
/** The pads a style gets when `asked` are wanted: clamped to what it holds. */
export const padsFor = (style: RoadStyle, asked = 12) => {
  const [lo, hi] = STYLE_FIT[style].pads;
  return Math.max(lo, Math.min(hi, Math.round(asked)));
};
/** The bar a level must clear: the style's, eased a little below 8 pads (few pads cannot reach every bend). */
const barFor = (style: RoadStyle, pads: number) => {
  const f = STYLE_FIT[style], ease = pads < 8 ? 0.92 : 1;
  return { flame: f.flame * ease, gap: f.gap / ease };
};

// ---------- measuring a road ----------
type RoadPt = Pt & { s: number };
interface Road { line: Pt[]; walk: RoadPt[]; length: number }
function measureRoad(waypoints: readonly Pt[], turretR: number): Road {
  const line = splineLine(waypoints), walk: RoadPt[] = [];
  let s = 0;
  for (let i = 1; i < line.length; i++) {
    const p = line[i]; if (p.y < SPAWN_Y) continue;
    if (Math.hypot(p.x - TURRET.x, p.y - TURRET.y) < turretR) break;
    s += Math.hypot(p.x - line[i - 1].x, p.y - line[i - 1].y);
    walk.push({ x: p.x, y: p.y, s });
  }
  return { line, walk, length: s };
}
/** Where the road crosses itself (the later pass rides a bridge deck). */
export function crossings(walk: readonly RoadPt[]): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < walk.length; i += 2) for (let j = i + 2; j < walk.length; j += 2) {
    const a = walk[i], b = walk[j];
    if (b.s - a.s > 30 && Math.hypot(a.x - b.x, a.y - b.y) < 1.5 && !out.some(o => Math.hypot(o.x - a.x, o.y - a.y) < 10)) out.push({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  }
  return out;
}
/** Closest approach between two road stretches > 30 apart along it, away from bridges. */
function selfClearance(walk: readonly RoadPt[], bridges: readonly Pt[]): number {
  const nearBridge = (p: Pt) => bridges.some(b => Math.hypot(b.x - p.x, b.y - p.y) < 16);
  let best = Infinity;
  for (let i = 0; i < walk.length; i += 2) for (let j = i + 2; j < walk.length; j += 2)
    if (walk[j].s - walk[i].s > 30 && !(nearBridge(walk[i]) && nearBridge(walk[j]))) best = Math.min(best, Math.hypot(walk[i].x - walk[j].x, walk[i].y - walk[j].y));
  return best;
}

/** Closest approach between the routes' own stretches (away from where they split or join), for forks and merges. */
function laneClearance(roads: readonly Road[]): number {
  let best = Infinity;
  for (let j = 1; j < roads.length; j++) {
    const others = roads.slice(0, j).map(r => r.line), walk = roads[j].walk;
    const d = walk.map(p => Math.min(...others.map(l => distanceToLine(p, l))));
    // own stretches: runs off the other routes, less the bends where they leave or rejoin
    for (let i = 0; i < walk.length;) {
      if (d[i] <= 0.75) { i++; continue; }
      let k = i; while (k + 1 < walk.length && d[k + 1] > 0.75) k++;
      const s0 = walk[i].s + 26, s1 = walk[k].s - 26;
      for (let q = i; q <= k; q++) if (walk[q].s >= s0 && walk[q].s <= s1) best = Math.min(best, d[q]);
      i = k + 1;
    }
  }
  return best;
}

/**
 * Cells (2-unit grid over the field) that a power cable can reach from the turret without crossing a road; it may
 * pass under a bridge deck or through a culvert. Pads must sit on reachable ground.
 */
const RS = 2, RX0 = -10, RY0 = -16, RW = Math.ceil((FIELD_W + 22) / RS) + 1, RH = Math.ceil((FIELD_H + 22) / RS) + 1;
/**
 * Exact distance to a polyline, only over the segments near `p`: each line's segments are bucketed by bounding box
 * once, so a query within `r` reads a few buckets instead of the whole line. Returns the same value as
 * `distanceToLine` whenever that is below `r`, and Infinity (or a value ≥ r) when it is not.
 */
const SEG_CELL = 4;
type SegIndex = Map<number, number[]> & { stamp?: Int32Array; tick?: number };
const segIndexes = new WeakMap<readonly Pt[], SegIndex>();
function segIndex(line: readonly Pt[]): SegIndex {
  let idx = segIndexes.get(line);
  if (idx) return idx;
  idx = new Map() as SegIndex;
  idx.stamp = new Int32Array(line.length); idx.tick = 0;
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1], b = line[i];
    for (let cy = Math.floor(Math.min(a.y, b.y) / SEG_CELL); cy <= Math.floor(Math.max(a.y, b.y) / SEG_CELL); cy++)
      for (let cx = Math.floor(Math.min(a.x, b.x) / SEG_CELL); cx <= Math.floor(Math.max(a.x, b.x) / SEG_CELL); cx++) {
        const k = cy * 4096 + cx, list = idx.get(k);
        if (list) list.push(i); else idx.set(k, [i]);
      }
  }
  segIndexes.set(line, idx);
  return idx;
}
function distanceNear(p: Pt, line: readonly Pt[], r: number): number {
  const idx = segIndex(line), seen = idx.stamp!, tick = ++idx.tick!;
  let best = Infinity;
  for (let cy = Math.floor((p.y - r) / SEG_CELL); cy <= Math.floor((p.y + r) / SEG_CELL); cy++)
    for (let cx = Math.floor((p.x - r) / SEG_CELL); cx <= Math.floor((p.x + r) / SEG_CELL); cx++) {
      const list = idx.get(cy * 4096 + cx);
      if (list) for (const i of list) {
        if (seen[i] === tick) continue;
        seen[i] = tick;
        const a = line[i - 1], b = line[i], dx = b.x - a.x, dy = b.y - a.y, len2 = dx * dx + dy * dy || 1;
        const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
        best = Math.min(best, Math.hypot(p.x - a.x - dx * t, p.y - a.y - dy * t));
      }
    }
  return best;
}

const rAt = (i: number, j: number): Pt => ({ x: RX0 + i * RS, y: RY0 + j * RS });
/** Open cells: off every road (or on the turret deck). */
function openGrid(lines: ReadonlyArray<readonly Pt[]>, clear: number): Uint8Array {
  const open = new Uint8Array(RW * RH);
  for (let j = 0; j < RH; j++) for (let i = 0; i < RW; i++) {
    const p = rAt(i, j);
    open[j * RW + i] = lines.every(l => distanceNear(p, l, clear) >= clear) || Math.hypot(p.x - TURRET.x, p.y - TURRET.y) < NARROW_ROAD.turretR ? 1 : 0;
  }
  return open;
}
/** Flood from the turret over the open cells plus the crossings (bridges, culverts): a cable may pass under those. */
function flood(open: Uint8Array, crossingPts: readonly Pt[], clear: number): Uint8Array {
  const pass = open.slice(), r = clear * 1.5 + 3;
  for (const c of crossingPts) for (let j = Math.max(0, Math.floor((c.y - r - RY0) / RS)); j <= Math.min(RH - 1, Math.ceil((c.y + r - RY0) / RS)); j++)
    for (let i = Math.max(0, Math.floor((c.x - r - RX0) / RS)); i <= Math.min(RW - 1, Math.ceil((c.x + r - RX0) / RS)); i++) {
      const p = rAt(i, j); if (Math.hypot(p.x - c.x, p.y - c.y) < r) pass[j * RW + i] = 1;
    }
  const seen = new Uint8Array(RW * RH), start = Math.round((TURRET.y - RY0) / RS) * RW + Math.round((TURRET.x - RX0) / RS), stack = [start];
  seen[start] = 1;
  while (stack.length) {
    const q = stack.pop()!, i = q % RW, j = (q - i) / RW;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ni = i + di, nj = j + dj, n = nj * RW + ni;
      if (ni < 0 || nj < 0 || ni >= RW || nj >= RH || seen[n] || !pass[n]) continue;
      seen[n] = 1; stack.push(n);
    }
  }
  return seen;
}
const reachOf = (seen: Uint8Array) => (p: Pt) => {
  const i = Math.round((p.x - RX0) / RS), j = Math.round((p.y - RY0) / RS);
  return i >= 0 && j >= 0 && i < RW && j < RH && seen[j * RW + i] === 1;
};
function reachable(lines: ReadonlyArray<readonly Pt[]>, crossingPts: readonly Pt[], clear: number): (p: Pt) => boolean {
  return reachOf(flood(openGrid(lines, clear), crossingPts, clear));
}
/**
 * Culverts for ground the routes close off (a merge's middle, say): up to two points on a road, each the one that opens
 * the most pad ground to the cables, kept while it opens a useful patch. Away from the turret, bridges and junctions.
 */
function placeCulverts(roads: readonly Road[], bridges: readonly Pt[], roadDist: (p: Pt) => number): Pt[] {
  const clear = NARROW_ROAD.roadHalfWidth + SHOULDER + 1.5, open = openGrid(roads.map(r => r.line), clear);
  const padGround: number[] = [];
  for (let j = 0; j < RH; j++) for (let i = 0; i < RW; i++) {
    const p = rAt(i, j);
    if (p.x >= PAD_BOX.x0 && p.x <= PAD_BOX.x1 && p.y >= PAD_BOX.y0 && p.y <= PAD_BOX.y1 && roadDist(p) >= PAD_ROAD
      && Math.hypot(p.x - TURRET.x, p.y - TURRET.y) >= NARROW_ROAD.turretR + PAD_R + 2) padGround.push(j * RW + i);
  }
  const count = (seen: Uint8Array) => padGround.reduce((n, q) => n + seen[q], 0);
  const cands = roads.flatMap((r, li) => r.walk.filter((p, i) => i % 3 === 0 && p.x > 10 && p.x < 70 && p.y > 18 && p.y < 95
    && Math.hypot(p.x - TURRET.x, p.y - TURRET.y) > NARROW_ROAD.turretR + 10 && bridges.every(b => Math.hypot(b.x - p.x, b.y - p.y) > 16)
    // not where routes part or meet (on another route, or well clear of it)
    && roads.every((o, k) => k === li || (d => d < 0.75 || d > 14)(distanceNear(p, o.line, 14)))));
  const out: Pt[] = [];
  let have = count(flood(open, bridges, clear));
  for (let n = 0; n < 2 && padGround.length - have > 12; n++) {
    let best: Pt | null = null, bestN = have;
    for (const c of cands) { const k = count(flood(open, [...bridges, ...out, c], clear)); if (k > bestN) { bestN = k; best = c; } }
    if (!best || bestN - have < 10) break;
    out.push({ x: Math.round(best.x * 10) / 10, y: Math.round(best.y * 10) / 10 }); have = bestN;
  }
  return out;
}

// ---------- pads ----------
export interface LevelMetrics {
  length: number; flame: number; gap: number; tesla: number; air: number; twoPass: number; selfClear: number; bridges: number;
  /** Walking routes (2 for a fork or merge). */
  lanes: number;
}
interface Field { roads: Road[]; bridges: Pt[]; air: Pt[]; reach: (p: Pt) => boolean; samples: RoadPt[][]; roadDist: (p: Pt) => number; selfClear: number }

/** Distance to the road centre line on a ½-unit grid (rasterised once per road; exact enough for pad clearance). */
// `cap` sits above every threshold the distance is compared with (PAD_ROAD + 0.8 at most), so a far cell reads `cap`.
function roadDistance(lines: ReadonlyArray<readonly Pt[]>, cap = PAD_ROAD + 2): (p: Pt) => number {
  const S = 0.5, X0 = -6, Y0 = -14, W = Math.ceil((FIELD_W + 12) / S) + 1, H = Math.ceil((FIELD_H + 20) / S) + 1;
  const d = new Float32Array(W * H).fill(cap), r = Math.ceil(cap / S);
  const cap2 = cap * cap;
  for (const p of lines.flat()) {
    const cx = Math.round((p.x - X0) / S), cy = Math.round((p.y - Y0) / S);
    for (let j = Math.max(0, cy - r); j <= Math.min(H - 1, cy + r); j++) {
      const dy = Y0 + j * S - p.y, dy2 = dy * dy;
      if (dy2 >= cap2) continue;
      for (let i = Math.max(0, cx - r); i <= Math.min(W - 1, cx + r); i++) {
        const dx = X0 + i * S - p.x, d2 = dx * dx + dy2;
        if (d2 >= cap2) continue; // stays at the cap
        const q = j * W + i, dist = Math.sqrt(d2);
        if (dist < d[q]) d[q] = dist;
      }
    }
  }
  return (p) => {
    const i = Math.round((p.x - X0) / S), j = Math.round((p.y - Y0) / S);
    return i < 0 || j < 0 || i >= W || j >= H ? cap : d[j * W + i];
  };
}
function padViolation(f: Field, pads: readonly Pt[]): number {
  let v = 0;
  pads.forEach((p, i) => {
    v += Math.max(0, PAD_ROAD + 0.3 - f.roadDist(p));
    v += Math.max(0, NARROW_ROAD.turretR + PAD_R + 2 - Math.hypot(p.x - TURRET.x, p.y - TURRET.y));
    v += Math.max(0, PAD_BOX.x0 - p.x) + Math.max(0, p.x - PAD_BOX.x1) + Math.max(0, PAD_BOX.y0 - p.y) + Math.max(0, p.y - PAD_BOX.y1);
    for (let j = i + 1; j < pads.length; j++) {
      const dx = p.x - pads[j].x, dy = p.y - pads[j].y;
      if (dx * dx + dy * dy < (PAD_GAP + 0.01) ** 2) v += PAD_GAP + 0.01 - Math.sqrt(dx * dx + dy * dy);
    }
    if (!f.reach(p)) v += 3;
  });
  return v;
}
/** Coverage along one route's samples: Flamer reach, the longest uncovered run, Tesla overlap, pads seeing two passes. */
function laneCover(samples: readonly RoadPt[], L: number, pads: readonly Pt[]) {
  const n = pads.length, first = new Float64Array(n).fill(-1), last = new Float64Array(n);
  let flame = 0, tesla = 0, gap = 0, run = 0;
  for (const p of samples) {
    let w15 = 0, w24 = 0;
    for (let i = 0; i < n; i++) {
      const dx = pads[i].x - p.x, dy = pads[i].y - p.y, d2 = dx * dx + dy * dy;
      if (d2 <= 576) { w24++; if (d2 <= 225) { w15++; if (first[i] < 0) first[i] = p.s; last[i] = p.s; } }
    }
    if (w15) flame++;
    tesla += Math.min(3, w24); run = w15 ? 0 : run + 1; gap = Math.max(gap, run);
  }
  let twoPass = 0;
  for (let i = 0; i < n; i++) if (first[i] >= 0 && last[i] - first[i] > 40) twoPass++;
  return { flame: flame / samples.length, gap: gap * L / samples.length, tesla: tesla / samples.length, twoPass };
}
/** A level's coverage: each route weighted by its length, the worst gap of any route; pads seeing two passes of lane 0. */
function metrics(f: Field, pads: readonly Pt[]): LevelMetrics {
  const per = f.roads.map((r, i) => laneCover(f.samples[i], r.length, pads)), total = f.roads.reduce((a, r) => a + r.length, 0);
  const mean = (k: 'flame' | 'tesla') => per.reduce((a, c, i) => a + c[k] * f.roads[i].length, 0) / total;
  let air = 0;
  for (const p of f.air) for (const q of pads) { const dx = q.x - p.x, dy = q.y - p.y; if (dx * dx + dy * dy <= 576) { air++; break; } }
  return { length: Math.round(f.roads[0].length), flame: mean('flame'), gap: Math.max(...per.map(c => c.gap)), tesla: mean('tesla'),
    air: air / f.air.length, twoPass: per[0].twoPass, selfClear: f.selfClear, bridges: f.bridges.length, lanes: f.roads.length };
}
/**
 * The pad search's objective, kept incrementally: per candidate, the samples (and flyer points) it covers are listed
 * once, and a swap only adds and removes those. Counts are integers, so `value()` equals scoring `metrics()` from scratch
 * (same sums, same order) at a fraction of the cost.
 */
function coverScorer(f: Field, cands: readonly Pt[]) {
  const near = (pts: readonly Pt[], c: Pt, r2: number) => {
    const out: number[] = [];
    for (let k = 0; k < pts.length; k++) { const dx = c.x - pts[k].x, dy = c.y - pts[k].y; if (dx * dx + dy * dy <= r2) out.push(k); }
    return Int32Array.from(out);
  };
  const lanes = f.samples.map((samples, li) => {
    const in24 = cands.map(c => near(samples, c, 576));
    const in15 = in24.map((ks, c) => ks.filter(k => { const dx = cands[c].x - samples[k].x, dy = cands[c].y - samples[k].y; return dx * dx + dy * dy <= 225; }));
    return { samples, L: f.roads[li].length, n: samples.length, in15, in24, w15: new Int32Array(samples.length), w24: new Int32Array(samples.length) };
  });
  // a pad sees two passes of lane 0 when its first and last Flamer-reach samples are more than 40 apart
  const two = cands.map((_, c) => { const h = lanes[0].in15[c]; return h.length > 0 && lanes[0].samples[h[h.length - 1]].s - lanes[0].samples[h[0]].s > 40 ? 1 : 0; });
  const airIn = cands.map(c => near(f.air, c, 576)), airW = new Int32Array(f.air.length);
  const total = f.roads.reduce((a, r) => a + r.length, 0);
  let twoPass = 0, airHit = 0;
  const add = (c: number, d: 1 | -1) => {
    for (const l of lanes) { for (const k of l.in15[c]) l.w15[k] += d; for (const k of l.in24[c]) l.w24[k] += d; }
    for (const k of airIn[c]) { if (d > 0 ? airW[k]++ === 0 : --airW[k] === 0) airHit += d; }
    twoPass += d * two[c];
  };
  return {
    reset(sel: readonly number[]) {
      for (const l of lanes) { l.w15.fill(0); l.w24.fill(0); }
      airW.fill(0); twoPass = 0; airHit = 0;
      for (const c of sel) add(c, 1);
    },
    swap(out: number, into: number) { add(out, -1); add(into, 1); },
    value() {
      const per = lanes.map((l) => {
        let flame = 0, tesla = 0, gap = 0, run = 0;
        for (let k = 0; k < l.n; k++) {
          const w15 = l.w15[k];
          if (w15) flame++;
          tesla += Math.min(3, l.w24[k]); run = w15 ? 0 : run + 1; gap = Math.max(gap, run);
        }
        return { flame: flame / l.n, gap: gap * l.L / l.n, tesla: tesla / l.n };
      });
      const mean = (k: 'flame' | 'tesla') => per.reduce((a, c, i) => a + c[k] * f.roads[i].length, 0) / total;
      const m = { flame: mean('flame'), tesla: mean('tesla'), air: airHit / f.air.length, gap: Math.max(...per.map(c => c.gap)), twoPass };
      return m.flame * 3 + m.tesla * 0.4 + m.air * 0.5 - m.gap * 0.01 + m.twoPass * 0.03;
    },
  };
}
/**
 * Pads on a fixed road: candidates on a 1.5-unit grid that are individually valid (off the road, off the deck, inside
 * the HUD-safe box, reachable by a cable), then simulated annealing over which candidates to use, never letting two
 * pads overlap. Every state is valid, so the search spends its time on coverage.
 */
function searchPads(f: Field, rng: Rng, n: number, iterations: number, log?: string[]): Pt[] {
  const cands: Pt[] = [];
  for (let y = PAD_BOX.y0; y <= PAD_BOX.y1; y += 1.5) for (let x = PAD_BOX.x0; x <= PAD_BOX.x1; x += 1.5) {
    const p = { x: Math.round(x * 2) / 2, y: Math.round(y * 2) / 2 };
    if (p.x < PAD_BOX.x0 || p.x > PAD_BOX.x1 || p.y < PAD_BOX.y0 || p.y > PAD_BOX.y1) continue;
    if (f.roadDist(p) < PAD_ROAD + 0.8 || Math.hypot(p.x - TURRET.x, p.y - TURRET.y) < NARROW_ROAD.turretR + PAD_R + 2 || !f.reach(p)) continue;
    if (f.roads.some(r => distanceNear(p, r.line, PAD_ROAD) < PAD_ROAD)) continue;
    cands.push(p);
  }
  const least = minPads(n);
  if (cands.length < least) { log?.push(`only ${cands.length} pad spots`); return []; }
  const G2 = PAD_GAP * PAD_GAP;
  const fits = (sel: readonly number[], c: number, skip: number) =>
    sel.every((o, i) => i === skip || (cands[o].x - cands[c].x) ** 2 + (cands[o].y - cands[c].y) ** 2 >= G2);
  // a spaced start: the fullest of a few random packings (a cramped road may hold fewer than n, down to minPads(n))
  let sel: number[] = [];
  for (let k = 0; k < 8 && sel.length < n; k++) {
    const order = cands.map((_, i) => i);
    for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    const pack: number[] = [];
    for (const c of order) if (pack.length < n && fits(pack, c, -1)) pack.push(c);
    if (pack.length > sel.length) sel = pack;
  }
  if (sel.length < least) { log?.push(`${cands.length} spots, ${sel.length} spaced`); return []; }
  n = sel.length;
  const score = coverScorer(f, cands);
  score.reset(sel);
  let cur = score.value(), best = { sel, v: cur };
  for (let it = 0; it < iterations; it++) {
    const T = 0.04 * (1 - it / iterations) + 0.001, i = Math.floor(rng() * n);
    let c: number;
    if (rng() < 0.15) c = Math.floor(rng() * cands.length);
    else { // a nearby candidate
      const p = cands[sel[i]], dx = (rng() - 0.5) * 8, dy = (rng() - 0.5) * 8;
      let bestD = Infinity; c = sel[i];
      for (let k = 0; k < 12; k++) { const q = Math.floor(rng() * cands.length), d = (cands[q].x - p.x - dx) ** 2 + (cands[q].y - p.y - dy) ** 2; if (d < bestD) { bestD = d; c = q; } }
    }
    if (c === sel[i] || !fits(sel, c, i)) continue;
    score.swap(sel[i], c);
    const v = score.value();
    if (v > cur || rng() < Math.exp((v - cur) / T)) { const next = sel.slice(); next[i] = c; sel = next; cur = v; if (v > best.v) best = { sel, v }; }
    else score.swap(c, sel[i]);
  }
  return best.sel.map(i => cands[i]);
}

/** Short pad names from where each pad sits: a third of the field down, and west/centre/east. */
function padNames(pads: readonly Pt[]): string[] {
  const names = pads.map(p => `${p.y < 40 ? 'Upper' : p.y < 70 ? 'Middle' : 'Lower'} ${p.x < 28 ? 'west' : p.x < 52 ? 'centre' : 'east'}`);
  const count = new Map<string, number>();
  return names.map((n) => {
    const total = names.filter(m => m === n).length;
    if (total === 1) return n;
    const k = (count.get(n) ?? 0) + 1; count.set(n, k);
    return `${n} ${k}`;
  });
}

// ---------- validation ----------
/** Problems with a level, empty when it is playable: length band, road clearance, pads, HUD-safe placement. */
export function validateLevel(level: TdLevel): string[] {
  const out: string[] = [];
  const roads = [level.waypoints, ...level.lanes ?? []].map(w => measureRoad(w, level.turretR)), road = roads[0], bridges = level.bridges ?? [];
  const lines = roads.map(r => r.line), reach = reachable(lines, [...bridges, ...level.culverts ?? []], level.roadHalfWidth + SHOULDER + 1.5);
  roads.forEach((r, i) => {
    const which = roads.length > 1 ? `route ${i} ` : '';
    const band = lengthBand(level.roadStyle);
    if (r.length < band.min || r.length > band.max) out.push(`${which}length ${Math.round(r.length)} outside ${band.min}–${band.max}`);
    if (Math.abs(r.walk.at(-1)!.x - level.turret.x) > level.turretR + 1 || Math.abs(r.walk.at(-1)!.y - level.turret.y) > level.turretR + 1) out.push(`${which}road does not reach the turret`);
    if (r.walk.some(p => p.x < level.roadHalfWidth || p.x > FIELD_W - level.roadHalfWidth)) out.push(`${which}road leaves the field`);
    if (i > 0 && crossings(r.walk).length) out.push(`${which}crosses itself`);
  });
  if (roads.length > 1 && bridges.length) out.push('forks and merges have no bridges');
  if (roads.length > 1 && laneClearance(roads) < MIN_SELF_CLEAR) out.push(`routes pass ${laneClearance(roads).toFixed(1)} from each other (min ${MIN_SELF_CLEAR})`);
  const found = crossings(road.walk);
  if (found.length !== bridges.length || found.some(c => !bridges.some(b => Math.hypot(b.x - c.x, b.y - c.y) < 4))) out.push(`crossings ${found.length} but ${bridges.length} bridges`);
  for (const b of bridges) if (Math.hypot(b.x - level.turret.x, b.y - level.turret.y) < level.turretR + 8) out.push('bridge too close to the turret');
  const clear = Math.min(...roads.map(r => selfClearance(r.walk, bridges)));
  if (clear < MIN_SELF_CLEAR) out.push(`road passes ${clear.toFixed(1)} from itself (min ${MIN_SELF_CLEAR})`);
  const minRoad = level.roadHalfWidth + level.shoulder + PAD_R + 1;
  level.pads.forEach((p, i) => {
    if (lines.some(l => distanceToLine(p, l) < minRoad - 1e-6)) out.push(`pad ${i} on the road`);
    if (p.x < PAD_BOX.x0 || p.x > PAD_BOX.x1 || p.y < PAD_BOX.y0 || p.y > PAD_BOX.y1) out.push(`pad ${i} outside the HUD-safe box`);
    if (Math.hypot(p.x - level.turret.x, p.y - level.turret.y) < level.turretR + PAD_R + 2) out.push(`pad ${i} on the turret deck`);
    if (!reach(p)) out.push(`pad ${i} cut off from the turret`);
    level.pads.forEach((q, j) => { if (j > i && Math.hypot(p.x - q.x, p.y - q.y) < PAD_GAP) out.push(`pads ${i} and ${j} overlap`); });
  });
  return out;
}

const mirrorX = (p: Pt): Pt => ({ x: FIELD_W - p.x, y: p.y });

/**
 * A level from a seed: road style (given or seeded), mirrored half the time, narrow-road sizes, searched pads. Retries
 * with derived seeds until the level validates and clears its style's coverage bar (STYLE_FIT), else the best-covered try.
 */
/** Everything an attempt needs, drawn up front so attempts can run independently (and in parallel). */
export interface LevelPlan { seed: number; style: RoadStyle; ground: GroundStyle; nPads: number; attemptSeeds: number[] }
export const MAX_ATTEMPTS = 12;

export function planLevel(seed: number, opts: GenOpts = {}): LevelPlan {
  const top = makeRng(seed >>> 0 || 1);
  const style = opts.style ?? ROAD_STYLES[Math.floor(top() * ROAD_STYLES.length)];
  const ground = opts.ground ?? GROUND_STYLES[Math.floor(top() * GROUND_STYLES.length)];
  const attemptSeeds = Array.from({ length: MAX_ATTEMPTS }, () => Math.floor(top() * 0x7fff_ffff) + 1);
  return { seed, style, ground, nPads: padsFor(style, opts.pads), attemptSeeds };
}

/** One generation attempt (1-based). Null when the attempt is rejected outright. */
export function runAttempt(plan: LevelPlan, attempt: number, opts: GenOpts = {}): { result: Generated; passed: boolean } | null {
  const { seed, style, ground, nPads } = plan;
  const bar = barFor(style, nPads), iterations = opts.iterations ?? 12000, log = opts.log;
  const rng = makeRng(plan.attemptSeeds[attempt - 1]);
  const mirror = rng() < 0.5, built = BUILDERS[style](rng), raw = (Array.isArray(built[0]) ? built : [built]) as Pt[][];
  const lanes = mirror ? raw.map(l => l.map(mirrorX)) : raw, waypoints = lanes[0];
  const roads = lanes.map(l => measureRoad(l, NARROW_ROAD.turretR)), road = roads[0];
  const band = lengthBand(style), short = roads.find(r => r.length < band.min || r.length > band.max);
  if (short) { log?.push(`${style} len ${short.length.toFixed(0)}`); return null; }
  const bridges = crossings(road.walk);
  const samples = roads.map(r => r.walk.filter((_, i) => i % 3 === 0));
  const air = FLYERS.flatMap(a => Array.from({ length: 30 }, (_, i) => ({ x: a.x + (TURRET.x - a.x) * i / 29, y: a.y + (TURRET.y - a.y) * i / 29 })));
  const selfClear = Math.min(...roads.map(r => selfClearance(r.walk, bridges)), laneClearance(roads));
  if (selfClear < MIN_SELF_CLEAR) { log?.push(`${style} clear ${selfClear.toFixed(1)} bridges ${bridges.length}`); return null; }
  const roadDist = roadDistance(roads.map(r => r.line)), culverts = lanes.length > 1 ? placeCulverts(roads, bridges, roadDist) : [];
  const field: Field = { roads, bridges, air, samples, selfClear, roadDist,
    reach: reachable(roads.map(r => r.line), [...bridges, ...culverts], NARROW_ROAD.roadHalfWidth + SHOULDER + 1.5) };
  const pads = searchPads(field, rng, nPads, iterations, opts.log);
  if (pads.length < minPads(nPads)) { log?.push(`${style} no room for ${minPads(nPads)} pads`); return null; }
  const names = padNames(pads);
  const level: TdLevel = {
    id: `gen-${seed}`, name: `${style[0].toUpperCase()}${style.slice(1)} ${seed}`, style: ground, seed, roadStyle: style,
    waypoints, pads: pads.map((p, i) => ({ ...p, name: names[i] })), turret: TURRET, shoulder: SHOULDER,
    hiveMouth: waypoints[0], spawnY: SPAWN_Y, flyerSpawns: FLYERS, bridges, ...NARROW_ROAD,
    ...(lanes.length > 1 ? { lanes: lanes.slice(1) } : {}), ...(culverts.length ? { culverts } : {}),
  };
  const m = metrics(field, pads), problems = validateLevel(level);
  if (problems.length) { log?.push(`${style} ${problems.join('; ')}`); return null; }
  return { result: { level, style, attempts: attempt, metrics: m }, passed: m.flame >= bar.flame && m.gap <= bar.gap };
}

/**
 * Pick the level from attempt outcomes listed in attempt order: the first that passes the bar,
 * else the best-flame fallback (earliest wins ties). Shared by the sequential and parallel paths.
 */
export function pickAttempt(plan: LevelPlan, outcomes: Array<{ result: Generated; passed: boolean } | null>): Generated {
  let fallback: Generated | null = null;
  for (const o of outcomes) {
    if (!o) continue;
    if (o.passed) return o.result;
    if (!fallback || o.result.metrics.flame > fallback.metrics.flame) fallback = o.result;
  }
  if (fallback) return fallback;
  throw new Error(`no valid ${plan.style} level for seed ${plan.seed}`);
}

export function generateLevel(seed: number, opts: GenOpts = {}): Generated {
  const plan = planLevel(seed, opts), outcomes: Array<{ result: Generated; passed: boolean } | null> = [];
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const o = runAttempt(plan, attempt, opts);
    outcomes.push(o);
    if (o?.passed) break;
  }
  return pickAttempt(plan, outcomes);
}
