// Low-poly building and ship models.
import * as THREE from 'three';
import { PIER_LEN } from '../sim/layout';
import { lam, mergeStatic, mesh, mulberry, pick, roofGeo, softTexture } from './util';

/** Shared window glass; the renderer warms it up at night. */
export const WIN = new THREE.MeshBasicMaterial({ color: 0x2a3a4a });
/** Shared lamp glass (pier lanterns, beacon); brightened at night. */
export const LAMP = new THREE.MeshBasicMaterial({ color: 0x8a7a50 });
let glowTex: THREE.Texture | null = null;
export const glowTexture = () => (glowTex ??= softTexture(64, 0.15));

/** Buildings that sit on a beach and face the sea (no yaw). */
export const SHORE_KINDS = new Set(['pier', 'shipyard', 'lifeboat']);
/** Small per-plot yaw so the town doesn't look gridded; buildings at the island's ends turn toward the middle. */
export function plotYaw(kind: string, i: number, x: number): number {
  return SHORE_KINDS.has(kind) ? 0 : (((i * 37) % 7) - 3) * 0.06 + (x < -8 ? 0.3 : x > 14 ? -0.3 : 0);
}

export interface BuildingModel {
  group: THREE.Group;
  chimney?: THREE.Vector3[]; // local smoke origins
  bell?: THREE.Object3D;     // swings when the bell rings
  spin?: THREE.Object3D;     // windmill sails (rotate about local z)
  boat?: THREE.Object3D;     // lifeboat (launched on rescues)
  glows: THREE.Sprite[];     // night glows
}

const WALLS = [0xf3eee2, 0xf1e3c4, 0xd9e6ee, 0xf2d7d2, 0xdfe8d2, 0xfaf3d0];
const ROOFS = [0xb5532f, 0x5a6472, 0x9a6a3a, 0x3f6f8a, 0xa23b3b];
const WOOD = 0x8b6b3e, DARK = 0x5e472b, STONE = 0xb8b0a0, STONE2 = 0x8a8378, SLATE = 0x4a4f57;

function glow(color: number, size: number, x: number, y: number, z: number): THREE.Sprite {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 }));
  s.position.set(x, y, z); s.scale.setScalar(size); return s;
}
const glassMat = new THREE.MeshLambertMaterial({ color: 0xbfe6ff, transparent: true, opacity: 0.45, flatShading: true });

/** A simple pitched-roof house. Returns its chimney top (local). */
function house(g: THREE.Group, r: () => number, w: number, d: number, h: number, x = 0, z = 0, storeys = 1): THREE.Vector3 {
  const wall = lam(pick(r, WALLS)), roof = lam(pick(r, ROOFS));
  g.add(mesh(new THREE.BoxGeometry(w, h, d), wall, x, h / 2, z));
  g.add(mesh(roofGeo(w + 0.3, 1 + r() * 0.3, d + 0.4), roof, x, h, z));
  const cx = x + (r() > 0.5 ? 1 : -1) * w * 0.28;
  g.add(mesh(new THREE.BoxGeometry(0.32, 0.9, 0.32), lam(0x8b7f74), cx, h + 0.75, z - d * 0.15));
  g.add(mesh(new THREE.BoxGeometry(0.45, 0.85, 0.08), lam(pick(r, [0x4a6a8a, 0x6a3a2a, 0x3d6b4a])), x - w * 0.15, 0.43, z + d / 2 + 0.02, false));
  for (let s = 0; s < storeys; s++) {
    const y = s === 0 ? Math.min(h * 0.6, 0.85) : 0.85 + s * 1.1;
    for (const fx of s === 0 ? [0.22, -0.38] : [0.22, -0.15, -0.38]) g.add(mesh(new THREE.BoxGeometry(0.38, 0.38, 0.06), WIN, x + w * fx, y, z + d / 2 + 0.03, false));
  }
  g.add(mesh(new THREE.BoxGeometry(0.06, 0.38, 0.38), WIN, x + w / 2 + 0.03, Math.min(h * 0.6, 0.85), z, false));
  return new THREE.Vector3(cx, h + 1.3, z - d * 0.15);
}

function fence(g: THREE.Group, w: number, d: number, gap = true) {
  const m = lam(0xe8dcc0);
  for (let x = -w / 2; x <= w / 2 + 0.01; x += 0.7) for (const z of [-d / 2, d / 2]) if (!(gap && z > 0 && Math.abs(x) < 0.5)) g.add(mesh(new THREE.BoxGeometry(0.08, 0.5, 0.08), m, x, 0.25, z, false));
  for (let z = -d / 2; z <= d / 2 + 0.01; z += 0.7) for (const x of [-w / 2, w / 2]) g.add(mesh(new THREE.BoxGeometry(0.08, 0.5, 0.08), m, x, 0.25, z, false));
  g.add(mesh(new THREE.BoxGeometry(w, 0.05, 0.05), m, 0, 0.42, -d / 2, false));
  for (const x of [-w / 2, w / 2]) g.add(mesh(new THREE.BoxGeometry(0.05, 0.05, d), m, x, 0.42, 0, false));
}

