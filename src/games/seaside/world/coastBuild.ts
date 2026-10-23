// The built landmarks of Chapter 1 (#189). Big ones are terrain structures (voxelized into each terrain tile at the
// tile's size, so they have LOD and read from far away): the arch bridge, the pier, the harbour houses, Lou's shack,
// the pier stand. Small ones are route scatter near the rider (signs, the Turnout 1 fence, the bucket on the pier).
// Pure (runs in tile workers).
import type { VoxelGrid } from '../voxel/grid';
import { hash2 } from '../voxel/noise';
import type { Region, ScatterRule } from './def';
import { bridge, CH1, COAST, coastRoute, edgeD, pierGeom, roadX, roadY, SEA_LEVEL, sOfZ, zOfS } from './coastLayout';

const C = COAST.idx;
const mod = (a: number, n: number) => ((a % n) + n) % n;

// ---- a 5×7 pixel font for signs ----------------------------------------------------------------------------------
const FONT: Record<string, string[]> = {
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'], B: ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
  C: ['01111', '10000', '10000', '10000', '10000', '10000', '01111'], E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  I: ['11111', '00100', '00100', '00100', '00100', '00100', '11111'], K: ['10001', '10010', '10100', '11000', '10100', '10010', '10001'],
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'], O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'], R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'], T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  U: ['10001', '10001', '10001', '10001', '10001', '10001', '01110'], '&': ['01100', '10010', '10100', '01000', '10101', '10010', '01101'],
  "'": ['00100', '00100', '01000', '00000', '00000', '00000', '00000'], '<': ['00010', '00100', '01000', '11111', '01000', '00100', '00010'],
  ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000'],
};
/** Width (m) of `text` at `cell` metres per pixel. */
export const textWidth = (text: string, cell: number) => (text.length * 6 - 1) * cell;
/** Is (u, v) on a lit pixel of `text`? u from the left edge, v up from the baseline, `cell` m per pixel. */
export function textAt(text: string, u: number, v: number, cell: number): boolean {
  const col = Math.floor(u / cell), row = 6 - Math.floor(v / cell);
  if (row < 0 || row > 6 || col < 0) return false;
  const ci = Math.floor(col / 6), cx = col % 6;
  if (ci >= text.length || cx === 5) return false;
  return FONT[text[ci]]?.[row][cx] === '1';
}

// ---- terrain structures ------------------------------------------------------------------------------------------
export interface Structure {
  box: { x0: number; x1: number; y0: number; y1: number; z0: number; z1: number };
  /** The voxels of one column at (x, z) for voxel size `voxel` (palette index by y, 0 = empty), or null when empty. */
  column(x: number, z: number, voxel: number): ((y: number) => number) | null;
}

/** Voxelize every structure overlapping `reg` into `g` (voxel centres inside the box; x1/z1 exclusive). */
export function fillStructures(g: VoxelGrid, reg: Region, list: readonly Structure[]): void {
  const s = g.size, [ox, oy, oz] = g.origin;
  for (const st of list) {
    const b = st.box, x0 = Math.max(reg.x0, b.x0), x1 = Math.min(reg.x1, b.x1), z0 = Math.max(reg.z0, b.z0), z1 = Math.min(reg.z1, b.z1);
    if (x0 >= x1 || z0 >= z1) continue;
    const i0 = Math.ceil((x0 - ox) / s - 0.5), i1 = Math.ceil((x1 - ox) / s - 0.5) - 1;
    const k0 = Math.ceil((z0 - oz) / s - 0.5), k1 = Math.ceil((z1 - oz) / s - 0.5) - 1;
    const j0 = Math.ceil((b.y0 - oy) / s - 0.5), j1 = Math.floor((b.y1 - oy) / s - 0.5);
    for (let i = i0; i <= i1; i++) for (let k = k0; k <= k1; k++) {
      const col = st.column(ox + (i + 0.5) * s, oz + (k + 0.5) * s, s);
      if (!col) continue;
      for (let j = j0; j <= j1; j++) { const v = col(oy + (j + 0.5) * s); if (v) g.set(i, j, k, v); }
    }
  }
}

