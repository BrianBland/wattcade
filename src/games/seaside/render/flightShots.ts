// Chapter 3c's camera director (#194): re-entry and the wings, as a pure function of the sim snapshot, over the coast
// world. The glide runs down the coast a few hundred metres out over the sea, high up, then swings in over the cliff
// (just clearing a cypress on its edge) and touches down in the right lane at LAND_S, exactly where the Sunset
// highway's ride picks up (morningShots' rideSpan('sunset')). Re-entry falls out of the sky on to the glide's start.
import { REENTRY, alignAt, type ReentryView } from '../sim/flight';
import { LIFT_S } from './endingShots';
import { STORY } from '../sim/story';
import type { FlightView, SeasideSnapshot } from '../sim/types';
import { coastRoute, edgeD, SEA_LEVEL, zOfS } from '../world/coastLayout';
import { groundAt } from '../world/coast';
import type { V3 } from './morningShots';

const WINGS = STORY.find((s) => s.id === 'wings')!, REENTRY_SCENE = STORY.find((s) => s.id === 'reentry')!, SUNSET = STORY.find((s) => s.id === 'sunset')!;
/** Route metres where you touch down: the Sunset ride from here (over the gorge bridge, past Lou's) ends just as the
 *  highway turns hard right around the cliff (#195's lift-off). */
export const LAND_S = LIFT_S - ('m' in SUNSET.length ? SUNSET.length.m : 1350);
/** The glide's length along the route (the wings' rail length). */
export const WINGS_LEN = 'm' in WINGS.length ? WINGS.length.m : 1680;
export const FLIGHT_S0 = LAND_S - WINGS_LEN;
/** Riding lane (m right of the centre line): the landing puts you here, as the Morning's riding camera has it. */
export const LANE = 4.2;
/** The cypress on the cliff edge you skim over (progress along the glide), and how far over its crown you pass (m). */
export const CYPRESS = { p: 0.93, height: 11, clear: 2.4 } as const;

export interface FlightFx {
  /** Re-entry (null in the glide). */ reentry: ReentryView | null;
  /** The glide (null in re-entry). */ wings: Extract<FlightView, { phase: 'wings' }> | null;
  /** The voxel world shows (out under the clouds). */ terrain: boolean;
  /** White over everything (the cloud deck) 0..1. */ white: number;
  /** Wings spread 0..1 (they fold away as you touch down). */ spread: number;
  /** Camera shake (m) and roll (rad). */ shake: number; roll: number;
  /** Evening light 0 (space) .. 1. */ evening: number;
}

export interface FlightShot { s: number; speed: number; eye: V3; target: V3; bars: boolean; fx: FlightFx }

export const FLIGHT_WORLD = new Set(['reentry', 'wings']);
/** The evening over the coast (the sun low, the sky warm): the wings, and the Sunset highway after them. */
export const EVENING = { zenith: 0x2f4a8a, horizon: 0xffa368, fog: 0xeab08e, density: 0.0007, sunColor: 0xffb068, sunI: 1.9, hemiI: 0.8,
  /** low in the west-northwest, over the sea ahead-left of the ride north */ sunDir: [-0.8, 0.14, -0.56] as [number, number, number] } as const;

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const smooth = (a: number, b: number, x: number) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const v = (x: number, y: number, z: number): V3 => ({ x, y, z });

/** Eased keyframe curve: [progress, value] pairs, smoothstep between neighbours (flat at each key). */
function keyed(keys: ReadonlyArray<readonly [number, number]>, p: number): number {
  if (p <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) if (p <= keys[i][0]) { const [p0, a] = keys[i - 1], [p1, b] = keys[i]; return lerp(a, b, smooth(p0, p1, p)); }
  return keys[keys.length - 1][1];
}

