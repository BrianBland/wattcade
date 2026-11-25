// Power cables from under the turret deck to each pad, routed around the road. They never lie on bare road: they cross
// it only along the outside edge of a bridge deck (anchored to its side) or through a culvert. The cables form a tree:
// each pad's cable branches off the nearest cable already laid, so neighbouring towers share a trunk.
// Pure and deterministic: a grid search on world units, then simplification and smoothing that keep the clearance.
import { PAD_R, type Pt } from '../sim/road';
import { LEVEL_0, levelGeometry, type TdLevel } from '../sim/level';
import { decks } from './ground/deck';

/** Cables keep this far from the road's centre line (road + shoulder + a margin), and clear of other pads. */
export const cableRoadClear = (level: TdLevel): number => level.roadHalfWidth + level.shoulder + 1.5;
/** Level 0's cable clearance. */
export const CABLE_ROAD_CLEAR = cableRoadClear(LEVEL_0);

/** The outside edges of a bridge deck, where a cable may be clamped to cross the road beneath. */
export interface DeckSide { line: Pt[]; half: number; under: Pt[]; at: Pt }
/** What a level's cables route around. */
interface CableMap { roads: ReadonlyArray<readonly Pt[]>; pads: readonly Pt[]; turret: Pt; turretR: number; clear: number; culverts: readonly Pt[]; sides: DeckSide[]; loose: boolean }
const PAD_CLEAR = PAD_R + 1.4;
const STEP = 0.5;
const BOX = { x0: -10, y0: -16, x1: 92, y1: 118 };
const W = Math.round((BOX.x1 - BOX.x0) / STEP) + 1, H = Math.round((BOX.y1 - BOX.y0) / STEP) + 1;
const cell = (x: number, y: number) => Math.round((y - BOX.y0) / STEP) * W + Math.round((x - BOX.x0) / STEP);
const at = (i: number): Pt => ({ x: BOX.x0 + (i % W) * STEP, y: BOX.y0 + Math.floor(i / W) * STEP });

/** Projection of p onto a polyline: arc length along it, lateral distance, and the line's length. */
export function project(p: Pt, line: readonly Pt[]): { s: number; d: number; len: number } {
  let best = Infinity, bs = 0, run = 0;
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1], b = line[i], dx = b.x - a.x, dy = b.y - a.y, seg = Math.hypot(dx, dy), len2 = seg * seg || 1;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
    const d = Math.hypot(p.x - a.x - dx * t, p.y - a.y - dy * t);
    if (d < best) { best = d; bs = run + seg * t; }
    run += seg;
  }
  return { s: bs, d: best, len: run };
}
/** The level's bridge decks as cable corridors (the deck's over-pass line, its half width, the road beneath). */
export function deckSides(level: TdLevel): DeckSide[] {
  const geo = levelGeometry(level), clear = cableRoadClear(level);
  return decks(level).map((d) => {
    const under: Pt[] = [];
    for (let s = Math.max(0, d.under[0] - clear * 2); s <= Math.min(geo.roadLength, d.under[1] + clear * 2); s += 1) { const p = geo.roadAt(s); under.push({ x: p.x, y: p.y }); }
    return { line: d.line, half: d.width / 2, under, at: d.at };
  });
}
/**
 * True when p hangs on the outside edge of a bridge deck: beside the deck (not past its ends), hugging the edge
 * while over the road below, and free to step away from the deck once the road below is clear.
 */
export function onDeckSide(sides: readonly DeckSide[], p: Pt, clear: number): boolean {
  for (const k of sides) {
    const { s, d, len } = project(p, k.line);
    if (s < 0.4 || s > len - 0.4 || d < k.half + 0.15) continue;
    if (d <= k.half + 0.95) return true;
    if (d <= clear + 0.6 && distanceToLine(p, k.under) >= clear - 0.6) return true;
  }
  return false;
}
/** Within this of a culvert a cable may run under the road (and, as a last resort, under a bridge deck). */
const underCrossing = (m: CableMap, p: Pt) => (m.loose ? [...m.culverts, ...m.sides.map((k) => k.at)] : m.culverts)
  .some((b) => Math.hypot(b.x - p.x, b.y - p.y) < m.clear * 1.5 + 3);
