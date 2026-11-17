// Wildlife models for Watershed, built from smooth noise-displaced shapes with baked fur/feather gradients and
// articulated parts (named groups) so creatures can walk, rear, swipe, soar, bank, dive and chew. Render-only.
//  - Bear: a brown bear with a shoulder hump, long muzzle and four two-part legs ('lf','rf','lb','rb'), a 'body'
//    group to rear up, and a 'head' group. Faces +X, ~3.4 long.
//  - Eagle: a bald eagle with two-segment wings ('wl'/'wr' with 'wl2'/'wr2' outer panels and primaries),
//    'talons' that drop for the strike and a 'fish' it carries off. Faces +X, wingspan ~4.6.
//  - Beaver: a chunky beaver with orange incisors, a scaly paddle 'tail' and a 'head' that chews. Faces +X, ~1.7 long.
import * as THREE from 'three';
import { at, merged, noise3, paint, smoothNormals } from './models';

type Paint = (x: number, y: number, z: number, out: THREE.Color) => void;

/** Displace an indexed shape along its smooth normals by 3D noise, then bake per-vertex colour from `paintFn`. */
function furry(g: THREE.BufferGeometry, amp: number, freq: number, paintFn: Paint, seed = 0): THREE.BufferGeometry {
  g.deleteAttribute('uv');
  g.computeVertexNormals();
  const p = g.getAttribute('position') as THREE.BufferAttribute, n = g.getAttribute('normal') as THREE.BufferAttribute;
  const col = new Float32Array(p.count * 3), c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const d = noise3(x * freq + seed, y * freq, z * freq) * amp + noise3(x * freq * 3.1, y * freq * 3.1 + seed, z * freq * 3.1) * amp * 0.35;
    p.setXYZ(i, x + n.getX(i) * d, y + n.getY(i) * d, z + n.getZ(i) * d);
    paintFn(x, y, z, c);
    col.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const out = g.toNonIndexed();
  out.deleteAttribute('normal');
  return smoothNormals(out);
}
const grad = (lo: number, hi: number, y0: number, y1: number, jitter = 0.08): Paint => {
  const a = new THREE.Color(lo), b = new THREE.Color(hi);
  return (x, y, z, c) => {
    c.copy(a).lerp(b, Math.min(1, Math.max(0, (y - y0) / (y1 - y0))));
    c.multiplyScalar(1 - jitter + 2 * jitter * (0.5 + 0.5 * noise3(x * 5, y * 5, z * 5)));
  };
};
const ellipsoid = (r: number, sx: number, sy: number, sz: number, x: number, y: number, z: number, seg = 20) => {
  const g = new THREE.SphereGeometry(r, seg, Math.round(seg * 0.7)); g.scale(sx, sy, sz); g.translate(x, y, z); return g;
};
const mat = () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0 });
const mesh = (g: THREE.BufferGeometry, m: THREE.Material, name = '') => { const o = new THREE.Mesh(g, m); o.castShadow = true; o.name = name; return o; };
/** A group pivoting at (x, y, z) in its parent. */
const pivot = (name: string, x: number, y: number, z: number) => { const g = new THREE.Group(); g.name = name; g.position.set(x, y, z); return g; };
/** A small dark eye with a highlight. */
const beadEye = (r: number, x: number, y: number, z: number) => [
  paint(at(new THREE.SphereGeometry(r, 10, 8), x, y, z), 0x0d0a08),
  paint(at(new THREE.SphereGeometry(r * 0.32, 6, 5), x + r * 0.55, y + r * 0.45, z + Math.sign(z) * r * 0.45), 0xffffff),
];

// ---------------------------------------------------------------- bear
const FUR_DARK = 0x3e2412, FUR = 0x7a4a26, FUR_TIP = 0xa06a3a, MUZZLE = 0xb88a5c;

