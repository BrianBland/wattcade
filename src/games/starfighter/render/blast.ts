import * as THREE from 'three';
import { h01, VFX, type createVfx } from './vfx';
/**
 * Explosions as a pure function of age (no simulation, no allocation): a white-hot core, a cluster of ragged billows
 * thrown out at staggered moments, flame tendrils that arc away trailing fire and soot, sparks, a flat shock ring
 * (and a dust ring on the ground), a fire-lit smoke column, and burning hull chunks. Flagships go up in a chain of
 * hull detonations before the reactor blast.
 */
type Vfx = ReturnType<typeof createVfx>;
/** Receives one tumbling hull chunk (position, spin, size); the caller draws it. */
export type DebrisSink = (x: number, y: number, z: number, rx: number, ry: number, rz: number, size: number) => void;
export interface BlastColors { flash: THREE.Color; spark: THREE.Color; ring: THREE.Color; ember: THREE.Color; smoke: THREE.Color; dust: THREE.Color }
const TAU = Math.PI * 2, G = 24, heat = new THREE.Color();
/** How long a blast of size `S` stays visible (smoke included). */
export const blastLife = (S: number) => S >= 2.5 ? BOSS_MAIN_AT + 3.2 : 3;
/** Flagship chain: hull detonations, then the main blast at this age. */
export const BOSS_MAIN_AT = 1.05;
const fire = (v: Vfx, x: number, y: number, z: number, size: number, h: number, life: number, seed: number) => { heat.setRGB(h, 0, 0); v.add(VFX.fire, x, y, z, size, size, heat, life, seed); };

