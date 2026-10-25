// Chapter 2b's island (#191), pure: a perfectly round island (that's what's wrong with it), centred on the origin.
// The route: paddle in from ~1 km out along a radius, land on the beach, then the boardwalk spirals inward round the
// shore (the island on your left, the sea on your right, a little farther every lap), turns to fitted stone and keeps
// spiralling up the flank to a plateau, swings in, and runs straight across the plateau into the monkey head's mouth
// and on down the temple hall. Every road height is the scenes' trainer grade integrated along its rail (the slope you
// see is the grade you feel); the ground is a function of the radius alone, read off the road.
import { STORY } from '../sim/story';
import { gradeAt } from '../sim/workout';
import { RouteSpline } from './route';

export const SEA_Y = 0;
/** Where the sand meets the water (m from the centre). */
export const SHORE_R = 300;
const BEACH_R = 296, LAND_THETA = 0.55;

const scene = (id: string) => STORY.find((s) => s.id === id)!;
const railM = (id: string) => { const l = scene(id).length; return 'm' in l ? l.m : 0; };
export const RAILS = { paddle: railM('paddle'), boardwalk: railM('boardwalk'), cutStones: railM('cutStones'), monkeyMouth: railM('monkeyMouth'), temple: railM('temple') };
const smooth = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

type P2 = [number, number];
const dir = (a: number): P2 => [Math.cos(a), Math.sin(a)];

/** Arc length of the spiral r = lerp(r0, r1, k) over θ0 → θ0 − Δθ. */
function spiralLen(r0: number, r1: number, dTheta: number): number {
  let L = 0;
  const n = 400, dr = (r1 - r0) / dTheta;
  for (let i = 0; i < n; i++) { const r = lerp(r0, r1, (i + 0.5) / n); L += Math.hypot(r, dr) * (dTheta / n); }
  return L;
}
const solveTheta = (r0: number, r1: number, L: number) => { let lo = 0.01, hi = 60; for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (spiralLen(r0, r1, m) < L) lo = m; else hi = m; } return (lo + hi) / 2; };

interface Built { pts: P2[]; marks: Record<string, P2>; head: { at: P2; fwd: P2 } }

/** The route's ground plan (x, z), sampled every ~2 m, with the scene boundaries marked. */
const PLAN: Built = (() => {
  const pts: P2[] = [], marks: Record<string, P2> = {};
  const push = (p: P2) => pts.push([p[0], p[1]]);
  const B = dir(LAND_THETA).map((v) => v * BEACH_R) as P2, inward = LAND_THETA + Math.PI;
  // paddle: straight in along the radius
  for (let s = 0; s <= RAILS.paddle; s += 2) { const k = RAILS.paddle - s; push([B[0] - Math.cos(inward) * k, B[1] - Math.sin(inward) * k]); }
  marks.beach = B;
  // a right turn (radius 8) onto the shore line, island on the left
  const arc = (P: P2, phi: number, turn: number, rho: number) => {
    const sg = Math.sign(turn), c: P2 = [P[0] + rho * Math.cos(phi + sg * Math.PI / 2), P[1] + rho * Math.sin(phi + sg * Math.PI / 2)];
    const a0 = phi - sg * Math.PI / 2, n = Math.max(2, Math.ceil((Math.abs(turn) * rho) / 2));
    for (let i = 1; i <= n; i++) { const a = a0 + (turn * i) / n; push([c[0] + rho * Math.cos(a), c[1] + rho * Math.sin(a)]); }
    return { end: pts[pts.length - 1], phi: phi + turn, len: Math.abs(turn) * rho };
  };
  const t1 = arc(B, inward, Math.PI / 2, 8);
  // the boardwalk spiral, then the stone road spiral (θ decreasing keeps the centre on the left)
  const spiral = (P: P2, r1: number, L: number) => {
    const r0 = Math.hypot(P[0], P[1]), th0 = Math.atan2(P[1], P[0]), dTh = solveTheta(r0, r1, L), n = Math.ceil(L / 2);
    for (let i = 1; i <= n; i++) { const k = i / n, r = lerp(r0, r1, k), th = th0 - dTh * k; push([r * Math.cos(th), r * Math.sin(th)]); }
    return pts[pts.length - 1];
  };
  const bwEnd = spiral(t1.end, 262, RAILS.boardwalk - t1.len);
  marks.cutStones = bwEnd;
  const TURN_R = 40, turnLen = (Math.PI / 2) * TURN_R;
  const csEnd = spiral(bwEnd, 230, RAILS.cutStones - turnLen);
  // a left turn to head in across the plateau
  const th = Math.atan2(csEnd[1], csEnd[0]), t2 = arc(csEnd, th - Math.PI / 2, -Math.PI / 2, TURN_R);
  marks.monkeyMouth = t2.end;
  const fwd = dir(t2.phi);
  const straight = (from: P2, L: number) => { for (let s = 2; s <= L + 1e-6; s += 2) push([from[0] + fwd[0] * s, from[1] + fwd[1] * s]); return pts[pts.length - 1]; };
  const mmEnd = straight(t2.end, RAILS.monkeyMouth);
  marks.temple = mmEnd;
  straight(mmEnd, RAILS.temple + 6);
  const faceAt: P2 = [mmEnd[0] - fwd[0] * 14, mmEnd[1] - fwd[1] * 14];
  return { pts, marks, head: { at: faceAt, fwd } };
})();

