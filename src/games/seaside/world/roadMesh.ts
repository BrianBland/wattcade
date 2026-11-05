// Graded voxel road: a voxel grid laid in the road's own frame (lateral d × route distance s) and sheared to follow
// the route's grade, so the surface is continuous (no stairs) yet still made of individual cells. Each cell takes its
// colour and small height offset (shoulders, plank gaps, slab jitter) from the corridor's SurfaceFn, and empty cells
// (c = 0) leave holes with walls around them; the material draws per-cell bevel/jitter from the `voxL` frame coordinates.
// Cell rows sit on global multiples of the voxel size and share their cross-sections, so segment and LOD joins are watertight.
import { hash2 } from '../voxel/noise';
import type { MeshData } from '../voxel/mesh';
import type { CorridorDef } from './def';
import type { RouteSpline } from './route';

type V3 = [number, number, number];
type Top = { c: number; dy: number } | null;
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
  /** One face: four (section, d, h) corners. `out` = the outward direction for walls (winding follows it); none = top. */
  const face = (corners: Array<[Section, number, number]>, color: number, out?: V3) => {
    let pts = corners.map(([sec, d, h]) => sec.point(d, h));
    let flat: V3 | undefined;
    if (out) {
      const normalOf = () => {
        const u = pts[1].map((v, i) => v - pts[0][i]), v = pts[2].map((v, i) => v - pts[0][i]);
        const n: V3 = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
        const length = Math.hypot(...n) || 1;
        return [-n[0] / length, -n[1] / length, -n[2] / length] as V3;
      };
      flat = normalOf();
      if (flat[0] * out[0] + flat[1] * out[1] + flat[2] * out[2] < 0) {
        corners = [corners[0], corners[3], corners[2], corners[1]];
        pts = [pts[0], pts[3], pts[2], pts[1]];
        flat = normalOf();
      }
    }
    const base = positions.length / 3;
    for (let i = 0; i < 4; i++) {
      const [sec, d, h] = corners[i], pt = pts[i];
      positions.push(...pt); normals.push(...(flat ?? sec.normal));
      colors.push(palette[color * 3], palette[color * 3 + 1], palette[color * 3 + 2]);
      local.push(d, h, sec.s); tangent.push(sec.tx, sec.tz);
      if (sunVis) sun.push(sunVis(...pt));
    }
    indices.push(base, base + 2, base + 1, base, base + 3, base + 2);
  };
  const lat = (sec: Section, k: number): V3 => [-sec.tz * k, 0, sec.tx * k], along = (sec: Section, k: number): V3 => [sec.tx * k, 0, sec.tz * k];
  // lateral cell edges on multiples of the voxel size from the centre line, clipped to the corridor edge
  const edges: number[] = [-c.half];
  for (let i = Math.floor(-c.half / voxel) + 1; i * voxel < c.half; i++) if (i * voxel > -c.half) edges.push(i * voxel);
  edges.push(c.half);
  const first = Math.round(edges[1] / voxel) - 1;
  const cells = edges.slice(1).map((d1, i) => ({ d0: edges[i], d1, col: first + i, dc: (edges[i] + d1) / 2 }));
  // rows are sampled independently of the segment bounds, so a segment can read its predecessor's last row
  const last = Math.min(c.graded!.end, route.length);
  const rowS = (j: number) => (Math.max(0, j * voxel) + Math.min(last, (j + 1) * voxel)) / 2;
  const rowTops = (j: number): Top[] => {
    if (j < 0 || j * voxel >= last) return cells.map(() => null);
    const sc = rowS(j);
    return cells.map((cell) => { const t = c.surface(cell.dc, sc, 0, hash2(cell.col, j, 7), voxel); return t.c ? t : null; });
  };
  const belowOf = (i: number, j: number, top: number) => c.surface(cells[i].dc, rowS(j), 1, hash2(cells[i].col * 31 + 1, j, 7), voxel).c || top;
  /** A wall of cell i (row j) from the bed up to its top: top cell layer in the surface colour, the bed below it. */
  const wall = (i: number, j: number, t: NonNullable<Top>, depth: number, at: (h0: number, h1: number) => Array<[Section, number, number]>, out: V3) => {
    const mid = Math.max(t.dy - voxel, -depth);
    face(at(mid, t.dy), t.c, out);
    if (mid > -depth) face(at(-depth, mid), belowOf(i, j, t.c), out);
  };
  /** Steps and walls across the section `sec` between the row behind (`a`) and the row ahead (`b`), merged across d. */
  const across = (sec: Section, a: Top[], b: Top[], ja: number, jb: number) => {
    let run: { key: string; d0: number; d1: number; emit: (d0: number, d1: number) => void } | null = null;
    const flush = () => { if (run) run.emit(run.d0, run.d1); run = null; };
    cells.forEach((cell, i) => {
      const p = a[i], q = b[i];
      let key = '', emit: ((d0: number, d1: number) => void) | null = null;
      const at = (d0: number, d1: number) => (h0: number, h1: number): Array<[Section, number, number]> => [[sec, d0, h0], [sec, d1, h0], [sec, d1, h1], [sec, d0, h1]];
      if (p && q && p.dy !== q.dy) {
        const hi = p.dy > q.dy ? p : q, lo = hi === p ? q : p, out = along(sec, hi === p ? 1 : -1);
        key = `s${lo.dy},${hi.dy},${hi.c},${hi === p}`;
        emit = (d0, d1) => face(at(d0, d1)(lo.dy, hi.dy), hi.c, out);
      } else if (!!p !== !!q) {
        const t = (p ?? q)!, j = p ? ja : jb, out = along(sec, p ? 1 : -1);
        key = `w${t.dy},${t.c},${!!p}`;
        emit = (d0, d1) => wall(i, j, t, sec.depth, at(d0, d1), out);
      }
      if (run && run.key === key && emit) { run.d1 = cell.d1; return; }
      flush();
      if (emit) run = { key, d0: cell.d0, d1: cell.d1, emit };
    });
    flush();
  };

  let j0 = Math.floor(start / voxel), prev = section(start), tops = rowTops(j0 - 1);
  for (let j = j0; j * voxel < end; j++) {
    const ns = Math.min(end, (j + 1) * voxel), next = section(ns), row = rowTops(j);
    across(prev, tops, row, j - 1, j);
    // Keep every top cell edge, even where colours match. Merging only within a row creates
    // T-junctions against the next row, which can rasterize as pinholes on the sheared surface.
    for (let i = 0; i < cells.length; i++) {
      const t = row[i];
      if (!t) continue;
      const { d0, d1 } = cells[i];
      face([[prev, d0, t.dy], [next, d0, t.dy], [next, d1, t.dy], [prev, d1, t.dy]], t.c);
    }
    // sides between neighbouring cells: a riser on the higher one, or a full wall beside an empty cell / the edge
    for (let i = 0; i <= cells.length; i++) {
      const a = row[i - 1] ?? null, b = row[i] ?? null, d = i < cells.length ? cells[i].d0 : cells[i - 1].d1;
      const at = (h0: number, h1: number): Array<[Section, number, number]> => [[prev, d, h0], [next, d, h0], [next, d, h1], [prev, d, h1]];
      if (a && b && a.dy !== b.dy) {
        const hi = a.dy > b.dy ? a : b, lo = hi === a ? b : a;
        face(at(lo.dy, hi.dy), hi.c, lat(prev, hi === a ? 1 : -1));
      } else if (!!a !== !!b) wall(a ? i - 1 : i, j, (a ?? b)!, prev.depth, at, lat(prev, a ? 1 : -1));
    }
    // underside
    for (let i = 0; i < cells.length;) {
      if (!row[i]) { i++; continue; }
      let k = i + 1;
      while (k < cells.length && row[k]) k++;
      const d0 = cells[i].d0, d1 = cells[k - 1].d1, h = -prev.depth;
      face([[prev, d0, h], [next, d0, h], [next, d1, h], [prev, d1, h]], belowOf(i, j, row[i]!.c), [0, -1, 0]);
      i = k;
    }
    // the far end of the graded stretch is closed; segment joins are owned by the row after them
    if (ns >= last) across(next, row, rowTops(j + 1), j, j + 1);
    prev = next; tops = row;
  }
  return { positions: Float32Array.from(positions), normals: Float32Array.from(normals), colors: Float32Array.from(colors),
    indices: Uint32Array.from(indices), faces: indices.length / 6, voxL: Float32Array.from(local), voxT: Float32Array.from(tangent),
    ...(sunVis ? { sunVis: Float32Array.from(sun) } : {}) };
}
