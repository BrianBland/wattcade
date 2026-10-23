// Highway 1 coast, the first world: procedural heightfield (road on a cliff ledge, ocean to the west/left, golden hills
// inland), the road as a path corridor, guardrails / cypresses / scrub / signs as a route scatter, a baked morning sun.
// Chapter 1 (#189) lays its landmarks along it (coastLayout.ts): Turnout 1, the rollers, the creek gorge and its arch
// bridge, Lou's lot, the harbour town and the pier; the built ones are terrain structures (coastBuild.ts).
// Coordinates: metres, y up, the ride heads toward −z. Road y = 0 at z = 0.
import { VoxelGrid } from '../voxel/grid';
import { fbm, hash2, noise2, smooth } from '../voxel/noise';
import type { Region, ScatterRule, SurfaceFn, TerrainFill, WorldDef } from './def';
import { boardwalkSurface, roadSurface } from './corridor';
import {
  bridge, BRIDGE_S, CH1, COAST, COAST_FOLD, coastRoute, edgeD, gorgeAt, gorgeOff, pierGeom, pulloutAt, roadX, roadY, SEA_LEVEL, sOfZ, spanAt, spurK, spurW,
  SPURS, townAt, TURNOUT,
} from './coastLayout';
import { coastStructures, fillStructures, morningScatter } from './coastBuild';

export { CH1, COAST, COAST_FOLD, coastRoute, edgeD, pierGeom, roadX, roadY, SEA_LEVEL, sAtZ, sOfZ, TURNOUT, zOfS } from './coastLayout';
export { T as TerrainType };
const C = COAST.idx;

/** World extent (the pier reaches ~0.6 km west of the harbour). */
export const BOUNDS: Region = { x0: -2400, x1: 1800, z0: -8400, z1: 160 };
const benchSlope = (z: number) => 0.06 + 0.35 * Math.min(1, spurK(z));

export const enum T { ROAD = 1, GRAVEL, VERGE, CLIFF, SHORE, SEA, INLAND, CUT, TURNOUT, SAND, PAVE }

const STACKS: Array<[number, number, number, number]> = [ // x offset from edge, z, radius, height above sea
  [-26, -40, 5, 13], [-48, -95, 8, 9], [-20, -128, 3.5, 7], [-70, -210, 11, 22], [-35, -300, 6, 10], [-90, -520, 14, 26], [-60, -820, 18, 30],
  [-40, -7880, 12, 24], [-70, -7990, 7, 12], // off the lighthouse point
];
let stackXZ: Array<[number, number, number, number]> | null = null;
const stacks = () => (stackXZ ??= STACKS.map(([ox, sz, r, sh]) => [roadX(sz) + edgeD(sz) + ox, sz, r, sh]));

export interface Sample { h: number; t: T; d: number }

