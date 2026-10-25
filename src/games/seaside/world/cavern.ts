// Chapter 3a's world (#192): the torchlit cave and the volcanic hall as one heightfield-style fill (each column writes
// only the runs it needs: the cave's floor slab, wall shell and arched ceiling; the hall's banks, cliffs and the lava's
// single layer; the bridge piers), so a 100 m-tall world costs about what a landscape does. The ridden obsidian bridge
// is the path corridor (nothing in the cave: its floor is the terrain). Lava is unlit and bloom-bright; the torches'
// flames and the hall's lights are the set's (render/cavern.ts).
import type { VoxelGrid } from '../voxel/grid';
import { fbm, hash2, noise2 } from '../voxel/noise';
import type { Region, TerrainFill, WorldDef } from './def';
import { obsidianSurface } from './corridor';
import { BRIDGE, BRIDGE_Y, caveSize, cavernRoute, cx, floorY, HALL_END, LAVA_Y, PIER_FLARE, PIER_R, PIERS, riverHalf, smooth, torchAt, TORCH_EVERY, U_GATE, U_MOUTH, WALL_TOP, warmth } from './cavernLayout';
import { C, CAVE, CAVE_GLOW } from './cavernPalette';

export const CAVERN_BOUNDS: Region = { x0: -200, x1: 230, z0: -Math.ceil(HALL_END + 20), z1: 16 };
const SHADES = [[C.grey, C.grey2, C.grey3], [C.brown, C.brown2, C.brown3], [C.red, C.red2, C.red3]];
const PATHS = [C.pathG, C.pathB, C.pathR];
/** The back wall the cave mouth opens through (m of u before the mouth). */
const BACK = 4;

/** Rock colour: the family by depth (dithered across the change), strata bands, a little noise. */
function rock(u: number, wy: number, r: number, n: number): number {
  const w = warmth(u), fam = Math.min(2, Math.floor(w + (r - 0.5) * 0.6 + 0.5));
  const band = ((Math.floor(wy / 1.1 + n * 2.5) % 3) + 3) % 3;
  return r < 0.06 ? C.dark : SHADES[Math.max(0, fam)][band];
}

/** Cut stone of the temple's back passage: courses with dark mortar. */
function stone(u: number, wy: number, r: number): number {
  const row = Math.floor(wy / 0.6), col = Math.floor((u + (row % 2) * 0.55) / 1.1);
  if (wy - row * 0.6 < 0.07 || u + (row % 2) * 0.55 - col * 1.1 < 0.07) return C.mortar;
  return r < 0.08 ? C.stoneDark : hash2(row, col, 3) < 0.5 ? C.stone : C.stone2;
}

/** Floor relief inside the cave (m above the centreline floor): the ridden line is level, the sides rise to the walls,
 *  with stalagmites off the line. */
function floorBump(x: number, z: number, ad: number, w: number, natural: number): number {
  if (ad < 1.5) return 0;
  let b = 0.9 * smooth(1.5, w, ad) ** 1.5 * natural + natural * 0.25 * (noise2(x / 1.7, z / 1.7, 23) - 0.5) * smooth(1.5, 2.5, ad);
  if (ad > 2.3 && natural > 0.5) {
    const gx = Math.round(x / 3.2), gz = Math.round(z / 3.2), r = hash2(gx, gz, 24);
    if (r < 0.2) { const d = Math.hypot(x - gx * 3.2, z - gz * 3.2), rad = 0.45 + 0.5 * r * 5; b += (0.6 + 2.2 * hash2(gx, gz, 25)) * Math.max(0, 1 - d / rad); }
  }
  return b;
}

/** Ceiling height inside the cave (m above the floor centreline): a rough arch (flat in the stone passage) with
 *  stalactites, never lower than 2.9 m over the ridden line. */
function ceilAt(x: number, z: number, ad: number, w: number, h: number, natural: number): number {
  const f = Math.min(1, ad / w), arch = 0.9 + (h - 0.9) * Math.sqrt(Math.max(0, 1 - f * f));
  let c = natural * arch + (1 - natural) * h + natural * 0.5 * (fbm(x / 3, z / 3, 2, 26) - 0.5);
  if (natural > 0.5) {
    const gx = Math.round(x / 2.6), gz = Math.round(z / 2.6), r = hash2(gx, gz, 27);
    if (r < 0.3) { const d = Math.hypot(x - gx * 2.6, z - gz * 2.6), rad = 0.35 + r; c -= (0.6 + 3 * hash2(gx, gz, 28)) * Math.max(0, 1 - d / rad); }
  }
  return ad < 1.8 ? Math.max(c, 2.9) : Math.max(c, 0.4);
}