export function blast(v: Vfx, debris: DebrisSink, x: number, y: number, z: number, S: number, id: number, age: number, ground: boolean, C: BlastColors) {
  if (age < 0 || age > 3.2) return;
  const rs = Math.sqrt(S);
  // Core: a flash with a cross flare, then a white-hot ball that swells and cools into the billows.
  if (age < 0.07) v.add(VFX.flash, x, y + 0.5, z, 13 * S, 13 * S, C.flash, age / 0.07);
  if (age < 0.24) { const l = age / 0.24, sz = 6 * S * (0.55 + 0.9 * l); fire(v, x, y + 0.6, z, sz, 1.1, l * 0.85, h01(id * 3)); }
  // Billows: thrown out on a fast ease-out, rising, a few lagging behind so the ball keeps erupting.
  const N = Math.round(6 + 3 * S);
  for (let j = 0; j < N; j++) {
    const lag = h01(id * 7 + j) * 0.1 * Math.min(2, S), span = 0.5 + 0.45 * h01(id * 5 + j), l = (age - lag) / span;
    if (l < 0 || l >= 1) continue;
    const an = h01(id * 13 + j) * TAU, el = h01(id * 17 + j), R = (1.4 + 3.4 * h01(id * 19 + j)) * S, out = R * (0.35 + 0.65 * (1 - (1 - l) ** 3));
    const sz = (6 + 6.5 * h01(id + j * 31)) * S * (0.45 + 0.95 * Math.sqrt(l)) * (1 - 0.3 * el);
    fire(v, x + Math.cos(an) * out * (1 - el * 0.5), y + 0.5 + el * out * 0.7 + l * 2.4 * S, z + Math.sin(an) * out * (1 - el * 0.5), sz, 0.95 - 0.4 * h01(id * 23 + j), l, h01(id + j * 3));
  }
  // Tendrils: burning fragments on ballistic arcs, each leaving a fading trail of flame and then soot.
  const T = S >= 1.4 ? 6 : 4;
  for (let k = 0; k < T; k++) {
    const an = h01(id * 41 + k) * TAU, up = 0.25 + 0.75 * h01(id * 43 + k), sp = (15 + 15 * h01(id * 47 + k)) * rs, head = 0.55 + 0.35 * h01(id * 53 + k);
    const vx = Math.cos(an) * sp * (1 - up * 0.4), vz = Math.sin(an) * sp * (1 - up * 0.4), vy = up * sp * 0.9;
    const at = (tau: number, o: { x: number; y: number; z: number }) => { const d = tau * (1 - 0.4 * tau / head); o.x = x + vx * d; o.y = y + 0.5 + vy * d - 0.5 * G * tau * tau; o.z = z + vz * d; };
    for (let m = 0; m < 8; m++) {
      const tau = age - m * 0.04, pa = m * 0.04; if (tau < 0) break; if (tau > head) continue;
      const pl = pa / 0.34; if (pl >= 1) continue;
      at(tau, P); const sz = 4 * rs * (1 - 0.55 * tau / head) * (0.65 + 0.7 * pl);
      fire(v, P.x, P.y + pa * 3, P.z, sz, 1.1 - 0.5 * pl - 0.35 * tau / head, pl, h01(id * 59 + k * 8 + m));
    }
    for (let m = 0; m < 5; m++) {
      const tau = age - 0.06 - m * 0.11, pa = 0.06 + m * 0.11; if (tau < 0) break; if (tau > head) continue;
      const pl = pa / 1.1; if (pl >= 1) continue;
      at(tau, P); const sz = 5 * rs * (0.5 + 1.3 * pl);
      v.smoke(P.x, P.y + pa * 2.5, P.z, sz, C.smoke, pl, h01(id * 61 + k * 5 + m));
    }
  }
  // Sparks: fast streaks that slow and fall.
  if (age < 0.6) for (let j = 0; j < Math.min(22, Math.round(12 * S)); j++) {
    const an = h01(id * 11 + j) * TAU, up = (h01(id * 17 + j) - 0.2) * 0.9, sp = (24 + 30 * h01(id * 19 + j)) * rs, l = age / 0.6, travel = age * (1 - 0.45 * l);
    const vx = Math.cos(an) * sp, vz = Math.sin(an) * sp, vy = up * sp - G * age;
    v.add(VFX.spark, x + vx * travel, y + 0.5 + up * sp * travel - 0.5 * G * age * age, z + vz * travel, 1.6 + sp * 0.05 * (1 - l), 0.22, C.spark, l, 0, vx, vy, vz);
  }
  // Shock: a flat ring racing out across the horizontal plane; on the ground, a slower dust ring behind it.
  if (age < 0.42) { const l = age / 0.42, r = 1 + 16 * S * (1 - (1 - l) ** 2); v.add(VFX.shock, x, y + (ground ? 0.4 : 0), z, r, r, C.ring, 0.35 + 0.65 * l, h01(id * 67)); }
  if (ground && age < 1.5) { const l = age / 1.5, r = (3 + 11 * (1 - (1 - l) ** 2.5)) * S; v.dust(x, y + 0.3, z, r, C.dust, l, h01(id * 71)); }
  // Smoke column: fire-lit when it first rolls out of the billows, then sooty and grey, drifting up and back.
  const M = Math.round(5 + 2 * S);
  for (let j = 0; j < M; j++) {
    const start = 0.12 + j * 0.06, span = 1.5 + 0.7 * h01(id * 29 + j), l = (age - start) / span; if (l < 0 || l >= 1) continue;
    const an = h01(id * 23 + j) * TAU, rr = (1 + 2.5 * h01(id * 31 + j)) * S * (0.6 + 0.6 * l), sz = (7 + 16 * l) * S * (0.75 + 0.5 * h01(id + j));
    v.smoke(x + Math.cos(an) * rr, y + 1.5 + l * 8 * S + j * 0.4, z + Math.sin(an) * rr + l * 3, sz, C.smoke, l, h01(id * 29 + j));
  }
  // Hull chunks: tumbling, glowing hot and trailing an ember streak while they fly.
  const D = Math.min(14, Math.round(5 * S));
  if (age < 1.5) for (let j = 0; j < D; j++) {
    const an = h01(id * 73 + j) * TAU, sp = (8 + 14 * h01(id * 79 + j)) * rs, vy = 6 + 14 * h01(id * 83 + j), l = age / 1.5;
    const vx = Math.cos(an) * sp, vz = Math.sin(an) * sp, px = x + vx * age, py = y + 0.5 + vy * age - 0.5 * G * age * age, pz = z + vz * age;
    if (ground && py < y - 0.5) continue;
    const size = (0.35 + 0.55 * h01(id * 89 + j)) * rs * (1 - 0.4 * l), spin = 4 + 8 * h01(id * 97 + j);
    debris(px, py, pz, age * spin + j, age * spin * 0.7 + an, age * spin * 0.4, size);
    if (age < 0.9) v.add(VFX.spark, px, py, pz, 1.2 + size * 2, 0.35 * size + 0.15, C.ember, age / 0.9, 0, vx, vy - G * age, vz);
  }
}
const P = { x: 0, y: 0, z: 0 };
/** A flagship's death: a chain of hull detonations spread over its footprint, then the reactor's main blast. */
export function flagshipBlast(v: Vfx, debris: DebrisSink, x: number, y: number, z: number, S: number, id: number, age: number, C: BlastColors) {
  for (let i = 0; i < 8; i++) {
    const at = 0.11 * i + 0.06 * h01(id * 101 + i), ox = (h01(id * 103 + i) - 0.5) * 40, oz = (h01(id * 107 + i) - 0.5) * 20;
    blast(v, debris, x + ox, y + 1 + 2 * h01(id * 109 + i), z + oz, 1.1 + 0.7 * h01(id * 113 + i), id * 37 + i, age - at, false, C);
  }
  blast(v, debris, x, y + 1, z, S * 1.15, id * 41 + 7, age - BOSS_MAIN_AT, false, C);
}
