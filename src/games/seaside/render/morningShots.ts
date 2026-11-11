// Chapter 1's camera director (#189): which shot each Morning scene is, as a pure function of the sim snapshot.
// Ride scenes map their progress onto a stretch of the coast route (so the ride never depends on how the story's rail
// lengths line up with the world); stops have fixed poses; the Big One and Under are timed set pieces. The renderer
// (render/morning.ts) poses the voxel world, the rod and the set-piece props from this.
import { FISHING_DEFAULTS, type FishingView } from '../sim/fishing';
import { STORY } from '../sim/story';
import type { SeasideSnapshot } from '../sim/types';
import { CH1, coastRoute, pierGeom, roadX, SEA_LEVEL, win, zOfS, bridge } from '../world/coastLayout';
import { LAND_S } from './flightShots';
import { easeArrive, easeArriveD, easeDepart, easeDepartD, legAt, morningLegs, onRoad, pointAhead, rideCam, STOPS, type Leg, type V3 } from './rideCam';

export type { V3 } from './rideCam';
export { rideCam } from './rideCam';

export interface MorningFx {
  /** Title card: marine-layer fog, 1 = thick. */ fog: number;
  /** Title card: eyelids, 0 shut .. 1 open; the world out of focus, 0 sharp .. 1 blurred. */ lids: number; blur: number;
  /** Highway 1: the big white bird's glide 0..1 (null = not in the sky). */ bird: number | null;
  /** The sea going glassy 0..1. */ calm: number;
  /** Gulls on the pier's end posts: 0 sitting .. 1 gone (null = none in shot). */ gulls: number | null;
  /** The Big One's shadow sliding in under the pier 0..1 (null = none). */ shadow: number | null;
  /** Yanked off the end 0..1; seconds since the splash (null = none); under water 0..1. */ yank: number; splash: number | null; under: number;
  /** Under: the dark 0..1, the ring of teeth closing 0..1, black 0..1. */ dark: number; mouth: number; black: number;
}

export interface MorningShot {
  /** Route metres (streaming anchor) and speed along the route (m/s). */ s: number; speed: number;
  eye: V3; target: V3;
  /** The bike's direction of travel (horizontal unit): the bars point here, wherever the eyes are. */ heading: V3;
  bars: boolean;
  /** The rod in hand: the fishing stop's rig, or the Big One's. */ rod: 'fish' | 'bigOne' | null;
  /** Where the fishing rig puts the water. */ place: { waterY: number; near?: number; reach?: number; spread?: number } | null;
  fx: MorningFx;
}

const NO_FX: MorningFx = { fog: 0, lids: 1, blur: 0, bird: null, calm: 0, gulls: null, shadow: null, yank: 0, splash: null, under: 0, dark: 0, mouth: 0, black: 0 };
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const smooth = (a: number, b: number, x: number) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const v = (x: number, y: number, z: number): V3 => ({ x, y, z });
const add = (a: V3, b: V3, k = 1): V3 => v(a.x + b.x * k, a.y + b.y * k, a.z + b.z * k);
const lerpV = (a: V3, b: V3, k: number): V3 => v(lerp(a.x, b.x, k), lerp(a.y, b.y, k), lerp(a.z, b.z, k));

/** Metres the title rolls you along the road from a standstill while your eyes open. */
export const TITLE_ROLL = 200;

/** How a ride scene lies on the coast: its rail (route metres its progress runs between: the scene's rail length), a leg
 *  riding off a stop at its start and/or one riding to a stop at its end, and where the eyes are at those stops. */
interface RidePlan { rail: [number, number]; depart?: Leg; arrive?: Leg; from?: V3; to?: V3 }

function ridePlan(id: string): RidePlan | null {
  const L = morningLegs();
  switch (id) {
    case 'highway': return { rail: [CH1.start + TITLE_ROLL, L.inTurnout.p[0][0] + L.inTurnout.len], arrive: L.inTurnout, to: stopTarget('turnout') };
    case 'rollers': { // after the leg back out the road runs on from where it left off
      const D = L.outTurnout, shift = D.len - (D.p[3][0] - D.p[0][0]);
      return { rail: [D.p[0][0], CH1.shop - 28 + shift], depart: D, from: stopTarget('turnout') };
    }
    case 'toPier': return { rail: [CH1.shop + 28, L.inPier.p[0][0] + L.inPier.len], arrive: L.inPier, to: stopTarget('pier') };
    // the Evening's ride home: the wings land at its start (#194); it ends at the cliff's lift-off (#195)
    case 'sunset': { const sc = STORY.find((x) => x.id === 'sunset')!; return { rail: [LAND_S, LAND_S + ('m' in sc.length ? sc.length.m : 1350)] }; }
    default: return null;
  }
}

