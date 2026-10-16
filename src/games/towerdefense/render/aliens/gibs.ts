// Puppet gibs: when a heavy alien dies, some of its real cut-out parts fly off from where they were. Pure (no DOM):
// part selection, launch from the death pose, and a small 2.5D physics step (field units, height axis, bounce).
import { apply, type Affine, type Rig } from './rig';

/** Limb-like parts that make good gibs (claws first), then plates and tail links. */
const LIMB = /^(claw|scythe|femur|upper|foot|tail_tip|mandible|wing|coxa|socket|tube)/;
const PLATE = /^(thorax|abdomen|tail_|carapace|crest|battering_crest|egg_sac|posterior_fan|head)/;
export const MAX_GIBS = 48;

export interface Gib {
  /** part instance key (`claw_front_r#l`) and its part name */ key: string; part: string;
  x: number; y: number; z: number; vx: number; vy: number; vz: number;
  /** on-screen rotation (radians) and spin (rad/s); `flip` = mirrored left-side part */ rot: number; spin: number; flip: boolean;
  /** field units per manifest pixel */ scale: number; t0: number; life: number; bounced: number;
}

const rand = (seed: number) => { let s = (seed * 2654435761) >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); };

/** Which part instances fly off: `n` limbs spread across both sides (heavies), or everything up to `cap` (boss). */
export function pickGibs(r: Rig, seed: number, n: number, all = false, cap = 20): string[] {
  const keys = r.order;
  if (all) { // the big pieces first, so the cap never drops the scythes or claws
    const rank = (k: string) => (/^(scythe|claw|crest|battering_crest|head)/.test(k) ? 0 : 1);
    const limbs = keys.filter((k) => LIMB.test(k)).sort((a, b) => rank(a) - rank(b)), plates = keys.filter((k) => !LIMB.test(k) && PLATE.test(k)).sort((a, b) => rank(a) - rank(b));
    return [...limbs, ...plates].slice(0, cap);
  }
  const rnd = rand(seed), limbs = keys.filter((k) => LIMB.test(k)).sort((a, b) => (/^claw|^scythe/.test(b) ? 1 : 0) - (/^claw|^scythe/.test(a) ? 1 : 0) || a.localeCompare(b));
  const out: string[] = [];
  const pool = [...limbs];
  while (out.length < n && pool.length) { // favour claws, mix sides
    const i = Math.min(pool.length - 1, Math.floor(rnd() * Math.min(pool.length, 6)));
    out.push(pool.splice(i, 1)[0]);
  }
  return out;
}

/**
 * Launches gibs from the alien's pose at death. `M` = part world matrices (manifest px), `heading` = travel direction
 * (canvas radians), (x, y) = alien centre in field units, `lenU` = its body length in field units.
 */
export function launchGibs(r: Rig, M: Map<string, Affine>, keys: string[], x: number, y: number, heading: number, lenU: number, t: number, seed: number, boss = false): Gib[] {
  const rnd = rand(seed + 7), s = lenU / r.m.lengthPx, rot0 = heading + Math.PI / 2, c = Math.cos(rot0), sn = Math.sin(rot0);
  const out: Gib[] = [];
  for (const key of keys) {
    const name = key.split('#')[0], p = r.parts.get(name), m = M.get(key); if (!p || !m) continue;
    const [mx, my] = apply(m, p.offset[0] + p.w / 2, p.offset[1] + p.h / 2);
    const lx = (mx - r.m.centerX) * s, ly = (my - r.m.centerY) * s; // creature-local, field units
    const gx = x + lx * c - ly * sn, gy = y + lx * sn + ly * c;
    let dx = gx - x, dy = gy - y; const d = Math.hypot(dx, dy) || 1; dx /= d; dy /= d;
    const speed = (boss ? 10 : 7) + rnd() * (boss ? 14 : 9), det = m[0] * m[3] - m[1] * m[2];
    out.push({
      key, part: name, x: gx, y: gy, z: 0.2, vx: dx * speed + (rnd() - 0.5) * 4, vy: dy * speed + (rnd() - 0.5) * 4, vz: 5 + rnd() * (boss ? 9 : 6),
      rot: rot0 + Math.atan2(m[1], m[0]), spin: (rnd() - 0.5) * (boss ? 14 : 18), flip: det < 0, scale: s, t0: t, life: (boss ? 2.4 : 1.6) + rnd() * 0.5, bounced: 0,
    });
  }
  return out;
}

export const GRAVITY = 32, BOUNCE = 0.35, GROUND_DRAG = 6;
/** Advances one gib; returns false once it has expired. */
export function stepGib(gb: Gib, t: number, dt: number): boolean {
  if (t - gb.t0 > gb.life) return false;
  gb.vz -= GRAVITY * dt; gb.z += gb.vz * dt;
  if (gb.z <= 0) {
    gb.z = 0;
    if (gb.vz < -2 && gb.bounced < 2) { gb.vz = -gb.vz * BOUNCE; gb.bounced++; gb.spin *= 0.5; }
    else { gb.vz = 0; const d = Math.exp(-GROUND_DRAG * dt); gb.vx *= d; gb.vy *= d; gb.spin *= d; }
  }
  gb.x += gb.vx * dt; gb.y += gb.vy * dt; gb.rot += gb.spin * dt;
  return true;
}
/** Opacity over a gib's life: solid, then fading out over its last 0.5 s. */
export const gibAlpha = (gb: Gib, t: number) => Math.max(0, Math.min(1, (gb.life - (t - gb.t0)) / 0.5));