export function sample(x: number, z: number, out: Sample): Sample {
  const rx = roadX(z), ry = roadY(z), d = x - rx, s = sOfZ(z), tw = townAt(s);
  const ad = Math.abs(d);
  out.d = d;
  if (ad <= 6) { out.h = ry - (ad > 5 ? 0.12 : 0); out.t = ad <= 5 ? T.ROAD : T.GRAVEL; return gorge(x, z, d, out); }
  if (d > 0) {
    // inland: a short rock cut, then golden hills climbing to the ridgeline (pushed back behind the town)
    const dd = d - 70 * tw;
    if (dd <= 6) { out.h = ry - 0.12; out.t = d < 11 ? T.PAVE : T.INLAND; return out; }
    const cut = Math.min((dd - 6) * 0.7, 0.25 + 0.6 * fbm(x / 9, z / 9, 3, 2));
    const slope = Math.max(0, dd - 9) * (0.12 + 0.2 * fbm(x / 120, z / 120, 3, 4)) * (1 - smooth(60, 160, dd)) + smooth(30, 200, dd) * 40;
    const hills = 60 * fbm(x / 160, z / 160, 4, 7) * smooth(20, 160, dd) + 520 * smooth(90, 1400, dd) * (0.45 + 0.8 * fbm(x / 500, z / 500, 4, 9));
    let spur = 0;
    for (const sp of SPURS) spur += sp.h * spurW(z, sp) * (0.5 + 0.5 * smooth(0, 700, dd)) * smooth(6, 50, dd);
    out.h = ry + cut + slope + hills + spur - 0.12 * tw;
    out.t = dd < 6 + cut / 0.7 + 0.3 ? T.CUT : T.INLAND;
    return gorge(x, z, d, out);
  }
  // sea side: a bench to the cliff edge (flat in pullouts and along the harbour front)
  const e = edgeD(z), turn = pulloutAt(s), flat = Math.max(turn, tw);
  if (d >= e) {
    out.h = ry - 0.12 - (-d - 6) * benchSlope(z) * (1 - flat);
    out.t = turn > 0.5 && d < -6.5 && d > e + 1.6 + fbm(z / 3, 1, 2, 33) ? T.TURNOUT : tw > 0.5 && d > -16 ? T.PAVE : T.VERGE;
    return gorge(x, z, d, out);
  }
  const past = e - d; // metres beyond the edge
  const topY = ry - 0.12 - (-e - 6) * benchSlope(z) * (1 - flat);
  if (tw > 0.02) { // the harbour: a sea wall, a beach, then the sea floor shelving away
    const wall = SEA_LEVEL + 1.6 - past * 0.07 - Math.max(0, past - 40) * 0.25 + (fbm(x / 6, z / 6, 2, 18) - 0.5) * 0.3;
    const h = topY - (topY - wall) * smooth(0, 0.8, past);
    out.h = h * tw + harbourless(x, z, d, e, past, topY) * (1 - tw);
    out.t = out.h <= SEA_LEVEL ? T.SEA : past < 1 ? T.CLIFF : T.SAND;
    return out;
  }
  out.h = harbourless(x, z, d, e, past, topY);
  const cove = fbm(x / 40, z / 40, 2, 17), run = 2.5 + 6 * fbm(x / 30, z / 30, 3, 11);
  out.t = out.h <= SEA_LEVEL ? T.SEA : out.h < SEA_LEVEL + 1.6 ? (cove > 0.58 && past < run + 14 ? T.SAND : T.SHORE) : T.CLIFF;
  return gorge(x, z, d, out);
}

/** Cliff face, rocky shelf, sea floor and sea stacks beyond the edge. */
function harbourless(x: number, z: number, _d: number, _e: number, past: number, topY: number): number {
  const run = 2.5 + 6 * fbm(x / 30, z / 30, 3, 11);
  const ledge = Math.round(fbm(x / 6, z / 6, 2, 12) * 3) * 1.1;
  let h = topY - (topY - (SEA_LEVEL + 1.2)) * smooth(0, run, past) - ledge * smooth(0.5, 2, past) * (1 - smooth(run - 1, run, past));
  const shelf = SEA_LEVEL + 1.2 - Math.max(0, past - run - 2 - 6 * fbm(x / 12, z / 12, 2, 13)) * 0.4;
  if (past > run) h = shelf + (fbm(x / 3, z / 3, 2, 14) - 0.5) * 1.2;
  for (const [sx, sz, r, sh] of stacks()) {
    if (Math.abs(z - sz) > r * 1.6) continue;
    const dist = Math.hypot(x - sx, (z - sz) * 0.8) / (r * (0.8 + 0.4 * fbm(x / 4, z / 4, 2, 15)));
    if (dist < 1) h = Math.max(h, SEA_LEVEL + sh * (1 - dist ** 5) + (fbm(x / 2, z / 2, 2, 16) - 0.5) * 1.5);
  }
  return h;
}

