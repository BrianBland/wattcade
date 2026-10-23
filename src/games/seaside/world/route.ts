// A ridden route: a polyline resampled from control points, parameterized by arc length s (metres, horizontal).
// Pure (no three.js): used by the streamer, the corridor carver, sun-shadow patches and the camera rail.
// Signed lateral offset d is + to the right of the direction of travel.

export interface RoutePoint { x: number; y: number; z: number }
export interface Nearest { s: number; d: number; y: number; dist: number }

const GROUP = 32; // segments per bounding-box group (distance queries prune by group)

/** Does segment a→b touch the rect [x0, x1] × [z0, z1]? (Liang–Barsky clip) */
function crosses(ax: number, az: number, bx: number, bz: number, x0: number, z0: number, x1: number, z1: number): boolean {
  let t0 = 0, t1 = 1;
  const dx = bx - ax, dz = bz - az;
  for (const [p, q] of [[-dx, ax - x0], [dx, x1 - ax], [-dz, az - z0], [dz, z1 - az]]) {
    if (p === 0) { if (q < 0) return false; continue; }
    const r = q / p;
    if (p < 0) { if (r > t1) return false; if (r > t0) t0 = r; } else { if (r < t0) return false; if (r < t1) t1 = r; }
  }
  return true;
}

export class RouteSpline {
  readonly length: number;
  private xs: Float64Array; private ys: Float64Array; private zs: Float64Array; private ss: Float64Array;
  private groups: Array<{ i0: number; i1: number; x0: number; x1: number; z0: number; z1: number }> = [];
  private cell = 64;
  private hash = new Map<number, number[]>();

