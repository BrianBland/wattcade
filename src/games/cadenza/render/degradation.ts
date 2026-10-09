export interface Degradation { belowS: number; level: number }

/** Brief dips get no AV penalty; sustained shortfalls build a restrained effect over several seconds. */
export function advanceDegradation(previous: Degradation, shortfall: number, dt: number): Degradation {
  const under = Number.isFinite(shortfall) ? Math.max(0, Math.min(1, shortfall)) : 0;
  const step = Number.isFinite(dt) ? Math.max(0, Math.min(0.1, dt)) : 0;
  const belowS = under > 0.1 ? previous.belowS + step : 0;
  const ramp = Math.max(0, Math.min(1, (belowS - 3) / 10));
  const target = 0.75 * under * under * ramp;
  const tau = target > previous.level ? 3 : 1.2;
  const level = previous.level + (target - previous.level) * (1 - Math.exp(-step / tau));
  return { belowS, level };
}
