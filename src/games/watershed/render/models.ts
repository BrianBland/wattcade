// Organic low-cost models for Watershed: smooth, slightly irregular shapes with baked vertex-colour gradients, plus
// shader patches for wind sway (trees) and swimming undulation (salmon). No textures; everything is procedural.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const h3 = (x: number, y: number, z: number) => {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return s - Math.floor(s);
};
/** Smooth-ish 3D value noise in [−1, 1] for displacing vertices. */
function noise3(x: number, y: number, z: number): number {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  const fx = x - ix, fy = y - iy, fz = z - iz;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy), w = fz * fz * (3 - 2 * fz);
  const L = (a: number, b: number, t: number) => a + (b - a) * t;
  const c = (dx: number, dy: number, dz: number) => h3(ix + dx, iy + dy, iz + dz);
  return L(L(L(c(0, 0, 0), c(1, 0, 0), u), L(c(0, 1, 0), c(1, 1, 0), u), v), L(L(c(0, 0, 1), c(1, 0, 1), u), L(c(0, 1, 1), c(1, 1, 1), u), v), w) * 2 - 1;
}

/** Displace along the normal by noise, then bake a vertical colour gradient (lo → hi over y0..y1). */
function organic(g: THREE.BufferGeometry, amp: number, freq: number, lo: THREE.Color, hi: THREE.Color, y0: number, y1: number, seed = 0): THREE.BufferGeometry {
  g = g.index ? g.toNonIndexed() : g;
  g.computeVertexNormals();
  const p = g.getAttribute('position') as THREE.BufferAttribute, n = g.getAttribute('normal') as THREE.BufferAttribute;
  const col = new Float32Array(p.count * 3), c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const d = noise3(x * freq + seed, y * freq, z * freq) * amp;
    p.setXYZ(i, x + n.getX(i) * d, y + n.getY(i) * d, z + n.getZ(i) * d);
    c.copy(lo).lerp(hi, Math.min(1, Math.max(0, (y - y0) / (y1 - y0))));
    const jitter = 0.94 + 0.12 * h3(x * 3, y * 3, z * 3);
    col.set([c.r * jitter, c.g * jitter, c.b * jitter], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  // smooth normals by position, so displaced seams between faces stay smooth
  g.deleteAttribute('normal');
  return smoothNormals(g);
}
function smoothNormals(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  const key = (i: number) => `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`;
  const acc = new Map<string, THREE.Vector3>(), a = new THREE.Vector3(), b = new THREE.Vector3(), cc = new THREE.Vector3();
  for (let i = 0; i < p.count; i += 3) {
    a.fromBufferAttribute(p, i); b.fromBufferAttribute(p, i + 1); cc.fromBufferAttribute(p, i + 2);
    const fn = new THREE.Vector3().subVectors(cc, b).cross(new THREE.Vector3().subVectors(a, b));
    for (let k = 0; k < 3; k++) { const kk = key(i + k); const v = acc.get(kk) ?? new THREE.Vector3(); v.add(fn); acc.set(kk, v); }
  }
  const nor = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) { const v = acc.get(key(i))!.clone().normalize(); nor.set([v.x, v.y, v.z], i * 3); }
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  return g;
}

// ---------- flora ----------
const PINE_LO = new THREE.Color(0x1d4a2a), PINE_HI = new THREE.Color(0x4f8f4a);
export function pineGeometry(): THREE.BufferGeometry {
  const tiers = [[1.25, 1.6, 1.0], [1.0, 1.4, 1.9], [0.72, 1.25, 2.7], [0.42, 1.0, 3.4]].map(([r, hgt, y]) => {
    const c = new THREE.ConeGeometry(r, hgt, 9, 2, true); c.translate(0, y, 0); return c;
  });
  return organic(mergeGeometries(tiers)!, 0.09, 2.2, PINE_LO, PINE_HI, 0.6, 3.8);
}
const LEAF_LO = new THREE.Color(0x2f5e25), LEAF_HI = new THREE.Color(0x8cbc4e);
export function broadleafGeometry(): THREE.BufferGeometry {
  const lobes = [[0, 2.3, 0, 1.15], [0.6, 2.0, 0.3, 0.8], [-0.55, 2.1, -0.25, 0.85], [0.1, 2.85, -0.1, 0.75]].map(([x, y, z, r]) => {
    const s = new THREE.IcosahedronGeometry(r, 3); s.translate(x, y, z); return s;
  });
  return organic(mergeGeometries(lobes)!, 0.16, 1.6, LEAF_LO, LEAF_HI, 1.3, 3.4, 5);
}
export function trunkGeometry(): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(0.13, 0.24, 1.6, 7); g.translate(0, 0.8, 0);
  return organic(g, 0.03, 3, new THREE.Color(0x3e2a1a), new THREE.Color(0x6b4a2f), 0, 1.6, 9);
}
export function boulderGeometry(): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(1, 3); g.scale(1, 0.62, 0.9);
  return organic(g, 0.22, 1.3, new THREE.Color(0x6e6a63), new THREE.Color(0xa8a196), -0.6, 0.6, 3);
}