export function bearModel(): THREE.Group {
  const root = new THREE.Group(), m = mat();
  // body: barrel + shoulder hump + rump, one furry mesh (darker belly, sun-bleached back)
  const body = pivot('body', 0, 0, 0);   // rears up around the hind feet (x = 0)
  const torso = merged([
    ellipsoid(1, 1.45, 0.95, 0.88, 0.9, 1.6, 0, 26),
    ellipsoid(0.82, 1, 1, 1, 1.55, 2.05, 0, 20),
    ellipsoid(0.85, 1.1, 0.95, 1, 0.05, 1.7, 0, 20),
  ]);
  body.add(mesh(furry(mergeIndexed(torso), 0.07, 2.4, (x, y, z, c) => {
    grad(FUR_DARK, FUR_TIP, 0.9, 2.7)(x, y, z, c);
  }, 1), m));
  // head: skull, long muzzle, ears; pivots at the neck so it can sniff and roar
  const head = pivot('head', 2.25, 2.05, 0);
  const skull = mergeIndexed(merged([ellipsoid(0.55, 1.1, 0.95, 1, 0.1, 0.08, 0, 20), ellipsoid(0.3, 1.6, 0.9, 1, 0.68, -0.08, 0, 16)]));
  head.add(mesh(furry(skull, 0.04, 3, (x, y, z, c) => { grad(FUR, FUR_TIP, -0.4, 0.6)(x, y, z, c); if (x > 0.45) c.lerp(new THREE.Color(MUZZLE), Math.min(1, (x - 0.45) / 0.25)); }, 2), m));
  const bits = [
    paint(at(ellipsoid(0.12, 1.2, 0.85, 1, 0, 0, 0, 10), 1.17, 0.0, 0), 0x141010),          // nose
    ...beadEye(0.07, 0.48, 0.26, 0.27), ...beadEye(0.07, 0.48, 0.26, -0.27),
  ];
  for (const z of [0.33, -0.33]) {
    bits.push(paint(at(ellipsoid(0.17, 0.6, 1, 1, 0, 0, 0, 10), -0.12, 0.55, z), FUR));
    bits.push(paint(at(ellipsoid(0.1, 0.5, 0.9, 0.9, 0, 0, 0, 8), -0.06, 0.55, z * 1.02), 0x4a2a18));
  }
  head.add(mesh(merged(bits), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5 })));
  const jaw = mesh(paint(ellipsoid(0.22, 1.5, 0.5, 0.9, 0.55, -0.32, 0, 12), 0x5a3420), m, 'jaw'); head.add(jaw);
  body.add(head);
  // legs: upper + lower + paw with pale claws; each a pivot at the shoulder / hip
  const leg = (name: string, x: number, z: number, front: boolean) => {
    const L = pivot(name, x, 1.55, z);
    const up = mergeIndexed(merged([new THREE.CapsuleGeometry(front ? 0.3 : 0.34, 0.55, 6, 12).translate(0, -0.45, 0)]));
    L.add(mesh(furry(up, 0.03, 3, grad(FUR_DARK, FUR, -1, 0.2), 3), m));
    const low = pivot(name + 'Low', 0, -0.85, 0);
    const shin = mergeIndexed(merged([new THREE.CapsuleGeometry(0.24, 0.4, 6, 10).translate(0, -0.3, 0), ellipsoid(0.27, 1.35, 0.5, 1, 0.12, -0.62, 0, 12)]));
    low.add(mesh(furry(shin, 0.02, 3, grad(0x2a170c, FUR_DARK, -0.7, 0), 4), m));
    const claws: THREE.BufferGeometry[] = [];
    for (let k = -1.5; k <= 1.5; k++) { const cl = new THREE.ConeGeometry(0.035, 0.16, 5); cl.rotateZ(-Math.PI / 2); claws.push(paint(at(cl, 0.47, -0.66, k * 0.09), 0xe8dcc0)); }
    low.add(mesh(merged(claws), m));
    L.add(low); body.add(L);
  };
  leg('lf', 1.75, 0.5, true); leg('rf', 1.75, -0.5, true); leg('lb', 0.05, 0.52, false); leg('rb', 0.05, -0.52, false);
  // stubby tail
  body.add(mesh(paint(ellipsoid(0.16, 1, 1, 1, -0.78, 1.95, 0, 8), FUR), m));
  root.add(body);
  return root;
}

