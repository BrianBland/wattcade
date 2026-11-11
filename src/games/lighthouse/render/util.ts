import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

const mats = new Map<string, THREE.MeshLambertMaterial>();
type Detail = 'plain' | 'tiles' | 'planks' | 'stone';
/**
 * Surface detail for flat-coloured props, in world space (works merged and instanced): a faint mottling so big flat
 * faces never read as single-colour triangles; `tiles` adds roof courses, `planks` adds board seams.
 */
export function withDetail<M extends THREE.Material>(m: M, kind: Detail = 'plain'): M {
  m.customProgramCacheKey = () => `lh-detail-${kind}`;
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vDWPos;')
      .replace('#include <project_vertex>', `#include <project_vertex>
        { vec4 lp = vec4(transformed, 1.0);
          #ifdef USE_INSTANCING
          lp = instanceMatrix * lp;
          #endif
          vDWPos = (modelMatrix * lp).xyz; }`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vDWPos;' + NOISE_GLSL)
      .replace('#include <color_fragment>', `#include <color_fragment>
        { vec3 p = vDWPos;
          float n = fbm(p.xz * 1.7 + p.y * 1.3) - 0.5;
          float k = 1.0 + n * 0.1;
          ${kind === 'tiles' ? `
          float row = fract(p.y * 7.0);
          float off = step(0.5, fract(p.y * 3.5)) * 0.5;
          float col = fract((p.x + p.z) * 4.0 + off);
          k *= 1.0 - 0.22 * smoothstep(0.78, 0.95, row) - 0.08 * smoothstep(0.9, 0.98, col) * (1.0 - smoothstep(0.78, 0.95, row));
          k *= 0.94 + 0.12 * hash12(floor(vec2((p.x + p.z) * 4.0 + off, p.y * 7.0)));` : ''}
          ${kind === 'planks' ? `
          float b = fract((p.x * 0.7 + p.z * 0.7) * 3.2);
          k *= 1.0 - 0.18 * smoothstep(0.88, 0.97, b);
          k *= 0.93 + 0.12 * hash12(vec2(floor((p.x * 0.7 + p.z * 0.7) * 3.2), 3.0));` : ''}
          ${kind === 'stone' ? `
          float cy = p.y * 3.2, cr = floor(cy);
          float cx = (p.x + p.z * 0.83) * 2.2 + step(0.5, fract(cr * 0.5)) * 0.5;
          float mort = max(smoothstep(0.86, 0.96, fract(cy)), smoothstep(0.9, 0.98, fract(cx)));
          k *= (1.0 - 0.2 * mort) * (0.9 + 0.16 * hash12(vec2(floor(cx), cr)));` : ''}
          diffuseColor.rgb *= k; }`);
  };
  return m;
}
/** Shared smooth-shaded Lambert material per colour (with world-space surface detail). */
export function lam(color: number | string, kind: Detail = 'plain'): THREE.MeshLambertMaterial {
  const k = `${color}:${kind}`;
  let m = mats.get(k);
  if (!m) { m = withDetail(new THREE.MeshLambertMaterial({ color }), kind); mats.set(k, m); }
  return m;
}
/** Roof material: tile courses. */
export const tiles = (color: number | string) => lam(color, 'tiles');
/** Masonry material: block courses with mortar lines. */
export const stone = (color: number | string) => lam(color, 'stone');
/** Timber material: board seams (decks, piers, sheds). */
export const planks = (color: number | string) => lam(color, 'planks');
export function disposeShared() { for (const m of mats.values()) m.dispose(); mats.clear(); geos.clear(); }

// ---------- smooth primitives ----------
// Round shapes get enough segments that no facet reads as a large triangle; segment counts scale with size.
// Shapes with 4 or fewer sides (pyramid roofs, flags, grass blades) are deliberate and kept as given.
const geos = new Map<string, THREE.BufferGeometry>();
const cached = (k: string, make: () => THREE.BufferGeometry) => { let g = geos.get(k); if (!g) { g = make(); geos.set(k, g); } return g; };
/** Radial segments for a round outline of radius r (8 for twigs, ~40 for the lighthouse base). */
export const roundSegs = (r: number, min = 8) => Math.max(min, Math.min(48, Math.round(10 + r * 14)));
const arcSegs = (n: number, arc: number) => (n <= 4 ? n : Math.max(3, Math.round(n * Math.min(1, arc / (Math.PI * 2)))));
const up = (seg: number | undefined, r: number) => (seg !== undefined && seg <= 4 ? seg : roundSegs(r, seg ?? 8));

