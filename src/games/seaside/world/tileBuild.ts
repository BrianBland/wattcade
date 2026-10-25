// Pure tile builder (no three.js, no DOM): runs on the main thread or inside tileWorker.ts. Three job kinds:
//   tile  — a quadtree terrain square (heightfield or shape function), corridor carved out
//   road  — a stretch of the path corridor along route distance [s0, s0 + len) at a fixed voxel size
//   props — the route scatter for [s0, s0 + len) (live-shadow casters)
import { VoxelGrid } from '../voxel/grid';
import { meshChunkGreedy } from '../voxel/greedy';
import { mergeMeshData } from '../voxel/merge';
import type { MeshData, MeshOpts } from '../voxel/mesh';
import { corridorCarve, fillCorridor, fillScatter } from './corridor';
import { lodOf, type CorridorCarve, type LodDef, type WorldDef } from './def';
import { meshRoad } from './roadMesh';
import { SunShadow } from './sunShadow';

export type TileJob =
  | { kind: 'tile'; x0: number; z0: number; S: number }
  | { kind: 'road'; s0: number; len: number; voxel: number }
  | { kind: 'props'; s0: number; len: number };

export type PartRole = 'land' | 'water' | 'decor' | 'glow' | 'prop' | 'road';
/** One mesh of a tile: what it is and its voxel size (sets the material). */
export interface TilePart { role: PartRole; voxel: number; mesh: MeshData }
export interface TileData { parts: TilePart[]; ms: number }

const now = () => globalThis.performance?.now() ?? 0;

export class TileBuilder {
  readonly lod: LodDef;
  readonly sun: SunShadow | null;
  private carve: CorridorCarve | null;
  constructor(readonly world: WorldDef) {
    this.lod = lodOf(world);
    this.carve = corridorCarve(world.route, world.corridor);
    const sd = world.sky.sunDir, t = world.terrain;
    this.sun = world.sun && t.kind === 'height' ? new SunShadow({ x: sd[0], y: sd[1], z: sd[2] }, t.height, [world.sun.coarse], world.sun.patches) : null;
  }

  build(job: TileJob): TileData {
    const t0 = now();
    const parts = job.kind === 'tile' ? this.tile(job.x0, job.z0, job.S) : job.kind === 'road' ? this.road(job.s0, job.len, job.voxel) : this.props(job.s0, job.len);
    return { parts, ms: now() - t0 };
  }

  private tile(x0: number, z0: number, S: number): TilePart[] {
    const w = this.world, p = this.lod, s = S / p.res, c = w.corridor;
    const g = new VoxelGrid(s, [x0, 0, z0]);
    const dg = p.decor > 0 && s <= p.decorMax && w.terrain.kind === 'height' ? new VoxelGrid(s / 2, g.origin) : null;
    const nearPath = !!c && w.route.distToRect(x0, z0, S) < c.half + 2 * s + 1;
    if (w.terrain.kind === 'height') {
      w.terrain.fill(g, { x0, x1: x0 + S, z0, z1: z0 + S }, { lines: s <= 0.25, skipSea: s > 2, scrub: s <= 2, skirt: p.skirt,
        corridor: nearPath ? this.carve : null, ...(dg ? { decor: { grid: dg, density: p.decor } } : {}) });
    } else {
      const { y0, y1, voxel } = w.terrain;
      const n = Math.round(S / s), iy0 = Math.floor(y0 / s), iy1 = Math.ceil(y1 / s);
      for (let i = 0; i < n; i++) for (let k = 0; k < n; k++) {
        const wx = x0 + (i + 0.5) * s, wz = z0 + (k + 0.5) * s;
        // the path's carved slab in this column (nothing solid between its bed and its clearance)
        const r = nearPath ? w.route.nearest(wx, wz, c!.half + 0.5) : null;
        const lo = r && Math.abs(r.d) < c!.half + 0.25 ? r.y - c!.thickness : Infinity, hi = r ? r.y + c!.clearance : -Infinity;
        for (let y = iy0; y < iy1; y++) {
          const wy = (y + 0.5) * s;
          if (wy > lo && wy < hi) continue;
          const v = voxel(wx, wy, wz);
          if (v) g.set(i, y, k, v);
        }
      }
    }
    const water = (v: number) => w.isWater(v), glow = (v: number) => !!w.isGlow?.(v);
    const out: TilePart[] = [];
    this.mesh(g, s, true, (v) => !water(v) && !glow(v), 'land', out);
    this.mesh(g, s, true, water, 'water', out);
    if (w.isGlow) this.mesh(g, s, false, glow, 'glow', out);
    if (dg) this.mesh(dg, dg.size, true, () => true, 'decor', out);
    return out;
  }

  private road(s0: number, len: number, voxel: number): TilePart[] {
    const out: TilePart[] = [];
    const w = this.world, c = w.corridor;
    if (!c) return out;
    const end = s0 + len;
    if (c.smooth && s0 < c.smooth.end) {
      const sun = this.sun;
      const mesh = meshRoad(w.route, c, s0, end, w.palette.linear,
        sun ? (x, y, z) => sun.vis(x, y + voxel, z, Math.max(2 * voxel, 0.25), voxel) : undefined);
      if (mesh.faces) out.push({ role: 'road', voxel, mesh });
      s0 = Math.min(end, c.smooth.end);
    }
    if (s0 < end) this.mesh(fillCorridor(w.route, c, s0, end, voxel), voxel, true, () => true, 'land', out);
    return out;
  }

  private props(s0: number, len: number): TilePart[] {
    const out: TilePart[] = [];
    for (const g of fillScatter(this.world, s0, s0 + len)) this.mesh(g, g.size, false, (v) => !this.world.isGlow?.(v), 'prop', out);
    return out;
  }

  /** Greedy-mesh the voxels passing `include` into one part (baked sun visibility when `baked` and the world has a sun). */
  private mesh(g: VoxelGrid, sz: number, baked: boolean, include: (v: number) => boolean, role: PartRole, out: TilePart[]) {
    const w = this.world, sun = baked ? this.sun : null;
    const pal = role === 'glow' ? w.palette.linear.map((x) => x * (w.glowIntensity ?? 2.2)) : w.palette.linear;
    const opts: MeshOpts = { palette: pal, greedy: true, remap: w.fold, flatAO: sz >= this.lod.flatAOFrom || role === 'glow', include,
      ...(sun ? { sunVis: (x: number, y: number, z: number) => sun.vis(x, y + sz, z, Math.max(2 * sz, 0.25), sz) } : {}) };
    const m = mergeMeshData([...g.chunks.keys()].map((k) => meshChunkGreedy(g, k, opts)));
    if (m) out.push({ role, voxel: sz, mesh: m });
  }
}
