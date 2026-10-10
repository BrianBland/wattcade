// Wile E. Coyote arsenal: weapon table, lock-on, projectiles, ground patches, blasts. Pure.
export type WeaponKind = 'bazooka' | 'grenade' | 'oil' | 'bottle' | 'molotov';
export const WEAPONS: WeaponKind[] = ['bazooka', 'grenade', 'oil', 'bottle', 'molotov'];
export const START_AMMO: Record<WeaponKind, number> = { bazooka: 3, grenade: 4, oil: 3, bottle: 6, molotov: 3 };
export const PICKUP_AMMO: Record<WeaponKind, number> = { bazooka: 2, grenade: 3, oil: 2, bottle: 4, molotov: 2 };
export const MAX_AMMO = 9;

export type PatchKind = 'oil' | 'glass' | 'fire';
export interface Patch { id: number; kind: PatchKind; x: number; z: number; r: number; ttl: number }
export interface Projectile { id: number; kind: 'rocket' | 'grenade' | 'bottle' | 'molotov'; x: number; y: number; z: number; vx: number; vy: number; vz: number; fuse: number; landed: boolean; age: number }
/** Short-lived VFX/AoE record (renderer draws an expanding puff). */
export interface Blast { id: number; x: number; y: number; z: number; r: number; at: number; kind: 'boom' | 'shatter' | 'splash' | 'poof' }
export interface Target { x: number; z: number; alive: boolean }

/** Nearest target inside a forward cone. heading: 0 = +z. Returns index or -1. Sticky: keeps `prev` if still valid. */
export function pickLock(x: number, z: number, heading: number, targets: ReadonlyArray<Target>, range: number, coneRad: number, prev = -1): number {
  const ok = (i: number) => {
    const t = targets[i]; if (!t || !t.alive) return false;
    const dx = t.x - x, dz = t.z - z, d = Math.hypot(dx, dz);
    if (d > range || d < 0.5) return false;
    let a = Math.atan2(dx, dz) - heading; a = Math.atan2(Math.sin(a), Math.cos(a));
    return Math.abs(a) <= coneRad;
  };
  if (prev >= 0 && ok(prev)) return prev;
  let best = -1, bd = Infinity;
  for (let i = 0; i < targets.length; i++) if (ok(i)) { const d = Math.hypot(targets[i].x - x, targets[i].z - z); if (d < bd) { bd = d; best = i; } }
  return best;
}

/** Launch velocity for a lob from (x,y,z) landing at (tx,tz) after `flightS` seconds under gravity g. */
export function lob(x: number, y: number, z: number, tx: number, ty: number, tz: number, flightS: number, g: number) {
  return { vx: (tx - x) / flightS, vz: (tz - z) / flightS, vy: (ty - y + 0.5 * g * flightS * flightS) / flightS };
}

/** Advance a projectile; returns 'hitGround' the tick it touches down (rockets don't fall). */
export function stepProjectile(p: Projectile, dt: number, g: number, ground: (x: number, z: number) => number, solid: (x: number, z: number, y: number) => boolean): 'flying' | 'hitGround' | 'hitWall' {
  p.age += dt;
  if (p.landed) { p.fuse -= dt; return 'flying'; }
  if (p.kind !== 'rocket') p.vy -= g * dt;
  p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
  if (solid(p.x, p.z, p.y)) return 'hitWall';
  const gy = ground(p.x, p.z);
  if (p.y <= gy) { p.y = gy; return 'hitGround'; }
  return 'flying';
}

/** Radial launch: everyone within r gets thrown up and away, stronger near the centre. Returns indices hit. */
export function radialLaunch(people: Array<{ x: number; y: number; z: number; vx: number; vy: number; vz: number; airS: number; alive: boolean }>, x: number, z: number, r: number, v: number, hv = v * 0.35): number[] {
  const hit: number[] = [];
  people.forEach((p, i) => {
    if (!p.alive) return;
    const dx = p.x - x, dz = p.z - z, d = Math.hypot(dx, dz);
    if (d > r) return;
    const k = 1 - 0.5 * (d / r), a = d > 0.01 ? Math.atan2(dx, dz) : i;
    const kh = 0.55 + 0.45 * (1 - d / r); // horizontal shove: strongest at the centre, still real at the rim
    p.vy = v * k; p.vx = Math.sin(a) * hv * kh; p.vz = Math.cos(a) * hv * kh; p.airS = 0.01;
    hit.push(i);
  });
  return hit;
}

export const inPatch = (patches: ReadonlyArray<Patch>, x: number, z: number, kind: PatchKind) => patches.some((p) => p.kind === kind && Math.hypot(p.x - x, p.z - z) < p.r);