/** Convert a merged non-indexed geometry back into an indexed one (vertices welded by position) for `furry`. */
function mergeIndexed(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  const map = new Map<string, number>(), pos: number[] = [], idx: number[] = [];
  for (let i = 0; i < p.count; i++) {
    const key = `${p.getX(i).toFixed(4)},${p.getY(i).toFixed(4)},${p.getZ(i).toFixed(4)}`;
    let k = map.get(key);
    if (k === undefined) { k = pos.length / 3; map.set(key, k); pos.push(p.getX(i), p.getY(i), p.getZ(i)); }
    idx.push(k);
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); out.setIndex(idx);
  return out;
}

export interface BearPose {
  /** Gait phase (radians) and how much of a walk/run it is (0 = standing, 1 = full gallop). */
  gait: number; stride: number;
  /** 0 = on all fours, 1 = reared up on the hind legs. */
  rear: number;
  /** 0..1 swipe of the right front paw (down into the water). */
  swipe: number;
  /** Head turn/tilt (radians) and jaw open (0..1). */
  look: number; roar: number;
}

export function poseBear(g: THREE.Object3D, p: BearPose): void {
  const body = g.getObjectByName('body'); if (!body) return;
  const s = Math.sin(p.gait), c = Math.cos(p.gait), st = p.stride * (1 - p.rear);
  body.rotation.z = p.rear * 0.95 + st * 0.05 * Math.sin(p.gait * 2);
  body.position.y = Math.abs(s) * 0.12 * st;
  const legs: Array<[string, number]> = [['lf', 0], ['rb', 0], ['rf', Math.PI], ['lb', Math.PI]];
  for (const [n, ph] of legs) {
    const L = body.getObjectByName(n)!, low = L.getObjectByName(n + 'Low')!;
    const a = Math.sin(p.gait + ph);
    const front = n.endsWith('f');
    L.rotation.z = a * 0.55 * st - (front ? p.rear * 0.9 : -p.rear * 0.95);
    low.rotation.z = (front ? -1 : 1) * Math.max(0, Math.cos(p.gait + ph)) * 0.6 * st + (front ? p.rear * 0.8 : 0);
  }
  // the swipe: right front leg reaches up then slams down and forward
  if (p.swipe > 0) {
    const rf = body.getObjectByName('rf')!, low = rf.getObjectByName('rfLow')!;
    const k = p.swipe < 0.35 ? p.swipe / 0.35 : 1 - (p.swipe - 0.35) / 0.65;
    rf.rotation.z += k * 1.6; low.rotation.z -= k * 0.9;
  }
  const head = body.getObjectByName('head')!;
  head.rotation.y = p.look; head.rotation.z = -p.rear * 0.6 + 0.08 * c * st + p.roar * 0.35;
  const jaw = head.getObjectByName('jaw'); if (jaw) jaw.rotation.z = -p.roar * 0.5;
}

// ---------------------------------------------------------------- eagle
const BROWN_D = 0x3a2414, BROWN = 0x5e3a1e, BROWN_L = 0x8a6038;

