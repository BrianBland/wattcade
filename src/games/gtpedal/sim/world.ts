// Grand Theft Pedal neighbourhood: pure data + analytic height field. No DOM / three.
import { DEALER_VAN } from './crime';
export interface Box { x0: number; z0: number; x1: number; z1: number; h: number; color: number; /** ground level of the base (default 0) */ y0?: number }
/** Top of a solid box in world y. */
export const boxTop = (b: Box) => (b.y0 ?? 0) + b.h;
export type LineKind = 'path' | 'ramp' | 'rail' | 'tram';
export interface Line { id: number; kind: LineKind; pts: Array<[number, number]> }
/** A kicker/berm: height rises linearly along `dir` from 0 to h over len, then drops off (a launch lip). */
export interface Kicker { x: number; z: number; dir: number; len: number; w: number; h: number }

export const HALF = 200;
/** Original core neighbourhood half-size (districts lie outside it). */
export const CORE = 120;
export const CANAL = { z0: -24, z1: -4, depth: 5, xWest: -128 }; // runs east from the foot of the hillside
/** Drawbridge gap: half-width (m) at the middle = GAP.base + GAP.perRad × leaf angle (tuned so ~FTP clears it, Z2 doesn't). */
export const GAP = { base: 1, perRad: 28 };
export const BRIDGE = { x0: -9, x1: 9 }; // central avenue crosses the canal here; two leaves hinge at z0/z1
export const BOWL = { x: -70, z: 50, r: 16, depth: 4.5 };
export const PLAZA = { x0: 30, z0: 30, x1: 80, z1: 80, drop: 2, stairsZ: 30, stairsLen: 4 };
export const TRAM_Z = 18;
/** Second tram line through the old town. */
export const TRAM2_Z = 152;
/** Fixed footbridges over the canal (deck at 0). */
export const FOOTBRIDGES = [{ x: -85, hw: 3 }, { x: 95, hw: 3 }];
/** Hillside district (west): rises to HILL.h at the map edge. */
export const HILL = { x0: -128, x1: -192, h: 16 };
/** Skate park district (east): half-pipe channel along z + a second bowl. */
export const HALFPIPE = { x: 162, z0: 20, z1: 95, w: 8, h: 3.6, deck: 3 };
export const BOWL2 = { x: 160, z: -60, r: 14, depth: 4 };
export const MOUNDS: Array<{ x: number; z: number; r: number; h: number }> = [
  { x: 140, z: -10, r: 10, h: 2.4 }, { x: 178, z: -105, r: 12, h: 3 }, { x: 140, z: 112, r: 9, h: 2 }, { x: 185, z: -15, r: 8, h: 2.6 },
];
/** District rectangles (render palette / labels). */
export const DISTRICTS = {
  oldTown: { x0: -122, z0: 122, x1: 196, z1: 198 },
  hillside: { x0: -198, z0: -198, x1: -126, z1: 198 },
  park: { x0: 124, z0: -122, x1: 198, z1: 120 },
  market: { x0: -122, z0: -198, x1: 124, z1: -124 },
};

export const CORE_BUILDINGS: Box[] = [
  { x0: 20, z0: -60, x1: 45, z1: -30, h: 18, color: 0xe8b86b },
  { x0: 55, z0: -70, x1: 90, z1: -35, h: 26, color: 0xd98c7a },
  { x0: -90, z0: -70, x1: -55, z1: -40, h: 14, color: 0x9fc4d8 },
  { x0: -40, z0: -65, x1: -18, z1: -30, h: 22, color: 0xc7a3d9 },
  { x0: 95, z0: 30, x1: 115, z1: 80, h: 30, color: 0xb5d98a },
  { x0: 20, z0: 90, x1: 60, z1: 112, h: 16, color: 0xe6d56a },
  { x0: -110, z0: 90, x1: -80, z1: 112, h: 20, color: 0x8ad9c8 },
];

