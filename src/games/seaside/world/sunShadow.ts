// Baked terrain self-shadowing for a fixed sun. For every (x, z) we store the "shadow height" S: a point at height y is
// in the sun iff y >= S(x, z). S comes from one sweep over a heightfield toward the sun:
//   S(p) = max(H(q), S(q)) − dist · tan(sun elevation),   q = the point one row sunward of p.
// Several nested levels (fine near the route, coarse for the ridges); each level seeds its sunward edge from the coarser one.
// Static levels cover fixed boxes; patch levels are square patches built lazily wherever tiles ask for them (so a fine
// level can follow any route), each swept over an apron on its sunward side so occluders next door still cast into it.
const NONE = -1e6; // 'no occluder' (finite so interpolation never makes NaN)

export interface ShadowLevel { cell: number; x0: number; x1: number; z0: number; z1: number }
export interface SunShadowData { hx: number; hz: number; slope: number; levels: Array<{ L: ShadowLevel; S: Float32Array }> }
/** A lazily built patch level: `cell` m cells in `size` m patches; tiles with voxels ≤ maxVoxel m use it. */
export interface PatchSpec { cell: number; size: number; maxVoxel: number; /** sunward apron (m), default size / 3 */ apron?: number }
type Height = (x: number, z: number) => number;

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
  private height: Height | null = null;
  private specs: PatchSpec[] = []; // coarsest first
  private patches: Array<Map<number, Level>> = [];
  /** Patch levels swept so far (for stats). */ patchCount = 0;

  /** sun: direction TOWARD the sun. height(x, z): terrain surface (use max(h, sea level) for water). Levels coarsest first. */
  constructor(sun: { x: number; y: number; z: number }, height: Height, levels: ShadowLevel[], patches: PatchSpec[] = []) {
    const hl = Math.hypot(sun.x, sun.z);
    this.hx = sun.x / hl; this.hz = sun.z / hl; this.slope = sun.y / hl;
    if (Math.abs(this.hz) < 0.2) throw new Error('SunShadow sweeps along z; sun must have a z component');
    for (const L of levels) {
      const lv = new Level(L);
      this.sweep(lv, height, (x, z) => this.staticAt(x, z));
      this.levels.unshift(lv);
    }
    this.setPatches(height, patches);
  }

  private setPatches(height: Height, patches: PatchSpec[]) {
    this.height = height;
    this.specs = [...patches].sort((a, b) => b.cell - a.cell);
    this.patches = this.specs.map(() => new Map());
  }

  private staticAt(x: number, z: number): number { for (const c of this.levels) if (c.contains(x, z)) return c.at(x, z); return NONE; }

  /** Shadow height from patch spec j (or the static levels for j < 0), building the patch if needed. */
  private specAt(j: number, x: number, z: number): number {
    if (j < 0) return this.staticAt(x, z);
    const sp = this.specs[j], ix = Math.floor(x / sp.size), iz = Math.floor(z / sp.size), key = ix * 100003 + iz;
    let lv = this.patches[j].get(key);
    if (!lv) {
      const ap = sp.apron ?? sp.size / 3, ax = Math.abs(this.hx / this.hz) * ap;
      const x0 = ix * sp.size, z0 = iz * sp.size;
      lv = new Level({ cell: sp.cell, x0: x0 - (this.hx < 0 ? ax : 0), x1: x0 + sp.size + (this.hx > 0 ? ax : 0), z0: z0 - (this.hz < 0 ? ap : 0), z1: z0 + sp.size + (this.hz > 0 ? ap : 0) });
      this.sweep(lv, this.height!, (qx, qz) => this.specAt(j - 1, qx, qz));
      this.patches[j].set(key, lv);
      this.patchCount++;
      if (this.patches[j].size > 96) this.patches[j].delete(this.patches[j].keys().next().value!); // oldest first
    }
    return lv.at(x, z);
  }

  private sweep(lv: Level, height: Height, coarse: (x: number, z: number) => number) {
    const { cell, x0, z0 } = lv.L, nx = lv.nx, nz = lv.nz;
    const sz = Math.sign(this.hz), step = cell / Math.abs(this.hz), dx = this.hx * step, drop = step * this.slope;
    const H = new Float32Array(nx * nz);
    for (let k = 0; k < nz; k++) for (let i = 0; i < nx; i++) H[k * nx + i] = height(x0 + i * cell, z0 + k * cell);
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
  /** Static levels only; pass the height function and patch specs again to keep building patches. */
  static fromData(d: SunShadowData, height?: Height, patches: PatchSpec[] = []): SunShadow {
    const sh = Object.create(SunShadow.prototype) as SunShadow;
    Object.assign(sh, { hx: d.hx, hz: d.hz, slope: d.slope, levels: d.levels.map((x) => Object.assign(new Level(x.L), { S: x.S })), patchCount: 0 });
    sh.setPatches(height ?? (() => NONE), height ? patches : []);
    return sh;
  }

  /** Shadow height at (x, z) for geometry of voxel size `voxel` (the finest patch level allowed for it): points below it are in shadow. */
  at(x: number, z: number, voxel = Infinity): number {
    for (let j = this.specs.length - 1; j >= 0; j--) if (voxel <= this.specs[j].maxVoxel) return this.specAt(j, x, z);
    return this.staticAt(x, z);
  }

  /** Sun visibility 0..1 for a point, softened over `soft` metres. */
  vis(x: number, y: number, z: number, soft: number, voxel = Infinity): number {
    const d = y - this.at(x, z, voxel);
    return Math.max(0, Math.min(1, d / soft + 0.5));
  }
}
