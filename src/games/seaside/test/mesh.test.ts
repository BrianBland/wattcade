import { describe, expect, it } from 'vitest';
import { VoxelGrid } from '../voxel/grid';
import { meshChunk, DEFAULT_AO } from '../voxel/mesh';
import { definePalette } from '../voxel/palette';

const PAL = definePalette({ a: 0xffffff });
const opts = { palette: PAL.linear, jitter: 0 };
const all = (g: VoxelGrid) => [...g.chunks.keys()].reduce((n, k) => n + meshChunk(g, k, opts).faces, 0);

describe('voxel grid', () => {
  it('round-trips negative coordinates across chunk borders', () => {
    const g = new VoxelGrid(0.5);
    g.set(-1, -33, 31, 7); g.set(0, 0, 32, 9);
    expect(g.get(-1, -33, 31)).toBe(7); expect(g.get(0, 0, 32)).toBe(9); expect(g.get(0, 0, 31)).toBe(0);
    expect(g.vi(-0.01, 0)).toBe(-1); expect(g.wc(-1, 0)).toBe(-0.5);
  });
});

describe('meshChunk', () => {
  it('emits 6 faces for a lone voxel, with outward normals and correct winding', () => {
    const g = new VoxelGrid(1); g.set(0, 0, 0, PAL.idx.a);
    const m = meshChunk(g, [...g.chunks.keys()][0], opts);
    expect(m.faces).toBe(6); expect(m.positions.length).toBe(6 * 4 * 3); expect(m.indices.length).toBe(36);
    for (let f = 0; f < 6; f++) {
      const i = m.indices.slice(f * 6, f * 6 + 3), p = (k: number) => [m.positions[k * 3], m.positions[k * 3 + 1], m.positions[k * 3 + 2]];
      const [a, b, c] = [p(i[0]), p(i[1]), p(i[2])];
      const u = b.map((v, j) => v - a[j]), w = c.map((v, j) => v - a[j]);
      const n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
      const nn = [m.normals[i[0] * 3], m.normals[i[0] * 3 + 1], m.normals[i[0] * 3 + 2]];
      expect(n[0] * nn[0] + n[1] * nn[1] + n[2] * nn[2]).toBeGreaterThan(0);
    }
  });
  it('culls shared faces, including across chunk borders', () => {
    const g = new VoxelGrid(1); g.set(31, 0, 0, PAL.idx.a); g.set(32, 0, 0, PAL.idx.a);
    expect(all(g)).toBe(10);
  });
  it('darkens vertices in an inside corner (ambient occlusion)', () => {
    const g = new VoxelGrid(1);
    g.set(0, 0, 0, PAL.idx.a); g.set(1, 1, 0, PAL.idx.a); // a wall voxel above-right of the floor voxel
    const m = meshChunk(g, [...g.chunks.keys()][0], opts);
    const top: number[] = [];
    for (let v = 0; v < m.positions.length / 3; v++) if (m.normals[v * 3 + 1] === 1 && m.positions[v * 3 + 1] === 1) top.push(m.colors[v * 3]);
    expect(Math.min(...top)).toBeCloseTo(DEFAULT_AO[2]); // corner touching the wall: one occluder
    expect(Math.max(...top)).toBeCloseTo(1);
  });
});
