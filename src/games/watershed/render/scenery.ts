// Watershed scenery: sky gradient, forest that dies where the river erodes/floods/buries it, drifting clouds, a wavy sea.
import * as THREE from 'three';
import { SEA, hash2, sample } from '../sim/terrain';
import { broadleafGeometry2, foliageMaterial, pineGeometry2, rockGeometry, rockMaterial, trunkGeometry2 } from './flora';
import type { WatershedSnapshot } from '../sim/sim';

/** The sky palette (linear colours): deep zenith, pale hazy horizon; fog and the sea's reflection use the same. */
export const SKY = { zenith: new THREE.Color(0x2f7fd0), horizon: new THREE.Color(0xcfe6f2), haze: new THREE.Color(0xc4dcea) };

export function skyTexture(): THREE.Texture | THREE.Color {
  if (typeof document === 'undefined') return SKY.haze.clone();
  const c = document.createElement('canvas'); c.width = 4; c.height = 512;
  const g = c.getContext('2d');
  if (!g) return SKY.haze.clone();
  const grad = g.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0, '#2c78c8'); grad.addColorStop(0.35, '#5ea3dd'); grad.addColorStop(0.7, '#a9d2ee'); grad.addColorStop(0.9, '#d6ebf5'); grad.addColorStop(1, '#eef6f2');
  g.fillStyle = grad; g.fillRect(0, 0, 4, 512);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

interface Tree { i: number; j: number; s: number; life: number; kind: 0 | 1 | 2; slot: number; rot: number }

/**
 * Instanced pines, broadleaf trees and boulders on the valley sides, swaying in the wind. Trees die (tip over and
 * sink away) when the ground under them is eroded, flooded or buried; boulders get buried by silt.
 */
export class Forest {
  readonly group = new THREE.Group();
  readonly wind = { value: 0 };
  private trees: Tree[] = [];
  private meshes: THREE.InstancedMesh[];    // pines, broadleaf, boulders
  private trunks: THREE.InstancedMesh;
  private m = new THREE.Matrix4(); private q = new THREE.Quaternion(); private e = new THREE.Euler(); private p = new THREE.Vector3(); private sc = new THREE.Vector3();
  dead = 0;