/** Bank / cliff height of the hall at a column (the lava river is LAVA_Y), and the far end wall where the gate goes. */
export function hallGround(x: number, z: number): number {
  const u = -z, e = Math.abs(x - cx(u)) - riverHalf(u);
  if (u > U_GATE + 22) return WALL_TOP;
  if (e < 0) return LAVA_Y;
  let h = LAVA_Y + 0.4 + e * 0.5 + 2.5 * fbm(x / 14, z / 14, 3, 31) * smooth(0, 8, e);
  if (e > 28) h += (e - 28) * 2.6 + 25 * fbm(x / 40, z / 40, 2, 32);
  return Math.min(h, WALL_TOP + 12 * (fbm(x / 60, z / 60, 2, 33) - 0.5));
}

/** Floor height for the cave (props stand on it), the hall's banks beyond the mouth. */
export function cavernGround(x: number, z: number): number {
  const u = -z;
  if (u > U_MOUTH) return hallGround(x, z);
  const { w, stone: st } = caveSize(u), ad = Math.abs(x - cx(u));
  return floorY(u) + floorBump(x, z, Math.min(ad, w), w, 1 - st);
}

function fillCavern(grid: VoxelGrid, reg: Region, o: TerrainFill) {
  const s = grid.size, [ox, oy, oz] = grid.origin;
  const ix0 = Math.floor((reg.x0 - ox) / s), ix1 = Math.ceil((reg.x1 - ox) / s), iz0 = Math.floor((reg.z0 - oz) / s), iz1 = Math.ceil((reg.z1 - oz) / s);
  const yi = (h: number) => Math.floor((h - oy) / s), T = Math.max(1.2, 2 * s);
  const run = (x: number, z: number, a: number, b: number, c: (y: number, wy: number) => number) => {
    for (let y = a; y <= b; y++) { const v = c(y, oy + (y + 0.5) * s); if (v) grid.set(x, y, z, v); }
  };
  // the hall's banks as a heightfield (with a border, so cliff faces reach down to their neighbours)
  const W = ix1 - ix0 + 2, D = iz1 - iz0 + 2, uHi = -(oz + iz0 * s);
  const hall = uHi > U_MOUTH ? new Float32Array(W * D) : null;
  if (hall) for (let i = 0; i < W; i++) for (let k = 0; k < D; k++) hall[i * D + k] = hallGround(ox + (ix0 - 1 + i + 0.5) * s, oz + (iz0 - 1 + k + 0.5) * s);
  for (let x = ix0; x < ix1; x++) for (let z = iz0; z < iz1; z++) {
    const wx = ox + (x + 0.5) * s, wz = oz + (z + 0.5) * s, u = -wz;
    if (wx >= reg.x1 || wz >= reg.z1 || u < -12 || u > HALL_END + 20) continue;
    const gx = x + Math.round(ox / s), gz = z + Math.round(oz / s), r = hash2(gx, gz, 3);
    if (u <= U_MOUTH) { // ---- the cave: floor slab, wall shell, ceiling (the back wall around the mouth, full height)
      const { w, h, stone: st } = caveSize(u), nat = 1 - st, lx = wx - cx(u), ad = Math.abs(lx);
      const ww = w * (1 + nat * 0.3 * (fbm(u / 6.5, Math.sign(lx) * 5.3, 2, 21) - 0.5));
      const back = u > U_MOUTH - BACK, yf = floorY(u), bottom = back ? LAVA_Y - 1 : yf - 1.2 - (o.skirt ?? 0) * s, top = back ? WALL_TOP : yf + h + T;
      const col = (_y: number, wy: number) => (st > 0.5 ? stone(u, wy, r) : rock(u, wy, hash2(gx * 31 + Math.floor(wy / s), gz, 5), noise2(u / 9, wy / 4, 22)));
      if (ad > ww + T && !back) continue;
      if (ad >= ww || u < -8) { run(x, z, yi(bottom), yi(top), col); continue; } // walls, the shut temple door behind
      const fb = floorBump(wx, wz, ad, ww, nat), ft = yi(yf + fb);
      run(x, z, yi(bottom), ft, (y, wy) => (y === ft && fb < 0.05 ? (st > 0.5 ? C.stone2 : PATHS[Math.min(2, Math.floor(warmth(u) + 0.5))]) : col(y, wy)));
      run(x, z, Math.max(ft + 1, yi(yf + ceilAt(wx, wz, ad, ww, h, nat))), yi(top), col);
      continue;
    }
    // ---- the hall
    const i = x - ix0 + 1, k = z - iz0 + 1, hh = hall![i * D + k];
    // a bridge pier standing in the lava (wider at the foot), glowing cracks up it
    const pier = nearestPier(u);
    if (pier) {
      const dx = wx - pier.x, dz = wz - pier.z, d = Math.hypot(dx, dz);
      if (d < PIER_R + PIER_FLARE * 20) {
        const topY = BRIDGE_Y - BRIDGE.thickness - 0.05 - Math.max(0, (d - PIER_R) / PIER_FLARE), a = Math.atan2(dz, dx);
        run(x, z, yi(LAVA_Y - 1), yi(topY), (_y, wy) => (Math.abs(Math.sin(a * 3 + wy * 0.7)) < 0.07 ? C.ember : r < 0.5 ? C.basalt : C.basalt2));
        continue;
      }
    }
    if (hh <= LAVA_Y + 1e-6) { // the river: one flat layer (crust and molten at the same height, so crust never hides lava)
      const cell = noise2(wx / 5.5, wz / 7, 74), crack = Math.abs(cell - 0.42) < 0.035;
      grid.set(x, yi(LAVA_Y - s * 0.5), z, crack ? C.lavaHot : cell > 0.42 ? (cell > 0.6 ? C.crust : C.crust2) : cell < 0.26 ? C.lava : C.lava2);
      continue;
    }
    let lo = yi(hh);
    for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) lo = Math.min(lo, yi(hall![(i + a) * D + k + b]) + 1);
    lo = Math.max(Math.min(lo, yi(hh)), yi(LAVA_Y - 1));
    const topI = yi(hh);
    run(x, z, lo, topI, (y, wy) => {
      if (wy < LAVA_Y + 0.8 && y === topI) return r < 0.5 ? C.crust : C.crust2; // the scorched lip at the lava
      const n = noise2(wx / 9 + wy / 13, wz / 9, 34), seam = Math.abs(n - 0.5) < 0.015 && wy < LAVA_Y + 14;
      return seam ? C.ember : n < 0.35 ? C.basalt3 : n < 0.7 ? C.basalt : C.basalt2;
    });
  }
}

