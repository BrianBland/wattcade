import { describe, expect, it } from 'vitest';
import { VoxelGrid } from '../voxel/grid';
import { meshChunk, type MeshData } from '../voxel/mesh';
import { meshChunkGreedy } from '../voxel/greedy';
import { definePalette } from '../voxel/palette';
import { hash2 } from '../voxel/noise';

const PAL = definePalette({ a: 0xff0000, b: 0x00ff00 });
const opts = { palette: PAL.linear, jitter: 0 };

/** Per normal direction: total quad area and area-weighted colour sum (exactness check). */
function summary(ms: MeshData[]) {
  const out = new Map<string, [number, number]>();
  for (const m of ms) for (let f = 0; f < m.positions.length / 12; f++) {
    const v = (k: number) => [0, 1, 2].map((c) => m.positions[(f * 4 + k) * 3 + c]);
    const e1 = v(1).map((x, i) => x - v(0)[i]), e2 = v(3).map((x, i) => x - v(0)[i]);
    const area = Math.hypot(e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]);
    const n = [0, 1, 2].map((c) => m.normals[f * 12 + c]).join(',');
    const col = [0, 1, 2, 3].reduce((s, k) => s + m.colors[(f * 4 + k) * 3] + 2 * m.colors[(f * 4 + k) * 3 + 1], 0) / 4;
    const cur = out.get(n) ?? [0, 0]; out.set(n, [cur[0] + area, cur[1] + area * col]);
  }
  return out;
}

describe('meshChunkGreedy', () => {
  it('merges a flat single-colour slab into one quad per side', () => {
    const g = new VoxelGrid(1);
    g.box(0, 0, 0, 31, 0, 31, PAL.idx.a);
    const k = [...g.chunks.keys()][0];
    expect(meshChunk(g, k, opts).faces).toBe(32 * 32 * 2 + 32 * 4);
    expect(meshChunkGreedy(g, k, opts).faces).toBe(6);
  });
  it('covers exactly the same area with the same shading as the naive mesher on rough terrain', () => {
    const g = new VoxelGrid(0.5);
    for (let x = 0; x < 40; x++) for (let z = 0; z < 40; z++) {
      const h = Math.floor(hash2(x >> 2, z >> 2, 1) * 4 + hash2(x, z, 2) * 1.5);
      for (let y = 0; y <= h; y++) g.set(x, y, z, hash2(x >> 3, z >> 3, 3) < 0.5 ? PAL.idx.a : PAL.idx.b);
    }
    const keys = [...g.chunks.keys()];
    const naive = summary(keys.map((k) => meshChunk(g, k, opts))), greedy = summary(keys.map((k) => meshChunkGreedy(g, k, opts)));
    const gFaces = keys.reduce((n, k) => n + meshChunkGreedy(g, k, opts).faces, 0), nFaces = keys.reduce((n, k) => n + meshChunk(g, k, opts).faces, 0);
    expect(gFaces).toBeLessThan(nFaces * 0.7);
    for (const [n, [area, col]] of naive) {
      expect(greedy.get(n)![0]).toBeCloseTo(area, 6);
      expect(greedy.get(n)![1]).toBeCloseTo(col, 4);
    }
  });
});
