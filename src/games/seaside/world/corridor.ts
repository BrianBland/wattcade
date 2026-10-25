// Path corridors: any ridden surface (road, boardwalk, stone path, obsidian bridge) laid along the route at a fixed
// voxel size, plus the carve rule terrain fills use so nothing pokes through it. Pure (runs in tile workers).
import { VoxelGrid } from '../voxel/grid';
import { hash2, noise2 } from '../voxel/noise';
import type { CorridorCarve, CorridorDef, ScatterRule, SurfaceFn, WorldDef } from './def';
import type { RouteSpline } from './route';

/** The carve rule for one world's corridor (null when the world has no corridor). */
export function corridorCarve(route: RouteSpline, c: CorridorDef | undefined): CorridorCarve | null {
  if (!c) return null;
  return {
    bedAt(x, z, s) {
      const n = route.nearest(x, z, c.half + s * 2);
      return n ? n.y - c.thickness : null;
    },
    at(x, z, s) {
      const n = route.nearest(x, z, c.half + s * 2);
      if (!n) return null;
      const ad = Math.abs(n.d);
      if (c.support === 'ground' && !c.span?.(n.s)) {
        if (ad + s * 0.5 < c.half) return 'skip';
        // coarse columns touching the corridor are capped below its surface (fine ones line up with it already)
        return s > 0.25 && ad - s * 0.75 < c.half ? n.y - 0.06 : null;
      }
      return ad - s * 0.75 < c.half ? n.y - c.thickness : null;
    },
  };
}

/**
 * Voxelize the corridor for route distances [s0, s1) at voxel size `voxel`. Each column belongs to the segment
 * holding its nearest route point, so neighbouring segments never overlap or leave gaps.
 */
export function fillCorridor(route: RouteSpline, c: CorridorDef, s0: number, s1: number, voxel: number): VoxelGrid {
  if (c.start !== undefined) { if (s1 <= c.start) return new VoxelGrid(voxel); s0 = Math.max(s0, c.start); }
  const pad = c.half + 1, b = route.bbox(s0, s1);
  const gx0 = Math.floor((b.x0 - pad) / voxel) * voxel, gz0 = Math.floor((b.z0 - pad) / voxel) * voxel;
  const g = new VoxelGrid(voxel, [gx0, 0, gz0]);
  const nx = Math.ceil((b.x1 + pad - gx0) / voxel), nz = Math.ceil((b.z1 + pad - gz0) / voxel);
  const last = s1 >= route.length;
  const bed = Math.max(1, Math.ceil(c.thickness / voxel)), skirtV = Math.round((c.edgeSkirt ?? 0.4) / voxel);
  const skirt = (s: number) => (c.support === 'ground' && !c.span?.(s) ? skirtV : 0);
  for (let i = 0; i < nx; i++) for (let k = 0; k < nz; k++) {
    const wx = gx0 + (i + 0.5) * voxel, wz = gz0 + (k + 0.5) * voxel;
    const n = route.nearest(wx, wz, pad);
    if (!n || Math.abs(n.d) > c.half || n.s < s0 || (n.s >= s1 && !last) || n.dist > Math.abs(n.d) + voxel) continue; // (not past the route's ends)
    const r0 = hash2(i + Math.round(gx0 / voxel), k + Math.round(gz0 / voxel), 7);
    const top0 = c.surface(n.d, n.s, 0, r0, voxel);
    // clumped noise in the rounding: step edges wander and crumble instead of ruling straight lines across the path
    const top = Math.floor((n.y + top0.dy + (noise2(wx * 1.7, wz * 1.7, 41) - 0.5) * voxel * 0.55) / voxel);
    let lo = top - bed;
    if (Math.abs(n.d) > c.half - voxel * 1.5) lo -= skirt(n.s);
    const x = Math.round((wx - gx0) / voxel - 0.5), z = Math.round((wz - gz0) / voxel - 0.5);
    for (let y = lo; y <= top; y++) {
      const v = y === top ? top0.c : c.surface(n.d, n.s, top - y, hash2(x * 31 + y, z, 7), voxel).c;
      if (v) g.set(x, y, z, v);
    }
  }
  return g;
}

