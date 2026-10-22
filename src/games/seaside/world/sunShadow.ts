// Baked terrain self-shadowing for a fixed sun. For every (x, z) we store the "shadow height" S: a point at height y is
// in the sun iff y >= S(x, z). S comes from one sweep over a heightfield toward the sun:
//   S(p) = max(H(q), S(q)) − dist · tan(sun elevation),   q = the point one row sunward of p.
// Several nested levels (fine near the route, coarse for the ridges); each level seeds its sunward edge from the coarser one.
const NONE = -1e6; // 'no occluder' (finite so interpolation never makes NaN)

export interface ShadowLevel { cell: number; x0: number; x1: number; z0: number; z1: number }
export interface SunShadowData { hx: number; hz: number; slope: number; levels: Array<{ L: ShadowLevel; S: Float32Array }> }

class Level {
  readonly nx: number; readonly nz: number;
  S: Float32Array;
  constructor(readonly L: ShadowLevel) {
    this.nx = Math.round((L.x1 - L.x0) / L.cell) + 1; this.nz = Math.round((L.z1 - L.z0) / L.cell) + 1;
    this.S = new Float32Array(this.nx * this.nz);
  }
  contains(x: number, z: number) { return x >= this.L.x0 && x <= this.L.x1 && z >= this.L.z0 && z <= this.L.z1; }
  /** Bilinear S at (x, z); caller checks contains(). */
  at(x: number, z: number): number {
    const fx = (x - this.L.x0) / this.L.cell, fz = (z - this.L.z0) / this.L.cell;
    const i = Math.min(this.nx - 2, Math.max(0, Math.floor(fx))), k = Math.min(this.nz - 2, Math.max(0, Math.floor(fz)));
    const tx = Math.min(1, Math.max(0, fx - i)), tz = Math.min(1, Math.max(0, fz - k));
    const a = this.S[k * this.nx + i], b = this.S[k * this.nx + i + 1], c = this.S[(k + 1) * this.nx + i], d = this.S[(k + 1) * this.nx + i + 1];
    return a + (b - a) * tx + (c - a) * tz + (a - b - c + d) * tx * tz;
  }
}

export class SunShadow {
  private levels: Level[] = []; // finest first
  readonly hx: number; readonly hz: number; readonly slope: number;

  /** sun: direction TOWARD the sun. height(x, z): terrain surface (use max(h, sea level) for water). Levels coarsest first. */
  constructor(sun: { x: number; y: number; z: number }, height: (x: number, z: number) => number, levels: ShadowLevel[]) {
    const hl = Math.hypot(sun.x, sun.z);
    this.hx = sun.x / hl; this.hz = sun.z / hl; this.slope = sun.y / hl;
    if (Math.abs(this.hz) < 0.2) throw new Error('SunShadow sweeps along z; sun must have a z component');
    for (const L of levels) {
      const lv = new Level(L);
      this.sweep(lv, height);
      this.levels.unshift(lv);
    }
  }

  private sweep(lv: Level, height: (x: number, z: number) => number) {
    const { cell, x0, z0 } = lv.L, nx = lv.nx, nz = lv.nz;
    const sz = Math.sign(this.hz), step = cell / Math.abs(this.hz), dx = this.hx * step, drop = step * this.slope;
    const H = new Float32Array(nx * nz);
    for (let k = 0; k < nz; k++) for (let i = 0; i < nx; i++) H[k * nx + i] = height(x0 + i * cell, z0 + k * cell);
    const coarse = (x: number, z: number) => { for (const c of this.levels) if (c.contains(x, z)) return c.at(x, z); return NONE; };
    const kStart = sz > 0 ? nz - 1 : 0, kEnd = sz > 0 ? -1 : nz;
    for (let k = kStart; k !== kEnd; k -= sz) {
      const z = z0 + k * cell, prev = k + sz;
      for (let i = 0; i < nx; i++) {
        const x = x0 + i * cell;
        if (prev < 0 || prev >= nz) { lv.S[k * nx + i] = coarse(x, z); continue; } // sunward edge: seed from coarser level
        const fx = i + dx / cell;
        let occ: number;
        if (fx < 0 || fx > nx - 1) occ = Math.max(height(x + dx, z + sz * cell), coarse(x + dx, z + sz * cell));
        else {
          const i0 = Math.floor(fx), t = fx - i0, i1 = Math.min(nx - 1, i0 + 1), r = prev * nx;
          occ = Math.max(H[r + i0] + (H[r + i1] - H[r + i0]) * t, lv.S[r + i0] + (lv.S[r + i1] - lv.S[r + i0]) * t);
        }
        lv.S[k * nx + i] = occ - drop;
      }
    }
  }

  /** Plain data (structured-clone friendly) to rebuild this field in a worker without re-sweeping. */
  serialize(): SunShadowData {
    return { hx: this.hx, hz: this.hz, slope: this.slope, levels: this.levels.map((l) => ({ L: l.L, S: l.S })) };
  }
  static fromData(d: SunShadowData): SunShadow {
    const sh = Object.create(SunShadow.prototype) as SunShadow;
    Object.assign(sh, { hx: d.hx, hz: d.hz, slope: d.slope, levels: d.levels.map((x) => Object.assign(new Level(x.L), { S: x.S })) });
    return sh;
  }

  /** Shadow height at (x, z): points below it are in shadow. */
  at(x: number, z: number): number {
    for (const lv of this.levels) if (lv.contains(x, z)) return lv.at(x, z);
    return NONE;
  }

  /** Sun visibility 0..1 for a point, softened over `soft` metres. */
  vis(x: number, y: number, z: number, soft: number): number {
    const d = y - this.at(x, z);
    return Math.max(0, Math.min(1, d / soft + 0.5));
  }
}