/** Route metres each ride scene's rail runs between. */
export function rideSpan(id: string): [number, number] | null {
  return ridePlan(id)?.rail ?? null;
}

/** Where the eyes rest at a fishing stop: Turnout 1 out and down at the water, the pier south and down past the rail. */
function stopTarget(stop: 'turnout' | 'pier'): V3 {
  const [s, lat] = STOPS[stop]();
  if (stop === 'turnout') { const tz = zOfS(s); return v(roadX(tz) + lat - 30, SEA_LEVEL + 6, tz - 4); }
  const g = coastRoute().offset(s - 6, -40);
  return v(g.x, SEA_LEVEL + 2, g.z);
}

/** The ride at rail metres `r`: route metres (streaming), the camera, the bike's heading, and the speed factor (route
 *  metres per rail metre: legs start and end at rest). */
function rideAt(P: RidePlan, r: number): { s: number; eye: V3; target: V3; heading: V3; k: number } {
  const { depart: D, arrive: A } = P;
  if (D && r < P.rail[0] + D.len) {
    const u = (r - P.rail[0]) / D.len, q = legAt(D, D.len * easeDepart(u)), o = onRoad(q.s, q.lat, q.ts, q.tl);
    const ahead = rideCam(q.s).target, w = smooth(0.05, 0.6, u);
    return { s: q.s, eye: o.eye, heading: o.heading, target: P.from ? lerpV(P.from, ahead, w) : ahead, k: easeDepartD(u) };
  }
  const a0 = A ? A.p[0][0] : Infinity;
  if (A && r > a0) {
    const u = Math.min(1, (r - a0) / A.len), q = legAt(A, A.len * easeArrive(u)), o = onRoad(q.s, q.lat, q.ts, q.tl);
    const along = add(v(o.eye.x, o.eye.y - 2.2, o.eye.z), o.heading, 26);
    const look = lerpV(rideCam(q.s).target, along, smooth(0, 0.45, u));
    return { s: q.s, eye: o.eye, heading: o.heading, target: P.to ? lerpV(look, P.to, smooth(0.55, 1, u)) : look, k: easeArriveD(u) };
  }
  const s = D ? r - (D.len - (D.p[3][0] - D.p[0][0])) : r, cam = rideCam(s);
  return { s, ...cam, k: 1 };
}

/** The bike at a stop: where the leg in ends (standing there, facing the way it rode in). */
function atStop(stop: 'turnout' | 'pier'): { eye: V3; heading: V3; target: V3 } {
  const L = morningLegs(), leg = stop === 'turnout' ? L.inTurnout : L.inPier, q = legAt(leg, leg.len);
  return { ...onRoad(q.s, q.lat, q.ts, q.tl), target: stopTarget(stop) };
}

/** The Morning scenes this director shoots (the shops are the counter dioramas), and the Sunset highway after the wings land. */
export const MORNING_WORLD = new Set(['title', 'highway', 'turnout1', 'rollers', 'toPier', 'pier', 'bigOne', 'under', 'sunset']);

/** The middle of Lou's shop door (where the GONE FISHING sign hangs in the evening). */
export function shopDoor(): V3 {
  const q = coastRoute().offset(CH1.shop, -16.85);
  return v(q.x, q.y + 1.45, q.z);
}

/** Where the rollers' crest looks: out over the coast opening up ahead (the creek mouth, the far point). */
export function crestView(at: number): V3 {
  const p = coastRoute().offset(at + 520, -260);
  return v(p.x, SEA_LEVEL + 14, p.z);
}

/** Crossing the bridge the eyes go across the gorge, up the creek valley inland (just over the parapet). */
export function gorgeView(at: number): V3 {
  const p = coastRoute().offset(at + 45, 55);
  return v(p.x, p.y - 6, p.z);
}

/** The title's eyelids at t seconds: shut, a slit, shut again, half open, a long blink, then open (a quick blink later). */
export function titleLids(t: number): number {
  const keys: Array<[number, number]> = [[0, 0], [2.5, 0], [6, 0.32], [7.6, 0.04], [9, 0.04], [13.5, 0.62], [15.2, 0.12], [16, 0.12], [22, 1], [31, 1], [31.15, 0.05], [31.45, 1]];
  let i = 0;
  while (i < keys.length - 2 && keys[i + 1][0] <= t) i++;
  const [t0, a] = keys[i], [t1, b] = keys[i + 1];
  return lerp(a, b, smooth(t0, t1, t));
}

