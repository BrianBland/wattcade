// Held / thrown weapon models, cel-shaded with warm ink. Each model is ONE vertex-coloured merged mesh + one
// ink hull (+ a flame sprite-mesh for the molotov / rocket exhaust), so a weapon costs 2-3 draw calls.
// Convention: grip at the origin, +z = forward (the way it is aimed/thrown), +y = up.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { toon } from './jsr';
import { inkMat } from './chars';

export type WeaponModelKind = 'bazooka' | 'rocket' | 'bottle' | 'molotov' | 'grenade' | 'oil';
export interface WeaponModel { root: THREE.Group; kind: WeaponModelKind; flame?: THREE.Object3D; pin?: THREE.Object3D; warhead?: THREE.Object3D }

const C = new THREE.Color();
export function piece(g: THREE.BufferGeometry, col: number, m?: THREE.Matrix4) {
  const n = g.index ? g.toNonIndexed() : g; for (const k of Object.keys(n.attributes)) if (k !== 'position' && k !== 'normal') n.deleteAttribute(k);
  if (m) n.applyMatrix4(m);
  C.set(col); const a = new Float32Array(n.attributes.position.count * 3); for (let i = 0; i < a.length; i += 3) { a[i] = C.r; a[i + 1] = C.g; a[i + 2] = C.b; }
  n.setAttribute('color', new THREE.BufferAttribute(a, 3)); return n;
}
export const Mt = (x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(1, 1, 1));
const cyl = (r0: number, r1: number, h: number, s = 10) => new THREE.CylinderGeometry(r0, r1, h, s);
const Z = Math.PI / 2;
let VMAT: THREE.Material | undefined;
const vmat = () => { if (!VMAT) { const m = toon(0xffffff) as THREE.MeshToonMaterial; m.vertexColors = true; VMAT = m; } return VMAT; };
export function mesh(parts: THREE.BufferGeometry[], ink = 0.01) {
  const g = mergeGeometries(parts)!; g.computeVertexNormals();
  const m = new THREE.Mesh(g, vmat()); m.add(new THREE.Mesh(g, inkMat(ink))); return m;
}
let FLAME: THREE.Material | undefined;
function flame(scale = 0.65) {
  FLAME ??= new THREE.MeshBasicMaterial({ color: 0xffa23a, transparent: true, opacity: 0.92, depthWrite: false });
  const outer = new THREE.ConeGeometry(0.07, 0.22, 7); outer.translate(0, 0.11, 0);
  const inner = new THREE.ConeGeometry(0.04, 0.13, 6); inner.translate(0, 0.07, 0.01);
  const g = new THREE.Group(); const o = new THREE.Mesh(outer, FLAME); const i = new THREE.Mesh(inner, new THREE.MeshBasicMaterial({ color: 0xfff1a0, depthWrite: false })); g.add(o, i); g.scale.setScalar(scale); return g;
}