/** May a cable to `pad` lie at p, given the road distance there? */
const roadOk = (m: CableMap, p: Pt, roadD: number, slack = 0) =>
  roadD >= m.clear - slack || underCrossing(m, p) || onDeckSide(m.sides, p, m.clear);

/** `through`: pads whose clearing the cable has to pass under (the tower there hides it); usually none.
 *  `parent`: the pad whose cable this one branches off (null: straight from the turret), at `branch` units along it;
 *  `pts` is the whole run from the turret, and `pts[ownFrom]` (the branch point) on is this cable's own stretch. */
export interface CableRoute { pad: number; pts: Pt[]; length: number; through: number[]; parent: number | null; branch: number; ownFrom: number; /** had to pass under a bridge deck (no way round, nor along its side) */ underDeck?: boolean }

/** Distance from each grid cell to the road centre line, capped (rasterised from the road samples). */
function roadDistance(m: CableMap, cap: number): Float32Array {
  const d = new Float32Array(W * H).fill(cap);
  for (const p of m.roads.flat()) {
    const r = Math.ceil(cap / STEP);
    const cx = Math.round((p.x - BOX.x0) / STEP), cy = Math.round((p.y - BOX.y0) / STEP);
    for (let j = Math.max(0, cy - r); j <= Math.min(H - 1, cy + r); j++) for (let i = Math.max(0, cx - r); i <= Math.min(W - 1, cx + r); i++) {
      const q = j * W + i, dist = Math.hypot(BOX.x0 + i * STEP - p.x, BOX.y0 + j * STEP - p.y);
      if (dist < d[q]) d[q] = dist;
    }
  }
  return d;
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
/** True when every point along the polyline (sampled every ¼ unit) keeps the road clearance, and doesn't touch any
 * other pad's clearing it didn't already pass under (`through`). */
function clear(m: CableMap, pts: readonly Pt[], pad: number, through: ReadonlySet<number> = new Set()): boolean {
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) * 4));
    for (let j = 0; j <= n; j++) {
      const p = { x: a.x + (b.x - a.x) * j / n, y: a.y + (b.y - a.y) * j / n };
      if (Math.hypot(p.x - m.turret.x, p.y - m.turret.y) < m.turretR - 1) continue; // under the deck
      if (Math.hypot(p.x - m.pads[pad].x, p.y - m.pads[pad].y) < PAD_R) continue; // under its own tower
      if (!roadOk(m, p, Math.min(...m.roads.map((line) => distanceToLine(p, line))), 0.6)) return false;
      if (m.pads.some((q, k) => k !== pad && !through.has(k) && Math.hypot(p.x - q.x, p.y - q.y) < PAD_CLEAR - 0.6)) return false;
    }
  }
  return true;
}
/** Ramer–Douglas–Peucker, keeping only simplifications that stay clear. */
function simplify(m: CableMap, pts: Pt[], tol: number, pad: number, through: ReadonlySet<number>): Pt[] {
  if (pts.length < 3) return pts;
  const a = pts[0], b = pts[pts.length - 1];
  let worst = 0, at = 0;
  for (let i = 1; i < pts.length - 1; i++) { const d = distanceToLine(pts[i], [a, b]); if (d > worst) { worst = d; at = i; } }
  if (worst <= tol && clear(m, [a, b], pad, through)) return [a, b];
  if (at === 0) at = Math.floor(pts.length / 2);
  return [...simplify(m, pts.slice(0, at + 1), tol, pad, through).slice(0, -1), ...simplify(m, pts.slice(at), tol, pad, through)];
}
/** Chaikin corner cutting, endpoints kept. */
function chaikin(pts: Pt[]): Pt[] {
  const out: Pt[] = [pts[0]];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    out.push({ x: a.x * 0.75 + b.x * 0.25, y: a.y * 0.75 + b.y * 0.25 }, { x: a.x * 0.25 + b.x * 0.75, y: a.y * 0.25 + b.y * 0.75 });
  }
  out.push(pts[pts.length - 1]);
  return out;
}
export const polyLength = (pts: readonly Pt[]) => pts.slice(1).reduce((s, p, i) => s + Math.hypot(p.x - pts[i].x, p.y - pts[i].y), 0);
/** The first part of a polyline, `len` units long. */
function headOf(pts: readonly Pt[], len: number): Pt[] {
  const out: Pt[] = [pts[0]];
  let d = len;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], seg = Math.hypot(b.x - a.x, b.y - a.y);
    if (d <= seg) { const k = d / (seg || 1); out.push({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k }); return out; }
    out.push(b); d -= seg;
  }
  return out;
}