// ---- the Big One --------------------------------------------------------------------------------------------------
const BIG = STORY.find((s) => s.id === 'bigOne')!;
/** Seconds into the Big One: the bite (the set-piece sprint starts), and the yank (it ends). */
export const BIG_ONE = { castAt: 4, biteAt: BIG.pulls[0].atS, yankAt: BIG.pulls[0].atS + BIG.pulls[0].planS, yankS: 3.4, calmAt: 26, gullsAt: 47, shadowAt: 52 };

function pierEnd(): { at: V3; fwd: V3 } {
  const r = coastRoute(), P = pierGeom(), at = r.offset(P.end - 2.4, 0), t = r.tangent(P.end);
  return { at: v(at.x, at.y + 1.5, at.z), fwd: v(t.x, 0, t.z) };
}

/** Camera through the Big One: at the end rail, then yanked off the end, then dragged out under the surface. */
function bigOneCam(t: number): { eye: V3; target: V3; yank: number; under: number; splash: number | null } {
  const { at, fwd } = pierEnd(), B = BIG_ONE, k = clamp01((t - B.yankAt) / B.yankS);
  if (k <= 0) return { eye: at, target: add(v(at.x, SEA_LEVEL + 1, at.z), fwd, 42), yank: 0, under: 0, splash: null };
  // slow motion: a lurch up and out over the rail, then down into the water
  const down = SEA_LEVEL - 2.6, out = 16 * (1 - (1 - k) ** 1.6);
  const y = lerp(at.y, down, k ** 2.2) + 3.2 * Math.sin(Math.PI * Math.min(1, k * 1.15)) * (1 - k * 0.5);
  const drag = Math.max(0, t - B.yankAt - B.yankS);
  const eye = add(v(at.x, drag > 0 ? down - 0.9 * smooth(0, 12, drag) : y, at.z), fwd, out + drag * 3.2);
  const target = add(v(eye.x, eye.y - 1.5 - 9 * k + 6.5 * smooth(0, 3, drag), eye.z), fwd, 12);
  const splashT = B.yankAt + B.yankS * 0.86;
  return { eye, target, yank: k, under: smooth(splashT - 0.1, splashT + 0.5, t), splash: t >= splashT ? t - splashT : null };
}

/** The rod during the Big One: a long cast off the end, a glassy wait, the bite, the pull it can't win. */
export function bigOneView(t: number, pull: SeasideSnapshot['pull']): FishingView {
  const B = BIG_ONE, F = FISHING_DEFAULTS;
  const base: FishingView = {
    location: 'pier', phase: 'spot', phaseT: t, spot: 0, spots: [{ id: 'end', name: 'Off the end', x: 0, far: 1 }], cast: 1,
    tension: 0, stamina: 1, twitch: false, nibbleAge: 99, caught: [], slot: 0, slots: 1, tries: 0, autoIn: -1,
  };
  if (t < B.castAt) return base;
  if (t < B.castAt + F.castS) return { ...base, phase: 'cast', phaseT: t - B.castAt };
  if (t < B.biteAt - 0.8) return { ...base, phase: 'wait', phaseT: t - B.castAt - F.castS, nibbleAge: t > B.shadowAt + 10 ? (t * 0.7) % 3 : 99 };
  if (t < B.biteAt) return { ...base, phase: 'bite', phaseT: t - (B.biteAt - 0.8) };
  const load = pull ? clamp01(pull.t / Math.max(1, pull.durS)) : clamp01((t - B.biteAt) / (B.yankAt - B.biteAt));
  return { ...base, phase: 'pull', phaseT: t - B.biteAt, tension: 0.55 + 0.45 * load, stamina: 1 };
}

// ---- the shot for a snapshot --------------------------------------------------------------------------------------

