// Sparse voxel grid: 32³ chunks of palette indices (0 = empty). Integer voxel coords; `size` metres per voxel.
export const CHUNK = 32;
const OFF = 512; // chunk coords in [-512, 511] on each axis

export class VoxelGrid {
  readonly chunks = new Map<number, Uint8Array>();
  constructor(readonly size: number, readonly origin: readonly [number, number, number] = [0, 0, 0]) {}

  static key(cx: number, cy: number, cz: number): number { return ((cx + OFF) * 1024 + (cy + OFF)) * 1024 + (cz + OFF); }
  static unkey(k: number): [number, number, number] {
    const cz = (k % 1024) - OFF, r = Math.floor(k / 1024);
    return [Math.floor(r / 1024) - OFF, (r % 1024) - OFF, cz];
  }

  get(x: number, y: number, z: number): number {
    const c = this.chunks.get(VoxelGrid.key(x >> 5, y >> 5, z >> 5));
    return c ? c[((x & 31) * CHUNK + (y & 31)) * CHUNK + (z & 31)] : 0;
  }

  set(x: number, y: number, z: number, v: number): void {
    const k = VoxelGrid.key(x >> 5, y >> 5, z >> 5);
    let c = this.chunks.get(k);
    if (!c) { if (!v) return; c = new Uint8Array(CHUNK * CHUNK * CHUNK); this.chunks.set(k, c); }
    c[((x & 31) * CHUNK + (y & 31)) * CHUNK + (z & 31)] = v;
  }

  /** Voxel index containing world coordinate w on axis a. */
  vi(w: number, a: 0 | 1 | 2): number { return Math.floor((w - this.origin[a]) / this.size); }
  /** World coordinate of the low corner of voxel index i on axis a. */
  wc(i: number, a: 0 | 1 | 2): number { return this.origin[a] + i * this.size; }

  /** Fill a vertical run [y0, y1] (inclusive voxel indices). */
  column(x: number, z: number, y0: number, y1: number, v: number | ((y: number) => number)): void {
    for (let y = y0; y <= y1; y++) this.set(x, y, z, typeof v === 'number' ? v : v(y));
  }

  box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, v: number): void {
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) this.set(x, y, z, v);
  }

  /** World-space box (metres); fills every voxel whose centre lies inside. */
  wbox(min: readonly number[], max: readonly number[], v: number): void {
    const s = this.size, o = this.origin;
    const lo = [0, 1, 2].map((a) => Math.ceil((min[a] - o[a]) / s - 0.5));
    const hi = [0, 1, 2].map((a) => Math.floor((max[a] - o[a]) / s - 0.5));
    this.box(lo[0], lo[1], lo[2], hi[0], hi[1], hi[2], v);
  }

  /** World-space ellipsoid. */
  wellipsoid(c: readonly number[], r: readonly number[], v: number | ((x: number, y: number, z: number) => number)): void {
    const s = this.size, o = this.origin;
    const lo = [0, 1, 2].map((a) => Math.floor((c[a] - r[a] - o[a]) / s));
    const hi = [0, 1, 2].map((a) => Math.ceil((c[a] + r[a] - o[a]) / s));
    for (let x = lo[0]; x <= hi[0]; x++) for (let y = lo[1]; y <= hi[1]; y++) for (let z = lo[2]; z <= hi[2]; z++) {
      const dx = (o[0] + (x + 0.5) * s - c[0]) / r[0], dy = (o[1] + (y + 0.5) * s - c[1]) / r[1], dz = (o[2] + (z + 0.5) * s - c[2]) / r[2];
      if (dx * dx + dy * dy + dz * dz <= 1) this.set(x, y, z, typeof v === 'number' ? v : v(x, y, z));
    }
  }

  /** World-space capsule/segment of radius r (thick line). */
  wsegment(a: readonly number[], b: readonly number[], r: number, v: number): void {
    const s = this.size, o = this.origin;
    const lo = [0, 1, 2].map((i) => Math.floor((Math.min(a[i], b[i]) - r - o[i]) / s));
    const hi = [0, 1, 2].map((i) => Math.ceil((Math.max(a[i], b[i]) + r - o[i]) / s));
    const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], dd = d[0] * d[0] + d[1] * d[1] + d[2] * d[2] || 1;
    for (let x = lo[0]; x <= hi[0]; x++) for (let y = lo[1]; y <= hi[1]; y++) for (let z = lo[2]; z <= hi[2]; z++) {
      const p = [o[0] + (x + 0.5) * s - a[0], o[1] + (y + 0.5) * s - a[1], o[2] + (z + 0.5) * s - a[2]];
      const t = Math.max(0, Math.min(1, (p[0] * d[0] + p[1] * d[1] + p[2] * d[2]) / dd));
      const qx = p[0] - d[0] * t, qy = p[1] - d[1] * t, qz = p[2] - d[2] * t;
      if (qx * qx + qy * qy + qz * qz <= r * r) this.set(x, y, z, v);
    }
  }

  count(): number { let n = 0; for (const c of this.chunks.values()) for (let i = 0; i < c.length; i++) if (c[i]) n++; return n; }
}
