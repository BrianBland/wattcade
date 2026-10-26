// Chapter 3c (#194): re-entry and wing flight. Pure.
// Re-entry is a timed set piece: the air ignites, then the scene's one sprint (the storyboard's 25 s all-out) grows the
// wings and slows the fall; it can't fail, effort only scales the fire and the shake. The wings are a rail ride: the
// cadence drives the flaps (the trainer pulses on each downstroke, workout.ts), the paddles (or ← / →, or the touch
// buttons) bank you across the line of flight, and a ribbon of air weaves along it: inside it you're carried faster,
// outside it the glide just takes longer. The last stretch lines you up with the road on its own (the landing).

export interface FlightTuning {
  /** Bank: how fast the wings follow the input (1/s) and the steepest bank (rad). */
  bankRate: number; maxBank: number;
  /** Sideways drift: m/s across the line of flight per m/s of speed at full bank (× sin bank / sin maxBank). */
  drift: number;
  /** The ribbon's half width (m), the speed bonus inside it and the speed factor outside it. */
  ribbonHalf: number; ribbonBoost: number; offRibbon: number;
}

export const FLIGHT_DEFAULTS: FlightTuning = { bankRate: 2.5, maxBank: 0.5, drift: 0.35, ribbonHalf: 9, ribbonBoost: 0.15, offRibbon: 0.9 };

/** The wings: how far you can bank away from the line of flight (m), and where the glide starts lining up with the
 *  road (scene progress) and is on it (the landing). */
export const WINGS = { reach: 60, alignP: 0.8, landP: 0.985 } as const;

/** Re-entry beats (plan seconds): the fire builds, then (after the sprint) the wings slow you and the fire dies, the
 *  cloud deck rushes past and you come out under it, high over the coast. */
export const REENTRY = { igniteS: 4, coolS: 14, cloudS: 44, outS: 50 } as const;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const clamp01 = (x: number) => clamp(x, 0, 1);
const smooth = (a: number, b: number, x: number) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };

/** How strongly the glide is pulled onto the road at progress p (0 = free, 1 = on it). */
export const alignAt = (p: number) => smooth(WINGS.alignP, WINGS.landP, p);

/** The ribbon's centre (m across the line of flight, + right) at scene progress p: long lazy S-bends that fade out as
 *  the glide lines up with the road. */
export function ribbonAt(p: number): number {
  const a = 30 * Math.sin(2 * Math.PI * 1.6 * p + 0.5) + 12 * Math.sin(2 * Math.PI * 3.7 * p + 1.3);
  return a * (1 - alignAt(p));
}

export interface FlightState { x: number; bank: number }
export const FLIGHT_START: FlightState = { x: 0, bank: 0 };

/** Steering from the controls: paddles (analog, right minus left), plus ← / → held (keyboard, touch). −1..1. */
export function steerFrom(inp: { paddleL: number; paddleR: number; held: ReadonlySet<string> }): number {
  const keys = (inp.held.has('right') ? 1 : 0) - (inp.held.has('left') ? 1 : 0);
  return clamp(inp.paddleR - inp.paddleL + keys, -1, 1);
}

/** One step of the glide: the bank follows the steering, the bank drifts you across the line of flight (at `speed`
 *  m/s), and near the end the glide is drawn onto the road whatever you do. */
export function stepFlight(s: FlightState, steer: number, p: number, speed: number, dt: number, t: FlightTuning): FlightState {
  const k = 1 - Math.exp(-dt * t.bankRate), al = alignAt(p);
  const bank = s.bank + (steer * t.maxBank * (1 - al) - s.bank) * k;
  let x = s.x + Math.max(0, speed) * t.drift * (Math.sin(bank) / Math.sin(t.maxBank || 1)) * dt;
  x = clamp(x, -WINGS.reach, WINGS.reach);
  x += (0 - x) * (1 - Math.exp(-dt * 3 * al)); // drawn onto the road
  return { x, bank };
}

/** Inside the ribbon? */
export const inRibbon = (x: number, p: number, t: Pick<FlightTuning, 'ribbonHalf'>) => Math.abs(x - ribbonAt(p)) <= t.ribbonHalf;

/** Rail speed factor: carried along in the ribbon, a longer glide outside it (never a stop, never a fall). */
export const ribbonFactor = (inside: boolean, p: number, t: Pick<FlightTuning, 'ribbonBoost' | 'offRibbon'>) =>
  1 + ((inside ? 1 + t.ribbonBoost : t.offRibbon) - 1) * (1 - alignAt(p));

/** Where the wing is in its beat: 0..1 per flap (`flapRevs` crank revs), the downstroke while < `on`. */
export function flapPhase(crankRevs: number, flapRevs: number): number {
  const ph = crankRevs / Math.max(0.1, flapRevs);
  return ph - Math.floor(ph);
}

export interface ReentryView {
  /** The air on fire 0..1 (with the shake). */ fire: number;
  /** The wings out 0..1 (they grow through the sprint). */ wings: number;
  /** Effort now / the sprint's target, 0..1.5 (scales the fire and the shake while the sprint is on). */ effort: number;
  /** How hard the sprint was overall (mean power / target, 0..1.5; 1 before it's done). */ spectacle: number;
  /** Through the cloud deck 0..1 (white), then out under it 0..1 (the coast below). */ cloud: number; out: number;
}

/** Re-entry at plan second `t`. `sprint` is the scene's planned sprint (its start and length); `pull` the sprint in
 *  progress (it grows the wings), `effort` the power now over its target, `spectacle` its mean once it's done. */
export function reentryView(t: number, sprint: { atS: number; planS: number }, pull: { t: number; durS: number } | null, effort: number, spectacle: number | null): ReentryView {
  const R = REENTRY, end = sprint.atS + sprint.planS, after = !pull && t >= end;
  const grow = pull ? clamp01(pull.t / Math.max(1, pull.durS)) : after ? 1 : 0;
  // the fire builds, roars with the sprint, then dies away once the wings have caught the air
  const heat = smooth(0, R.igniteS, t) * (pull ? 0.75 + 0.25 * clamp(effort, 0, 1.5) : after ? 1 - smooth(end, end + R.coolS, t) : 0.8);
  return {
    fire: clamp01(heat), wings: grow, effort: pull ? clamp(effort, 0, 1.5) : 0, spectacle: clamp(spectacle ?? 1, 0, 1.5),
    cloud: smooth(R.cloudS - 2, R.cloudS + 2, t) * (1 - smooth(R.outS - 2, R.outS + 1, t)), out: smooth(R.outS - 1, R.outS + 3, t),
  };
}
