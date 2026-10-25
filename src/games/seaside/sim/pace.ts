// Rail pace: virtual speed from power, gently nudged toward the story's planned time.

export interface PaceTuning {
  /** Speed ∝ (power / planned power)^exponent; 1/3 matches air drag. */
  exponent: number;
  /** Nudge per second behind (+) or ahead (−) of the plan. */
  gain: number;
  /** Largest catch-up nudge for a rider behind the plan (0.2 = +20 %). */
  max: number;
  /** Largest brake for a rider ahead of the plan: small, so harder work still finishes sooner. */
  maxAhead: number;
  /** Rail speed never exceeds this multiple of the scene's planned speed. */
  cap: number;
}

/** Multiplier on rail speed: >1 when the rider is behind the plan, <1 when ahead. */
export function paceNudge(lagS: number, gain: number, max: number, maxAhead = max): number {
  return 1 + Math.max(-maxAhead, Math.min(max, gain * lagS));
}

/** Target rail speed (m/s) for power `watts` in a scene planned at `planMps` and `planWatts`. */
export function railSpeed(watts: number, planWatts: number, planMps: number, lagS: number, t: PaceTuning): number {
  if (watts <= 0 || planWatts <= 0) return 0;
  const raw = planMps * Math.pow(watts / planWatts, t.exponent);
  return Math.min(planMps * t.cap, raw * paceNudge(lagS, t.gain, t.max, t.maxAhead));
}

/** Effort-gated progress rate (plan seconds per second): work at the planned effort runs on schedule. */
export function effortRate(watts: number, planWatts: number, floor: number, cap: number): number {
  if (planWatts <= 0) return 1;
  return Math.max(floor, Math.min(cap, watts / planWatts));
}