/** Road height (m) at route metres s: sea level paddling (up onto the sand at the very end), then each scene's grade. */
let ROUTE: RouteSpline | null = null;
let SPAN: Record<string, [number, number]> | null = null;
let HY: Float64Array | null = null;
const STEP = 1;

function build() {
  if (ROUTE) return;
  const flat = new RouteSpline(PLAN.pts.map(([x, z]) => [x, 0, z] as [number, number, number]), 2);
  const sAt = (p: P2) => flat.nearest(p[0], p[1], 6)!.s;
  const b = sAt(PLAN.marks.beach), c = sAt(PLAN.marks.cutStones), m = sAt(PLAN.marks.monkeyMouth), t = sAt(PLAN.marks.temple);
  SPAN = { paddle: [0, b], beach: [b, b], boardwalk: [b, c], cutStones: [c, m], monkeyMouth: [m, t], temple: [t, t + RAILS.temple] };
  const n = Math.ceil(flat.length / STEP) + 1, hy = new Float64Array(n);
  const gradeOf = (s: number) => {
    for (const id of ['boardwalk', 'cutStones'] as const) {
      const [a, z] = SPAN![id];
      if (s >= a && s < z) { const tr = scene(id).trainer; return tr.mode === 'sim' ? gradeAt(tr, (s - a) / (z - a)) : 0; }
    }
    return 0;
  };
  hy[0] = SEA_Y;
  for (let i = 1; i < n; i++) {
    const s = i * STEP;
    hy[i] = s <= b ? SEA_Y + DECK0 * smooth(b - 14, b, s) : hy[i - 1] + (gradeOf(s - STEP / 2) / 100) * STEP;
  }
  HY = hy;
  ROUTE = new RouteSpline(PLAN.pts.map(([x, z]) => { const s = flat.nearest(x, z, 3)?.s ?? 0; return [x, hyAt(s), z] as [number, number, number]; }), 2);
}
/** Deck height where the boardwalk starts (the bike rides up out of the shallows onto the sand). */
const DECK0 = 0.8;

export function roadY(s: number): number { build(); return hyAt(s); }
function hyAt(s: number): number {
  const f = Math.max(0, Math.min(HY!.length - 1.001, s / STEP)), i = Math.floor(f);
  return HY![i] + (HY![i + 1] - HY![i]) * (f - i);
}
export function islandRoute(): RouteSpline { build(); return ROUTE!; }
/** Route metres each scene runs over (the beach is a point). */
export function islandSpan(id: keyof typeof RAILS | 'beach'): [number, number] { build(); return SPAN![id]; }
export const PLATEAU_Y = () => roadY(islandSpan('monkeyMouth')[0]);

