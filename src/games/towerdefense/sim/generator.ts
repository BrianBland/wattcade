// Seeded level generator: a deliberately drawn road in one of four styles, pads placed by a coverage search, and
// validators. Pure and deterministic (its own seeded rng): no DOM, no Math.random. Findings behind the numbers:
// docs/towerdefense/LEVELS-HANDOFF.md §5 (branch td-ground-spike) and scripts/td-map-lab.
import { makeRng } from '../../../core/rng';
import { NARROW_ROAD, distanceToLine, type TdLevel } from './level';
import { FIELD_H, FIELD_W, PAD_R, splineLine, type Pt } from './road';

export type RoadStyle = 'zigzag' | 'trident' | 'lasso' | 'ring';
export const ROAD_STYLES: readonly RoadStyle[] = ['zigzag', 'trident', 'lasso', 'ring'];
/** Ground kits (docs/towerdefense/ground-kit): the renderer draws a level in its style's kit. */
export const GROUND_STYLES = ['outpost', 'scrapyard', 'badlands', 'volcanic', 'overgrown', 'blight'] as const;
export type GroundStyle = typeof GROUND_STYLES[number];

const TURRET: Pt = { x: 40, y: 101 };
const FLYERS: Pt[] = [{ x: 6, y: -6 }, { x: 40, y: -6 }, { x: 74, y: -6 }];
const HIVE: Pt[] = [{ x: 74, y: -40 }, { x: 71, y: -24 }];
const SPAWN_Y = -10;
const SHOULDER = 1;
/** Pads stay where both orientations' HUDs leave them visible (short landscape is the tightest). */
export const PAD_BOX = { x0: PAD_R + 1, x1: 71, y0: 14, y1: 97 };
/** Walked length band (level 0 is 257): long roads need more pads or faster aliens. */
export const LENGTH_BAND = { min: 230, max: 335 };
/** Separate road passes keep this far apart (centre lines), away from bridges: a visible strip of ground between. */
const MIN_SELF_CLEAR = 13;
/** A level may hold fewer than the 12 pads asked for when its road leaves less room, but never fewer than this. */
export const MIN_PADS = 10;
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

const BUILDERS: Record<RoadStyle, (rng: Rng) => Pt[]> = { zigzag, trident, lasso, ring };

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

/**
 * Cells (2-unit grid over the field) that a power cable can reach from the turret without crossing the road; it may
 * pass under a bridge deck. Pads must sit on reachable ground.
 */
function reachable(line: readonly Pt[], bridges: readonly Pt[], clear: number): (p: Pt) => boolean {
  const S = 2, X0 = -10, Y0 = -16, W = Math.ceil((FIELD_W + 22) / S) + 1, H = Math.ceil((FIELD_H + 22) / S) + 1;
  const at = (i: number, j: number): Pt => ({ x: X0 + i * S, y: Y0 + j * S });
  const open = new Uint8Array(W * H), seen = new Uint8Array(W * H);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const p = at(i, j);
    open[j * W + i] = distanceToLine(p, line) >= clear || Math.hypot(p.x - TURRET.x, p.y - TURRET.y) < NARROW_ROAD.turretR
      || bridges.some(b => Math.hypot(b.x - p.x, b.y - p.y) < clear * 1.5 + 3) ? 1 : 0; // a cable may pass under a deck
  }
  const start = Math.round((TURRET.y - Y0) / S) * W + Math.round((TURRET.x - X0) / S), stack = [start];
  seen[start] = 1;
  while (stack.length) {
    const q = stack.pop()!, i = q % W, j = (q - i) / W;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ni = i + di, nj = j + dj, n = nj * W + ni;
      if (ni < 0 || nj < 0 || ni >= W || nj >= H || seen[n] || !open[n]) continue;
      seen[n] = 1; stack.push(n);
    }
  }
  return (p) => {
    const i = Math.round((p.x - X0) / S), j = Math.round((p.y - Y0) / S);
    return i >= 0 && j >= 0 && i < W && j < H && seen[j * W + i] === 1;
  };
}

// ---------- pads ----------
export interface LevelMetrics {
  length: number; flame: number; gap: number; tesla: number; air: number; twoPass: number; selfClear: number; bridges: number;
}
interface Field { road: Road; bridges: Pt[]; air: Pt[]; reach: (p: Pt) => boolean; samples: RoadPt[]; roadDist: (p: Pt) => number; selfClear: number }

