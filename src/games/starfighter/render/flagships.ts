import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
/**
 * Flagships: five distinct capital ships built from extruded hull plates, lathed/cylindrical machinery, greebles,
 * spinning rings and plasma cores. Geometry is merged per material once per style and shared by every instance
 * (`isFlagshipGeometry`); materials are made per instance so damage and running lights stay per ship.
 *
 * Model space: the nose points to −z (the renderer turns enemies around to face the player), +y is up, units are world
 * units. Battery hardpoints sit at (0, mount.c, −4) and (±15, mount.s, −4), matching the sim's battery mounts.
 *
 * Hull shading (`hullMaterial`) is procedural, in object space: staggered plates or hex cells with anti-aliased seams,
 * per-panel tone and accent paint, glowing seams on the beat, lit portholes on walls, an accent rim light, and battle
 * damage (scorch spreading with `uDamage`, glowing cracks along its edge). Nothing goes negative (bloom + NaN = black).
 */
export interface FlagshipSpec {
  name: string; accent: string; hull: string; armor: string; dark: string;
  /** 0 = plates, 1 = hex cells. */
  pattern: number; panel: [number, number];
  /** Battery hardpoint heights (centre, sides). */
  mount: { c: number; s: number };
  /** Ground shadow half extents (x, z). */
  shadow: [number, number];
  /** Model-space points that catch fire as the hull weakens (in order). */
  damage: Array<[number, number, number]>;
}
export const FLAGSHIPS: FlagshipSpec[] = [
  { name: 'Iron Dreadnought', accent: '#ffb93a', hull: '#727c88', armor: '#a3acb6', dark: '#252b33', pattern: 0, panel: [0.34, 0.55], mount: { c: 2.6, s: 2.6 }, shadow: [26, 18],
    damage: [[6, 2.2, -8], [-14, 1.8, 0], [3, 3, 8], [18, 1.6, 2], [-5, 2.6, -12]] },
  { name: 'Hive Carrier', accent: '#ff438e', hull: '#5d4f66', armor: '#927d9e', dark: '#271f2e', pattern: 1, panel: [0.75, 0.75], mount: { c: 4.2, s: 2.7 }, shadow: [27, 18],
    damage: [[5, 3.6, -8], [-15, 2.6, 3], [0, 3.8, 6], [15, 2.6, -1], [-6, 3.2, -11]] },
  { name: 'Twin Lancer', accent: '#43e9e2', hull: '#b9c4d0', armor: '#7b8a9c', dark: '#232d3b', pattern: 0, panel: [0.5, 0.22], mount: { c: 2.6, s: 2.6 }, shadow: [21, 22],
    damage: [[14, 2, -10], [-14, 2, 4], [0, 2.4, 4], [-14, 2, -14], [14, 2, 8]] },
  { name: 'Spiral Core', accent: '#b16cff', hull: '#4e4c70', armor: '#8f8ab4', dark: '#201e33', pattern: 0, panel: [0.45, 0.45], mount: { c: 3.4, s: 3.4 }, shadow: [24, 22],
    damage: [[13, 1.8, 0], [-6, 3.2, -4], [0, 4.5, 9], [-16, 1.8, -9], [6, 1.8, 14]] },
  { name: 'The Maw', accent: '#71ffa7', hull: '#414e46', armor: '#788a7d', dark: '#1c2320', pattern: 0, panel: [0.4, 0.6], mount: { c: 3, s: 2.6 }, shadow: [24, 22],
    damage: [[16, 2.2, -8], [-6, 3.6, 10], [-17, 2.2, -2], [4, 3.6, 6], [13, 2.2, -16]] },
];
/** Shared clock for every flagship shader: seconds and the beat pulse (0..1). Set by the renderer each frame. */
export const flagshipClock = { time: { value: 0 }, beat: { value: 0 } };

export type Key = 'hull' | 'armor' | 'dark' | 'glow' | 'hot' | 'glass' | 'core' | 'bone' | 'plume';
type V3 = [number, number, number];
/** One mesh per named group: a single geometry whose draw groups map to `keys` (one material each). */
interface Part { keys: Key[]; geo: THREE.BufferGeometry; name: string; pivot: THREE.Vector3 }
const shared = new Set<THREE.BufferGeometry>();
export const isFlagshipGeometry = (g: THREE.BufferGeometry) => shared.has(g);

// ---- geometry helpers (all return fresh geometry; the builder clones, transforms and merges it) ----
export const TAU = Math.PI * 2;
/** A plate extruded upward from y0 by h, outlined by (x, z) points (top view). */
export function slab(pts: Array<[number, number]>, y0: number, h: number, bevel = 0.4) {
  const g = new THREE.ExtrudeGeometry(new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, -z))),
    { depth: h, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 6 });
  g.rotateX(-Math.PI / 2); g.translate(0, y0, 0); return g;
}
export const flip = (pts: Array<[number, number]>) => pts.map(([x, z]) => [-x, z] as [number, number]);
/** A strip of width w0 → w1 along a polyline (top view), as an outline for `slab`. */
export function ribbon(pts: Array<[number, number]>, w0: number, w1: number): Array<[number, number]> {
  const L: Array<[number, number]> = [], R: Array<[number, number]> = [];
  pts.forEach(([x, z], i) => {
    const [ax, az] = pts[Math.max(0, i - 1)], [bx, bz] = pts[Math.min(pts.length - 1, i + 1)], d = Math.hypot(bx - ax, bz - az) || 1;
    const nx = -(bz - az) / d, nz = (bx - ax) / d, w = (w0 + (w1 - w0) * i / (pts.length - 1)) / 2;
    L.push([x + nx * w, z + nz * w]); R.push([x - nx * w, z - nz * w]);
  });
  return [...L, ...R.reverse()];
}
export const box = () => new THREE.BoxGeometry(1, 1, 1);
export const cyl = (r0: number, r1: number, h: number, n = 14) => new THREE.CylinderGeometry(r0, r1, h, n);
export const ball = (n = 18) => new THREE.SphereGeometry(1, n, Math.max(8, n * 0.6));
export const torus = (r: number, t: number, arc = TAU, n = 32) => new THREE.TorusGeometry(r, t, 8, n, arc);
export const cone = (r: number, h: number, n = 8) => new THREE.ConeGeometry(r, h, n);