function crates(g: THREE.Group, r: () => number, spots: number[][]) {
  for (const [x, z] of spots) { const c = mesh(new THREE.BoxGeometry(0.45, 0.45, 0.45), lam(0xa07a4a), x, 0.23, z); c.rotation.y = r(); g.add(c); }
}

export function makeBuilding(kind: string, seed: number, level = 1): BuildingModel {
  const r = mulberry(seed * 977 + kind.length * 13);
  const g = new THREE.Group();
  const out: BuildingModel = { group: g, glows: [], chimney: [] };
  if (kind === 'cottage') {
    if (level === 1) out.chimney!.push(house(g, r, 2 + r() * 0.5, 1.6 + r() * 0.3, 1.3 + r() * 0.3));
    else if (level === 2) {
      out.chimney!.push(house(g, r, 2.4, 1.8, 2.4, 0, 0, 2));
      g.add(mesh(new THREE.BoxGeometry(1.0, 0.1, 0.7), lam(DARK), -0.35, 1.0, 1.25, false)); // porch roof
      for (const x of [-0.8, 0.1]) g.add(mesh(new THREE.BoxGeometry(0.08, 1.0, 0.08), lam(DARK), x, 0.5, 1.5, false));
    } else {
      out.chimney!.push(house(g, r, 3.4, 2.0, 2.5, 0, 0, 2));
      out.chimney!.push(new THREE.Vector3(1.3, 3.8, -0.3));
      g.add(mesh(new THREE.BoxGeometry(0.32, 1.1, 0.32), lam(0x8b7f74), 1.3, 3.2, -0.3));
      g.add(mesh(new THREE.BoxGeometry(0.08, 1.8, 0.08), lam(DARK), 2.1, 0.9, 1.4, false));
      g.add(mesh(new THREE.BoxGeometry(0.9, 0.08, 0.08), lam(DARK), 1.7, 1.75, 1.4, false));
      g.add(mesh(new THREE.BoxGeometry(0.7, 0.5, 0.06), lam(0xc0392b), 1.6, 1.4, 1.4, false)); // inn sign
      g.add(mesh(new THREE.BoxGeometry(1.2, 0.1, 0.35), lam(WOOD), -1.0, 0.4, 1.5)); // bench
      crates(g, r, [[1.9, 0.6]]);
      out.glows.push(glow(0xffc070, 2.2, -0.6, 1.2, 1.4), glow(0xffc070, 1.6, 1.6, 1.4, 1.6));
    }
    out.glows.push(glow(0xffc070, 1.6, 0.5, 0.85, 1.1));
  } else if (kind === 'garden') {
    const fm = lam(0xe8dcc0);
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2; if (i === 4) continue; // gate faces the camera
      g.add(mesh(new THREE.BoxGeometry(0.1, 0.5, 0.1), fm, Math.cos(a) * 2.1, 0.25, Math.sin(a) * 2.1, false));
    }
    const rail = mesh(new THREE.TorusGeometry(2.1, 0.04, 3, 24, Math.PI * 1.75), fm, 0, 0.42, 0, false); rail.rotation.set(Math.PI / 2, 0, Math.PI * 0.62); g.add(rail);
    for (const [x, z] of [[-0.9, -0.6], [0.9, -0.6], [0, 0.7]]) g.add(mesh(new THREE.BoxGeometry(1.3, 0.12, 0.8), lam(0x6e4b2f), x, 0.06, z, false));
    g.add(mesh(new THREE.CylinderGeometry(0.12, 0.18, 0.5, 6), lam(STONE), 0, 0.25, -0.05));
    g.add(mesh(new THREE.CylinderGeometry(0.4, 0.25, 0.12, 8), lam(STONE), 0, 0.55, -0.05));
    g.add(mesh(new THREE.BoxGeometry(1.0, 0.08, 0.35), lam(WOOD), 1.3, 0.38, 0.9)).rotation.y = -0.6;
    if (level >= 2) { // rose arch over the gate
      const arch = mesh(new THREE.TorusGeometry(0.6, 0.07, 4, 10, Math.PI), lam(0x3f7d3a), 0, 0.5, 2.1, false); g.add(arch);
      for (let k = 0; k < 6; k++) { const a = (k / 5) * Math.PI; g.add(mesh(new THREE.IcosahedronGeometry(0.12, 0), lam(pick(r, [0xff6fa8, 0xff3f6f, 0xffffff])), Math.cos(a) * 0.6, 0.5 + Math.sin(a) * 0.6, 2.15, false)); }
    }
    if (level >= 3) { // glasshouse at the back
      const gh = new THREE.Group(); gh.position.set(0, 0, -1.5);
      gh.add(mesh(new THREE.BoxGeometry(1.8, 0.2, 1.0), lam(STONE), 0, 0.1, 0));
      gh.add(mesh(new THREE.BoxGeometry(1.7, 0.9, 0.9), glassMat, 0, 0.65, 0, false));
      gh.add(mesh(roofGeo(1.75, 0.5, 0.95), glassMat, 0, 1.1, 0, false));
      for (const x of [-0.85, 0, 0.85]) gh.add(mesh(new THREE.BoxGeometry(0.05, 1.4, 0.95), lam(0xf4f4f4), x, 0.8, 0, false));
      g.add(gh);
    }
  } else if (kind === 'orchard') {
    fence(g, 4.6, 3.6);
    g.add(mesh(new THREE.BoxGeometry(0.08, 1.6, 0.4), lam(WOOD), 1.9, 0.75, 1.3, false)).rotation.z = 0.25; // ladder
    crates(g, r, [[-1.9, 1.3], [-1.5, 1.4]]);
    if (level >= 2) { // cider press shed
      const sh = new THREE.Group(); sh.position.set(-2.9, 0, -0.8);
      sh.add(mesh(new THREE.BoxGeometry(1.2, 1.0, 1.2), lam(0x9a6a3a), 0, 0.5, 0));
      sh.add(mesh(roofGeo(1.4, 0.6, 1.5), lam(SLATE), 0, 1.0, 0));
      for (const z of [0.8, 1.2]) sh.add(mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.5, 8), lam(0x7a4a2a), 0.3, 0.25, z));
      g.add(sh);
    }
  } else if (kind === 'pier') {
    const wood = lam(WOOD), dark = lam(DARK);
    g.add(mesh(new THREE.BoxGeometry(1.6, 0.18, PIER_LEN + 1), wood, 0, 0.15, PIER_LEN / 2));
    for (let z = 0.5; z <= PIER_LEN; z += 1.6) for (const x of [-0.75, 0.75]) g.add(mesh(new THREE.CylinderGeometry(0.1, 0.1, 2.4, 5), dark, x, -0.9, z, false));
    g.add(mesh(new THREE.BoxGeometry(0.1, 1.6, 0.1), dark, 0.7, 0.9, PIER_LEN));
    g.add(mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), LAMP, 0.7, 1.8, PIER_LEN, false));
    out.glows.push(glow(0xffd080, 2.6, 0.7, 1.8, PIER_LEN));
    const shed = new THREE.Group(); shed.position.set(-2.2, 0, -0.6); shed.rotation.y = 0.2;
    shed.add(mesh(new THREE.BoxGeometry(level >= 3 ? 2.2 : 1.4, 1, 1.2), lam(level >= 3 ? 0xd9e6ee : 0x7d5a3a), 0, 0.5, 0));
    shed.add(mesh(roofGeo(level >= 3 ? 2.4 : 1.6, 0.6, 1.5), lam(level >= 3 ? 0x3f6f8a : SLATE), 0, 1, 0));
    g.add(shed);
    g.add(mesh(new THREE.BoxGeometry(0.06, 1, 0.06), dark, 2, 0.5, -0.8, false), mesh(new THREE.BoxGeometry(0.06, 1, 0.06), dark, 3.2, 0.5, -0.8, false));
    const net = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.8), new THREE.MeshLambertMaterial({ color: 0x6a7a6a, side: THREE.DoubleSide, transparent: true, opacity: 0.8 }));
    net.position.set(2.6, 0.55, -0.8); g.add(net);
    for (const [x, z] of [[1.3, 0.6], [1.6, 1.1]]) g.add(mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.5, 8), lam(0x7a4a2a), x, 0.25, z));
    if (level >= 2) { // T-head and a second lamp
      g.add(mesh(new THREE.BoxGeometry(4.2, 0.18, 1.4), wood, 0, 0.15, PIER_LEN + 0.2));
      for (const x of [-1.9, 1.9]) g.add(mesh(new THREE.CylinderGeometry(0.1, 0.1, 2.4, 5), dark, x, -0.9, PIER_LEN + 0.2, false));
      g.add(mesh(new THREE.BoxGeometry(0.1, 1.6, 0.1), dark, -1.9, 0.9, PIER_LEN + 0.2));
      g.add(mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), LAMP, -1.9, 1.8, PIER_LEN + 0.2, false));
      out.glows.push(glow(0xffd080, 2.6, -1.9, 1.8, PIER_LEN + 0.2));
    }
    if (level >= 3) { // fish drying racks and a little crane
      for (const z of [2.2, 3.8]) {
        for (const x of [-0.6, 0.6]) g.add(mesh(new THREE.BoxGeometry(0.06, 0.9, 0.06), dark, x, 0.65, z, false));
        g.add(mesh(new THREE.BoxGeometry(1.3, 0.05, 0.05), dark, 0, 1.08, z, false));
        for (let k = 0; k < 4; k++) g.add(mesh(new THREE.BoxGeometry(0.08, 0.3, 0.14), lam(0xc0c8cc), -0.45 + k * 0.3, 0.9, z, false));
      }
      g.add(mesh(new THREE.BoxGeometry(0.15, 2.6, 0.15), dark, -0.6, 1.4, PIER_LEN - 1.2));
      const jib = mesh(new THREE.BoxGeometry(0.1, 0.1, 2.0), dark, -0.6, 2.6, PIER_LEN - 0.4, false); jib.rotation.x = -0.2; g.add(jib);
    }
  } else if (kind === 'market') {
    const cols = [[0xe74c3c, 0xffffff], [0x2e86de, 0xffffff], [0xf1c40f, 0x2e7d32], [0x8e44ad, 0xffffff], [0x27ae60, 0xf1c40f]];
    const n = level >= 2 ? 5 : 3;
    for (let i = 0; i < n; i++) {
      const a = n === 3 ? -0.9 + i * 0.9 : -1.3 + i * 0.65, x = Math.sin(a) * 2.1, z = -Math.cos(a) * 1.3 + 0.4;
      const st = new THREE.Group(); st.position.set(x, 0, z); st.rotation.y = -a;
      st.add(mesh(new THREE.BoxGeometry(1.4, 0.7, 0.7), lam(0x9a7650), 0, 0.35, 0));
      for (const px of [-0.65, 0.65]) st.add(mesh(new THREE.BoxGeometry(0.06, 1.5, 0.06), lam(DARK), px, 0.75, 0.32, false));
      for (let k = 0; k < 4; k++) { const aw = mesh(new THREE.BoxGeometry(0.36, 0.06, 1.0), lam(cols[i][k % 2]), -0.54 + k * 0.36, 1.45, 0.05, false); aw.rotation.x = 0.35; st.add(aw); }
      for (let k = 0; k < 3; k++) st.add(mesh(new THREE.IcosahedronGeometry(0.13, 0), lam(pick(r, [0xff6b3d, 0x8bc34a, 0xffd54f, 0xc0392b])), -0.4 + k * 0.4, 0.78, 0.05, false));
      g.add(st);
    }
    if (level >= 3) { // trade hall behind the stalls
      const hall = new THREE.Group(); hall.position.set(0, 0, -2.6);
      hall.add(mesh(new THREE.BoxGeometry(4.2, 0.25, 2), lam(STONE), 0, 0.12, 0));
      for (const x of [-1.9, -0.65, 0.65, 1.9]) hall.add(mesh(new THREE.CylinderGeometry(0.15, 0.15, 2.2, 8), lam(0xf2efe6), x, 1.3, 0.8));
      hall.add(mesh(new THREE.BoxGeometry(4.2, 2.2, 0.3), lam(0xf1e3c4), 0, 1.35, -0.85));
      hall.add(mesh(roofGeo(4.6, 1.2, 2.4), lam(0x8c2f2a), 0, 2.4, 0));
      hall.add(mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.08, 16), lam(0xffffff), 0, 3.1, 1.2, false)).rotation.x = Math.PI / 2;
      g.add(hall);
    } else if (level >= 2) { // fountain
      g.add(mesh(new THREE.CylinderGeometry(0.7, 0.8, 0.35, 10), lam(STONE), 0, 0.18, 0.4));
      g.add(mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.05, 10), lam(0x5ab0ff), 0, 0.36, 0.4, false));
      g.add(mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.8, 6), lam(STONE), 0, 0.6, 0.4));
    }
    g.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 3.2, 5), lam(DARK), 0, 1.6, 1.4));
    g.add(mesh(new THREE.BoxGeometry(0.8, 0.5, 0.03), lam(0xe74c3c), 0.42, 2.95, 1.4, false));
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2;
      const b = mesh(new THREE.ConeGeometry(0.1, 0.22, 3), lam(pick(r, [0xe74c3c, 0xf1c40f, 0x2e86de, 0x27ae60, 0xffffff])), Math.cos(a) * 1.6, 1.85 - 0.25 * Math.abs(Math.sin(a * 1.5)), 0.4 + Math.sin(a) * 1.0, false);
      b.rotation.x = Math.PI; g.add(b);
    }
    crates(g, r, [[1.9, 1.3], [2.3, 0.8], [-2.2, 1.2]]);
    out.glows.push(glow(0xffb060, 3, 0, 1.3, 0.6));
  } else if (kind === 'mill') {
    const h = level >= 2 ? 5.2 : 4.2;
    g.add(mesh(new THREE.CylinderGeometry(0.9, 1.35, h, 10), lam(level >= 2 ? STONE : 0xf2efe6), 0, h / 2, 0));
    g.add(mesh(new THREE.ConeGeometry(1.15, 1.2, 10), lam(0x8c2f2a), 0, h + 0.55, 0));
    g.add(mesh(new THREE.BoxGeometry(0.5, 0.9, 0.08), lam(DARK), 0, 0.45, 1.3, false));
    g.add(mesh(new THREE.BoxGeometry(0.35, 0.35, 0.06), WIN, 0, h * 0.6, 1.0, false));
    const spin = new THREE.Group(); spin.position.set(0, h - 0.2, 1.2);
    const bladeLen = level >= 2 ? 3.4 : 2.8;
    for (let k = 0; k < 4; k++) {
      const arm = new THREE.Group(); arm.rotation.z = (k * Math.PI) / 2;
      arm.add(mesh(new THREE.BoxGeometry(0.1, bladeLen, 0.06), lam(DARK), 0, bladeLen / 2, 0, false));
      arm.add(mesh(new THREE.BoxGeometry(0.55, bladeLen * 0.75, 0.03), lam(0xf4efe0), 0.3, bladeLen * 0.55, 0.02, false));
      spin.add(arm);
    }
    spin.add(mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.3, 8), lam(DARK), 0, 0, 0, false)).rotation.x = Math.PI / 2;
    g.add(spin); out.spin = spin;
    // log pile
    for (let k = 0; k < (level >= 2 ? 6 : 3); k++) { const l = mesh(new THREE.CylinderGeometry(0.15, 0.15, 1.6, 6), lam(0x7a5230), 1.7 + (k % 3) * 0.32, 0.15 + Math.floor(k / 3) * 0.28, -0.6 + (k % 2) * 0.1); l.rotation.x = Math.PI / 2; g.add(l); }
    if (level >= 2) { const sh = new THREE.Group(); sh.position.set(-2.4, 0, -0.2); sh.add(mesh(new THREE.BoxGeometry(1.6, 1.0, 1.3), lam(0x9a6a3a), 0, 0.5, 0)); sh.add(mesh(roofGeo(1.8, 0.6, 1.6), lam(SLATE), 0, 1, 0)); g.add(sh); }
  } else if (kind === 'bell') {
    const pts = [new THREE.Vector2(0.05, 0), new THREE.Vector2(0.18, -0.05), new THREE.Vector2(0.25, -0.3), new THREE.Vector2(0.32, -0.6), new THREE.Vector2(0.46, -0.75), new THREE.Vector2(0.46, -0.8), new THREE.Vector2(0, -0.8)];
    const bellMat = new THREE.MeshPhongMaterial({ color: 0xc9973a, shininess: 80, flatShading: true });
    if (level >= 2) { // stone bell tower with an open belfry
      g.add(mesh(new THREE.BoxGeometry(1.8, 3.6, 1.8), lam(STONE), 0, 1.8, 0));
      for (const [x, z] of [[-0.8, -0.8], [0.8, -0.8], [-0.8, 0.8], [0.8, 0.8]]) g.add(mesh(new THREE.BoxGeometry(0.25, 1.4, 0.25), lam(STONE), x, 4.3, z));
      g.add(mesh(new THREE.BoxGeometry(2.0, 0.25, 2.0), lam(STONE2), 0, 5.1, 0));
      g.add(mesh(new THREE.ConeGeometry(1.4, 1.8, 4), lam(SLATE), 0, 6.1, 0)).rotation.y = Math.PI / 4;
      g.add(mesh(new THREE.BoxGeometry(0.6, 1.1, 0.08), lam(DARK), 0, 0.55, 0.92, false));
      const bell = new THREE.Group(); bell.position.set(0, 4.95, 0);
      bell.add(mesh(new THREE.LatheGeometry(pts, 10), bellMat, 0, 0, 0)); bell.scale.setScalar(1.3); g.add(bell); out.bell = bell;
    } else {
      const wood = lam(0x6b4a2e);
      for (const x of [-0.8, 0.8]) { const p = mesh(new THREE.BoxGeometry(0.18, 2.6, 0.18), wood, x * 0.8, 1.25, 0); p.rotation.z = x > 0 ? 0.12 : -0.12; g.add(p); }
      g.add(mesh(new THREE.BoxGeometry(1.8, 0.18, 0.25), wood, 0, 2.55, 0));
      g.add(mesh(roofGeo(2.0, 0.5, 0.9), lam(SLATE), 0, 2.64, 0));
      const bell = new THREE.Group(); bell.position.set(0, 2.45, 0);
      bell.add(mesh(new THREE.LatheGeometry(pts, 10), bellMat, 0, 0, 0)); g.add(bell); out.bell = bell;
      g.add(mesh(new THREE.CylinderGeometry(0.9, 1.1, 0.25, 8), lam(0x9a948a), 0, 0.12, 0));
    }
  } else if (kind === 'shipyard') {
    const wood = lam(WOOD), dark = lam(DARK);
    const slip = mesh(new THREE.BoxGeometry(2.6, 0.2, 8), lam(0x6e5a40), 0, -0.4, 3.6); slip.rotation.x = 0.16; g.add(slip);
    // hull on the slipway: ribs (level 1) or planked (level 2)
    const hull = new THREE.Group(); hull.position.set(0, 0.6, 2.6); hull.rotation.x = 0.16;
    if (level >= 2) hull.add(mesh(hullGeo(5.2, 1.8, 1.4), lam(0x7a4a2a), 0, 0.4, 0)).rotation.y = Math.PI / 2;
    for (let k = 0; k < 7; k++) { const rib = mesh(new THREE.TorusGeometry(0.9, 0.06, 4, 10, Math.PI), dark, 0, 0.9, -2.2 + k * 0.7, false); rib.rotation.z = Math.PI; hull.add(rib); }
    hull.add(mesh(new THREE.BoxGeometry(0.15, 0.15, 5.4), dark, 0, 0.0, 0, false));
    g.add(hull);
    for (const x of [-2.2, 2.2]) { g.add(mesh(new THREE.BoxGeometry(0.2, 4.2, 0.2), dark, x, 2.1, 1.5)); }
    g.add(mesh(new THREE.BoxGeometry(4.6, 0.2, 0.2), dark, 0, 4.2, 1.5));
    g.add(mesh(new THREE.BoxGeometry(0.03, 2.2, 0.03), lam(0x333333), 0.6, 3.1, 1.5, false));
    for (let k = 0; k < 4; k++) g.add(mesh(new THREE.BoxGeometry(1.8, 0.18, 0.3), wood, -3.3, 0.1 + k * 0.19, -0.6 + (k % 2) * 0.32));
    if (level >= 2) { const sh = new THREE.Group(); sh.position.set(3.4, 0, -0.6); sh.add(mesh(new THREE.BoxGeometry(2.0, 1.4, 1.6), lam(0x7d5a3a), 0, 0.7, 0)); sh.add(mesh(roofGeo(2.2, 0.8, 1.9), lam(SLATE), 0, 1.4, 0)); g.add(sh); }
  } else if (kind === 'lifeboat') {
    const bh = new THREE.Group(); bh.position.set(0, 0, -0.6);
    bh.add(mesh(new THREE.BoxGeometry(2.4, 1.8, 2.6), lam(0xf2efe6), 0, 0.9, 0));
    bh.add(mesh(roofGeo(2.7, 1.1, 3.0), lam(0xc0392b), 0, 1.8, 0)).rotation.y = Math.PI / 2;
    bh.add(mesh(new THREE.BoxGeometry(1.6, 1.4, 0.06), lam(0x2e5c8a), 0, 0.7, 1.31, false));
    g.add(bh);
    const ramp = mesh(new THREE.BoxGeometry(1.3, 0.15, 6), lam(0x6e5a40), 0, -0.45, 3.6); ramp.rotation.x = 0.17; g.add(ramp);
    const boat = new THREE.Group();
    boat.add(mesh(hullGeo(2.6, 1.0, 0.7), lam(0xff7a1a), 0, 0, 0));
    boat.add(mesh(new THREE.BoxGeometry(0.8, 0.45, 0.7), lam(0x2e5c8a), -0.2, 0.45, 0));
    boat.rotation.y = -Math.PI / 2; boat.position.set(0, 0.25, 1.7);
    g.add(boat); out.boat = boat;
    g.add(mesh(new THREE.CylinderGeometry(0.04, 0.04, 3, 5), lam(DARK), 1.6, 1.5, 0.8, false));
    g.add(mesh(new THREE.BoxGeometry(0.7, 0.45, 0.03), lam(0x2e5c8a), 1.95, 2.75, 0.8, false));
    out.glows.push(glow(0xffd080, 2, 0.9, 1.3, 0.8));
  } else {
    // beacon tower: stone column with a brazier lamp
    const h = level >= 2 ? 5.6 : 4.2;
    g.add(mesh(new THREE.CylinderGeometry(0.75, 1.0, h, 8), lam(STONE), 0, h / 2, 0));
    for (const y of [1.2, 2.6, ...(level >= 2 ? [4.0] : [])]) g.add(mesh(new THREE.CylinderGeometry(0.82, 0.86, 0.18, 8), lam(STONE2), 0, y, 0));
    g.add(mesh(new THREE.CylinderGeometry(0.95, 0.7, 0.3, 8), lam(0x3c414a), 0, h + 0.15, 0));
    g.add(mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.7, 8), LAMP, 0, h + 0.65, 0, false));
    g.add(mesh(new THREE.ConeGeometry(0.75, 0.7, 8), lam(0x8c2f2a), 0, h + 1.35, 0));
    out.glows.push(glow(0xffe0a0, level >= 2 ? 7 : 5, 0, h + 0.65, 0));
  }
  mergeStatic(g, (o) => o === out.bell || o === out.spin || o === out.boat);
  for (const s of out.glows) g.add(s);
  return out;
}