/** Wind sway for instanced trees: bends the crown with height, phase from the instance's world position. */
export function swayMaterial(mat: THREE.MeshStandardMaterial, time: { value: number }, amount = 0.07): THREE.MeshStandardMaterial {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uWind = time;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uWind;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
      #ifdef USE_INSTANCING
        vec3 ip = instanceMatrix[3].xyz;
      #else
        vec3 ip = vec3(0.0);
      #endif
      float sw = sin(uWind * 1.4 + ip.x * 0.31 + ip.z * 0.23) + 0.4 * sin(uWind * 3.1 + ip.x * 0.7);
      float bend = ${amount.toFixed(3)} * max(0.0, position.y - 0.6) * max(0.0, position.y - 0.6);
      transformed.x += sw * bend; transformed.z += sw * bend * 0.45;`);
  };
  return mat;
}

// ---------- fauna ----------
/** Sockeye in spawning colours: red body, olive-green head, pale belly; nose +X, length ~2. */
export function salmonGeometry(): THREE.BufferGeometry {
  const prof = [[0, 1.0], [0.1, 0.94], [0.2, 0.75], [0.27, 0.45], [0.28, 0.1], [0.24, -0.25], [0.16, -0.55], [0.08, -0.8], [0.05, -0.9]].map(([r, y]) => new THREE.Vector2(r, y));
  const body = new THREE.LatheGeometry(prof, 12);
  body.rotateZ(-Math.PI / 2); body.scale(1, 1, 0.55);
  const tail = new THREE.ShapeGeometry(new THREE.Shape([new THREE.Vector2(-0.85, 0), new THREE.Vector2(-1.3, 0.34), new THREE.Vector2(-1.18, 0), new THREE.Vector2(-1.3, -0.34)]));
  const dorsal = new THREE.ShapeGeometry(new THREE.Shape([new THREE.Vector2(0.15, 0.26), new THREE.Vector2(-0.25, 0.48), new THREE.Vector2(-0.3, 0.22)]));
  const parts = [body, tail, dorsal].map((g) => (g.index ? g.toNonIndexed() : g));
  for (const g of parts) { g.deleteAttribute('uv'); g.deleteAttribute('normal'); }
  const g = mergeGeometries(parts)!;
  const p = g.getAttribute('position') as THREE.BufferAttribute, col = new Float32Array(p.count * 3), c = new THREE.Color();
  const red = new THREE.Color(0xd8322a), head = new THREE.Color(0x4f6a2c), belly = new THREE.Color(0xf0d0c0), fin = new THREE.Color(0x8a2a22);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    if (x < -0.84 || y > 0.25) c.copy(fin);
    else { c.copy(red).lerp(head, Math.min(1, Math.max(0, (x - 0.45) / 0.25))); c.lerp(belly, Math.min(1, Math.max(0, (-y - 0.02) / 0.2)) * 0.8); }
    void z;
    col.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return smoothNormals(g);
}
/** Swimming undulation: a travelling sideways wave that grows toward the tail, phased per instance. */
export function swimMaterial(mat: THREE.MeshStandardMaterial, time: { value: number }): THREE.MeshStandardMaterial {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uSwim = time;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uSwim;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
      float tailw = clamp(0.5 - position.x, 0.0, 2.0);
      transformed.z += sin(uSwim * 9.0 + float(gl_InstanceID) * 1.7 + position.x * 2.2) * 0.045 * tailw * tailw;`);
  };
  return mat;
}

