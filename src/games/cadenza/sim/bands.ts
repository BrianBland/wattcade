import type { Band, Block, Difficulty } from './track';

/**
 * The Lancer's three band bars (low < 150 Hz, mid, high > 2 kHz). Pure and deterministic.
 *
 * Each bar drains in proportion to how many of its band's blocks are around (dL/dt = −k·r_b), and every catch / miss
 * moves it by a fixed amount, so the bar holds steady at the same catch rate (f*) whatever the song's density or genre.
 * With no blocks of a band nearby (breakdowns, launches) its bar simply holds: there is no grey-out or dormant state.
 * A weak bar (hysteresis lowOn / lowOff) ducks that band in the music and highlights its blocks; all bars high with a
 * chain going puts the rider "in the mix" (flow), which adds echo / reverb and a richer picture.
 */
export interface BandParams {
  /** Bar gain per caught block, loss per missed block, loss on every bar per mine hit. */
  gain: number; miss: number; mine: number;
  /** Break-even catch rate: the drain per block k = f*·gain − (1 − f*)·miss. */
  fStar: number;
  /** ± seconds of blocks counted for the rate, its easing (s) and cap (blocks/s). */
  windowS: number; rateTauS: number; rMax: number;
  /** Target tick shown on the HUD. */
  target: number;
  /** A bar under lowOn turns low (ducked + highlighted) until it climbs back over lowOff. */
  lowOn: number; lowOff: number;
  /** Flow: every active bar ≥ flowOn for flowHoldS with chain ≥ flowMinChain; out when an active bar is < flowOff for flowOffS. */
  flowOn: number; flowHoldS: number; flowOff: number; flowOffS: number; flowMinChain: number;
  /** A band counts as active above this rate (blocks/s); flow needs at least two active bands. */
  activeRate: number;
  /** Flow wet amount attack / release (s). */
  flowAttackS: number; flowReleaseS: number;
  /** Deepest duck of an empty bar (dB). */
  duckDb: number;
}
/** Break-even catch rates by difficulty. */
export const F_STAR: Record<Difficulty, number> = { casual: 0.7, pro: 0.8, elite: 0.88 };
export const BAND_DEFAULTS: BandParams = {
  gain: 0.06, miss: 0.03, mine: 0.2, fStar: F_STAR.pro, windowS: 4, rateTauS: 1, rMax: 4, target: 0.7,
  lowOn: 0.35, lowOff: 0.45, flowOn: 0.8, flowHoldS: 4, flowOff: 0.7, flowOffS: 1, flowMinChain: 16, activeRate: 0.1,
  flowAttackS: 1.5, flowReleaseS: 0.8, duckDb: -15,
};
export const START_LEVEL = 0.6;
/** Bar drained per block of opportunity, so that catching f* of them holds the bar steady. */
export const drainPerBlock = (p: Pick<BandParams, 'fStar' | 'gain' | 'miss'>) => p.fStar * p.gain - (1 - p.fStar) * p.miss;

type V3 = [number, number, number];
export interface BandState {
  level: V3; rate: V3; low: [boolean, boolean, boolean];
  /** In the mix (flow) right now, the eased 0..1 wet amount, and the seconds spent in it. */
  flowOn: boolean; flow: number; flowS: number;
  /** Seconds the entry condition has held / an active bar has been under flowOff. */
  holdS: number; offS: number;
}
export const freshBands = (): BandState => ({
  level: [START_LEVEL, START_LEVEL, START_LEVEL], rate: [0, 0, 0], low: [false, false, false],
  flowOn: false, flow: 0, flowS: 0, holdS: 0, offS: 0,
});

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const ease = (x: number, to: number, dt: number, tau: number) => x + (to - x) * (1 - Math.exp(-dt / Math.max(1e-3, tau)));

