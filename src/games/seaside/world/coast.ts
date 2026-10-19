// Highway 1 coast: procedural terrain (road on a cliff ledge, ocean to the west/left, hills inland) voxelized at three LODs.
// Coordinates: metres, y up, the ride heads toward −z. Road y = 0 at z = 0.
import { VoxelGrid } from '../voxel/grid';
import { definePalette } from '../voxel/palette';
import { fbm, hash2, smooth, clamp } from '../voxel/noise';

export const COAST = definePalette({
  asphalt: 0x67686b, asphalt2: 0x646568, asphalt3: 0x6a6b6e, yellow: 0xf2c230, white: 0xf3f0e6,
  gravel: 0xb9a68a, gravel2: 0xb09d81, dirt: 0x9a6a46,
  grass: 0xe2b84c, grass2: 0xd6a83c, grass3: 0xeac869, grassG: 0x9db04a, grassG2: 0x7f9d3c,
  scrub: 0x5f8a36, scrub2: 0x4c7a2e, scrub3: 0x73a040,
  ice: 0x77a845, ice2: 0x8cba50, iceFlower: 0xe0459a, iceFlower2: 0xf06fb5, poppy: 0xf7922a,
  rockA: 0xb07c5a, rockB: 0x9c6a4c, rockC: 0xc4936c, rockWet: 0x5b4a44, rockGrey: 0x8a8580,
  cutA: 0xc98a52, cutB: 0xb5773f,
  sand: 0xecd6a2, sand2: 0xe2c992,
  sea: 0x1f95b8, sea2: 0x2aa6c6, deep: 0x16739e, shallow: 0x37c4c9, foam: 0xf4fbff, foam2: 0xcfeef4, kelp: 0x8a7a2e, kelp2: 0x6b6224,
  railMetal: 0xc5cbd2, railDark: 0x8f969e, post: 0x7a5a3e, post2: 0x6a4c33,
  bark: 0x6b4a35, bark2: 0x5a3d2b, cypress: 0x2f6b3f, cypress2: 0x3d7d48, cypress3: 0x285c36,
  signGreen: 0x1f7a4a, signWhite: 0xf6f6f2, signYellow: 0xf5c400, signBlack: 0x1d1d1d, metal: 0x9aa1a8,
  cloud: 0xfbfdff, cloud2: 0xeef3f6, vanTeal: 0x2fb5a6, vanWhite: 0xf4efe2, vanOrange: 0xf08a3c, glass: 0x2d4a63,
});
const C = COAST.idx;

/** Random colour variants folded into their base colour (for greedy meshing; shader noise supplies the variety). */
export const COAST_FOLD = (() => {
  const m = new Uint8Array(256).map((_, i) => i);
  const fold: Array<[keyof typeof C, keyof typeof C]> = [['asphalt2', 'asphalt'], ['asphalt3', 'asphalt'], ['gravel2', 'gravel'], ['grass2', 'grass'], ['grass3', 'grass'],
    ['grassG2', 'grassG'], ['scrub2', 'scrub'], ['scrub3', 'scrub'], ['ice2', 'ice'], ['iceFlower2', 'iceFlower'], ['sand2', 'sand'], ['kelp2', 'kelp'],
    ['cypress2', 'cypress'], ['cypress3', 'cypress'], ['bark2', 'bark'], ['cloud2', 'cloud']];
  for (const [a, b] of fold) m[C[a]] = C[b];
  return m;
})();

export const SEA_LEVEL = -16;

/** Mountain spurs that run down to the sea as headlands; the road swings out around each one. */
const SPURS: Array<{ z: number; w: number; h: number; out: number }> = [
  { z: -640, w: 130, h: 260, out: 150 }, { z: -1250, w: 190, h: 420, out: 220 }, { z: -2050, w: 280, h: 600, out: 300 }, { z: -3050, w: 380, h: 760, out: 380 },
];
const spurW = (z: number, sp: (typeof SPURS)[number]) => Math.exp(-(((z - sp.z) / sp.w) ** 2));
/** Road centre-line x(z) and elevation y(z). */
export const roadX = (z: number) => 90 * (Math.cos(z / 360) - 1) + 6 * (Math.sin(z / 75 + 1) - Math.sin(1)) - SPURS.reduce((a, sp) => a + sp.out * 0.8 * spurW(z, sp), 0);
const spurK = (z: number) => SPURS.reduce((a, sp) => a + spurW(z, sp), 0);
export const roadY = (z: number) => -z * 0.016 + 1.1 * Math.sin(z / 60);
/** Turnout on the sea side (panel 03). */
export const TURNOUT = { z0: -84, z1: -56 };
const inTurnout = (z: number) => smooth(TURNOUT.z0 - 6, TURNOUT.z0 + 4, z) * (1 - smooth(TURNOUT.z1 - 4, TURNOUT.z1 + 6, z));
/** Cliff edge offset from road centre (negative = sea side). */
export const edgeD = (z: number) => -8.5 - 6 * fbm(z / 22, 3.3, 3, 5) * (1 - inTurnout(z)) - 7 * inTurnout(z) - SPURS.reduce((a, sp) => a + sp.out * 0.35 * spurW(z, sp), 0);
const benchSlope = (z: number) => 0.06 + 0.35 * Math.min(1, spurK(z));

