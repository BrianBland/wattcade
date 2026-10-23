// Greedy voxel mesher: merges coplanar faces of the same palette colour into rectangles.
// Exact with baked AO: faces merge only in directions along which their corner AO is constant — uniform faces merge in
// both directions, faces with a gradient across one axis merge into strips along the other — so the interpolated shading
// matches meshChunk exactly. Per-voxel brightness jitter is NOT
// baked here (it would stop every merge) — use voxelMaterial() to apply it in the fragment shader instead.
import { CHUNK, VoxelGrid } from './grid';
import { DEFAULT_AO, type MeshData, type MeshOpts } from './mesh';

class Buf {
  a: Float32Array; n = 0;
  constructor(cap: number) { this.a = new Float32Array(cap); }
  push3(x: number, y: number, z: number) {
    if (this.n + 3 > this.a.length) { const b = new Float32Array(this.a.length * 2); b.set(this.a); this.a = b; }
    this.a[this.n++] = x; this.a[this.n++] = y; this.a[this.n++] = z;
  }
}

const FACES: Array<[0 | 1 | 2, 1 | -1]> = [[0, 1], [0, -1], [1, 1], [1, -1], [2, 1], [2, -1]];

export function meshChunkGreedy(grid: VoxelGrid, chunkKey: number, opts: MeshOpts): MeshData {
  const data = grid.chunks.get(chunkKey);
  const empty = { positions: new Float32Array(0), normals: new Float32Array(0), colors: new Float32Array(0), indices: new Uint32Array(0), faces: 0 };
  if (!data) return empty;
  const [cx, cy, cz] = VoxelGrid.unkey(chunkKey);
  const base = [cx * CHUNK, cy * CHUNK, cz * CHUNK];
  const s = grid.size, o = grid.origin, pal = opts.palette, aoK = opts.ao ?? DEFAULT_AO;
  const pos = new Buf(4096), nor = new Buf(4096), col = new Buf(4096), sun: number[] = [];
  const idx: number[] = [];
  let faces = 0;
  // mask[i + j*CHUNK]: 0 = no face; otherwise (v) | (occ0<<8) | (occ1<<10) | (occ2<<12) | (occ3<<14) | (canMergeU<<16) | (canMergeW<<17) | (sun<<18)
  const mask = new Int32Array(CHUNK * CHUNK);
  const solid = (x: number, y: number, z: number) => (grid.get(x, y, z) ? 1 : 0);
  const c = [0, 0, 0], q = [0, 0, 0];
  for (const [a, sg] of FACES) {
    const u = ((a + 1) % 3) as 0 | 1 | 2, w = ((a + 2) % 3) as 0 | 1 | 2;
    for (let d = 0; d < CHUNK; d++) {
      // build the mask for this slice
      let any = false;
      for (let j = 0; j < CHUNK; j++) for (let i = 0; i < CHUNK; i++) {
        c[a] = d; c[u] = i; c[w] = j;
        const raw = data[(c[0] * CHUNK + c[1]) * CHUNK + c[2]];
        mask[i + j * CHUNK] = 0;
        if (!raw || (opts.include && !opts.include(raw))) continue;
        const v = opts.remap ? opts.remap[raw] : raw;
        const gx = base[0] + c[0], gy = base[1] + c[1], gz = base[2] + c[2];
        q[0] = gx; q[1] = gy; q[2] = gz; q[a] += sg;
        if (solid(q[0], q[1], q[2])) continue;
        const p0 = q[0], p1 = q[1], p2 = q[2];
        let key = v;
        const occs = [0, 0, 0, 0];
        for (let k = 0; k < 4; k++) {
          const du = k === 1 || k === 2 ? 1 : -1, dw = k >= 2 ? 1 : -1;
          q[0] = p0; q[1] = p1; q[2] = p2; q[u] += du; const s1 = solid(q[0], q[1], q[2]);
          q[u] -= du; q[w] += dw; const s2 = solid(q[0], q[1], q[2]);
          q[u] += du; const sc = solid(q[0], q[1], q[2]);
          const occ = opts.flatAO ? 0 : s1 && s2 ? 3 : s1 + s2 + sc;
          key |= occ << (8 + k * 2); occs[k] = occ;
        }
        // corners: 0 (u0,w0) 1 (u1,w0) 2 (u1,w1) 3 (u0,w1)
        const alongU = occs[0] === occs[1] && occs[3] === occs[2], alongW = occs[0] === occs[3] && occs[1] === occs[2];
        let sq = 3;
        if (opts.sunVis) {
          const fc = [gx + 0.5, gy + 0.5, gz + 0.5]; fc[a] = (sg > 0 ? (a === 0 ? gx : a === 1 ? gy : gz) + 1 : a === 0 ? gx : a === 1 ? gy : gz);
          sq = Math.round(opts.sunVis(o[0] + fc[0] * s, o[1] + fc[1] * s, o[2] + fc[2] * s) * 3);
        }
        mask[i + j * CHUNK] = key | ((alongU ? 1 : 0) << 16) | ((alongW ? 1 : 0) << 17) | (sq << 18);
        any = true;
      }
      if (!any) continue;
      // greedy rectangles; non-uniform-AO faces are 1×1
      for (let j = 0; j < CHUNK; j++) for (let i = 0; i < CHUNK; ) {
        const key = mask[i + j * CHUNK];
        if (!key) { i++; continue; }
        let W = 1, H = 1;
        if (key & (1 << 16)) while (i + W < CHUNK && mask[i + W + j * CHUNK] === key) W++;
        if (key & (1 << 17)) {
          grow: while (j + H < CHUNK) {
            for (let k = 0; k < W; k++) if (mask[i + k + (j + H) * CHUNK] !== key) break grow;
            H++;
          }
        }
        for (let h = 0; h < H; h++) for (let k = 0; k < W; k++) mask[i + k + (j + h) * CHUNK] = 0;
        // emit the quad
        const v = key & 255, occ = [(key >> 8) & 3, (key >> 10) & 3, (key >> 12) & 3, (key >> 14) & 3];
        const plane = base[a] + d + (sg > 0 ? 1 : 0);
        const b0 = pos.n / 3;
        for (let k = 0; k < 4; k++) {
          const cu = k === 1 || k === 2 ? W : 0, cw = k >= 2 ? H : 0;
          const vv = [0, 0, 0]; vv[a] = plane; vv[u] = base[u] + i + cu; vv[w] = base[w] + j + cw;
          pos.push3(o[0] + vv[0] * s, o[1] + vv[1] * s, o[2] + vv[2] * s);
          nor.push3(a === 0 ? sg : 0, a === 1 ? sg : 0, a === 2 ? sg : 0);
          const kk = aoK[3 - occ[k]];
          col.push3(pal[v * 3] * kk, pal[v * 3 + 1] * kk, pal[v * 3 + 2] * kk);
          sun.push(((key >> 18) & 3) / 3);
        }
        const flip = occ[0] + occ[2] > occ[1] + occ[3];
        if (sg > 0) {
          if (flip) idx.push(b0 + 1, b0 + 2, b0 + 3, b0 + 1, b0 + 3, b0);
          else idx.push(b0, b0 + 1, b0 + 2, b0, b0 + 2, b0 + 3);
        } else {
          if (flip) idx.push(b0 + 1, b0 + 3, b0 + 2, b0 + 1, b0, b0 + 3);
          else idx.push(b0, b0 + 2, b0 + 1, b0, b0 + 3, b0 + 2);
        }
        faces++;
        i += W;
      }
    }
  }
  return { positions: pos.a.slice(0, pos.n), normals: nor.a.slice(0, nor.n), colors: col.a.slice(0, col.n), indices: Uint32Array.from(idx), faces, ...(opts.sunVis ? { sunVis: Float32Array.from(sun) } : {}) };
}
