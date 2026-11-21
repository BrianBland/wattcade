// Watershed flora and stone, second generation: crisp shapes instead of noise-displaced blobs.
// - Pines: stacked star-shaped skirts (jagged drooping tips, a concave underside), lighter needle tips, dark notches.
// - Broadleaf: a crown built from a dozen leaf clumps around a core, darker inside and below.
// - Rocks: chunks cut by random planes (flat faces, sharp edges), mossy on top.
// Shading does the fine detail per pixel: foliage gets a 3D cellular "leaf cluster" pattern that bumps the normal per
// cluster (so each cluster catches the sun) and darkens the gaps; rock gets grain, strata, cracks and lichen.
// No textures; everything is procedural and instanced.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { noise3 } from './models';

const h1 = (n: number) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };

/** Bake per-vertex colours with `fn(x, y, z, nx, ny, nz)` (normals must exist). */
function bake(g: THREE.BufferGeometry, fn: (p: THREE.Vector3, n: THREE.Vector3, out: THREE.Color) => void): THREE.BufferGeometry {
  const P = g.getAttribute('position') as THREE.BufferAttribute, N = g.getAttribute('normal') as THREE.BufferAttribute;
  const col = new Float32Array(P.count * 3), p = new THREE.Vector3(), n = new THREE.Vector3(), c = new THREE.Color();
  for (let i = 0; i < P.count; i++) { p.fromBufferAttribute(P, i); n.fromBufferAttribute(N, i); fn(p, n, c); col.set([c.r, c.g, c.b], i * 3); }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

// ---------- pine ----------
const PINE = { tip: new THREE.Color(0x7fb25a), top: new THREE.Color(0x3f7a3c), base: new THREE.Color(0x1f4d2c), under: new THREE.Color(0x10281a) };

/** One skirt: apex, a bulging mid ring and a jagged rim of 2N points (tips droop), closed by a concave underside. */
function skirt(R: number, H: number, yBase: number, N: number, seed: number): THREE.BufferGeometry {
  const pos: number[] = [], idx: number[] = [], kind: number[] = [];   // kind: 0 apex, 1 mid, 2 tip, 3 notch, 4 under
  const apex = yBase + H, tw = h1(seed) * Math.PI;
  pos.push(0, apex, 0); kind.push(0);
  const M = N * 2;
  for (let k = 0; k < M; k++) {
    const tip = k % 2 === 0, a = tw + (k / M) * Math.PI * 2 + (h1(seed + k) - 0.5) * 0.12;
    const r = R * (tip ? 1 + (h1(seed + k * 3) - 0.5) * 0.16 : 0.66);
    pos.push(Math.cos(a) * r * 0.56, yBase + H * 0.5 + (tip ? -0.02 : 0.03) * H, Math.sin(a) * r * 0.56); kind.push(1);
    pos.push(Math.cos(a) * r, yBase - (tip ? 0.16 * H : 0.02 * H), Math.sin(a) * r); kind.push(tip ? 2 : 3);
  }
  pos.push(0, yBase + H * 0.28, 0); kind.push(4);
  const mid = (k: number) => 1 + (k % M) * 2, rim = (k: number) => 2 + (k % M) * 2, under = 1 + M * 2;
  for (let k = 0; k < M; k++) {
    idx.push(0, mid(k + 1), mid(k));
    idx.push(mid(k), mid(k + 1), rim(k)); idx.push(mid(k + 1), rim(k + 1), rim(k));
    idx.push(under, rim(k), rim(k + 1));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
  g.computeVertexNormals();
  const col = new Float32Array(kind.length * 3), c = new THREE.Color();
  kind.forEach((k, i) => {
    if (k === 0) c.copy(PINE.top).lerp(PINE.tip, 0.35);
    else if (k === 1) c.copy(PINE.top);
    else if (k === 2) c.copy(PINE.base).lerp(PINE.tip, 0.55);
    else if (k === 3) c.copy(PINE.base).multiplyScalar(0.75);
    else c.copy(PINE.under);
    col.set([c.r, c.g, c.b], i * 3);
  });
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g.toNonIndexed();
}

/** A conifer about 4 tall (crown from y ≈ 0.6), same footprint as the old pine so placement is unchanged. */
export function pineGeometry2(lod = 0): THREE.BufferGeometry {
  const tiers = lod ? [[1.3, 1.5, 0.55], [0.95, 1.35, 1.55], [0.55, 1.35, 2.55]] : [[1.32, 1.25, 0.5], [1.08, 1.15, 1.25], [0.84, 1.1, 1.98], [0.58, 1.05, 2.68], [0.32, 1.0, 3.3]];
  return mergeGeometries(tiers.map(([r, h, y], k) => skirt(r, h, y, lod ? 6 : 8, k * 17 + 3)))!;
}

// ---------- broadleaf ----------
const LEAF = { light: new THREE.Color(0x9ccc5a), mid: new THREE.Color(0x5a9a34), dark: new THREE.Color(0x24501e) };

/** A rounded crown of leaf clumps around a core, centred near y = 2.3 (same footprint as the old broadleaf). */
export function broadleafGeometry2(lod = 0): THREE.BufferGeometry {
  const C = new THREE.Vector3(0, 2.3, 0), RX = 1.15, RY = 0.95;
  const parts: THREE.BufferGeometry[] = [];
  const core = new THREE.IcosahedronGeometry(0.95, lod ? 0 : 1); core.scale(1.05, 0.85, 1.05); core.translate(C.x, C.y - 0.05, C.z);
  parts.push(core);
  const n = lod ? 6 : 11;
  for (let k = 0; k < n; k++) {
    // Fibonacci points on the upper ~80% of an ellipsoid
    const y = 1 - (k + 0.5) / n * 1.6, r = Math.sqrt(Math.max(0, 1 - y * y)), a = k * 2.399963 + 0.3;
    const s = (lod ? 0.62 : 0.5) + h1(k * 7 + 1) * 0.16;
    const g = new THREE.IcosahedronGeometry(s, lod ? 0 : 1);
    g.scale(1, 0.85, 1);
    g.translate(C.x + Math.cos(a) * r * RX * 0.92, C.y + y * RY * 0.9, C.z + Math.sin(a) * r * RX * 0.92);
    parts.push(g);
  }
  const m = mergeGeometries(parts.map((p) => p.toNonIndexed()))!;
  // per-vertex jitter so clump spheres aren't perfect, then smooth normals within each clump
  const P = m.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < P.count; i++) {
    const x = P.getX(i), y = P.getY(i), z = P.getZ(i), d = noise3(x * 2.2, y * 2.2, z * 2.2) * 0.07;
    P.setXYZ(i, x * (1 + d), y + d * 0.5, z * (1 + d));
  }
  m.computeVertexNormals();
  return bake(m, (p, nn, c) => {
    // light on top and outside, dark under and inside the crown
    const up = Math.max(0, Math.min(1, (p.y - (C.y - 0.9)) / 1.9));
    const out = Math.min(1, Math.hypot(p.x, (p.y - C.y) * 1.2, p.z) / 1.3);
    c.copy(LEAF.dark).lerp(LEAF.mid, Math.min(1, up * 1.1)).lerp(LEAF.light, Math.max(0, up - 0.55) * 1.4 * out);
    c.multiplyScalar(0.7 + 0.3 * out + 0.08 * Math.max(0, nn.y));
  });
}

/** A slightly gnarled trunk with a root flare and a first fork into the crown. */
export function trunkGeometry2(): THREE.BufferGeometry {
  const prof = [[0.3, 0], [0.2, 0.15], [0.15, 0.6], [0.13, 1.3], [0.1, 1.75]].map(([r, y]) => new THREE.Vector2(r, y));
  const t = new THREE.LatheGeometry(prof, 7);
  const f1 = new THREE.CylinderGeometry(0.05, 0.08, 0.7, 5); f1.translate(0, 0.35, 0); f1.rotateZ(0.6); f1.translate(0.05, 1.35, 0);
  const f2 = new THREE.CylinderGeometry(0.05, 0.08, 0.6, 5); f2.translate(0, 0.3, 0); f2.rotateZ(-0.55); f2.rotateY(1.9); f2.translate(-0.03, 1.45, 0.02);
  const m = mergeGeometries([t.toNonIndexed(), f1.toNonIndexed(), f2.toNonIndexed()].map((g) => { g.deleteAttribute('uv'); return g; }))!;
  m.computeVertexNormals();
  return bake(m, (p, _n, c) => c.setRGB(0.16, 0.1, 0.06).lerp(new THREE.Color(0x6e5038), Math.min(1, p.y / 1.4)).multiplyScalar(0.9 + 0.2 * h1(Math.round(p.x * 40 + p.z * 70))));
}

// ---------- rock ----------
const ROCK = { lo: new THREE.Color(0x726a60), hi: new THREE.Color(0xb0a696), moss: new THREE.Color(0x5f7a3a) };

/** A stone chunk: an icosphere cut by random planes (flat faces, sharp edges), flattened, mossy on its upper faces. */
export function rockGeometry(seed = 3, detail = 2): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(1, detail);
  const P = g.getAttribute('position') as THREE.BufferAttribute, v = new THREE.Vector3();
  const planes: Array<[THREE.Vector3, number]> = [];
  for (let k = 0; k < 9; k++) {
    const a = h1(seed * 31 + k) * Math.PI * 2, b = Math.acos(1 - 2 * h1(seed * 53 + k * 7)) * (k < 2 ? 0.25 : 1);
    planes.push([new THREE.Vector3(Math.sin(b) * Math.cos(a), Math.cos(b), Math.sin(b) * Math.sin(a)), 0.6 + h1(seed * 11 + k) * 0.25]);
  }
  for (let i = 0; i < P.count; i++) {
    v.fromBufferAttribute(P, i);
    for (const [n, d] of planes) { const t = v.dot(n); if (t > d) v.addScaledVector(n, d - t); }
    v.multiplyScalar(1 + noise3(v.x * 2 + seed, v.y * 2, v.z * 2) * 0.05);
    P.setXYZ(i, v.x * 1.1, v.y * 0.68, v.z * 0.92);
  }
  const f = g.toNonIndexed(); f.deleteAttribute('uv');
  f.computeVertexNormals();   // non-indexed: flat faces
  return bake(f, (p, n, c) => {
    c.copy(ROCK.lo).lerp(ROCK.hi, Math.min(1, Math.max(0, (p.y + 0.6) / 1.1)));
    if (n.y > 0.55) c.lerp(ROCK.moss, Math.min(0.75, (n.y - 0.55) * 2.2) * (0.6 + 0.4 * h1(Math.round(p.x * 9 + p.z * 13))));
  });
}

