import * as THREE from 'three';
import { assemble, ball, Builder, box, cyl, flip, materials, ribbon, slab, template, torus, TAU } from './flagships';
/**
 * Ordinary enemies: each fighter kind has its own silhouette so a formation reads at a glance even when tiny on screen
 * (drone = dart, armour = heavy hexagonal brick, weaver = crescent moth, gunner = twin-boom gunship), and ground units
 * are proper vehicles (a hex bunker with a domed twin-gun turret; a tracked tank with a long-barrelled turret).
 *
 * Built once per kind with the flagship `Builder` (shared, merged, grouped geometry) and the same panelled hull shader,
 * with per-instance materials. Model space: nose to −z for fighters (the renderer turns them to face the player); ground
 * units face +z (toward the player, unturned). Turret tops are a `barrel` group pivoting about their own centre.
 */
export type FleetKind = 'drone' | 'armor' | 'weaver' | 'gunner' | 'turret' | 'tank' | 'heavy';
/** A nacelle and a glowing exhaust bulb that reads from above. No additive plume: each material is a draw call, and fighters come in dozens. */
const jet = (b: Builder, x: number, y: number, z: number, r: number, len: number) => { b.add('dark', cyl(r * 0.85, r, len, 12), [x, y, z + len / 2], [1, 1, 1], [Math.PI / 2, 0, 0]).add('glow', ball(10), [x, y + r * 0.2, z + len + 0.3], [r * 0.75, r * 0.55, r * 1.6]); };
const builds: Record<FleetKind, (b: Builder) => void> = {
  drone(b) {
    b.add('hull', slab([[0, -4.2], [1.1, -1.6], [3.8, 2.3], [3.6, 3.1], [1.2, 2.1], [0.8, 3.3], [-0.8, 3.3], [-1.2, 2.1], [-3.6, 3.1], [-3.8, 2.3], [-1.1, -1.6]], 0, 0.4, 0.15));
    b.add('dark', box(), [0, 0.62, 0.6], [0.9, 0.35, 4.2]).add('dark', ball(), [0, 0.75, -0.9], [0.5, 0.38, 1.3]);
    b.pair('glow', box(), [3.55, 0.45, 2.55], [0.22, 0.2, 0.9]).add('glow', ball(8), [0, 0.35, -4.15], [0.2, 0.2, 0.2]);
    b.pair('dark', box(), [1.7, 0.85, 2.6], [0.12, 0.9, 1.1], [0, 0, -0.35]);
    jet(b, 0, 0.45, 3.1, 0.55, 0.7); b.add('glow', box(), [0, 0.82, 1.4], [0.18, 0.08, 2.2]);
  },
  armor(b) {
    b.add('hull', slab([[0, -3.6], [2.6, -2.5], [3.7, 0.4], [2.9, 3.3], [-2.9, 3.3], [-3.7, 0.4], [-2.6, -2.5]], -0.5, 1.2, 0.3));
    const shoulder: Array<[number, number]> = [[1.6, -1.8], [3.1, -0.9], [3.2, 1.6], [1.6, 2.2]];
    b.add('armor', slab(shoulder, 1, 0.45, 0.15)).add('armor', slab(flip(shoulder), 1, 0.45, 0.15));
    b.add('armor', slab([[-0.9, -3], [0.9, -3], [1.1, 2.4], [-1.1, 2.4]], 1, 0.6, 0.15));
    b.add('glow', box(), [0, 1.05, -3.25], [2.6, 0.25, 0.12]).pair('dark', box(), [2.2, 0.2, -2.9], [0.9, 0.6, 0.6], [0, 0.4, 0]);
    for (const x of [-1.4, 1.4]) jet(b, x, 0.2, 3.3, 0.7, 0.8);
    // A ram prow and two stub cannons, so the heavy reads as a warship rather than a crate.
    b.add('armor', slab([[-1.4, -3.1], [1.4, -3.1], [0, -5.2]], -0.3, 0.9, 0.2)).pair('dark', cyl(0.2, 0.24, 1.8, 8), [2.4, 0.4, -3.6], [1, 1, 1], [Math.PI / 2, 0, 0]);
    b.pair('glow', box(), [2.4, 1.5, 0.3], [0.9, 0.08, 2.6]);
  },
  weaver(b) {
    const wing: Array<[number, number]> = [[0.6, 1], [2.5, 0.9], [4, -0.5], [4.6, -2.7], [4.2, -4.6]];
    b.add('hull', slab(ribbon(wing, 1.8, 0.4), 0, 0.35, 0.12)).add('hull', slab(ribbon(flip(wing), 1.8, 0.4), 0, 0.35, 0.12));
    b.add('hull', ball(16), [0, 0.35, 0.2], [0.95, 0.6, 2.4]).add('dark', ball(), [0, 0.75, -0.7], [0.45, 0.35, 1]);
    for (let i = 0; i < wing.length - 1; i++) b.bar('glow', [wing[i][0], 0.55, wing[i][1] - 0.7], [wing[i + 1][0] - 0.2, 0.55, wing[i + 1][1] - 0.6], 0.14, 0.12, true);
    b.pair('glow', ball(8), [4.2, 0.4, -4.75], [0.3, 0.3, 0.3]);
    jet(b, 0, 0.35, 2.4, 0.55, 0.7);
  },
  gunner(b) {
    for (const x of [-1.9, 1.9]) {
      b.add('hull', slab([[x - 0.55, -3.6], [x + 0.55, -3.6], [x + 0.6, 3.2], [x - 0.6, 3.2]], -0.2, 0.9, 0.15));
      b.add('dark', cyl(0.22, 0.26, 3.4, 10), [x, 0.05, -4.8], [1, 1, 1], [Math.PI / 2, 0, 0]).add('glow', ball(8), [x, 0.05, -6.55], [0.27, 0.27, 0.35]);
      b.add('armor', box(), [x, 1.15, 2.6], [0.14, 1.3, 1.3], [0, 0, x > 0 ? -0.2 : 0.2]);
      jet(b, x, 0.25, 3.3, 0.5, 0.5); b.add('glow', box(), [x, 0.75, 0], [0.16, 0.08, 4.6]);
    }
    b.add('hull', slab([[-3.6, 0.2], [3.6, 0.2], [3.3, 1.6], [-3.3, 1.6]], 0.1, 0.3, 0.1));
    b.add('armor', ball(16), [0, 0.5, -0.6], [0.9, 0.7, 2]).add('dark', ball(), [0, 0.9, -1.4], [0.45, 0.3, 0.8]);
    b.pair('glow', box(), [3.45, 0.45, 0.9], [0.25, 0.22, 1]);
  },
  turret(b) {
    b.add('dark', cyl(2.6, 3, 0.9, 6), [0, 0.1, 0]).add('armor', cyl(2.3, 2.7, 0.5, 6), [0, 0.75, 0]);
    for (let i = 0; i < 6; i++) { const a = i * TAU / 6 + TAU / 12; b.add('glow', box(), [Math.cos(a) * 2.55, 0.62, Math.sin(a) * 2.55], [0.5, 0.12, 0.12], [0, -a + Math.PI / 2, 0]); }
    b.group('barrel', [0, 1.3, 0]);
    b.add('hull', ball(18), [0, 0, 0], [1.6, 1, 1.6]).add('dark', box(), [0, 0.1, 1.1], [1.7, 0.7, 0.9]);
    for (const x of [-0.45, 0.45]) b.add('dark', cyl(0.2, 0.24, 3, 10), [x, 0.15, 2.6], [1, 1, 1], [Math.PI / 2, 0, 0]).add('glow', ball(8), [x, 0.15, 4.1], [0.24, 0.24, 0.24]);
    b.add('glow', box(), [0, 0.95, -0.2], [0.7, 0.12, 0.4]);
  },
  // The rider's level-7 heavy escort: a twin-boom gunship with missile racks (nose to −z, never turned around).
  heavy(b) {
    b.add('hull', slab([[0, -3.4], [1, -1.6], [1.3, 2.6], [-1.3, 2.6], [-1, -1.6]], 0.1, 0.9, 0.25));
    b.add('hull', slab([[-3.4, 0.2], [3.4, 0.2], [3.2, 2.1], [-3.2, 2.1]], 0.2, 0.3, 0.12));
    b.add('dark', ball(), [0, 1.25, -0.9], [0.55, 0.38, 1.2]);
    for (const x of [-2.6, 2.6]) {
      b.add('armor', slab([[x - 0.5, -2.4], [x + 0.5, -2.4], [x + 0.55, 3], [x - 0.55, 3]], 0, 0.9, 0.15));
      for (let i = 0; i < 3; i++) for (const r of [-0.25, 0.25]) b.add('dark', cyl(0.13, 0.13, 1.3, 8), [x + Math.sign(x) * (0.95 + i * 0.32), 0.3 + r, -0.4], [1, 1, 1], [Math.PI / 2, 0, 0]).add('glow', ball(6), [x + Math.sign(x) * (0.95 + i * 0.32), 0.3 + r, -1.08], [0.13, 0.13, 0.13]);
      jet(b, x, 0.45, 3, 0.45, 0.6);
      b.add('glow', box(), [x, 0.95, 0.3], [0.14, 0.08, 4.4]);
    }
  },
  tank(b) {
    b.add('hull', slab([[-2, 3.1], [2, 3.1], [2.3, 1.9], [2.3, -2.9], [-2.3, -2.9], [-2.3, 1.9]], -0.9, 1.2, 0.3));
    for (const x of [-2.75, 2.75]) {
      b.add('dark', box(), [x, -0.8, 0], [1.1, 1.3, 6.6]);
      for (let i = 0; i < 6; i++) b.add('armor', cyl(0.48, 0.48, 1.2, 12), [x, -0.95, -2.6 + i * 1.04], [1, 1, 1], [0, 0, Math.PI / 2]);
      for (let i = 0; i < 11; i++) b.add('dark', box(), [x, -0.12, -3.1 + i * 0.62], [1.15, 0.12, 0.3]);
      b.add('armor', box(), [x, 0.05, 0], [1.3, 0.18, 6.4]);
    }
    b.pair('glow', box(), [1.6, 0.4, 3.15], [0.5, 0.18, 0.1]);
    b.group('barrel', [0, 1.1, -0.3]);
    b.add('hull', slab([[-1.4, 1.4], [1.4, 1.4], [1.7, -0.2], [1.3, -1.7], [-1.3, -1.7], [-1.7, -0.2]], -0.45, 0.85, 0.2));
    b.add('dark', cyl(0.22, 0.28, 4.2, 12), [0, 0, 3.4], [1, 1, 1], [Math.PI / 2, 0, 0]).add('dark', cyl(0.36, 0.36, 0.6, 12), [0, 0, 5.4], [1, 1, 1], [Math.PI / 2, 0, 0]);
    b.add('armor', cyl(0.5, 0.5, 0.2, 12), [0.6, 0.55, -0.6]).add('glow', box(), [-0.8, 0.55, 0.8], [0.4, 0.12, 0.25]);
    b.add('glow', torus(0.38, 0.06, TAU, 14), [0, 0, 5.72]);
  },
};
/** A fresh enemy model of `kind` in hull colour `color`, lit with `light` (cached geometry, per-instance materials). */
export function fleetModel(kind: FleetKind, color: string, light: string): THREE.Group {
  const base = new THREE.Color(color), ground = kind === 'turret' || kind === 'tank';
  const spec = {
    accent: light, hull: ground ? '#cfc6d6' : base.getStyle(), armor: (ground ? new THREE.Color('#e8ddec') : base.clone().lerp(new THREE.Color('#ffffff'), 0.35)).getStyle(),
    dark: ground ? '#1e2c3a' : '#1b2233', pattern: 0, panel: [0.7, 1] as [number, number],
  };
  return assemble(template(`fleet-${kind}`, builds[kind]), materials(spec, kind.length));
}