/** A* over the grid from the turret and every cell of the cables already laid (`net`: cell → route index + 1). */
function search(m: CableMap, road: Float32Array, net: Int32Array, pad: number): number[] | null {
  const goal = m.pads[pad];
  const blocked = (q: number) => {
    const p = at(q);
    if (Math.hypot(p.x - m.turret.x, p.y - m.turret.y) < m.turretR - 1) return false;
    if (Math.hypot(p.x - goal.x, p.y - goal.y) < PAD_R) return false;
    return !roadOk(m, p, road[q]);
  };
  // Another pad's clearing is a last resort: some pockets are only reachable past a neighbouring pad.
  const padCost = (q: number) => { const p = at(q); return m.pads.some((o, k) => k !== pad && Math.hypot(p.x - o.x, p.y - o.y) < PAD_CLEAR) ? 12 : 0; };
  const g = new Float32Array(W * H).fill(Infinity), from = new Int32Array(W * H).fill(-1), done = new Uint8Array(W * H);
  const heap: Array<[number, number]> = [];
  const push = (f: number, q: number) => { heap.push([f, q]); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
  const pop = () => { const top = heap[0], last = heap.pop()!; if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let k = i; if (l < heap.length && heap[l][0] < heap[k][0]) k = l; if (r < heap.length && heap[r][0] < heap[k][0]) k = r; if (k === i) break; [heap[k], heap[i]] = [heap[i], heap[k]]; i = k; } } return top; };
  const h = (q: number) => { const p = at(q); return Math.hypot(p.x - goal.x, p.y - goal.y); };
  const start = cell(m.turret.x, m.turret.y), target = cell(goal.x, goal.y);
  g[start] = 0; push(h(start), start);
  // Branching off a laid cable costs a little, so a cable joins a trunk when that saves real length, not to save a step.
  for (let q = 0; q < net.length; q++) if (net[q] > 0) { g[q] = 3; push(3 + h(q), q); }
  while (heap.length) {
    const [, q] = pop(); if (done[q]) continue; done[q] = 1;
    if (q === target) break;
    const qx = q % W, qy = Math.floor(q / W);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = qx + dx, ny = qy + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const n = ny * W + nx; if (done[n] || blocked(n)) continue;
      // Prefer a little air off the road edge, except along a bridge's side, where the cable is meant to hug the deck.
      const edge = road[n] >= m.clear ? Math.max(0, m.clear + 2.5 - road[n]) * 0.6 : 0;
      const cost = (dx && dy ? Math.SQRT2 : 1) * STEP * (1 + edge + padCost(n));
      if (g[q] + cost < g[n]) { g[n] = g[q] + cost; from[n] = q; push(g[n] + h(n), n); }
    }
  }
  const cells: number[] = [];
  for (let q = target; q !== -1; q = from[q]) cells.push(q);
  cells.reverse();
  return cells[0] === start || net[cells[0]] > 0 ? cells : null;
}