interface RouteQ { s: number; d: number; y: number; x: number; z: number }
/** A structure laid out in route coordinates (s along, d across, y = route height) over route metres [s0, s1]. */
function along(s0: number, s1: number, dMax: number, y0: number, y1: number, col: (q: RouteQ, voxel: number) => ((y: number) => number) | null): Structure {
  const r = coastRoute(), b = r.bbox(s0, s1);
  return {
    box: { x0: b.x0 - dMax, x1: b.x1 + dMax, y0, y1, z0: b.z0 - dMax, z1: b.z1 + dMax },
    column(x, z, voxel) {
      const n = r.nearest(x, z, dMax + 0.5, { s0, s1 });
      // (beyond either end of the route the nearest point is the end itself, not a perpendicular foot: skip)
      if (!n || n.s < s0 || n.s > s1 || Math.abs(n.d) > dMax || n.dist > Math.abs(n.d) + 0.05) return null;
      return col({ s: n.s, d: n.d, y: n.y, x, z }, voxel);
    },
  };
}

/** A structure laid out along the highway (hs = highway metres, d across from the centre line). */
function besideHighway(hs0: number, hs1: number, d0: number, d1: number, y0: number, y1: number, col: (hs: number, d: number, voxel: number) => ((y: number) => number) | null): Structure {
  let x0 = Infinity, x1 = -Infinity;
  const za = zOfS(hs1), zb = zOfS(hs0);
  for (let k = 0; k <= 8; k++) { const z = za + ((zb - za) * k) / 8, rx = roadX(z); x0 = Math.min(x0, rx + d0); x1 = Math.max(x1, rx + d1); }
  return {
    box: { x0: x0 - 2, x1: x1 + 2, y0, y1, z0: za - 1, z1: zb + 1 },
    column(x, z, voxel) {
      const hs = sOfZ(z), d = x - roadX(z);
      if (hs < hs0 || hs > hs1 || d < d0 || d > d1) return null;
      return col(hs, d, voxel);
    },
  };
}

// -- the arch bridge over the creek gorge (an open-spandrel concrete arch, two ribs) --
function archBridge(ground: (x: number, z: number) => number): Structure {
  const b = bridge(), r = coastRoute(), mid = (b.s0 + b.s1) / 2, A = (b.s1 - b.s0) / 2 - 8;
  const deck = r.at(mid).y, floor = SEA_LEVEL + 0.5, crown = deck - 2.3, rise = (crown - floor) * 0.68;
  return along(b.s0 - 3, b.s1 + 3, 6.4, floor - 3, Math.max(r.at(b.s0).y, r.at(b.s1).y) + 1.5, (q) => {
    const ad = Math.abs(q.d), u = (q.s - mid) / A, ry = q.y, yA = crown - rise * u * u, arch = Math.abs(u) <= 1.08;
    const atCol = Math.abs(mod(q.s - mid + 4.8, 9.6) - 4.8) < 0.7, rib = ad >= 2.5 && ad <= 5.3;
    let gy: number | null = null;
    return (y) => {
      if (ad >= 5.75 && y >= ry - 0.1 && y <= ry + 1.05) { // parapet: base, top rail, balusters
        if (y > ry + 0.86 || y < ry + 0.22) return C.concrete;
        return Math.abs(mod(q.s, 1.6) - 0.8) < 0.2 ? C.concrete : 0;
      }
      if (y < ry - 0.45 && y >= ry - 1.7) return ad > 5.9 ? C.concrete : C.concrete2; // deck girder
      if (y >= ry - 0.45) return 0;
      if (arch && rib && y <= yA && y >= yA - 2.1) return C.concrete;
      if (arch && atCol && y > yA && ((rib && ad > 2.7 && ad < 5.1) || ad < 2.5) && (rib || y > ry - 2.6)) return rib ? C.concrete2 : C.concreteDark; // spandrel columns + cap
      if (arch && atCol && ad < 2.5 && y > yA - 1.3 && y <= yA) return C.concreteDark; // tie beams between the ribs
      if (!arch && atCol && rib && ad > 2.7 && ad < 5.1) { gy ??= ground(q.x, q.z); return y > gy - 1 ? C.concrete2 : 0; } // approach piers
      return 0;
    };
  });
}