/** Deterministic hash in [0,1). */
export const hash = (a: number, b = 0) => { const v = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return v - Math.floor(v); };
export type BlockKind = 'rowhouses' | 'shops' | 'villa' | 'stall' | 'tower';
/** A collision block plus how the renderer should dress it. Rowhouse blocks are subdivided into houses visually. */
export interface Block extends Box { kind: BlockKind; seed: number; front: 1 | -1 }
const HOUSE_COLS = [0xa8573d, 0xb5683f, 0xc9a77c, 0xe2d6bb, 0x8a5a44, 0xd3b48a, 0x9c7b5c];
const blocks: Block[] = [];
// old town: two rows of rowhouse blocks with cross streets every ~64 m; tram street at z = TRAM2_Z
for (const [z0, z1, front] of [[128, 144, -1], [160, 176, 1], [182, 196, -1]] as Array<[number, number, 1 | -1]>) {
  for (const [x0, x1] of [[-118, -72], [-56, -10], [10, 56], [72, 118], [134, 192]]) {
    if (z0 === 182 && x0 === 134) continue;
    const seed = blocks.length + 1;
    blocks.push({ x0, z0, x1, z1, h: 10 + Math.floor(hash(seed) * 5), color: HOUSE_COLS[seed % HOUSE_COLS.length], kind: 'rowhouses', seed, front });
  }
}
// market: ring of shop blocks around an open square + stalls in the middle
for (const [x0, z0, x1, z1] of [[-118, -196, -60, -182], [-40, -196, 40, -182], [60, -196, 118, -182], [-118, -170, -104, -132], [104, -170, 118, -132]]) {
  const seed = 100 + blocks.length;
  blocks.push({ x0, z0, x1, z1, h: 8 + Math.floor(hash(seed) * 4), color: HOUSE_COLS[seed % HOUSE_COLS.length], kind: 'shops', seed, front: z0 < -180 ? 1 : 1 });
}
for (let i = 0; i < 4; i++) for (let k = 0; k < 4; k++) {
  if ((i === 1 || i === 2) && (k === 1 || k === 2)) continue; // fountain square
  const x = -54 + i * 36, z = -165 + k * 10, seed = 200 + i * 4 + k;
  blocks.push({ x0: x - 2, z0: z - 1.5, x1: x + 2, z1: z + 1.5, h: 2.6, color: HOUSE_COLS[seed % HOUSE_COLS.length], kind: 'stall', seed, front: 1 });
}
// hillside villas (on terraces up the slope)
for (const [x, z] of [[-150, -80], [-165, 40], [-152, 100], [-175, -140], [-170, 150]]) {
  const seed = 300 + blocks.length;
  blocks.push({ x0: x - 7, z0: z - 6, x1: x + 7, z1: z + 6, h: 8, color: HOUSE_COLS[seed % HOUSE_COLS.length], kind: 'villa', seed, front: 1 });
}
export const GEN_BLOCKS: Block[] = blocks;
export const BUILDINGS: Box[] = [...CORE_BUILDINGS, ...GEN_BLOCKS];
// spatial hash for buildingAt (10 m cells)
const CELL = 10, GRID = new Map<number, Box[]>();
for (const b of BUILDINGS) for (let cx = Math.floor(b.x0 / CELL); cx <= Math.floor(b.x1 / CELL); cx++) for (let cz = Math.floor(b.z0 / CELL); cz <= Math.floor(b.z1 / CELL); cz++) {
  const k = cx * 1000 + cz; const a = GRID.get(k) ?? []; a.push(b); GRID.set(k, a);
}