const cache = new WeakMap<TdLevel, CableRoute[]>();
/** One cable per pad, turret centre → pad centre (both ends sit under machinery), branching off shared trunks. Cached
 * per level. */
export function cableRoutes(level: TdLevel = LEVEL_0): CableRoute[] {
  const hit = cache.get(level);
  if (hit) return hit;
  const tight: CableMap = { roads: levelGeometry(level).roads, pads: level.pads, turret: level.turret, turretR: level.turretR, clear: cableRoadClear(level),
    culverts: level.culverts ?? [], sides: deckSides(level), loose: false };
  const road = roadDistance(tight, tight.clear + 4);
  const net = new Int32Array(W * H); // cells on the cables laid so far: route index + 1
  const routes: CableRoute[] = [];
  // Near pads first, so the trunks out of the turret settle before the long runs branch off them.
  const order = tight.pads.map((p, i) => i).sort((a, b) => Math.hypot(tight.pads[a].x - tight.turret.x, tight.pads[a].y - tight.turret.y) - Math.hypot(tight.pads[b].x - tight.turret.x, tight.pads[b].y - tight.turret.y));
  for (const pad of order) {
    const goal = tight.pads[pad];
    let m = tight, cells = search(m, road, net, pad);
    // Last resort for a pocket the bridge sides can't reach: under the deck, as the generator's reach check allows.
    if (!cells && tight.sides.length) { m = { ...tight, loose: true }; cells = search(m, road, net, pad); }
    if (!cells) continue; // unreachable: no cable rather than one across the road
    const raw = cells.map(at);
    const through = new Set(m.pads.map((o, k) => k).filter((k) => k !== pad && raw.some((p) => Math.hypot(p.x - m.pads[k].x, p.y - m.pads[k].y) < PAD_CLEAR)));
    // the branch point: exactly on the parent cable (or the turret centre)
    const parentIdx = net[cells[0]] - 1, parent = parentIdx >= 0 ? routes[parentIdx] : null;
    let branch = 0;
    if (parent) { branch = Math.max(project(raw[0], parent.pts).s, polyLength(parent.pts.slice(0, parent.ownFrom + 1))); raw[0] = headOf(parent.pts, branch).at(-1)!; } else raw[0] = { ...m.turret };
    let pts = simplify(m, raw, 0.6, pad, through);
    for (let i = 0; i < 3; i++) { const smooth = chaikin(pts); if (!clear(m, smooth, pad, through)) break; pts = smooth; }
    pts[0] = raw[0]; pts[pts.length - 1] = { x: goal.x, y: goal.y };
    const head = parent ? headOf(parent.pts, branch) : [];
    const full = parent ? [...head.slice(0, -1), ...pts] : pts;
    const route: CableRoute = { pad, pts: full, length: polyLength(full), through: [...through], parent: parent?.pad ?? null, branch, ownFrom: parent ? head.length - 1 : 0, ...(m.loose ? { underDeck: true } : {}) };
    routes.push(route);
    // lay the cable's own stretch into the net (not under pads or the turret, nor along a bridge: no splices there)
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i], n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / STEP * 2));
      for (let j = 0; j <= n; j++) {
        const p = { x: a.x + (b.x - a.x) * j / n, y: a.y + (b.y - a.y) * j / n };
        if (m.pads.some((o) => Math.hypot(p.x - o.x, p.y - o.y) < PAD_CLEAR + 0.5) || Math.hypot(p.x - m.turret.x, p.y - m.turret.y) < m.turretR + 1) continue;
        if (road[cell(p.x, p.y)] < m.clear + 0.5) continue;
        net[cell(p.x, p.y)] = routes.length;
      }
    }
  }
  const sorted = routes.sort((a, b) => a.pad - b.pad);
  cache.set(level, sorted);
  return sorted;
}

