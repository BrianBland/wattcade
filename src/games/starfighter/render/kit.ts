import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
/**
 * Scenery kit: detailed, merged, vertex-coloured geometries for instancing (one draw call per kind). Built once per
 * module and shared between renderer mounts. Units: x across, y up, z along (bow toward −z, the direction of travel).
 */
type Part = THREE.BufferGeometry;
const colored = (g: Part, color: string): Part => {
  const c = new THREE.Color(color), n = g.getAttribute('position').count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g;
};
const box = (w: number, h: number, d: number, x: number, y: number, z: number, color: string, ry = 0) => {
  const g = new THREE.BoxGeometry(w, h, d); if (ry) g.rotateY(ry); g.translate(x, y, z); return colored(g.toNonIndexed(), color);
};
const cyl = (rt: number, rb: number, h: number, x: number, y: number, z: number, color: string, seg = 10, rx = 0) => {
  const g = new THREE.CylinderGeometry(rt, rb, h, seg); if (rx) g.rotateX(rx); g.translate(x, y, z); return colored(g.toNonIndexed(), color);
};
/** A hull: pointed bow, flared beam, squared stern, extruded to `h`, waterline at y = 0. */
function hull(len: number, beam: number, h: number, color: string, bow = 0.22, stern = 0.85): Part {
  const s = new THREE.Shape(), L = len / 2, B = beam / 2;
  s.moveTo(0, -L); s.quadraticCurveTo(B * 1.05, -L + len * bow * 0.6, B, -L + len * bow);
  s.lineTo(B, L - 2); s.lineTo(B * stern, L); s.lineTo(-B * stern, L); s.lineTo(-B, L - 2);
  s.lineTo(-B, -L + len * bow); s.quadraticCurveTo(-B * 1.05, -L + len * bow * 0.6, 0, -L);
  const g = new THREE.ExtrudeGeometry(s, { depth: h, bevelEnabled: false, curveSegments: 6 });
  g.rotateX(Math.PI / 2); g.translate(0, h - h * 0.35, 0); // most of the hull above water, a little below
  return colored(g.toNonIndexed(), color);
}
const merge = (parts: Part[]) => { const g = mergeGeometries(parts.map(p => { p.deleteAttribute('uv'); return p; }))!; parts.forEach(p => p.dispose()); g.computeVertexNormals(); return g; };
const GREY = '#6c7a89', DARK = '#3a4552', DECK = '#5d6670', LIGHT = '#aab6c2', RED = '#7a2e2e', WIN = '#9fe8ff';