/** The creek gorge under the arch bridge cuts everything (road included: the bridge deck spans it). */
function gorge(x: number, z: number, d: number, out: Sample): Sample {
  if (Math.abs(gorgeOff(x, z)) > 300) return out;
  const g = gorgeAt(x, z, d);
  if (g.h >= out.h) return out;
  out.h = g.h;
  out.t = out.h <= SEA_LEVEL ? T.SEA : g.floor ? (d < -4 ? T.SAND : T.SHORE) : T.CLIFF;
  return out;
}

/** Voxelize the heightfield into `grid` over `reg` (x1/z1 exclusive). */
export function fillTerrain(grid: VoxelGrid, reg: Region, opts: TerrainFill) {
  const s = grid.size, [ox, oy, oz] = grid.origin;
  const ix0 = Math.floor((reg.x0 - ox) / s), ix1 = Math.ceil((reg.x1 - ox) / s), iz0 = Math.floor((reg.z0 - oz) / s), iz1 = Math.ceil((reg.z1 - oz) / s);
  const W = ix1 - ix0 + 3, D = iz1 - iz0 + 3;
  const H = new Float32Array(W * D), TT = new Uint8Array(W * D), DD = new Float32Array(W * D);
  // corridor carve per column: NaN = untouched, -Infinity = skip (inside a ground corridor), else a cap height (m)
  const CC = new Float32Array(W * D).fill(NaN), cor = opts.corridor;
  const smp: Sample = { h: 0, t: T.ROAD, d: 0 };
  for (let i = 0; i < W; i++) for (let k = 0; k < D; k++) {
    const wx = ox + (ix0 - 1 + i + 0.5) * s, wz = oz + (iz0 - 1 + k + 0.5) * s;
    sample(wx, wz, smp);
    H[i * D + k] = smp.h; TT[i * D + k] = smp.t; DD[i * D + k] = smp.d;
    if (cor) { const c = cor.at(wx, wz, s); if (c !== null) CC[i * D + k] = c === 'skip' ? -Infinity : c; }
  }
  const yi = (h: number) => Math.floor((h - oy) / s);
  /** Top voxel index of column (i, k), as filled (road dithering + the corridor cap). */
  const topAt = (i: number, k: number) => {
    const t = TT[i * D + k] as T, h = H[i * D + k], wx = ox + (ix0 - 1 + i + 0.5) * s, wz = oz + (iz0 - 1 + k + 0.5) * s;
    // road steps: clumped noise in the rounding so each step edge wanders and crumbles a little instead of a ruler line
    let top = (t === T.ROAD || t === T.GRAVEL) && opts.lines ? yi(h + (noise2(wx * 1.7, wz * 1.7, 41) - 0.5) * s * 0.55) : yi(h);
    const cap = CC[i * D + k];
    if (cap > -Infinity) top = Math.min(top, yi(cap) - 1);
    return top;
  };
  const seaY = Math.round((SEA_LEVEL - oy) / s) - 1; // water voxels' top face sits exactly at SEA_LEVEL on every LOD
  for (let i = 1; i < W - 1; i++) for (let k = 1; k < D - 1; k++) {
    const x = ix0 - 1 + i, z = iz0 - 1 + k, wx = ox + (x + 0.5) * s, wz = oz + (z + 0.5) * s;
    if (wx >= reg.x1 || wz >= reg.z1) continue;
    const h = H[i * D + k], t = TT[i * D + k] as T, d = DD[i * D + k], cc = CC[i * D + k];
    if (cc === -Infinity) continue;
    if (t === T.SEA) {
      if (opts.skipSea) continue;
      const depth = SEA_LEVEL - h;
      let land = 0;
      for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (H[(i + a) * D + k + b] > SEA_LEVEL) land++;
      const r = hash2(x, z, 3);
      const kelpN = fbm(wx / 16, wz / 16, 3, 21);
      const swell = Math.sin((d + fbm(wx / 20, wz / 20, 2, 22) * 9) * 0.55) > 0.82;
      let c = depth < 0.9 ? C.shallow : depth < 3.5 ? C.sea : C.deep;
      if (land && r < 0.85) c = r < 0.6 ? C.foam : C.foam2;
      else if (depth < 0.5) c = r < 0.5 ? C.foam2 : C.shallow;
      else if (kelpN > 0.6 && depth > 1.5 && d > -90 && r < (kelpN - 0.6) * 6) c = r < 0.15 ? C.kelp : C.kelp2;
      else if (swell) c = depth < 3.5 ? C.sea2 : C.sea;
      else if (r < 0.006) c = C.foam2;
      grid.set(x, seaY, z, c);
      continue;
    }
    let top = topAt(i, k);
    const capped = cc > -Infinity; // coarse columns touching the road
    let lo = top;
    for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) lo = Math.min(lo, yi(H[(i + a) * D + k + b]) + 1);
    lo = Math.max(Math.min(lo, top), seaY - 1);
    if (capped) lo = Math.min(lo, top - 2); // keep a capped column solid (never a hole beside the road)
    const steep = top - lo > 1;
    if (opts.skirt && (i === 1 || k === 1 || i >= W - 3 || k >= D - 3)) lo = Math.max(lo - opts.skirt, seaY - 1);
    for (let y = lo; y <= top; y++) {
      const wy = oy + (y + 0.5) * s, r = hash2(x * 31 + y, z, 7);
      let c: number;
      const below = top - y;
      if (t === T.ROAD) {
        const ad = Math.abs(d);
        c = r < 0.33 ? C.asphalt : r < 0.66 ? C.asphalt2 : C.asphalt3;
        if (opts.lines && below === 0) {
          if (ad < s * 1.01) c = C.yellow;
          else if (ad > 3.55 && ad < 3.55 + Math.max(s, 0.25)) c = C.white;
        }
      } else if (t === T.GRAVEL || t === T.TURNOUT) c = below > 0 ? C.dirt : r < 0.5 ? C.gravel : C.gravel2;
      else if (t === T.CUT || (t === T.INLAND && steep && below > 0)) c = Math.floor(wy / 0.9 + fbm(wx / 5, wz / 5, 2, 8) * 2) % 2 ? C.cutA : C.cutB;
      else if (t === T.CLIFF || (t !== T.INLAND && steep && below > 0)) {
        const band = Math.floor(wy / 1.3 + fbm(wx / 7, wz / 7, 2, 9) * 2.5) % 3;
        c = wy < SEA_LEVEL + 1.4 ? C.rockWet : band === 0 ? C.rockA : band === 1 ? C.rockB : C.rockC;
        if (below === 0 && !steep && wy > SEA_LEVEL + 3) c = r < 0.5 ? C.grassG2 : C.ice;
      } else if (t === T.SHORE) c = r < 0.7 ? C.rockWet : C.rockGrey;
      else if (t === T.SAND) c = r < 0.6 ? C.sand : C.sand2;
      else if (t === T.PAVE) c = below > 0 ? C.dirt : r < 0.5 ? C.pave : C.pave2;
      else if (t === T.VERGE) {
        const ice = fbm(wx / 6, wz / 6, 3, 10);
        if (below > 0) c = C.dirt;
        else if (ice > 0.47) c = r < 0.18 ? C.iceFlower : r < 0.26 ? C.iceFlower2 : r < 0.6 ? C.ice : C.ice2;
        else c = r < 0.4 ? C.grass : r < 0.7 ? C.grass2 : r < 0.85 ? C.grass3 : C.grassG;
      } else { // inland grass
        const g = fbm(wx / 30, wz / 30, 3, 11);
        c = below > 0 ? (steep ? C.cutB : C.dirt) : g > 0.62 ? (r < 0.5 ? C.grassG : C.grassG2) : r < 0.45 ? C.grass : r < 0.8 ? C.grass2 : r < 0.97 ? C.grass3 : C.poppy;
      }
      grid.set(x, y, z, c);
    }
    // geometric detail at half size: bumps on top, rubble at the foot of one-step risers
    const dec = opts.decor;
    if (dec) {
      const dg = dec.grid, host = grid.get(x, top, z), clump = noise2(wx / (6 * s), wz / (6 * s), 61);
      const nTop = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([a, b]) => (TT[(i + a) * D + k + b] === T.SEA ? -1e9 : topAt(i + a, k + b)));
      const fx = 2 * x, fz = 2 * z, fy = 2 * (top + 1);
      if (host && t !== T.ROAD && nTop.every((n) => n <= top) && hash2(x, z, 62) < dec.density * (0.15 + 0.85 * clump)) { // no litter on the asphalt
        const r = hash2(x, z, 63), sx = r < 0.5 ? 0 : 1, sz = hash2(z, x, 64) < 0.5 ? 0 : 1;
        dg.set(fx + sx, fy, fz + sz, host);
        if (r > 0.65) dg.set(fx + (1 - sx), fy, fz + sz, host);
        if (r > 0.85) dg.set(fx + sx, fy + 1, fz + sz, host);
      }
      // rubble: this column is one step above a neighbour → half-fill the foot of the riser on the neighbour's side
      [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([a, b], n) => {
        if (nTop[n] !== top - 1 || hash2(x * 3 + a, z * 3 + b, 65) > dec.density * 1.6) return;
        const along = hash2(x + a, z + b, 66) < 0.5 ? 0 : 1;
        const gx = a > 0 ? fx + 2 : a < 0 ? fx - 1 : fx + along, gz = b > 0 ? fz + 2 : b < 0 ? fz - 1 : fz + along;
        const c = grid.get(x + a, top - 1, z + b) || host;
        if (c) { dg.set(gx, 2 * top, gz, c); if (hash2(x, z * 5 + n, 67) < 0.35) dg.set(a !== 0 ? gx : gx + (along ? -1 : 1), 2 * top, b !== 0 ? gz : gz + (along ? -1 : 1), c); }
      });
    }
    // coastal scrub on the hills
    if (opts.scrub && t === T.INLAND && d > 9) {
      const sN = fbm(wx / 11, wz / 11, 3, 18);
      if (sN > 0.6) {
        const hgt = Math.max(1, Math.round(((sN - 0.6) * 8 + hash2(x, z, 19) * 0.6) / Math.max(s, 0.25) * 0.5));
        for (let y = 1; y <= hgt; y++) { const r = hash2(x, z * 7 + y, 20); grid.set(x, top + y, z, r < 0.4 ? C.scrub : r < 0.8 ? C.scrub2 : C.scrub3); }
      }
    }
  }  // the built landmarks (bridge, pier, town, Lou's) at this tile's voxel size
  fillStructures(grid, reg, coastStructures(groundAt));
}