export const enum T { ROAD = 1, GRAVEL, VERGE, CLIFF, SHORE, SEA, INLAND, CUT, TURNOUT, SAND }

const STACKS: Array<[number, number, number, number]> = [ // x offset from edge, z, radius, height above sea
  [-26, -40, 5, 13], [-48, -95, 8, 9], [-20, -128, 3.5, 7], [-70, -210, 11, 22], [-35, -300, 6, 10], [-90, -520, 14, 26], [-60, -820, 18, 30],
];

export interface Sample { h: number; t: T; d: number }

export function sample(x: number, z: number, out: Sample): Sample {
  const rx = roadX(z), ry = roadY(z), d = x - rx;
  const ad = Math.abs(d);
  out.d = d;
  if (ad <= 6) { out.h = ry - (ad > 5 ? 0.12 : 0); out.t = ad <= 5 ? T.ROAD : T.GRAVEL; return out; }
  if (d > 0) {
    // inland: a short rock cut, then golden hills climbing to the ridgeline
    const cut = Math.min((d - 6) * 0.7, 0.25 + 0.6 * fbm(x / 9, z / 9, 3, 2));
    const slope = Math.max(0, d - 9) * (0.12 + 0.2 * fbm(x / 120, z / 120, 3, 4)) * (1 - smooth(60, 160, d)) + smooth(30, 200, d) * 40;
    const hills = 60 * fbm(x / 160, z / 160, 4, 7) * smooth(20, 160, d) + 520 * smooth(90, 1400, d) * (0.45 + 0.8 * fbm(x / 500, z / 500, 4, 9));
    let spur = 0;
    for (const sp of SPURS) spur += sp.h * spurW(z, sp) * (0.5 + 0.5 * smooth(0, 700, d)) * smooth(6, 50, d);
    out.h = ry + cut + slope + hills + spur;
    out.t = d < 6 + cut / 0.7 + 0.3 ? T.CUT : T.INLAND;
    return out;
  }
  // sea side
  const e = edgeD(z);
  const turn = inTurnout(z);
  if (d >= e) {
    out.h = ry + (roadY(-70) - ry) * turn * smooth(-6, -8, d) - 0.12 - (-d - 6) * benchSlope(z) * (1 - turn);
    out.t = turn > 0.5 && d < -6.5 && d > e + 1.6 + fbm(z / 3, 1, 2, 33) ? T.TURNOUT : T.VERGE;
    return out;
  }
  const past = e - d; // metres beyond the edge
  const topY = ry - 0.12 - (-e - 6) * benchSlope(z) * (1 - turn);
  const run = 2.5 + 6 * fbm(x / 30, z / 30, 3, 11);
  const ledge = Math.round(fbm(x / 6, z / 6, 2, 12) * 3) * 1.1;
  let h = topY - (topY - (SEA_LEVEL + 1.2)) * smooth(0, run, past) - ledge * smooth(0.5, 2, past) * (1 - smooth(run - 1, run, past));
  // rocky shelf, then the sea floor
  const shelf = SEA_LEVEL + 1.2 - Math.max(0, past - run - 2 - 6 * fbm(x / 12, z / 12, 2, 13)) * 0.4;
  if (past > run) h = shelf + (fbm(x / 3, z / 3, 2, 14) - 0.5) * 1.2;
  for (const [ox, sz, r, sh] of STACKS) {
    const sx = roadX(sz) + edgeD(sz) + ox, dist = Math.hypot(x - sx, (z - sz) * 0.8) / (r * (0.8 + 0.4 * fbm(x / 4, z / 4, 2, 15)));
    if (dist < 1) h = Math.max(h, SEA_LEVEL + sh * (1 - dist ** 5) + (fbm(x / 2, z / 2, 2, 16) - 0.5) * 1.5);
  }
  out.h = h;
  const cove = fbm(x / 40, z / 40, 2, 17);
  out.t = h <= SEA_LEVEL ? T.SEA : h < SEA_LEVEL + 1.6 ? (cove > 0.58 && past < run + 14 ? T.SAND : T.SHORE) : T.CLIFF;
  return out;
}