export class Builder {
  private bins = new Map<string, { key: Key; name: string; pivot: THREE.Vector3; geos: THREE.BufferGeometry[] }>();
  private name = ''; private pivot = new THREE.Vector3(); private m = new THREE.Matrix4(); private q = new THREE.Quaternion(); private e = new THREE.Euler();
  /** Following parts belong to a named, separately animated mesh, positioned relative to `pivot`. */
  group(name = '', pivot: V3 = [0, 0, 0]) { this.name = name; this.pivot.set(...pivot); return this; }
  add(key: Key, geo: THREE.BufferGeometry, pos: V3 = [0, 0, 0], scale: V3 = [1, 1, 1], rot: V3 = [0, 0, 0]) {
    this.m.compose(new THREE.Vector3(...pos), this.q.setFromEuler(this.e.set(...rot)), new THREE.Vector3(...scale));
    let g = geo.index ? geo.toNonIndexed() : geo.clone(); g.applyMatrix4(this.m);
    for (const a of Object.keys(g.attributes)) if (a !== 'position' && a !== 'normal' && a !== 'uv') g.deleteAttribute(a);
    if (!g.getAttribute('uv')) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.getAttribute('position').count * 2), 2));
    g.clearGroups();
    const id = `${this.name}|${key}`; let bin = this.bins.get(id);
    if (!bin) this.bins.set(id, bin = { key, name: this.name, pivot: this.pivot.clone(), geos: [] });
    bin.geos.push(g); geo.dispose(); return this;
  }
  /** The part and its mirror image across x = 0 (geometry must itself be symmetric in x). */
  pair(key: Key, geo: THREE.BufferGeometry, pos: V3, scale: V3 = [1, 1, 1], rot: V3 = [0, 0, 0]) {
    this.add(key, geo.clone(), pos, scale, rot); return this.add(key, geo, [-pos[0], pos[1], pos[2]], scale, [rot[0], -rot[1], -rot[2]]);
  }
  /** A bar of width w and height h from a to b (level: a and b share y). */
  bar(key: Key, a: V3, b: V3, w: number, h: number, mirror = false) {
    const dx = b[0] - a[0], dz = b[2] - a[2], len = Math.hypot(dx, dz), mid: V3 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
    return mirror ? this.pair(key, box(), mid, [len, h, w], [0, Math.atan2(-dz, dx), 0]) : this.add(key, box(), mid, [len, h, w], [0, Math.atan2(-dz, dx), 0]);
  }
  build(): Part[] {
    const byName = new Map<string, Array<{ key: Key; pivot: THREE.Vector3; geos: THREE.BufferGeometry[] }>>();
    for (const b of this.bins.values()) { let l = byName.get(b.name); if (!l) byName.set(b.name, l = []); l.push(b); }
    return [...byName].map(([name, bins]) => {
      const perKey = bins.map(b => { const g = mergeGeometries(b.geos)!; b.geos.forEach(x => x.dispose()); return g; });
      const geo = mergeGeometries(perKey, true)!; perKey.forEach(g => g.dispose()); shared.add(geo);
      return { keys: bins.map(b => b.key), geo, name, pivot: bins[0].pivot };
    });
  }
}
/** Battery hardpoint: a pedestal from `base` up to `top` with a glowing collar and clamps. */
function pad(b: Builder, x: number, z: number, base: number, top: number) {
  b.add('dark', cyl(2.7, 3, top - base + 0.01, 16), [x, (top + base) / 2, z]);
  b.add('glow', torus(2.5, 0.13), [x, top - 0.05, z], [1, 1, 1], [Math.PI / 2, 0, 0]);
  for (let i = 0; i < 6; i++) { const a = i * TAU / 6; b.add('armor', box(), [x + Math.cos(a) * 2.9, top - 0.25, z + Math.sin(a) * 2.9], [0.7, 0.6, 0.7], [0, -a, 0]); }
}
/** Seeded scatter of small machinery boxes on a deck at height y, skipping `avoid` circles (x, z, r). */
function greebles(b: Builder, rnd: () => number, n: number, x0: number, x1: number, z0: number, z1: number, y: number, avoid: Array<[number, number, number]>, mirror = false) {
  for (let i = 0, tries = 0; i < n && tries < n * 6; tries++) {
    const x = x0 + (x1 - x0) * rnd(), z = z0 + (z1 - z0) * rnd(), w = 0.3 + rnd() * 1.2, d = 0.3 + rnd() * 1.4, h = 0.15 + rnd() * 0.55;
    if (avoid.some(([ax, az, r]) => Math.hypot(x - ax, z - az) < r + Math.max(w, d) / 2)) continue;
    const key: Key = rnd() < 0.55 ? 'dark' : 'armor';
    if (mirror) b.pair(key, box(), [x, y + h / 2, z], [w, h, d]); else b.add(key, box(), [x, y + h / 2, z], [w, h, d]);
    i++;
  }
}
/** An engine on the stern: nacelle, collar, a hot nozzle and an additive plume pointing +z. */
export function engine(b: Builder, x: number, y: number, z: number, r: number, len: number) {
  b.add('dark', cyl(r * 0.9, r, len, 16), [x, y, z + len / 2], [1, 1, 1], [Math.PI / 2, 0, 0]);
  b.add('armor', torus(r, r * 0.16, TAU, 20), [x, y, z + len]);
  b.add('hot', new THREE.CircleGeometry(r * 0.82, 18), [x, y, z + len + 0.02]);
  b.add('plume', cone(r * 0.8, r * 5, 14), [x, y, z + len + r * 2.5], [1, 1, 1], [Math.PI / 2, 0, 0]);
}
/** A gun turret (decor): round base, angular housing and `n` barrels pointing −z. */
function turret(b: Builder, x: number, y: number, z: number, s: number, n: number) {
  b.add('dark', cyl(1.5 * s, 1.7 * s, 0.6 * s), [x, y + 0.3 * s, z]);
  b.add('armor', slab([[-1.2, 1.2], [1.2, 1.2], [1.3, -0.4], [0.7, -1.3], [-0.7, -1.3], [-1.3, -0.4]].map(([px, pz]) => [x + px * s, z + pz * s] as [number, number]), y + 0.6 * s, 0.7 * s, 0.12 * s));
  for (let i = 0; i < n; i++) b.add('dark', cyl(0.15 * s, 0.17 * s, 3.6 * s, 8), [x + (i - (n - 1) / 2) * 0.55 * s, y + 0.95 * s, z - 3 * s], [1, 1, 1], [Math.PI / 2, 0, 0]);
}

