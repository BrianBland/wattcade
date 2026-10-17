// Power cables from under the turret deck to each pad, routed around the road (never across it). The road runs from
// the hive to the turret, so it splits the ground into two sides that both touch the turret: every pad is reachable.
// Pure and deterministic: a grid search on world units, then simplification and smoothing that keep the clearance.
import { PAD_R, ROAD, ROAD_HALF_WIDTH, ROAD_PADS, SHOULDER, TURRET, TURRET_R, type Pt } from '../sim/road';

/** Cables keep this far from the road's centre line (road + shoulder + a margin), and clear of other pads. */
export const CABLE_ROAD_CLEAR = ROAD_HALF_WIDTH + SHOULDER + 1.5;
const PAD_CLEAR = PAD_R + 1.4;
const STEP = 0.5;
const BOX = { x0: -10, y0: -16, x1: 92, y1: 118 };
const W = Math.round((BOX.x1 - BOX.x0) / STEP) + 1, H = Math.round((BOX.y1 - BOX.y0) / STEP) + 1;
const cell = (x: number, y: number) => Math.round((y - BOX.y0) / STEP) * W + Math.round((x - BOX.x0) / STEP);
const at = (i: number): Pt => ({ x: BOX.x0 + (i % W) * STEP, y: BOX.y0 + Math.floor(i / W) * STEP });

/** `through`: pads whose clearing the cable has to pass under (the tower there hides it); usually none. */
export interface CableRoute { pad: number; pts: Pt[]; length: number; through: number[] }

/** Distance from each grid cell to the road centre line, capped (rasterised from the road samples). */
function roadDistance(cap: number): Float32Array {
  const d = new Float32Array(W * H).fill(cap);
  for (const p of ROAD) {
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
function clear(pts: readonly Pt[], pad: number, through: ReadonlySet<number> = new Set()): boolean {
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) * 4));
    for (let j = 0; j <= n; j++) {
      const p = { x: a.x + (b.x - a.x) * j / n, y: a.y + (b.y - a.y) * j / n };
      if (Math.hypot(p.x - TURRET.x, p.y - TURRET.y) < TURRET_R - 1) continue; // under the deck
      if (Math.hypot(p.x - ROAD_PADS[pad].x, p.y - ROAD_PADS[pad].y) < PAD_R) continue; // under its own tower
      if (distanceToLine(p, ROAD) < CABLE_ROAD_CLEAR - 0.6) return false;
      if (ROAD_PADS.some((q, k) => k !== pad && !through.has(k) && Math.hypot(p.x - q.x, p.y - q.y) < PAD_CLEAR - 0.6)) return false;
    }
  }
  return true;
}
/** Ramer–Douglas–Peucker, keeping only simplifications that stay clear. */
function simplify(pts: Pt[], tol: number, pad: number, through: ReadonlySet<number>): Pt[] {
  if (pts.length < 3) return pts;
  const a = pts[0], b = pts[pts.length - 1];
  let worst = 0, at = 0;
  for (let i = 1; i < pts.length - 1; i++) { const d = distanceToLine(pts[i], [a, b]); if (d > worst) { worst = d; at = i; } }
  if (worst <= tol && clear([a, b], pad, through)) return [a, b];
  if (at === 0) at = Math.floor(pts.length / 2);
  return [...simplify(pts.slice(0, at + 1), tol, pad, through).slice(0, -1), ...simplify(pts.slice(at), tol, pad, through)];
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

let cached: CableRoute[] | null = null;
/** One cable per pad, turret centre → pad centre (both ends sit under machinery). */
export function cableRoutes(): CableRoute[] {
  if (cached) return cached;
  const road = roadDistance(CABLE_ROAD_CLEAR + 4);
  const used = new Float32Array(W * H); // earlier cables: later ones run beside them rather than on top
  const routes: CableRoute[] = [];
  // Near pads first, so the shared trunks out of the turret settle before the long runs.
  const order = ROAD_PADS.map((p, i) => i).sort((a, b) => Math.hypot(ROAD_PADS[a].x - TURRET.x, ROAD_PADS[a].y - TURRET.y) - Math.hypot(ROAD_PADS[b].x - TURRET.x, ROAD_PADS[b].y - TURRET.y));
  for (const pad of order) {
    const goal = ROAD_PADS[pad];
    const blocked = (q: number) => {
      const p = at(q);
      if (Math.hypot(p.x - TURRET.x, p.y - TURRET.y) < TURRET_R - 1) return false;
      if (Math.hypot(p.x - goal.x, p.y - goal.y) < PAD_R) return false;
      return road[q] < CABLE_ROAD_CLEAR;
    };
    // Another pad's clearing is a last resort: some pockets are only reachable past a neighbouring pad.
    const padCost = (q: number) => { const p = at(q); return ROAD_PADS.some((o, k) => k !== pad && Math.hypot(p.x - o.x, p.y - o.y) < PAD_CLEAR) ? 12 : 0; };
    // A* from every cell under the deck to the pad centre.
    const g = new Float32Array(W * H).fill(Infinity), from = new Int32Array(W * H).fill(-1), done = new Uint8Array(W * H);
    const heap: Array<[number, number]> = [];
    const push = (f: number, q: number) => { heap.push([f, q]); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
    const pop = () => { const top = heap[0], last = heap.pop()!; if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
    const h = (q: number) => { const p = at(q); return Math.hypot(p.x - goal.x, p.y - goal.y); };
    const start = cell(TURRET.x, TURRET.y), target = cell(goal.x, goal.y);
    g[start] = 0; push(h(start), start);
    while (heap.length) {
      const [, q] = pop(); if (done[q]) continue; done[q] = 1;
      if (q === target) break;
      const qx = q % W, qy = Math.floor(q / W);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = qx + dx, ny = qy + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const n = ny * W + nx; if (done[n] || blocked(n)) continue;
        // Prefer a little air off the road edge; avoid lying exactly on another cable.
        const edge = Math.max(0, CABLE_ROAD_CLEAR + 2.5 - road[n]) * 0.6;
        const cost = (dx && dy ? Math.SQRT2 : 1) * STEP * (1 + edge + used[n] + padCost(n));
        if (g[q] + cost < g[n]) { g[n] = g[q] + cost; from[n] = q; push(g[n] + h(n), n); }
      }
    }
    const cells: number[] = [];
    for (let q = target; q !== -1; q = from[q]) cells.push(q);
    cells.reverse();
    if (cells[0] !== start) continue; // unreachable: no cable rather than one across the road
    for (const q of cells) {
      used[q] = Math.max(used[q], 2);
      const qx = q % W, qy = Math.floor(q / W);
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const n = (qy + dy) * W + qx + dx; if (n >= 0 && n < used.length) used[n] = Math.max(used[n], 0.3); }
    }
    const raw = cells.map(at);
    const through = new Set(ROAD_PADS.map((o, k) => k).filter((k) => k !== pad && raw.some((p) => Math.hypot(p.x - ROAD_PADS[k].x, p.y - ROAD_PADS[k].y) < PAD_CLEAR)));
    let pts = simplify(raw, 0.6, pad, through);
    for (let i = 0; i < 3; i++) { const smooth = chaikin(pts); if (!clear(smooth, pad, through)) break; pts = smooth; }
    pts[0] = { ...TURRET }; pts[pts.length - 1] = { x: goal.x, y: goal.y };
    const length = pts.slice(1).reduce((s, p, i) => s + Math.hypot(p.x - pts[i].x, p.y - pts[i].y), 0);
    routes.push({ pad, pts, length, through: [...through] });
  }
  cached = routes.sort((a, b) => a.pad - b.pad);
  return cached;
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