// -- the pier: pilings, cap beams, stringers, rails, lamps, the entrance arch and the stand at the end --
export const PIER_STAND = { from: 22, to: 12, d0: 1.8, d1: 6.0 } as const; // metres back from the end, across
function pier(): Structure {
  const P = pierGeom(), L = P.end - P.start, st = PIER_STAND, cell = 0.14, sign = 'PIER', sw = textWidth(sign, cell);
  return along(P.start - 1.6, P.end, 6.4, SEA_LEVEL - 7, P.y + 5.6, (q) => {
    const sp = q.s - P.start, ad = Math.abs(q.d), ry = q.y;
    const bent = mod(sp, 7) < 0.5 && sp > -0.2, rowD = Math.min(Math.abs(ad - 5.6), Math.abs(ad - 1.9));
    const end = sp > L - 0.22, rail = sp >= 0 && (ad >= 5.95 || end), post = end ? mod(q.d + 6.2, 2.48) < 0.16 || ad >= 5.95 : mod(sp, 2.5) < 0.16;
    const lamp = q.d < -5.4 && mod(sp - 20, 40) < 0.36 && sp > 1, lampPost = lamp && q.d < -5.92 && mod(sp - 20, 40) < 0.2;
    const inStand = sp > L - st.from && sp < L - st.to && q.d >= st.d0 && q.d <= st.d1;
    const standWall = inStand && (q.d > st.d1 - 0.2 || sp < L - st.from + 0.2 || sp > L - st.to - 0.2);
    const standFront = inStand && q.d < st.d0 + 0.2, standPost = standFront && (sp < L - st.from + 0.3 || sp > L - st.to - 0.3 || Math.abs(sp - (L - (st.from + st.to) / 2)) < 0.15);
    const awning = sp > L - st.from - 0.3 && sp < L - st.to + 0.3 && q.d >= 0.8 && q.d < st.d0;
    const arch = sp > -1.3 && sp < -0.8, archPost = arch && ad > 5.85, archFace = sp > -1.42 && sp <= -1.3 && ad < 3;
    const sign2 = inStand && q.d >= st.d0 && q.d < st.d0 + 0.25, standSign = 'BAIT', ssw = textWidth(standSign, 0.12);
    return (y) => {
      if (y >= ry) { // above the deck
        if (rail && y <= ry + 1.1) {
          if (y >= ry + 0.98 || (y >= ry + 0.5 && y <= ry + 0.58)) return C.post2;
          return post ? C.post : 0;
        }
        if (lamp) {
          if (lampPost && y < ry + 3.75) return C.lamp;
          if (y >= ry + 3.4 && y < ry + 3.75) return C.lamp;
          if (y >= ry + 3.25 && y < ry + 3.4 && q.d > -5.9) return C.lampGlass;
        }
        if (inStand && y < ry + 2.6) {
          if (standWall) return mod(y - ry, 0.3) < 0.05 ? C.shopWood2 : C.shopWood;
          if (standFront) {
            if (y < ry + 0.95) return mod(sp, 0.3) < 0.05 ? C.shopWood2 : C.shopWood;
            if (y < ry + 1.05) return C.trim;
            if (y > ry + 2.2 || standPost) return C.shopWood;
          }
          return 0;
        }
        if (inStand && y < ry + 2.8) return C.roofRed;
        if (sign2 && y >= ry + 2.8 && y < ry + 3.7) { // the stand's sign, facing the pier
          const u = L - st.to - 0.9 - sp - (L - st.to - (L - st.from) - 1.8 - ssw) / 2, v = y - ry - 2.95;
          return textAt(standSign, u, v, 0.12) ? C.signRed : C.awnWhite;
        }
        if (awning) {
          const ay = ry + 2.5 - (st.d0 - q.d) * 0.35;
          if (y >= ay - 0.1 && y < ay + 0.02) return Math.floor(mod(sp, 1.4) / 0.7) ? C.awnRed : C.awnWhite;
        }
        if (archPost && y < ry + 5.4) return C.trim;
        if (arch && y >= ry + 4.1 && y < ry + 5.3 && ad <= 6.3) return C.signGreen;
        if (archFace && y >= ry + 4.3 && y < ry + 5.3) return textAt(sign, q.d + sw / 2, y - ry - 4.33, cell) ? C.signWhite : 0;
        return 0;
      }
      if (sp < -0.2 || y >= ry - 0.5) return 0; // the deck itself is the corridor; the street is ground
      if (bent && ad <= 6.2 && y >= ry - 1.0) return C.piling2; // cap beam
      if (rowD < 0.3 && y >= ry - 0.85) return C.piling; // stringers
      if (bent && rowD < 0.24) return mod(y, 1.4) < 0.7 ? C.piling : C.piling2; // pilings
      return 0;
    };
  });
}