function dreadnought(b: Builder, rnd: () => number) {
  b.add('hull', slab([[0, -18], [4, -14], [6.5, -6], [8.5, 4], [8, 12], [4.5, 15], [-4.5, 15], [-8, 12], [-8.5, 4], [-6.5, -6], [-4, -14]], -1, 2.2, 0.5));
  b.add('armor', slab([[0, -14.5], [3, -10], [4.6, -2], [5.6, 8], [4, 12], [-4, 12], [-5.6, 8], [-4.6, -2], [-3, -10]], 1.7, 0.6, 0.3));
  b.add('dark', slab([[0, -15], [5, -4], [6, 10], [-6, 10], [-5, -4]], -2.8, 1.4, 0.3));
  const sponson: Array<[number, number]> = [[7, -8], [18, -6.5], [23, -3], [24, 1], [21, 4], [8, 6]], top: Array<[number, number]> = [[9, -7], [18, -5.6], [21.6, -2.6], [20.2, 2.4], [9, 4.4]];
  b.add('hull', slab(sponson, -0.2, 1.2, 0.4)).add('hull', slab(flip(sponson), -0.2, 1.2, 0.4));
  b.add('armor', slab(top, 1.4, 0.3, 0.15)).add('armor', slab(flip(top), 1.4, 0.3, 0.15));
  b.bar('glow', [8.2, 0.9, -8.3], [18.2, 0.9, -6.9], 0.25, 0.25, true).bar('glow', [18.2, 0.9, -6.9], [23.2, 0.9, -3.4], 0.25, 0.25, true);
  // Side armour belts and the centreline trench.
  b.bar('armor', [8.6, 0.6, 9], [8.9, 0.6, -1], 0.7, 1.4, true).bar('armor', [8.9, 0.6, -1], [6.9, 0.6, -9], 0.7, 1.4, true);
  b.add('dark', box(), [0, 2.62, -11], [1.4, 0.12, 6]).add('glow', box(), [0, 2.66, -11], [0.35, 0.1, 5.6]);
  // Wing-tip fins with nav lights.
  b.pair('armor', box(), [23.6, 2, 0], [0.5, 3.2, 4.4], [0, 0, -0.25]).pair('glow', ball(), [24.4, 3.6, 0], [0.4, 0.4, 0.4]);
  // Stepped bridge tower, glazed toward the bow, masts and a dish.
  b.add('armor', box(), [0, 3.4, 8], [7, 1.6, 6]).add('hull', box(), [0, 4.9, 8.6], [5, 1.4, 4.4]).add('armor', box(), [0, 6.2, 9.2], [3.2, 1.2, 3]);
  b.add('glass', box(), [0, 3.7, 4.98], [6.2, 0.35, 0.1]).add('glass', box(), [0, 5.05, 6.38], [4.2, 0.3, 0.1]).add('glass', box(), [0, 6.35, 7.68], [2.6, 0.3, 0.1]);
  b.pair('dark', cyl(0.08, 0.1, 3.4, 6), [1, 8.4, 9.8]).pair('glow', ball(8), [1, 10.1, 9.8], [0.22, 0.22, 0.22]);
  b.add('armor', cyl(1.5, 0.4, 0.5, 18), [0, 7.4, 10.4], [1, 1, 1], [-0.6, 0, 0]);
  turret(b, 0, 2.6, -11, 1, 3); turret(b, 4.6, 2.6, 2, 0.75, 2); turret(b, -4.6, 2.6, 2, 0.75, 2);
  for (const x of [-4, 0, 4]) engine(b, x, 0.4, 13.5, 1.6, 2.6);
  for (const x of [-19, 19]) engine(b, x, 0.6, 4, 0.95, 1.8);
  pad(b, 0, -4, 2.3, 2.6); pad(b, 15, -4, 1.7, 2.6); pad(b, -15, -4, 1.7, 2.6);
  greebles(b, rnd, 36, -4.2, 4.2, -9, 12, 2.6, [[0, -4, 3.1], [4.6, 2, 1.8], [-4.6, 2, 1.8], [0, 8, 4.4], [0, -11, 2]]);
  greebles(b, rnd, 12, 9.5, 20.5, -4.5, 3.5, 1.85, [[15, -4, 3.3]], true);
}
function hive(b: Builder, rnd: () => number) {
  const W = [7, 9.5, 10.5, 10, 9, 7], H = [2.6, 3.4, 3.8, 3.6, 3.2, 2.6];
  W.forEach((w, i) => b.add('hull', ball(28), [0, 0, -12 + i * 4.6], [w, H[i], 5.4]));
  // Ribs over the seams between carapace plates.
  for (let i = 0; i < 5; i++) b.add('dark', torus(1, 0.05, Math.PI, 24), [0, 0, -9.7 + i * 4.6], [(W[i] + W[i + 1]) / 2 * 0.97, (H[i] + H[i + 1]) / 2 * 0.95, 1]);
  for (const x of [-15, 15]) {
    b.add('hull', cyl(3.2, 3.2, 17, 20), [x, -0.6, 0], [1, 1, 1], [Math.PI / 2, 0, 0]);
    b.add('hull', ball(), [x, -0.6, 8.5], [3.2, 3.2, 4.4]);
    b.add('armor', torus(2.75, 0.55, TAU, 24), [x, -0.6, -8.6]).add('glow', new THREE.CircleGeometry(2.4, 20), [x, -0.6, -8.62], [1, 1, 1], [0, Math.PI, 0]);
    for (let k = -1; k <= 1; k++) b.add('dark', box(), [x, -0.6 + k * 1.2, -8.75], [4.4, 0.22, 0.2]);
    b.add('armor', box(), [x, 2.55, 2.5], [2, 0.3, 10]);
    for (let k = 0; k < 4; k++) for (const side of [-1, 1]) {
      const dx = x + side * 2, dz = 0.5 + k * 2.4;
      b.add('armor', cone(0.5, 1.5, 4), [dx, 2.25, dz], [1, 1, 0.5], [-Math.PI / 2, 0, 0]).add('glow', ball(8), [dx, 2.25, dz - 0.8], [0.14, 0.14, 0.14]);
    }
  }
  for (const z of [-5, 4]) { b.bar('dark', [7, 0.4, z], [13, 0.4, z], 1.4, 1.2, true); b.pair('armor', ball(12), [11.5, 0.4, z], [1.1, 1.1, 1.1]); }
  // Brood core in a ribbed cage at the stern; feelers and sensor eyes at the bow.
  b.add('core', ball(28), [0, 1.6, 12.5], [3, 3, 3]);
  for (let i = 0; i < 4; i++) b.add('armor', torus(3.5, 0.24, Math.PI, 18), [0, 1.4, 12.5], [1, 1, 1], [0, i * Math.PI / 4, 0]);
  b.pair('armor', cone(0.35, 6, 6), [3.2, 0.9, -17], [1, 1, 1], [-Math.PI / 2 - 0.1, 0, -0.35]).pair('glow', ball(8), [4.2, 0.6, -19.8], [0.3, 0.3, 0.3]);
  for (const x of [-1.6, 0, 1.6]) b.add('glow', ball(10), [x, 1.5 + (x ? 0 : 0.3), -14.2], [0.45, 0.45, 0.45]);
  for (const x of [-7, -3, 3, 7]) b.add('hot', new THREE.CircleGeometry(0.9, 14), [x, 0, 15.6 - Math.abs(x) * 0.25]).add('plume', cone(0.7, 4, 12), [x, 0, 17.6 - Math.abs(x) * 0.25], [1, 1, 1], [Math.PI / 2, 0, 0]);
  pad(b, 0, -4, 3.5, 4.2); pad(b, 15, -4, 2.2, 2.7); pad(b, -15, -4, 2.2, 2.7);
  greebles(b, rnd, 10, 13.6, 16.4, 6.5, 10, 2.5, [], true);
}
function lancer(b: Builder, rnd: () => number) {
  const needle: Array<[number, number]> = [[0, -24], [1.8, -16], [3, -6], [3.2, 6], [2.6, 13], [-2.6, 13], [-3.2, 6], [-3, -6], [-1.8, -16]];
  const spine: Array<[number, number]> = [[0, -18], [1.6, -8], [1.9, 8], [-1.9, 8], [-1.6, -8]];
  for (const x of [-14, 14]) {
    b.add('hull', slab(needle.map(([px, pz]) => [px + x, pz] as [number, number]), -1.2, 2.4, 0.5));
    b.add('armor', slab(spine.map(([px, pz]) => [px + x, pz] as [number, number]), 1.7, 0.5, 0.25));
    // Lance rails either side of the bow, glowing along their length, and the main lance through the nose.
    for (const s of [-1, 1]) {
      b.add('dark', cyl(0.35, 0.35, 16, 10), [x + s * 2.3, 0.8, -15], [1, 1, 1], [Math.PI / 2, 0, 0]);
      b.add('glow', box(), [x + s * 2.3, 1.18, -15], [0.14, 0.14, 15]).add('hot', ball(10), [x + s * 2.3, 0.8, -23.2], [0.42, 0.42, 0.7]);
    }
    b.add('armor', cyl(0.25, 0.7, 7, 12), [x, 0, -27], [1, 1, 1], [-Math.PI / 2, 0, 0]).add('hot', ball(10), [x, 0, -30.6], [0.35, 0.35, 0.8]);
    b.add('armor', box(), [x, 3.4, 9], [0.4, 3.2, 4.4], [0.35, 0, 0]).add('glow', box(), [x, 4.6, 9.9], [0.45, 0.18, 2.6], [0.35, 0, 0]);
    b.add('glass', box(), [x, 2.35, -6.5], [1.6, 0.3, 2.2]);
    for (const s of [-1.3, 1.3]) engine(b, x + s, 0.1, 12.5, 1.05, 1.6);
  }
  // Bridge wing between the hulls, a lattice over it, the core housing and the forward battery boom.
  b.add('armor', slab([[-11.5, -2], [11.5, -2], [11.8, 5.5], [-11.8, 5.5]], -0.3, 0.8, 0.3));
  for (let i = 0; i < 4; i++) { const x0 = -10 + i * 5; b.bar('dark', [x0, 0.95, -1.4], [x0 + 5, 0.95, 4.9], 0.35, 0.3); b.bar('dark', [x0, 0.95, 4.9], [x0 + 5, 0.95, -1.4], 0.35, 0.3); }
  b.add('hull', cyl(3.4, 4.4, 2.2, 24), [0, 0.8, 2.5]).add('dark', cyl(2.6, 2.8, 0.4, 24), [0, 2, 2.5]);
  b.add('core', ball(28), [0, 2.9, 2.5], [2.3, 2.3, 2.3]).add('glow', torus(3.1, 0.14), [0, 2.3, 2.5], [1, 1, 1], [Math.PI / 2, 0, 0]);
  b.add('hull', slab([[-1.9, -8.5], [1.9, -8.5], [2.3, 0], [-2.3, 0]], 0.4, 1.2, 0.3));
  pad(b, 0, -4, 1.9, 2.6); pad(b, 15, -4, 1.9, 2.6); pad(b, -15, -4, 1.9, 2.6);
  greebles(b, rnd, 14, 12, 16, 0, 11, 2.2, [[14, 9, 2.5]], true);
  greebles(b, rnd, 8, -10, 10, 4.6, 5.4, 0.9, [[0, 2.5, 4.6]]);
}
function spiral(b: Builder, rnd: () => number) {
  b.add('core', ball(32), [0, 1.6, 4], [4.2, 4.2, 4.2]);
  b.add('dark', cyl(4.4, 2.6, 2.2, 28), [0, -0.9, 4]).add('armor', torus(4.3, 0.3, TAU, 36), [0, 0.2, 4], [1, 1, 1], [Math.PI / 2, 0, 0]);
  b.group('spin', [0, 1.2, 4]);
  b.add('armor', torus(6.6, 0.42, TAU, 48), [0, 0, 0], [1, 1, 1], [Math.PI / 2, 0, 0]);
  for (let i = 0; i < 10; i++) { const a = i * TAU / 10; b.add('dark', box(), [Math.cos(a) * 6.6, 0, Math.sin(a) * 6.6], [1.5, 1, 1.1], [0, -a, 0]).add('glow', box(), [Math.cos(a) * 6.6, 0.52, Math.sin(a) * 6.6], [0.9, 0.08, 0.3], [0, -a, 0]); }
  for (let i = 0; i < 3; i++) { const a = i * TAU / 3; b.bar('glow', [Math.cos(a) * 4.5, 0, Math.sin(a) * 4.5], [Math.cos(a) * 6.2, 0, Math.sin(a) * 6.2], 0.18, 0.18); }
  b.group('spinR', [0, 0.4, 4]);
  for (let i = 0; i < 8; i++) {
    const a = i * TAU / 8;
    b.add('hull', torus(10.5, 0.8, 0.62, 10), [0, 0, 0], [1, 1, 1.35], [Math.PI / 2, 0, a]);
    b.add('glow', ball(10), [Math.cos(a + 0.71) * 10.5, 0, Math.sin(a + 0.71) * 10.5], [0.5, 0.5, 0.5]);
  }
  b.group();
  // Three static spiral arms sweeping out from the ring, emitters at their tips.
  const right: Array<[number, number]> = [[11.5, 3], [13.6, 0], [15, -4], [16.4, -8.5], [17.4, -13], [17.8, -17]];
  b.add('hull', slab(ribbon(right, 4, 1.4), -0.4, 1, 0.35)).add('hull', slab(ribbon(flip(right), 4, 1.4), -0.4, 1, 0.35));
  b.add('hull', slab(ribbon([[0, 15], [3, 18], [7, 20], [12, 20.6]], 3.6, 1.4), -0.4, 1, 0.35));
  for (const [x, z] of [[17.8, -17.6], [-17.8, -17.6], [12.6, 20.6]] as Array<[number, number]>) b.add('hot', ball(12), [x, 0.6, z], [0.7, 0.7, 0.7]).add('armor', cone(0.9, 2.2, 6), [x, 0.6, z + Math.sign(z) * 1.2], [1, 1, 1], [Math.sign(z) * Math.PI / 2, 0, 0]);
  b.bar('glow', [11.8, 1, 2.4], [17.4, 1, -13], 0.2, 0.15, true);
  // The crossbar carrying the batteries, on struts down to the arms and the core cradle.
  b.add('armor', slab([[-17.5, -5.4], [17.5, -5.4], [17.5, -2.6], [-17.5, -2.6]], 2.4, 0.6, 0.25));
  b.add('glow', box(), [0, 3.28, -5.5], [30, 0.12, 0.15]);
  for (const x of [-15, -6, 6, 15]) b.add('dark', cyl(0.5, 0.6, 3.2, 8), [x, 0.8, -4]);
  pad(b, 0, -4, 3.1, 3.4); pad(b, 15, -4, 3.1, 3.4); pad(b, -15, -4, 3.1, 3.4);
  greebles(b, rnd, 10, 13.2, 16.6, -14, -7, 0.95, [], true);
}
function maw(b: Builder, rnd: () => number) {
  const jaw: Array<[number, number]> = [[5, 8], [12, 6], [17.5, 1], [20, -6], [18.5, -14], [14, -21], [11.5, -20], [13, -14], [13.5, -7], [11, -1], [6, 2]];
  b.add('hull', slab(jaw, -1.2, 2.8, 0.5)).add('hull', slab(flip(jaw), -1.2, 2.8, 0.5));
  b.add('hull', slab([[-8, 2], [8, 2], [11, 8], [9, 14], [4, 17], [-4, 17], [-9, 14], [-11, 8]], -1.5, 4.2, 0.6));
  b.add('armor', slab([[-7, 2.4], [7, 2.4], [8.4, 6], [-8.4, 6]], 3.2, 0.7, 0.25));
  b.pair('glow', box(), [4.2, 3.3, 1.35], [2.8, 0.45, 0.2], [0, 0, -0.28]);
  // Teeth along the inner edge of each mandible, spines along the outer edge and down the back.
  const inner: Array<[number, number]> = [[6.5, 1.6], [11, -1], [13.4, -7], [13, -14], [11.8, -19]], outer: Array<[number, number]> = [[12, 6], [17.5, 1], [20, -6], [18.5, -14], [14.5, -20]];
  const along = (pts: Array<[number, number]>, u: number): [number, number] => { const f = u * (pts.length - 1), i = Math.min(pts.length - 2, Math.floor(f)), k = f - i; return [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * k, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * k]; };
  for (let i = 0; i < 9; i++) { const [x, z] = along(inner, (i + 0.5) / 9), s = 0.8 + 0.5 * Math.sin(i * 1.7) ** 2; b.pair('bone', cone(0.55 * s, 2.4 * s, 6), [x - 0.9, 0.9, z], [1, 1, 1], [0, 0, Math.PI / 2 + 0.35]); }
  for (let i = 0; i < 7; i++) { const [x, z] = along(outer, (i + 0.5) / 7); b.pair('bone', cone(0.5, 2.6, 6), [x - 0.6, 2.4, z], [1, 1, 1], [0, 0, -0.55]); }
  for (let i = 0; i < 5; i++) b.add('bone', cone(0.7 - i * 0.06, 3 - i * 0.3, 6), [0, 3.6, 7.5 + i * 2], [1, 1, 1], [0.6, 0, 0]);
  for (const z of [9, 12, 15]) b.add('dark', box(), [0, 2.8, z], [14 - (z - 9) * 0.9, 0.3, 0.6]);
  // The throat: a dark floor, a glowing gullet, and the tongue pylon carrying the centre battery.
  b.add('dark', slab([[-11, 2], [11, 2], [12.5, -6], [-12.5, -6]], -1.7, 0.5, 0.2));
  b.add('core', ball(28), [0, -0.7, -1.8], [7, 1.2, 4.6]);
  b.add('armor', slab([[-1.7, 2], [1.7, 2], [1.3, -6.5], [-1.3, -6.5]], 0.8, 1.2, 0.3));
  for (const x of [-6, 0, 6]) engine(b, x, 0.6, 16.4 - Math.abs(x) * 0.25, 1.2, 1.4);
  pad(b, 0, -4, 2.2, 3); pad(b, 15, -4, 1.9, 2.6); pad(b, -15, -4, 1.9, 2.6);
  greebles(b, rnd, 10, 14.5, 18.5, -12, 0.5, 1.9, [[15, -4, 3.2]], true);
  greebles(b, rnd, 12, -7, 7, 7, 15, 2.8, [[0, 9, 0.6], [0, 12, 0.6], [0, 15, 0.6], [0, 11, 1.4]]);
}
function battery(b: Builder) {
  b.add('dark', cyl(2.1, 2.3, 0.6, 18), [0, 0.3, 0]).add('armor', torus(2.1, 0.16, TAU, 24), [0, 0.62, 0], [1, 1, 1], [Math.PI / 2, 0, 0]);
  b.group('barrel', [0, 1.2, 0]);
  b.add('armor', cyl(1.6, 1.8, 1.1, 6), [0, 0, 0]).add('hull', cyl(1.1, 1.4, 0.5, 6), [0, 0.75, 0.2]);
  for (const x of [-0.55, 0.55]) b.add('dark', cyl(0.2, 0.24, 3.4, 10), [x, 0.15, 2.1], [1, 1, 1], [Math.PI / 2, 0, 0]).add('glow', ball(8), [x, 0.15, 3.85], [0.26, 0.26, 0.26]);
  b.add('glow', box(), [0, 1.05, -0.6], [0.9, 0.12, 0.5]);
}
const BUILD = [dreadnought, hive, lancer, spiral, maw];
const templates = new Map<string, Part[]>();
export function template(key: string, make: (b: Builder) => void) {
  let t = templates.get(key); if (t) return t;
  const b = new Builder(); make(b); t = b.build(); templates.set(key, t); return t;
}