/** Several rock variants merged side by side would break instancing; pick one per mesh via `seed`. */
export function pebbleGeometry2(): THREE.BufferGeometry {
  const g = rockGeometry(7, 1); g.scale(0.26, 0.26, 0.26); return g;
}

// ---------- shading ----------
const NOISE3 = /* glsl */ `
vec3 flHash3(vec3 p) { p = fract(p * vec3(0.1031, 0.1030, 0.0973)); p += dot(p, p.yxz + 33.33); return fract((p.xxy + p.yxx) * p.zyx); }
float flN3(vec3 p) {
  vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  float a = flHash3(i).x, b = flHash3(i + vec3(1,0,0)).x, c = flHash3(i + vec3(0,1,0)).x, d = flHash3(i + vec3(1,1,0)).x;
  float e = flHash3(i + vec3(0,0,1)).x, g = flHash3(i + vec3(1,0,1)).x, h = flHash3(i + vec3(0,1,1)).x, k = flHash3(i + vec3(1,1,1)).x;
  return mix(mix(mix(a, b, f.x), mix(c, d, f.x), f.y), mix(mix(e, g, f.x), mix(h, k, f.x), f.y), f.z);
}
// cellular over the 2×2×2 nearest cells (features jittered ±0.5, so the nearest one is always among them):
// returns F1, with F2, the offset to the nearest feature and its id
float flCell(vec3 p, out vec3 off, out float f2, out float id) {
  vec3 b = floor(p - 0.5), f = p - b; float f1 = 9.0; f2 = 9.0; off = vec3(0.0); id = 0.0;
  for (int z = 0; z <= 1; z++) for (int y = 0; y <= 1; y++) for (int x = 0; x <= 1; x++) {
    vec3 o = vec3(float(x), float(y), float(z)), h = flHash3(b + o);
    vec3 r = o + 0.25 + h * 0.5 - f; float d = dot(r, r);
    if (d < f1) { f2 = f1; f1 = d; off = -r; id = h.z; } else if (d < f2) f2 = d;
  }
  f2 = sqrt(f2); return sqrt(f1);
}
`;