/** The Morning shot for this snapshot, or null when the scene isn't one of the voxel-world Morning scenes. */
export function morningShot(s: Pick<SeasideSnapshot, 'sceneId' | 'sceneT' | 'speed' | 'pull'> & { scene: { progress: number }; fishing?: SeasideSnapshot['fishing'] }): MorningShot | null {
  // Optional shop outings use the same fishing rig and location as the corresponding story stop.
  const id = s.fishing && s.sceneId === 'shop1' ? 'turnout1' : s.fishing && s.sceneId === 'pierStand' ? 'pier' : s.sceneId;
  const p = s.scene.progress, r = coastRoute(), P = pierGeom();
  if (!MORNING_WORLD.has(id)) return null;
  // timed scenes run on plan seconds (= scene time, and right after resuming mid-scene too)
  const t = p * (STORY.find((x) => x.id === id)?.planS ?? 0);
  const plan = ridePlan(id);
  if (plan) {
    const sc = STORY.find((x) => x.id === id)!, [r0, r1] = plan.rail, len = 'm' in sc.length ? sc.length.m : r1 - r0;
    const R = rideAt(plan, lerp(r0, r1, p)), at = R.s, cam = { eye: R.eye, target: R.target };
    if (id === 'rollers') { // a short rest at the top: the camera drifts toward the view on its own; then the gorge
      const b = bridge(), pb0 = (b.s0 - r0) / (r1 - r0), pb1 = (b.s1 - r0) / (r1 - r0);
      const w = win(p, 0.62, 0.72, 0.04) * 0.7, wg = win(p, pb0 + 0.004, pb1 - 0.006, 0.006) * 0.6;
      const look = w > 0 ? crestView(at) : gorgeView(at), k = Math.max(w, wg);
      cam.target = lerpV(cam.target, look, k);
    }
    if (id === 'sunset') { // riding past Lou's in the evening, the eyes go to the door: dark, GONE FISHING
      const w = win(at, CH1.shop - 40, CH1.shop + 6, 14) * 0.85;
      cam.target = lerpV(cam.target, shopDoor(), w);
    }
    const bird = id === 'highway' && p > 0.7 && p < 0.96 ? (p - 0.7) / 0.26 : null;
    return { s: at, speed: s.speed * ((r1 - r0) / len) * R.k, ...cam, heading: R.heading, bars: true, rod: null, place: null, fx: { ...NO_FX, bird } };
  }
  switch (id) {
    case 'title': { // rolling off from a standstill, eyes opening (a few slow blinks), the world coming into focus
      const at = CH1.start + TITLE_ROLL * p * p, cam = rideCam(at), T = t;
      return { s: at, speed: (2 * TITLE_ROLL * p) / Math.max(1, STORY[0].planS), ...cam, bars: true, rod: null, place: null,
        fx: { ...NO_FX, fog: 0.6 * (1 - smooth(0.1, 0.75, p)), lids: titleLids(T), blur: 1 - smooth(0.05, 0.7, p) } };
    }
    case 'turnout1': { // standing at the sea edge of the turnout, looking out and down at the water (the #187 prototype's shot)
      return { s: CH1.turnout, speed: 0, ...atStop('turnout'), bars: false, rod: 'fish', place: { waterY: SEA_LEVEL }, fx: NO_FX };
    }
    case 'pier': { // by the left rail, looking south and down at the water; gulls on the end posts
      return { s: STOPS.pier()[0], speed: 0, ...atStop('pier'), bars: false, rod: 'fish', place: { waterY: SEA_LEVEL, near: 5, reach: 22, spread: 9 }, fx: { ...NO_FX, gulls: 0 } };
    }
    case 'bigOne': {
      const B = BIG_ONE, c = bigOneCam(t);
      const fx: MorningFx = { ...NO_FX, calm: smooth(B.calmAt, B.calmAt + 12, t), gulls: smooth(B.gullsAt, B.gullsAt + 7, t),
        shadow: t > B.shadowAt ? smooth(B.shadowAt, B.biteAt, t) : null, yank: c.yank, splash: c.splash, under: c.under };
      return { s: P.end, speed: 0, eye: c.eye, target: c.target, heading: pierEnd().fwd, bars: false, rod: c.yank < 0.9 ? 'bigOne' : null,
        place: { waterY: SEA_LEVEL, near: 9, reach: 34, spread: 6 }, fx };
    }
    case 'under': { // the rush down through the blue, then the mouth closes
      const start = bigOneCam(BIG.planS), { fwd } = pierEnd(), sink = 55 * smooth(0, 50, t);
      const eye = add(v(start.eye.x, start.eye.y - sink, start.eye.z), fwd, t * 1.6);
      const target = add(v(eye.x, eye.y - 4 - 4 * smooth(0, 20, t), eye.z), fwd, 8);
      return { s: P.end, speed: 0, eye, target, heading: fwd, bars: false, rod: null, place: null,
        fx: { ...NO_FX, calm: 1, under: 1, dark: smooth(4, 46, t), mouth: smooth(46, 76, t), black: smooth(78, 87, t) } };
    }
  }
  return null;
}
