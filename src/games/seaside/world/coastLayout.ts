// Highway 1 for Chapter 1 (#189), as pure layout data: the road's centre line and elevation, the landmarks along it
// (pullouts, the creek gorge under the arch bridge, Lou's lot, the harbour town) and the ridden route, which leaves
// the highway at the harbour and runs out to the end of the (too long) pier.
// Coordinates: metres, y up, the highway heads toward −z with the sea on the left (−x). Road y = 0 at the start.
import { definePalette } from '../voxel/palette';
import { fbm, smooth } from '../voxel/noise';
import { RouteSpline } from './route';

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
  // #189: the bridge, the town, the pier, Lou's
  concrete: 0xd8d2c3, concrete2: 0xcbc4b3, concreteDark: 0xa39d8f,
  plank: 0xa07c56, plank2: 0x8e6c49, plankGap: 0x4a3828, piling: 0x5a4532, piling2: 0x4b3a2a,
  houseCream: 0xf1e2c4, houseBlue: 0xa3c8d6, houseSalmon: 0xe8a68b, houseWhite: 0xf5f0e6, houseMint: 0xb9dcc0,
  roofRed: 0xb4533c, roofGrey: 0x6e7276, roofTeal: 0x4c8884, trim: 0xf7f3ea, door: 0x5a3d2b,
  shopWood: 0x8a6a4c, shopWood2: 0x7a5c40, signRed: 0xc63f2e, awnRed: 0xd8452f, awnWhite: 0xf6f2ea, lamp: 0x2e2f31, lampGlass: 0xfff1c4,
  pave: 0xc9c2b2, pave2: 0xbdb6a6,
});
const C = COAST.idx;

/** Random colour variants folded into their base colour (for greedy meshing; shader noise supplies the variety). */
export const COAST_FOLD = (() => {
  const m = new Uint8Array(256).map((_, i) => i);
  const fold: Array<[keyof typeof C, keyof typeof C]> = [['asphalt2', 'asphalt'], ['asphalt3', 'asphalt'], ['gravel2', 'gravel'], ['grass2', 'grass'], ['grass3', 'grass'],
    ['grassG2', 'grassG'], ['scrub2', 'scrub'], ['scrub3', 'scrub'], ['ice2', 'ice'], ['iceFlower2', 'iceFlower'], ['sand2', 'sand'], ['kelp2', 'kelp'],
    ['cypress2', 'cypress'], ['cypress3', 'cypress'], ['bark2', 'bark'], ['cloud2', 'cloud'], ['concrete2', 'concrete'], ['plank2', 'plank'],
    ['piling2', 'piling'], ['shopWood2', 'shopWood'], ['pave2', 'pave']];
  for (const [a, b] of fold) m[C[a]] = C[b];
  return m;
})();

export const SEA_LEVEL = -16;

/** Mountain spurs that run down to the sea as headlands; the road swings out around each one. The last one, past the
 *  harbour, carries the lighthouse. */
export const SPURS: Array<{ z: number; w: number; h: number; out: number }> = [
  { z: -640, w: 130, h: 260, out: 150 }, { z: -1250, w: 190, h: 420, out: 220 }, { z: -2050, w: 280, h: 600, out: 300 }, { z: -3700, w: 300, h: 700, out: 330 },
  { z: -4500, w: 240, h: 520, out: 240 }, { z: -6250, w: 250, h: 560, out: 250 }, { z: -7750, w: 170, h: 230, out: 170 },
];
export const spurW = (z: number, sp: (typeof SPURS)[number]) => Math.exp(-(((z - sp.z) / sp.w) ** 2));
export const spurK = (z: number) => SPURS.reduce((a, sp) => a + spurW(z, sp), 0);
/** Where the road crosses the creek gorge on the arch bridge. The road swings 120 m inland across it (east of south),
 *  so from the rollers' crest the bridge is seen at an angle, arch and all. */
export const BRIDGE_Z = -5155;
const bridgeSwing = (z: number) => 60 * Math.tanh((BRIDGE_Z - z) / 70);
/** Highway centre-line x(z). */
export const roadX = (z: number) => 90 * (Math.cos(z / 360) - 1) + 6 * (Math.sin(z / 75 + 1) - Math.sin(1)) - SPURS.reduce((a, sp) => a + sp.out * 0.8 * spurW(z, sp), 0) + bridgeSwing(z);