let geo: { off: Array<[number, number]>; y: Array<[number, number]>; cypress: V3 & { off: number } } | null = null;
/** The glide's line (lateral offset from the road, m; height, m) and the cypress, from the coast layout. */
function flightGeo() {
  if (geo) return geo;
  const r = coastRoute(), sc = FLIGHT_S0 + CYPRESS.p * WINGS_LEN, cOff = edgeD(zOfS(sc)) + 3, c = r.offset(sc, cOff);
  const base = groundAt(c.x, c.z), land = r.offset(LAND_S, LANE).y + 1.5, top = base + CYPRESS.height;
  geo = {
    off: [[0, -250], [0.45, -230], [0.78, -70], [CYPRESS.p, cOff], [1, LANE]],
    y: [[0, SEA_LEVEL + 640], [0.4, SEA_LEVEL + 330], [0.78, land + 45], [CYPRESS.p, top + CYPRESS.clear], [1, land]],
    cypress: { x: c.x, y: base, z: c.z, off: cOff },
  };
  return geo;
}

/** Where the cypress stands (its foot) on the cliff edge. */
export const cypressAt = () => flightGeo().cypress;

/** A point on the glide at progress p, `x` metres across the line of flight (+ right). */
export function glideAt(p: number, x = 0): V3 {
  const G = flightGeo(), s = FLIGHT_S0 + Math.max(0, p) * WINGS_LEN;
  const q = coastRoute().offset(Math.min(s, LAND_S + 400), keyed(G.off, p) + x * (1 - alignAt(p)));
  return v(q.x, keyed(G.y, p), q.z);
}

/** The Morning's riding camera at the landing (the Sunset ride starts on it). */
function landedCam(): { eye: V3; target: V3 } {
  const r = coastRoute(), e = r.offset(LAND_S, LANE), g = r.offset(LAND_S + 74, -16);
  return { eye: v(e.x, e.y + 1.5, e.z), target: v(g.x, g.y - 5.5, g.z) };
}

/** The glide camera: on the line, looking ahead along it and a little down; the last few metres settle onto the
 *  riding camera exactly. */
export function glideCam(p: number, x: number): { eye: V3; target: V3 } {
  const eye = glideAt(p, x), ahead = glideAt(p + 70 / WINGS_LEN, x), down = lerp(14, 2, smooth(0.6, 0.95, p));
  const target = v(ahead.x, ahead.y - down, ahead.z);
  const k = smooth(0.965, 1, p), L = landedCam();
  return { eye: lerpV(eye, L.eye, k), target: lerpV(target, L.target, k) };
}

const lerpV = (a: V3, b: V3, k: number): V3 => v(lerp(a.x, b.x, k), lerp(a.y, b.y, k), lerp(a.z, b.z, k));

/** The flight shot for this snapshot, or null outside re-entry and the wings. */
export function flightShot(s: Pick<SeasideSnapshot, 'sceneId' | 'speed' | 'flight'> & { scene: { progress: number } }, t = 0): FlightShot | null {
  if (!FLIGHT_WORLD.has(s.sceneId) || !s.flight) return null;
  const p = s.scene.progress, f = s.flight;
  if (f.phase === 'reentry') {
    const tt = p * REENTRY_SCENE.planS, start = glideCam(0, 0);
    // falling out of the sky on to the glide's start: looking steeply down at the planet, levelling out under the clouds
    const out = f.out, drop = 520 * (1 - smooth(REENTRY.outS - 1, REENTRY_SCENE.planS, tt));
    const eye = v(start.eye.x, start.eye.y + drop, start.eye.z);
    const look = lerpV(v(eye.x + (start.target.x - start.eye.x) * 0.25, eye.y - 60, eye.z + (start.target.z - start.eye.z) * 0.25), v(start.target.x, start.target.y + drop, start.target.z), smooth(0, 1, out));
    const shake = f.fire * (0.35 + 0.45 * Math.min(1.5, f.effort || f.spectacle * 0.6) / 1.5);
    return { s: FLIGHT_S0, speed: 0, eye, target: look, bars: true,
      fx: { reentry: f, wings: null, terrain: out > 0 || f.cloud > 0.98, white: f.cloud, spread: f.wings, shake, roll: 0.12 * (1 - out) + 0.05 * shake * Math.sin(t * 9), evening: out } };
  }
  const cam = glideCam(p, f.x);
  return { s: FLIGHT_S0 + p * WINGS_LEN, speed: s.speed, ...cam, bars: true,
    fx: { reentry: null, wings: f, terrain: true, white: 0, spread: 1 - smooth(0.94, 0.99, p), shake: 0, roll: -f.bank * 0.8 * (1 - f.align), evening: 1 } };
}
