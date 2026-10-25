import { describe, expect, it } from 'vitest';
import { meshRoad } from '../world/roadMesh';
import { RouteSpline } from '../world/route';
import { flatCorridor, flatWorld, PAL } from './fixtures';
import { TileBuilder } from '../world/tileBuild';
import type { CorridorDef } from '../world/def';
import type { MeshData } from '../voxel/mesh';
import { boardwalkSurface, stoneSurface } from '../world/corridor';

const route = new RouteSpline([[0, 0, 0], [0, 4, -40], [0, 0, -80]], 1);
const c: CorridorDef = { ...flatCorridor, graded: { end: route.length } };
const vert = (m: MeshData, i: number) => [...m.positions.slice(i * 3, i * 3 + 3)];

describe('graded voxel road', () => {
  it('follows continuous grade through crests with no voxel rounding or isolated bumps', () => {
    const m = meshRoad(route, c, 0, 80, 0.125, PAL.linear);
    let checked = 0;
    for (let i = 0; i < m.positions.length / 3; i++) if (m.normals[i * 3 + 1] > 0.5) {
      const [x, y, z] = vert(m, i);
      // Every top vertex is exactly on the route grade, offset only by the gravel shoulder.
      const h = route.at(-z).y;
      expect(Math.min(Math.abs(y - h), Math.abs(y - (h - 0.12)))).toBeLessThan(1e-5);
      if (Math.abs(x) < 2.5 && Math.abs(y - h) < 1e-5) checked++;
    }
    expect(checked).toBeGreaterThan(100);
  });

  it('is made of voxel cells in the sheared road frame', () => {
    const m = meshRoad(route, c, 10, 12, 0.25, PAL.linear);
    expect(m.voxL!.length).toBe(m.positions.length);
    expect(m.voxT!.length).toBe((m.positions.length / 3) * 2);
    for (let i = 0; i < m.positions.length / 3; i++) {
      const [x, y, z] = vert(m, i), [d, h, s] = m.voxL!.slice(i * 3, i * 3 + 3);
      // frame coords locate the vertex: lateral d, height h above the route grade, route distance s
      expect(x).toBeCloseTo(d, 4); expect(z).toBeCloseTo(-s, 4); expect(y).toBeCloseTo(route.at(s).y + h, 4);
      // top cell corners sit on the voxel lattice in that frame (outer edge excepted)
      if (m.normals[i * 3 + 1] > 0.5) {
        expect(Math.abs(s / 0.25 - Math.round(s / 0.25))).toBeLessThan(1e-4);
        if (Math.abs(d) < c.half) expect(Math.abs(d / 0.25 - Math.round(d / 0.25))).toBeLessThan(1e-4);
      }
    }
  });

  it('has outward triangle winding consistent with its normals, walls facing away from the road', () => {
    const m = meshRoad(route, c, 10, 12, 0.125, PAL.linear);
    for (let i = 0; i < m.indices.length; i += 3) {
      const [a, b, cc] = m.indices.slice(i, i + 3).map((v) => v * 3);
      const u = [0, 1, 2].map((j) => m.positions[b + j] - m.positions[a + j]);
      const v = [0, 1, 2].map((j) => m.positions[cc + j] - m.positions[a + j]);
      const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
      expect(n.reduce((sum, value, j) => sum + value * m.normals[a + j], 0)).toBeGreaterThan(0);
    }
    for (let i = 0; i < m.positions.length / 3; i++) {
      const x = m.positions[i * 3], nx = m.normals[i * 3];
      if (Math.abs(x) > c.half - 1e-6 && Math.abs(nx) > 0.5) expect(Math.sign(nx)).toBe(Math.sign(x));
      // shoulder risers (at |d| = 2.5) face out toward the lower gravel
      if (Math.abs(Math.abs(x) - 2.5) < 1e-6 && Math.abs(nx) > 0.5) expect(Math.sign(nx)).toBe(Math.sign(x));
    }
  });

  it('takes cell colours from the corridor surface (lane markings, shoulders)', () => {
    const m = meshRoad(route, c, 20, 21, 0.125, PAL.linear);
    // colour of the top quad covering lateral offset d (quads are 4 consecutive vertices)
    const colorAt = (d: number) => {
      for (let i = 0; i < m.positions.length / 3; i += 4) {
        const ds = [0, 1, 2, 3].map((k) => m.voxL![(i + k) * 3]);
        if (m.normals[i * 3 + 1] > 0.5 && Math.min(...ds) < d && d < Math.max(...ds))
          return [...m.colors.slice(i * 3, i * 3 + 3)].map((v) => +v.toFixed(4)).join();
      }
    };
    const rgb = (k: keyof typeof PAL.idx) => [...PAL.linear.slice(PAL.idx[k] * 3, PAL.idx[k] * 3 + 3)].map((v) => +v.toFixed(4)).join();
    expect(colorAt(-0.06)).toBe(rgb('yellow'));
    expect(colorAt(1.6)).toBe(rgb('white'));
    expect(colorAt(-2.9)).toBe(rgb('gravel'));
    expect(colorAt(1.1)).toBe(rgb('asphalt'));
  });

  it('joins near/far segments on the same cross-section', () => {
    const w = flatWorld({ route, corridor: c });
    const builder = new TileBuilder(w);
    const a = builder.build({ kind: 'road', s0: 0, len: 32, voxel: 0.125 }).parts[0].mesh;
    const b = builder.build({ kind: 'road', s0: 32, len: 32, voxel: 0.5 }).parts[0].mesh;
    // every coarse top vertex on the seam lies on the fine seam's cross-section line (no cracks, no step)
    const seam = (m: MeshData) => {
      const out: number[][] = [];
      for (let i = 0; i < m.positions.length / 3; i++) if (Math.abs(m.positions[i * 3 + 2] + 32) < 1e-5 && m.normals[i * 3 + 1] > 0.5) out.push(vert(m, i));
      return out;
    };
    const fine = seam(a), coarse = seam(b);
    expect(coarse.length).toBeGreaterThan(0);
    for (const [x, y] of coarse) {
      const level = fine.filter(([, fy]) => Math.abs(fy - y) < 1e-5).map(([fx]) => fx);
      expect(Math.min(...level) - 1e-5).toBeLessThanOrEqual(x); expect(Math.max(...level) + 1e-5).toBeGreaterThanOrEqual(x);
    }
  });

  it('retains baked sun attributes and leaves the plank section on the voxel path', () => {
    const m = meshRoad(route, c, 0, 2, 0.125, PAL.linear, () => 0.5);
    expect(m.sunVis?.length).toBe(m.positions.length / 3);
    expect([...m.sunVis!].every((v) => v === 0.5)).toBe(true);
    const short = { ...c, graded: { end: 10.5 } };
    const builder = new TileBuilder(flatWorld({ route, corridor: short }));
    expect(builder.build({ kind: 'road', s0: 0, len: 16, voxel: 0.125 }).parts.map((p) => p.role)).toEqual(['road', 'land']);
    expect(builder.build({ kind: 'road', s0: 16, len: 16, voxel: 0.125 }).parts.map((p) => p.role)).toEqual(['land']);
  });

  describe('surfaces with detail along the route (island boardwalk and cut stone)', () => {
    const P = PAL.idx;
    const planks = boardwalkSurface({ plank: [P.rock], gap: P.dirt, plankLen: 0.5 });
    const stone = stoneSurface({ stone: [P.rock, P.grass], mortar: P.dirt });
    // planks only within 1 m of the centre line: empty cells beyond
    const narrow: CorridorDef = { ...c, surface: (d, s, below, r, v) => (Math.abs(d) > 1 ? { dy: 0, c: 0 } : planks(d, s, below, r, v)) };
    const winding = (m: MeshData) => {
      for (let i = 0; i < m.indices.length; i += 3) {
        const [a, b, cc] = m.indices.slice(i, i + 3).map((v) => v * 3);
        const u = [0, 1, 2].map((j) => m.positions[b + j] - m.positions[a + j]);
        const v = [0, 1, 2].map((j) => m.positions[cc + j] - m.positions[a + j]);
        const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
        expect(n.reduce((sum, value, j) => sum + value * m.normals[a + j], 0)).toBeGreaterThan(0);
      }
    };

    it('keeps tops on the grade and steps plank gaps with risers facing into the gap', () => {
      const m = meshRoad(route, narrow, 20, 22, 0.125, PAL.linear);
      winding(m);
      let risers = 0;
      for (let i = 0; i < m.positions.length / 3; i++) {
        const [x, y, z] = vert(m, i), [d, h, s] = m.voxL!.slice(i * 3, i * 3 + 3), nz = m.normals[i * 3 + 2];
        if (m.normals[i * 3 + 1] > 0.5) {
          expect(Math.abs(x)).toBeLessThanOrEqual(1 + 1e-6); // nothing on the empty cells
          expect(y - route.at(-z).y).toBeCloseTo(h, 4);
        }
        // along-route risers lie on a row boundary and face the gap row (route runs toward −z here)
        if (Math.abs(nz) > 0.5 && h > -0.125 - 1e-6) {
          risers++;
          expect(Math.abs(s / 0.125 - Math.round(s / 0.125))).toBeLessThan(1e-4);
          const behind = planks(d, s - 0.0625, 0, 0, 0.125).dy, ahead = planks(d, s + 0.0625, 0, 0, 0.125).dy;
          expect(behind).not.toBe(ahead);
          expect(Math.sign(-nz)).toBe(behind < ahead ? -1 : 1);
        }
      }
      expect(risers).toBeGreaterThan(0);
    });

    it('walls in empty cells, facing away from the surface', () => {
      const m = meshRoad(route, narrow, 20, 21, 0.125, PAL.linear);
      let walls = 0;
      for (let i = 0; i < m.positions.length / 3; i++) {
        const x = m.positions[i * 3], nx = m.normals[i * 3];
        if (Math.abs(nx) > 0.5) { walls++; expect(Math.abs(x)).toBeCloseTo(1, 5); expect(Math.sign(nx)).toBe(Math.sign(x)); }
      }
      expect(walls).toBeGreaterThan(0);
    });

    it('meshes cut stone with consistent winding and closes the end of the graded stretch', () => {
      const short: CorridorDef = { ...c, surface: stone, graded: { end: 10 } };
      const m = meshRoad(route, short, 0, 16, 0.125, PAL.linear);
      winding(m);
      let endWall = 0;
      for (let i = 0; i < m.positions.length / 3; i++) if (m.normals[i * 3 + 2] < -0.5 && Math.abs(m.voxL![i * 3 + 2] - 10) < 1e-6) endWall++;
      expect(endWall).toBeGreaterThan(0);
      // a segment boundary (here on a mortar line) is meshed once, by the segment after it
      const a = meshRoad(route, { ...c, surface: stone }, 0, 4.5, 0.125, PAL.linear), b = meshRoad(route, { ...c, surface: stone }, 4.5, 9, 0.125, PAL.linear);
      const onSeam = (m: MeshData) => [...Array(m.positions.length / 3).keys()].filter((i) => Math.abs(m.normals[i * 3 + 2]) > 0.5 && Math.abs(m.voxL![i * 3 + 2] - 4.5) < 1e-6).length;
      expect(onSeam(a)).toBe(0);
      expect(onSeam(b)).toBeGreaterThan(0);
    });
  });
});