// ---- materials ----
const HULL_VERT = 'varying vec3 vFObj; varying vec3 vFN;';
const HULL_FRAG = /* glsl */ `
  { vec3 an = abs(vFN);
    vec2 q = an.y >= max(an.x, an.z) ? vFObj.xz : (an.x >= an.z ? vFObj.zy : vFObj.xy);
    float wall = step(an.y, max(an.x, an.z)), id, line, inner;
    vec2 p = q * uPanel;
    if (uPattern < 0.5) { // staggered plates
      p.y += 0.5 * mod(floor(p.x), 2.0);
      vec2 c = floor(p), f = fract(p), w = max(fwidth(p), vec2(1e-4)), dd = min(f, 1.0 - f) / w;
      line = (1.0 - clamp(min(dd.x, dd.y) - 0.5, 0.0, 1.0)) * clamp(1.6 - max(w.x, w.y) * 5.0, 0.0, 1.0);
      id = fhHash(c + uSeed); inner = 0.5 - abs(f.y - 0.5);
    } else { // hex cells
      vec2 r = vec2(1.0, 1.732), h = r * 0.5, a = mod(p, r) - h, b = mod(p - h, r) - h, g = dot(a, a) < dot(b, b) ? a : b, ag = abs(g);
      float d = 0.5 - max(dot(ag, vec2(0.5, 0.866)), ag.x), w = max(fwidth(p.x), 1e-4);
      line = (1.0 - smoothstep(0.0, max(0.05, w * 1.5), d)) * clamp(1.6 - w * 5.0, 0.0, 1.0);
      id = fhHash(floor((p - g) * 2.0 + 0.5) + uSeed); inner = d;
    }
    float grime = fhNoise(vFObj.xz * 0.3 + uSeed) * 0.6 + fhNoise(vFObj.xz * 1.7 + vFObj.y) * 0.4;
    diffuseColor.rgb *= (0.8 + 0.32 * id) * (1.0 - 0.5 * line) * (0.82 + 0.3 * grime);
    diffuseColor.rgb = mix(diffuseColor.rgb, uAccent * 0.5, step(0.91, id) * (1.0 - wall) * 0.7);
    float seam = step(0.84, fhHash(vec2(id * 17.0, 3.1)));
    totalEmissiveRadiance += uAccent * line * seam * (0.25 + 0.45 * uBeat) * (1.0 - uDamage * 0.6);
    if (uPattern > 0.5) totalEmissiveRadiance += uAccent * step(0.9, id) * smoothstep(0.04, 0.22, inner) * (0.3 + 0.45 * uBeat);
    if (uPattern < 0.5 && wall > 0.5) { // portholes
      vec2 wq = vec2(q.x * 1.5, vFObj.y * 2.2), wc = floor(wq), wf = fract(wq);
      float win = step(0.3, wf.x) * step(wf.x, 0.72) * step(0.35, wf.y) * step(wf.y, 0.68) * step(0.6, fhHash(wc + uSeed * 3.0));
      totalEmissiveRadiance += mix(vec3(1.0, 0.85, 0.6), uAccent, 0.35) * win * 0.7 * (1.0 - uDamage * 0.7);
    }
    float rim = pow(clamp(1.0 - abs(dot(normal, normalize(vViewPosition))), 0.0, 1.0), 3.0);
    totalEmissiveRadiance += uAccent * rim * 0.3;
    if (uDamage > 0.01) { // scorch spreading from noise, with glowing cracks along its edge
      float n = fhNoise(vFObj.xz * 0.11 + uSeed * 5.0) * 0.72 + fhNoise(vFObj.xz * 0.4 + vFObj.y * 0.3) * 0.28, th = 1.0 - uDamage * 0.7;
      float scorch = smoothstep(th - 0.1, th + 0.06, n), crack = (1.0 - smoothstep(0.0, 0.05, abs(n - th - 0.08))) * step(0.15, uDamage);
      diffuseColor.rgb *= 1.0 - 0.8 * scorch;
      totalEmissiveRadiance += vec3(1.0, 0.38, 0.08) * (crack * (0.8 + 0.4 * sin(uTime * 9.0 + n * 40.0)) + scorch * 0.12 * uDamage);
    }
  }`;
