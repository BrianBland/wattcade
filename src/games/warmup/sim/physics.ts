/** Shared road physics so passing riders respond to hills just like the player. */
export interface RidePhysics { mass: number; cda: number; crr: number }
const G = 9.81, RHO = 1.2, DRIVE_EFF = 0.975, MAX_V = 22;

function resistance(v: number, grade: number, p: RidePhysics): number {
  const th = Math.atan(grade / 100);
  return p.mass * G * (p.crr * Math.cos(th) + Math.sin(th)) + 0.5 * RHO * p.cda * v * v;
}

export function rideSpeed(v: number, watts: number, grade: number, p: RidePhysics, dt: number): number {
  const drive = Math.max(0, watts) * DRIVE_EFF / Math.max(v, 1);
  const next = Math.min(MAX_V, Math.max(0, v + (drive - resistance(v, grade, p)) / p.mass * dt));
  return next < 0.05 && watts <= 0 ? 0 : next;
}

/** Start an offscreen rider already cruising at their prescribed effort. */
export function cruisingSpeed(watts: number, grade: number, p: RidePhysics): number {
  let lo = 0, hi = MAX_V;
  for (let i = 0; i < 24; i++) {
    const v = (lo + hi) / 2;
    if (resistance(v, grade, p) * Math.max(v, 1) < watts * DRIVE_EFF) lo = v; else hi = v;
  }
  return (lo + hi) / 2;
}
