// Continuous road ribbon. Shared, globally spaced cross-sections keep segment and LOD joins watertight.
// The material still supplies voxel-scale colour variation; grade is never rounded to voxel heights.
import type { MeshData } from '../voxel/mesh';
import type { CorridorDef } from './def';
import type { RouteSpline } from './route';

type V3 = [number, number, number];
export function meshRoad(route: RouteSpline, c: CorridorDef, s0: number, s1: number, palette: Float32Array,
  sunVis?: (x: number, y: number, z: number) => number): MeshData {
  const positions: number[] = [], normals: number[] = [], colors: number[] = [], indices: number[] = [], sun: number[] = [];
  const bands = c.smooth!.bands;
  const end = Math.min(s1, c.smooth!.end, route.length), start = Math.max(0, s0);
  const section = (s: number) => {
    const p = route.at(s), a = route.at(Math.max(0, s - 0.5)), b = route.at(Math.min(route.length, s + 0.5));
    const length = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    const tx = (b.x - a.x) / length, tz = (b.z - a.z) / length, grade = (b.y - a.y) / length;
    const scale = Math.hypot(grade, 1);
    const normal: V3 = [-tx * grade / scale, 1 / scale, -tz * grade / scale];
    const point = (d: number, dy: number): V3 => [p.x - tz * d, p.y + dy, p.z + tx * d];
    const depth = c.thickness + (c.support === 'ground' && !c.span?.(s) ? c.edgeSkirt ?? 0.4 : 0);
    return { point, normal, depth };
  };
  const quad = (a: V3, b: V3, d: V3, e: V3, color: number, ns?: V3[]) => {
    const base = positions.length / 3;
    if (!ns) {
      const u = b.map((v, i) => v - a[i]), v = d.map((v, i) => v - a[i]);
      const n: V3 = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
      const length = Math.hypot(...n) || 1;
      const normal: V3 = [-n[0] / length, -n[1] / length, -n[2] / length];
      ns = [normal, normal, normal, normal];
    }
    for (const [i, p] of [a, b, d, e].entries()) {
      positions.push(...p); normals.push(...ns[i]);
      colors.push(palette[color * 3], palette[color * 3 + 1], palette[color * 3 + 2]);
      if (sunVis) sun.push(sunVis(...p));
    }
    indices.push(base, base + 2, base + 1, base, base + 3, base + 2);
  };
  let prev = section(start);
  for (let s = start; s < end;) {
    const nextS = Math.min(end, Math.floor(s) + 1), next = section(nextS);
    for (const band of bands) {
      quad(prev.point(band.from, band.dy), next.point(band.from, band.dy), next.point(band.to, band.dy), prev.point(band.to, band.dy),
        band.color, [prev.normal, next.normal, next.normal, prev.normal]);
    }
    // Close the small drop from asphalt to gravel, plus the outside edges and underside of the road bed.
    const first = bands[0], last = bands[bands.length - 1];
    for (let i = 1; i < bands.length; i++) {
      const a = bands[i - 1], b = bands[i];
      if (a.dy === b.dy) continue;
      const points = [prev.point(a.to, a.dy), next.point(a.to, a.dy), next.point(b.from, b.dy), prev.point(b.from, b.dy)] as [V3, V3, V3, V3];
      quad(...points, a.dy > b.dy ? a.color : b.color);
    }
    quad(prev.point(first.from, -prev.depth), next.point(first.from, -next.depth), next.point(first.from, first.dy), prev.point(first.from, first.dy), first.color);
    quad(prev.point(last.to, last.dy), next.point(last.to, last.dy), next.point(last.to, -next.depth), prev.point(last.to, -prev.depth), last.color);
    quad(prev.point(last.to, -prev.depth), next.point(last.to, -next.depth), next.point(first.from, -next.depth), prev.point(first.from, -prev.depth), first.color);
    prev = next; s = nextS;
  }
  return { positions: Float32Array.from(positions), normals: Float32Array.from(normals), colors: Float32Array.from(colors),
    indices: Uint32Array.from(indices), faces: indices.length / 6, ...(sunVis ? { sunVis: Float32Array.from(sun) } : {}) };
}