export function cyl(rt: number, rb: number, h: number, seg?: number, hseg = 1, open = false, t0 = 0, tl = Math.PI * 2): THREE.CylinderGeometry {
  return new THREE.CylinderGeometry(rt, rb, h, arcSegs(up(seg, Math.max(rt, rb)), tl), hseg, open, t0, tl);
}
export function cone(r: number, h: number, seg?: number, hseg = 1, open = false, t0 = 0, tl = Math.PI * 2): THREE.ConeGeometry {
  return new THREE.ConeGeometry(r, h, arcSegs(up(seg, r), tl), hseg, open, t0, tl);
}
export function sphere(r: number, _w?: number, _h?: number): THREE.SphereGeometry {
  const w = roundSegs(r, 12);
  return new THREE.SphereGeometry(r, w, Math.max(8, Math.round(w * 0.65)));
}
export function torus(R: number, tube: number, _rs?: number, _ts?: number, arc = Math.PI * 2): THREE.TorusGeometry {
  return new THREE.TorusGeometry(R, tube, Math.max(8, roundSegs(tube, 8)), Math.max(12, Math.round(roundSegs(R, 12) * 1.5 * arc / (Math.PI * 2))), arc);
}
export function lathe(pts: THREE.Vector2[], _seg?: number): THREE.LatheGeometry {
  return new THREE.LatheGeometry(pts, roundSegs(Math.max(...pts.map((p) => p.x)), 16));
}

/**
 * Smooth organic blob of radius r: an icosphere gently displaced by seeded noise (foliage, heads, puffs).
 * `lump` 0 is a plain smooth sphere; rocks use ~0.25. Cached per (r, lump, seed, detail): treat as shared.
 */
export function blob(r: number, lump = 0.08, seed = 1, detail = r < 0.3 ? 1 : r < 1.2 ? 2 : 3): THREE.BufferGeometry {
  return cached(`blob:${r}:${lump}:${seed}:${detail}`, () => {
    const g0 = new THREE.IcosahedronGeometry(r, detail);
    g0.deleteAttribute('normal'); g0.deleteAttribute('uv');
    const g = mergeVertices(g0); g0.dispose();
    if (lump > 0) {
      const p = g.attributes.position, v = new THREE.Vector3();
      const s1 = seed * 1.7, s2 = seed * 2.3, s3 = seed * 0.9;
      for (let i = 0; i < p.count; i++) {
        v.fromBufferAttribute(p, i).normalize();
        const n = 0.6 * Math.sin(v.x * 3.1 + s1) * Math.sin(v.y * 2.7 + s2) * Math.sin(v.z * 3.3 + s3)
          + 0.4 * Math.sin(v.x * 7.3 + s2) * Math.sin(v.y * 6.1 + s3) * Math.sin(v.z * 6.7 + s1);
        v.multiplyScalar(r * (1 + lump * n)); p.setXYZ(i, v.x, v.y, v.z);
      }
    }
    g.computeVertexNormals();
    return g;
  });
}
/** Drop-in for the old IcosahedronGeometry(r, 0) blobs: smooth and slightly lumpy. */
export const ico = (r: number, _detail?: number) => blob(r);
/** Weathered rock: a lumpier, slightly flattened blob with smooth normals. */
export const rock = (seed = 1) => blob(1, 0.28, seed, 3);

/** Mesh helper: geometry + material + position, casting shadows by default. */
export function mesh(geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0, cast = true): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = cast; m.receiveShadow = true; return m;
}

/** Small seeded PRNG for cosmetic placement (stable between frames and reloads). */
export function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export const pick = <T>(r: () => number, xs: readonly T[]): T => xs[Math.floor(r() * xs.length) % xs.length];

