// Chapter 3a's camera director (#192): which shot each scene is, as a pure function of the sim snapshot. The cavern
// and the bridge map progress onto their stretch of the route; magma fishing stands on the bridge looking down at the
// lava with the rod in hand; the cooling fan stands at the same place, the bike's new fan and the eel on its stick in
// front of the bars. `hall` (0 in the cave .. 1 out over the lava) drives the light, the haze and the heat shimmer.
import type { FanView } from '../sim/fan';
import type { SeasideSnapshot } from '../sim/types';
import { cavernRoute, cavernSpan, LAVA_Y, smooth, U_MOUTH, uOfS } from '../world/cavernLayout';
import type { V3 } from './morningShots';

export interface CavernFx {
  /** Out of the cave into the lava's light 0..1. */ hall: number;
  /** Heat shimmer at the screen edges 0..1. */ shimmer: number;
  /** Eels leaping out of the lava. */ eels: boolean;
  /** The cooling fan (null when not that scene). */ fan: FanView | null;
}

export interface CavernShot {
  s: number; speed: number; eye: V3; target: V3; bars: boolean;
  /** The rod in hand (magma fishing). */ rod: boolean;
  place: { waterY: number; near?: number; reach?: number; spread?: number } | null;
  fx: CavernFx;
}

export const CAVERN_WORLD = new Set(['cavern', 'bridge', 'magma', 'fan']);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const v = (x: number, y: number, z: number): V3 => ({ x, y, z });

/** The riding eye at route metres s, looking `ahead` m on (and `dy` m below eye height there). */
export function cavernCam(s: number, ahead = 24, dy = -0.4, eyeH = 1.55): { eye: V3; target: V3 } {
  const r = cavernRoute(), p = r.at(Math.max(0, Math.min(r.length, s))), g = r.at(Math.min(r.length, s + ahead));
  return { eye: v(p.x, p.y + eyeH, p.z), target: v(g.x, g.y + eyeH + dy, g.z) };
}

/** How far into the hall's light a point of the route is (the mouth glows ahead for the last ~140 m of the cave). */
export const hallLight = (s: number) => smooth(U_MOUTH - 140, U_MOUTH + 25, uOfS(s));

export function cavernShot(s: Pick<SeasideSnapshot, 'sceneId' | 'speed'> & { scene: { progress: number }; fan?: FanView | null }): CavernShot | null {
  const id = s.sceneId, p = s.scene.progress;
  if (!CAVERN_WORLD.has(id)) return null;
  const [a, b] = cavernSpan(id as 'cavern'), at = lerp(a, b, p);
  const hall = hallLight(at), fx: CavernFx = { hall, shimmer: hall, eels: hall > 0.3, fan: null };
  if (id === 'magma') { // the rod over the side of the bridge: eyes out and down to the lava
    const cam = cavernCam(a, 30, 0), r = cavernRoute(), q = r.offset(a + 16, 18);
    cam.target = v(q.x, LAVA_Y + 11, q.z);
    return { s: a, speed: 0, ...cam, bars: false, rod: true, place: { waterY: LAVA_Y, near: 9, reach: 26, spread: 11 }, fx };
  }
  if (id === 'fan') { // the eel on its stick and the fan beyond it, the bridge running on
    const cam = cavernCam(a, 20, -1.4);
    return { s: a, speed: 0, ...cam, bars: true, rod: false, place: null, fx: { ...fx, fan: s.fan ?? null } };
  }
  // riding: in the cave the eyes follow the bends; on the bridge they drift down toward the fish now and then
  const cam = id === 'bridge' ? cavernCam(at, 30, -1.2 - 1.5 * Math.sin(Math.PI * p) ** 2) : cavernCam(at, 18, -0.3);
  return { s: at, speed: s.speed, ...cam, bars: true, rod: false, place: null, fx };
}