// ---------- ships ----------
function hullGeo(len: number, beam: number, depth: number): THREE.BufferGeometry {
  const s = new THREE.Shape();
  s.moveTo(-len / 2, -beam * 0.38);
  s.lineTo(len * 0.18, -beam / 2);
  s.quadraticCurveTo(len * 0.42, -beam * 0.45, len / 2, 0);
  s.quadraticCurveTo(len * 0.42, beam * 0.45, len * 0.18, beam / 2);
  s.lineTo(-len / 2, beam * 0.38);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false });
  g.rotateX(-Math.PI / 2); g.translate(0, -depth * 0.55, 0);
  return g;
}
function sail(w: number, h: number, color: number, tri: boolean): THREE.Mesh {
  const shp = new THREE.Shape();
  if (tri) { shp.moveTo(0, 0); shp.lineTo(-w, 0); shp.lineTo(0, h); } else { shp.moveTo(0, 0); shp.lineTo(-w, 0); shp.lineTo(-w * 0.8, h * 0.85); shp.lineTo(0, h); }
  shp.closePath();
  const m = new THREE.Mesh(new THREE.ShapeGeometry(shp), new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide, flatShading: true }));
  m.rotation.y = Math.PI / 2 + 0.25; m.castShadow = true; return m;
}

export interface ShipModel { group: THREE.Group; body: THREE.Group; smoke?: THREE.Vector3; lights: THREE.Sprite[]; wake: THREE.Mesh }

