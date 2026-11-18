// Fireball resistance level, calibrated to the rider's trainer. Pure math; no DOM, no rng.
//
// A resistance level is a brake setting, not a power target: the same % costs very different watts on different
// trainers and FTPs, and climbs steeply with cadence. Model the trainer as
//   ftpFraction ≈ k · level% · (rpm / cueRpm)^alpha
// and learn `k` from what the rider actually makes, so the level that asks for the weapon's demand lands at the
// cue cadence (70–80 rpm) instead of forcing a 45 rpm grind on a strong brake.

export interface FireballLevelTuning {
  /** Cadence the level is chosen for (the middle of the "grind 70–80 rpm" cue). */
  cueRpm: number;
  /** Power ~ rpm^alpha at a fixed level (a constant-torque brake is 1; eddy-current brakes are steeper). */
  alpha: number;
  /** Clamp on the commanded level. */
  minPct: number; maxPct: number;
  /** Time constant of the k estimate (s). */
  tauS: number;
}

/** The prior k: `refLevelPct` gives `refFtp` at the cue cadence. */
export function priorK(refLevelPct: number, refFtp: number): number {
  return refFtp / Math.max(1, refLevelPct);
}

/** The level that should yield `ftpTarget` at the cue cadence. */
export function levelFor(ftpTarget: number, k: number, t: FireballLevelTuning): number {
  const lvl = ftpTarget / Math.max(1e-6, k);
  return Math.min(t.maxPct, Math.max(t.minPct, lvl));
}

/** Can this sample teach us anything? Needs a settled level, real pedalling and real power. */
export function canObserve(levelPct: number, cadence: number, ftpFraction: number, steadyS: number): boolean {
  return steadyS >= 4 && levelPct >= 2 && cadence >= 40 && cadence <= 130 && ftpFraction > 0.15;
}

/**
 * Nudge `k` toward this sample's implied value (log-space EMA, so one odd second barely moves it), clamped to
 * [k0 / 4, k0 · 4] around the prior so a bad sensor cannot run the level to an extreme.
 */
export function observeK(k: number, k0: number, levelPct: number, cadence: number, ftpFraction: number, dt: number, t: FireballLevelTuning): number {
  const seen = ftpFraction / (levelPct * Math.pow(cadence / t.cueRpm, t.alpha));
  if (!(seen > 0) || !Number.isFinite(seen)) return k;
  const a = 1 - Math.exp(-Math.max(0, dt) / Math.max(0.1, t.tauS));
  const next = Math.exp(Math.log(k) + (Math.log(seen) - Math.log(k)) * a);
  return Math.min(k0 * 4, Math.max(k0 / 4, next));
}