export const KICKERS: Kicker[] = [
  { x: -40, z: 40, dir: Math.PI / 2, len: 8, w: 6, h: 2.2 },   // park kicker heading +x
  { x: -30, z: 70, dir: Math.PI, len: 10, w: 8, h: 3 },         // berm facing -z... heading direction = -z
  { x: 0, z: 36, dir: 0, len: 9, w: 5, h: 2.5 },                // avenue kicker heading +z
  // ---- districts ----
  { x: -40, z: 124, dir: Math.PI / 2, len: 7, w: 5, h: 1.8 },    // old town lower street
  { x: 95, z: 179, dir: -Math.PI / 2, len: 7, w: 5, h: 2 },      // old town upper street
  { x: 64, z: 150, dir: 0, len: 6, w: 4, h: 1.6 },               // cross street hop toward the tram street
  { x: -75, z: -150, dir: Math.PI / 2, len: 8, w: 6, h: 2.2 },   // market square
  { x: 75, z: -150, dir: -Math.PI / 2, len: 8, w: 6, h: 2.2 },
  { x: -125, z: 15, dir: -Math.PI / 4, len: 7, w: 5, h: 2 },     // hillside switchback jumps
  { x: -155, z: -15, dir: (3 * Math.PI) / 4, len: 7, w: 5, h: 2.2 },
  { x: -162, z: -80, dir: Math.PI, len: 8, w: 5, h: 2.6 },
  { x: 150, z: -40, dir: 0, len: 8, w: 6, h: 2.4 },              // park
];

/** Drawbridge leaf angle (radians) at sim time t: closed, rising, open, falling. */
export function bridgeAngle(t: number, periodS: number, maxRad: number): number {
  const p = ((t % periodS) + periodS) % periodS / periodS;
  if (p < 0.4) return 0;
  if (p < 0.55) return maxRad * (p - 0.4) / 0.15;
  if (p < 0.85) return maxRad;
  return maxRad * (1 - (p - 0.85) / 0.15);
}

function kickerH(k: Kicker, x: number, z: number): number {
  const dx = x - k.x, dz = z - k.z;
  const fx = Math.sin(k.dir), fz = Math.cos(k.dir); // heading convention: dir 0 = +z, PI/2 = +x
  const along = dx * fx + dz * fz, side = -dx * fz + dz * fx;
  const back = k.len * 0.5; // gentle back side so riding into it from behind is a steep roller, not a wall
  const edge = Math.abs(side) - k.w / 2, SIDE = 3; // sides roll off over SIDE m so they're never walls
  if (edge > SIDE || along < 0 || along > k.len + back) return 0;
  const sideMul = edge <= 0 ? 1 : 1 - edge / SIDE;
  if (along > k.len) return k.h * sideMul * (1 - (along - k.len) / back);
  const u = along / k.len; return k.h * sideMul * u * u; // concave face: quarter-pipe-ish
}

/** Ground height (m). `bridge` = current leaf angle in radians. */
export function heightAt(x: number, z: number, bridge = 0): number {
  if (Math.abs(x) > HALF || Math.abs(z) > HALF) return 6; // edge walls
  if (z > CANAL.z0 && z < CANAL.z1 && x > CANAL.xWest) {
    for (const f of FOOTBRIDGES) if (Math.abs(x - f.x) < f.hw) return 0;
    if (x > BRIDGE.x0 && x < BRIDGE.x1) {
      const mid = (CANAL.z0 + CANAL.z1) / 2, tan = Math.tan(bridge);
      const fromHinge = z < mid ? z - CANAL.z0 : CANAL.z1 - z;
      const gapHalf = bridge > 0.02 ? GAP.base + bridge * GAP.perRad : 0; // gap opens at the middle
      if (Math.abs(z - mid) < gapHalf) return -CANAL.depth;
      return fromHinge * tan;
    }
    return -CANAL.depth;
  }
  const bd = Math.hypot(x - BOWL.x, z - BOWL.z);
  if (bd < BOWL.r) { const u = bd / BOWL.r; return -BOWL.depth * (1 - u * u); }
  let h = 0;
  for (const k of KICKERS) h = Math.max(h, kickerH(k, x, z));
  if (x < HILL.x0) { const u = Math.min(1, (HILL.x0 - x) / (HILL.x0 - HILL.x1)); h += HILL.h * u * u * (3 - 2 * u); } // smooth climb
  if (x > CORE) {
    const b2 = Math.hypot(x - BOWL2.x, z - BOWL2.z);
    if (b2 < BOWL2.r) { const u = b2 / BOWL2.r; return -BOWL2.depth * (1 - u * u); }
    if (z > HALFPIPE.z0 && z < HALFPIPE.z1) {
      const d = Math.abs(x - HALFPIPE.x), P = HALFPIPE;
      const endFade = Math.min(1, (z - P.z0) / 6, (P.z1 - z) / 6); // ends roll out so you can ride in
      if (d < P.w) h = Math.max(h, P.h * (d / P.w) ** 2 * endFade);
      else if (d < P.w + P.deck) h = Math.max(h, P.h * endFade);
      else if (d < P.w + P.deck + 6) h = Math.max(h, P.h * endFade * (1 - (d - P.w - P.deck) / 6));
    }
    for (const m of MOUNDS) { const r = Math.hypot(x - m.x, z - m.z); if (r < m.r * 2) h = Math.max(h, m.h * Math.exp(-((r / m.r) ** 2) * 2)); }
  }
  if (x > PLAZA.x0 && x < PLAZA.x1 && z > PLAZA.z0 && z < PLAZA.z1) {
    const u = Math.min(1, (z - PLAZA.stairsZ) / PLAZA.stairsLen);
    const out = Math.max(0, Math.min(1, (z - (PLAZA.z1 - 10)) / 10)); // smooth ramp back up on the north side
    h -= PLAZA.drop * (Math.floor(u * 5) / 5) * (1 - out); // 5 steps down into the sunken plaza
  }
  return h;
}