/** Supercarrier: angled flight deck overhanging the hull, island with mast and radar, deck edge elevators. */
function carrierShip(): Part {
  const p: Part[] = [hull(70, 12, 4, GREY, 0.18, 0.9), box(11, 0.5, 66, 0, 4.2, 0, DECK), box(9, 0.45, 26, -3, 4.25, 8, DECK, -0.16)];
  p.push(box(3.2, 5, 9, 5.2, 7, 6, LIGHT), box(2.6, 2.4, 6, 5.2, 10.6, 5, LIGHT), box(3.3, 0.5, 2, 5.2, 8.2, 2, WIN), box(3.3, 0.5, 2, 5.2, 10.4, 2.6, WIN));
  p.push(cyl(0.15, 0.2, 6, 5.2, 14.5, 5, DARK, 6), box(2.6, 0.12, 0.6, 5.2, 16.5, 5, DARK), box(1.6, 1.2, 0.15, 5.2, 13.2, 7, DARK));
  for (const z of [-14, 16]) p.push(box(3.4, 0.4, 4, 6.8, 4.15, z, DECK)); // elevators
  p.push(box(12.4, 1.2, 0.3, 0, 3.4, 33, DARK)); // stern ramp
  return merge(p);
}
/** Battleship: long low hull, stepped superstructure, two funnels, three triple turrets with barrels. */
function battleship(): Part {
  const p: Part[] = [hull(48, 8.5, 3, GREY, 0.26), box(7, 0.3, 40, 0, 3.05, 1, DECK)];
  p.push(box(4.6, 2.2, 10, 0, 4.2, 2, LIGHT), box(3.4, 2, 6, 0, 6.3, 0.5, LIGHT), box(2.2, 2.2, 3, 0, 8.4, -0.5, LIGHT), box(2.3, 0.4, 0.8, 0, 8.6, -2, WIN));
  p.push(cyl(0.1, 0.15, 5, 0, 11.5, 0, DARK, 6), box(3, 0.1, 0.4, 0, 12.5, 0, DARK));
  for (const z of [4, 7]) p.push(cyl(0.9, 1.1, 3, 0, 6.5, z, DARK, 10));
  for (const [z, dir, y] of [[-15, -1, 3.8], [-10, -1, 4.6], [14, 1, 3.8]] as const) {
    p.push(cyl(1.7, 1.9, 1.2, 0, y, z, LIGHT, 12));
    for (const x of [-0.6, 0, 0.6]) p.push(cyl(0.14, 0.18, 4.5, x, y + 0.2, z + dir * 2.8, DARK, 6, Math.PI / 2));
  }
  return merge(p);
}
/** Destroyer: slim hull, raked bridge, mast, funnel, a forward gun and missile cells. */
function destroyer(): Part {
  const p: Part[] = [hull(28, 4.6, 2.4, GREY, 0.3), box(3.8, 0.25, 22, 0, 2.45, 1, DECK)];
  p.push(box(3, 1.8, 6, 0, 3.4, 0, LIGHT), box(2.4, 1.4, 3, 0, 4.9, -1, LIGHT), box(2.5, 0.35, 0.5, 0, 5.2, -2.4, WIN), cyl(0.6, 0.75, 2, 0, 4.4, 3.5, DARK, 8));
  p.push(cyl(0.08, 0.12, 4.5, 0, 7.6, 0, DARK, 6), box(1.6, 0.08, 0.3, 0, 8.6, 0, DARK), cyl(0.7, 0.8, 0.8, 0, 3.0, -8, LIGHT, 10), cyl(0.1, 0.12, 2.6, 0, 3.2, -9.6, DARK, 6, Math.PI / 2));
  for (let i = 0; i < 4; i++) p.push(box(0.6, 0.15, 0.6, i % 2 ? 0.4 : -0.4, 2.62, -5 + Math.floor(i / 2) * 0.7, DARK));
  return merge(p);
}
/** River boat: small cabin cruiser. */
function riverBoat(): Part {
  return merge([hull(5.5, 1.9, 0.9, '#e8eef4', 0.35), box(1.3, 0.7, 1.8, 0, 1.25, 0.4, '#d23f4a'), box(1.32, 0.3, 0.6, 0, 1.3, -0.4, WIN), box(1.6, 0.1, 1.2, 0, 0.92, 1.9, '#9a7a55')]);
}
/** Gun barge (ground units at sea). */
function barge(): Part {
  return merge([hull(13, 8, 1.6, '#4c5a68', 0.12, 0.95), box(7, 0.3, 11, 0, 1.65, 0, DECK), box(7.2, 0.6, 0.3, 0, 1.9, -5.4, '#c8a23a'), box(7.2, 0.6, 0.3, 0, 1.9, 5.4, '#c8a23a')]);
}
/** Parked jet: fuselage, swept wings folded up at the tips, twin tails, canopy. Nose toward −z. */
function parkedJet(): Part {
  const nose = cyl(0, 0.45, 1.6, 0, 0.55, -2.8, '#c9d3dc', 8, -Math.PI / 2);
  const p: Part[] = [nose, cyl(0.45, 0.5, 4, 0, 0.55, 0, '#c9d3dc', 8, Math.PI / 2), box(0.6, 0.3, 0.9, 0, 0.95, -1.4, '#24394f')];
  for (const s of [-1, 1]) {
    p.push(box(1.6, 0.1, 1.5, s * 1.1, 0.5, 0.4, '#b9c4ce', s * -0.35), box(0.12, 0.9, 0.7, s * 1.95, 0.9, 0.7, '#b9c4ce'));
    p.push(box(0.08, 0.8, 0.8, s * 0.35, 1.1, 1.7, '#9fadba', 0), box(0.9, 0.06, 0.6, s * 0.6, 0.6, 1.8, '#b9c4ce'));
  }
  p.push(box(0.5, 0.35, 0.6, 0, 0.55, 2.2, '#2b2f36'));
  return merge(p);
}
/** Deck tractor and a fuel cart. */
function tractor(): Part { return merge([box(0.9, 0.45, 1.4, 0, 0.3, 0, '#e2c23a'), box(0.7, 0.4, 0.5, 0, 0.7, 0.3, '#2b2f36'), box(0.8, 0.35, 1.2, 0, 0.25, 1.8, '#d8dde2')]); }
/** Carrier island tower for the deck edge: base, bridge windows, mast with a radar bar and dish. */
function island(): Part {
  return merge([box(5, 7, 10, 0, 3.5, 0, LIGHT), box(4, 3, 7, 0, 8.5, -0.5, LIGHT), box(5.1, 0.6, 2, 0, 5.5, -4.2, WIN), box(4.1, 0.6, 1.5, 0, 8.8, -3.6, WIN),
    cyl(0.18, 0.25, 7, 0, 13.5, 0, DARK, 6), box(3.4, 0.15, 0.6, 0, 15.5, 0, DARK), cyl(0.9, 0.9, 0.15, 0, 12.2, 1.4, DARK, 12, Math.PI / 2), box(1.2, 1.2, 1.2, 0, 10.6, 2.5, '#d8dde2')]);
}
/** Broadleaf tree: a trunk and a clumped canopy of lumpy blobs in varied greens (base at y = 0, ~3 units tall). */
function tree(): Part {
  const blob = (r: number, x: number, y: number, z: number, color: string) => { const g = new THREE.IcosahedronGeometry(r, 1); g.translate(x, y, z); return colored(g.toNonIndexed(), color); };
  return merge([cyl(0.12, 0.18, 1.3, 0, 0.65, 0, '#5a4330', 6), blob(0.95, 0, 1.9, 0, '#3f7d4c'), blob(0.7, 0.6, 1.6, 0.3, '#4a8f55'), blob(0.65, -0.55, 1.65, -0.25, '#36703f'), blob(0.6, 0.1, 2.5, -0.2, '#56a061')]);
}
/** V-shaped wake: a foam fan widening and fading behind its source (additive white via vertex colours). */
function wake(): Part {
  const g = new THREE.BufferGeometry(), pos: number[] = [], col: number[] = [], N = 10;
  for (let i = 0; i < N; i++) {
    const z0 = i / N, z1 = (i + 1) / N, w0 = 0.15 + z0 * 0.85, w1 = 0.15 + z1 * 0.85, a0 = (1 - z0) * 0.9, a1 = (1 - z1) * 0.9;
    for (const s of [-1, 1]) { // two arms of the V, each a band
      const q = (x: number, z: number) => [s * x, 0, z * 2];
      const v = [q(w0 - 0.12, z0), q(w0, z0), q(w1, z1), q(w0 - 0.12, z0), q(w1, z1), q(w1 - 0.18, z1)];
      const c = [a0 * 0.5, a0, a1, a0 * 0.5, a1, a1 * 0.5];
      v.forEach((pt, k) => { pos.push(...pt); col.push(c[k], c[k], c[k]); });
    }
    // turbulent centre trail
    const v = [[-0.25 * w0, 0, z0 * 2], [0.25 * w0, 0, z0 * 2], [0.25 * w1, 0, z1 * 2], [-0.25 * w0, 0, z0 * 2], [0.25 * w1, 0, z1 * 2], [-0.25 * w1, 0, z1 * 2]];
    v.forEach((pt, k) => { pos.push(...pt); const a = (k === 2 || k >= 4 ? a1 : a0) * 0.7; col.push(a, a, a); });
  }
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return g;
}
let cache: Record<string, Part> | null = null;
export function kit() {
  cache ??= { tree: tree(), carrier: carrierShip(), battleship: battleship(), destroyer: destroyer(), riverBoat: riverBoat(), barge: barge(), jet: parkedJet(), tractor: tractor(), island: island(), wake: wake() };
  return cache as { tree: Part; carrier: Part; battleship: Part; destroyer: Part; riverBoat: Part; barge: Part; jet: Part; tractor: Part; island: Part; wake: Part };
}
export const isKitGeometry = (g: THREE.BufferGeometry) => !!cache && Object.values(cache).includes(g);