  /** `points`: control points in travel order. `step`: resample spacing (m); Catmull-Rom through the controls. */
  constructor(points: ReadonlyArray<readonly [number, number, number]>, step = 4) {
    if (points.length < 2) throw new Error('route needs ≥ 2 points');
    const out: number[][] = [];
    const P = (i: number) => points[Math.max(0, Math.min(points.length - 1, i))];
    for (let i = 0; i < points.length - 1; i++) {
      const a = P(i - 1), b = P(i), c = P(i + 1), d = P(i + 2);
      const n = Math.max(1, Math.ceil(Math.hypot(c[0] - b[0], c[2] - b[2]) / step));
      for (let k = 0; k < n; k++) {
        const t = k / n, t2 = t * t, t3 = t2 * t;
        out.push([0, 1, 2].map((j) => 0.5 * (2 * b[j] + (c[j] - a[j]) * t + (2 * a[j] - 5 * b[j] + 4 * c[j] - d[j]) * t2 + (3 * b[j] - a[j] - 3 * c[j] + d[j]) * t3)));
      }
    }
    out.push([...points[points.length - 1]]);
    const n = out.length;
    this.xs = new Float64Array(n); this.ys = new Float64Array(n); this.zs = new Float64Array(n); this.ss = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      this.xs[i] = out[i][0]; this.ys[i] = out[i][1]; this.zs[i] = out[i][2];
      if (i) this.ss[i] = this.ss[i - 1] + Math.hypot(this.xs[i] - this.xs[i - 1], this.zs[i] - this.zs[i - 1]);
    }
    this.length = this.ss[n - 1];
    for (let i0 = 0; i0 < n - 1; i0 += GROUP) {
      const i1 = Math.min(n - 1, i0 + GROUP);
      let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
      for (let i = i0; i <= i1; i++) { x0 = Math.min(x0, this.xs[i]); x1 = Math.max(x1, this.xs[i]); z0 = Math.min(z0, this.zs[i]); z1 = Math.max(z1, this.zs[i]); }
      this.groups.push({ i0, i1, x0, x1, z0, z1 });
    }
    for (let i = 0; i < n - 1; i++) { // spatial hash of segments, for nearest() within a short radius
      const cx0 = Math.floor(Math.min(this.xs[i], this.xs[i + 1]) / this.cell), cx1 = Math.floor(Math.max(this.xs[i], this.xs[i + 1]) / this.cell);
      const cz0 = Math.floor(Math.min(this.zs[i], this.zs[i + 1]) / this.cell), cz1 = Math.floor(Math.max(this.zs[i], this.zs[i + 1]) / this.cell);
      for (let cx = cx0; cx <= cx1; cx++) for (let cz = cz0; cz <= cz1; cz++) {
        const k = cx * 65536 + cz;
        (this.hash.get(k) ?? this.hash.set(k, []).get(k)!).push(i);
      }
    }
  }

  /** A route sampled from a curve given as x(z), y(z) (the coast road runs along −z). */
  static alongZ(x: (z: number) => number, y: (z: number) => number, z0: number, z1: number, step = 4): RouteSpline {
    const pts: Array<[number, number, number]> = [];
    const n = Math.ceil(Math.abs(z1 - z0) / step), dz = (z1 - z0) / n;
    for (let i = 0; i <= n; i++) { const z = z0 + dz * i; pts.push([x(z), y(z), z]); }
    return new RouteSpline(pts, step);
  }

  private seg(s: number): number {
    const ss = this.ss;
    if (s <= 0) return 0;
    if (s >= this.length) return ss.length - 2;
    let lo = 0, hi = ss.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (ss[m] <= s) lo = m; else hi = m; }
    return lo;
  }

  /** Position at arc length s (clamped to the route). */
  at(s: number, out: RoutePoint = { x: 0, y: 0, z: 0 }): RoutePoint {
    const i = this.seg(s), L = this.ss[i + 1] - this.ss[i] || 1, t = Math.max(0, Math.min(1, (s - this.ss[i]) / L));
    out.x = this.xs[i] + (this.xs[i + 1] - this.xs[i]) * t;
    out.y = this.ys[i] + (this.ys[i + 1] - this.ys[i]) * t;
    out.z = this.zs[i] + (this.zs[i + 1] - this.zs[i]) * t;
    return out;
  }

  /** Horizontal unit tangent (direction of travel) at s. */
  tangent(s: number): { x: number; z: number } {
    const i = this.seg(s), dx = this.xs[i + 1] - this.xs[i], dz = this.zs[i + 1] - this.zs[i], l = Math.hypot(dx, dz) || 1;
    return { x: dx / l, z: dz / l };
  }

  /** Point at s offset `d` metres to the right of travel (y = route y). */
  offset(s: number, d: number): RoutePoint {
    const p = this.at(s), t = this.tangent(s);
    p.x += -t.z * d; p.z += t.x * d;
    return p;
  }

  /** Closest route point to (x, z) within `maxDist` (null when farther). Optional s window restricts the search. */
  nearest(x: number, z: number, maxDist = 64, win?: { s0: number; s1: number }): Nearest | null {
    let best: Nearest | null = null, bd = maxDist * maxDist;
    const visit = (i: number) => {
      if (win && (this.ss[i + 1] < win.s0 || this.ss[i] > win.s1)) return;
      const ax = this.xs[i], az = this.zs[i], dx = this.xs[i + 1] - ax, dz = this.zs[i + 1] - az, L2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2));
      const qx = ax + dx * t, qz = az + dz * t, e2 = (x - qx) ** 2 + (z - qz) ** 2;
      if (e2 > bd) return;
      bd = e2;
      const L = Math.sqrt(L2);
      best = { s: this.ss[i] + (this.ss[i + 1] - this.ss[i]) * t, d: ((x - ax) * -dz + (z - az) * dx) / L, y: this.ys[i] + (this.ys[i + 1] - this.ys[i]) * t, dist: Math.sqrt(e2) };
    };
    const r = Math.ceil(maxDist / this.cell), cx = Math.floor(x / this.cell), cz = Math.floor(z / this.cell);
    const seen = new Set<number>();
    for (let a = cx - r; a <= cx + r; a++) for (let b = cz - r; b <= cz + r; b++) {
      const list = this.hash.get(a * 65536 + b);
      if (list) for (const i of list) if (!seen.has(i)) { seen.add(i); visit(i); }
    }
    return best;
  }

  /** Horizontal distance from the route to the square [x0, x0+S] × [z0, z0+S] (0 when the route crosses it). */
  distToRect(x0: number, z0: number, S: number): number {
    const x1 = x0 + S, z1 = z0 + S;
    const boxD = (ax: number, ax1: number, az: number, az1: number) => Math.hypot(Math.max(0, ax - x1, x0 - ax1), Math.max(0, az - z1, z0 - az1));
    const order = this.groups.map((g) => ({ g, d: boxD(g.x0, g.x1, g.z0, g.z1) })).sort((a, b) => a.d - b.d);
    let best = Infinity;
    for (const { g, d } of order) {
      if (d >= best) break;
      for (let i = g.i0; i < g.i1; i++) {
        // segment-to-rect distance: 0 if the segment crosses it, else min over end points and the rect corners' projections
        const ax = this.xs[i], az = this.zs[i], bx = this.xs[i + 1], bz = this.zs[i + 1];
        let e = crosses(ax, az, bx, bz, x0, z0, x1, z1) ? 0 : Math.min(boxD(ax, ax, az, az), boxD(bx, bx, bz, bz));
        if (e > 0) for (const [cx, cz] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) {
          const dx = bx - ax, dz = bz - az, t = Math.max(0, Math.min(1, ((cx - ax) * dx + (cz - az) * dz) / (dx * dx + dz * dz || 1)));
          const px = ax + dx * t, pz = az + dz * t;
          e = Math.min(e, boxD(px, px, pz, pz));
        }
        if (e < best) best = e;
        if (best === 0) return 0;
      }
    }
    return best;
  }

  /** Horizontal bounding box of the route between s0 and s1. */
  bbox(s0: number, s1: number): { x0: number; x1: number; z0: number; z1: number } {
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    const add = (x: number, z: number) => { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); };
    const a = this.at(s0), b = this.at(s1);
    add(a.x, a.z); add(b.x, b.z);
    for (let i = this.seg(s0) + 1; i <= this.seg(s1); i++) add(this.xs[i], this.zs[i]);
    return { x0, x1, z0, z1 };
  }
}
