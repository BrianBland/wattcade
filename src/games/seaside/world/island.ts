// The island (#191): a heightfield that depends on the radius alone (perfectly round: the tell), neon reef in the
// shallows, a ring of white sand, jungle canopy thickening inward, rock where the stone road's flank is steep, and the
// plateau with the monkey head and the temple massif (terrain structures, islandBuild.ts). The route rides on a
// corridor: nothing while paddling, planks on stilts round the shore, fitted stone up the flank and into the hall.
import type { VoxelGrid } from '../voxel/grid';
import { fbm, hash2, noise2, smooth } from '../voxel/noise';
import type { Region, SurfaceFn, TerrainFill, WorldDef } from './def';
import { boardwalkSurface, stoneSurface } from './corridor';
import { fillStructures } from './coastBuild';
import { approachLane, islandRoute, islandSpan, radialH, SEA_Y, SHORE_R } from './islandLayout';
import { hallCap, islandScatter, islandStructures, underTemple } from './islandBuild';
import { I, ISLE } from './islandPalette';

export const ISLAND_BOUNDS: Region = { x0: -1150, x1: 1150, z0: -1150, z1: 1150 };
const WATER = new Set([I.deep, I.sea, I.sea2, I.shallow, I.foam, I.foam2, I.reef, I.reef2, I.reef3, I.reef4, I.reefSand, I.pool, I.pool2]);

/** Ground height: the radial profile plus a little texture (none on the plateau's approach lane). */
export function islandGround(x: number, z: number): number {
  const r = Math.hypot(x, z), h = radialH(r);
  if (r > SHORE_R) return h + (r < 380 ? (fbm(x / 7, z / 7, 2, 3) - 0.5) * 0.5 : 0);
  const lane = approachLane(x, z), calm = Math.min(smooth(6, 20, lane), underTemple(x, z, 6) ? 0 : 1);
  return h + (fbm(x / 11, z / 11, 3, 4) - 0.5) * 0.7 * calm;
}
const slopeAt = (r: number) => Math.abs(radialH(r + 1) - radialH(r - 1)) / 2;

/** Voxelize the island over `reg`. */
function fillIsland(grid: VoxelGrid, reg: Region, o: TerrainFill) {
  const s = grid.size, [ox, oy, oz] = grid.origin;
  const ix0 = Math.floor((reg.x0 - ox) / s), ix1 = Math.ceil((reg.x1 - ox) / s), iz0 = Math.floor((reg.z0 - oz) / s), iz1 = Math.ceil((reg.z1 - oz) / s);
  const W = ix1 - ix0 + 3, D = iz1 - iz0 + 3, H = new Float32Array(W * D), CC = new Float32Array(W * D).fill(NaN);
  for (let i = 0; i < W; i++) for (let k = 0; k < D; k++) {
    const wx = ox + (ix0 - 1 + i + 0.5) * s, wz = oz + (iz0 - 1 + k + 0.5) * s;
    H[i * D + k] = islandGround(wx, wz);
    const c = o.corridor?.at(wx, wz, s) ?? null;
    if (c !== null) CC[i * D + k] = c === 'skip' ? -Infinity : c;
  }
  const yi = (h: number) => Math.floor((h - oy) / s), seaY = Math.round((SEA_Y - oy) / s) - 1;
  const route = islandRoute();
  for (let i = 1; i < W - 1; i++) for (let k = 1; k < D - 1; k++) {
    const x = ix0 - 1 + i, z = iz0 - 1 + k, wx = ox + (x + 0.5) * s, wz = oz + (z + 0.5) * s;
    if (wx >= reg.x1 || wz >= reg.z1) continue;
    const h = H[i * D + k], cc = CC[i * D + k], r = Math.hypot(wx, wz), rh = hash2(x, z, 3);
    if (cc === -Infinity) continue;
    if (h < SEA_Y) { // water: neon reef patches in the shallows, foam at the sand
      if (o.skipSea) continue;
      const depth = SEA_Y - h;
      let c = depth > 5 ? I.deep : depth > 2.5 ? (rh < 0.5 ? I.sea : I.sea2) : I.shallow;
      if (r < 372 && depth > 0.8 && depth < 2) {
        const n = noise2(wx / 2.2, wz / 2.2, 7), m = noise2(wx / 9, wz / 9, 8), patch = noise2(wx / 18, wz / 18, 9);
        if (patch > 0.5 && n > 0.66) c = m < 0.3 ? I.reef : m < 0.55 ? I.reef2 : m < 0.75 ? I.reef3 : I.reef4;
        else if (patch > 0.45 && n > 0.5) c = I.reefSand;
      }
      if (depth < 0.45) c = rh < 0.6 ? I.foam : I.foam2;
      grid.set(x, seaY, z, c);
      continue;
    }
    let top = yi(h);
    if (cc > -Infinity) top = Math.min(top, yi(cc) - 1);
    const hc = hallCap(wx, wz);
    if (hc !== null) top = Math.min(top, yi(hc) - 1);
    let lo = top, byRoad = false;
    for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      lo = Math.min(lo, yi(H[(i + a) * D + k + b]) + 1);
      byRoad ||= CC[(i + a) * D + k + b] === -Infinity;
    }
    if (byRoad) { const n = route.nearest(wx, wz, 6); if (n) lo = Math.min(lo, yi(n.y - 0.6)); } // the steep flank meets the road bed
    lo = Math.max(Math.min(lo, top - 1), seaY - 1);
    if (o.skirt && (i === 1 || k === 1 || i >= W - 3 || k >= D - 3)) lo = Math.max(lo - o.skirt, seaY - 1);
    const steep = slopeAt(r) > 0.75 && r < SHORE_R - 20, sandy = r > SHORE_R - 14;
    for (let y = lo; y <= top; y++) {
      const wy = oy + (y + 0.5) * s, below = top - y, rr = hash2(x * 31 + y, z, 7);
      let c: number;
      if (sandy) c = wy < SEA_Y + 0.35 ? I.wetSand : rr < 0.6 ? I.sand : I.sand2;
      else if (steep) { const band = Math.floor(wy / 1.4 + fbm(wx / 7, wz / 7, 2, 9) * 2) % 3; c = below === 0 && rr < 0.35 ? I.moss2 : band === 0 ? I.rock : band === 1 ? I.rock2 : I.rockDark; }
      else if (below > 0) c = I.soil;
      else { const n = fbm(wx / 6, wz / 6, 2, 10); c = n > 0.6 ? (rr < 0.5 ? I.moss : I.moss2) : rr < 0.4 ? I.litter : rr < 0.75 ? I.soil : I.jungle2; }
      grid.set(x, y, z, c);
    }
    // the canopy: leaf masses on trunks, thicker inward; never over the path, the approach lane or the temple
    if (!sandy && !steep && o.scrub) {
      const inward = smooth(SHORE_R - 14, SHORE_R - 120, r), n = fbm(wx / 10, wz / 10, 3, 11), thr = 0.66 - 0.18 * inward;
      if (n > thr && approachLane(wx, wz) > 26 && !underTemple(wx, wz)) {
        const near = route.nearest(wx, wz, 11);
        if (!near || Math.abs(near.d) > 8 + 3 * noise2(wx / 4, wz / 4, 12)) {
          const k2 = (n - thr) / (1 - thr), base = 5 + 3 * noise2(wx / 9, wz / 9, 13), height = 2.5 + 7 * k2 + 2 * inward;
          const b0 = yi(h + base), b1 = yi(h + base + height);
          // one colour per column down its sides (greedy meshing merges them), a lighter top
          const q = noise2(wx / 3, wz / 3, 16), side = q < 0.4 ? I.leafDark : q < 0.75 ? I.leafMid : I.jungle2;
          for (let y = b0; y < b1; y++) grid.set(x, y, z, side);
          grid.set(x, b1, z, rh < 0.35 ? I.leafLime : I.jungle3);
          if (hash2(x, z, 15) < 0.04 + 0.04 * inward) for (let y = top + 1; y < b0; y++) grid.set(x, y, z, I.bark);
        }
      }
    }
  }
  fillStructures(grid, reg, structures());
}