/** A Monterey cypress: twisted trunk, flat wind-swept canopy leaning inland (+x). */
export function cypress(g: VoxelGrid, base: readonly number[], size: number, seed: number) {
  const [bx, by, bz] = base;
  const lean = 0.6;
  const top = [bx + size * lean * 0.5, by + size * 0.75, bz];
  g.wsegment([bx, by - 0.5, bz], [bx + size * 0.12, by + size * 0.35, bz + 0.3], 0.35 * size / 8, C.bark);
  g.wsegment([bx + size * 0.12, by + size * 0.35, bz + 0.3], top, 0.28 * size / 8, C.bark2);
  g.wsegment([bx + size * 0.12, by + size * 0.35, bz + 0.3], [bx - size * 0.35, by + size * 0.62, bz - 0.8], 0.2 * size / 8, C.bark);
  const pads = 9;
  for (let i = 0; i < pads; i++) {
    const a = hash2(i, seed, 1), b = hash2(i, seed, 2), cc = hash2(i, seed, 3);
    const cx = bx - size * 0.45 + a * size * 1.3, cz = bz + (b - 0.5) * size * 0.9, cy = by + size * (0.62 + 0.25 * cc) + (cx - bx) * 0.12;
    g.wellipsoid([cx, cy, cz], [size * (0.28 + 0.18 * b), size * 0.11, size * (0.25 + 0.15 * a)], (x, y, z) => {
      const r = hash2(x * 13 + y, z, seed);
      return r < 0.4 ? C.cypress : r < 0.8 ? C.cypress2 : C.cypress3;
    });
  }
}