export function eagleModel(): THREE.Group {
  const root = new THREE.Group(), m = mat();
  m.side = THREE.DoubleSide;
  // body: a tapered lathe (nose +X), brown with a paler breast streak
  const prof = [[0, -0.95], [0.12, -0.85], [0.26, -0.55], [0.33, -0.15], [0.3, 0.25], [0.22, 0.5], [0.0, 0.62]].map(([r, y]) => new THREE.Vector2(r, y));
  const lathe = new THREE.LatheGeometry(prof, 14); lathe.rotateZ(-Math.PI / 2); lathe.scale(1, 0.95, 0.9);
  const bodyG = furry(mergeIndexed(lathe), 0.02, 4, (x, y, z, c) => { c.set(BROWN).lerp(new THREE.Color(BROWN_D), Math.max(0, y) * 2); }, 5);
  root.add(mesh(bodyG, m));
  // white head and hooked yellow beak, white tail fan
  const head = mergeIndexed(merged([ellipsoid(0.24, 1.25, 1, 0.95, 0.72, 0.1, 0, 16)]));
  root.add(mesh(furry(head, 0.015, 6, (_x, _y, _z, c) => c.set(0xf6f3ea), 6), m));
  const beak = new THREE.ConeGeometry(0.1, 0.32, 10); beak.rotateZ(-Math.PI / 2 - 0.35); beak.translate(1.05, 0.02, 0);
  const tip = at(new THREE.SphereGeometry(0.05, 8, 6), 1.17, -0.05, 0);
  const tail = new THREE.Shape([new THREE.Vector2(0, 0.14), new THREE.Vector2(-0.55, 0.36), new THREE.Vector2(-0.68, 0.12), new THREE.Vector2(-0.7, -0.12), new THREE.Vector2(-0.55, -0.36), new THREE.Vector2(0, -0.14)]);
  const tg = new THREE.ShapeGeometry(tail); tg.rotateX(Math.PI / 2); tg.translate(-0.78, 0.04, 0);
  root.add(mesh(merged([paint(beak, 0xffc21a), paint(tip, 0xe0a010), ...beadEye(0.045, 0.85, 0.17, 0.15), ...beadEye(0.045, 0.85, 0.17, -0.15), paint(tg, 0xf4f1e8)]), m));
  // wings: inner panel (coverts, lighter) and an outer panel with five splayed primaries; pivots at shoulder / wrist
  const wing = (side: 1 | -1) => {
    const W = pivot(side > 0 ? 'wl' : 'wr', 0.15, 0.12, 0.2 * side);
    const inner = new THREE.Shape([new THREE.Vector2(0.28, 0), new THREE.Vector2(0.32, 1.05), new THREE.Vector2(-0.42, 1.1), new THREE.Vector2(-0.46, 0.4), new THREE.Vector2(-0.3, 0)]);
    const ig = new THREE.ShapeGeometry(inner, 4); ig.rotateX(Math.PI / 2);
    if (side < 0) ig.scale(1, 1, -1);
    W.add(mesh(colourByX(ig, BROWN_L, BROWN_D, 0.3, -0.45), m));
    const O = pivot(side > 0 ? 'wl2' : 'wr2', 0, 0, 1.05 * side);
    const outer = new THREE.Shape([new THREE.Vector2(0.32, 0), new THREE.Vector2(0.22, 0.75), new THREE.Vector2(-0.42, 0.85), new THREE.Vector2(-0.42, 0)]);
    const parts: THREE.BufferGeometry[] = [];
    const og = new THREE.ShapeGeometry(outer, 3); og.rotateX(Math.PI / 2); parts.push(og);
    for (let k = 0; k < 5; k++) {
      const f = new THREE.Shape([new THREE.Vector2(0.07, 0), new THREE.Vector2(0.05, 0.62 - k * 0.04), new THREE.Vector2(0, 0.68 - k * 0.05), new THREE.Vector2(-0.06, 0.6 - k * 0.04), new THREE.Vector2(-0.07, 0)]);
      const fg = new THREE.ShapeGeometry(f); fg.rotateZ(-0.12 * (k - 2)); fg.rotateX(Math.PI / 2); fg.translate(0.2 - k * 0.15, 0, 0.72);
      parts.push(fg);
    }
    const all = merged(parts.map((p) => { p.deleteAttribute('uv'); return p; }));
    if (side < 0) all.scale(1, 1, -1);
    O.add(mesh(colourByX(all, BROWN, 0x1e140c, 0.3, -0.45), m));
    W.add(O); root.add(W);
  };
  wing(1); wing(-1);
  // talons: tucked back under the tail in flight, thrown forward for the strike; a salmon to carry off
  const T = pivot('talons', 0.1, -0.22, 0);
  const tparts: THREE.BufferGeometry[] = [];
  for (const z of [0.12, -0.12]) {
    tparts.push(paint(at(new THREE.CapsuleGeometry(0.05, 0.28, 4, 6), 0, -0.18, z), 0xffc21a));
    for (let k = 0; k < 3; k++) { const cl = new THREE.ConeGeometry(0.025, 0.14, 5); cl.rotateZ(-Math.PI / 2 - 0.7); tparts.push(paint(at(cl, 0.07, -0.38, z + (k - 1) * 0.05), 0x1a1a1a)); }
    tparts.push(paint(at(ellipsoid(0.07, 1.2, 1, 1, 0, 0, 0, 8), 0, -0.02, z), 0xf4f1e8));
  }
  T.add(mesh(merged(tparts), m));
  const fish = new THREE.Mesh(new THREE.CapsuleGeometry(0.1, 0.45, 4, 8).rotateZ(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xe0452e, roughness: 0.45 }));
  fish.name = 'fish'; fish.position.set(0.05, -0.48, 0); fish.visible = false; T.add(fish);
  root.add(T);
  return root;
}
function colourByX(g: THREE.BufferGeometry, front: number, back: number, x0: number, x1: number): THREE.BufferGeometry {
  const n = g.index ? g.toNonIndexed() : g;
  n.deleteAttribute('uv'); n.computeVertexNormals();
  const p = n.getAttribute('position') as THREE.BufferAttribute, col = new Float32Array(p.count * 3), a = new THREE.Color(front), b = new THREE.Color(back), c = new THREE.Color();
  for (let i = 0; i < p.count; i++) { c.copy(a).lerp(b, Math.min(1, Math.max(0, (p.getX(i) - x0) / (x1 - x0)))); col.set([c.r, c.g, c.b], i * 3); }
  n.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return n;
}