// ---- arc length along the highway (x(z) only, so elevation can be planned in route metres) ----
const HZ0 = 40, HZ1 = -9600, HSTEP = 2;
const HS = (() => {
  const n = Math.ceil((HZ0 - HZ1) / HSTEP), s = new Float64Array(n + 1);
  for (let i = 1; i <= n; i++) s[i] = s[i - 1] + Math.hypot(roadX(HZ0 - i * HSTEP) - roadX(HZ0 - (i - 1) * HSTEP), HSTEP);
  return s;
})();
/** Highway metres from the start at z (the highway is monotone in z). */
export function sOfZ(z: number): number {
  const f = Math.max(0, Math.min(HS.length - 1.001, (HZ0 - z) / HSTEP)), i = Math.floor(f);
  return HS[i] + (HS[i + 1] - HS[i]) * (f - i);
}
/** z of the highway point `s` metres from the start. */
export function zOfS(s: number): number {
  let lo = 0, hi = HS.length - 1;
  if (s <= 0) return HZ0;
  if (s >= HS[hi]) return HZ1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (HS[m] <= s) lo = m; else hi = m; }
  return HZ0 - (lo + (s - HS[lo]) / (HS[hi] - HS[lo])) * HSTEP;
}

/** Highway metres at the bridge's middle. */
export const BRIDGE_S = sOfZ(BRIDGE_Z);

// ---- Chapter 1 landmarks (route metres) ----
/**
 * Where the Morning happens. The ride scenes run between these (render/morningShots.ts maps scene progress onto
 * them); their spans match the scenes' rail lengths in sim/story.ts within a few metres (tested).
 */
export const CH1 = {
  /** The title card: stopped on the road in the fog. */ start: 8,
  /** Turnout 1 (fishing stop): centre; the pull-off spans ±25 m. */ turnout: 3395,
  /** Lou's Bait & Tackle: the gravel lot spans ±30 m. */ shop: 6151,
  /** Where the route leaves the highway for the harbour street. */ junction: 7944,
  /** Town flat along the highway (from / to the junction). */ townBefore: 300, townAfter: 220,
  /** Harbour front: the flat between the highway and the sea wall (m from the road edge). */ front: 44,
  /** Radius of the turn onto the street, and the pier's length. */ turnR: 22, pierLen: 480,
};
/** Town / pier height: half a fine voxel off the grid, so the corridor's rounding noise never flips whole cells. */
export const TOWN_Y = SEA_LEVEL + 8 + 0.0625;

/** The rollers' grade profile (the scene's trainer profile in story.ts: [progress, grade %]), laid along the road. */
export const ROLLERS_PROFILE: ReadonlyArray<readonly [number, number]> = [[0, 0.5], [0.3, 4], [0.55, 4], [0.65, 0], [0.8, -3], [1, -1]];
export const ROLLERS = { s0: CH1.turnout + 28, s1: CH1.shop - 28 };