let STRUCT: ReturnType<typeof islandStructures> | null = null;
const structures = () => (STRUCT ??= islandStructures());

/** Nothing while paddling; planks on the boardwalk (1.6 m either side); fitted stone after that, planks giving way. */
function islandSurface(): SurfaceFn {
  const planks = boardwalkSurface({ plank: [I.plank, I.plank2], gap: I.plankGap, plankLen: 0.28 });
  const stone = stoneSurface({ stone: [I.stone, I.stone2, I.stone3], mortar: I.mortar });
  const [, beachS] = islandSpan('paddle'), [cs0] = islandSpan('cutStones');
  return (d, s, below, r, v) => {
    if (s < beachS + 6) return { dy: 0, c: 0 };
    const mix = smooth(cs0 - 20, cs0 + 140, s);
    if (mix < 1 && hash2(Math.floor(s / 0.9), Math.floor(d / 1.2), 3) >= mix) return Math.abs(d) > 1.6 ? { dy: 0, c: 0 } : planks(d, s, below, r, v);
    return stone(d, s, below, r, v);
  };
}

export const ISLAND_SKY = {
  zenith: 0x4a9fe0, horizon: 0xe6f0ea, fog: 0xd6e6e2, fogDensity: 0.0012,
  sunDir: [-0.3, 0.88, 0.36] as const, sunColor: 0xfff2d6, sunI: 2.7, hemiSky: 0xc6e4f2, hemiGround: 0x6a7a4a, hemiI: 1.0,
  plane: { y: SEA_Y - 0.5, color: ISLE.hex.deep }, shadows: true,
};

export function islandWorld(): WorldDef {
  const route = islandRoute(), [, bwEnd] = islandSpan('boardwalk');
  const height = (x: number, z: number) => Math.max(islandGround(x, z), SEA_Y);
  return {
    id: 'island', palette: ISLE, isWater: (v) => WATER.has(v),
    bounds: ISLAND_BOUNDS, route, eye: 1.55, rig: { lane: 0, gaze: { ahead: 30, d: 0, dy: -0.6 } },
    terrain: { kind: 'height', fill: fillIsland, height },
    corridor: {
      half: 2.4, support: 'ground', span: (s) => s < bwEnd, thickness: 0.3, clearance: 5, edgeSkirt: 0.4, voxel: 0.125, farVoxel: 0.5, near: 160, seg: 32, range: 900,
      surface: islandSurface(),
      graded: { end: route.length },
    },
    scatter: islandScatter(height),
    sun: { coarse: { cell: 8, ...ISLAND_BOUNDS }, patches: [{ cell: 2, size: 512, maxVoxel: 4 }, { cell: 0.25, size: 128, maxVoxel: 0.25, apron: 48 }] },
    waterAmp: 0.05, sky: ISLAND_SKY, look: 'midday',
  };
}
