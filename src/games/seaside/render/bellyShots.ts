// Chapter 2a's camera director (#190): which shot each belly scene is, as a pure function of the sim snapshot. The
// rides map progress onto their stretch of the gut; Eyes open sits where you woke; the drill parks the eye a bit's
// length from the face (which moves in as the depth grows); the breakthrough swims out through the hole and up.
// The renderer (render/belly.ts) poses the world, the drill rig and the effects from this.
import { BELLY_LAYERS, lidOpen, PARTS, type DrillView } from '../sim/belly';
import { STORY } from '../sim/story';
import type { SeasideSnapshot } from '../sim/types';
import { gradeAt } from '../sim/workout';
import { drillAxis, GUT, gutPoint, gutRoute, PART_SPOTS, sOfU } from '../world/bellyLayout';
import type { V3 } from './morningShots';

export interface BellyFx {
  /** Eyelids 0 shut .. 1 open, and how soft the view still is 0..1 (bloom haze). */ lids: number; haze: number;
  /** Heartbeat pulse 0..1 right now. */ heart: number;
  /** Floor heave: camera roll (rad), from the trainer's swell. */ roll: number;
  /** Bars → drill: 0 bars .. 1 the drill in hand (null = bars only). */ unfold: number | null;
  /** The drill at work (null = not drilling). */ drill: (DrillView & { /** bit back off the face (m) */ back: number }) | null;
  /** Breakthrough: the face bursting 0..1, water in 0..1, rising 0..1, white-out at the surface 0..1. */
  burst: number; flood: number; rise: number; white: number;
  /** Seconds since the stomach wall went (null before). */ since: number | null;
}

export interface BellyShot {
  /** Route metres (streaming anchor) and speed along the route (m/s). */ s: number; speed: number;
  eye: V3; target: V3;
  bars: boolean;
  fx: BellyFx;
}

export const BELLY_WORLD = new Set(['eyesOpen', 'belly', 'spareParts', 'drill1', 'breakthrough']);
const NO_FX: BellyFx = { lids: 1, haze: 0, heart: 0, roll: 0, unfold: null, drill: null, burst: 0, flood: 0, rise: 0, white: 0, since: null };

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const smooth = (a: number, b: number, x: number) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const v = (x: number, y: number, z: number): V3 => ({ x, y, z });
const lerpV = (a: V3, b: V3, k: number) => v(lerp(a.x, b.x, k), lerp(a.y, b.y, k), lerp(a.z, b.z, k));
const win = (x: number, a: number, b: number, e: number) => smooth(a - e, a + e, x) * (1 - smooth(b - e, b + e, x));
const sc = (id: string) => STORY.find((x) => x.id === id)!;

/** Route metres each ride runs between. */
export function bellySpan(id: string): [number, number] | null {
  if (id === 'belly') return [0, sOfU(GUT.partsU)];
  if (id === 'spareParts') return [sOfU(GUT.partsU), gutRoute().length - 2];
  return null;
}

/** A double-thump heartbeat at `bpm`, 0..1. */
export function heartbeat(t: number, bpm: number): number {
  const p = (t * bpm) / 60 % 1, per = 60 / bpm;
  return Math.exp(-(((p * per - 0.08) / 0.07) ** 2)) + 0.6 * Math.exp(-(((p * per - 0.32) / 0.07) ** 2));
}

/** The riding eye at route metres s: low over the floor, looking down the gut. */
export function gutCam(s: number): { eye: V3; target: V3 } {
  const r = gutRoute(), p = r.at(Math.max(0, s)), g = r.at(Math.min(r.length, s + 26));
  return { eye: v(p.x, p.y + 1.55, p.z), target: v(g.x, g.y + 1.1, g.z) };
}

/** Bit to face (m) while boring; the bit backs off this much more in a chip-clearing rest. */
export const BIT_REACH = 2.3, REST_BACK = 0.4;

/** The drilling eye: on the tunnel axis, a bit's length behind the face. */
export function drillCam(depth: number, back: number): { eye: V3; target: V3 } {
  const A = drillAxis(), z = A.z - depth + BIT_REACH + back;
  return { eye: v(A.x, A.y + 0.2, z), target: v(A.x, A.y + 0.05, z - 3) };
}

