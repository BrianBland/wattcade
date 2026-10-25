// Chapter 2a's gut (#190), pure: a winding tube ~900 m long, travelled along −z. Everything is keyed to u = −z
// (metres into the fish): the centreline sways side to side, the floor heaves with the belly scene's trainer swells
// (the grade you feel is the slope you see), and five chambers joined by narrow necks: the antechamber where you wake,
// the rib nave, the bile pools, the junk chamber, and the boat chamber where the survey boat lies, ending at a flat
// stomach wall (the drill face). The ride spans and the spare parts' places come from the story.
import { STORY } from '../sim/story';
import { PARTS, type PartId } from '../sim/belly';
import { gradeAt } from '../sim/workout';
import { RouteSpline } from './route';

const scene = (id: string) => STORY.find((s) => s.id === id)!;
const railM = (id: string) => { const l = scene(id).length; return 'm' in l ? l.m : 0; };
/** Rail metres of the belly ride and the spare-parts ride (one after the other along the gut). */
export const BELLY_M = railM('belly'), PARTS_M = railM('spareParts');

const DU = 0.25, U0 = -16, U1 = 940, N = Math.round((U1 - U0) / DU) + 1;
const idx = (u: number) => Math.max(0, Math.min(N - 1.001, (u - U0) / DU));
const table = (f: (u: number) => number) => { const t = new Float64Array(N); for (let i = 0; i < N; i++) t[i] = f(U0 + i * DU); return t; };
const read = (t: Float64Array, u: number) => { const f = idx(u), i = Math.floor(f), k = f - i; return t[i] + (t[i + 1] - t[i]) * k; };
const smooth = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** Centreline x at depth u: a slow sway, so the gut ahead always bends out of sight. */
const cxRaw = (u: number) => 11 * Math.sin(u / 52) + 3.5 * Math.sin(u / 19 + 1);
const CX = table(cxRaw);
export const gutX = (u: number) => read(CX, u);

/** Horizontal arc length along the centreline from u = 0 (the route's s). */
const S = (() => {
  const t = new Float64Array(N), i0 = Math.round(-U0 / DU);
  for (let i = i0 + 1; i < N; i++) t[i] = t[i - 1] + Math.hypot(DU, CX[i] - CX[i - 1]);
  for (let i = i0 - 1; i >= 0; i--) t[i] = t[i + 1] - Math.hypot(DU, CX[i + 1] - CX[i]);
  return t;
})();
export const sOfU = (u: number) => read(S, u);
export function uOfS(s: number): number {
  let lo = 0, hi = N - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (S[m] < s) lo = m; else hi = m; }
  const k = (s - S[lo]) / (S[hi] - S[lo] || 1);
  return U0 + (lo + Math.max(0, Math.min(1, k))) * DU;
}

/** Depths of the story beats: the belly ride, the spare-parts ride, and the stomach wall (the drill face). */
export const GUT = (() => {
  const partsU = uOfS(BELLY_M), rideEnd = uOfS(BELLY_M + PARTS_M);
  return { back: -10, partsU, rideEnd, wall: rideEnd + 3.5 };
})();

/** Floor height of the centreline: the belly ride's grade integrated over its rail (flat before and after). */
const BELLY_TR = scene('belly').trainer;
const YB = (() => {
  const t = new Float64Array(N);
  for (let i = 1; i < N; i++) {
    const u = U0 + i * DU, s = read(S, u);
    const g = s > 0 && s < BELLY_M && BELLY_TR.mode === 'sim' ? gradeAt(BELLY_TR, s / BELLY_M) : 0;
    t[i] = t[i - 1] + (g / 100) * (S[i] - S[i - 1]);
  }
  return t;
})();
export const gutY = (u: number) => read(YB, u);

export interface Chamber { id: string; u0: number; u1: number; r: number; /** width × r */ wide: number; ribs: boolean; pools: number }
/** Bile-pool threshold: lower = more pools. */
export const CHAMBERS: readonly Chamber[] = [
  { id: 'ante', u0: GUT.back - 2, u1: 70, r: 5.4, wide: 1.15, ribs: false, pools: 0.7 },
  { id: 'nave', u0: 70, u1: 230, r: 8, wide: 1.1, ribs: true, pools: 0.7 },
  { id: 'pools', u0: 230, u1: 400, r: 7, wide: 1.32, ribs: false, pools: 0.52 },
  { id: 'junk', u0: 400, u1: GUT.partsU, r: 6.4, wide: 1.15, ribs: true, pools: 0.68 },
  { id: 'boat', u0: GUT.partsU, u1: GUT.wall + 2, r: 8.6, wide: 1.2, ribs: true, pools: 0.66 },
];
export const chamberAt = (u: number) => CHAMBERS.find((c) => u < c.u1) ?? CHAMBERS[CHAMBERS.length - 1];