const C_WATER = new Set([C.sea, C.sea2, C.deep, C.shallow, C.foam, C.foam2, C.kelp, C.kelp2]);
export const groundAt = (x: number, z: number) => sample(x, z, { h: 0, t: T.ROAD, d: 0 }).h;

/** Route metres with something built on the sea side (no guardrail, no roadside trees): pullouts, the bridge, the town. */
const builtUp = (s: number) => {
  const b = bridge();
  return pulloutAt(s) > 0.01 || (s > b.s0 - 12 && s < b.s1 + 12) || s > CH1.junction - CH1.townBefore - 40;
};
const nearGorge = (s: number, m: number) => Math.abs(s - BRIDGE_S) < m;
const inTurnout = (z: number) => pulloutAt(sOfZ(z));

/** A parked camper van at the turnout (0.1 m voxels, built in world space). */
function van(g: VoxelGrid, x0: number, y0: number, z0: number) {
  const bx = g.vi(x0, 0), by = g.vi(y0, 1), bz = g.vi(z0, 2);
  const box = (a: number, b: number, c: number, d: number, e: number, f: number, v: number) => g.box(bx + a, by + b, bz + c, bx + d, by + e, bz + f, v);
  box(-9, 3, -22, 9, 11, 22, C.vanTeal); box(-9, 12, -22, 9, 19, 22, C.vanWhite); box(-8, 20, -20, 8, 20, 20, C.vanWhite);
  box(-10, 13, -18, 10, 17, 14, C.glass); box(-8, 13, -23, 8, 18, -23, C.glass); box(-9, 12, -23, 9, 12, -23, C.vanWhite);
  box(-2, 6, -23, 2, 9, -23, C.vanWhite); box(-9, 3, -23, 9, 4, -23, C.metal);
  for (const [wx, wz] of [[-9, -15], [9, -15], [-9, 15], [9, 15]]) for (let a = 0; a < Math.PI * 2; a += 0.2) g.set(bx + wx + (wx > 0 ? 1 : -1), by + 3 + Math.round(Math.sin(a) * 3), bz + wz + Math.round(Math.cos(a) * 3), C.signBlack);
  box(-6, 21, -10, 6, 22, 10, C.vanOrange);
}

