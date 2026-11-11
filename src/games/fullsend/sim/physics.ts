// Pure rocket-bike physics. Everything is in metres, seconds and FTP fractions so it is the same game at any FTP.
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

/** Rocket cruise speed (m/s) for a power, as an FTP fraction. Linear: 1.0 FTP = `speedPerFtp`. */
export const targetSpeed = (ftpFrac: number, speedPerFtp: number) => speedPerFtp * clamp(ftpFrac, 0, 2.5);

/** First-order spool toward the target speed (time constant `tau` s). */
export const spool = (v: number, target: number, dt: number, tau: number) => v + (target - v) * (1 - Math.exp(-dt / Math.max(0.05, tau)));

/** Horizontal distance of a ballistic leap from a lip at `angleDeg`, landing at the same height. */
export function leapRange(v: number, angleDeg: number, g: number): number {
  return (v * v * Math.sin((2 * angleDeg * Math.PI) / 180)) / g;
}

/** Loop radius that a rider at `vMin` just gets round (v² ≥ 5gR at the bottom). */
export const loopRadius = (vMin: number, g: number) => (vMin * vMin) / (5 * g);

/**
 * Where a rider entering a loop of radius R at speed v0 comes off it (angle from the bottom, radians).
 * `null` = makes it all the way round. `slide` = never reaches the side, so it rolls back down.
 */
export function loopExit(v0: number, R: number, g: number): { angle: number; slide: boolean } | null {
  if (v0 * v0 >= 5 * g * R * (1 - 1e-9)) return null;
  if (v0 * v0 <= 2 * g * R) return { angle: Math.acos(clamp(1 - (v0 * v0) / (2 * g * R), -1, 1)), slide: true };
  return { angle: Math.acos(clamp((2 * g * R - v0 * v0) / (3 * g * R), -1, 1)), slide: false };
}

/** Speed on a loop at angle φ from the bottom (energy conservation, never negative). */
export const loopSpeed = (v0: number, R: number, g: number, phi: number) => Math.sqrt(Math.max(0, v0 * v0 - 2 * g * R * (1 - Math.cos(phi))));

export type Medal = 0 | 1 | 2 | 3; // none, bronze, silver, gold
export function medalFor(ftpFrac: number, th: readonly [number, number, number]): Medal {
  return ftpFrac >= th[2] ? 3 : ftpFrac >= th[1] ? 2 : ftpFrac >= th[0] ? 1 : 0;
}
export const MEDAL_NAMES = ['Missed', 'Bronze', 'Silver', 'Gold'] as const;

/** Obstacles smashed: all of them at gold, scaling down to none at 70 % of bronze. */
export function smashCount(ftpFrac: number, th: readonly [number, number, number], n: number): number {
  if (ftpFrac >= th[2]) return n;
  const lo = th[0] * 0.7;
  return clamp(Math.floor((n * (ftpFrac - lo)) / (th[2] - lo)), 0, n - 1);
}

/** Coggan power zone (capped at 5) for an FTP fraction; used for the HUD target band. */
export function powerZone(f: number): 1 | 2 | 3 | 4 | 5 {
  return f < 0.56 ? 1 : f < 0.76 ? 2 : f < 0.91 ? 3 : f < 1.06 ? 4 : 5;
}