/** Distance to the road centre line on a ½-unit grid (rasterised once per road; exact enough for pad clearance). */
function roadDistance(line: readonly Pt[], cap = 20): (p: Pt) => number {
  const S = 0.5, X0 = -6, Y0 = -14, W = Math.ceil((FIELD_W + 12) / S) + 1, H = Math.ceil((FIELD_H + 20) / S) + 1;
  const d = new Float32Array(W * H).fill(cap), r = Math.ceil(cap / S);
  for (const p of line) {
    const cx = Math.round((p.x - X0) / S), cy = Math.round((p.y - Y0) / S);
    for (let j = Math.max(0, cy - r); j <= Math.min(H - 1, cy + r); j++) for (let i = Math.max(0, cx - r); i <= Math.min(W - 1, cx + r); i++) {
      const q = j * W + i, dist = Math.hypot(X0 + i * S - p.x, Y0 + j * S - p.y);
      if (dist < d[q]) d[q] = dist;
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
function metrics(f: Field, pads: readonly Pt[]): LevelMetrics {
  const { samples } = f, L = f.road.length;
  const n = pads.length, first = new Float64Array(n).fill(-1), last = new Float64Array(n);
  let flame = 0, tesla = 0, gap = 0, run = 0, air = 0;
  for (const p of samples) {
    let w15 = 0, w24 = 0;
    for (let i = 0; i < n; i++) {
      const dx = pads[i].x - p.x, dy = pads[i].y - p.y, d2 = dx * dx + dy * dy;
      if (d2 <= 576) { w24++; if (d2 <= 225) { w15++; if (first[i] < 0) first[i] = p.s; last[i] = p.s; } }
    }
    if (w15) flame++;
    tesla += Math.min(3, w24); run = w15 ? 0 : run + 1; gap = Math.max(gap, run);
  }
  for (const p of f.air) for (const q of pads) { const dx = q.x - p.x, dy = q.y - p.y; if (dx * dx + dy * dy <= 576) { air++; break; } }
  air /= f.air.length;
  let twoPass = 0;
  for (let i = 0; i < n; i++) if (first[i] >= 0 && last[i] - first[i] > 40) twoPass++;
  return { length: Math.round(L), flame: flame / samples.length, gap: gap * L / samples.length, tesla: tesla / samples.length, air, twoPass,
    selfClear: f.selfClear, bridges: f.bridges.length };
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
    if (distanceToLine(p, f.road.line) < PAD_ROAD) continue;
    cands.push(p);
  }
  if (cands.length < MIN_PADS) { log?.push(`only ${cands.length} pad spots`); return []; }
  const G2 = PAD_GAP * PAD_GAP;
  const fits = (sel: readonly number[], c: number, skip: number) =>
    sel.every((o, i) => i === skip || (cands[o].x - cands[c].x) ** 2 + (cands[o].y - cands[c].y) ** 2 >= G2);
  // a spaced start: the fullest of a few random packings (a cramped road may hold fewer than n, down to MIN_PADS)
  let sel: number[] = [];
  for (let k = 0; k < 8 && sel.length < n; k++) {
    const order = cands.map((_, i) => i);
    for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    const pack: number[] = [];
    for (const c of order) if (pack.length < n && fits(pack, c, -1)) pack.push(c);
    if (pack.length > sel.length) sel = pack;
  }
  if (sel.length < MIN_PADS) { log?.push(`${cands.length} spots, ${sel.length} spaced`); return []; }
  n = sel.length;
  const value = (s: readonly number[]) => {
    const m = metrics(f, s.map(i => cands[i]));
    return m.flame * 3 + m.tesla * 0.4 + m.air * 0.5 - m.gap * 0.01 + m.twoPass * 0.03;
  };
  let cur = value(sel), best = { sel, v: cur };
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
    const next = sel.slice(); next[i] = c;
    const v = value(next);
    if (v > cur || rng() < Math.exp((v - cur) / T)) { sel = next; cur = v; if (v > best.v) best = { sel, v }; }
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
  const road = measureRoad(level.waypoints, level.turretR), bridges = level.bridges ?? [];
  const reach = reachable(road.line, bridges, level.roadHalfWidth + SHOULDER + 1.5);
  if (road.length < LENGTH_BAND.min || road.length > LENGTH_BAND.max) out.push(`length ${Math.round(road.length)} outside ${LENGTH_BAND.min}–${LENGTH_BAND.max}`);
  if (Math.abs(road.walk.at(-1)!.x - level.turret.x) > level.turretR + 1 || Math.abs(road.walk.at(-1)!.y - level.turret.y) > level.turretR + 1) out.push('road does not reach the turret');
  for (const p of road.walk) if (p.x < level.roadHalfWidth || p.x > FIELD_W - level.roadHalfWidth) { out.push('road leaves the field'); break; }
  const found = crossings(road.walk);
  if (found.length !== bridges.length || found.some(c => !bridges.some(b => Math.hypot(b.x - c.x, b.y - c.y) < 4))) out.push(`crossings ${found.length} but ${bridges.length} bridges`);
  for (const b of bridges) if (Math.hypot(b.x - level.turret.x, b.y - level.turret.y) < level.turretR + 8) out.push('bridge too close to the turret');
  const clear = selfClearance(road.walk, bridges);
  if (clear < MIN_SELF_CLEAR) out.push(`road passes ${clear.toFixed(1)} from itself (min ${MIN_SELF_CLEAR})`);
  const minRoad = level.roadHalfWidth + level.shoulder + PAD_R + 1;
  level.pads.forEach((p, i) => {
    if (distanceToLine(p, road.line) < minRoad - 1e-6) out.push(`pad ${i} on the road`);
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
 * with derived seeds until the level validates and its coverage clears the bar (Flamer reach ≥ 88%, gap ≤ 22).
 */
export function generateLevel(seed: number, opts: GenOpts = {}): Generated {
  const top = makeRng(seed >>> 0 || 1);
  const style = opts.style ?? ROAD_STYLES[Math.floor(top() * ROAD_STYLES.length)];
  const ground = opts.ground ?? GROUND_STYLES[Math.floor(top() * GROUND_STYLES.length)];
  const nPads = opts.pads ?? 12, iterations = opts.iterations ?? 12000, log = opts.log;
  let fallback: Generated | null = null;
  for (let attempt = 1; attempt <= 12; attempt++) {
    const rng = makeRng(Math.floor(top() * 0x7fff_ffff) + 1);
    const mirror = rng() < 0.5, raw = BUILDERS[style](rng), waypoints = mirror ? raw.map(mirrorX) : raw;
    const road = measureRoad(waypoints, NARROW_ROAD.turretR);
    if (road.length < LENGTH_BAND.min || road.length > LENGTH_BAND.max) { log?.push(`${style} len ${road.length.toFixed(0)}`); continue; }
    const bridges = crossings(road.walk);
    const samples = road.walk.filter((_, i) => i % 3 === 0);
    const air = FLYERS.flatMap(a => Array.from({ length: 30 }, (_, i) => ({ x: a.x + (TURRET.x - a.x) * i / 29, y: a.y + (TURRET.y - a.y) * i / 29 })));
    const selfClear = selfClearance(road.walk, bridges);
    if (selfClear < MIN_SELF_CLEAR) { log?.push(`${style} clear ${selfClear.toFixed(1)} bridges ${bridges.length}`); continue; }
    const field: Field = { road, bridges, air, samples, selfClear, roadDist: roadDistance(road.line),
      reach: reachable(road.line, bridges, NARROW_ROAD.roadHalfWidth + SHOULDER + 1.5) };
    const pads = searchPads(field, rng, nPads, iterations, opts.log);
    if (pads.length < MIN_PADS) { log?.push(`${style} no room for ${MIN_PADS} pads`); continue; }
    const names = padNames(pads);
    const level: TdLevel = {
      id: `gen-${seed}`, name: `${style[0].toUpperCase()}${style.slice(1)} ${seed}`, style: ground, seed, roadStyle: style,
      waypoints, pads: pads.map((p, i) => ({ ...p, name: names[i] })), turret: TURRET, shoulder: SHOULDER,
      hiveMouth: waypoints[0], spawnY: SPAWN_Y, flyerSpawns: FLYERS, bridges, ...NARROW_ROAD,
    };
    const m = metrics(field, pads), problems = validateLevel(level);
    const result = { level, style, attempts: attempt, metrics: m };
    if (problems.length) { log?.push(`${style} ${problems.join('; ')}`); continue; }
    if (m.flame >= 0.88 && m.gap <= 22) return result;
    if (!fallback || m.flame > fallback.metrics.flame) fallback = result;
  }
  if (fallback) return fallback;
  throw new Error(`no valid ${style} level for seed ${seed}`);
}