export function hullMaterial(color: string, accent: THREE.Color, pattern: number, panel: [number, number], seed: number, metal: number, rough: number) {
  const m = new THREE.MeshStandardMaterial({ color, metalness: metal, roughness: rough });
  const u = { uAccent: { value: accent }, uDamage: { value: 0 }, uPattern: { value: pattern }, uPanel: { value: new THREE.Vector2(...panel) }, uSeed: { value: seed }, uTime: flagshipClock.time, uBeat: flagshipClock.beat };
  m.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, u);
    shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>\n${HULL_VERT}`).replace('#include <begin_vertex>', '#include <begin_vertex>\nvFObj = position; vFN = objectNormal;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>\n${HULL_VERT}
      uniform vec3 uAccent; uniform float uDamage; uniform float uPattern; uniform vec2 uPanel; uniform float uSeed; uniform float uTime; uniform float uBeat;
      float fhHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float fhNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(fhHash(i),fhHash(i+vec2(1,0)),f.x),mix(fhHash(i+vec2(0,1)),fhHash(i+vec2(1,1)),f.x),f.y);}`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n${HULL_FRAG}`);
  };
  m.customProgramCacheKey = () => 'sq-flagship-hull';
  m.userData.damage = u.uDamage;
  return m;
}
/** Plasma: churning noise with bright veins, a white-hot centre and an accent halo at the limb. */
function coreMaterial(accent: THREE.Color) {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: accent }, uTime: flagshipClock.time, uBeat: flagshipClock.beat },
    vertexShader: /* glsl */ `varying vec3 vP; varying vec3 vN; varying vec3 vV;
      void main() { vP = position; vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position, 1.0); vV = -mv.xyz; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: /* glsl */ `uniform vec3 uColor; uniform float uTime; uniform float uBeat; varying vec3 vP; varying vec3 vN; varying vec3 vV;
      float h3(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
      float n3(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
        return mix(mix(mix(h3(i),h3(i+vec3(1,0,0)),f.x),mix(h3(i+vec3(0,1,0)),h3(i+vec3(1,1,0)),f.x),f.y),mix(mix(h3(i+vec3(0,0,1)),h3(i+vec3(1,0,1)),f.x),mix(h3(i+vec3(0,1,1)),h3(i+vec3(1,1,1)),f.x),f.y),f.z);}
      void main() {
        float f = clamp(dot(normalize(vN), normalize(vV)), 0.0, 1.0);
        float n = n3(vP * 0.9 + vec3(0.0, uTime * 0.8, 0.0)) * 0.6 + n3(vP * 2.2 - vec3(uTime * 0.5)) * 0.4;
        float veins = 1.0 - smoothstep(0.0, 0.07, abs(n - 0.5));
        vec3 c = uColor * (0.35 + 0.55 * n) + mix(uColor, vec3(1.0), 0.6) * veins * (0.6 + 0.5 * uBeat) + vec3(1.0) * pow(f, 4.0) * 0.45 + uColor * pow(1.0 - f, 2.0) * 0.7;
        gl_FragColor = vec4(min(c, vec3(1.4)), 1.0);
      }`,
  });
}
export function materials(spec: Pick<FlagshipSpec, 'accent' | 'hull' | 'armor' | 'dark' | 'pattern' | 'panel'>, style: number): Record<Key, THREE.Material> {
  const accent = new THREE.Color(spec.accent), white = new THREE.Color('#ffffff');
  return {
    hull: hullMaterial(spec.hull, accent, spec.pattern, spec.panel, style * 7.1 + 1, 0.55, 0.42),
    armor: hullMaterial(spec.armor, accent, spec.pattern === 1 ? 0 : spec.pattern, [spec.panel[0] * 1.4, spec.panel[1] * 1.4], style * 7.1 + 3, 0.6, 0.35),
    dark: new THREE.MeshStandardMaterial({ color: spec.dark, metalness: 0.7, roughness: 0.5 }),
    bone: new THREE.MeshStandardMaterial({ color: '#d8d0b2', metalness: 0.1, roughness: 0.6 }),
    glow: new THREE.MeshBasicMaterial({ color: accent }),
    hot: new THREE.MeshBasicMaterial({ color: accent.clone().lerp(white, 0.7) }),
    glass: new THREE.MeshBasicMaterial({ color: accent.clone().lerp(new THREE.Color('#9fe8ff'), 0.6).multiplyScalar(0.7) }),
    plume: new THREE.MeshBasicMaterial({ color: accent.clone().lerp(white, 0.3).multiplyScalar(0.6), transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }),
    core: coreMaterial(accent),
  };
}
export function assemble(parts: Part[], mats: Record<Key, THREE.Material>) {
  const g = new THREE.Group();
  for (const p of parts) { const m = new THREE.Mesh(p.geo, p.keys.map(k => mats[k])); if (p.name) { m.name = p.name; m.position.copy(p.pivot); } g.add(m); }
  g.userData.damage = [mats.hull.userData.damage, mats.armor.userData.damage];
  return g;
}
export function bossModel(style: number): THREE.Group {
  const s = ((style % FLAGSHIPS.length) + FLAGSHIPS.length) % FLAGSHIPS.length, rnd = mulberry(s * 977 + 13);
  const g = assemble(template(`boss-${s}`, b => BUILD[s](b, rnd)), materials(FLAGSHIPS[s], s));
  g.userData.flagship = s; return g;
}
/** A flagship battery: armoured base and a twin-barrelled turret (named `barrel`, aimed by the renderer). */
export function batteryModel(style: number): THREE.Group {
  const s = ((style % FLAGSHIPS.length) + FLAGSHIPS.length) % FLAGSHIPS.length;
  return assemble(template('battery', battery), materials(FLAGSHIPS[s], s));
}
/** Per frame: spin the rings and show battle damage (0 = pristine, 1 = wrecked). */
export function updateFlagship(g: THREE.Object3D, t: number, damage: number) {
  for (const u of (g.userData.damage ?? []) as Array<{ value: number }>) u.value = damage;
  for (const c of g.children) { if (c.name === 'spin') c.rotation.y = t * 0.55; else if (c.name === 'spinR') c.rotation.y = -t * 0.3; }
}
function mulberry(a: number) { return () => { a |= 0; a = a + 0x6d2b79f5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
