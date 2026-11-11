// Buildings for Watershed: timber-framed cottages with gabled roofs, stone footings, shuttered windows and smoking
// chimneys; two water mills (an overshot grist mill fed by a flume, an undershot sawmill with a frame saw and log
// pile) whose wheels have rims, spokes and buckets; and a beaver dam of piled sticks and mud. Merged, vertex-coloured
// geometry (one draw per building), render-only.
import * as THREE from 'three';
import { at, merged, noise3, paint } from './models';

const box = (w: number, h: number, d: number, x: number, y: number, z: number, c: number) => paint(at(new THREE.BoxGeometry(w, h, d), x, y, z), c);
/** A gabled roof prism: ridge along X, `w` × `d` footprint, `h` tall, with overhang. */
function gable(w: number, d: number, h: number, y: number, c: number, trim: number): THREE.BufferGeometry[] {
  const sh = new THREE.Shape([new THREE.Vector2(-d / 2, 0), new THREE.Vector2(d / 2, 0), new THREE.Vector2(0, h)]);
  const g = new THREE.ExtrudeGeometry(sh, { depth: w, bevelEnabled: false });
  g.rotateY(Math.PI / 2); g.translate(-w / 2, y, 0);
  // shade the two slopes slightly differently so the roof reads in flat light
  const p = g.getAttribute('position') as THREE.BufferAttribute, col = new Float32Array(p.count * 3), base = new THREE.Color(c), cc = new THREE.Color();
  for (let i = 0; i < p.count; i++) { cc.copy(base).multiplyScalar(0.9 + 0.12 * noise3(p.getX(i) * 3, p.getY(i) * 3, p.getZ(i) * 3)); col.set([cc.r, cc.g, cc.b], i * 3); }
  const n = g.toNonIndexed(); n.deleteAttribute('uv');
  const pn = n.getAttribute('position') as THREE.BufferAttribute, cn = new Float32Array(pn.count * 3);
  for (let i = 0; i < pn.count; i++) { cc.copy(base).multiplyScalar(0.88 + 0.14 * (0.5 + 0.5 * noise3(pn.getX(i) * 2.3, pn.getY(i) * 2.3, pn.getZ(i) * 2.3))); cn.set([cc.r, cc.g, cc.b], i * 3); }
  n.setAttribute('color', new THREE.BufferAttribute(cn, 3)); n.computeVertexNormals();
  return [n, box(w + 0.1, 0.1, 0.12, 0, y + h, 0, trim)];
}

export interface HouseOpts { w?: number; d?: number; wallH?: number; wall: number; roof: number; shutter: number }

/** A cottage facing +X (door on +X), origin at ground centre. Returns the geometry and its chimney top (local). */
export function houseGeometry(o: HouseOpts): { geo: THREE.BufferGeometry; chimney: THREE.Vector3 } {
  const w = o.w ?? 2.2, d = o.d ?? 1.8, H = o.wallH ?? 1.5, beam = 0x4a2e1a, stone = 0x8c867a;
  const parts: THREE.BufferGeometry[] = [
    box(w + 0.16, 0.3, d + 0.16, 0, 0.15, 0, stone),             // footing
    box(w, H, d, 0, 0.3 + H / 2, 0, o.wall),                      // plaster walls
  ];
  // timber frame: corner posts, a sill and a mid rail on the long sides, braces on the gable ends
  for (const x of [-w / 2, w / 2]) for (const z of [-d / 2, d / 2]) parts.push(box(0.12, H, 0.12, x, 0.3 + H / 2, z, beam));
  for (const z of [-d / 2 - 0.01, d / 2 + 0.01]) { parts.push(box(w, 0.1, 0.04, 0, 0.35, z, beam), box(w, 0.08, 0.04, 0, 0.3 + H * 0.55, z, beam), box(0.08, H, 0.04, 0, 0.3 + H / 2, z, beam)); }
  // door and windows (warm glass, coloured shutters)
  parts.push(box(0.05, 0.9, 0.55, w / 2 + 0.02, 0.75, 0, 0x5a3a20), box(0.06, 1.0, 0.07, w / 2 + 0.03, 0.8, 0.31, beam), box(0.06, 1.0, 0.07, w / 2 + 0.03, 0.8, -0.31, beam));
  for (const z of [-d / 2 - 0.02, d / 2 + 0.02]) for (const x of [-w / 4, w / 4]) {
    parts.push(box(0.42, 0.42, 0.03, x, 0.3 + H * 0.62, z, 0xffe9a8), box(0.46, 0.06, 0.05, x, 0.3 + H * 0.62 - 0.24, z, beam));
    parts.push(box(0.16, 0.44, 0.03, x - 0.3, 0.3 + H * 0.62, z * 1.01, o.shutter), box(0.16, 0.44, 0.03, x + 0.3, 0.3 + H * 0.62, z * 1.01, o.shutter));
  }
  parts.push(...gable(w + 0.5, d + 0.55, d * 0.55, 0.3 + H, o.roof, 0x3a2a1e));
  // stone chimney through the back slope
  const cx = -w / 2 + 0.45, cz = -d / 4;
  parts.push(box(0.36, 1.5, 0.36, cx, 0.3 + H + 0.5, cz, 0x7a746a), box(0.44, 0.1, 0.44, cx, 0.3 + H + 1.27, cz, 0x5a554e));
  return { geo: merged(parts), chimney: new THREE.Vector3(cx, 0.3 + H + 1.35, cz) };
}

