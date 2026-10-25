import { describe, expect, it } from 'vitest';
import { meshRoad } from '../world/roadMesh';
import { RouteSpline } from '../world/route';
import { flatCorridor, flatWorld, PAL } from './fixtures';
import { TileBuilder } from '../world/tileBuild';
import type { CorridorDef } from '../world/def';

const route = new RouteSpline([[0, 0, 0], [0, 4, -40], [0, 0, -80]], 1);
const c: CorridorDef = { ...flatCorridor, smooth: { end: route.length, bands: [
  { from: -3, to: -2.5, dy: -0.12, color: PAL.idx.gravel },
  { from: -2.5, to: 2.5, dy: 0, color: PAL.idx.asphalt },
  { from: 2.5, to: 3, dy: -0.12, color: PAL.idx.gravel },
] } };

describe('smooth road', () => {
  it('follows continuous grade through crests with no voxel rounding or isolated bumps', () => {
    const m = meshRoad(route, c, 0, 80, PAL.linear);
    let checked = 0;
    for (let i = 0; i < m.positions.length; i += 3) if (m.normals[i + 1] > 0.5) {
      const [x, y, z] = m.positions.slice(i, i + 3);
      // Every top vertex is exactly on the route grade, offset only by the gravel shoulder.
      const h = route.at(-z).y;
      expect(Math.min(Math.abs(y - h), Math.abs(y - (h - 0.12)))).toBeLessThan(1e-6);
      if (Math.abs(x) < 2.6 && Math.abs(y - h) < 1e-6) checked++;
    }
    expect(checked).toBeGreaterThan(100);
  });

  it('has outward triangle winding consistent with its normals', () => {
    const m = meshRoad(route, c, 10, 12, PAL.linear);
    for (let i = 0; i < m.indices.length; i += 3) {
      const [a, b, c] = m.indices.slice(i, i + 3).map((v) => v * 3);
      const u = [0, 1, 2].map((j) => m.positions[b + j] - m.positions[a + j]);
      const v = [0, 1, 2].map((j) => m.positions[c + j] - m.positions[a + j]);
      const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
      expect(n.reduce((sum, value, j) => sum + value * m.normals[a + j], 0)).toBeGreaterThan(0);
    }
  });

  it('shares identical cross-sections and markings between near/far segments', () => {
    const w = flatWorld({ route, corridor: c });
    const builder = new TileBuilder(w);
    const a = builder.build({ kind: 'road', s0: 0, len: 32, voxel: 0.125 }).parts[0].mesh;
    const b = builder.build({ kind: 'road', s0: 32, len: 32, voxel: 0.5 }).parts[0].mesh;
    const topSeam = (m: typeof a) => {
      const out = new Set<string>();
      for (let i = 0; i < m.positions.length; i += 3) if (m.positions[i + 2] === -32 && m.normals[i + 1] > 0.5)
        out.add([...m.positions.slice(i, i + 3), ...m.normals.slice(i, i + 3), ...m.colors.slice(i, i + 3)].join(','));
      return [...out].sort();
    };
    expect(topSeam(a).length).toBeGreaterThan(0);
    expect(topSeam(a)).toEqual(topSeam(b));
  });

  it('retains baked sun attributes and leaves the plank section on the voxel path', () => {
    const m = meshRoad(route, c, 0, 2, PAL.linear, () => 0.5);
    expect(m.sunVis?.length).toBe(m.positions.length / 3);
    expect([...m.sunVis!].every((v) => v === 0.5)).toBe(true);
    const short = { ...c, smooth: { ...c.smooth!, end: 10.5 } };
    const builder = new TileBuilder(flatWorld({ route, corridor: short }));
    expect(builder.build({ kind: 'road', s0: 0, len: 16, voxel: 0.125 }).parts.map((p) => p.role)).toEqual(['road', 'land']);
    expect(builder.build({ kind: 'road', s0: 16, len: 16, voxel: 0.125 }).parts.map((p) => p.role)).toEqual(['land']);
  });
});
