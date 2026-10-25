// Graded voxel road: a voxel grid laid in the road's own frame (lateral d × route distance s) and sheared to follow
// the route's grade, so the surface is continuous (no stairs) yet still made of individual cells. Each cell takes its
// colour from the corridor's SurfaceFn; the material draws per-cell bevel/jitter from the `voxL` frame coordinates.
// Cell rows sit on global multiples of the voxel size and share their cross-sections, so segment and LOD joins are watertight.
import { hash2 } from '../voxel/noise';
import type { MeshData } from '../voxel/mesh';
import type { CorridorDef } from './def';
import type { RouteSpline } from './route';

type V3 = [number, number, number];
interface Section { s: number; tx: number; tz: number; normal: V3; depth: number; point(d: number, h: number): V3 }

export function meshRoad(route: RouteSpline, c: CorridorDef, s0: number, s1: number, voxel: number, palette: Float32Array,
  sunVis?: (x: number, y: number, z: number) => number): MeshData {
  const positions: number[] = [], normals: number[] = [], colors: number[] = [], indices: number[] = [], sun: number[] = [];
  const local: number[] = [], tangent: number[] = [];
  const end = Math.min(s1, c.graded!.end, route.length), start = Math.max(0, s0);
  const section = (s: number): Section => {
    const p = route.at(s), a = route.at(Math.max(0, s - 0.5)), b = route.at(Math.min(route.length, s + 0.5));
    const length = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    const tx = (b.x - a.x) / length, tz = (b.z - a.z) / length, grade = (b.y - a.y) / length;
    const scale = Math.hypot(grade, 1);
    const normal: V3 = [-tx * grade / scale, 1 / scale, -tz * grade / scale];
    const depth = c.thickness + (c.support === 'ground' && !c.span?.(s) ? c.edgeSkirt ?? 0.4 : 0);
    return { s, tx, tz, normal, depth, point: (d, h) => [p.x - tz * d, p.y + h, p.z + tx * d] };
  };
  /** One quad across a cell row: corners at (d, h) on the near (`p`) and far (`q`) cross-sections. */
  const quad = (p: Section, q: Section, a: [number, number], b: [number, number], color: number, top: boolean) => {
    const base = positions.length / 3;
    const corners: Array<[Section, [number, number]]> = [[p, a], [q, a], [q, b], [p, b]];
    const pts = corners.map(([sec, [d, h]]) => sec.point(d, h));
    let flat: V3 | undefined;
    if (!top) {
      const u = pts[1].map((v, i) => v - pts[0][i]), v = pts[2].map((v, i) => v - pts[0][i]);
      const n: V3 = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
      const length = Math.hypot(...n) || 1;
      flat = [-n[0] / length, -n[1] / length, -n[2] / length];
    }
    for (let i = 0; i < 4; i++) {
      const [sec, [d, h]] = corners[i], pt = pts[i];
      positions.push(...pt); normals.push(...(flat ?? sec.normal));
      colors.push(palette[color * 3], palette[color * 3 + 1], palette[color * 3 + 2]);
      local.push(d, h, sec.s); tangent.push(sec.tx, sec.tz);
      if (sunVis) sun.push(sunVis(...pt));
    }
    indices.push(base, base + 2, base + 1, base, base + 3, base + 2);
  };
  // lateral cell edges on multiples of the voxel size from the centre line, clipped to the corridor edge
  const edges: number[] = [-c.half];
  for (let i = Math.floor(-c.half / voxel) + 1; i * voxel < c.half; i++) if (i * voxel > -c.half) edges.push(i * voxel);
  edges.push(c.half);
  const first = Math.round(edges[1] / voxel) - 1;
  const cells = edges.slice(1).map((d1, i) => ({ d0: edges[i], d1, col: first + i }));

  let prev = section(start);
  for (let j = Math.floor(start / voxel); j * voxel < end; j++) {
    const ns = Math.min(end, (j + 1) * voxel), next = section(ns);
    const sc = (Math.max(start, j * voxel) + ns) / 2;
    // runs of equal (colour, height) cells across the row
    const runs: Array<{ d0: number; d1: number; c: number; dy: number }> = [];
    for (const cell of cells) {
      const dc = (cell.d0 + cell.d1) / 2, top = c.surface(dc, sc, 0, hash2(cell.col, j, 7), voxel);
      const run = runs[runs.length - 1];
      if (run && run.c === top.c && run.dy === top.dy) run.d1 = cell.d1;
      else runs.push({ d0: cell.d0, d1: cell.d1, c: top.c, dy: top.dy });
    }
    for (const r of runs) quad(prev, next, [r.d0, r.dy], [r.d1, r.dy], r.c, true);
    // risers where neighbouring cells step (asphalt down to gravel): the side of the higher cell
    for (let i = 1; i < runs.length; i++) {
      const a = runs[i - 1], b = runs[i];
      if (a.dy !== b.dy) quad(prev, next, [a.d1, a.dy], [b.d0, b.dy], a.dy > b.dy ? a.c : b.c, false);
    }
    // outer walls (top cell layer in the surface colour, the bed below it) and the underside
    const L = runs[0], R = runs[runs.length - 1], dL = L.d0, dR = R.d1;
    const below = (cell: (typeof cells)[number]) => c.surface((cell.d0 + cell.d1) / 2, sc, 1, hash2(cell.col * 31 + 1, j, 7), voxel).c;
    const belowL = below(cells[0]), belowR = below(cells[cells.length - 1]);
    const midL = Math.max(L.dy - voxel, -prev.depth), midR = Math.max(R.dy - voxel, -prev.depth);
    quad(prev, next, [dL, midL], [dL, L.dy], L.c, false);
    quad(prev, next, [dL, -prev.depth], [dL, midL], belowL, false);
    quad(prev, next, [dR, R.dy], [dR, midR], R.c, false);
    quad(prev, next, [dR, midR], [dR, -prev.depth], belowR, false);
    quad(prev, next, [dR, -prev.depth], [dL, -prev.depth], belowL, false);
    prev = next;
  }
  return { positions: Float32Array.from(positions), normals: Float32Array.from(normals), colors: Float32Array.from(colors),
    indices: Uint32Array.from(indices), faces: indices.length / 6, voxL: Float32Array.from(local), voxT: Float32Array.from(tangent),
    ...(sunVis ? { sunVis: Float32Array.from(sun) } : {}) };
}