// -- houses: a box, a gable roof along the road, windows and a door on the side facing it --
interface House { hs0: number; hs1: number; d0: number; d1: number; h: number; wall: number; roof: number; text?: Array<{ s: string; cell: number; v: number }> }
function house(H: House): Structure {
  const base = roadY(zOfS((H.hs0 + H.hs1) / 2)) - 0.12, top = base + H.h, mid = (H.d0 + H.d1) / 2, half = (H.d1 - H.d0) / 2, pitch = 0.55;
  const front = H.d0 > 0 ? H.d0 : H.d1, fs = H.d0 > 0 ? 1 : -1, hm = (H.hs0 + H.hs1) / 2, eave = 0.5;
  const ridge = top + (half + eave) * pitch;
  const board = H.text ? { y0: base + Math.max(...H.text.map((t) => t.v)) - 0.25, y1: base + H.h - 0.2 } : null;
  return besideHighway(H.hs0 - eave, H.hs1 + eave, H.d0 - eave, H.d1 + eave, base - 1, ridge + 0.2, (hs, d) => {
    const inWall = hs >= H.hs0 && hs <= H.hs1 && d >= H.d0 && d <= H.d1;
    const roofY = top + (half + eave - Math.abs(d - mid)) * pitch;
    const face = inWall && Math.abs(d - front) < 0.2, end = inWall && (hs < H.hs0 + 0.2 || hs > H.hs1 - 0.2);
    const door = face && Math.abs(hs - hm) < 0.6;
    const winU = face ? mod(hs - H.hs0 - 0.6, 3.2) : end ? mod(d - H.d0 - 0.6, 3.2) : -1;
    return (y) => {
      if (y >= roofY - 0.38 && y <= roofY) return H.roof;
      if (!inWall || y < base - 1 || y > roofY) return 0;
      if (y < base) return C.concreteDark; // footing on the slope
      const fy = y - base;
      if (board && face && y >= board.y0 && y < board.y1) {
        for (const t of H.text!) if (fy >= t.v && fy < t.v + 7 * t.cell) {
          // left to right as seen from the road: inland faces read toward +z (lower hs), sea-side faces toward −z
          const u = (fs > 0 ? H.hs1 - hs : hs - H.hs0) - (H.hs1 - H.hs0 - textWidth(t.s, t.cell)) / 2;
          return textAt(t.s, u, fy - t.v, t.cell) ? C.signRed : C.signWhite;
        }
        return C.signWhite;
      }
      if (door && fy < 2.2) return C.door;
      if (winU >= 0 && winU < 1.2 && y < top) {
        const fl = fy % 2.8;
        if (fl > 1.0 && fl < 2.2 && fy < H.h - 0.4) return C.glass;
        if (fl > 0.88 && fl <= 1.0 && fy < H.h - 0.4) return C.trim;
      }
      if (y >= top - 0.25 && y < top) return C.trim;
      return H.wall === C.shopWood && mod(fy, 0.3) < 0.05 ? C.shopWood2 : H.wall;
    };
  });
}

