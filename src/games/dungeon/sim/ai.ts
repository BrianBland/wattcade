// Hero AI helpers (pure). The hero plays itself: it explores, fights, kites and dodges;
// the rider only triggers actions (Strike / Ward / Rally / Potion) and shifts gears.

const DX = [1, -1, 0, 0, 1, 1, -1, -1], DY = [0, 0, 1, -1, 1, -1, 1, -1];
let BUF: { n: number; g: Float64Array; prev: Int32Array; stamp: Uint32Array; shut: Uint32Array; gen: number } | null = null;
/** 8-directional A* from (sx,sy) to (tx,ty) over walkable tiles, then string-pulled (smooth: false keeps every tile).
 *  Returns waypoints (tile centres), excluding the start. */
export function findPath(w: number, h: number, solid: (x: number, y: number) => boolean, sx: number, sy: number, tx: number, ty: number,
  opts: { smooth?: boolean; clearance?: number; /** extra cost per orthogonal wall next to a tile (keeps paths off walls in rooms) */ wallCost?: number } = {}): Array<{ x: number; y: number }> {
  if (sx < 0 || sy < 0 || sx >= w || sy >= h || tx < 0 || ty < 0 || tx >= w || ty >= h) return [];
  const start = sy * w + sx, goal = ty * w + tx;
  if (start === goal) return [];
  // A* on an 8-connected grid: diagonal steps cost sqrt2 and may not cut a wall corner (both orthogonal
  // neighbours must be open). Octile heuristic; ties broken by insertion order, so results are deterministic.
  // scratch buffers reused across calls (stamped per search, so no per-call clearing); single-threaded and deterministic
  const N = w * h;
  if (!BUF || BUF.n < N) BUF = { n: N, g: new Float64Array(N), prev: new Int32Array(N), stamp: new Uint32Array(N), shut: new Uint32Array(N), gen: 0 };
  const B = BUF, gen = ++B.gen, g = B.g, prev = B.prev;
  const seen = (i: number) => B.stamp[i] === gen, touch = (i: number) => { if (B.stamp[i] !== gen) { B.stamp[i] = gen; g[i] = Infinity; prev[i] = -1; } };
  const closed = { get: (i: number) => B.shut[i] === gen, set: (i: number) => { B.shut[i] = gen; } };
  touch(start); touch(goal);
  const heapI: number[] = [], heapF: number[] = [], heapS: number[] = []; let seq = 0;
  const less = (a: number, b: number) => heapF[a] < heapF[b] || (heapF[a] === heapF[b] && heapS[a] < heapS[b]);
  const swap = (a: number, b: number) => { let t = heapI[a]; heapI[a] = heapI[b]; heapI[b] = t; t = heapF[a]; heapF[a] = heapF[b]; heapF[b] = t; t = heapS[a]; heapS[a] = heapS[b]; heapS[b] = t; };
  const push = (i: number, f: number) => {
    let k = heapI.length; heapI.push(i); heapF.push(f); heapS.push(seq++);
    while (k > 0) { const pk = (k - 1) >> 1; if (!less(k, pk)) break; swap(k, pk); k = pk; }
  };
  const pop = () => {
    const top = heapI[0], last = heapI.length - 1; swap(0, last); heapI.pop(); heapF.pop(); heapS.pop();
    for (let k = 0; ;) { const l = 2 * k + 1, r = l + 1; let m = k; if (l < heapI.length && less(l, m)) m = l; if (r < heapI.length && less(r, m)) m = r; if (m === k) break; swap(k, m); k = m; }
    return top;
  };
  const hfn = (x: number, y: number) => { const dx = Math.abs(x - tx), dy = Math.abs(y - ty); return Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy); };
  const open = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && !solid(x, y);
  g[start] = 0; push(start, hfn(sx, sy));
  while (heapI.length) {
    const c = pop(); if (closed.get(c)) continue; closed.set(c);
    if (c === goal) break;
    const cx = c % w, cy = (c - cx) / w;
    for (let d = 0; d < 8; d++) {
      const dx = DX[d], dy = DY[d];
      const nx = cx + dx, ny = cy + dy;
      if (!open(nx, ny)) continue;
      if (dx && dy && (!open(cx + dx, cy) || !open(cx, cy + dy))) continue; // no corner cutting
      const ni = ny * w + nx; if (closed.get(ni)) continue; touch(ni);
      const wc = opts.wallCost ? opts.wallCost * ((open(nx + 1, ny) ? 0 : 1) + (open(nx - 1, ny) ? 0 : 1) + (open(nx, ny + 1) ? 0 : 1) + (open(nx, ny - 1) ? 0 : 1)) : 0;
      const ng = g[c] + (dx && dy ? Math.SQRT2 : 1) + wc;
      if (ng < g[ni]) { g[ni] = ng; prev[ni] = c; push(ni, ng + hfn(nx, ny)); }
    }
  }
  if (!seen(goal) || prev[goal] < 0) return [];
  const out: Array<{ x: number; y: number }> = [];
  for (let c = goal; c !== start; c = prev[c]) out.push({ x: (c % w) + 0.5, y: Math.floor(c / w) + 0.5 });
  out.reverse();
  return opts.smooth === false ? out : smoothPath(out, solid, sx + 0.5, sy + 0.5, opts.clearance ?? 0.3);
}