/** Cross-section radius and width factor at depth u: chamber sizes blended across the necks, which pinch in. */
const RAD = table((u) => {
  let r = CHAMBERS[0].r;
  for (let i = 1; i < CHAMBERS.length; i++) r += (CHAMBERS[i].r - CHAMBERS[i - 1].r) * smooth(CHAMBERS[i].u0 - 12, CHAMBERS[i].u0 + 12, u);
  let neck = 1;
  for (let i = 1; i < CHAMBERS.length; i++) neck *= 1 - 0.4 * Math.exp(-(((u - CHAMBERS[i].u0) / 5) ** 2));
  return r * neck * (1 + 0.12 * Math.sin(u / 11) + 0.06 * Math.sin(u / 4.3 + 1));
});
const WIDE = table((u) => {
  let w = CHAMBERS[0].wide;
  for (let i = 1; i < CHAMBERS.length; i++) w += (CHAMBERS[i].wide - CHAMBERS[i - 1].wide) * smooth(CHAMBERS[i].u0 - 12, CHAMBERS[i].u0 + 12, u);
  return w;
});
export const gutR = (u: number) => read(RAD, u);
export const gutWide = (u: number) => read(WIDE, u);

/** Floor ripple across the gut (local x from the centreline): soft folds. */
export const floorRipple = (lx: number, u: number) => 0.14 * Math.sin(lx * 1.5 + 2 * Math.sin(u * 0.33)) + 0.08 * Math.sin(-u * 0.9 + lx * 0.4);
/** Floor height at a world point. */
export const gutFloor = (x: number, z: number) => gutY(-z) + floorRipple(x - gutX(-z), -z);

/** The route down the middle of the gut: s = 0 where you wake, ending just short of the stomach wall. */
let routeCache: RouteSpline | null = null;
export function gutRoute(): RouteSpline {
  if (!routeCache) {
    const pts: Array<[number, number, number]> = [];
    for (let u = 0; u < GUT.rideEnd + 2; u += 2) pts.push([gutX(u), gutY(u), -u]);
    pts.push([gutX(GUT.rideEnd + 2), gutY(GUT.rideEnd + 2), -(GUT.rideEnd + 2)]);
    routeCache = new RouteSpline(pts, 2);
  }
  return routeCache;
}

/** The drill tunnel: its mouth on the stomach wall (centre at the bit's height), boring along −z. */
export function drillAxis(): { x: number; y: number; z: number } {
  const u = GUT.wall;
  return { x: gutX(u), y: gutY(u) + 1.3, z: -u };
}
export const TUNNEL_R = 1.3;

/** A world point at depth u, `d` metres right of the centreline (travel is −z, so right is +x), on the floor. */
export const gutPoint = (u: number, d: number) => { const x = gutX(u) + d; return { x, y: gutFloor(x, -u), z: -u }; };

/** Where the swallowed junk lies (depth, lateral). The old rod is the first thing you ride past. */
export const JUNK = {
  rod: { u: 58, d: -1.5 }, hubcap: [{ u: 26, d: -2.4 }, { u: 214, d: 2.9 }, { u: 538, d: -2.2 }],
  sign: { u: 152, d: 3.6 }, dinghy: { u: 318, d: -3.6 }, tyre: { u: 452, d: -2.8 }, trap: { u: 497, d: 2.9 },
  boat: { u: uOfS(BELLY_M + 0.16 * PARTS_M), d: -4.6 },
} as const;

/** The spare parts on the floor: at their spare-parts progress along the ride, alternating sides of the line. */
export const PART_SPOTS: Record<PartId, { u: number; d: number }> = Object.fromEntries(
  PARTS.map((p, i) => [p.id, { u: uOfS(BELLY_M + p.at * PARTS_M), d: [1.5, -1.4, 1.3][i] }]),
) as Record<PartId, { u: number; d: number }>;

/** Bile-pool light positions every ~17 m, alternating sides (the renderer keeps a few lit near the eye). */
export const GUT_LIGHTS: ReadonlyArray<readonly [number, number, number]> = (() => {
  const out: Array<[number, number, number]> = [];
  for (let u = 4, i = 0; u < GUT.wall; u += 17, i++) { const p = gutPoint(u, (i % 2 ? 1 : -1) * 2.2); out.push([p.x, p.y + 0.6, p.z]); }
  return out;
})();
