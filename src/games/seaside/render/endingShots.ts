// The ending's camera director (#195), as a pure function of the sim snapshot, over the coast world. The Sunset ride
// ends where the highway turns hard right around the cliff (LIFT_S). The Cliff: you go straight on, lift a little,
// the ground falls away to the sea, then the road curves back underneath you and Lou's car passes below, headlights
// on, Lou waving. The Angel: the camera eases from first person to third, from behind only, the winged rider climbing
// into the sunset over open water, small against it, while the credits roll; then a last tiny shot of a white bird
// over the morning sea (where the ride began).
import { STORY } from '../sim/story';
import type { SeasideSnapshot } from '../sim/types';
import { CH1, coastRoute, edgeD, SEA_LEVEL, zOfS } from '../world/coastLayout';
import type { V3 } from './morningShots';

const CLIFF_SCENE = STORY.find((s) => s.id === 'cliff')!, ANGEL_SCENE = STORY.find((s) => s.id === 'angel')!;
/** The cliff's rail length (m): the ride's progress runs along it. */
const CLIFF_LEN = 'm' in CLIFF_SCENE.length ? CLIFF_SCENE.length.m : 540;

/** Route metres where the highway starts its hard right around the cliff: the Sunset ride ends here, and you go straight. */
export const LIFT_S = 6810;
/** The road curving back under you (route metres), the lift at the start (m), how high your wheels pass over the road
 *  there (m) and when (cliff progress). */
export const CLIFF = { passS: 7420, lift: 1.6, over: 3.4, passP: 0.78 } as const;
/** Lou's car: lane (m right of the centre line; he drives back toward the shop) and speed × the rail's. */
export const LOU_CAR = { d: -2.3, speed: 0.8 } as const;
/** The angel's beats (plan seconds): first person, the ease out to third, the credits, the white-out and the morning bird. */
export const ANGEL = { easeS: 4, thirdS: 14, creditsS: 16, creditsEndS: 160, whiteS: 164, birdS: 168 } as const;
/** Toward the evening sun over the sea (horizontal, unit): the angel climbs into it. */
export const SUNWARD = { x: -0.82, z: -0.57 } as const;
/** Eye height over the bike's wheels (m). */
export const EYE = 1.5;

export const ENDING_WORLD = new Set(['cliff', 'angel']);

export interface EndingFx {
  /** Lou's car (null when out of shot): its route metres, where it is and its yaw (a +z nose turned to face back down the road). */
  car: { s: number; at: V3; yaw: number } | null;
  /** Third person 0 (your eyes) .. 1 (behind you). */ third: number;
  /** The rider (wheel contact point), heading (yaw) and climb (rad). */ rider: { at: V3; yaw: number; pitch: number };
  /** The credits roll (seconds into it; null = not up). */ credits: number | null;
  /** White over everything 0..1 (the cut to the morning). */ white: number;
  /** The morning bird shot: the bird's glide 0..1 (null = the evening). */ morning: number | null;
  /** High over the water 0..1 (thicker haze: the far sea fades out). */ high: number;
}

export interface EndingShot { s: number; speed: number; eye: V3; target: V3; bars: boolean; fx: EndingFx }

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const smooth = (a: number, b: number, x: number) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const v = (x: number, y: number, z: number): V3 => ({ x, y, z });
const lerpV = (a: V3, b: V3, k: number): V3 => v(lerp(a.x, b.x, k), lerp(a.y, b.y, k), lerp(a.z, b.z, k));
const len2 = (x: number, z: number) => Math.hypot(x, z);

/** The road's direction of travel at s (smoothed over 10 m). */
function roadDir(s: number): { x: number; z: number } {
  const r = coastRoute(), a = r.at(s - 5), b = r.at(s + 5), l = len2(b.x - a.x, b.z - a.z) || 1;
  return { x: (b.x - a.x) / l, z: (b.z - a.z) / l };
}

/** Cubic Hermite in the horizontal plane. */
function herm(p0: { x: number; z: number }, t0: { x: number; z: number }, p1: { x: number; z: number }, t1: { x: number; z: number }, u: number) {
  const u2 = u * u, u3 = u2 * u, h00 = 2 * u3 - 3 * u2 + 1, h10 = u3 - 2 * u2 + u, h01 = -2 * u3 + 3 * u2, h11 = u3 - u2;
  return { x: h00 * p0.x + h10 * t0.x + h01 * p1.x + h11 * t1.x, z: h00 * p0.z + h10 * t0.z + h01 * p1.z + h11 * t1.z };
}

