// Chapter 3a's camera director (#192): which shot each scene is, as a pure function of the sim snapshot. The cavern
// and the bridge map progress onto their stretch of the route; magma fishing stands on the bridge looking down at the
// lava with the rod in hand; the cooling fan stands at the same place, the bike's new fan and the eel on its stick in
// front of the bars. `hall` (0 in the cave .. 1 out over the lava) drives the light, the haze and the heat shimmer.
// Chapter 3b (#193): the causeway to the gate (the bars unfold into the drill at the wall), Drill II on the gate's
// axis (the bit's length from the face, the tunnel tilting forward in its last minute) and the fall: tipping into
// the hole, then straight down into the black toward the Earth.
import type { DrillView } from '../sim/belly';
import type { FanView } from '../sim/fan';
import { fallView, TILT_S, type FallView } from '../sim/gate';
import { STORY } from '../sim/story';
import type { SeasideSnapshot } from '../sim/types';
import { BRIDGE_Y, cavernRoute, cavernSpan, GATE, GATE_DEPTH, GATE_U, gateAxis, LAVA_Y, smooth, STOP_S, U_MOUTH, uOfS, cx } from '../world/cavernLayout';
import { BIT_REACH, REST_BACK } from './bellyShots';
import type { V3 } from './morningShots';

/** Chapter 3b's effects: the drill in hand, the bore, the cracks and the tilt, the fall. */
export interface GateFx {
  /** Bars → drill: 0 bars .. 1 the drill in hand (null = bars only). */ unfold: number | null;
  /** The drill at work (null = not drilling). */ drill: (DrillView & { /** bit back off the face (m) */ back: number }) | null;
  /** The floor going in Drill II's last minute 0..1 (cracks, tilt, shudder); 1 through the fall. */ crack: number;
  /** The fall (null before it). */ fall: FallView | null;
}

export interface CavernFx {
  /** Out of the cave into the lava's light 0..1. */ hall: number;
  /** Heat shimmer at the screen edges 0..1. */ shimmer: number;
  /** Eels leaping out of the lava. */ eels: boolean;
  /** The cooling fan (null when not that scene). */ fan: FanView | null;
  /** Toward the gate, Drill II and the fall (null otherwise). */ gate: GateFx | null;
}

export interface CavernShot {
  s: number; speed: number; eye: V3; target: V3; bars: boolean;
  /** The rod in hand (magma fishing). */ rod: boolean;
  place: { waterY: number; near?: number; reach?: number; spread?: number } | null;
  fx: CavernFx;
}

export const CAVERN_WORLD = new Set(['cavern', 'bridge', 'magma', 'fan', 'toGate', 'drill2', 'fall']);
const sc = (id: string) => STORY.find((x) => x.id === id)!;
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const v = (x: number, y: number, z: number): V3 => ({ x, y, z });

/** The riding eye at route metres s, looking `ahead` m on (and `dy` m below eye height there). */
export function cavernCam(s: number, ahead = 24, dy = -0.4, eyeH = 1.55): { eye: V3; target: V3 } {
  const r = cavernRoute(), p = r.at(Math.max(0, Math.min(r.length, s))), g = r.at(Math.min(r.length, s + ahead));
  return { eye: v(p.x, p.y + eyeH, p.z), target: v(g.x, g.y + eyeH + dy, g.z) };
}

/** The drilling eye on the gate's axis, a bit's length (plus `back`) behind the face at bored `depth`; `tilt` (rad)
 *  pitches it forward and down. */
export function gateDrillCam(depth: number, back: number, tilt = 0): { eye: V3; target: V3 } {
  const A = gateAxis(), z = A.z - depth + BIT_REACH + back;
  return { eye: v(A.x, A.y + 0.2, z), target: v(A.x, A.y + 0.05 - 3 * Math.tan(tilt), z - 3) };
}

/** How far into the hall's light a point of the route is (the mouth glows ahead for the last ~140 m of the cave). */
export const hallLight = (s: number) => smooth(U_MOUTH - 140, U_MOUTH + 25, uOfS(s));

export function cavernShot(s: Pick<SeasideSnapshot, 'sceneId' | 'speed'> & { scene: { progress: number }; fan?: FanView | null; drill?: DrillView | null }): CavernShot | null {
  const id = s.sceneId, p = s.scene.progress;
  if (!CAVERN_WORLD.has(id)) return null;
  const [a, b] = cavernSpan(id as 'cavern'), at = lerp(a, b, p);
  const hall = hallLight(at), fx: CavernFx = { hall, shimmer: hall, eels: hall > 0.3, fan: null, gate: null };
  if (id === 'toGate') { // ride the causeway; the wall fills the view at the end and the bars unfold into the drill
    const cam = cavernCam(at, 30, -0.6), near = smooth(GATE_U - 90, GATE_U - 3, uOfS(at));
    const w = v(cx(GATE_U), BRIDGE_Y + lerp(GATE.h * 0.45, 1.4, smooth(0.9, 1, p)), -GATE_U);
    cam.target = v(lerp(cam.target.x, w.x, near), lerp(cam.target.y, w.y, near), lerp(cam.target.z, w.z, near));
    const unfold = smooth(0.94, 0.995, p);
    return { s: at, speed: s.speed, ...cam, bars: unfold < 1, rod: false, place: null, fx: { ...fx, gate: { unfold: unfold > 0 ? unfold : null, drill: null, crack: 0, fall: null } } };
  }
  if (id === 'drill2') {
    const d = s.drill ?? null, t = p * sc(id).planS, crack = clamp01((t - (sc(id).planS - TILT_S)) / TILT_S);
    const back = d?.phase === 'start' ? REST_BACK * (1 - smooth(0.2, 0.9, d.k)) : 0;
    const cam = gateDrillCam(d?.depth ?? 0, back, 0.3 * crack * crack);
    return { s: STOP_S, speed: 0, ...cam, bars: false, rod: false, place: null, fx: { ...fx, shimmer: 0.3, gate: { unfold: 1, drill: d && { ...d, back }, crack, fall: null } } };
  }
  if (id === 'fall') { // over the edge: forward, pitching down, then straight down into the black
    const f = fallView(p * sc(id).planS, sc(id).planS), start = gateDrillCam(GATE_DEPTH, 0, 0.3).eye;
    const eye = v(start.x, start.y - f.drop, start.z - 1.6 * smooth(0, 0.7, f.tip)), pitch = lerp(0.3, 1.45, f.tip);
    const target = v(eye.x, eye.y - 10 * Math.sin(pitch), eye.z - 10 * Math.cos(pitch));
    return { s: STOP_S, speed: 0, eye, target, bars: false, rod: false, place: null,
      fx: { ...fx, shimmer: 0, eels: false, gate: { unfold: 1 - smooth(0.3, 1, f.tip), drill: null, crack: 1, fall: f } } };
  }
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