/** Grade (%) keyframes along the highway; the descent into the harbour is solved so the town sits at TOWN_Y. */
function gradeKeys(descent: number): Array<[number, number]> {
  const T = CH1.turnout, S = CH1.shop, J = CH1.junction, town0 = J - CH1.townBefore;
  const k: Array<[number, number]> = [[0, 0.15], [T - 70, 0.15], [T - 35, 0], [T + 26, 0]];
  for (const [p, g] of ROLLERS_PROFILE) k.push([ROLLERS.s0 + p * (ROLLERS.s1 - ROLLERS.s0), g]);
  k.push([S - 14, 0], [S + 34, 0], [S + 200, -descent], [town0 - 180, -descent], [town0, 0], [J + CH1.townAfter, 0], [J + CH1.townAfter + 200, 1.6], [1e6, 1.6]);
  return k;
}
const gradeAt = (k: Array<[number, number]>, s: number) => {
  let i = 0;
  while (i < k.length - 2 && k[i + 1][0] <= s) i++;
  const [s0, g0] = k[i], [s1, g1] = k[i + 1];
  return g0 + (g1 - g0) * Math.max(0, Math.min(1, (s - s0) / (s1 - s0)));
};
const integrate = (k: Array<[number, number]>) => {
  const n = Math.ceil(HS[HS.length - 1] / HSTEP) + 1, out = new Float64Array(n);
  for (let i = 1; i < n; i++) out[i] = out[i - 1] + (gradeAt(k, (i - 0.5) * HSTEP) / 100) * HSTEP;
  return out;
};
/** Base elevation (no wiggle) every HSTEP metres of highway. */
const ELEV = (() => {
  const a = integrate(gradeKeys(0)), b = integrate(gradeKeys(1)), at = Math.round((CH1.junction - CH1.townBefore) / HSTEP);
  const descent = (a[at] - TOWN_Y) / (a[at] - b[at]); // the descent is linear in its grade
  return integrate(gradeKeys(descent));
})();
const elevAt = (s: number) => { const f = Math.max(0, Math.min(ELEV.length - 1.001, s / HSTEP)), i = Math.floor(f); return ELEV[i] + (ELEV[i + 1] - ELEV[i]) * (f - i); };

/** 0..1 inside a window [a, b] of highway metres, eased over `e` metres at each end. */
export const win = (s: number, a: number, b: number, e: number) => smooth(a - e, a + e, s) * (1 - smooth(b - e, b + e, s));

// ---- pullouts on the sea side: the van's turnout, Turnout 1, Lou's lot ----
export interface Pullout { s0: number; s1: number; /** extra width toward the sea (m) */ depth: number }
/** The parked van's turnout near the start (panel 02), by z (the fishing dev page still uses it). */
export const TURNOUT = { z0: -84, z1: -56 };
export const PULLOUTS: Pullout[] = [
  { s0: sOfZ(TURNOUT.z1), s1: sOfZ(TURNOUT.z0), depth: 7 },
  { s0: CH1.turnout - 25, s1: CH1.turnout + 25, depth: 8 },
  { s0: CH1.shop - 30, s1: CH1.shop + 30, depth: 22 },
];
export const pulloutAt = (s: number) => PULLOUTS.reduce((a, p) => Math.max(a, win(s, p.s0, p.s1, 5)), 0);
const pulloutDepth = (s: number) => PULLOUTS.reduce((a, p) => a + p.depth * win(s, p.s0, p.s1, 5), 0);
/** The harbour town (0..1). */
export const townAt = (s: number) => win(s, CH1.junction - CH1.townBefore, CH1.junction + CH1.townAfter, 40);

// ---- the creek gorge under the arch bridge ----
/** The gorge runs inland to the north-east, square to the bridge: its centre line is z = z0 + (x − x0) · slope. */
export const GORGE = { z: BRIDGE_Z, x: roadX(BRIDGE_Z), slope: 0.85, floor: 7, wall: 1.25 };
const GORGE_COS = 1 / Math.hypot(1, GORGE.slope);
/** Across-gorge distance (m) of (x, z) from its centre line, signed (+ = north). */
export const gorgeOff = (x: number, z: number) => (z - GORGE.z - (x - GORGE.x) * GORGE.slope) * GORGE_COS;
/** Height of the gorge surface at (x, z), d metres from the road (+∞ outside it); `bed` is the creek bed's height there. */
export function gorgeAt(x: number, z: number, d: number): { h: number; bed: number; floor: boolean } {
  const g = GORGE, bed = SEA_LEVEL + 0.5 + Math.max(0, d - 12) * 0.05 + Math.max(0, d - 220) * 0.15 - Math.max(0, -d - 18) * 0.08;
  const wobble = (fbm(d / 40, 3.1, 2, 71) - 0.5) * 14 + (fbm(z / 9, d / 9, 2, 72) - 0.5) * 3;
  const half = g.floor + Math.max(0, d) * 0.04, off = Math.abs(gorgeOff(x, z) + wobble * (0.3 + Math.min(1, Math.abs(d) / 200)));
  const h = bed + Math.max(0, off - half) * g.wall + (fbm(z / 7, d / 7, 2, 73) - 0.5) * 2.5 * smooth(half, half + 4, off);
  return { h, bed, floor: off <= half + 0.5 };
}

