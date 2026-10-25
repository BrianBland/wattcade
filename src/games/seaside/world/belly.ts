// The belly, the first enclosed world: a shape function (no heightfield) — a winding flesh gut of chambers (layout in
// bellyLayout.ts) with rib vaults, bile pools and bioluminescent spots, closed by a flat stomach wall where the drill
// goes in. Ported from the prototype still (stills/later/belly.ts) and stretched along the ride.
import { fbm, noise2 } from '../voxel/noise';
import type { WorldDef } from './def';
import { L, LATER } from './laterPalette';
import { chamberAt, drillAxis, floorRipple, GUT, gutR, gutRoute, gutWide, gutX, gutY, TUNNEL_R } from './bellyLayout';

const Q = 0.15; // pattern cell (m): patterns stay put at every LOD voxel size
const rnd = (a: number, b: number, c = 0) => { let h = (a * 374761393 + b * 668265263 + c * 982451653) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const GLOW = new Set([L.spot, L.spot2, L.bile, L.bile2]);
const Y0 = -2.5, Y1 = 19;
const AX = drillAxis();

/** Is (x, y) inside the drill hole through the stomach wall? */
const inHole = (x: number, y: number) => Math.hypot(x - AX.x, y - AX.y) < TUNNEL_R + 0.3;

const fleshTint = (n: number) => (n < 0.28 ? L.fleshDark : n < 0.5 ? L.flesh2 : n < 0.75 ? L.flesh : L.flesh3);

export function bellyVoxel(x: number, y: number, z: number): number {
  const u = -z;
  if (u < GUT.back - 1.2 || u > GUT.wall + 1.2) return 0;
  const r = gutR(u), rx = r * gutWide(u), ry = r * 0.85, lx = x - gutX(u), ly = y - gutY(u), cy = ry - 0.6;
  const q0 = Math.hypot(lx / rx, (ly - cy) / ry);
  if (q0 > 1 + 1.3 / r) return 0; // outside the shell
  const ix = Math.round(x / Q), iy = Math.round(y / Q), iz = Math.round(z / Q);
  const fy = floorRipple(lx, u);
  // the end walls: the shut way in behind you, and the stomach wall ahead (the drill's hole through it)
  if (u < GUT.back || u > GUT.wall) {
    if (ly < fy - 0.6 || (u > GUT.wall && inHole(x, y))) return 0;
    return fleshTint(noise2(lx * 0.6 + 3, ly * 0.6, 11));
  }
  if (q0 < 0.75 && ly > 0.6) return 0; // open air: skip the noise
  const th = Math.atan2(ly - cy, lx);
  const re = 1 + 0.07 * (fbm(th * 2.2 + 3, u * 0.22, 3, 2) - 0.5) * 2;
  const q = q0 / re, ch = chamberAt(u);
  const pool = u > 9 && noise2(lx * 0.22 + 7, u * 0.17, 5) > ch.pools;
  const floor = fy - (pool ? 0.25 : 0);
  // ribs: bone bands arching over the upper half, protruding ~1 m inward
  if (ch.ribs) {
    const k = Math.round((u - 2) / 4.4), ur = 2 + 4.4 * k;
    if (Math.abs(u - ur) < 0.32 + 0.06 * Math.sin(th * 5) && ly > cy - ry * 0.6 && q > 1 - 1.5 / r && q < 1 + 0.6 / r)
      return q < 1 - 1.3 / r ? L.ribEdge : rnd(ix, iy, 3) < 0.6 ? L.bone : L.bone2;
  }
  if (q >= 1 && q < 1 + 0.9 / r && ly > floor - 0.6) {
    const n = noise2(th * 4 + 9, u * 0.5, 7);
    if (q < 1 + 1.5 * Q / r && rnd(ix, iy, iz) < 0.02 + 0.05 * Math.max(0, n - 0.6)) return n > 0.7 ? L.spot2 : L.spot;
    return fleshTint(n);
  }
  if (q < 1 && ly <= floor && ly > floor - 0.6) {
    if (pool && ly > floor - 0.15) return rnd(ix, iz, 9) < 0.15 ? L.bile2 : L.bile;
    return Math.sin(lx * 1.5 + 2 * Math.sin(u * 0.33)) > 0.55 ? L.fold : rnd(ix, iz, 4) < 0.5 ? L.flesh : L.flesh2;
  }
  return 0;
}

export function bellyWorld(): WorldDef {
  let x0 = Infinity, x1 = -Infinity;
  for (let u = GUT.back - 2; u < GUT.wall + 2; u += 1) { const w = gutR(u) * gutWide(u) * 1.25 + 1; x0 = Math.min(x0, gutX(u) - w); x1 = Math.max(x1, gutX(u) + w); }
  return {
    id: 'belly', palette: LATER, isWater: () => false, isGlow: (v) => GLOW.has(v), glowIntensity: 2.4,
    bounds: { x0: Math.floor(x0), x1: Math.ceil(x1), z0: -Math.ceil(GUT.wall + 2), z1: -Math.floor(GUT.back - 2) },
    route: gutRoute(), eye: 1.55, rig: { lane: 0, gaze: { ahead: 30, d: 0, dy: -0.4 } },
    terrain: { kind: 'shape', y0: Y0, y1: Y1, voxel: bellyVoxel },
    sky: {
      zenith: 0x140612, horizon: 0x2a0f26, fog: 0x2b0d29, fogDensity: 0.03, sunDir: [0.2, 0.8, 0.5], sunColor: 0xff9ac8, sunI: 0.7,
      hemiSky: 0xff6ab0, hemiGround: 0x3a0f30, hemiI: 0.85,
      // no static lights: the bile-pool lights travel with the eye (GUT_LIGHTS, render/belly.ts)
    },
    look: 'belly',
  };
}
