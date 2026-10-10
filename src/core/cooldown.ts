// Effort-scaled cooldowns (pure; safe in sims). Harder effort refills actions faster, and a sprint can finish them.
// Zones are judged on power (`min(5, powerZone)`), matching the SPEC rule for short efforts.

export interface Cooldown { left: number; total: number }

/** Refill-speed multiplier per power zone, index 1..5 (index 0 unused). Zone 1 is the base rate (never a penalty). */
export const DEFAULT_ZONE_REFILL: readonly number[] = [1, 1, 1.5, 2, 2.6, 3.2];

export const clampZone = (powerZone: number) => Math.max(1, Math.min(5, Math.round(powerZone))) as 1 | 2 | 3 | 4 | 5;

/** Refill speed for the current effort (1 = base). */
export function refillRate(powerZone: number, zoneMult: readonly number[] = DEFAULT_ZONE_REFILL): number {
  return zoneMult[clampZone(powerZone)] ?? 1;
}

/** Start a cooldown of `seconds` at base rate. */
export const startCooldown = (seconds: number): Cooldown => ({ left: Math.max(0, seconds), total: Math.max(0, seconds) });

/** Advance a cooldown by dt seconds at the given refill rate. Mutates and returns it. */
export function tickCooldown(c: Cooldown, dt: number, rate = 1): Cooldown {
  c.left = Math.max(0, c.left - dt * Math.max(0, rate));
  return c;
}

/** Finish a cooldown now (e.g. a sprint). Returns true if it was still refilling. */
export function completeCooldown(c: Cooldown): boolean {
  const was = c.left > 0; c.left = 0; return was;
}

/** Fill 0..1 for a button (1 = ready). */
export const readyFrac = (c: Cooldown) => (c.total <= 0 ? 1 : 1 - Math.max(0, Math.min(1, c.left / c.total)));
/** Effort palette (matches the shell zone widget), index = power zone 1..5. Pure so sims can tint HUD hints. */
export const ZONE_TINTS: readonly string[] = ['#8a8aa0', '#8a8aa0', '#3b82ff', '#2de26a', '#ffd23b', '#ff4d4d'];
export const effortTint = (zone: number) => ZONE_TINTS[clampZone(zone)];
/** Flourish intensity for a power zone: 0 in Z1 rising to 1 in Z5. */
export const effortFlourish = (zone: number) => (clampZone(zone) - 1) / 4;
export const isReady = (c: Cooldown) => c.left <= 0;