const J = CH1.junction;
const HOUSES: House[] = [
  // inland, facing the road
  { hs0: J - 272, hs1: J - 260, d0: 14, d1: 23, h: 5.6, wall: C.houseCream, roof: C.roofRed },
  { hs0: J - 240, hs1: J - 227, d0: 13, d1: 22, h: 3.4, wall: C.houseBlue, roof: C.roofGrey },
  { hs0: J - 206, hs1: J - 190, d0: 15, d1: 25, h: 6.2, wall: C.houseWhite, roof: C.roofTeal },
  { hs0: J - 168, hs1: J - 156, d0: 13, d1: 21, h: 3.6, wall: C.houseSalmon, roof: C.roofRed },
  { hs0: J - 122, hs1: J - 104, d0: 14, d1: 26, h: 6.0, wall: C.houseMint, roof: C.roofGrey },
  { hs0: J - 62, hs1: J - 48, d0: 13, d1: 22, h: 3.8, wall: C.houseCream, roof: C.roofTeal },
  { hs0: J + 18, hs1: J + 32, d0: 14, d1: 24, h: 5.8, wall: C.houseBlue, roof: C.roofRed },
  { hs0: J + 68, hs1: J + 84, d0: 13, d1: 22, h: 3.6, wall: C.houseWhite, roof: C.roofGrey },
  { hs0: J + 118, hs1: J + 130, d0: 15, d1: 24, h: 5.4, wall: C.houseSalmon, roof: C.roofTeal },
  { hs0: J - 230, hs1: J - 216, d0: 34, d1: 44, h: 5.2, wall: C.houseSalmon, roof: C.roofTeal },
  { hs0: J - 140, hs1: J - 126, d0: 33, d1: 42, h: 4.4, wall: C.houseCream, roof: C.roofGrey },
  { hs0: J - 30, hs1: J - 14, d0: 34, d1: 45, h: 6.4, wall: C.houseWhite, roof: C.roofRed },
  { hs0: J + 44, hs1: J + 58, d0: 33, d1: 43, h: 4.8, wall: C.houseMint, roof: C.roofRed },
  // the harbour front (clear of the street to the pier)
  { hs0: J - 152, hs1: J - 136, d0: -31, d1: -20, h: 3.4, wall: C.houseWhite, roof: C.roofRed },
  { hs0: J - 112, hs1: J - 99, d0: -28, d1: -19, h: 3.2, wall: C.houseSalmon, roof: C.roofGrey },
  { hs0: J - 62, hs1: J - 47, d0: -30, d1: -20, h: 3.6, wall: C.houseBlue, roof: C.roofTeal },
  { hs0: J + 60, hs1: J + 75, d0: -28, d1: -19, h: 3.4, wall: C.houseCream, roof: C.roofRed },
  // Lou's Bait & Tackle, in its gravel lot
  { hs0: CH1.shop - 7, hs1: CH1.shop + 7, d0: -27, d1: -17, h: 5, wall: C.shopWood, roof: C.roofGrey,
    text: [{ s: "LOU'S", cell: 0.15, v: 3.75 }, { s: 'BAIT & TACKLE', cell: 0.1, v: 2.95 }] },
];

let structures: Structure[] | null = null;
/** All of the coast's structures (built once per thread). `ground` is the terrain height (for the bridge's piers). */
export const coastStructures = (ground: (x: number, z: number) => number): Structure[] =>
  (structures ??= [archBridge(ground), pier(), ...HOUSES.map(house)]);

// ---- scatter near the rider -------------------------------------------------------------------------------------

/** A sign board facing the rider at route point p: `text` on `bg` in `fg`, on one or two posts. */
function board(g: VoxelGrid, p: { x: number; z: number; tx: number; tz: number }, y: number, text: string, cell: number, fg: number, bg: number, post: number, raise: number) {
  const rx = -p.tz, rz = p.tx, w = textWidth(text, cell) + cell * 4, h = cell * 11, s = g.size;
  for (const side of [-1, 1]) { const px = p.x + rx * side * (w / 2 - 0.1), pz = p.z + rz * side * (w / 2 - 0.1); g.wbox([px - 0.05, y - 0.3, pz - 0.05], [px + 0.05, y + raise + h, pz + 0.05], post); }
  for (let u = 0; u < w; u += s * 0.7) for (let v = 0; v < h; v += s * 0.7) {
    const lit = textAt(text, u - cell * 2, v - cell * 2, cell);
    const x = p.x + rx * (u - w / 2) - p.tx * 0.04, z = p.z + rz * (u - w / 2) - p.tz * 0.04;
    g.set(g.vi(x, 0), g.vi(y + raise + v, 1), g.vi(z, 2), lit ? fg : bg);
    g.set(g.vi(x + p.tx * s, 0), g.vi(y + raise + v, 1), g.vi(z + p.tz * s, 2), bg);
  }
}