/** Soft round sprite texture (white, alpha falls off to the edge). */
export function softTexture(size = 64, hard = 0): THREE.Texture {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(Math.max(0.01, hard), 'rgba(255,255,255,0.85)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

/** Pitched roof (ridge along x): a gable prism under two thick overhanging slabs and a ridge cap. */
export function roofGeo(w: number, h: number, d: number): THREE.BufferGeometry {
  return cached(`roof:${w}:${h}:${d}`, () => {
    const s = new THREE.Shape(); s.moveTo(-d / 2 + 0.06, 0); s.lineTo(d / 2 - 0.06, 0); s.lineTo(0, h - 0.06); s.closePath();
    const prism = new THREE.ExtrudeGeometry(s, { depth: w - 0.16, bevelEnabled: false });
    prism.translate(0, 0, -(w - 0.16) / 2); prism.rotateY(Math.PI / 2);
    const t = Math.min(0.1, h * 0.12), L = Math.hypot(d / 2, h), a = Math.atan2(h, d / 2);
    const parts: THREE.BufferGeometry[] = [prism];
    for (const side of [-1, 1]) {
      const slab = new RoundedBoxGeometry(w, t, L + 0.12, 1, t * 0.45);
      slab.rotateX(side * a);
      // centre of the slope, nudged out along its normal so the slab sits on the prism
      slab.translate(0, h / 2 + Math.cos(a) * t / 2, side * (d / 4) + side * Math.sin(a) * t / 2);
      parts.push(slab);
    }
    const ridge = new THREE.CylinderGeometry(t * 0.9, t * 0.9, w + 0.04, 10); ridge.rotateZ(Math.PI / 2); ridge.translate(0, h + t * 0.3, 0);
    parts.push(ridge);
    for (const p of parts) { p.deleteAttribute('uv'); }
    const g = mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p)))!;
    return g;
  });
}
/** Box with softly rounded edges (cached); thin boards and tiny parts stay plain boxes. */
export function box(w: number, h: number, d: number): THREE.BufferGeometry {
  const m = Math.min(w, h, d);
  if (m < 0.12) return cached(`b:${w}:${h}:${d}`, () => new THREE.BoxGeometry(w, h, d));
  return cached(`rb:${w}:${h}:${d}`, () => new RoundedBoxGeometry(w, h, d, 2, Math.min(0.08, m * 0.18)));
}
/** Capsule (limbs): radius r, straight length len, centred. */
export const capsule = (r: number, len: number) => cached(`cap:${r}:${len}`, () => new THREE.CapsuleGeometry(r, len, 4, 10));

/**
 * Merge every static mesh under `root` into one mesh per material (fewer draw calls on iPad).
 * Meshes for which `keep` returns true (or that sit under a kept object) are left alone, e.g. animated parts.
 */
export function mergeStatic(root: THREE.Object3D, keep: (o: THREE.Object3D) => boolean = () => false): void {
  root.updateMatrixWorld(true);
  const inv = root.matrixWorld.clone().invert();
  const byMat = new Map<THREE.Material, { geos: THREE.BufferGeometry[]; cast: boolean }>();
  const drop: THREE.Mesh[] = [];
  const m4 = new THREE.Matrix4();
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || m === root || (m as unknown as THREE.InstancedMesh).isInstancedMesh || Array.isArray(m.material)) return;
    for (let p: THREE.Object3D | null = m; p && p !== root; p = p.parent) if (keep(p)) return;
    const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
    if (!g.attributes.normal) g.computeVertexNormals();
    g.applyMatrix4(m4.multiplyMatrices(inv, m.matrixWorld));
    const e = byMat.get(m.material) ?? { geos: [], cast: false };
    e.geos.push(g); e.cast ||= m.castShadow; byMat.set(m.material, e);
    drop.push(m);
  });
  for (const m of drop) m.parent?.remove(m);
  for (const [mat, e] of byMat) {
    const merged = mergeGeometries(e.geos, false);
    for (const g of e.geos) g.dispose();
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, mat); mesh.castShadow = e.cast; mesh.receiveShadow = true;
    root.add(mesh);
  }
}

/** Shared GLSL value noise (world-space surface detail; cheap enough for iPad). */
export const NOISE_GLSL = `
  float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
  float vnoise(vec2 p) { vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash12(i), hash12(i + vec2(1, 0)), u.x), mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), u.x), u.y); }
  float fbm(vec2 p) { return 0.5 * vnoise(p) + 0.3 * vnoise(p * 2.03 + 17.1) + 0.2 * vnoise(p * 4.11 + 41.7); }`;