export interface Region { x0: number; x1: number; z0: number; z1: number }
const inR = (r: Region, x: number, z: number) => x >= r.x0 && x < r.x1 && z >= r.z0 && z < r.z1;

export interface CoastOpts { detail: 'still' | 'fast' }
export const NEAR: Region = { x0: -80, x1: 46, z0: -140, z1: 10 };
export const MID: Region = { x0: -360, x1: 360, z0: -760, z1: 60 };
export const FAR: Region = { x0: -2400, x1: 1800, z0: -3600, z1: 120 };

export interface FillOpts { lines: boolean; skipSea: boolean; scrub: boolean; /** extra voxels of wall below border columns (hides LOD cracks) */ skirt?: number }
/** Voxelize the heightfield into `grid` over `reg` (x1/z1 exclusive), skipping columns inside `skip`. */
export function fillTerrain(grid: VoxelGrid, reg: Region, skip: Region | null, opts: FillOpts) {
  const s = grid.size, [ox, oy, oz] = grid.origin;
  const ix0 = Math.floor((reg.x0 - ox) / s), ix1 = Math.ceil((reg.x1 - ox) / s), iz0 = Math.floor((reg.z0 - oz) / s), iz1 = Math.ceil((reg.z1 - oz) / s);
  const W = ix1 - ix0 + 3, D = iz1 - iz0 + 3;
  const H = new Float32Array(W * D), TT = new Uint8Array(W * D), DD = new Float32Array(W * D);
  const smp: Sample = { h: 0, t: T.ROAD, d: 0 };
  for (let i = 0; i < W; i++) for (let k = 0; k < D; k++) {
    sample(ox + (ix0 - 1 + i + 0.5) * s, oz + (iz0 - 1 + k + 0.5) * s, smp);
    H[i * D + k] = smp.h; TT[i * D + k] = smp.t; DD[i * D + k] = smp.d;
  }
  const yi = (h: number) => Math.floor((h - oy) / s);
  const seaY = Math.round((SEA_LEVEL - oy) / s) - 1; // water voxels' top face sits exactly at SEA_LEVEL on every LOD
  for (let i = 1; i < W - 1; i++) for (let k = 1; k < D - 1; k++) {
    const x = ix0 - 1 + i, z = iz0 - 1 + k, wx = ox + (x + 0.5) * s, wz = oz + (z + 0.5) * s;
    if (skip && inR(skip, wx, wz)) continue;
    if (wx >= reg.x1 || wz >= reg.z1) continue;
    const h = H[i * D + k], t = TT[i * D + k] as T, d = DD[i * D + k];
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
    const top = yi(h);
    let lo = top;
    for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) lo = Math.min(lo, yi(H[(i + a) * D + k + b]) + 1);
    lo = Math.max(Math.min(lo, top), seaY - 1);
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
    // coastal scrub on the hills
    if (opts.scrub && t === T.INLAND && d > 9) {
      const sN = fbm(wx / 11, wz / 11, 3, 18);
      if (sN > 0.6) {
        const hgt = Math.max(1, Math.round(((sN - 0.6) * 8 + hash2(x, z, 19) * 0.6) / Math.max(s, 0.25) * 0.5));
        for (let y = 1; y <= hgt; y++) { const r = hash2(x, z * 7 + y, 20); grid.set(x, top + y, z, r < 0.4 ? C.scrub : r < 0.8 ? C.scrub2 : C.scrub3); }
      }
    }
  }
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

export interface CoastWorld { close: VoxelGrid | null; near: VoxelGrid; mid: VoxelGrid; far: VoxelGrid; detail: VoxelGrid; props: VoxelGrid[]; palette: typeof COAST }

