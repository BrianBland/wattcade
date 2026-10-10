// Weapon table + pure lock-on picker. v1 fires only the bazooka launch; the rest are stubs (milestone 2).
export type WeaponKind = 'bazooka' | 'grenade' | 'oil' | 'bottle' | 'molotov';
export const WEAPONS: WeaponKind[] = ['bazooka', 'grenade', 'oil', 'bottle', 'molotov'];
export const IMPLEMENTED: ReadonlySet<WeaponKind> = new Set(['bazooka']);

/** Nearest target inside a forward cone. heading: 0 = +z. Returns index or -1. Sticky: keeps `prev` if still valid. */
export function pickLock(x: number, z: number, heading: number, targets: ReadonlyArray<{ x: number; z: number; alive: boolean }>,
  range: number, coneRad: number, prev = -1): number {
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