/** Sorted times of each band's coloured (non-mine) blocks, for windowed rate counts. */
export function bandTimes(blocks: readonly Block[]): [Float64Array, Float64Array, Float64Array] {
  const out: number[][] = [[], [], []];
  for (const b of blocks) if (b.color >= 0) out[b.band ?? 1].push(b.t);
  return out.map((xs) => Float64Array.from(xs).sort()) as [Float64Array, Float64Array, Float64Array];
}
const lowerBound = (xs: Float64Array, v: number) => { let lo = 0, hi = xs.length; while (lo < hi) { const m = (lo + hi) >> 1; if (xs[m] < v) lo = m + 1; else hi = m; } return lo; };
/** Band blocks per second in [p − W, p + W] (unsmoothed, uncapped). */
export const windowRate = (times: Float64Array, p: number, W: number) => (lowerBound(times, p + W + 1e-9) - lowerBound(times, p - W)) / (2 * W);

/** What changes flow besides the bars: the scoring chain, and whether a dropout / recovery forbids it right now. */
export interface BandContext { chain: number; blocked: boolean }
export type BandEvent = 'flowOn' | 'flowOff' | null;

/** Advance the bars by dt at program position p. Returns a flow entry / exit, if one happened. */
export function advanceBands(s: BandState, times: [Float64Array, Float64Array, Float64Array], p: number, dt: number, c: BandContext, P: BandParams): BandEvent {
  const k = drainPerBlock(P);
  for (let b = 0; b < 3; b++) {
    s.rate[b] = ease(s.rate[b], Math.min(P.rMax, windowRate(times[b], p, P.windowS)), dt, P.rateTauS);
    s.level[b] = clamp01(s.level[b] - k * s.rate[b] * dt);
  }
  updateLow(s, P);
  return updateFlow(s, dt, c, P);
}

function updateLow(s: BandState, P: BandParams) {
  for (let b = 0; b < 3; b++) {
    if (!s.low[b] && s.level[b] < P.lowOn) s.low[b] = true;
    else if (s.low[b] && s.level[b] > P.lowOff) s.low[b] = false;
  }
}

function updateFlow(s: BandState, dt: number, c: BandContext, P: BandParams): BandEvent {
  const active = [0, 1, 2].filter((b) => s.rate[b] > P.activeRate);
  let ev: BandEvent = null;
  if (!s.flowOn) {
    const ready = !c.blocked && c.chain >= P.flowMinChain && active.length >= 2 && active.every((b) => s.level[b] >= P.flowOn);
    s.holdS = ready ? s.holdS + dt : 0;
    if (s.holdS >= P.flowHoldS) { s.flowOn = true; s.holdS = 0; s.offS = 0; ev = 'flowOn'; }
  } else {
    s.offS = active.some((b) => s.level[b] < P.flowOff) ? s.offS + dt : 0;
    if (c.blocked || s.offS >= P.flowOffS) ev = exitFlow(s);
  }
  if (s.flowOn) s.flowS += dt;
  s.flow = ease(s.flow, s.flowOn ? 1 : 0, dt, s.flowOn ? P.flowAttackS : P.flowReleaseS);
  if (s.flow < 1e-3 && !s.flowOn) s.flow = 0;
  return ev;
}
function exitFlow(s: BandState): BandEvent { s.flowOn = false; s.holdS = 0; s.offS = 0; return 'flowOff'; }

export function bandCatch(s: BandState, band: Band, P: BandParams) { s.level[band] = clamp01(s.level[band] + P.gain); updateLow(s, P); }
export function bandMiss(s: BandState, band: Band, P: BandParams) { s.level[band] = clamp01(s.level[band] - P.miss); updateLow(s, P); }
/** A mine knocks every bar down and ends flow. */
export function bandMine(s: BandState, P: BandParams): BandEvent {
  for (let b = 0; b < 3; b++) s.level[b] = clamp01(s.level[b] - P.mine);
  updateLow(s, P);
  return s.flowOn ? exitFlow(s) : null;
}

const smoothstep = (e0: number, e1: number, x: number) => { const t = clamp01((x - e0) / (e1 - e0)); return t * t * (3 - 2 * t); };
/** Linear music gain for a bar: 1 at or above lowOn, easing down to duckDb as the bar empties. */
export const bandGain = (level: number, P: Pick<BandParams, 'lowOn' | 'duckDb'>) => Math.pow(10, (P.duckDb * smoothstep(P.lowOn, 0, level)) / 20);
