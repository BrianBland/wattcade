// The Morning's riding camera and the bike's line on the coast (pure). The camera rides the right lane looking down the
// road (the eyes drift out to the sea now and then); the bike's heading is the line it rides, so the bars point down
// the road even while the eyes are on the water. Stops are reached by riding there: `Leg`s are short curves in
// (route metres, lateral metres) that pull off the road into a turnout or across the pier to the rail, and back out.
import { CH1, coastRoute, edgeD, pierGeom, SEA_LEVEL, zOfS } from '../world/coastLayout';
import { PIER_FISH_BACK } from '../world/coastBuild';

export interface V3 { x: number; y: number; z: number }

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const smooth = (a: number, b: number, x: number) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const v = (x: number, y: number, z: number): V3 => ({ x, y, z });

/** The riding line (m right of the centre line) on the highway, and the eye's height over the road. */
export const LANE = 4.2, EYE = 1.5;

/** A point on the route `d` metres across, `s` metres along (straight on past the end of the pier). */
export function pointAhead(s: number, d: number): V3 {
  const r = coastRoute(), L = r.length;
  const p = r.offset(Math.min(s, L), d);
  if (s <= L) return p;
  const t = r.tangent(L);
  return v(p.x + t.x * (s - L), p.y, p.z + t.z * (s - L));
}

/** The route's direction of travel at s (horizontal unit vector). */
export function roadHeading(s: number): V3 {
  const t = coastRoute().tangent(Math.min(s, coastRoute().length));
  return v(t.x, 0, t.z);
}

/** How far the eyes have drifted out to the sea at route metres s (0..1): a slow look now and then, never on the pier. */
export function seaGlance(s: number): number {
  const P = pierGeom(), w = Math.sin((2 * Math.PI * (s - 260)) / 610);
  return 0.55 * clamp01((w - 0.55) / 0.45) ** 1.5 * (1 - smooth(P.junction - 160, P.junction - 60, s));
}

/** The riding camera at route metres s: right lane, eyes down the road (and the sea now and then); centred and level on
 *  the pier. */
export function rideCam(s: number): { eye: V3; target: V3; heading: V3 } {
  const P = pierGeom(), k = smooth(P.junction - 40, P.street + 6, s);
  const lane = lerp(LANE, 1.4, k), p = coastRoute().offset(s, lane);
  const road = pointAhead(s + 42, lerp(lane * 0.55, 0, k)), sea = pointAhead(s + 70, -48), gl = seaGlance(s);
  const target = v(lerp(road.x, sea.x, gl), lerp(road.y - 1.9, SEA_LEVEL + 10, gl), lerp(road.z, sea.z, gl));
  return { eye: v(p.x, p.y + EYE, p.z), target, heading: roadHeading(s) };
}

// ---- legs: riding off the line to a stop and back ----------------------------------------------------------------
type P2 = readonly [number, number]; // [route metres, lateral metres]
export interface Leg { p: readonly [P2, P2, P2, P2]; cum: Float64Array; len: number }
const N = 96;

const bez = (p: Leg['p'], u: number, i: 0 | 1) => {
  const a = 1 - u;
  return a * a * a * p[0][i] + 3 * a * a * u * p[1][i] + 3 * a * u * u * p[2][i] + u * u * u * p[3][i];
};
const bezD = (p: Leg['p'], u: number, i: 0 | 1) => {
  const a = 1 - u;
  return 3 * a * a * (p[1][i] - p[0][i]) + 6 * a * u * (p[2][i] - p[1][i]) + 3 * u * u * (p[3][i] - p[2][i]);
};

/** A cubic curve in (route metres, lateral) with its arc length (the road is locally straight enough to measure there). */
export function makeLeg(p0: P2, p1: P2, p2: P2, p3: P2): Leg {
  const p = [p0, p1, p2, p3] as const, cum = new Float64Array(N + 1);
  for (let i = 1; i <= N; i++) {
    const a = (i - 1) / N, b = i / N;
    cum[i] = cum[i - 1] + Math.hypot(bez(p, b, 0) - bez(p, a, 0), bez(p, b, 1) - bez(p, a, 1));
  }
  return { p, cum, len: cum[N] };
}

/** Where `dist` metres along a leg puts the bike: route metres, lateral, and the unit direction in (s, lateral). */
export function legAt(L: Leg, dist: number): { s: number; lat: number; ts: number; tl: number } {
  const d = Math.max(0, Math.min(L.len, dist));
  let lo = 0, hi = N;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (L.cum[m] <= d) lo = m; else hi = m; }
  const u = (lo + (d - L.cum[lo]) / Math.max(1e-9, L.cum[hi] - L.cum[lo])) / N;
  const ts = bezD(L.p, u, 0), tl = bezD(L.p, u, 1), n = Math.hypot(ts, tl) || 1;
  return { s: bez(L.p, u, 0), lat: bez(L.p, u, 1), ts: ts / n, tl: tl / n };
}

/** World eye point and horizontal heading for (route metres, lateral, direction in (s, lateral)). */
export function onRoad(s: number, lat: number, ts = 1, tl = 0): { eye: V3; heading: V3 } {
  const r = coastRoute(), p = r.offset(s, lat), t = r.tangent(Math.min(s, r.length));
  // + lateral is to the right of travel: right = (−tz, tx)
  const hx = t.x * ts - t.z * tl, hz = t.z * ts + t.x * tl, n = Math.hypot(hx, hz) || 1;
  return { eye: v(p.x, p.y + EYE, p.z), heading: v(hx / n, 0, hz / n) };
}

/** Rolling off a stop: no speed at the start, the line's speed at the end (g(0) = 0, g'(0) = 0, g(1) = 1, g'(1) = 1). */
export const easeDepart = (u: number) => { const x = clamp01(u); return x * x * (2 - x); };
export const easeDepartD = (u: number) => { const x = clamp01(u); return 4 * x - 3 * x * x; };
/** Rolling to a stop: the line's speed at the start, none at the end. */
export const easeArrive = (u: number) => 1 - easeDepart(1 - u);
export const easeArriveD = (u: number) => easeDepartD(1 - u);

/** Where the rider stands at each fishing stop: [route metres, lateral]. */
export const STOPS = {
  /** Turnout 1: at the sea edge of the pull-off. */ turnout: (): P2 => [CH1.turnout, edgeD(zOfS(CH1.turnout)) + 1.5],
  /** The pier: by the left rail, short of the end. */ pier: (): P2 => [pierGeom().end - PIER_FISH_BACK, -4.4],
};

let legs: { inTurnout: Leg; outTurnout: Leg; inPier: Leg } | null = null;
/** The Morning's legs: across the road into Turnout 1 (stopping along the sea edge), back out to the lane, and across
 *  the pier to the left rail. The eyes turn to the water as the bike rolls to a stop. */
export function morningLegs() {
  if (legs) return legs;
  const [ts, tl] = STOPS.turnout(), [ps, pl] = STOPS.pier();
  legs = {
    inTurnout: makeLeg([ts - 70, LANE], [ts - 46, LANE], [ts - 26, tl], [ts, tl]),
    outTurnout: makeLeg([ts, tl], [ts + 22, tl], [ts + 36, LANE], [ts + 58, LANE]),
    inPier: makeLeg([ps - 34, 1.4], [ps - 22, 1.4], [ps - 12, pl], [ps, pl]),
  };
  return legs;
}