let geo: { A: V3; B: V3; C: V3; D: V3; tA: { x: number; z: number }; tB: { x: number; z: number }; tC: { x: number; z: number } } | null = null;
/** The path's keys: A the lift-off (your eye on the road), B over the road as it comes back under, C out past the sea
 *  cliff, D high over open water toward the sun. */
function pathGeo() {
  if (geo) return geo;
  const r = coastRoute(), a = r.offset(LIFT_S, 4.2), b = r.offset(CLIFF.passS, 0);
  const A = v(a.x, a.y + EYE, a.z), B = v(b.x, b.y + EYE + CLIFF.over, b.z);
  const c = r.offset(CLIFF.passS + 190, edgeD(zOfS(CLIFF.passS + 190)) - 60), C = v(c.x, B.y + 16, c.z);
  const tC0 = { x: c.x - b.x, z: c.z - b.z }, l = len2(tC0.x, tC0.z);
  // C's heading: turned left off the B→C chord, on its way round toward the sun
  const turn = 0.45, tC = { x: (tC0.x * Math.cos(turn) + tC0.z * Math.sin(turn)) / l, z: (-tC0.x * Math.sin(turn) + tC0.z * Math.cos(turn)) / l };
  const D = v(C.x + SUNWARD.x * 1150, C.y + 150, C.z + SUNWARD.z * 1150);
  geo = { A, B, C, D, tA: roadDir(LIFT_S), tB: roadDir(CLIFF.passS), tC };
  return geo;
}

/** Your eye along the cliff (progress p): straight on off the bend, the small lift, gliding down to just over the road
 *  as it curves back under you, then out over the sea cliff, rising. */
export function cliffEye(p: number): V3 {
  const G = pathGeo();
  if (p <= CLIFF.passP) {
    const u = clamp01(p / CLIFF.passP), L = len2(G.B.x - G.A.x, G.B.z - G.A.z);
    const h = herm(G.A, { x: G.tA.x * L, z: G.tA.z * L }, G.B, { x: G.tB.x * L, z: G.tB.z * L }, u);
    const y = lerp(G.A.y, G.B.y, smooth(0.12, 1, u)) + CLIFF.lift * smooth(0, 0.12, u) * (1 - smooth(0.55, 1, u));
    return v(h.x, y, h.z);
  }
  const u = clamp01((p - CLIFF.passP) / (1 - CLIFF.passP)), L = len2(G.C.x - G.B.x, G.C.z - G.B.z);
  const h = herm(G.B, { x: G.tB.x * L, z: G.tB.z * L }, G.C, { x: G.tC.x * L, z: G.tC.z * L }, u);
  return v(h.x, lerp(G.B.y, G.C.y, u * u), h.z);
}

/** Your eye on the angel's climb (0..1 of the way from the cliff's end to high over the water). */
export function angelEye(u: number): V3 {
  const G = pathGeo(), L = len2(G.D.x - G.C.x, G.D.z - G.C.z);
  const h = herm(G.C, { x: G.tC.x * L, z: G.tC.z * L }, G.D, { x: SUNWARD.x * L * 0.8, z: SUNWARD.z * L * 0.8 }, u);
  return v(h.x, lerp(G.C.y, G.D.y, u * u * (1.6 - 0.6 * u)), h.z);
}

/** How far along the climb at plan second t: carrying the cliff's speed on, slowing as you rise. */
export const angelU = (t: number) => { const k = clamp01(t / ANGEL.birdS); return 1 - (1 - k) ** 1.7; };

/** Heading (yaw, +x = right of −z) and climb of a path near a parameter. */
function aim(f: (u: number) => V3, u: number, du: number) {
  const a = f(Math.max(0, u - du)), b = f(u + du), h = len2(b.x - a.x, b.z - a.z) || 1;
  return { yaw: Math.atan2(-(b.x - a.x), -(b.z - a.z)), pitch: Math.atan2(b.y - a.y, h), dir: { x: (b.x - a.x) / h, z: (b.z - a.z) / h } };
}

/** Lou's car at cliff progress p (null when it's out of shot): it meets you at the pass, driving the other way. */
export function louCar(p: number): EndingFx['car'] {
  const s = CLIFF.passS + (CLIFF.passP - p) * CLIFF_LEN * LOU_CAR.speed;
  if (s < LIFT_S || s > CLIFF.passS + 520) return null;
  const r = coastRoute(), q = r.offset(s, LOU_CAR.d), d = roadDir(s);
  return { s, at: v(q.x, q.y, q.z), yaw: Math.atan2(-d.x, -d.z) }; // its nose (+z) back down the road
}