/** `focus`: an extra 1/8 m ring of terrain around the camera (x, z, half-size). */
export function buildCoast(focus?: { x: number; z: number; r: number }, sizes: { mid?: number; far?: number; terrain?: boolean } = {}): CoastWorld {
  const vans: VoxelGrid[] = [];
  const near = new VoxelGrid(0.25), mid = new VoxelGrid(sizes.mid ?? 1), far = new VoxelGrid(sizes.far ?? 6), detail = new VoxelGrid(1 / 16);
  let close: VoxelGrid | null = null;
  const closeR: Region | null = focus ? { x0: focus.x - focus.r, x1: focus.x + focus.r, z0: focus.z - focus.r, z1: focus.z + focus.r } : null;
  if (sizes.terrain !== false) { // terrain: false = props only (trees, rails, signs, van), for the LOD terrain
    if (closeR) { close = new VoxelGrid(0.125); fillTerrain(close, closeR, null, { lines: true, skipSea: false, scrub: true }); }
    fillTerrain(near, NEAR, closeR, { lines: true, skipSea: false, scrub: true });
    fillTerrain(mid, MID, NEAR, { lines: false, skipSea: false, scrub: true });
    fillTerrain(far, FAR, MID, { lines: false, skipSea: true, scrub: false });
  }

  // W-beam guardrail on the sea side (gap at the turnout), on the 1/16 m detail grid
  for (let z = NEAR.z1 - 2; z > NEAR.z0 + 2; z -= 1 / 16) {
    if (z < TURNOUT.z1 + 2 && z > TURNOUT.z0 - 2) continue;
    const x = roadX(z) - 6.4, y = roadY(z) - 0.12;
    detail.wbox([x - 0.03, y + 0.52, z - 0.04], [x + 0.03, y + 0.8, z + 0.04], C.railMetal);
    detail.wbox([x - 0.06, y + 0.6, z - 0.04], [x - 0.03, y + 0.72, z + 0.04], C.railMetal);
    detail.wbox([x - 0.02, y + 0.64, z - 0.04], [x + 0.03, y + 0.68, z + 0.04], C.railDark);
    if (Math.abs(z - Math.round(z / 1.9) * 1.9) < 0.07) detail.wbox([x + 0.04, y - 0.3, z - 0.07], [x + 0.2, y + 0.76, z + 0.07], C.post);
  }
  // a parked camper van at the turnout
  {
    const z0 = -82, x0 = roadX(z0) - 10.5, y0 = roadY(z0) - 0.12 + 0.02;
    const v = new VoxelGrid(0.1, [x0, y0, z0]);
    v.box(-9, 3, -22, 9, 11, 22, C.vanTeal); v.box(-9, 12, -22, 9, 19, 22, C.vanWhite); v.box(-8, 20, -20, 8, 20, 20, C.vanWhite);
    v.box(-10, 13, -18, 10, 17, 14, C.glass); v.box(-8, 13, -23, 8, 18, -23, C.glass); v.box(-9, 12, -23, 9, 12, -23, C.vanWhite);
    v.box(-2, 6, -23, 2, 9, -23, C.vanWhite); v.box(-9, 3, -23, 9, 4, -23, C.metal);
    for (const [wx, wz] of [[-9, -15], [9, -15], [-9, 15], [9, 15]]) for (let a = 0; a < Math.PI * 2; a += 0.2) v.set(wx + (wx > 0 ? 1 : -1), 3 + Math.round(Math.sin(a) * 3), wz + Math.round(Math.cos(a) * 3), C.signBlack);
    v.box(-6, 21, -10, 6, 22, 10, C.vanOrange);
    vans.push(v);
  }
  // split-rail fence on the turnout's cliff edge
  for (let z = TURNOUT.z0 + 4; z < -74; z += 1 / 16) {
    const x = roadX(z) + edgeD(z) + 0.9, y = roadY(z) - 0.12 - (-edgeD(z) - 6) * 0.06 * (1 - inTurnout(z));
    detail.wbox([x - 0.05, y + 0.45, z - 0.04], [x + 0.05, y + 0.56, z + 0.04], C.post);
    detail.wbox([x - 0.05, y + 0.92, z - 0.04], [x + 0.05, y + 1.03, z + 0.04], C.post);
    if (Math.abs(z - Math.round(z / 2.5) * 2.5) < 0.07) detail.wbox([x - 0.08, y - 0.3, z - 0.08], [x + 0.08, y + 1.12, z + 0.08], C.post2);
  }
  // a few boulders along the open part of the turnout edge
  for (const [zz, r] of [[-67.6, 0.45], [-64.5, 0.5], [-61, 0.65]] as const) {
    const x = roadX(zz) + edgeD(zz) + 0.3, y = roadY(zz) - 0.12;
    detail.wellipsoid([x, y + r * 0.3, zz], [r * 1.2, r, r], (a, b, c) => (hash2(a * 7 + b, c, 50) < 0.6 ? C.rockGrey : C.rockB));
  }
  // Monterey cypresses
  const tree = (z: number, dOff: number, size: number, seed: number, g = near) => {
    const x = roadX(z) + dOff, smp = sample(x, z, { h: 0, t: T.ROAD, d: 0 });
    cypress(g, [x, smp.h, z], size, seed);
  };
  tree(-44, -10.5, 9, 1); tree(-112, -11, 11, 2); tree(-20, 14, 7, 3); tree(-96, 16, 10, 4); tree(-131, 9, 8, 5);
  tree(-230, -14, 12, 6, mid); tree(-260, 22, 14, 7, mid); tree(-340, -12, 13, 8, mid); tree(-420, 30, 16, 9, mid); tree(-180, 40, 13, 10, mid);

  // a few coastal scrub clumps on the sea-side verge
  for (let i = 0; i < 26; i++) {
    const z = NEAR.z1 - 6 - hash2(i, 1, 40) * (NEAR.z1 - NEAR.z0 - 10);
    if (z < TURNOUT.z1 + 3 && z > TURNOUT.z0 - 3) continue;
    const d = -7 - hash2(i, 2, 40) * 1.6, x = roadX(z) + d, y = sample(x, z, { h: 0, t: T.ROAD, d: 0 }).h;
    near.wellipsoid([x, y + 0.2, z], [0.6 + hash2(i, 3, 40), 0.55, 0.7 + hash2(i, 4, 40)], (a, b, c) => { const r = hash2(a * 3 + b, c, 41); return r < 0.4 ? C.scrub : r < 0.8 ? C.scrub2 : C.scrub3; });
  }

  // CA-1 route shield + curve warning, on the right shoulder (detail grid)
  const sign = (z: number, kind: 'shield' | 'curve') => {
    const x = roadX(z) + 6.3, y = roadY(z);
    detail.wbox([x - 0.04, y - 0.2, z - 0.04], [x + 0.04, y + 2.1, z + 0.04], C.metal);
    if (kind === 'shield') {
      // green spade-ish shield facing the rider (+z)
      for (let ix = -8; ix <= 8; ix++) for (let iy = 0; iy <= 16; iy++) {
        const u = ix / 8, v = iy / 16; // v 0 = bottom
        const halfW = v > 0.75 ? 1 - (v - 0.75) * 1.6 : 0.55 + v * 0.6;
        if (Math.abs(u) > Math.min(1, halfW)) continue;
        const edge = Math.abs(u) > Math.min(1, halfW) - 0.14 || iy === 0 || (v > 0.9);
        const one = !edge && Math.abs(ix) <= 1 && iy >= 3 && iy <= 11 || (!edge && ix === -2 && iy === 10);
        detail.set(detail.vi(x, 0) + ix, detail.vi(y + 1.6, 1) + iy, detail.vi(z + 0.06, 2), edge ? C.signWhite : one ? C.signWhite : C.signGreen);
      }
    } else {
      for (let ix = -8; ix <= 8; ix++) for (let iy = -8; iy <= 8; iy++) {
        if (Math.abs(ix) + Math.abs(iy) > 8) continue;
        const edge = Math.abs(ix) + Math.abs(iy) >= 7.5;
        const arrow = (iy === Math.round(-2 + 0) && ix >= -3 && ix <= 2) || (ix === 2 && iy >= -2 && iy <= 3) || (Math.abs(ix - 2) + Math.abs(iy - 3) <= 1 && iy >= 2);
        detail.set(detail.vi(x, 0) + ix, detail.vi(y + 1.75, 1) + iy, detail.vi(z + 0.06, 2), edge || arrow ? C.signBlack : C.signYellow);
      }
    }
  };
  sign(-26, 'shield'); sign(-118, 'curve');
  // a white mile marker post
  {
    const z = -70, x = roadX(z) + 6.0, y = roadY(z);
    detail.wbox([x - 0.06, y - 0.2, z - 0.03], [x + 0.06, y + 1.1, z + 0.03], C.signWhite);
    detail.wbox([x - 0.05, y + 0.75, z + 0.03], [x + 0.05, y + 1.0, z + 0.05], C.signGreen);
  }
  return { close, near, mid, far, detail, props: vans, palette: COAST };
}