/** A water wheel in the YZ plane (axis X), radius r: two rims, spokes, a hub and buckets. */
export function wheelGeometry(r: number, width: number): THREE.BufferGeometry {
  const wood = 0x7a5230, dark = 0x4e331c, parts: THREE.BufferGeometry[] = [];
  for (const x of [-width / 2, width / 2]) {
    const rim = new THREE.TorusGeometry(r, 0.09, 6, 32); rim.rotateY(Math.PI / 2); parts.push(paint(at(rim, x, 0, 0), dark));
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2, sp = new THREE.BoxGeometry(0.08, r, 0.1);
      sp.translate(0, r / 2, 0); sp.rotateX(a); parts.push(paint(at(sp, x, 0, 0), wood));
    }
  }
  const hub = new THREE.CylinderGeometry(0.22, 0.22, width + 0.5, 10); hub.rotateZ(Math.PI / 2); parts.push(paint(hub, dark));
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2, b = new THREE.BoxGeometry(width, 0.42, 0.06);
    b.translate(0, r - 0.18, 0); b.rotateX(a); parts.push(paint(b, k % 2 ? wood : 0x8a6038));
  }
  return merged(parts);
}

export function millModel(kind: 'grist' | 'saw'): THREE.Group {
  const g = new THREE.Group();
  const stoneBase = [box(2.6, 1.1, 2.3, 0, 0.55, 0, 0x8c867a)];
  for (let k = 0; k < 14; k++) stoneBase.push(box(0.36, 0.2, 0.05, -1.1 + (k % 7) * 0.36 + (Math.floor(k / 7) % 2) * 0.18, 0.3 + Math.floor(k / 7) * 0.4, 1.16, 0x7a746a));
  const { geo, chimney } = houseGeometry({ w: 2.6, d: 2.3, wallH: 1.4, wall: 0xf1e3c4, roof: kind === 'grist' ? 0xa8402e : 0x2e6e4a, shutter: kind === 'grist' ? 0x2e6e4a : 0xa8402e });
  geo.translate(0, 0.8, 0);
  const extra: THREE.BufferGeometry[] = [];
  if (kind === 'grist') {
    // a flume on posts that pours onto the top of the overshot wheel, and flour sacks by the door
    // (water comes from upstream, −X, along the wheel's side of the mill)
    extra.push(box(3.4, 0.18, 0.55, -1.75, 3.55, 1.75, 0x6a4628), box(3.4, 0.3, 0.06, -1.75, 3.67, 2.03, 0x5a3a20), box(3.4, 0.3, 0.06, -1.75, 3.67, 1.47, 0x5a3a20));
    for (const x of [-2.4, -3.3]) extra.push(box(0.14, 3.5, 0.14, x, 1.75, 1.75, 0x5a3a20));
    extra.push(box(3.3, 0.05, 0.42, -1.7, 3.66, 1.75, 0x6fb8e0));   // water in the flume
    for (let k = 0; k < 3; k++) extra.push(paint(at(new THREE.SphereGeometry(0.3, 10, 8).scale(1, 1.3, 0.9), 1.6, 0.35, -0.6 + k * 0.55), 0xe8d7a8));
  } else {
    // a frame saw in an open shed and a stacked log pile
    extra.push(box(0.12, 1.8, 0.12, 1.9, 0.9, -0.9, 0x5a3a20), box(0.12, 1.8, 0.12, 1.9, 0.9, 0.9, 0x5a3a20), box(1.0, 0.08, 2.2, 1.9, 1.85, 0, 0x6a4628));
    extra.push(box(0.04, 1.2, 0.5, 1.9, 1.0, 0, 0xc8ccd0));
    for (let k = 0; k < 6; k++) {
      const log = new THREE.CylinderGeometry(0.22, 0.22, 2.2, 9); log.rotateX(Math.PI / 2);
      extra.push(paint(at(log, -1.9 + (k % 3) * 0.45 + (k >= 3 ? 0.22 : 0), 0.22 + (k >= 3 ? 0.38 : 0), -0.2), k % 2 ? 0x7a5230 : 0x8a6038));
    }
  }
  const body = new THREE.Mesh(merged([...stoneBase, geo, ...extra]), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82 }));
  body.castShadow = true; body.receiveShadow = true;
  g.add(body);
  const r = kind === 'grist' ? 1.65 : 1.45;
  const wheel = new THREE.Mesh(wheelGeometry(r, 0.8), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 }));
  wheel.name = 'wheel'; wheel.castShadow = true;
  // the axle runs out of the mill's river side (+Z); the wheel's plane faces across the river (axis along Z)
  wheel.rotation.order = 'YXZ'; wheel.rotation.y = Math.PI / 2;
  wheel.position.set(0, kind === 'grist' ? 1.75 : 1.35, 1.75);
  g.add(wheel);
  const smoke = new THREE.Object3D(); smoke.name = 'chimney'; smoke.position.copy(chimney).add(new THREE.Vector3(0, 0.8, 0)); g.add(smoke);
  return g;
}

/** Beaver dam sticks: `n` crossed sticks piled in a wedge across ±halfW (Z), thicker in the middle. Deterministic. */
export function damSticks(n: number, halfW: number): Array<{ x: number; y: number; z: number; ry: number; rz: number; len: number; layer: number }> {
  const out = [];
  let s = 12345;
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  for (let k = 0; k < n; k++) {
    const layer = Math.floor((k / n) * 4);           // built bottom-up: later sticks sit higher
    const z = (rnd() * 2 - 1) * halfW * (1 - layer * 0.12);
    const crown = 1 - (z / halfW) ** 2;
    out.push({ x: (rnd() - 0.5) * (2.2 - layer * 0.35), y: 0.15 + layer * 0.32 * (0.5 + 0.5 * crown), z, ry: (rnd() - 0.5) * 1.6 + (rnd() < 0.3 ? Math.PI / 2 : 0), rz: (rnd() - 0.5) * 0.5, len: 1.2 + rnd() * 1.6, layer });
  }
  return out;
}
