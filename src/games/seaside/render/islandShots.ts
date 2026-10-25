// Chapter 2b's camera director (#191): which shot each island scene is, as a pure function of the sim snapshot.
// Rides map progress onto their stretch of the island route; the beach is a fixed pose facing the reef; the approach
// lifts the eyes to the monkey head; inside the hall the light drops and the eyes end on the statue.
import { STORY } from '../sim/story';
import type { SeasideSnapshot } from '../sim/types';
import { HALL, headWorld, islandRoute, islandSpan, PLATEAU_Y, SEA_Y } from '../world/islandLayout';
import { PLINTH } from '../world/islandBuild';
import type { V3 } from './morningShots';

export interface IslandFx {
  /** Paddling: the paddle wheels are out (null = not paddling); the bob of each stroke (m). */ paddle: number | null;
  /** Fading in from the breakthrough's white-out 0..1. */ white: number;
  /** In the dark of the head and the hall 0..1. */ inside: number;
  /** The head's eyes catching the light 0..1. */ eyes: number;
  /** Sun shafts in the hall. */ shafts: boolean;
}

export interface IslandShot {
  s: number; speed: number; eye: V3; target: V3; bars: boolean;
  /** The rod in hand (the beach). */ rod: boolean;
  place: { waterY: number; near?: number; reach?: number; spread?: number } | null;
  fx: IslandFx;
}

export const ISLAND_WORLD = new Set(['paddle', 'beach', 'boardwalk', 'cutStones', 'monkeyMouth', 'temple']);
const NO_FX: IslandFx = { paddle: null, white: 0, inside: 0, eyes: 0, shafts: false };
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const smooth = (a: number, b: number, x: number) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const v = (x: number, y: number, z: number): V3 => ({ x, y, z });
const lerpV = (a: V3, b: V3, k: number) => v(lerp(a.x, b.x, k), lerp(a.y, b.y, k), lerp(a.z, b.z, k));
const planS = (id: string) => STORY.find((x) => x.id === id)!.planS;

/** The riding eye at route metres s. */
export function islandCam(s: number, ahead = 26, eyeH = 1.55): { eye: V3; target: V3 } {
  const r = islandRoute(), p = r.at(Math.max(0, Math.min(r.length, s))), g = r.at(Math.min(r.length, s + ahead));
  return { eye: v(p.x, p.y + eyeH, p.z), target: v(g.x, g.y + eyeH - 0.6, g.z) };
}

/** The face of the head (its brow, eyes and mouth), for the approach. */
export const headPoint = (up: number): V3 => { const [x, z] = headWorld(0, 0); return v(x, PLATEAU_Y() + up, z); };
/** The statue on its plinth at the end of the hall. */
export const statuePoint = (): V3 => { const [x, z] = headWorld(0, (PLINTH.w0 + PLINTH.w1) / 2); return v(x, PLATEAU_Y() + PLINTH.h, z); };

export function islandShot(s: Pick<SeasideSnapshot, 'sceneId' | 'sceneT' | 'speed'> & { scene: { progress: number } }): IslandShot | null {
  const id = s.sceneId, p = s.scene.progress;
  if (!ISLAND_WORLD.has(id)) return null;
  const t = p * planS(id), [a, b] = islandSpan(id as never);
  if (id === 'beach') { // standing at the waterline, facing back out over the reef
    const r = islandRoute(), q = r.at(a), tg = r.tangent(Math.max(0, a - 1));
    const eye = v(q.x - tg.x * 2, Math.max(q.y, SEA_Y + 0.4) + 1.5, q.z - tg.z * 2);
    return { s: a, speed: 0, eye, target: v(eye.x - tg.x * 30, SEA_Y + 2, eye.z - tg.z * 30), bars: false, rod: true,
      place: { waterY: SEA_Y, near: 6, reach: 24, spread: 9 }, fx: NO_FX };
  }
  const at = lerp(a, b, p), fx: IslandFx = { ...NO_FX };
  let cam = islandCam(at);
  if (id === 'paddle') { // low on the water, rising and dipping with each stroke; the island ahead
    const bob = 0.06 * Math.sin((2 * Math.PI * t) / 3);
    cam = islandCam(at, 80, 1.15 + bob);
    cam.target.y = SEA_Y + 0.4 + 5 * p;
    fx.paddle = bob; fx.white = 1 - smooth(0, 3.5, t);
  }
  if (id === 'monkeyMouth') { // eyes up to the face, then level as you ride in under the fangs
    const look = 1 - smooth(0.55, 0.95, p), face = headPoint(lerp(6, 30, look));
    cam.target = lerpV(cam.target, face, 0.85 * smooth(0, 0.15, p) * (1 - smooth(0.9, 1, p)));
    fx.eyes = smooth(0.1, 0.8, p); fx.inside = smooth(0.85, 1, p);
  }
  if (id === 'temple') {
    fx.inside = 1; fx.shafts = true; fx.eyes = 1;
    cam.target = lerpV(cam.target, statuePoint(), smooth(0.65, 0.95, p));
  }
  return { s: at, speed: s.speed, ...cam, bars: true, rod: false, place: null, fx };
}

/** Where (m past the face) the hall's floor ends: the statue stands just before it. */
export const HALL_END = HALL.len;