function sign(g: VoxelGrid, x: number, y: number, z: number, kind: 'shield' | 'curve') {
  g.wbox([x - 0.04, y - 0.2, z - 0.04], [x + 0.04, y + 2.1, z + 0.04], C.metal);
  if (kind === 'shield') { // CA-1 route shield, a green spade facing the rider (+z)
    for (let ix = -8; ix <= 8; ix++) for (let iy = 0; iy <= 16; iy++) {
      const u = ix / 8, v = iy / 16; // v 0 = bottom
      const halfW = v > 0.75 ? 1 - (v - 0.75) * 1.6 : 0.55 + v * 0.6;
      if (Math.abs(u) > Math.min(1, halfW)) continue;
      const edge = Math.abs(u) > Math.min(1, halfW) - 0.14 || iy === 0 || (v > 0.9);
      const one = !edge && Math.abs(ix) <= 1 && iy >= 3 && iy <= 11 || (!edge && ix === -2 && iy === 10);
      g.set(g.vi(x, 0) + ix, g.vi(y + 1.6, 1) + iy, g.vi(z + 0.06, 2), edge ? C.signWhite : one ? C.signWhite : C.signGreen);
    }
  } else { // curve warning diamond
    for (let ix = -8; ix <= 8; ix++) for (let iy = -8; iy <= 8; iy++) {
      if (Math.abs(ix) + Math.abs(iy) > 8) continue;
      const edge = Math.abs(ix) + Math.abs(iy) >= 7.5;
      const arrow = (iy === -2 && ix >= -3 && ix <= 2) || (ix === 2 && iy >= -2 && iy <= 3) || (Math.abs(ix - 2) + Math.abs(iy - 3) <= 1 && iy >= 2);
      g.set(g.vi(x, 0) + ix, g.vi(y + 1.75, 1) + iy, g.vi(z + 0.06, 2), edge || arrow ? C.signBlack : C.signYellow);
    }
  }
}