const BREAK = sc('breakthrough'), SPRINT_S = BREAK.pulls[0]?.planS ?? 15;
/** Breakthrough beats (s): the wall goes, out through the hole by the end of the sprint, the surface at the end. */
export const BREAK_T = { burstS: 1.4, outS: SPRINT_S, surfaceS: BREAK.planS };

/** The belly shot for this snapshot, or null when the scene isn't one of Chapter 2a's. */
export function bellyShot(s: Pick<SeasideSnapshot, 'sceneId' | 'sceneT' | 'speed' | 'wake' | 'parts' | 'drill'> & { scene: { progress: number } }): BellyShot | null {
  const id = s.sceneId, p = s.scene.progress;
  if (!BELLY_WORLD.has(id)) return null;
  const t = p * sc(id).planS, span = bellySpan(id);
  if (span) {
    const at = lerp(span[0], span[1], p), cam = gutCam(at), tr = sc(id).trainer;
    // the floor heaves with the swell: lean into the slope's change
    const roll = tr.mode === 'sim' && tr.swell ? -0.05 * gradeAt({ ...tr, gradePct: 0 }, Math.min(1, p + 0.03)) / Math.max(1, tr.swell.pct) : 0;
    let unfold: number | null = null;
    if (id === 'spareParts') { // eyes go to a part as you come up on it; then the bars unfold
      for (const part of PARTS) {
        const w = win(p, part.at - 0.07, part.at + 0.02, 0.03) * 0.55, q = PART_SPOTS[part.id], g = gutPoint(q.u, q.d);
        cam.target = lerpV(cam.target, v(g.x, g.y + 0.2, g.z), w);
      }
      if (s.parts?.allAt != null) unfold = smooth(0, 4, (p - s.parts.allAt) * sc(id).planS);
    }
    return { s: at, speed: s.speed, ...cam, bars: unfold === null || unfold < 1, fx: { ...NO_FX, roll, heart: heartbeat(t, 66) * 0.6, unfold } };
  }
  switch (id) {
    case 'eyesOpen': { // where you woke: on the floor at the start of the gut, looking up at the arches
      const cam = gutCam(0), lids = lidOpen(s.wake ?? 1), up = 1 - smooth(0.3, 1, s.wake ?? 1);
      return { s: 0, speed: 0, eye: cam.eye, target: v(cam.target.x, cam.target.y + 9 * up, cam.target.z), bars: true,
        fx: { ...NO_FX, lids, haze: 1 - smooth(0.62, 1, s.wake ?? 1), heart: heartbeat(t, 52) } };
    }
    case 'drill1': {
      const d = s.drill, depth = d?.depth ?? 0;
      const back = d?.phase === 'rest' ? REST_BACK * Math.sin(Math.PI * clamp01(d.k * 1.15)) : d?.phase === 'start' ? REST_BACK * (1 - smooth(0.2, 0.9, d.k)) : 0;
      const cam = drillCam(depth, back);
      return { s: gutRoute().length, speed: 0, ...cam, bars: false, fx: { ...NO_FX, unfold: 1, drill: d && { ...d, back }, heart: heartbeat(t, 74) * 0.4 } };
    }
    case 'breakthrough': {
      const B = BREAK_T, A = drillAxis(), total = BELLY_LAYERS.reduce((a, l) => a + l.m, 0);
      const burst = smooth(0, B.burstS, t), out = smooth(0.4, B.outS, t), rise = smooth(B.outS * 0.5, B.surfaceS, t);
      const start = drillCam(total, 0).eye;
      // forward through the hole and out of the fish, then up toward the light
      const z = lerp(start.z, A.z - total - 6, out) - 2 * rise, y = A.y + 0.2 + 3 * out ** 2 + 46 * rise;
      const look = smooth(B.outS * 0.4, B.outS * 1.1, t);
      const eye = v(A.x, y, z), target = v(A.x, y + 0.2 + 12 * look, z - 4 + 2.5 * look);
      return { s: gutRoute().length, speed: 0, eye, target, bars: false,
        fx: { ...NO_FX, unfold: 1 - smooth(B.outS * 0.6, B.outS, t), burst, flood: smooth(0.1, 2.2, t), rise, white: smooth(B.surfaceS - 5, B.surfaceS - 0.5, t), since: t,
          drill: { phase: 'crack', k: 1, layer: 2, layerK: 1, depth: total, total, ftp: 0, left: 0, back: 0 } } };
    }
  }
  return null;
}