/** The pier nearest along the hall (piers stand every 70 m of rail). */
function nearestPier(u: number) {
  let lo = 0, hi = PIERS.length - 1;
  if (hi < 0 || u < PIERS[0].u - 5 || u > PIERS[hi].u + 5) return null;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (PIERS[m].u < u) lo = m; else hi = m; }
  return Math.abs(PIERS[lo].u - u) < Math.abs(PIERS[hi].u - u) ? PIERS[lo] : PIERS[hi];
}


/** An iron torch cage on its wall bracket (flames are the set's). Built in world space at the torch. */
function placeTorch(g: VoxelGrid, s: number) {
  const k = Math.round((s - 10) / TORCH_EVERY), t = torchAt(k), sd = t.side;
  const wall = t.x + sd * 0.3, cxp = t.x;
  g.wsegment([wall, t.y - 0.25, t.z], [cxp, t.y - 0.05, t.z], 0.035, C.iron);
  for (let a = 0; a < 6; a++) {
    const q = (a / 6) * Math.PI * 2, px = cxp + Math.cos(q) * 0.16, pz = t.z + Math.sin(q) * 0.16;
    g.wsegment([px, t.y - 0.1, pz], [cxp + Math.cos(q) * 0.2, t.y + 0.32, t.z + Math.sin(q) * 0.2], 0.018, a % 2 ? C.iron : C.iron2);
  }
  g.wellipsoid([cxp, t.y - 0.06, t.z], [0.18, 0.06, 0.18], C.iron);
  g.wellipsoid([cxp, t.y + 0.02, t.z], [0.12, 0.05, 0.12], C.soot);
  g.wellipsoid([wall + sd * 0.02, t.y + 0.9, t.z], [0.08, 0.6, 0.3], C.soot); // soot up the wall
}

export const CAVERN_SKY = {
  zenith: 0x0a0406, horizon: 0x2a0d08, fog: 0x4a1a0a, fogDensity: 0.0075,
  sunDir: [0.25, -1, 0.35] as const, sunColor: 0xff8a3a, sunI: 1.6, hemiSky: 0x6a4038, hemiGround: 0xff6a1a, hemiI: 1.6,
};

export function cavernWorld(): WorldDef {
  const route = cavernRoute();
  return {
    id: 'cavern', palette: CAVE, isWater: () => false, isGlow: (v) => CAVE_GLOW.has(v), glowIntensity: 1.8,
    bounds: CAVERN_BOUNDS, route, eye: 1.55, rig: { lane: 0, gaze: { ahead: 24, d: 0, dy: -0.4 } },
    terrain: { kind: 'height', fill: fillCavern, height: cavernGround },
    corridor: {
      half: BRIDGE.half, support: 'span', start: BRIDGE.s0 - 2, thickness: BRIDGE.thickness, clearance: 2.5, voxel: 0.125, farVoxel: 0.5, near: 200, seg: 32, range: 900,
      surface: obsidianSurface(BRIDGE.half, { glass: [C.obsidian, C.obsidian2, C.obsidian, C.obsidian2, C.obsidian, C.obsidian2, C.obsidian, C.obsidian2, C.obsidian, C.glint], edge: C.obsidianEdge, lip: 0.14 }), // nothing in the cave (`start`)
    },
    scatter: [{ id: 'torch', every: TORCH_EVERY, offset: 10, d: 0, voxel: 0.04, skip: (s) => s > route.length || s > BRIDGE.s0 - 30, place: (g, p) => placeTorch(g, p.s) }],
    sky: CAVERN_SKY, look: 'lava', lod: { decor: 0 },
  };
}