/** Metres back from the pier's end where the rider stops to fish (render/morningShots.ts uses the same). */
export const PIER_FISH_BACK = 60;

export function morningScatter(): ScatterRule[] {
  const T1 = CH1.turnout, P = pierGeom();
  return [
    { // Turnout 1: a split-rail fence on the cliff edge with a gap at the fishing spot, boulders
      id: 'turnout1', every: 1e9, offset: T1, d: 0, voxel: 0.1,
      place(g) {
        for (let s = T1 - 20; s < T1 + 20; s += 0.1) {
          if (Math.abs(s - T1) < 3.5) continue;
          const z = zOfS(s), x = roadX(z) + edgeD(z) + 0.9, y = roadY(z) - 0.12;
          g.wbox([x - 0.05, y + 0.45, z - 0.05], [x + 0.05, y + 0.56, z + 0.05], C.post);
          g.wbox([x - 0.05, y + 0.92, z - 0.05], [x + 0.05, y + 1.03, z + 0.05], C.post);
          if (Math.abs(s - Math.round(s / 2.5) * 2.5) < 0.07) g.wbox([x - 0.08, y - 0.3, z - 0.08], [x + 0.08, y + 1.12, z + 0.08], C.post2);
        }
        for (const [ds, r] of [[-14, 0.5], [-11, 0.7], [9, 0.45], [12.5, 0.6]] as const) {
          const z = zOfS(T1 + ds), x = roadX(z) + edgeD(z) + 0.4, y = roadY(z) - 0.12;
          g.wellipsoid([x, y + r * 0.3, z], [r * 1.2, r, r], (a, b, c) => (hash2(a * 7 + b, c, 50) < 0.6 ? C.rockGrey : C.rockB));
        }
      },
    },
    { id: 'baitSign', every: 1e9, offset: CH1.shop - 75, d: -6.9, voxel: 1 / 16,
      place: (g, p) => board(g, p, roadY(p.z) - 0.12, 'BAIT', 0.125, C.signRed, C.awnWhite, C.post, 0.9) },
    { id: 'pierSign', every: 1e9, offset: CH1.junction - 130, d: 6.5, voxel: 1 / 16,
      place: (g, p) => board(g, p, roadY(p.z) - 0.12, '< PIER', 0.0625, C.signWhite, C.signGreen, C.metal, 1.5) },
    { // on the pier: an old guy's abandoned bucket and a bench
      id: 'pierBits', every: 1e9, offset: P.end - PIER_FISH_BACK, d: 0, voxel: 1 / 16,
      place(g) {
        const r = coastRoute(), b = r.offset(P.end - PIER_FISH_BACK + 2.2, -4.6), y = P.y;
        g.wellipsoid([b.x, y + 0.18, b.z], [0.17, 0.18, 0.17], C.metal);
        g.wellipsoid([b.x, y + 0.36, b.z], [0.15, 0.02, 0.15], C.sea2);
        const c = r.offset(P.end - PIER_FISH_BACK - 7, 5.2);
        g.wbox([c.x - 0.9, y + 0.42, c.z - 0.2], [c.x + 0.9, y + 0.48, c.z + 0.2], C.plank);
        g.wbox([c.x - 0.9, y + 0.5, c.z + 0.2], [c.x + 0.9, y + 0.9, c.z + 0.26], C.plank2);
        for (const sx of [-0.8, 0.8]) g.wbox([c.x + sx - 0.05, y, c.z - 0.18], [c.x + sx + 0.05, y + 0.42, c.z + 0.18], C.post2);
      },
    },
  ];
}