/** A stretch of cable to draw: its points, how many built towers it feeds, and the pad its route leads to. */
export interface CableRun { pad: number; pts: Pt[]; load: number; /** starts at a splice off another run (a junction box at pts[0]) */ spliced: boolean }
/** The part of a polyline between arc lengths a and b. */
export function sliceArc(pts: readonly Pt[], a: number, b: number): Pt[] {
  const out: Pt[] = [along(pts, polyLength(pts), a / (polyLength(pts) || 1))];
  let run = 0;
  for (let i = 1; i < pts.length; i++) { run += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y); if (run > a + 1e-6 && run < b - 1e-6) out.push(pts[i]); }
  out.push(along(pts, polyLength(pts), b / (polyLength(pts) || 1)));
  return out;
}
/**
 * The stretches feeding the built pads. Each route's own stretch is cut where other cables splice off it; each piece
 * carries the number of built towers it feeds (its own tower if built, plus every splice further along).
 */
export function cableRuns(routes: readonly CableRoute[], built: ReadonlySet<number>): CableRun[] {
  const kids = new Map<number, CableRoute[]>();
  for (const r of routes) if (r.parent != null) kids.set(r.parent, [...kids.get(r.parent) ?? [], r]);
  const memo = new Map<number, number>();
  const fed = (r: CableRoute): number => {
    if (!memo.has(r.pad)) memo.set(r.pad, (built.has(r.pad) ? 1 : 0) + (kids.get(r.pad) ?? []).reduce((s, c) => s + fed(c), 0));
    return memo.get(r.pad)!;
  };
  const out: CableRun[] = [];
  for (const r of routes) {
    if (!fed(r)) continue;
    const start = polyLength(r.pts.slice(0, r.ownFrom + 1)), cuts = (kids.get(r.pad) ?? []).filter((c) => fed(c)).map((c) => c.branch).sort((x, y) => x - y);
    let from = start;
    for (const cut of [...cuts, r.length]) {
      if (cut - from > 0.05) {
        const load = (built.has(r.pad) ? 1 : 0) + (kids.get(r.pad) ?? []).filter((c) => c.branch >= cut - 1e-6).reduce((s, c) => s + fed(c), 0);
        if (load) out.push({ pad: r.pad, pts: sliceArc(r.pts, from, cut), load, spliced: from === start && r.parent != null });
      }
      from = Math.max(from, cut);
    }
  }
  return out;
}

/** A culvert's steel cover: centre, the road's heading there (radians) and its size (across × along the road). */
export interface CulvertPlate { x: number; y: number; angle: number; across: number; along: number }
/** Where the level's culverts cover the road: across its full width plus the shoulders, aligned with the road. */
export function culvertPlates(level: TdLevel): CulvertPlate[] {
  const roads = levelGeometry(level).roads, across = (level.roadHalfWidth + level.shoulder) * 2 + 1.5;
  return (level.culverts ?? []).map((c) => {
    let best = Infinity, angle = 0;
    for (const line of roads) for (let i = 1; i < line.length; i++) {
      const d = distanceToLine(c, [line[i - 1], line[i]]);
      if (d < best) { best = d; angle = Math.atan2(line[i].y - line[i - 1].y, line[i].x - line[i - 1].x); }
    }
    return { x: c.x, y: c.y, angle, across, along: 4 };
  });
}

/** The point a fraction 0..1 of the way along a route. */
export function along(pts: readonly Pt[], length: number, f: number): Pt {
  let d = Math.max(0, Math.min(1, f)) * length;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], seg = Math.hypot(b.x - a.x, b.y - a.y);
    if (d <= seg) { const k = d / (seg || 1); return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k }; }
    d -= seg;
  }
  return pts[pts.length - 1];
}
/** Half crank revolutions crossed between two readings (capped): each sends a power pulse down every cable. */
export function strokeCrossings(previous: number, current: number): number {
  if (!Number.isFinite(previous) || !Number.isFinite(current) || current < previous) return 0;
  return Math.min(8, Math.max(0, Math.floor(current * 2) - Math.floor(previous * 2)));
}
