import { describe, expect, it } from 'vitest';
import { VoxelGrid } from '../voxel/grid';
import { boardwalkSurface, corridorCarve, fillCorridor, obsidianSurface, stoneSurface } from '../world/corridor';
import { coastWorld, fillTerrain, roadX } from '../world/coast';
import { TileBuilder } from '../world/tileBuild';
import { flatCorridor, flatWorld, PAL } from './fixtures';

const world = flatWorld(), route = world.route, C = flatCorridor;

/** World-space columns (x, z centres) that hold any voxel, with their top y. */
function columns(g: VoxelGrid) {
  const tops = new Map<string, number>();
  for (const [k, data] of g.chunks) {
    const [cx, cy, cz] = VoxelGrid.unkey(k);
    for (let i = 0; i < data.length; i++) if (data[i]) {
      const lx = Math.floor(i / 1024), ly = Math.floor(i / 32) % 32, lz = i % 32;
      const x = g.wc(cx * 32 + lx, 0) + g.size / 2, z = g.wc(cz * 32 + lz, 2) + g.size / 2, y = g.wc(cy * 32 + ly, 1) + g.size;
      const key = `${x.toFixed(4)},${z.toFixed(4)}`;
      tops.set(key, Math.max(tops.get(key) ?? -Infinity, y));
    }
  }
  return tops;
}

describe('path corridors', () => {
  it('lays a flat surface along a curved route, with no gaps across its width', () => {
    const g = fillCorridor(route, C, 180, 260, 0.125), tops = columns(g);
    for (const [k, top] of tops) {
      const [x, z] = k.split(',').map(Number), n = route.nearest(x, z, 10)!;
      expect(Math.abs(n.d)).toBeLessThanOrEqual(C.half + 1e-6);
      expect(top).toBeGreaterThanOrEqual(n.y - 0.26); // gravel shoulders sit a step down
      expect(top).toBeLessThanOrEqual(n.y + 0.126);
    }
    for (let s = 182; s < 258; s += 3.1) for (let d = -2.8; d <= 2.8; d += 0.7) {
      const p = route.offset(s, d);
      const k = `${(Math.floor(p.x / 0.125) * 0.125 + 0.0625).toFixed(4)},${(Math.floor(p.z / 0.125) * 0.125 + 0.0625).toFixed(4)}`;
      expect(tops.has(k), `column at s=${s} d=${d}`).toBe(true);
    }
  });

  it('splits the corridor into segments that neither overlap nor leave gaps', () => {
    const a = columns(fillCorridor(route, C, 160, 192, 0.25)), b = columns(fillCorridor(route, C, 192, 224, 0.25));
    for (const k of a.keys()) expect(b.has(k)).toBe(false);
    const both = columns(fillCorridor(route, C, 160, 224, 0.25));
    expect(a.size + b.size).toBe(both.size);
  });

  it('carves the terrain: skips columns inside a ground corridor, caps coarse ones touching it', () => {
    const carve = corridorCarve(route, C)!;
    const at = (d: number, s: number) => { const p = route.offset(50, d); return carve.at(p.x, p.z, s); };
    expect(at(0.3, 0.125)).toBe('skip');
    expect(at(C.half + 0.6, 0.125)).toBeNull(); // fine columns beside the path are left alone
    expect(at(C.half + 0.5, 1)).toBeCloseTo(-0.06, 6); // coarse ones are capped just below its surface
    expect(at(C.half + 20, 1)).toBeNull();
    for (const s of [0.125, 1]) {
      const x0 = -16, z0 = -64, S = 32, g = new VoxelGrid(s, [x0, 0, z0]);
      world.terrain.kind === 'height' && world.terrain.fill(g, { x0, x1: x0 + S, z0, z1: z0 + S }, { lines: false, skipSea: false, scrub: false, corridor: carve });
      for (const [k, top] of columns(g)) {
        const [x, z] = k.split(',').map(Number), n = route.nearest(x, z, 40)!;
        if (Math.abs(n.d) + s * 0.5 < C.half) throw new Error(`terrain column inside the path at ${k}`);
        if (s > 0.25 && Math.abs(n.d) - s * 0.75 < C.half) expect(top).toBeLessThanOrEqual(n.y - 0.06);
      }
    }
  });

  it('carves a slab through shape worlds (enclosed scenes) above and below the path', () => {
    const solid = flatWorld({ id: 'solid', terrain: { kind: 'shape', y0: -2, y1: 6, voxel: (_x, y) => (y < 5 ? PAL.idx.rock : 0) } });
    const c = route.at(40), x0 = Math.round(c.x) - 4, z0 = Math.round(c.z) - 4;
    const land = new TileBuilder(solid).build({ kind: 'tile', x0, z0, S: 8 }).parts.find((p) => p.role === 'land')!.mesh;
    let inside = 0;
    for (let q = 0; q < land.positions.length; q += 12) { // quad centroids (greedy quads only have corner vertices)
      const ctr = [0, 1, 2].map((a) => (land.positions[q + a] + land.positions[q + 3 + a] + land.positions[q + 6 + a] + land.positions[q + 9 + a]) / 4);
      const [x, y, z] = ctr, n = route.nearest(x, z, 20)!;
      if (Math.abs(n.d) > C.half - 0.5) continue;
      inside++;
      expect(y <= n.y - C.thickness + 1e-6 || y >= n.y + C.clearance - 0.26).toBe(true);
    }
    expect(inside).toBeGreaterThan(0);
  });

  it('has surface styles for boardwalks, stone paths and obsidian bridges', () => {
    const planks = boardwalkSurface({ plank: [1, 2], gap: 3 }), stone = stoneSurface({ stone: [4, 5], mortar: 6 }), glass = obsidianSurface(1.2, { glass: [7], edge: 8 });
    const seen = new Set<number>();
    for (let s = 0; s < 6; s += 0.05) for (let d = -1.2; d <= 1.2; d += 0.1) for (const f of [planks, stone, glass]) seen.add(f(d, s, 0, 0.3, 0.05).c);
    for (const c of [1, 3, 4, 6, 7, 8]) expect(seen.has(c)).toBe(true);
    expect(glass(1.15, 0, 0, 0.5, 0.05).c).toBe(8);
    expect(glass(0, 0, 0, 0.5, 0.05).c).toBe(7);
  });
});


describe('coast corridor seams', () => {
  it.each([0.125, 0.25, 0.5, 1])('extends cliff walls to carved neighbours at voxel size %s', (s) => {
    const w = coastWorld(), carve = corridorCarve(w.route, w.corridor)!;
    const z0 = -160, x0 = Math.floor((roadX(z0) + 5) / 4) * 4;
    const g = new VoxelGrid(s, [x0, 0, z0]);
    // No tile skirts: the seam must be closed inside tiles as well as at their boundaries.
    fillTerrain(g, { x0, x1: x0 + 8, z0, z1: z0 + 8 }, { lines: true, skipSea: false, scrub: false, corridor: carve });
    let checked = 0;
    for (let x = 0; x < 8 / s; x++) for (let z = 0; z < 8 / s; z++) {
      const wx = g.wc(x, 0) + s / 2, wz = g.wc(z, 2) + s / 2;
      if (carve.at(wx, wz, s) !== null) continue;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = wx + dx * s, nz = wz + dz * s, cap = carve.at(nx, nz, s);
        if (cap === null) continue;
        const bed = cap === 'skip' ? carve.bedAt!(nx, nz, s)! : cap;
        const y = g.vi(bed, 1);
        expect(g.get(x, y, z), `wall at ${wx},${wz} must reach neighbour bed ${bed}`).not.toBe(0);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });
});