/**
 * Foliage material: wind sway (as models.ts#swayMaterial) plus per-pixel leaf clusters. `freq` scales the cluster
 * size (object space), `stretch` squashes it per axis (pines: flatter needle clumps), `bump` is how hard each cluster
 * bulges toward the light.
 */
export function foliageMaterial(time: { value: number }, o: { amount?: number; base?: number; freq?: number; stretch?: [number, number, number]; bump?: number; tint?: number } = {}): THREE.MeshStandardMaterial {
  const amount = o.amount ?? 0.07, base = o.base ?? 0.6, freq = o.freq ?? 3.2, st = o.stretch ?? [1, 1, 1], bump = o.bump ?? 0.9;
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82 });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uWind = time;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uWind; varying vec3 vLeafP;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
      vLeafP = position;
      #ifdef USE_INSTANCING
        vec3 ip = instanceMatrix[3].xyz; vLeafP += ip * 0.37;
      #else
        vec3 ip = vec3(0.0);
      #endif
      float sw = sin(uWind * 1.4 + ip.x * 0.31 + ip.z * 0.23) + 0.4 * sin(uWind * 3.1 + ip.x * 0.7);
      float bend = ${amount.toFixed(3)} * max(0.0, position.y - ${base.toFixed(3)}) * max(0.0, position.y - ${base.toFixed(3)});
      transformed.x += sw * bend; transformed.z += sw * bend * 0.45;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vLeafP;\n${NOISE3}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
      vec3 lfOff; float lfF2, lfId;
      float lfF1 = flCell(vLeafP * vec3(${(freq * st[0]).toFixed(3)}, ${(freq * st[1]).toFixed(3)}, ${(freq * st[2]).toFixed(3)}), lfOff, lfF2, lfId);
      float lfGap = 1.0 - smoothstep(0.0, 0.35, lfF2 - lfF1);
      diffuseColor.rgb *= (0.84 + 0.32 * lfId) * (1.0 - 0.2 * lfGap * lfGap) * (0.8 + 0.25 * smoothstep(0.7, 0.0, lfF1));
      diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.12, 1.1, 0.8), smoothstep(0.75, 1.0, lfId) * 0.6);
      diffuseColor.rgb *= 0.86 + 0.28 * flN3(vLeafP * 17.0);`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
      {
        vec3 bo = normalize(lfOff + vec3(0.0, 0.25, 0.0));
        normal = normalize(normal + (viewMatrix * vec4(bo, 0.0)).xyz * ${bump.toFixed(3)} * (1.0 - lfGap * 0.5));
      }`);
  };
  return mat;
}

/** Rock material: flat faces from the geometry, plus grain, strata, cracks and lichen per pixel (object space). */
export function rockMaterial(): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92 });
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vRockP;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
      vRockP = position * 1.0;
      #ifdef USE_INSTANCING
        vRockP += instanceMatrix[3].xyz * 0.53;
      #endif`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vRockP;\n${NOISE3}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
      {
        vec3 p = vRockP;
        float g = flN3(p * 9.0) * 0.6 + flN3(p * 23.0) * 0.4;
        float strata = 0.5 + 0.5 * sin(p.y * 13.0 + flN3(p * 3.0) * 4.0);
        vec3 off; float f2, id; float f1 = flCell(p * 1.7, off, f2, id);
        float crack = (1.0 - smoothstep(0.0, 0.035, f2 - f1)) * step(0.45, id);
        float lichen = smoothstep(0.7, 0.76, flN3(p * 7.0 + 3.1)) * 0.35;
        vec3 c = diffuseColor.rgb * (0.8 + 0.35 * g) * (0.92 + 0.12 * strata);
        c = mix(c, vec3(0.78, 0.74, 0.52), lichen);
        diffuseColor.rgb = c * (1.0 - 0.35 * crack);
      }`);
  };
  return mat;
}