/** The ending shot for this snapshot, or null outside the Cliff and the Angel. */
export function endingShot(s: Pick<SeasideSnapshot, 'sceneId' | 'speed'> & { scene: { progress: number } }): EndingShot | null {
  if (!ENDING_WORLD.has(s.sceneId)) return null;
  const p = s.scene.progress;
  if (s.sceneId === 'cliff') {
    const eye = cliffEye(p), a = aim(cliffEye, p, 0.01), car = louCar(p);
    const ahead = cliffEye(Math.min(1.2, p + 0.08)), fwd = v(eye.x + a.dir.x * 60, eye.y - 4, eye.z + a.dir.z * 60);
    let target = p < 0.9 ? v(ahead.x, ahead.y - 3, ahead.z) : fwd;
    // the car coming up the road toward you: you watch it pass under
    const w = smooth(CLIFF.passP - 0.2, CLIFF.passP - 0.1, p) * (1 - smooth(CLIFF.passP - 0.01, CLIFF.passP + 0.05, p));
    if (car && w > 0) target = lerpV(target, v(car.at.x, car.at.y + 0.9, car.at.z), w);
    if (p >= 0.9) target = lerpV(v(ahead.x, ahead.y - 3, ahead.z), fwd, smooth(0.9, 1, p));
    const rider = { at: v(eye.x, eye.y - EYE, eye.z), yaw: a.yaw, pitch: a.pitch };
    return { s: Math.min(LIFT_S + p * (CLIFF.passS + 200 - LIFT_S), CLIFF.passS + 200), speed: s.speed, eye, target, bars: true,
      fx: { car, third: 0, rider, credits: null, white: 0, morning: null, high: 0 } };
  }
  // the angel
  const t = p * ANGEL_SCENE.planS, A = ANGEL, u = angelU(t), eye1 = angelEye(u), a = aim(angelEye, u, 0.004);
  const rider = { at: v(eye1.x, eye1.y - EYE, eye1.z), yaw: a.yaw, pitch: a.pitch };
  const white = smooth(A.whiteS, A.birdS, t) * (1 - smooth(A.birdS, A.birdS + 2.5, t));
  if (t >= A.birdS) { // the last tiny shot: the morning sea at the start of the ride, a white bird gliding west far out
    const r = coastRoute(), s0 = CH1.start + 240, e = r.offset(s0, edgeD(zOfS(s0)) + 2), g = r.offset(s0 + 60, -420);
    return { s: s0, speed: 0, eye: v(e.x, e.y + EYE, e.z), target: v(g.x, SEA_LEVEL + 22, g.z), bars: false,
      fx: { car: null, third: 1, rider, credits: null, white, morning: clamp01((t - A.birdS) / (ANGEL_SCENE.planS - A.birdS)), high: 0 } };
  }
  // first person → third, from behind only: up off your shoulders first, then back; then drifting back as you climb
  const k = smooth(A.easeS, A.thirdS, t), far = smooth(A.thirdS + 6, A.whiteS, t);
  const back = 6.5 * k + 42 * far, up = 1.4 * smooth(A.easeS, A.easeS + 4, t) + 0.8 * k + 9 * far;
  const eye = v(eye1.x - a.dir.x * back, eye1.y + up, eye1.z - a.dir.z * back);
  const sun = v(eye1.x + SUNWARD.x * 400, eye1.y + 25, eye1.z + SUNWARD.z * 400);
  const ahead = v(eye1.x + a.dir.x * 40, eye1.y - 2, eye1.z + a.dir.z * 40);
  // looking ahead with your own eyes, then at yourself and the sun beyond
  const target = lerpV(lerpV(ahead, v(eye1.x + a.dir.x * 18, eye1.y + 0.4, eye1.z + a.dir.z * 18), k), sun, 0.35 * far);
  const credits = t >= A.creditsS && t < A.creditsEndS ? t - A.creditsS : null;
  return { s: CLIFF.passS + 200, speed: s.speed, eye, target, bars: back < 0.6,
    fx: { car: null, third: back < 0.6 ? 0 : Math.max(0.01, k), rider, credits, white, morning: null, high: far } };
}