let wakeTex: THREE.Texture | null = null;
function wakeTexture(): THREE.Texture {
  if (wakeTex) return wakeTex;
  const c = document.createElement('canvas'); c.width = 64; c.height = 128;
  const g = c.getContext('2d')!;
  const gr = g.createLinearGradient(0, 0, 0, 128); gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.beginPath(); g.moveTo(26, 0); g.lineTo(38, 0); g.lineTo(64, 128); g.lineTo(0, 128); g.closePath(); g.fill();
  g.globalCompositeOperation = 'destination-out'; g.beginPath(); g.moveTo(32, 6); g.lineTo(52, 128); g.lineTo(12, 128); g.closePath(); g.fillStyle = 'rgba(0,0,0,0.7)'; g.fill();
  wakeTex = new THREE.CanvasTexture(c); return wakeTex;
}

export function makeShip(kind: string, seed: number): ShipModel {
  const r = mulberry(seed * 131 + 7);
  const group = new THREE.Group(), body = new THREE.Group(); group.add(body);
  const lights: THREE.Sprite[] = [];
  let smoke: THREE.Vector3 | undefined;
  if (kind === 'steamer') {
    body.add(mesh(hullGeo(6.5, 1.8, 1.3), lam(pick(r, [0x2c3e50, 0x1f2a36, 0x6a1f1f])), 0, 0, 0));
    body.add(mesh(new THREE.BoxGeometry(6.2, 0.15, 1.5), lam(0xb33a2a), -0.15, -0.35, 0, false));
    body.add(mesh(new THREE.BoxGeometry(2.6, 0.9, 1.3), lam(0xf2efe6), -0.6, 1.0, 0));
    body.add(mesh(new THREE.BoxGeometry(1.2, 0.6, 1.1), lam(0xf2efe6), -0.3, 1.7, 0));
    for (let i = 0; i < 4; i++) body.add(mesh(new THREE.BoxGeometry(0.25, 0.25, 0.05), WIN, -1.6 + i * 0.6, 1.05, 0.67, false));
    body.add(mesh(new THREE.CylinderGeometry(0.32, 0.36, 1.5, 10), lam(0xc0392b), 0.9, 1.8, 0));
    body.add(mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.3, 10), lam(0x1a1a1a), 0.9, 2.5, 0));
    body.add(mesh(new THREE.BoxGeometry(0.06, 2.4, 0.06), lam(0x3a3a3a), 2.2, 1.6, 0, false));
    smoke = new THREE.Vector3(0.9, 2.7, 0);
  } else if (kind === 'circus') { // red-and-gold hull, a striped big top on deck, bunting from the masts
    body.add(mesh(hullGeo(6.4, 1.8, 1.2), lam(0xc0392b), 0, 0, 0));
    body.add(mesh(new THREE.BoxGeometry(6.0, 0.16, 1.55), lam(0xf2c94c), -0.1, 0.5, 0, false));
    for (let i = 0; i < 10; i++) { const seg = new THREE.Mesh(new THREE.ConeGeometry(1.25, 1.3, 10, 1, true, (i / 10) * Math.PI * 2, Math.PI / 5), lam(i % 2 ? 0xe74c3c : 0xffffff)); seg.position.set(-0.6, 1.85, 0); body.add(seg); }
    body.add(mesh(new THREE.CylinderGeometry(1.25, 1.25, 0.9, 10), lam(0xfff2d0), -0.6, 0.95, 0));
    body.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 1, 4), lam(0x5e472b), -0.6, 2.9, 0, false));
    body.add(mesh(new THREE.BoxGeometry(0.5, 0.3, 0.03), lam(0xffd23f), -0.35, 3.25, 0, false));
    body.add(mesh(new THREE.CylinderGeometry(0.06, 0.08, 4, 5), lam(0x5e472b), 1.9, 2.4, 0, false));
    const s1 = sail(1.5, 2.6, 0xffd23f, false); s1.position.set(1.85, 1.0, 0); body.add(s1);
  } else if (kind === 'royal') { // white and gold yacht with purple sails and a crown on the masthead
    body.add(mesh(hullGeo(7, 1.7, 1.2), lam(0xf4f1ea), 0, 0, 0));
    body.add(mesh(new THREE.BoxGeometry(6.6, 0.14, 1.6), lam(0xd4a63a), -0.15, -0.1, 0, false));
    body.add(mesh(new THREE.BoxGeometry(2.0, 0.7, 1.1), lam(0x5b3f8c), -1.6, 0.85, 0));
    for (const [x, h] of [[1.1, 5.2], [-0.6, 5.8]]) {
      body.add(mesh(new THREE.CylinderGeometry(0.06, 0.08, h, 5), lam(0xd4a63a), x, h / 2 + 0.4, 0, false));
      const sl = sail(1.9, h * 0.72, 0x7d4fc0, false); sl.position.set(x - 0.05, 0.9, 0); body.add(sl);
    }
    body.add(mesh(new THREE.ConeGeometry(0.22, 0.3, 5), lam(0xf2c94c), -0.6, 6.4, 0, false));
  } else if (kind === 'research') { // a white steamer with a radar dome and a crane
    body.add(mesh(hullGeo(6.2, 1.7, 1.3), lam(0xf2f4f6), 0, 0, 0));
    body.add(mesh(new THREE.BoxGeometry(6.0, 0.15, 1.5), lam(0x2e86c1), -0.15, -0.35, 0, false));
    body.add(mesh(new THREE.BoxGeometry(2.2, 1.0, 1.25), lam(0xf2efe6), -0.9, 1.0, 0));
    body.add(mesh(new THREE.SphereGeometry(0.5, 10, 8), lam(0xffffff), -0.9, 2.0, 0));
    body.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.6, 4), lam(0x3a3a3a), -1.6, 2.2, 0, false));
    const jib = mesh(new THREE.BoxGeometry(2.2, 0.1, 0.1), lam(0xe67e22), 1.6, 1.6, 0, false); jib.rotation.z = 0.5; body.add(jib);
    body.add(mesh(new THREE.CylinderGeometry(0.28, 0.32, 1.1, 10), lam(0x2e86c1), 0.4, 1.5, 0));
    smoke = new THREE.Vector3(0.4, 2.1, 0);
  } else if (kind === 'schooner') {
    body.add(mesh(hullGeo(6, 1.6, 1.1), lam(pick(r, [0x7a4a2a, 0x2f4f6f, 0x3d5a3d])), 0, 0, 0));
    body.add(mesh(new THREE.BoxGeometry(5.6, 0.12, 1.45), lam(0xe8dcc0), -0.1, 0.5, 0, false));
    body.add(mesh(new THREE.BoxGeometry(1.2, 0.5, 0.9), lam(0x8b6b3e), -1.8, 0.75, 0));
    for (const [x, h] of [[1.0, 4.6], [-0.9, 5.2]]) {
      body.add(mesh(new THREE.CylinderGeometry(0.06, 0.08, h, 5), lam(0x5e472b), x, h / 2 + 0.4, 0, false));
      const s = sail(1.9, h * 0.75, 0xf6f1e3, false); s.position.set(x - 0.05, 0.9, 0); body.add(s);
    }
    const jib = sail(1.8, 3.2, 0xf6f1e3, true); jib.position.set(2.9, 0.7, 0); body.add(jib);
  } else {
    body.add(mesh(hullGeo(4.2, 1.5, 1.0), lam(pick(r, [0x9b5b33, 0x3e6e8e, 0x8a3a2a, 0x4a7a4a])), 0, 0, 0));
    body.add(mesh(new THREE.BoxGeometry(3.8, 0.1, 1.3), lam(0xd8c8a0), -0.1, 0.45, 0, false));
    body.add(mesh(new THREE.CylinderGeometry(0.06, 0.08, 3.6, 5), lam(0x5e472b), 0.4, 2.2, 0, false));
    const s = sail(1.7, 2.8, pick(r, [0xb5532f, 0xc9a96e, 0xa04030]), false); s.position.set(0.35, 0.8, 0); body.add(s);
    for (let i = 0; i < 2; i++) body.add(mesh(new THREE.BoxGeometry(0.4, 0.3, 0.4), lam(0xa07a4a), -1 + i * 0.5, 0.65, 0.1, false));
  }
  // running lights (port red, starboard green, masthead white), visible at night through fog
  for (const [c, x, y, z] of [[0xff3030, 0.6, 0.7, -0.8], [0x30ff60, 0.6, 0.7, 0.8], [0xfff2c0, 1.0, kind === 'smack' ? 4 : 3.2, 0]] as const) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: c, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, opacity: 0 }));
    s.position.set(x, y, z); s.scale.setScalar(1.6); body.add(s); lights.push(s);
  }
  mergeStatic(body);
  const wg = new THREE.PlaneGeometry(4, 12); wg.rotateZ(-Math.PI / 2); wg.rotateX(-Math.PI / 2); // narrow end toward the bow (+x)
  const wake = new THREE.Mesh(wg, new THREE.MeshBasicMaterial({ map: wakeTexture(), transparent: true, depthWrite: false, opacity: 0.5 }));
  wake.position.set(-6.5, 0.08, 0);
  group.add(wake);
  return { group, body, smoke, lights, wake };
}