export interface EaglePose {
  /** Wing beat phase (radians) and strength (0 = gliding with wings flat, 1 = full flap). */
  beat: number; flap: number;
  /** 0 = wings spread, 1 = tucked for a dive. */
  tuck: number;
  /** 0 = talons tucked, 1 = thrown forward. */
  reach: number;
  carrying: boolean;
}

export function poseEagle(g: THREE.Object3D, p: EaglePose): void {
  const s = Math.sin(p.beat), lag = Math.sin(p.beat - 0.9);
  for (const [n, side] of [['wl', 1], ['wr', -1]] as const) {
    const W = g.getObjectByName(n)!, O = W.getObjectByName(n + '2')!;
    // flap about the body axis (X), a little dihedral when gliding; tuck sweeps the wings back and folds them
    W.rotation.x = side * (-(0.12 + 0.75 * s * p.flap) * (1 - p.tuck) - p.tuck * 0.9);
    W.rotation.y = side * p.tuck * 0.9;
    O.rotation.x = side * (-(0.45 * lag * p.flap) * (1 - p.tuck) - p.tuck * 0.6);
    O.rotation.y = side * p.tuck * 1.3;
  }
  const T = g.getObjectByName('talons')!;
  T.rotation.z = -1.2 + p.reach * 2.0;
  const f = T.getObjectByName('fish'); if (f) f.visible = p.carrying;
}