/** The monkey head: its face on the approach line (straight on toward the hall), and the forward direction (x, z). */
export const HEAD = PLAN.head;
/** Head/hall local frame: u right of the rider, w metres past the face plane, from a world point. */
export function headLocal(x: number, z: number): { u: number; w: number } {
  const [fx, fz] = HEAD.fwd, dx = x - HEAD.at[0], dz = z - HEAD.at[1];
  return { u: dx * -fz + dz * fx, w: dx * fx + dz * fz };
}
export function headWorld(u: number, w: number): P2 {
  const [fx, fz] = HEAD.fwd;
  return [HEAD.at[0] + fx * w - fz * u, HEAD.at[1] + fz * w + fx * u];
}
/** The hall behind the face: half-width, height, length (m); the massif around it. */
export const HALL = { half: 13, h: 20, len: RAILS.temple + 30, massifHalf: 36, massifH: 48 };

// ---- the ground: a function of the radius (radial symmetry is the tell) ---------------------------------------------

let RADIAL: { r0: number; dr: number; h: Float64Array } | null = null;
/** Bare ground height at radius r (no noise): sea floor, reef, sand, the jungle under the boardwalk's stilts, the
 *  hillside the stone road is cut into, the plateau. */
export function radialH(r: number): number {
  if (!RADIAL) {
    build();
    // the road's height against its radius over the two spirals (r falls monotonically along them)
    const route = ROUTE!, [b0, b1] = SPAN!.boardwalk, [, c1] = SPAN!.cutStones;
    const pairs: Array<[number, number, number]> = []; // r, road y, stilt gap
    for (let s = b0 + 14; s <= c1; s += 2) {
      const p = route.at(s), r = Math.hypot(p.x, p.z), onBw = s < b1;
      pairs.push([r, p.y, onBw ? lerp(0.5, 2.6, smooth(b0, b1, s)) : 0]);
    }
    pairs.sort((a, b) => a[0] - b[0]);
    const r0 = 150, dr = 0.5, n = Math.ceil((SHORE_R - r0) / dr) + 1, h = new Float64Array(n);
    let j = 0;
    for (let i = 0; i < n; i++) {
      const r = r0 + i * dr;
      while (j < pairs.length - 2 && pairs[j + 1][0] < r) j++;
      const [ra, ya, ga] = pairs[j], [rb, yb, gb] = pairs[Math.min(j + 1, pairs.length - 1)];
      const k = rb > ra ? Math.max(0, Math.min(1, (r - ra) / (rb - ra))) : 0;
      h[i] = r < pairs[0][0] ? pairs[0][1] : lerp(ya - ga, yb - gb, k);
    }
    RADIAL = { r0, dr, h };
  }
  const R = RADIAL;
  if (r <= R.r0) return R.h[0];
  const shoreTop = R.h[R.h.length - 1];
  if (r < SHORE_R - 4) { const f = (r - R.r0) / R.dr, i = Math.floor(f); return R.h[i] + (R.h[i + 1] - R.h[i]) * (f - i); }
  // beach: down to the waterline, a neon reef shelf, then deep water
  if (r < SHORE_R) return lerp(shoreTop, SEA_Y + 0.15, (r - (SHORE_R - 4)) / 4);
  if (r < SHORE_R + 6) return lerp(SEA_Y + 0.15, SEA_Y - 1.3, (r - SHORE_R) / 6);
  if (r < 360) return SEA_Y - 1.4;
  return lerp(SEA_Y - 1.4, SEA_Y - 14, smooth(360, 430, r));
}

/** Distance (m) of a world point from the approach lane (the straight in across the plateau, kept clear of trees so
 *  the head reads from the start of it), or Infinity off its length. */
export function approachLane(x: number, z: number): number {
  const { u, w } = headLocal(x, z);
  return w > 6 || w < -(RAILS.monkeyMouth + 40) ? Infinity : Math.abs(u);
}