/** Soft cloud-bank texture (drawn once): overlapping noisy puffs with a sunlit top-left and shaded base. */
let cloudTex: THREE.CanvasTexture | null = null;
export function cloudTexture(): THREE.Texture | null {
  if (cloudTex) return cloudTex;
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d')!;
  let seed = 7; const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 70; i++) {
    const a = r() * Math.PI * 2, d = Math.sqrt(r()) * 70, x = 128 + Math.cos(a) * d * 1.3, y = 128 + Math.sin(a) * d * 0.8, rad = 22 + r() * 34;
    const shade = 0.72 + 0.28 * Math.max(0, 1 - (y - 70) / 140) * (0.6 + 0.4 * (1 - (x - 40) / 200));
    const grad = g.createRadialGradient(x - rad * 0.25, y - rad * 0.3, rad * 0.1, x, y, rad);
    const v = Math.round(255 * shade), b = Math.round(255 * Math.min(1, shade + 0.06));
    grad.addColorStop(0, `rgba(${v},${v},${b},0.55)`); grad.addColorStop(1, `rgba(${v},${v},${b},0)`);
    g.fillStyle = grad; g.beginPath(); g.arc(x, y, rad, 0, Math.PI * 2); g.fill();
  }
  cloudTex = new THREE.CanvasTexture(c); cloudTex.colorSpace = THREE.SRGBColorSpace; return cloudTex;
}