// ---------------------------------------------------------------- beaver
export function beaverModel(): THREE.Group {
  const root = new THREE.Group(), m = mat();
  const body = mergeIndexed(merged([ellipsoid(0.55, 1.35, 0.95, 1, 0, 0.55, 0, 22), ellipsoid(0.42, 1, 1, 1, -0.45, 0.48, 0, 16)]));
  root.add(mesh(furry(body, 0.035, 4, grad(0x3a2210, 0x8a5a30, 0.1, 1.1, 0.1), 7), m));
  const head = pivot('head', 0.72, 0.72, 0);
  const hg = mergeIndexed(merged([ellipsoid(0.36, 1.05, 0.9, 0.95, 0, 0, 0, 18), ellipsoid(0.22, 1.1, 0.8, 1.15, 0.28, -0.1, 0, 14)]));
  head.add(mesh(furry(hg, 0.02, 5, (x, y, z, c) => { grad(0x4a2c16, 0x8a5a30, -0.3, 0.3)(x, y, z, c); if (x > 0.25) c.lerp(new THREE.Color(0xa07a54), Math.min(1, (x - 0.25) / 0.15)); }, 8), m));
  const bits: THREE.BufferGeometry[] = [
    paint(at(ellipsoid(0.07, 1.3, 0.8, 1, 0, 0, 0, 8), 0.52, 0.0, 0), 0x111111),
    paint(at(new THREE.BoxGeometry(0.05, 0.16, 0.07), 0.5, -0.22, 0.04), 0xf09a2a), paint(at(new THREE.BoxGeometry(0.05, 0.16, 0.07), 0.5, -0.22, -0.04), 0xf09a2a),
    ...beadEye(0.05, 0.18, 0.14, 0.22), ...beadEye(0.05, 0.18, 0.14, -0.22),
  ];
  for (const z of [0.25, -0.25]) bits.push(paint(at(ellipsoid(0.08, 0.8, 1, 0.6, 0, 0, 0, 8), -0.12, 0.3, z), 0x3a2210));
  for (const z of [0.1, -0.1]) for (let k = 0; k < 3; k++) {   // whiskers
    const w = new THREE.CylinderGeometry(0.004, 0.004, 0.32, 3); w.rotateX(Math.PI / 2); w.rotateY((k - 1) * 0.25 * Math.sign(z)); w.translate(0.42, -0.04 + k * 0.03, z + Math.sign(z) * 0.16);
    bits.push(paint(w, 0xe8e0d0));
  }
  head.add(mesh(merged(bits), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55 })));
  root.add(head);
  // paws and webbed hind feet
  const feet: THREE.BufferGeometry[] = [];
  for (const z of [0.3, -0.3]) {
    feet.push(paint(at(ellipsoid(0.11, 1.2, 0.8, 1, 0, 0, 0, 8), 0.55, 0.15, z), 0x2a1a10));
    feet.push(paint(at(ellipsoid(0.17, 1.8, 0.35, 1.2, 0, 0, 0, 10), -0.4, 0.06, z * 1.2), 0x2a1a10));
  }
  root.add(mesh(merged(feet), m));
  // tail: flat, scaly paddle (crosshatched dark grey-brown)
  const T = pivot('tail', -0.85, 0.28, 0);
  const tg = new THREE.SphereGeometry(0.5, 18, 8); tg.scale(1.1, 0.12, 0.62); tg.translate(-0.5, 0, 0);
  const tp = tg.getAttribute('position') as THREE.BufferAttribute, tc = new Float32Array(tp.count * 3), a = new THREE.Color(0x2e2620), b = new THREE.Color(0x4a3e34), c = new THREE.Color();
  for (let i = 0; i < tp.count; i++) { const hatch = (Math.sin(tp.getX(i) * 28) * Math.sin(tp.getZ(i) * 28) > 0) ? 1 : 0; c.copy(a).lerp(b, hatch); tc.set([c.r, c.g, c.b], i * 3); }
  tg.setAttribute('color', new THREE.BufferAttribute(tc, 3)); tg.deleteAttribute('uv');
  T.add(mesh(tg, m));
  root.add(T);
  return root;
}

/** Beaver pose: `chew` 0..1 nods the head; `slap` raises and slaps the tail; `swim` undulates the body. */
export function poseBeaver(g: THREE.Object3D, chew: number, slap: number, swim: number, t: number): void {
  const head = g.getObjectByName('head'), tail = g.getObjectByName('tail');
  if (head) head.rotation.z = -0.25 * chew * (0.5 + 0.5 * Math.sin(t * 14)) + 0.08 * swim * Math.sin(t * 5);
  if (tail) tail.rotation.z = slap > 0 ? Math.sin(Math.min(1, slap) * Math.PI) * 0.9 : 0.12 * Math.sin(t * 5) * swim;
}
