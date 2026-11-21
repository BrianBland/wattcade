// Crop fields drawn as real little farms: a ploughed soil patch that drapes over the terrain (furrows, a grassy
// margin), and rows of crop tufts that sprout, fill out green and ripen to gold as the field grows, sway in the wind,
// and lie flattened and muddy while the field is drowned. Render-only; growth comes from the sim's `jobs.fields`.
import * as THREE from 'three';
import type { WatershedSnapshot } from '../sim/sim';
import { hash2 } from '../sim/terrain';
import { organic, swayMaterial } from './models';

const SEG = 10;          // soil patch grid per side
const ROW = 0.62;        // crop spacing (world units)
const C = { sprout: new THREE.Color(0x7fcf4a), green: new THREE.Color(0x4f9a2e), ripe: new THREE.Color(0xe7be3c), drowned: new THREE.Color(0x6a5a3a) };

function soilTexture(): THREE.Texture | null {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d'); if (!g) return null;
  g.fillStyle = '#8a6440'; g.fillRect(0, 0, 128, 128);
  // furrows: dark troughs and lit ridges, a little ragged
  for (let y = 0; y < 128; y += 11) {
    g.fillStyle = '#5a3c22'; g.fillRect(0, y + 6, 128, 4);
    g.fillStyle = '#a07a50'; g.fillRect(0, y + 1, 128, 2);
  }
  for (let k = 0; k < 500; k++) { g.fillStyle = k % 2 ? 'rgba(40,25,10,0.25)' : 'rgba(200,170,120,0.2)'; g.fillRect((k * 37) % 128, (k * 91) % 128, 2, 1); }
  // a grassy margin around the plot
  g.strokeStyle = '#5f8f3a'; g.lineWidth = 7; g.strokeRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

/** A crop tuft: a few leaning blades around a seed head; ~1 tall, base at y = 0. */
function tuftGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (let k = 0; k < 4; k++) {
    const b = new THREE.ConeGeometry(0.09, 1, 4, 1, true); b.translate(0, 0.5, 0);
    b.rotateZ(0.18 + (k % 2) * 0.1); b.rotateY((k / 4) * Math.PI * 2 + 0.4);
    parts.push(b.index ? b.toNonIndexed() : b);
  }
  const head = new THREE.SphereGeometry(0.13, 6, 4); head.scale(1, 2.1, 1); head.translate(0, 1.02, 0);
  parts.push(head.toNonIndexed());
  const merged = new THREE.BufferGeometry();
  const pos: number[] = [];
  for (const p of parts) pos.push(...(p.getAttribute('position').array as Float32Array));
  merged.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  return organic(merged, 0.02, 3, new THREE.Color(0xb0b0b0), new THREE.Color(0xffffff), 0, 1.1, 2);
}

export class CropFields {
  readonly group = new THREE.Group();
  private soil: THREE.Mesh[] = [];
  private crops: THREE.InstancedMesh;
  private spots: Array<{ f: number; u: number; v: number; s: number; rot: number }> = [];
  private m = new THREE.Matrix4(); private q = new THREE.Quaternion(); private e = new THREE.Euler(); private p = new THREE.Vector3(); private sc = new THREE.Vector3();
  private c = new THREE.Color(); private shown: number[] = []; private acc = 1;

  constructor(s: WatershedSnapshot, private wx: (j: number) => number, private wz: (i: number) => number, private heightAt: (x: number, y: number) => number, wind: { value: number }) {
    const tex = soilTexture();
    s.jobs.fields.forEach((f, fi) => {
      const g = new THREE.PlaneGeometry(f.r * 2, f.r * 2, SEG, SEG).rotateX(-Math.PI / 2);
      const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, map: tex, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
      const m = new THREE.Mesh(g, mat);
      m.position.set(wx(f.y), 0, wz(f.x)); m.receiveShadow = true;
      this.soil.push(m); this.group.add(m);
      // rows run across the field (along world X) with a little jitter
      const n = Math.floor((f.r * 2 - 0.8) / ROW);
      for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) {
        this.spots.push({ f: fi, u: -f.r + 0.4 + (a + 0.5) * ROW + (hash2(a, b, 71 + fi) - 0.5) * 0.12, v: -f.r + 0.4 + (b + 0.5) * ROW, s: 0.85 + hash2(a, b, 72 + fi) * 0.3, rot: hash2(a, b, 73) * 6.28 });
      }
      this.shown.push(0);
    });
    this.crops = new THREE.InstancedMesh(tuftGeometry(), swayMaterial(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }), wind, 0.12, 0.1), Math.max(1, this.spots.length));
    this.crops.castShadow = true; this.crops.receiveShadow = true; this.crops.frustumCulled = false;
    this.crops.setColorAt(0, C.green);
    this.group.add(this.crops);
  }

  update(s: WatershedSnapshot, dt: number): void {
    const F = s.jobs.fields;
    // ease each field's drawn growth (a harvest snaps back to fresh sprouts)
    F.forEach((f, k) => { const g = f.growth; this.shown[k] = g < this.shown[k] - 0.3 ? g : this.shown[k] + (g - this.shown[k]) * (1 - Math.exp(-dt * 2)); });
    this.acc += dt;
    if (this.acc < 0.1) return;   // terrain follows at 10 Hz; that's plenty for the fields
    this.acc = 0;
    F.forEach((f, k) => {
      const m = this.soil[k], P = m.geometry.getAttribute('position') as THREE.BufferAttribute, A = P.array as Float32Array;
      for (let v = 0; v < P.count; v++) A[v * 3 + 1] = this.heightAt(f.x + A[v * 3 + 2], f.y + A[v * 3]) + 0.06;
      P.needsUpdate = true; m.geometry.computeVertexNormals();
      (m.material as THREE.MeshStandardMaterial).color.setScalar(f.drowned ? 0.55 : 1);
    });
    this.spots.forEach((sp, n) => {
      const f = F[sp.f], g = this.shown[sp.f];
      const x = f.x + sp.v, y = f.y + sp.u;
      const flat = f.drowned ? 1 : 0;
      this.e.set(flat * 1.2, sp.rot, flat * 0.3, 'YXZ'); this.q.setFromEuler(this.e);
      this.p.set(this.wx(y), this.heightAt(x, y) + 0.04, this.wz(x));
      const hgt = (0.12 + 0.95 * Math.min(1, g * 1.25)) * sp.s;
      this.sc.set(0.7 + 0.5 * g, hgt, 0.7 + 0.5 * g);
      this.m.compose(this.p, this.q, this.sc);
      this.crops.setMatrixAt(n, this.m);
      if (f.drowned) this.c.copy(C.drowned);
      else this.c.copy(C.sprout).lerp(C.green, Math.min(1, g * 2)).lerp(C.ripe, Math.max(0, (g - 0.55) / 0.4));
      this.crops.setColorAt(n, this.c.multiplyScalar(0.9 + 0.2 * sp.s - 0.1));
    });
    this.crops.instanceMatrix.needsUpdate = true;
    if (this.crops.instanceColor) this.crops.instanceColor.needsUpdate = true;
  }
}
