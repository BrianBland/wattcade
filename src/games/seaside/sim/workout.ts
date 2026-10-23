// The trainer plan per scene kind (storyboard effort chart). Pure: scene + live state → one resistance effect,
// always in the scene's own mode, so the trainer changes mode at most once per scene (on entry).
import type { ResistanceEffect } from '../../../contracts';
import { effortAt } from './graph';
import type { PulseKind, Scene, TrainerPlan } from './types';

export interface WorkoutTuning {
  /** Scales every route grade (riding, the cavern descent). */
  gradeScale: number;
  /** Scales base resistance levels (fishing, fan, flight). */
  levelScale: number;
  /** Scales the drill's ERG plan (fraction of FTP per segment). */
  drillScale: number;
  /** Paddling: grade % added on each stroke, stroke period (s). */
  paddlePct: number; paddlePeriodS: number;
  /** Flapping: resistance % added on each downstroke, crank revs per flap. */
  flapPct: number; flapRevs: number;
  /** Fraction of each paddle stroke / flap the pulse is on. */
  pulseOn: number;
  /** Resistance % while the smallest / largest fish runs. */
  pullLevelMin: number; pullLevelMax: number;
  /** A fish runs, then rests: period (s), run fraction, and how far the level dips while it rests (fraction). */
  runPeriodS: number; runOn: number; runDip: number;
  /** Resistance % after a set-piece sprint (released at the surface, the jump). */
  releasePct: number;
  /** Drill cadence band (rpm) and the bore-rate bonus inside it. */
  drillRpmLo: number; drillRpmHi: number; drillBandBonus: number;
  /** Fan cadence band (rpm) and the progress rate outside it (fraction). */
  fanRpmLo: number; fanRpmHi: number; fanOffBand: number;
}

export const WORKOUT_DEFAULTS: WorkoutTuning = {
  gradeScale: 1, levelScale: 1, drillScale: 1,
  paddlePct: 1.5, paddlePeriodS: 3, flapPct: 12, flapRevs: 3, pulseOn: 0.4,
  pullLevelMin: 60, pullLevelMax: 80, runPeriodS: 4, runOn: 0.6, runDip: 0.1, releasePct: 0,
  drillRpmLo: 60, drillRpmHi: 75, drillBandBonus: 0.15,
  fanRpmLo: 80, fanRpmHi: 100, fanOffBand: 0.3,
};

export interface TrainerState {
  /** Scene progress 0..1, plan seconds into the scene, real seconds in the scene. */
  p: number; planT: number; sceneT: number;
  crankRevs: number;
  /** The sprint in progress (t = seconds into it). */
  pull: { size: number; t: number; durS: number; setPiece: boolean } | null;
  /** A set piece's sprint is over and the trainer lets go. */
  released: boolean;
}

export type SceneCommand = Omit<ResistanceEffect, 'id'> | null;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const lerp = (a: number, b: number, k: number) => a + (b - a) * clamp(k, 0, 1);

/** Route grade (%) at scene progress `p`: profile keyframes (or the flat grade) plus eased-in swells. */
export function gradeAt(tr: Extract<TrainerPlan, { mode: 'sim' }>, p: number): number {
  let g = tr.gradePct;
  const k = tr.profile;
  if (k?.length) {
    g = k[k.length - 1][1];
    for (let i = 1; i < k.length; i++) {
      if (p <= k[i][0]) { const [p0, g0] = k[i - 1], [p1, g1] = k[i]; g = p1 > p0 ? lerp(g0, g1, (p - p0) / (p1 - p0)) : g1; break; }
    }
    if (p <= k[0][0]) g = k[0][1];
  }
  if (tr.swell) g += tr.swell.pct * clamp(p / 0.1, 0, 1) * Math.sin(2 * Math.PI * tr.swell.cycles * p);
  return g;
}

/** Is the rhythmic pulse on right now? */
export function pulseOn(kind: PulseKind, st: Pick<TrainerState, 'sceneT' | 'crankRevs'>, t: WorkoutTuning): boolean {
  const phase = kind === 'paddle' ? st.sceneT / t.paddlePeriodS : st.crankRevs / t.flapRevs;
  return phase - Math.floor(phase) < t.pulseOn;
}

/** Resistance % during a sprint: a fish surges by size and rests between runs; a set piece ramps up. */
export function pullLevel(base: number, pull: NonNullable<TrainerState['pull']>, t: WorkoutTuning): number {
  const top = lerp(t.pullLevelMin, t.pullLevelMax, pull.size);
  if (pull.setPiece) return lerp(base, top, pull.t / Math.max(1, pull.durS));
  const ph = pull.t / t.runPeriodS;
  return ph - Math.floor(ph) < t.runOn ? top : top * (1 - t.runDip);
}

/** The scene's resistance effect right now (null = no game resistance: soft, the cutscenes). */
export function sceneCommand(sc: Scene, st: TrainerState, t: WorkoutTuning): SceneCommand {
  const tr = sc.trainer;
  switch (tr.mode) {
    case 'none': return null;
    case 'sim': {
      const pulse = tr.pulse && pulseOn(tr.pulse, st, t) ? t.paddlePct : 0;
      return { mode: 'sim', gradePct: +(gradeAt(tr, st.p) * t.gradeScale + pulse).toFixed(2) };
    }
    case 'erg': return { mode: 'erg', ftpFraction: +(effortAt(sc, st.planT) * t.drillScale).toFixed(3) };
    case 'resistance': {
      const base = tr.levelPct * t.levelScale;
      let lvl = base;
      if (st.pull) lvl = pullLevel(base, st.pull, t);
      else if (st.released) lvl = t.releasePct;
      else if (tr.pulse && pulseOn(tr.pulse, st, t)) lvl += t.flapPct;
      return { mode: 'resistance', levelPct: +clamp(lvl, 0, 100).toFixed(1) };
    }
  }
}

/** The cadence band a scene asks for (drill, fan). */
export function cadenceBand(sc: Scene, t: WorkoutTuning): [number, number] | null {
  if (sc.kind === 'drill') return [t.drillRpmLo, t.drillRpmHi];
  if (sc.kind === 'fan') return [t.fanRpmLo, t.fanRpmHi];
  return null;
}

/** Multiplier on effort-gated progress from cadence: a bonus in the drill band, a crawl outside the fan band. */
export function cadenceRate(sc: Scene, rpm: number, t: WorkoutTuning): number {
  const band = cadenceBand(sc, t);
  if (!band) return 1;
  const inBand = rpm >= band[0] && rpm <= band[1];
  if (sc.kind === 'drill') return inBand ? 1 + t.drillBandBonus : 1;
  return inBand ? 1 : t.fanOffBand;
}