const scrubClump = (g: VoxelGrid, x: number, y: number, z: number, seed: number) =>
  g.wellipsoid([x, y + 0.2, z], [0.6 + hash2(seed, 3, 40), 0.55, 0.7 + hash2(seed, 4, 40)], (a, b, c) => { const r = hash2(a * 3 + b, c, 41); return r < 0.4 ? C.scrub : r < 0.8 ? C.scrub2 : C.scrub3; });

export const coastScatter = (): ScatterRule[] => [
  { // W-beam guardrail on the sea side: a post every 1.9 m and the beam to the next post (gap at the turnout)
    id: 'guardrail', every: 1.9, d: -6.4, voxel: 1 / 16, skip: builtUp,
    place(g, p) {
      const y = roadY(p.z) - 0.12, len = 1.9, ex = p.x + p.tx * len, ez = p.z + p.tz * len, ey = roadY(ez) - 0.12;
      for (const [dy0, dy1, off, c] of [[0.52, 0.8, 0, C.railMetal], [0.6, 0.72, -0.045, C.railMetal], [0.64, 0.68, 0.005, C.railDark]] as const) {
        const ox = -p.tz * off, oz = p.tx * off, mid = (dy0 + dy1) / 2, r = (dy1 - dy0) / 2;
        g.wsegment([p.x + ox, y + mid, p.z + oz], [ex + ox, ey + mid, ez + oz], Math.max(r, 0.035), c);
      }
      g.wbox([p.x + 0.04, y - 0.3, p.z - 0.07], [p.x + 0.2, y + 0.76, p.z + 0.07], C.post);
    },
  },
  { id: 'cypress-sea', every: 37, offset: 9, d: [-15, -10.5], chance: 0.45, voxel: 0.25, skip: (s) => builtUp(s) || nearGorge(s, 140),
    place: (g, p) => cypress(g, [p.x, p.y, p.z], 8 + (p.seed % 5), p.seed) },
  { id: 'cypress-inland', every: 29, offset: 3, d: [9, 42], chance: 0.55, voxel: 0.25, skip: (s) => nearGorge(s, 110) || s > CH1.junction - CH1.townBefore - 60,
    place: (g, p) => cypress(g, [p.x, p.y, p.z], 7 + (p.seed % 8), p.seed) },
  { id: 'scrub', every: 5.5, d: [-8.6, -7], chance: 0.35, voxel: 0.25, skip: builtUp, place: (g, p) => scrubClump(g, p.x, p.y, p.z, p.seed) },
  { id: 'shield', every: 640, offset: 66, d: 6.3, voxel: 1 / 16, skip: builtUp, place: (g, p) => sign(g, p.x, roadY(p.z), p.z, 'shield') },
  { id: 'curve', every: 470, offset: 158, d: 6.3, voxel: 1 / 16, skip: builtUp, place: (g, p) => sign(g, p.x, roadY(p.z), p.z, 'curve') },
  { id: 'milepost', every: 1609.34, offset: 110, d: 6.0, voxel: 1 / 16, skip: builtUp, place(g, p) { // a white mile marker post
    const y = roadY(p.z);
    g.wbox([p.x - 0.06, y - 0.2, p.z - 0.03], [p.x + 0.06, y + 1.1, p.z + 0.03], C.signWhite);
    g.wbox([p.x - 0.05, y + 0.75, p.z + 0.03], [p.x + 0.05, y + 1.0, p.z + 0.05], C.signGreen);
  } },
  { // the turnout: van, split-rail fence on the cliff edge, a few boulders
    id: 'turnout', every: 1e9, offset: sOfZ(TURNOUT.z0 + 12), d: 0, voxel: 0.1,
    place(g) {
      const z0 = -82;
      van(g, roadX(z0) - 10.5, roadY(z0) - 0.12 + 0.02, z0);
      for (let z = TURNOUT.z0 + 4; z < -74; z += 1 / 10) {
        const x = roadX(z) + edgeD(z) + 0.9, y = roadY(z) - 0.12 - (-edgeD(z) - 6) * 0.06 * (1 - inTurnout(z));
        g.wbox([x - 0.05, y + 0.45, z - 0.05], [x + 0.05, y + 0.56, z + 0.05], C.post);
        g.wbox([x - 0.05, y + 0.92, z - 0.05], [x + 0.05, y + 1.03, z + 0.05], C.post);
        if (Math.abs(z - Math.round(z / 2.5) * 2.5) < 0.07) g.wbox([x - 0.08, y - 0.3, z - 0.08], [x + 0.08, y + 1.12, z + 0.08], C.post2);
      }
      for (const [zz, r] of [[-67.6, 0.45], [-64.5, 0.5], [-61, 0.65]] as const) {
        const x = roadX(zz) + edgeD(zz) + 0.3, y = roadY(zz) - 0.12;
        g.wellipsoid([x, y + r * 0.3, zz], [r * 1.2, r, r], (a, b, c) => (hash2(a * 7 + b, c, 50) < 0.6 ? C.rockGrey : C.rockB));
      }
    },
  },
  ...morningScatter(),
];