/** Buildings only (no trees/hedges). */
export function blockAt(x: number, z: number): Box | null {
  const cell = GRID.get(Math.floor(x / CELL) * 1000 + Math.floor(z / CELL));
  if (cell) for (const b of cell) if (x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1) return b;
  return null;
}
/** Anything solid at (x,z): buildings, tree trunks, hedges. Compare heights with `boxTop`. */
export function buildingAt(x: number, z: number): Box | null {
  const b = blockAt(x, z); if (b) return b;
  const cell = OGRID.get(Math.floor(x / CELL) * 1000 + Math.floor(z / CELL));
  if (cell) for (const o of cell) if (x > o.x0 && x < o.x1 && z > o.z0 && z < o.z1) return o;
  return null;
}

const ring = (cx: number, cz: number, r: number, n: number): Array<[number, number]> =>
  Array.from({ length: n + 1 }, (_, i) => [cx + r * Math.cos((i / n) * Math.PI * 2), cz + r * Math.sin((i / n) * Math.PI * 2)] as [number, number]);

export const LINES: Line[] = [
  { id: 0, kind: 'path', pts: [[0, -110], [0, 110]] },                        // central avenue over the drawbridge
  { id: 1, kind: 'tram', pts: [[-188, TRAM_Z - 0.75], [188, TRAM_Z - 0.75]] }, // tram rails (two)
  { id: 2, kind: 'tram', pts: [[-188, TRAM_Z + 0.75], [188, TRAM_Z + 0.75]] },
  { id: 3, kind: 'path', pts: [[-110, 30], [-40, 30], [-40, 40], [-25, 40], [-10, 30], [20, 30]] }, // park path
  { id: 4, kind: 'ramp', pts: ring(BOWL.x, BOWL.z, BOWL.r - 2, 16) },          // bowl carve line
  { id: 5, kind: 'rail', pts: [[34, 30.5], [76, 30.5]] },                       // plaza stair handrail
  { id: 6, kind: 'path', pts: [[-110, 0], [110, 0]] },                         // canal-side promenade
  { id: 7, kind: 'path', pts: [[-110, 86], [110, 86]] },
  // ---- districts ----
  { id: 8, kind: 'path', pts: [[0, 110], [0, 196]] },                          // avenue north into the old town
  { id: 9, kind: 'path', pts: [[0, -110], [0, -196]] },                        // avenue south into the market
  { id: 10, kind: 'tram', pts: [[-120, TRAM2_Z - 0.75], [194, TRAM2_Z - 0.75]] }, // old-town tram
  { id: 11, kind: 'tram', pts: [[-120, TRAM2_Z + 0.75], [194, TRAM2_Z + 0.75]] },
  { id: 12, kind: 'path', pts: [[-120, 124], [194, 124]] },                    // old-town lower street
  { id: 13, kind: 'path', pts: [[-120, 179], [130, 179]] },                    // old-town upper street
  { id: 14, kind: 'path', pts: [[-64, 86], [-64, 196]] }, { id: 15, kind: 'path', pts: [[64, 86], [64, 196]] }, { id: 16, kind: 'path', pts: [[126, 86], [126, 196]] },
  { id: 17, kind: 'path', pts: [[-100, -150], [100, -150]] },                  // market square crossing
  { id: 18, kind: 'path', pts: [[-90, -110], [-90, -176]] }, { id: 19, kind: 'path', pts: [[90, -110], [90, -176]] },
  { id: 20, kind: 'path', pts: [[-85, 2], [-85, -30]] }, { id: 21, kind: 'path', pts: [[95, 2], [95, -30]] }, // footbridges
  { id: 22, kind: 'path', pts: [[-110, 0], [-140, 30], [-170, 0], [-140, -30], [-175, -60], [-150, -100], [-185, -130]] }, // hillside switchbacks
  { id: 23, kind: 'path', pts: [[110, 0], [190, 0]] }, { id: 24, kind: 'path', pts: [[150, -110], [150, 110]] }, // park paths
  { id: 25, kind: 'ramp', pts: ring(BOWL2.x, BOWL2.z, BOWL2.r - 2, 16) },
  { id: 26, kind: 'ramp', pts: [[HALFPIPE.x - HALFPIPE.w + 1.5, HALFPIPE.z0 + 8], [HALFPIPE.x - HALFPIPE.w + 1.5, HALFPIPE.z1 - 8]] }, // half-pipe wall line
  { id: 27, kind: 'path', pts: [[110, 86], [190, 86]] },
  { id: 28, kind: 'path', pts: [[-110, -110], [110, -110]] },
  { id: 29, kind: 'rail', pts: [[12, CANAL.z1 + 0.35], [120, CANAL.z1 + 0.35]] }, { id: 30, kind: 'rail', pts: [[-120, CANAL.z1 + 0.35], [-12, CANAL.z1 + 0.35]] }, // quay coping
  { id: 31, kind: 'rail', pts: [[12, CANAL.z0 - 0.35], [120, CANAL.z0 - 0.35]] }, { id: 32, kind: 'rail', pts: [[-120, CANAL.z0 - 0.35], [-12, CANAL.z0 - 0.35]] },
  { id: 33, kind: 'rail', pts: [[-116, 126.6], [-74, 126.6]] }, { id: 34, kind: 'rail', pts: [[12, 126.6], [54, 126.6]] }, { id: 35, kind: 'rail', pts: [[74, 126.6], [116, 126.6]] }, // stoop ledges
  { id: 36, kind: 'rail', pts: [[-58, -171], [58, -171]] },                     // market handrail
  { id: 37, kind: 'rail', pts: [[-176, -60], [-176, 60]] },                     // hillside terrace wall
];
// ---- solid scenery: trees (trunk hitbox) and hedges, deterministic scatter (render draws exactly these) ----
export interface Tree { x: number; z: number; s: number; seed: number }
const nearAnyLine = (x: number, z: number, r: number, kinds: LineKind[] = ['path', 'tram', 'rail', 'ramp']) => LINES.some((l) => kinds.includes(l.kind) && nearestOnLine(l, x, z).d < r);
export const TREES: Tree[] = [];
for (let i = 0; i < 1600 && TREES.length < 260; i++) {
  const x = (hash(i, 1) * 2 - 1) * (HALF - 6), z = (hash(i, 2) * 2 - 1) * (HALF - 6);
  if (blockAt(x, z) || blockAt(x + 3, z) || blockAt(x - 3, z) || blockAt(x, z + 3) || blockAt(x, z - 3) || (z > CANAL.z0 - 3 && z < CANAL.z1 + 3) || nearAnyLine(x, z, 4)) continue;
  if (Math.hypot(x - BOWL.x, z - BOWL.z) < BOWL.r + 3 || Math.hypot(x - BOWL2.x, z - BOWL2.z) < BOWL2.r + 3 || (Math.abs(x - HALFPIPE.x) < HALFPIPE.w + 10 && z > HALFPIPE.z0 - 4 && z < HALFPIPE.z1 + 4)) continue;
  if (x > PLAZA.x0 - 2 && x < PLAZA.x1 + 2 && z > PLAZA.z0 - 2 && z < PLAZA.z1 + 2) continue;
  if (KICKERS.some((k) => Math.hypot(x - k.x, z - k.z) < k.len + 6)) continue;
  if (Math.abs(heightAt(x + 1, z) - heightAt(x - 1, z)) > 0.6) continue; // not on slopes' faces
  TREES.push({ x, z, s: 0.8 + hash(i, 3) * 0.6, seed: i });
}
for (const [x, z] of [[32, 28], [48, 26], [64, 27], [80, 28], [88, 50], [88, 70], [33, 58]]) TREES.push({ x, z, s: 1, seed: -1 }); // plaza trees (render: jsr)
export const HEDGES: Box[] = [];
for (const [x0, x1, z] of [[-110, -45, 34], [110, 190, 4], [110, 190, -4], [-118, -70, 120], [10, 56, 120], [72, 118, 120], [-40, 40, -114]] as Array<[number, number, number]>)
  for (let x = x0; x < x1; x += 3.2) { if (nearAnyLine(x, z, 3, ['path', 'tram', 'ramp', 'rail'])) continue; HEDGES.push({ x0: x - 1.5, x1: x + 1.5, z0: z - 0.55, z1: z + 0.55, h: 1.3, color: 0x4f7a4c, y0: heightAt(x, z) }); }
