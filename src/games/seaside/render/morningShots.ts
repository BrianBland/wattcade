// Chapter 1's camera director (#189): which shot each Morning scene is, as a pure function of the sim snapshot.
// Ride scenes map their progress onto a stretch of the coast route (so the ride never depends on how the story's rail
// lengths line up with the world); stops have fixed poses; the Big One and Under are timed set pieces. The renderer
// (render/morning.ts) poses the voxel world, the rod and the set-piece props from this.
import { FISHING_DEFAULTS, type FishingView } from '../sim/fishing';
import { STORY } from '../sim/story';
import type { SeasideSnapshot } from '../sim/types';
import { CH1, coastRoute, edgeD, pierGeom, roadX, SEA_LEVEL, win, zOfS, bridge } from '../world/coastLayout';
import { PIER_FISH_BACK } from '../world/coastBuild';

export interface V3 { x: number; y: number; z: number }

export interface MorningFx {
  /** Title card: marine-layer fog, 1 = thick. */ fog: number;
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
  bars: boolean;
  /** The rod in hand: the fishing stop's rig, or the Big One's. */ rod: 'fish' | 'bigOne' | null;
  /** Where the fishing rig puts the water. */ place: { waterY: number; near?: number; reach?: number; spread?: number } | null;
  fx: MorningFx;
}

const NO_FX: MorningFx = { fog: 0, bird: null, calm: 0, gulls: null, shadow: null, yank: 0, splash: null, under: 0, dark: 0, mouth: 0, black: 0 };
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const smooth = (a: number, b: number, x: number) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const v = (x: number, y: number, z: number): V3 => ({ x, y, z });
const add = (a: V3, b: V3, k = 1): V3 => v(a.x + b.x * k, a.y + b.y * k, a.z + b.z * k);

/** Route metres each ride scene runs between. */
export function rideSpan(id: string): [number, number] | null {
  switch (id) {
    case 'highway': return [CH1.start, CH1.turnout - 25];
    case 'rollers': return [CH1.turnout + 28, CH1.shop - 28];
    case 'toPier': return [CH1.shop + 28, pierGeom().end - PIER_FISH_BACK];
    default: return null;
  }
}

/** The Morning scenes this director shoots (the shops are the counter dioramas). */
export const MORNING_WORLD = new Set(['title', 'highway', 'turnout1', 'rollers', 'toPier', 'pier', 'bigOne', 'under']);

/** A point on the route `ahead` metres past s (straight on past the end of the pier). */
function pointAhead(s: number, d: number): V3 {
  const r = coastRoute(), L = r.length;
  const p = r.offset(Math.min(s, L), d);
  if (s <= L) return p;
  const t = r.tangent(L);
  return v(p.x + t.x * (s - L), p.y, p.z + t.z * (s - L));
}

/** The riding camera at route metres s: right lane, eyes drifting to the sea; centred and level on the pier. */
export function rideCam(s: number): { eye: V3; target: V3 } {
  const P = pierGeom(), k = smooth(P.junction - 40, P.street + 6, s);
  const lane = lerp(4.2, 1.4, k), gd = lerp(-16, 0, k), dy = lerp(-5.5, -1.2, k), ahead = lerp(74, 50, k);
  const p = coastRoute().offset(s, lane), g = pointAhead(s + ahead, gd);
  return { eye: v(p.x, p.y + 1.5, p.z), target: v(g.x, g.y + dy, g.z) };
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
  const span = rideSpan(id);
  if (span) {
    const sc = STORY.find((x) => x.id === id)!, len = 'm' in sc.length ? sc.length.m : span[1] - span[0];
    const at = lerp(span[0], span[1], p), cam = rideCam(at);
    if (id === 'rollers') { // a short rest at the top: the camera drifts toward the view on its own; then the gorge
      const b = bridge(), pb0 = (b.s0 - span[0]) / (span[1] - span[0]), pb1 = (b.s1 - span[0]) / (span[1] - span[0]);
      const w = win(p, 0.62, 0.72, 0.04) * 0.7, wg = win(p, pb0 + 0.004, pb1 - 0.006, 0.006) * 0.6;
      const look = w > 0 ? crestView(at) : gorgeView(at), k = Math.max(w, wg);
      cam.target = v(lerp(cam.target.x, look.x, k), lerp(cam.target.y, look.y, k), lerp(cam.target.z, look.z, k));
    }
    const bird = id === 'highway' && p > 0.7 && p < 0.96 ? (p - 0.7) / 0.26 : null;
    return { s: at, speed: s.speed * ((span[1] - span[0]) / len), ...cam, bars: true, rod: null, place: null, fx: { ...NO_FX, bird } };
  }
  switch (id) {
    case 'title': {
      const cam = rideCam(CH1.start);
      return { s: CH1.start, speed: 0, ...cam, bars: true, rod: null, place: null, fx: { ...NO_FX, fog: 1 - smooth(0.12, 0.92, p) } };
    }
    case 'turnout1': { // at the sea edge of the turnout, looking out and down at the water (the #187 prototype's shot)
      const tz = zOfS(CH1.turnout), lateral = edgeD(tz) + 1.5, e = r.offset(CH1.turnout, lateral);
      return { s: CH1.turnout, speed: 0, eye: v(e.x, e.y + 1.5, e.z), target: v(roadX(tz) + lateral - 30, SEA_LEVEL + 6, tz - 4),
        bars: false, rod: 'fish', place: { waterY: SEA_LEVEL }, fx: NO_FX };
    }
    case 'pier': { // by the left rail, looking south and down at the water; gulls on the end posts
      const at = P.end - PIER_FISH_BACK, e = r.offset(at, -4.4), g = r.offset(at - 6, -40);
      return { s: at, speed: 0, eye: v(e.x, e.y + 1.5, e.z), target: v(g.x, SEA_LEVEL + 2, g.z),
        bars: false, rod: 'fish', place: { waterY: SEA_LEVEL, near: 5, reach: 22, spread: 9 }, fx: { ...NO_FX, gulls: 0 } };
    }
    case 'bigOne': {
      const B = BIG_ONE, c = bigOneCam(t);
      const fx: MorningFx = { ...NO_FX, calm: smooth(B.calmAt, B.calmAt + 12, t), gulls: smooth(B.gullsAt, B.gullsAt + 7, t),
        shadow: t > B.shadowAt ? smooth(B.shadowAt, B.biteAt, t) : null, yank: c.yank, splash: c.splash, under: c.under };
      return { s: P.end, speed: 0, eye: c.eye, target: c.target, bars: false, rod: c.yank < 0.9 ? 'bigOne' : null,
        place: { waterY: SEA_LEVEL, near: 9, reach: 34, spread: 6 }, fx };
    }
    case 'under': { // the rush down through the blue, then the mouth closes
      const start = bigOneCam(BIG.planS), { fwd } = pierEnd(), sink = 55 * smooth(0, 50, t);
      const eye = add(v(start.eye.x, start.eye.y - sink, start.eye.z), fwd, t * 1.6);
      const target = add(v(eye.x, eye.y - 4 - 4 * smooth(0, 20, t), eye.z), fwd, 8);
      return { s: P.end, speed: 0, eye, target, bars: false, rod: null, place: null,
        fx: { ...NO_FX, calm: 1, under: 1, dark: smooth(4, 46, t), mouth: smooth(46, 76, t), black: smooth(78, 87, t) } };
    }
  }
  return null;
}
