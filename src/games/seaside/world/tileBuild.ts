// Pure terrain-tile builder (no three.js, no DOM): runs on the main thread or inside tileWorker.ts.
import { VoxelGrid } from '../voxel/grid';
import { meshChunkGreedy } from '../voxel/greedy';
import { mergeMeshData } from '../voxel/merge';
import type { MeshData } from '../voxel/mesh';
import { COAST, COAST_FOLD, fillTerrain } from './coast';
import type { SunShadow } from './sunShadow';

export interface TileParams { res: number; skirt: number; flatAOFrom: number }
export interface TileData { land: MeshData | null; water: MeshData | null; ms: number }

const WATER = new Set([COAST.idx.sea, COAST.idx.sea2, COAST.idx.deep, COAST.idx.shallow, COAST.idx.foam, COAST.idx.foam2, COAST.idx.kelp, COAST.idx.kelp2]);
export const isWater = (v: number) => WATER.has(v);

export function buildTile(x0: number, z0: number, S: number, p: TileParams, sun: SunShadow | null): TileData {
  const t0 = performance.now();
  const s = S / p.res;
  const g = new VoxelGrid(s, [x0, 0, z0]);
  fillTerrain(g, { x0, x1: x0 + S, z0, z1: z0 + S }, null, { lines: s <= 0.25, skipSea: s > 2, scrub: s <= 2, skirt: p.skirt });
  const base = { palette: COAST.linear, greedy: true, remap: COAST_FOLD, flatAO: s >= p.flatAOFrom,
    ...(sun ? { sunVis: (x: number, y: number, z: number) => sun.vis(x, y + s, z, Math.max(2 * s, 0.25)) } : {}) };
  const keys = [...g.chunks.keys()];
  const land = mergeMeshData(keys.map((k) => meshChunkGreedy(g, k, { ...base, include: (v) => !WATER.has(v) })));
  const water = mergeMeshData(keys.map((k) => meshChunkGreedy(g, k, { ...base, include: (v) => WATER.has(v) })));
  return { land, water, ms: performance.now() - t0 };
}
