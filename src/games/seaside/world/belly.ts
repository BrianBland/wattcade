// The belly, the first enclosed world: a shape function (no heightfield) — a ribbed flesh cathedral with bile pools
// and bioluminescent spots, ridden straight down the gut. Ported from the prototype still (stills/later/belly.ts).
import { fbm, noise2 } from '../voxel/noise';
import type { WorldDef } from './def';
import { L, LATER } from './laterPalette';
import { RouteSpline } from './route';

const Q = 0.15; // pattern cell (m): patterns stay put at every LOD voxel size
const R = (z: number) => 5.6 + 1.3 * Math.sin(z / 11) + 0.6 * Math.sin(z / 4.3 + 1);
export const bellyFloorY = (x: number, z: number) => 0.14 * Math.sin(x * 1.5 + 2 * Math.sin(z * 0.33)) + 0.08 * Math.sin(z * 0.9 + x * 0.4);
const pool = (x: number, z: number) => z < -9 && noise2(x * 0.22 + 7, z * 0.17, 5) > 0.66;
const rnd = (a: number, b: number, c = 0) => { let h = (a * 374761393 + b * 668265263 + c * 982451653) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const GLOW = new Set([L.spot, L.spot2, L.bile, L.bile2]);
const Z0 = -78, Z1 = 8;

export function bellyVoxel(x: number, y: number, z: number): number {
  if (Math.abs(x) > 9 || z < Z0 || z > Z1 || y < -1.2 || y > 12) return 0;
  const r = R(z), rx = r * 1.15, ry = r * 0.85, cy = ry - 0.6;
  const q0 = Math.hypot(x / rx, (y - cy) / ry);
  if (q0 < 0.75 && y > 0.6) return 0; // open air: skip the noise
  const th = Math.atan2(y - cy, x);
  const re = 1 + 0.07 * (fbm(th * 2.2 + 3, z * 0.22, 3, 2) - 0.5) * 2;
  const q = q0 / re;
  const fy = bellyFloorY(x, z) - (pool(x, z) ? 0.25 : 0);
  const ix = Math.round(x / Q), iy = Math.round(y / Q), iz = Math.round(z / Q);
  // ribs: bone bands arching over the upper half, protruding ~1 m inward
  const k = Math.round((z + 2) / -4.4), zr = -2 - 4.4 * k;
  if (k >= 1 && Math.abs(z - zr) < 0.32 + 0.06 * Math.sin(th * 5) && y > cy - ry * 0.6 && q > 1 - 1.5 / r && q < 1 + 0.6 / r)
    return q < 1 - 1.3 / r ? L.ribEdge : rnd(ix, iy, 3) < 0.6 ? L.bone : L.bone2;
  if (q >= 1 && q < 1 + 0.9 / r && y > fy - 0.6) {
    const n = noise2(th * 4 + 9, z * 0.5, 7);
    if (q < 1 + 1.5 * Q / r && rnd(ix, iy, iz) < 0.02 + 0.05 * Math.max(0, n - 0.6)) return n > 0.7 ? L.spot2 : L.spot;
    return n < 0.28 ? L.fleshDark : n < 0.5 ? L.flesh2 : n < 0.75 ? L.flesh : L.flesh3;
  }
  if (q < 1 && y <= fy && y > fy - 0.6) {
    if (pool(x, z) && y > fy - 0.15) return rnd(ix, iz, 9) < 0.15 ? L.bile2 : L.bile;
    return Math.sin(x * 1.5 + 2 * Math.sin(z * 0.33)) > 0.55 ? L.fold : rnd(ix, iz, 4) < 0.5 ? L.flesh : L.flesh2;
  }
  return 0;
}

export function bellyWorld(): WorldDef {
  const pts: Array<[number, number, number]> = [];
  for (let z = 4; z >= -74; z -= 4) pts.push([0.25 + 0.4 * Math.sin(z / 9), bellyFloorY(0.25, z), z]);
  return {
    id: 'belly', palette: LATER, isWater: () => false, isGlow: (v) => GLOW.has(v), glowIntensity: 2.4,
    bounds: { x0: -10, x1: 10, z0: Z0 - 2, z1: Z1 + 2 }, route: new RouteSpline(pts), eye: 1.55, rig: { lane: 0, gaze: { ahead: 30, d: 0, dy: -0.4 } },
    terrain: { kind: 'shape', y0: -1.2, y1: 12, voxel: bellyVoxel },
    sky: {
      zenith: 0x140612, horizon: 0x2a0f26, fog: 0x2b0d29, fogDensity: 0.03, sunDir: [0.2, 0.8, 0.5], sunColor: 0xff9ac8, sunI: 0.7,
      hemiSky: 0xff6ab0, hemiGround: 0x3a0f30, hemiI: 0.85,
      lights: [[-2, -7], [2.5, -16], [-1, -24], [1, -40], [0, -58]].map(([x, z]) => ({ p: [x, 0.6, z] as const, color: 0x5ff6e8, intensity: 6, dist: 14 })),
    },
    look: 'belly',
  };
}