export const OBSTACLES: Box[] = [{ ...DEALER_VAN, color: 0x6b6450, y0: heightAt((DEALER_VAN.x0 + DEALER_VAN.x1) / 2, (DEALER_VAN.z0 + DEALER_VAN.z1) / 2) }, ...TREES.map((t) => { const r = 0.45 * t.s; return { x0: t.x - r, x1: t.x + r, z0: t.z - r, z1: t.z + r, h: 6, color: 0x6b4a33, y0: heightAt(t.x, t.z) }; }), ...HEDGES];
for (const b of GEN_BLOCKS) if (b.kind === 'villa') b.y0 = Math.min(heightAt(b.x0, b.z0), heightAt(b.x1, b.z0), heightAt(b.x0, b.z1), heightAt(b.x1, b.z1));
const OGRID = new Map<number, Box[]>();
for (const b of OBSTACLES) for (let cx = Math.floor(b.x0 / CELL); cx <= Math.floor(b.x1 / CELL); cx++) for (let cz = Math.floor(b.z0 / CELL); cz <= Math.floor(b.z1 / CELL); cz++) {
  const k = cx * 1000 + cz; const a = OGRID.get(k) ?? []; a.push(b); OGRID.set(k, a);
}

/** True if the segment a→b passes within `clear` m of a tree trunk / hedge (for nav visibility). */
export function obstacleOnSeg(ax: number, az: number, bx: number, bz: number, clear = 0.8): boolean {
  const d = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(d / (CELL * 0.5))), seen = new Set<Box>();
  for (let i = 0; i <= n; i++) {
    const x = ax + ((bx - ax) * i) / n, z = az + ((bz - az) * i) / n;
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      const cell = OGRID.get((Math.floor(x / CELL) + dx) * 1000 + Math.floor(z / CELL) + dz); if (!cell) continue;
      for (const o of cell) {
        if (seen.has(o)) continue; seen.add(o);
        const cx = Math.max(o.x0, Math.min(o.x1, ax)), cz0 = Math.max(o.z0, Math.min(o.z1, az));
        // closest point on segment to box centre, then box-distance
        const ox = (o.x0 + o.x1) / 2, oz = (o.z0 + o.z1) / 2, L2 = d * d || 1;
        const t = Math.max(0, Math.min(1, ((ox - ax) * (bx - ax) + (oz - az) * (bz - az)) / L2));
        const px = ax + (bx - ax) * t, pz = az + (bz - az) * t;
        const ex = Math.max(o.x0 - px, 0, px - o.x1), ez = Math.max(o.z0 - pz, 0, pz - o.z1);
        void cx; void cz0;
        if (Math.hypot(ex, ez) < clear) return true;
      }
    }
  }
  return false;
}