/** Prop scatter for route distances [s0, s1): one grid per prop voxel size. */
export function fillScatter(w: WorldDef, s0: number, s1: number): VoxelGrid[] {
  const grids = new Map<number, VoxelGrid>();
  const ground = (x: number, z: number, fallback: number) => (w.terrain.kind === 'height' ? w.terrain.height(x, z) : fallback);
  (w.scatter ?? []).forEach((rule: ScatterRule, ri) => {
    const off = rule.offset ?? 0;
    for (let k = Math.ceil((s0 - off) / rule.every); off + k * rule.every < s1; k++) {
      const s = off + k * rule.every;
      if (s < 0 || s > w.route.length || rule.skip?.(s)) continue;
      const seed = Math.floor(hash2(ri, k, 91) * 1e6);
      if (rule.chance !== undefined && hash2(ri, k, 92) > rule.chance) continue;
      const d = typeof rule.d === 'number' ? rule.d : rule.d[0] + (rule.d[1] - rule.d[0]) * hash2(ri, k, 93);
      const p = w.route.offset(s, d), t = w.route.tangent(s);
      let g = grids.get(rule.voxel);
      if (!g) { g = new VoxelGrid(rule.voxel); grids.set(rule.voxel, g); }
      rule.place(g, { x: p.x, y: ground(p.x, p.z, p.y), z: p.z, s, d, tx: t.x, tz: t.z, seed });
    }
  });
  return [...grids.values()];
}

// ---- surface styles ----------------------------------------------------------------------------------------------

/** Asphalt with a yellow centre line and white edge lines; gravel shoulders a step down. */
export function roadSurface(p: { asphalt: readonly number[]; yellow: number; white: number; gravel: readonly number[]; dirt: number; lane?: number; paved?: number }): SurfaceFn {
  const lane = p.lane ?? 3.55, paved = p.paved ?? 5;
  return (d, _s, below, r, voxel) => {
    const ad = Math.abs(d);
    if (ad > paved) return { dy: -0.12, c: below ? p.dirt : p.gravel[Math.floor(r * p.gravel.length)] };
    let c = p.asphalt[Math.floor(r * p.asphalt.length)];
    if (!below && ad < voxel * 1.01) c = p.yellow;
    else if (!below && ad > lane && ad < lane + Math.max(voxel, 0.25)) c = p.white;
    return { dy: 0, c };
  };
}

/** Planks across the path with dark gaps between them. */
export function boardwalkSurface(p: { plank: readonly number[]; gap: number; plankLen?: number }): SurfaceFn {
  const L = p.plankLen ?? 0.3;
  return (_d, s, below, r, voxel) => {
    const k = Math.floor(s / L);
    if (!below && s - k * L < Math.max(voxel, 0.04)) return { dy: -voxel, c: p.gap };
    return { dy: 0, c: below > 1 ? p.gap : p.plank[(k + Math.floor(r * 2)) % p.plank.length] };
  };
}

/** Cut stone slabs: courses of offset blocks with dark mortar, a little height jitter per slab. */
export function stoneSurface(p: { stone: readonly number[]; mortar: number; course?: number }): SurfaceFn {
  const C = p.course ?? 0.9, W = C * 1.3;
  return (d, s, below, _r, voxel) => {
    const row = Math.floor(s / C), u = d + hash2(row, 1, 5) * W + 1000, col = Math.floor(u / W);
    const mortar = s - row * C < voxel * 0.9 || u - col * W < voxel * 0.9;
    const h = hash2(row, col, 6);
    return { dy: mortar ? -voxel : (h - 0.5) * voxel * 0.8, c: mortar && !below ? p.mortar : p.stone[Math.floor(h * p.stone.length)] };
  };
}

/** A ribbon of black glass `half` metres either side of the route, with a bright lip along both edges. */
export function obsidianSurface(half: number, p: { glass: readonly number[]; edge: number; lip?: number }): SurfaceFn {
  const lip = p.lip ?? 0.12;
  return (d, _s, below, r, voxel) => ({ dy: 0, c: !below && half - Math.abs(d) < Math.max(lip, voxel) ? p.edge : p.glass[Math.floor(r * p.glass.length)] });
}
