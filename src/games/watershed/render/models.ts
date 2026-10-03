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
export function swayMaterial(mat: THREE.MeshStandardMaterial, time: { value: number }, amount = 0.07, base = 0.6): THREE.MeshStandardMaterial {
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
      float bend = ${amount.toFixed(3)} * max(0.0, position.y - ${base.toFixed(3)}) * max(0.0, position.y - ${base.toFixed(3)});
      transformed.x += sw * bend; transformed.z += sw * bend * 0.45;`);
  };
  return mat;
}

// ---------- helpers for merged, vertex-coloured models ----------
/** Non-indexed copy of `g` with every vertex painted `color` (so parts can be merged into one instanced mesh). */
function paint(g: THREE.BufferGeometry, color: number | THREE.Color): THREE.BufferGeometry {
  const n = g.index ? g.toNonIndexed() : g.clone();
  n.deleteAttribute('uv');
  if (!n.getAttribute('normal')) n.computeVertexNormals();
  const c = color instanceof THREE.Color ? color : new THREE.Color(color), p = n.getAttribute('position') as THREE.BufferAttribute;
  const col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) col.set([c.r, c.g, c.b], i * 3);
  n.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return n;
}
const at = (g: THREE.BufferGeometry, x: number, y: number, z: number) => { g.translate(x, y, z); return g; };
/** A cartoon eye: white ball, black pupil looking outward along +z (mirror with side = −1), tiny highlight. */
function eye(r: number, x: number, y: number, z: number, side: 1 | -1, look = new THREE.Vector3(0.35, 0.1, 1)): THREE.BufferGeometry[] {
  const d = look.clone().setZ(look.z * side).normalize();
  const white = at(new THREE.SphereGeometry(r, 14, 10), x, y, z);
  const pupil = at(new THREE.SphereGeometry(r * 0.55, 12, 8), x + d.x * r * 0.62, y + d.y * r * 0.62, z + d.z * r * 0.62);
  const glint = at(new THREE.SphereGeometry(r * 0.18, 8, 6), x + d.x * r * 0.75 + r * 0.2, y + d.y * r * 0.75 + r * 0.3, z + d.z * r * 0.92);
  return [paint(white, 0xffffff), paint(pupil, 0x111111), paint(glint, 0xffffff)];
}
const merged = (parts: THREE.BufferGeometry[]) => mergeGeometries(parts.map((g) => { const n = g.index ? g.toNonIndexed() : g; if (n.getAttribute('uv')) n.deleteAttribute('uv'); return n; }))!;

// ---------- fauna (cartoon, colourful) ----------
/** Sockeye in spawning colours: bright red body, green head, pale belly, googly eyes; nose +X, length ~2. */
export function salmonGeometry(): THREE.BufferGeometry {
  const prof = [[0, 1.0], [0.12, 0.94], [0.22, 0.75], [0.29, 0.45], [0.3, 0.1], [0.25, -0.25], [0.16, -0.55], [0.08, -0.8], [0.05, -0.9]].map(([r, y]) => new THREE.Vector2(r, y));
  const body = new THREE.LatheGeometry(prof, 14);
  body.rotateZ(-Math.PI / 2); body.scale(1, 1, 0.6);
  body.deleteAttribute('uv'); body.deleteAttribute('normal');
  const b = body.toNonIndexed(), p = b.getAttribute('position') as THREE.BufferAttribute, col = new Float32Array(p.count * 3), c = new THREE.Color();
  const red = new THREE.Color(0xff3b2f), head = new THREE.Color(0x4caf3c), belly = new THREE.Color(0xffe3d0);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i);
    c.copy(red).lerp(head, Math.min(1, Math.max(0, (x - 0.42) / 0.18)));
    c.lerp(belly, Math.min(1, Math.max(0, (-y - 0.02) / 0.18)) * 0.85);
    col.set([c.r, c.g, c.b], i * 3);
  }
  b.setAttribute('color', new THREE.BufferAttribute(col, 3));
  smoothNormals(b);
  const fin = (pts: number[][]) => paint(new THREE.ShapeGeometry(new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)))), 0xc0221c);
  return merged([
    b,
    fin([[-0.84, 0], [-1.32, 0.38], [-1.18, 0], [-1.32, -0.38]]),
    fin([[0.15, 0.27], [-0.25, 0.52], [-0.32, 0.22]]),
    ...eye(0.11, 0.66, 0.08, 0.12, 1), ...eye(0.11, 0.66, 0.08, -0.12, -1),
  ]);
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

const toon = (c: number, rough = 0.8) => new THREE.MeshStandardMaterial({ color: c, roughness: rough });
/** A chunky cartoon bear standing on all fours, facing +X; the front-right leg is named 'paw' (it swipes). */
export function bearModel(): THREE.Group {
  const g = new THREE.Group(), coat = toon(0x8a5532), dark = toon(0x5e3820), cream = toon(0xf0d2a0), pink = toon(0xff9aa8), black = toon(0x1a1a1a, 0.4), white = toon(0xffffff, 0.3);
  const mk = (geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, name = '') => {
    const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; o.name = name; g.add(o); return o;
  };
  const body = new THREE.SphereGeometry(1, 24, 16); body.scale(1.35, 1.0, 0.95); mk(body, coat, 0, 1.55, 0);
  const belly = new THREE.SphereGeometry(0.8, 18, 12); belly.scale(1.2, 0.7, 0.85); mk(belly, cream, 0.1, 1.2, 0);
  mk(new THREE.SphereGeometry(0.78, 22, 16), coat, 1.55, 2.3, 0);                  // big round head
  const snout = new THREE.SphereGeometry(0.36, 16, 12); snout.scale(1.2, 0.85, 1); mk(snout, cream, 2.18, 2.12, 0);
  mk(new THREE.SphereGeometry(0.13, 12, 8), black, 2.6, 2.22, 0);                  // nose
  for (const z of [0.5, -0.5]) {
    mk(new THREE.SphereGeometry(0.26, 14, 10), coat, 1.4, 3.0, z);                 // ears
    mk(new THREE.SphereGeometry(0.15, 10, 8), pink, 1.5, 3.02, z * 1.02);
    mk(new THREE.SphereGeometry(0.17, 12, 10), white, 2.05, 2.55, z * 0.62);       // eyes
    mk(new THREE.SphereGeometry(0.095, 10, 8), black, 2.2, 2.56, z * 0.66);
  }
  const leg = new THREE.CapsuleGeometry(0.3, 0.8, 6, 12);
  for (const [x, z] of [[0.95, 0.52], [-0.95, 0.52], [-0.95, -0.52]]) mk(leg, dark, x, 0.65, z);
  mk(leg, dark, 0.95, 0.65, -0.52, 'paw');
  return g;
}

/** A cartoon bald eagle: brown body, white head and tail, bright yellow beak and feet, googly eyes, fingered wings
 * named 'wl'/'wr' (they flap). Faces +X. */
export function eagleModel(): THREE.Group {
  const g = new THREE.Group();
  const brown = new THREE.MeshStandardMaterial({ color: 0x6b4022, roughness: 0.8, side: THREE.DoubleSide });
  const white = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, side: THREE.DoubleSide });
  const yellow = new THREE.MeshStandardMaterial({ color: 0xffc21a, roughness: 0.5 });
  const black = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.3 });
  const add = (o: THREE.Mesh) => { o.castShadow = true; g.add(o); return o; };
  const body = new THREE.CapsuleGeometry(0.32, 0.85, 6, 14); body.rotateZ(Math.PI / 2); add(new THREE.Mesh(body, brown));
  add(new THREE.Mesh(new THREE.SphereGeometry(0.34, 16, 12), white)).position.set(0.7, 0.12, 0);
  const beak = new THREE.ConeGeometry(0.13, 0.36, 10); beak.rotateZ(-Math.PI / 2); add(new THREE.Mesh(beak, yellow)).position.set(1.08, 0.06, 0);
  for (const z of [0.17, -0.17]) {
    add(new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), white)).position.set(0.92, 0.24, z);
    add(new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), black)).position.set(0.99, 0.25, z * 1.05);
    const foot = new THREE.CapsuleGeometry(0.05, 0.22, 4, 6); add(new THREE.Mesh(foot, yellow)).position.set(0.1, -0.38, z * 0.8);
  }
  const tail = new THREE.ShapeGeometry(new THREE.Shape([new THREE.Vector2(0, 0.18), new THREE.Vector2(-0.6, 0.34), new THREE.Vector2(-0.68, 0), new THREE.Vector2(-0.6, -0.34), new THREE.Vector2(0, -0.18)]));
  tail.rotateX(Math.PI / 2); add(new THREE.Mesh(tail, white)).position.set(-0.6, 0, 0);
  const wing = (side: 1 | -1) => {
    const pts: THREE.Vector2[] = [new THREE.Vector2(0.3, 0), new THREE.Vector2(0.35, 1.2), new THREE.Vector2(0.15, 2.4)];
    for (let k = 0; k < 5; k++) { const z = 2.4 + k * 0.12; pts.push(new THREE.Vector2(0.1 - k * 0.12, z + 0.35), new THREE.Vector2(0.02 - k * 0.12, z)); }
    pts.push(new THREE.Vector2(-0.5, 2.2), new THREE.Vector2(-0.45, 1.1), new THREE.Vector2(-0.3, 0));
    const geo = new THREE.ShapeGeometry(new THREE.Shape(pts.map((p) => new THREE.Vector2(p.x, p.y * side))));
    geo.rotateX(Math.PI / 2);
    const m = add(new THREE.Mesh(geo, brown)); m.name = side > 0 ? 'wl' : 'wr';
  };
  wing(1); wing(-1);
  return g;
}

/** A cartoon frog sitting, facing +X: green body, pale belly, bulging eyes, folded legs. ~0.9 long. */
export function frogGeometry(): THREE.BufferGeometry {
  const body = new THREE.SphereGeometry(0.42, 18, 12); body.scale(1.15, 0.72, 0.95);
  const belly = new THREE.SphereGeometry(0.34, 14, 10); belly.scale(1.1, 0.6, 0.85);
  const parts = [paint(at(body, 0, 0.3, 0), 0x4fc93a), paint(at(belly, 0.06, 0.22, 0), 0xd8f5a0)];
  for (const z of [0.2, -0.2]) {
    parts.push(paint(at(new THREE.SphereGeometry(0.15, 12, 8), 0.22, 0.58, z), 0x4fc93a));           // eye bump
    parts.push(...eye(0.11, 0.27, 0.64, z * 1.05, z > 0 ? 1 : -1, new THREE.Vector3(0.6, 0.3, 0.6)));
    const thigh = new THREE.SphereGeometry(0.2, 12, 8); thigh.scale(1.3, 0.7, 0.8);
    parts.push(paint(at(thigh, -0.22, 0.2, z * 1.6), 0x3fae2e));
    const foot = new THREE.SphereGeometry(0.12, 10, 6); foot.scale(1.6, 0.35, 1);
    parts.push(paint(at(foot, 0.05, 0.04, z * 1.8), 0x3fae2e), paint(at(foot.clone(), 0.3, 0.04, z * 1.2), 0x3fae2e));
  }
  const smile = new THREE.TorusGeometry(0.16, 0.02, 4, 12, Math.PI); smile.rotateZ(Math.PI); smile.rotateY(Math.PI / 2);
  parts.push(paint(at(smile, 0.45, 0.34, 0), 0x1f5e18));
  return merged(parts);
}

/** A butterfly with two wing pairs (white, tinted per instance) and a dark body. Wings named by group: flap via scale.y. */
export function butterflyGeometry(): THREE.BufferGeometry {
  const wing = (side: 1 | -1) => {
    const sh = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(0.35, 0.3 * side), new THREE.Vector2(0.15, 0.5 * side), new THREE.Vector2(-0.1, 0.42 * side), new THREE.Vector2(-0.3, 0.3 * side), new THREE.Vector2(-0.18, 0.08 * side)]);
    const g = new THREE.ShapeGeometry(sh); g.rotateX(Math.PI / 2); return paint(g, 0xffffff);
  };
  const body = new THREE.CapsuleGeometry(0.035, 0.3, 4, 6); body.rotateZ(Math.PI / 2);
  return merged([wing(1), wing(-1), paint(body, 0x222222)]);
}

// ---------- riverbank flora ----------
/** A tuft of grass: a few bent blades, darker at the root. Height ~0.7. */
export function grassGeometry(): THREE.BufferGeometry {
  const blades: THREE.BufferGeometry[] = [];
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2 + k, lean = 0.15 + (k % 3) * 0.08, hgt = 0.45 + (k % 4) * 0.1;
    const g = new THREE.BufferGeometry();
    const w = 0.05, x = Math.cos(a) * 0.08, z = Math.sin(a) * 0.08;
    const tx = x + Math.cos(a) * lean, tz = z + Math.sin(a) * lean;
    g.setAttribute('position', new THREE.Float32BufferAttribute([
      x - w * Math.sin(a), 0, z + w * Math.cos(a), x + w * Math.sin(a), 0, z - w * Math.cos(a), (x + tx) / 2, hgt * 0.55, (z + tz) / 2,
      (x + tx) / 2, hgt * 0.55, (z + tz) / 2, x + w * Math.sin(a), 0, z - w * Math.cos(a), tx, hgt, tz,
    ], 3));
    g.computeVertexNormals();
    const col = new Float32Array(18), lo = new THREE.Color(0x2f6a22), hi = new THREE.Color(0x9ad14f), c = new THREE.Color();
    const ys = [0, 0, 0.55, 0.55, 0, 1];
    ys.forEach((y, i) => { c.copy(lo).lerp(hi, y); col.set([c.r, c.g, c.b], i * 3); });
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    blades.push(g);
  }
  return mergeGeometries(blades)!;
}
/** A flower: green stem and leaf, five white petals (tinted per instance) around a yellow centre. Height ~0.8. */
export function flowerGeometry(): THREE.BufferGeometry {
  const stem = paint(at(new THREE.CylinderGeometry(0.02, 0.025, 0.75, 5), 0, 0.375, 0), 0x3f8f2a);
  const leaf = new THREE.SphereGeometry(0.1, 8, 6); leaf.scale(1.6, 0.25, 0.7);
  const parts = [stem, paint(at(leaf, 0.1, 0.3, 0), 0x4fa83a)];
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2, p = new THREE.SphereGeometry(0.1, 10, 6); p.scale(1.3, 0.35, 0.8);
    p.rotateY(-a); parts.push(paint(at(p, Math.cos(a) * 0.12, 0.78, Math.sin(a) * 0.12), 0xffffff));
  }
  parts.push(paint(at(new THREE.SphereGeometry(0.07, 10, 8), 0, 0.8, 0), 0xffd21a));
  return merged(parts);
}
/** A clump of reeds with two cattails. Height ~1.6. */
export function reedGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (let k = 0; k < 5; k++) {
    const a = k * 1.3, r = 0.08, hgt = 1.0 + (k % 3) * 0.25;
    const blade = new THREE.ConeGeometry(0.035, hgt, 4); blade.rotateZ((k - 2) * 0.08);
    parts.push(paint(at(blade, Math.cos(a) * r, hgt / 2, Math.sin(a) * r), k % 2 ? 0x6a9a3a : 0x86b04a));
  }
  for (const [x, z, hgt] of [[0.05, 0.02, 1.5], [-0.06, -0.04, 1.3]]) {
    parts.push(paint(at(new THREE.CylinderGeometry(0.015, 0.015, hgt, 4), x, hgt / 2, z), 0x6a8a3a));
    parts.push(paint(at(new THREE.CapsuleGeometry(0.06, 0.22, 4, 8), x, hgt - 0.15, z), 0x7a4a24));
  }
  return merged(parts);
}
/** A lily pad (a notched disc) with a little pink lotus on top; the flower is a separate geometry so it can be hidden. */
export function lilyPadGeometry(): THREE.BufferGeometry {
  const pad = new THREE.CircleGeometry(0.55, 20, 0.25, Math.PI * 2 - 0.5); pad.rotateX(-Math.PI / 2);
  return merged([paint(pad, 0x3fae3a)]);
}
export function lotusGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * Math.PI * 2, p = new THREE.SphereGeometry(0.1, 8, 6); p.scale(0.6, 1.2, 0.35);
    p.rotateZ(-0.5); p.rotateY(-a); parts.push(paint(at(p, Math.cos(a) * 0.08, 0.1, Math.sin(a) * 0.08), 0xff8fc0));
  }
  parts.push(paint(at(new THREE.SphereGeometry(0.06, 8, 6), 0, 0.1, 0), 0xffe14a));
  return merged(parts);
}
export function pebbleGeometry(): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(0.22, 2); g.scale(1.3, 0.6, 1);
  return organic(g, 0.05, 4, new THREE.Color(0x8a857c), new THREE.Color(0xc9c2b4), -0.1, 0.12, 7);
}