/** Tram routes (shuttle back and forth between ends; stop at stops). Along +x on z = z. */
export const TRAM_ROUTES = [
  { id: 0, z: TRAM_Z, x0: -185, x1: 185, stops: [-150, -60, 30, 120] },
  { id: 1, z: TRAM2_Z, x0: -115, x1: 188, stops: [-80, 0, 64, 150] },
];
/** Moored boats along the canal (render-only). */
export const BOATS = [-110, -60, -30, 30, 60, 130, 165].map((x, i) => ({ x, z: i % 2 ? CANAL.z0 + 2.2 : CANAL.z1 - 2.2, len: 7 + (i % 3) * 2, seed: i }));

export const PARKED_BIKES: Array<{ x: number; z: number; kind: string }> = [
  { x: 4, z: -100, kind: 'city' }, { x: -50, z: 26, kind: 'bmx' }, { x: 40, z: 22, kind: 'fixie' },
  { x: -90, z: 4, kind: 'city' }, // the rest of the town's bikes are ridden by NPC cyclists now (jack them!)
];
export const SPAWN = { x: 0, z: -100, heading: 0 };

/** Closest point on a line to (x,z): distance, tangent heading (dir 0 = +z), and segment index. */
export function nearestOnLine(l: Line, x: number, z: number): { d: number; px: number; pz: number; heading: number; seg: number } {
  let best = { d: Infinity, px: 0, pz: 0, heading: 0, seg: 0 };
  for (let i = 0; i < l.pts.length - 1; i++) {
    const [ax, az] = l.pts[i], [bx, bz] = l.pts[i + 1];
    const vx = bx - ax, vz = bz - az, len2 = vx * vx + vz * vz || 1;
    const t = Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / len2));
    const px = ax + vx * t, pz = az + vz * t, d = Math.hypot(x - px, z - pz);
    if (d < best.d) best = { d, px, pz, heading: Math.atan2(vx, vz), seg: i };
  }
  return best;
}