/** True if a body of radius `r` can travel the straight segment a->b without touching a solid tile. */
export function clearLine(solid: (x: number, y: number) => boolean, ax: number, ay: number, bx: number, by: number, r = 0.3): boolean {
  const d = Math.hypot(bx - ax, by - ay), n = Math.max(1, Math.ceil(d / 0.45)); // < 1 tile per step, and the 4 corners cover the body
  for (let k = 0; k <= n; k++) {
    const x = ax + ((bx - ax) * k) / n, y = ay + ((by - ay) * k) / n;
    if (solid(Math.floor(x - r), Math.floor(y - r)) || solid(Math.floor(x + r), Math.floor(y - r)) || solid(Math.floor(x - r), Math.floor(y + r)) || solid(Math.floor(x + r), Math.floor(y + r))) return false;
  }
  return true;
}

/** String-pulling: keep only the waypoints needed so each leg is a clear straight line (from the start point). */
export function smoothPath(path: Array<{ x: number; y: number }>, solid: (x: number, y: number) => boolean, sx: number, sy: number, r = 0.3): Array<{ x: number; y: number }> {
  if (path.length < 2) return path.slice();
  const out: Array<{ x: number; y: number }> = [];
  let ax = sx, ay = sy, i = 0;
  while (i < path.length) {
    let j = i; // greedy forward: extend the leg while the next waypoint is still in clear line of sight
    while (j + 1 < path.length && clearLine(solid, ax, ay, path[j + 1].x, path[j + 1].y, r)) j++;
    out.push(path[j]); ax = path[j].x; ay = path[j].y; i = j + 1;
  }
  return out;
}

/** Preferred stand-off distance (tiles) from a target, by weapon range and enemy type. */
export function standoff(weaponRange: number, enemy: { kind: string; elite: string | null }): number {
  const reach = Math.min(5, Math.max(1.8, weaponRange * 0.6)); // flamers fight up close
  if (enemy.kind === 'bomber' || enemy.elite === 'volatile') return Math.max(reach, 3);
  if (enemy.kind === 'chaser' || enemy.kind === 'brute') return Math.min(reach, 3.5);
  return reach;
}

/** Safety-net potion: the AI drinks only when very low and the rider hasn't drunk recently, so the rider's Potion stays meaningful. */
export function shouldAutoPotion(hpFrac: number, potions: number, sinceLastPotionS: number, threshold: number, riderGraceS = 10): boolean {
  return potions > 0 && hpFrac < threshold && sinceLastPotionS >= riderGraceS;
}

export type ActionId = 'strike' | 'ward' | 'rally' | 'potion';
export { readyFrac, type Cooldown } from '../../../core/cooldown';

/**
 * Hero move speed from cadence (piecewise linear over `pts`). Normal riding (60-90 rpm) is flat, so style doesn't
 * change the workout; cadence above 90 rpm only pays while the game calls a spin-up.
 */
export function cadenceSpeed(c: number, spinCalled: boolean, pts: Array<[number, number]>): number {
  if (!spinCalled) c = Math.min(c, 90);
  if (c <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) if (c <= pts[i][0]) { const [a, va] = pts[i - 1], [b, vb] = pts[i]; return va + ((vb - va) * (c - a)) / (b - a); }
  return pts[pts.length - 1][1];
}