/** glass bottle: green or brown; molotov = brown bottle + stuffed rag + flame on the rag */
function bottleParts(glass: number, molotov: boolean) {
  const prof = [[0, 0], [0.042, 0], [0.046, 0.01], [0.046, 0.15], [0.03, 0.2], [0.016, 0.23], [0.016, 0.27], [0.019, 0.275], [0, 0.28]].map(([x, y]) => new THREE.Vector2(x, y));
  const out = [piece(new THREE.LatheGeometry(prof, 10), glass), piece(cyl(0.047, 0.047, 0.07, 10), molotov ? 0xb8a27a : 0xd8cbb0, Mt(0, 0.08, 0))]; // label
  if (molotov) { const rag = new THREE.ConeGeometry(0.03, 0.12, 6); out.push(piece(rag, 0xd8cbb0, Mt(0.01, 0.31, 0, 0, 0, 0.3)), piece(new THREE.BoxGeometry(0.05, 0.05, 0.02), 0xa8573d, Mt(0.025, 0.28, 0.0, 0.2, 0, 0.5))); }
  else out.push(piece(cyl(0.02, 0.02, 0.012, 8), 0xb08a3a, Mt(0, 0.28, 0)));
  return out;
}
export function buildWeapon(kind: WeaponModelKind, opts: { glass?: number } = {}): WeaponModel {
  const root = new THREE.Group(); const w: WeaponModel = { root, kind };
  if (kind === 'bazooka') {
    const olive = 0x4f5a3a, dark = 0x2b2a24;
    const parts = [
      piece(cyl(0.072, 0.072, 1.05, 12), olive, Mt(0, 0, 0.12, Z)),                 // tube (z: -0.4 .. 0.65)
      piece(cyl(0.09, 0.075, 0.16, 12), dark, Mt(0, 0, -0.44, Z)),                  // flared rear venturi
      piece(cyl(0.082, 0.082, 0.05, 12), dark, Mt(0, 0, 0.64, Z)),                  // muzzle ring
      piece(cyl(0.079, 0.079, 0.035, 12), 0x8a7a3a, Mt(0, 0, 0.0, Z)),               // brass band
      piece(new THREE.BoxGeometry(0.03, 0.09, 0.05), dark, Mt(0, 0.1, 0.38)),        // front sight post
      piece(new THREE.BoxGeometry(0.07, 0.07, 0.11), dark, Mt(-0.07, 0.07, 0.05)),   // optic box
      piece(cyl(0.022, 0.022, 0.06, 8), 0x7fa0a8, Mt(-0.07, 0.07, 0.11, Z)),         // lens
      piece(new THREE.BoxGeometry(0.04, 0.14, 0.05), dark, Mt(0, -0.12, 0.04, -0.25)),// pistol grip (at the origin-ish)
      piece(new THREE.BoxGeometry(0.035, 0.11, 0.045), dark, Mt(0, -0.11, 0.33, -0.1)),// fore grip
      piece(new THREE.TorusGeometry(0.03, 0.007, 4, 8, Math.PI), dark, Mt(0, -0.075, 0.1, 0, Z, 0)), // trigger guard
      piece(new THREE.BoxGeometry(0.12, 0.012, 0.75), 0x6b4a32, Mt(0.07, -0.02, 0.1, 0, 0, 0.6)),    // sling
    ];
    root.add(mesh(parts, 0.011));
    const wh = mesh([piece(new THREE.ConeGeometry(0.06, 0.16, 10), 0x9d3a2e, Mt(0, 0, 0.76, Z)), piece(cyl(0.05, 0.05, 0.05, 10), 0x6b6b5a, Mt(0, 0, 0.67, Z))], 0.008);
    root.add(wh); w.warhead = wh;
  } else if (kind === 'rocket') {
    const parts = [
      piece(cyl(0.06, 0.06, 0.5, 10), 0x6b6b5a, Mt(0, 0, 0, Z)), piece(new THREE.ConeGeometry(0.065, 0.2, 10), 0x9d3a2e, Mt(0, 0, 0.35, Z)),
      ...[0, 1, 2, 3].map((i) => piece(new THREE.BoxGeometry(0.01, 0.13, 0.12), 0x4f5a3a, Mt(0, 0, -0.22, 0, 0, i * Z).multiply(Mt(0, 0.08, 0)))),
    ];
    root.add(mesh(parts, 0.012));
    const f = flame(1.6); f.rotation.x = -Z; f.position.z = -0.27; root.add(f); w.flame = f;
  } else if (kind === 'bottle' || kind === 'molotov') {
    const glass = kind === 'molotov' ? 0x6b4a24 : opts.glass ?? 0x3f6b3a;
    root.add(mesh(bottleParts(glass, kind === 'molotov'), 0.008));
    if (kind === 'molotov') { const f = flame(1); f.position.set(0.015, 0.34, 0); root.add(f); w.flame = f; }
  } else if (kind === 'grenade') { // pineapple: segmented egg body, fuse head, spoon lever, ring pin
    const body = new THREE.SphereGeometry(0.06, 10, 8); body.scale(1, 1.25, 1);
    const ridges = [0, 1, 2, 3].map((i) => piece(new THREE.TorusGeometry(0.06 * Math.cos(((i - 1.5) / 2.2)), 0.007, 4, 12), 0x2d3a22, Mt(0, (i - 1.5) * 0.034, 0, Z)));
    const vr = [0, 1, 2, 3].map((i) => piece(new THREE.TorusGeometry(0.066, 0.006, 4, 12, Math.PI), 0x2d3a22, Mt(0, 0, 0, 0, i * Math.PI / 4, Z)));
    const parts = [piece(body, 0x46572f), ...ridges, ...vr,
      piece(cyl(0.022, 0.026, 0.05, 8), 0x55564a, Mt(0, 0.095, 0)),
      piece(new THREE.BoxGeometry(0.018, 0.11, 0.012), 0x8a8a7a, Mt(0.0, 0.07, 0.07, 0.18, 0, 0)),    // spoon down the side
      piece(new THREE.BoxGeometry(0.018, 0.012, 0.04), 0x8a8a7a, Mt(0.0, 0.12, 0.05))];
    root.add(mesh(parts, 0.008));
    const pin = mesh([piece(new THREE.TorusGeometry(0.022, 0.004, 4, 10), 0xc9c2a8, Mt(0.05, 0.11, 0, 0, Z, 0)), piece(cyl(0.003, 0.003, 0.05, 4), 0xc9c2a8, Mt(0.025, 0.11, 0, 0, 0, Z))], 0.004);
    root.add(pin); w.pin = pin;
  } else { // oil can: drum body, conical top, long thin spout, thumb pump
    const parts = [piece(cyl(0.08, 0.085, 0.14, 12), 0x9d3a2e, Mt(0, 0.07, 0)), piece(cyl(0.086, 0.086, 0.015, 12), 0x5a4a3a, Mt(0, 0.002, 0)),
      piece(new THREE.ConeGeometry(0.08, 0.1, 12), 0x8a8a7a, Mt(0, 0.19, 0)),
      piece(cyl(0.008, 0.014, 0.28, 6), 0x8a8a7a, Mt(0, 0.3, 0.09, 0.75)),
      piece(new THREE.BoxGeometry(0.08, 0.05, 0.02), 0xd8b24a, Mt(0, 0.08, 0.083)),       // label
      piece(new THREE.TorusGeometry(0.05, 0.01, 4, 10, Math.PI), 0x2b2a24, Mt(0, 0.12, -0.08, 0, Z, 0))]; // handle
    root.add(mesh(parts, 0.009));
  }
  return w;
}
/** animate a flame flicker */
export function flicker(w: WeaponModel, t: number, lit = true) {
  if (!w.flame) return; w.flame.visible = lit; if (!lit) return;
  const k = 1 + Math.sin(t * 31) * 0.15 + Math.sin(t * 17.3) * 0.1; w.flame.scale.y = (w.kind === 'rocket' ? 1.6 : 0.65) * k; w.flame.rotation.z = Math.sin(t * 13) * 0.15;
}