export const COAST_SKY = {
  zenith: 0x5aa9e0, horizon: 0xe9e4d6, fog: 0xdfe6e4, fogDensity: 0.0008,
  sunDir: [-0.5, 0.52, 0.62] as const, sunColor: 0xfff0d2, sunI: 2.6, hemiSky: 0xc4e2f5, hemiGround: 0xb8975e, hemiI: 1.05,
  plane: { y: SEA_LEVEL - 0.5, color: COAST.hex.deep }, shadows: true,
};

/** Asphalt on the highway and the harbour street, planks across the pier. */
function coastSurface(): SurfaceFn {
  const road = roadSurface({ asphalt: [C.asphalt, C.asphalt2, C.asphalt3], yellow: C.yellow, white: C.white, gravel: [C.gravel, C.gravel2], dirt: C.dirt });
  const planks = boardwalkSurface({ plank: [C.plank, C.plank2], gap: C.plankGap, plankLen: 0.32 });
  const start = pierGeom().start;
  return (d, s, below, r, v) => (s > start ? planks(d, s, below, r, v) : road(d, s, below, r, v));
}

export function coastWorld(): WorldDef {
  const r = coastRoute();
  return {
    id: 'coast', palette: COAST, fold: COAST_FOLD, isWater: (v) => C_WATER.has(v),
    bounds: BOUNDS, route: r, eye: 1.5, rig: { lane: 4.2, gaze: { ahead: 74, d: -16, dy: -5.5 } },
    terrain: { kind: 'height', fill: fillTerrain, height: (x, z) => Math.max(groundAt(x, z), SEA_LEVEL) },
    corridor: {
      half: 6.2, support: 'ground', span: spanAt, thickness: 0.5, clearance: 6, edgeSkirt: 0.4, voxel: 0.125, farVoxel: 0.5, near: 200, seg: 32, range: 1500,
      surface: coastSurface(),
    },
    scatter: coastScatter(),
    sun: { coarse: { cell: 12, ...BOUNDS }, patches: [{ cell: 2, size: 512, maxVoxel: 4 }, { cell: 0.25, size: 128, maxVoxel: 0.25, apron: 48 }] },
    waterAmp: 0.09, sky: COAST_SKY, look: 'morning',
  };
}
