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

export interface BuildingModel {
  group: THREE.Group;
  chimney?: THREE.Vector3;   // local smoke origin
  bell?: THREE.Object3D;     // swings when the bell rings
  glows: THREE.Sprite[];     // night glows
  pierEnd?: THREE.Vector3;   // local
}

const WALLS = [0xf3eee2, 0xf1e3c4, 0xd9e6ee, 0xf2d7d2, 0xdfe8d2, 0xfaf3d0];
const ROOFS = [0xb5532f, 0x5a6472, 0x9a6a3a, 0x3f6f8a, 0xa23b3b];

function glow(color: number, size: number, x: number, y: number, z: number): THREE.Sprite {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 }));
  s.position.set(x, y, z); s.scale.setScalar(size); return s;
}

export function makeBuilding(kind: string, seed: number): BuildingModel {
  const r = mulberry(seed * 977 + kind.length * 13);
  const g = new THREE.Group();
  const out: BuildingModel = { group: g, glows: [] };
  if (kind === 'cottage') {
    const w = 2 + r() * 0.5, d = 1.6 + r() * 0.3, h = 1.3 + r() * 0.3;
    g.add(mesh(new THREE.BoxGeometry(w, h, d), lam(pick(r, WALLS)), 0, h / 2, 0));
    g.add(mesh(roofGeo(w + 0.3, 1 + r() * 0.3, d + 0.4), lam(pick(r, ROOFS)), 0, h, 0));
    const cx = (r() > 0.5 ? 1 : -1) * w * 0.28;
    g.add(mesh(new THREE.BoxGeometry(0.32, 0.9, 0.32), lam(0x8b7f74), cx, h + 0.75, -d * 0.15));
    out.chimney = new THREE.Vector3(cx, h + 1.3, -d * 0.15);
    g.add(mesh(new THREE.BoxGeometry(0.45, 0.85, 0.08), lam(pick(r, [0x4a6a8a, 0x6a3a2a, 0x3d6b4a])), -w * 0.15, 0.43, d / 2 + 0.02, false));
    for (const x of [w * 0.22, -w * 0.38]) g.add(mesh(new THREE.BoxGeometry(0.38, 0.38, 0.06), WIN, x, h * 0.6, d / 2 + 0.03, false));
    g.add(mesh(new THREE.BoxGeometry(0.38, 0.38, 0.06), WIN, w / 2 + 0.03, h * 0.6, 0, false)).rotation.y = Math.PI / 2;
    out.glows.push(glow(0xffc070, 1.6, w * 0.22, h * 0.6, d / 2 + 0.3));
  } else if (kind === 'garden') {
    const fence = lam(0xe8dcc0);
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2; if (i === 4) continue; // gate faces the camera
      g.add(mesh(new THREE.BoxGeometry(0.1, 0.5, 0.1), fence, Math.cos(a) * 2.1, 0.25, Math.sin(a) * 2.1, false));
    }
    const rail = mesh(new THREE.TorusGeometry(2.1, 0.04, 3, 24, Math.PI * 1.75), fence, 0, 0.42, 0, false); rail.rotation.set(Math.PI / 2, 0, Math.PI * 0.62); g.add(rail);
    for (const [x, z] of [[-0.9, -0.6], [0.9, -0.6], [0, 0.7]]) g.add(mesh(new THREE.BoxGeometry(1.3, 0.12, 0.8), lam(0x6e4b2f), x, 0.06, z, false));
    g.add(mesh(new THREE.CylinderGeometry(0.12, 0.18, 0.5, 6), lam(0xb8b0a0), 0, 0.25, -0.05));
    g.add(mesh(new THREE.CylinderGeometry(0.4, 0.25, 0.12, 8), lam(0xb8b0a0), 0, 0.55, -0.05));
    g.add(mesh(new THREE.BoxGeometry(1.0, 0.08, 0.35), lam(0x8b6b3e), 1.3, 0.38, 0.9)).rotation.y = -0.6;
  } else if (kind === 'pier') {
    const wood = lam(0x8b6b3e), dark = lam(0x5e472b);
    g.add(mesh(new THREE.BoxGeometry(1.6, 0.18, PIER_LEN + 1), wood, 0, 0.15, PIER_LEN / 2));
    for (let z = 0.5; z <= PIER_LEN; z += 1.6) for (const x of [-0.75, 0.75]) g.add(mesh(new THREE.CylinderGeometry(0.1, 0.1, 2.4, 5), dark, x, -0.9, z, false));
    g.add(mesh(new THREE.BoxGeometry(0.1, 1.6, 0.1), dark, 0.7, 0.9, PIER_LEN));
    g.add(mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), LAMP, 0.7, 1.8, PIER_LEN, false));
    out.glows.push(glow(0xffd080, 2.6, 0.7, 1.8, PIER_LEN));
    // fishing shed on the sand
    const shed = new THREE.Group(); shed.position.set(-2.2, 0, -0.6); shed.rotation.y = 0.2;
    shed.add(mesh(new THREE.BoxGeometry(1.4, 1, 1.2), lam(0x7d5a3a), 0, 0.5, 0));
    shed.add(mesh(roofGeo(1.6, 0.6, 1.5), lam(0x4a4f57), 0, 1, 0));
    g.add(shed);
    // nets drying + barrels
    g.add(mesh(new THREE.BoxGeometry(0.06, 1, 0.06), dark, 2, 0.5, -0.8, false), mesh(new THREE.BoxGeometry(0.06, 1, 0.06), dark, 3.2, 0.5, -0.8, false));
    const net = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.8), new THREE.MeshLambertMaterial({ color: 0x6a7a6a, side: THREE.DoubleSide, transparent: true, opacity: 0.8 }));
    net.position.set(2.6, 0.55, -0.8); g.add(net);
    for (const [x, z] of [[1.3, 0.6], [1.6, 1.1]]) g.add(mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.5, 8), lam(0x7a4a2a), x, 0.25, z));
    out.pierEnd = new THREE.Vector3(0, 0.25, PIER_LEN);
  } else if (kind === 'market') {
    const cols = [[0xe74c3c, 0xffffff], [0x2e86de, 0xffffff], [0xf1c40f, 0x2e7d32]];
    for (let i = 0; i < 3; i++) {
      const a = -0.9 + i * 0.9, x = Math.sin(a) * 2, z = -Math.cos(a) * 1.2 + 0.4;
      const st = new THREE.Group(); st.position.set(x, 0, z); st.rotation.y = -a;
      st.add(mesh(new THREE.BoxGeometry(1.4, 0.7, 0.7), lam(0x9a7650), 0, 0.35, 0));
      for (const px of [-0.65, 0.65]) st.add(mesh(new THREE.BoxGeometry(0.06, 1.5, 0.06), lam(0x5e472b), px, 0.75, 0.32, false));
      for (let k = 0; k < 4; k++) {
        const aw = mesh(new THREE.BoxGeometry(0.36, 0.06, 1.0), lam(cols[i][k % 2]), -0.54 + k * 0.36, 1.45, 0.05, false); aw.rotation.x = 0.35; st.add(aw);
      }
      for (let k = 0; k < 3; k++) st.add(mesh(new THREE.IcosahedronGeometry(0.13, 0), lam(pick(r, [0xff6b3d, 0x8bc34a, 0xffd54f, 0xc0392b])), -0.4 + k * 0.4, 0.78, 0.05, false));
      g.add(st);
    }
    g.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 3.2, 5), lam(0x5e472b), 0, 1.6, 1.3));
    const flag = mesh(new THREE.BoxGeometry(0.8, 0.5, 0.03), lam(0xe74c3c), 0.42, 2.95, 1.3, false); g.add(flag);
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2;
      const b = mesh(new THREE.ConeGeometry(0.1, 0.22, 3), lam(pick(r, [0xe74c3c, 0xf1c40f, 0x2e86de, 0x27ae60, 0xffffff])), Math.cos(a) * 1.6, 1.85 - 0.25 * Math.abs(Math.sin(a * 1.5)), 0.4 + Math.sin(a) * 1.0, false);
      b.rotation.x = Math.PI; g.add(b);
    }
    for (const [x, z] of [[1.9, 1.2], [2.2, 0.7], [-2.1, 1.1]]) g.add(mesh(new THREE.BoxGeometry(0.45, 0.45, 0.45), lam(0xa07a4a), x, 0.23, z));
    out.glows.push(glow(0xffb060, 3, 0, 1.3, 0.6));
  } else if (kind === 'bell') {
    const wood = lam(0x6b4a2e);
    for (const x of [-0.8, 0.8]) { const p = mesh(new THREE.BoxGeometry(0.18, 2.6, 0.18), wood, x * 0.8, 1.25, 0); p.rotation.z = x > 0 ? 0.12 : -0.12; g.add(p); }
    g.add(mesh(new THREE.BoxGeometry(1.8, 0.18, 0.25), wood, 0, 2.55, 0));
    g.add(mesh(roofGeo(2.0, 0.5, 0.9), lam(0x4a4f57), 0, 2.64, 0));
    const pts = [new THREE.Vector2(0.05, 0), new THREE.Vector2(0.18, -0.05), new THREE.Vector2(0.25, -0.3), new THREE.Vector2(0.32, -0.6), new THREE.Vector2(0.46, -0.75), new THREE.Vector2(0.46, -0.8), new THREE.Vector2(0, -0.8)];
    const bell = new THREE.Group(); bell.position.set(0, 2.45, 0);
    const bm = mesh(new THREE.LatheGeometry(pts, 10), new THREE.MeshPhongMaterial({ color: 0xc9973a, shininess: 80, flatShading: true }), 0, 0, 0);
    bell.add(bm); g.add(bell); out.bell = bell;
    g.add(mesh(new THREE.CylinderGeometry(0.9, 1.1, 0.25, 8), lam(0x9a948a), 0, 0.12, 0));
  } else {
    // beacon tower: stone column with a brazier lamp
    g.add(mesh(new THREE.CylinderGeometry(0.75, 1.0, 4.2, 8), lam(0xb8b0a0), 0, 2.1, 0));
    for (const y of [1.2, 2.6]) g.add(mesh(new THREE.CylinderGeometry(0.82, 0.86, 0.18, 8), lam(0x8a8378), 0, y, 0));
    g.add(mesh(new THREE.CylinderGeometry(0.95, 0.7, 0.3, 8), lam(0x3c414a), 0, 4.35, 0));
    g.add(mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.7, 8), LAMP, 0, 4.85, 0, false));
    g.add(mesh(new THREE.ConeGeometry(0.75, 0.7, 8), lam(0x8c2f2a), 0, 5.55, 0));
    out.glows.push(glow(0xffe0a0, 5, 0, 4.85, 0));
  }
  mergeStatic(g, (o) => o === out.bell);
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
