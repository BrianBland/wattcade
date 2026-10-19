// Culled-face voxel mesher with baked per-vertex ambient occlusion and per-voxel brightness jitter.
// Pure: returns typed arrays; the Three.js wrapper lives in three.ts.
import { CHUNK, VoxelGrid } from './grid';

export interface MeshData { positions: Float32Array; normals: Float32Array; colors: Float32Array; indices: Uint32Array; faces: number }
export interface MeshOpts {
  /** Linear RGB per palette index, 256 × 3. */
  palette: Float32Array;
  /** ± brightness variation per voxel (0..0.2). Default 0.05. */
  jitter?: number;
  /** Brightness by number of occluders 3..0 (index = 3 − occluders). */
  ao?: readonly [number, number, number, number];
  /** Optional per-palette-index jitter override (e.g. 0 for water). */
  jitterFor?: (v: number) => number | undefined;
}

export const DEFAULT_AO = [0.52, 0.7, 0.86, 1] as const;

class Buf {
  a: Float32Array; n = 0;
  constructor(cap: number) { this.a = new Float32Array(cap); }
  push3(x: number, y: number, z: number) {
    if (this.n + 3 > this.a.length) { const b = new Float32Array(this.a.length * 2); b.set(this.a); this.a = b; }
    this.a[this.n++] = x; this.a[this.n++] = y; this.a[this.n++] = z;
  }
}

/** Integer hash → [0, 1). */
export function hash3(x: number, y: number, z: number): number {
  let h = (x * 374761393 + y * 668265263 + z * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// For each of 6 faces: axis, sign. u/v are the other two axes in cyclic order so u × v = +axis.
const FACES: Array<[0 | 1 | 2, 1 | -1]> = [[0, 1], [0, -1], [1, 1], [1, -1], [2, 1], [2, -1]];

export function meshChunk(grid: VoxelGrid, chunkKey: number, opts: MeshOpts): MeshData {
  const data = grid.chunks.get(chunkKey);
  const [cx, cy, cz] = VoxelGrid.unkey(chunkKey);
  const pos = new Buf(4096), nor = new Buf(4096), col = new Buf(4096);
  const idx: number[] = [];
  const s = grid.size, o = grid.origin, pal = opts.palette, ao = opts.ao ?? DEFAULT_AO, J = opts.jitter ?? 0.05;
  let faces = 0;
  if (!data) return { positions: new Float32Array(0), normals: new Float32Array(0), colors: new Float32Array(0), indices: new Uint32Array(0), faces: 0 };
  const p = [0, 0, 0], q = [0, 0, 0];
  const solid = (x: number, y: number, z: number) => (grid.get(x, y, z) ? 1 : 0);
  for (let lx = 0; lx < CHUNK; lx++) for (let ly = 0; ly < CHUNK; ly++) for (let lz = 0; lz < CHUNK; lz++) {
    const v = data[(lx * CHUNK + ly) * CHUNK + lz];
    if (!v) continue;
    const x = cx * CHUNK + lx, y = cy * CHUNK + ly, z = cz * CHUNK + lz;
    const j = opts.jitterFor?.(v) ?? J;
    const bright = 1 + (hash3(x, y, z) * 2 - 1) * j;
    const r = pal[v * 3] * bright, g = pal[v * 3 + 1] * bright, b = pal[v * 3 + 2] * bright;
    for (const [a, sg] of FACES) {
      p[0] = x; p[1] = y; p[2] = z; p[a] += sg;
      if (solid(p[0], p[1], p[2])) continue;
      const u = ((a + 1) % 3) as 0 | 1 | 2, w = ((a + 2) % 3) as 0 | 1 | 2;
      // corners in (u, w): (0,0) (1,0) (1,1) (0,1)
      const occ = [0, 0, 0, 0];
      for (let c = 0; c < 4; c++) {
        const du = c === 1 || c === 2 ? 1 : -1, dw = c >= 2 ? 1 : -1;
        q[0] = p[0]; q[1] = p[1]; q[2] = p[2]; q[u] += du; const s1 = solid(q[0], q[1], q[2]);
        q[u] -= du; q[w] += dw; const s2 = solid(q[0], q[1], q[2]);
        q[u] += du; const sc = solid(q[0], q[1], q[2]);
        occ[c] = s1 && s2 ? 3 : s1 + s2 + sc;
      }
      const base = pos.n / 3;
      const plane = (sg > 0 ? (a === 0 ? x : a === 1 ? y : z) + 1 : a === 0 ? x : a === 1 ? y : z);
      for (let c = 0; c < 4; c++) {
        const cu = c === 1 || c === 2 ? 1 : 0, cw = c >= 2 ? 1 : 0;
        const vv = [0, 0, 0]; vv[a] = plane; vv[u] = (u === 0 ? x : u === 1 ? y : z) + cu; vv[w] = (w === 0 ? x : w === 1 ? y : z) + cw;
        pos.push3(o[0] + vv[0] * s, o[1] + vv[1] * s, o[2] + vv[2] * s);
        nor.push3(a === 0 ? sg : 0, a === 1 ? sg : 0, a === 2 ? sg : 0);
        const k = ao[3 - occ[c]];
        col.push3(r * k, g * k, b * k);
      }
      // flip the diagonal toward the brighter pair to avoid AO anisotropy
      const flip = occ[0] + occ[2] > occ[1] + occ[3];
      if (sg > 0) {
        if (flip) idx.push(base + 1, base + 2, base + 3, base + 1, base + 3, base);
        else idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
      } else {
        if (flip) idx.push(base + 1, base + 3, base + 2, base + 1, base, base + 3);
        else idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
      }
      faces++;
    }
  }
  return { positions: pos.a.slice(0, pos.n), normals: nor.a.slice(0, nor.n), colors: col.a.slice(0, col.n), indices: Uint32Array.from(idx), faces };
}