/** Wiggle on top of the planned elevation: full on the open highway, softer on the rollers, none where it's built up. */
const wiggleAt = (s: number) => {
  const flat = Math.max(pulloutAt(s), townAt(s), win(s, BRIDGE_S - 130, BRIDGE_S + 130, 30));
  return (1 - flat) * (s > ROLLERS.s0 - 30 && s < ROLLERS.s1 + 30 ? 0.35 : s > CH1.shop ? 0.5 : 1);
};
/** Highway elevation y(z). */
export const roadY = (z: number) => { const s = sOfZ(z); return elevAt(s) + 1.1 * Math.sin(z / 60) * wiggleAt(s); };

/** Cliff edge offset from the road centre (negative = sea side): pullouts and the harbour front push it out. */
export const edgeD = (z: number) => {
  const s = sOfZ(z), p = pulloutAt(s), t = townAt(s);
  return -8.5 - 6 * fbm(z / 22, 3.3, 3, 5) * (1 - Math.max(p, t)) - pulloutDepth(s) - (CH1.front - 2.5) * t - SPURS.reduce((a, sp) => a + sp.out * 0.35 * spurW(z, sp), 0) * (1 - t);
};

// ---- the ridden route: the highway, then a left turn down the harbour street and out along the pier ----
const ROUTE_Z0 = 40;
export interface PierGeom { /** route metres */ junction: number; street: number; start: number; end: number; y: number;
  /** heading of the street and pier (unit, horizontal) and the point where the turn ends */ dir: { x: number; z: number }; turnEnd: { x: number; z: number } }
let built: { route: RouteSpline; pier: PierGeom } | null = null;
function build() {
  const zj = zOfS(CH1.junction), pts: Array<[number, number, number]> = [];
  for (let z = ROUTE_Z0; z > zj; z -= 4) pts.push([roadX(z), roadY(z), z]);
  const xj = roadX(zj), R = CH1.turnR, y = TOWN_Y;
  // a quarter turn to the left (toward −x), then due west: the street across the harbour front and the pier
  for (let a = 0; a <= Math.PI / 2 + 1e-9; a += Math.PI / 16) pts.push([xj - R + R * Math.cos(a), y, zj - R * Math.sin(a)]);
  const x0 = xj - R, z0 = zj - R, edgeX = xj - 6 - CH1.front;
  for (let x = x0 - 6; x > edgeX - CH1.pierLen; x -= 6) pts.push([x, y, z0]);
  pts.push([edgeX - CH1.pierLen, y, z0]);
  const route = new RouteSpline(pts, 4);
  const jS = route.nearest(xj, zj, 8)!.s, startS = route.nearest(edgeX, z0, 8)!.s;
  const pier: PierGeom = { junction: jS, street: route.nearest(x0, z0, 8)!.s, start: startS, end: route.length, y, dir: { x: -1, z: 0 }, turnEnd: { x: x0, z: z0 } };
  return { route, pier };
}
export const coastRoute = () => (built ??= build()).route;
export const pierGeom = () => (built ??= build()).pier;
/** Route distance of a point on the highway at z (before the junction). */
export const sAtZ = (z: number) => coastRoute().nearest(roadX(z), z, 40)!.s;

/** Route metres where the road crosses the gorge on the bridge (the deck spans the void). */
let bridgeSpan: { s0: number; s1: number } | null = null;
export function bridge(): { s0: number; s1: number } {
  if (bridgeSpan) return bridgeSpan;
  const r = coastRoute();
  let s0 = Infinity, s1 = -Infinity;
  for (let s = BRIDGE_S - 200; s <= BRIDGE_S + 200; s += 1) {
    const p = r.at(s), g = gorgeAt(p.x, p.z, 0);
    if (g.h < p.y - 1.5) { s0 = Math.min(s0, s); s1 = Math.max(s1, s); }
  }
  return (bridgeSpan = { s0: s0 - 6, s1: s1 + 6 });
}

/** Does route distance s cross a void (bridge deck, pier)? */
export const spanAt = (s: number) => { const b = bridge(); return (s > b.s0 && s < b.s1) || s > pierGeom().start - 1; };