  constructor(s: WatershedSnapshot, private wx: (j: number) => number, private wz: (i: number) => number) {
    const { nx, ny, h0, hard } = s;
    const counts = [0, 0, 0];
    for (let j = 6; j < ny - 2; j += 2) for (let i = 2; i < nx - 2; i += 2) {
      const fi = i + hash2(i, j, 5) * 1.6, fj = j + hash2(i, j, 9) * 1.6;
      const z = sample(h0, nx, ny, fi, fj);
      const slope = Math.abs(sample(h0, nx, ny, fi + 1, fj) - sample(h0, nx, ny, fi - 1, fj)) + Math.abs(sample(h0, nx, ny, fi, fj + 1) - sample(h0, nx, ny, fi, fj - 1));
      const rocky = hard[Math.round(fj) * nx + Math.round(fi)] < 0.45;
      const r = hash2(i, j, 77);
      let kind: 0 | 1 | 2 | -1 = -1;
      if (z > 0.8 && z < 26 && (rocky || slope > 1.4) && r < 0.12) kind = 2;
      else if (z > 0.8 && z < 24 && slope < 1.6 && !rocky && r < (z < 4 ? 0.25 : z < 16 ? 0.55 : 0.3)) kind = z > 12 || hash2(i, j, 21) < 0.6 ? 0 : 1;
      if (kind === -1) continue;
      this.trees.push({ i: fi, j: fj, s: 0.75 + hash2(i, j, 13) * 0.75, life: 1, kind, slot: counts[kind]++, rot: hash2(i, j, 31) * Math.PI * 2 });
    }
    const pineMat = foliageMaterial(this.wind, { freq: 4.2, stretch: [1, 1.7, 1], bump: 0.7 });
    const leafMat = foliageMaterial(this.wind, { amount: 0.05, freq: 3.0, bump: 1.0 });
    this.meshes = [
      new THREE.InstancedMesh(pineGeometry2(), pineMat, Math.max(1, counts[0])),
      new THREE.InstancedMesh(broadleafGeometry2(), leafMat, Math.max(1, counts[1])),
      new THREE.InstancedMesh(rockGeometry(), rockMaterial(), Math.max(1, counts[2])),
    ];
    this.trunks = new THREE.InstancedMesh(trunkGeometry2(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }), Math.max(1, counts[0] + counts[1]));
    const tint = new THREE.Color();
    // per-tree tint (multiplies the baked gradient): brightness plus a hue drift, so a forest isn't one green;
    // a few broadleaf trees run yellow-green or turn early to gold
    for (const t of this.trees) {
      const a = hash2(t.slot, t.kind, 3), b = hash2(t.slot, t.kind, 4), v = 0.86 + a * 0.26;
      if (t.kind === 1 && b > 0.93) tint.setRGB(1.35 * v, 1.0 * v, 0.45 * v);
      else if (t.kind === 1) tint.setRGB(v * (0.92 + b * 0.22), v, v * (0.9 - b * 0.15));
      else if (t.kind === 0) tint.setRGB(v * (0.9 + b * 0.12), v, v * (0.95 + (1 - b) * 0.12));
      else tint.setScalar(v);
      this.meshes[t.kind].setColorAt(t.slot, tint);
    }
    this.meshes.forEach((m, k) => { m.count = counts[k]; });
    this.trunks.count = counts[0] + counts[1];
    for (const m of [...this.meshes, this.trunks]) { m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false; this.group.add(m); }
  }

  /** Re-seat on the drawn terrain and kill trees whose ground was eroded, flooded or buried. */
  update(s: WatershedSnapshot, dt: number, heightAt: (x: number, y: number) => number): void {
    const { nx, h, h0, w } = s;
    this.dead = 0;
    let trunk = 0;
    for (const t of this.trees) {
      const c = Math.round(t.j) * nx + Math.round(t.i);
      const z = heightAt(t.i, t.j);
      if (t.kind === 2) {
        // boulders don't die; silt slowly buries them
        const bury = Math.max(0, h[c] - h0[c]);
        this.p.set(this.wx(t.j), z - bury * 0.6 + 0.15, this.wz(t.i));
        this.q.setFromAxisAngle(Y, t.rot);
        this.sc.setScalar(t.s * 0.9);
        this.m.compose(this.p, this.q, this.sc);
        this.meshes[2].setMatrixAt(t.slot, this.m);
        continue;
      }
      if (t.life > 0 && (h0[c] - h[c] > 0.45 || h[c] - h0[c] > 0.9 || w[c] > 0.18 || z < SEA)) t.life = Math.max(0, t.life - dt * 0.8);
      if (t.life < 1) this.dead++;
      const tip = (1 - t.life) * 1.3, k01 = t.life > 0 ? 0.35 + 0.65 * t.life : 0;
      this.e.set(tip * 0.6, t.rot, tip, 'YXZ'); this.q.setFromEuler(this.e);
      this.p.set(this.wx(t.j), z - 0.1 - (1 - t.life) * 0.6, this.wz(t.i));
      this.sc.setScalar(t.s * k01 * (t.kind === 1 ? 0.95 : 1));
      this.m.compose(this.p, this.q, this.sc);
      this.meshes[t.kind].setMatrixAt(t.slot, this.m); this.trunks.setMatrixAt(trunk++, this.m);
    }
    for (const m of [...this.meshes, this.trunks]) m.instanceMatrix.needsUpdate = true;
  }

  get count() { return this.trees.length; }
}
const Y = new THREE.Vector3(0, 1, 0);

/** A few puffy low-poly clouds drifting downstream (they cast soft shadows on the valley). */
export class Clouds {
  readonly group = new THREE.Group();
  private items: THREE.Group[] = [];
  constructor(private span: number) {
    const mat = new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x6a7a88, transparent: true, opacity: 0.88 });
    for (let c = 0; c < 6; c++) {
      const g = new THREE.Group();
      const n = 4 + (c % 3);
      for (let k = 0; k < n; k++) {
        const m = new THREE.Mesh(new THREE.IcosahedronGeometry(2.2 + hash2(c, k, 3) * 1.8, 2), mat);
        m.position.set((k - n / 2) * 2.4, hash2(c, k, 5) * 1.2, (hash2(c, k, 7) - 0.5) * 3); m.scale.y = 0.65;
        m.castShadow = true;
        g.add(m);
      }
      g.position.set(-span / 2 + (c / 6) * span, 215 + hash2(c, 1, 1) * 30, -160 + hash2(c, 2, 2) * 320); g.scale.setScalar(3.2);
      this.items.push(g); this.group.add(g);
    }
  }
  update(dt: number): void {
    for (const [k, g] of this.items.entries()) {
      g.position.x += dt * (1.2 + (k % 3) * 0.4);
      if (g.position.x > this.span / 2 + 20) g.position.x = -this.span / 2 - 20;
    }
  }
}
