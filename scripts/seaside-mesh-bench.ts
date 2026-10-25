// Run with: node --import tsx scripts/seaside-mesh-bench.ts
// CPU meshing only; excludes grid construction, rendering and GPU uploads.
import { performance } from 'node:perf_hooks';
import { VoxelGrid } from '../src/games/seaside/voxel/grid';
import { meshChunkGreedy } from '../src/games/seaside/voxel/greedy';
import { hash3 } from '../src/games/seaside/voxel/mesh';

const palette = new Float32Array(256 * 3).fill(1);
const slab = new VoxelGrid(0.5);
slab.box(0, 0, 0, 31, 15, 31, 1);
const terrain = new VoxelGrid(0.5);
for (let x = -2; x < 34; x++) for (let z = -2; z < 34; z++) {
  const h = 4 + Math.floor(hash3(x, 0, z) * 8);
  terrain.column(x, z, 0, h, 1);
}
const sparse = new VoxelGrid(0.5);
for (let i = 0; i < 32; i += 4) sparse.set(i, i, i, 1);
for (const [name, grid] of [['slab', slab], ['rough terrain', terrain], ['sparse', sparse]] as const) {
  for (const flatAO of [false, true]) {
    const opts = { palette, flatAO };
    const key = VoxelGrid.key(0, 0, 0);
    for (let i = 0; i < 20; i++) meshChunkGreedy(grid, key, opts);
    const times: number[] = [];
    let faces = 0;
    for (let run = 0; run < 9; run++) {
      const t = performance.now();
      for (let i = 0; i < 20; i++) faces = meshChunkGreedy(grid, key, opts).faces;
      times.push((performance.now() - t) / 20);
    }
    times.sort((a, b) => a - b);
    console.log(`${name}, flatAO=${flatAO}: ${times[4].toFixed(3)} ms/chunk, ${faces} quads`);
  }
}