/** Bike co-op: ride through to repaint your bike (heat → 0). */
export const COOP = { x: -60, z: 8, r: 5 };
/** Ammo crates (respawn after a while). */
export const PICKUPS: Array<{ x: number; z: number; kind: 'bazooka' | 'grenade' | 'oil' | 'bottle' | 'molotov' }> = [
  { x: 0, z: -60, kind: 'bottle' }, { x: 0, z: 70, kind: 'grenade' }, { x: -70, z: 30, kind: 'oil' },
  { x: 60, z: 10, kind: 'molotov' }, { x: 85, z: 60, kind: 'bazooka' }, { x: -100, z: 86, kind: 'grenade' },
  // districts (bigger map: a crate every ~60-80 m of riding)
  { x: 30, z: 124, kind: 'bottle' }, { x: -60, z: 179, kind: 'bazooka' }, { x: 0, z: -140, kind: 'molotov' }, { x: 40, z: -160, kind: 'oil' },
  { x: 150, z: 86, kind: 'grenade' }, { x: 150, z: 0, kind: 'bazooka' }, { x: -140, z: 30, kind: 'bottle' }, { x: 90, z: -60, kind: 'grenade' },
];
/** Unpaved ground (grass / park lawns): well away from any path, track, ramp or rail, and off the plaza. Scooters hate it. */
export function onGrass(x: number, z: number): boolean {
  if (x > PLAZA.x0 && x < PLAZA.x1 && z > PLAZA.z0 && z < PLAZA.z1) return false;
  return !nearAnyLine(x, z, 3.2);
}
/** On the plaza stairs (Segways hate them). */
export function onStairs(x: number, z: number): boolean {
  return x > PLAZA.x0 && x < PLAZA.x1 && z > PLAZA.stairsZ - 0.5 && z < PLAZA.stairsZ + PLAZA.stairsLen + 0.5;
}