const fur = (c: number) => new THREE.MeshStandardMaterial({ color: c, roughness: 1 });
/** A rounded brown bear standing on all fours, facing +X; the front-right paw is named 'paw' (it swipes). */
export function bearModel(): THREE.Group {
  const g = new THREE.Group(), coat = fur(0x5b3a22), dark = fur(0x3a2414), muzzle = fur(0xa07a54), black = fur(0x111111);
  const mk = (geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, name = '') => {
    const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; o.name = name; g.add(o); return o;
  };
  const body = new THREE.SphereGeometry(1, 20, 14); body.scale(1.45, 0.95, 0.9);
  mk(organic(body, 0.06, 2.5, new THREE.Color(0x4a2f1c), new THREE.Color(0x6a4428), -0.9, 0.9), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }), 0, 1.55, 0);
  const hump = new THREE.SphereGeometry(0.62, 16, 12); mk(hump, coat, 0.65, 2.25, 0);
  mk(new THREE.SphereGeometry(0.58, 18, 14), coat, 1.65, 2.05, 0);
  const snout = new THREE.CapsuleGeometry(0.22, 0.35, 6, 10); snout.rotateZ(Math.PI / 2); mk(snout, muzzle, 2.2, 1.92, 0);
  mk(new THREE.SphereGeometry(0.09, 10, 8), black, 2.55, 1.98, 0);
  for (const z of [0.36, -0.36]) mk(new THREE.SphereGeometry(0.16, 10, 8), dark, 1.55, 2.6, z);
  for (const z of [0.3, -0.3]) mk(new THREE.SphereGeometry(0.06, 8, 6), black, 2.05, 2.2, z);
  const leg = new THREE.CapsuleGeometry(0.26, 0.85, 6, 10);
  for (const [x, z] of [[0.95, 0.5], [-0.95, 0.5], [-0.95, -0.5]]) mk(leg, dark, x, 0.65, z);
  mk(leg, dark, 0.95, 0.65, -0.5, 'paw');
  return g;
}

/** A bald eagle: dark body, white head and tail, yellow beak, fingered wings named 'wl'/'wr' (they flap). Faces +X. */
export function eagleModel(): THREE.Group {
  const g = new THREE.Group();
  const brown = new THREE.MeshStandardMaterial({ color: 0x3b2716, roughness: 0.9, side: THREE.DoubleSide });
  const white = new THREE.MeshStandardMaterial({ color: 0xf3f0e6, roughness: 0.8, side: THREE.DoubleSide });
  const yellow = new THREE.MeshStandardMaterial({ color: 0xf2b630, roughness: 0.6 });
  const add = (o: THREE.Mesh) => { o.castShadow = true; g.add(o); return o; };
  const body = new THREE.CapsuleGeometry(0.28, 0.9, 6, 12); body.rotateZ(Math.PI / 2); add(new THREE.Mesh(body, brown));
  add(new THREE.Mesh(new THREE.SphereGeometry(0.26, 14, 10), white)).position.set(0.68, 0.08, 0);
  const beak = new THREE.ConeGeometry(0.09, 0.26, 8); beak.rotateZ(-Math.PI / 2); add(new THREE.Mesh(beak, yellow)).position.set(0.95, 0.04, 0);
  const tail = new THREE.ShapeGeometry(new THREE.Shape([new THREE.Vector2(0, 0.18), new THREE.Vector2(-0.6, 0.32), new THREE.Vector2(-0.66, 0), new THREE.Vector2(-0.6, -0.32), new THREE.Vector2(0, -0.18)]));
  tail.rotateX(Math.PI / 2); add(new THREE.Mesh(tail, white)).position.set(-0.6, 0, 0);
  const wingShape = (side: 1 | -1) => {
    const pts: THREE.Vector2[] = [new THREE.Vector2(0.3, 0), new THREE.Vector2(0.35, 1.2), new THREE.Vector2(0.15, 2.4)];
    // primary feathers: fingers along the tip
    for (let k = 0; k < 5; k++) { const z = 2.4 + k * 0.12; pts.push(new THREE.Vector2(0.1 - k * 0.12, z + 0.35), new THREE.Vector2(0.02 - k * 0.12, z)); }
    pts.push(new THREE.Vector2(-0.5, 2.2), new THREE.Vector2(-0.45, 1.1), new THREE.Vector2(-0.3, 0));
    const geo = new THREE.ShapeGeometry(new THREE.Shape(pts.map((p) => new THREE.Vector2(p.x, p.y * side))));
    geo.rotateX(Math.PI / 2);
    const m = add(new THREE.Mesh(geo, brown)); m.name = side > 0 ? 'wl' : 'wr';
    return m;
  };
  wingShape(1); wingShape(-1);
  return g;
}
