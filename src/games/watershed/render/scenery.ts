// Watershed scenery: sky gradient, forest that dies where the river erodes/floods/buries it, drifting clouds, a wavy sea.
import * as THREE from 'three';
import { SEA, hash2, sample } from '../sim/terrain';
import type { WatershedSnapshot } from '../sim/sim';

export function skyTexture(): THREE.Texture | THREE.Color {
  if (typeof document === 'undefined') return new THREE.Color(0xbfe3f5);
  const c = document.createElement('canvas'); c.width = 4; c.height = 256;
  const g = c.getContext('2d');
  if (!g) return new THREE.Color(0xbfe3f5);
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#4f9fdc'); grad.addColorStop(0.55, '#a9d6f2'); grad.addColorStop(1, '#eaf6fb');
  g.fillStyle = grad; g.fillRect(0, 0, 4, 256);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

interface Tree { i: number; j: number; s: number; life: number; kind: number }

/** Instanced pines + round trees on the valley sides. Trees die (shrink and tip over) when the ground under them changes. */
export class Forest {
  readonly group = new THREE.Group();
  private trees: Tree[] = [];
  private crowns: THREE.InstancedMesh; private trunks: THREE.InstancedMesh;
  private m = new THREE.Matrix4(); private q = new THREE.Quaternion(); private e = new THREE.Euler(); private p = new THREE.Vector3(); private sc = new THREE.Vector3();
  dead = 0;

  constructor(s: WatershedSnapshot, private wx: (j: number) => number, private wz: (i: number) => number) {
    const { nx, ny, h0, hard } = s;
    for (let j = 6; j < ny - 2; j += 2) for (let i = 2; i < nx - 2; i += 2) {
      const r = hash2(i, j, 77), fi = i + hash2(i, j, 5) * 1.6, fj = j + hash2(i, j, 9) * 1.6;
      const z = sample(h0, nx, ny, fi, fj);
      const slope = Math.abs(sample(h0, nx, ny, fi + 1, fj) - sample(h0, nx, ny, fi - 1, fj)) + Math.abs(sample(h0, nx, ny, fi, fj + 1) - sample(h0, nx, ny, fi, fj - 1));
      if (z < 0.8 || z > 24 || slope > 1.6 || hard[Math.round(fj) * nx + Math.round(fi)] < 0.45) continue;
      const density = z < 4 ? 0.25 : z < 16 ? 0.55 : 0.3;
      if (r > density) continue;
      this.trees.push({ i: fi, j: fj, s: 0.8 + hash2(i, j, 13) * 0.7, life: 1, kind: z > 12 || hash2(i, j, 21) < 0.6 ? 0 : 1 });
    }
    const crownG = new THREE.ConeGeometry(1, 2.6, 7); crownG.translate(0, 2.3, 0);
    const trunkG = new THREE.CylinderGeometry(0.18, 0.24, 1.2, 5); trunkG.translate(0, 0.6, 0);
    this.crowns = new THREE.InstancedMesh(crownG, new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true }), this.trees.length);
    this.trunks = new THREE.InstancedMesh(trunkG, new THREE.MeshLambertMaterial({ color: 0x6b4a2f }), this.trees.length);
    const pine = new THREE.Color(0x2f6b3a), leafy = new THREE.Color(0x5d9a3c), tmp = new THREE.Color();
    this.trees.forEach((t, k) => this.crowns.setColorAt(k, tmp.copy(t.kind === 0 ? pine : leafy).offsetHSL(0, 0, (hash2(k, 3, 1) - 0.5) * 0.08)));
    for (const m of [this.crowns, this.trunks]) { m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false; }
    this.group.add(this.crowns, this.trunks);
  }

  /** Re-seat trees on the current terrain and kill the ones whose ground was eroded, flooded or buried. */
  update(s: WatershedSnapshot, dt: number): void {
    const { nx, ny, h, h0, w } = s;
    this.dead = 0;
    this.trees.forEach((t, k) => {
      const ci = Math.round(t.i), cj = Math.round(t.j), c = cj * nx + ci;
      const z = sample(h, nx, ny, t.i, t.j);
      if (t.life > 0 && (h0[c] - h[c] > 0.45 || h[c] - h0[c] > 0.9 || w[c] > 0.18 || z < SEA)) t.life = Math.max(0, t.life - dt * 0.8);
      if (t.life < 1) this.dead++;
      const tip = (1 - t.life) * 1.3, k01 = t.life > 0 ? 0.35 + 0.65 * t.life : 0;
      this.e.set(tip * 0.6, 0, tip, 'XYZ'); this.q.setFromEuler(this.e);
      this.p.set(this.wx(t.j), z - (1 - t.life) * 0.6, this.wz(t.i));
      this.sc.setScalar(t.s * k01 * (t.kind === 1 ? 0.85 : 1)).setY(t.s * k01 * (t.kind === 1 ? 0.75 : 1.05));
      this.m.compose(this.p, this.q, this.sc);
      this.crowns.setMatrixAt(k, this.m); this.trunks.setMatrixAt(k, this.m);
    });
    this.crowns.instanceMatrix.needsUpdate = true; this.trunks.instanceMatrix.needsUpdate = true;
  }

  get count() { return this.trees.length; }
}

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
      g.position.set(-span / 2 + (c / 6) * span, 52 + hash2(c, 1, 1) * 10, -60 + hash2(c, 2, 2) * 70);
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

/** The sea surface: a subdivided plane with gentle travelling swells, clipped to the coastal part of the diorama. */
export class SeaSurface {
  readonly mesh: THREE.Mesh;
  private base: Float32Array;
  constructor(width: number, depth: number, x: number, z: number) {
    const g = new THREE.PlaneGeometry(width, depth, Math.round(width / 2), Math.round(depth / 2));
    g.rotateX(-Math.PI / 2);
    this.base = (g.getAttribute('position').array as Float32Array).slice();
    this.mesh = new THREE.Mesh(g, new THREE.MeshPhongMaterial({ color: 0x2f86c4, transparent: true, opacity: 0.72, shininess: 140, specular: 0xe8f6ff, depthWrite: false }));
    this.mesh.position.set(x, SEA + 0.02, z);
    this.mesh.receiveShadow = true;
    this.mesh.renderOrder = 2;
  }
  update(t: number): void {
    const pos = this.mesh.geometry.getAttribute('position') as THREE.BufferAttribute, P = pos.array as Float32Array, B = this.base;
    for (let k = 0; k < P.length; k += 3) {
      const x = B[k], z = B[k + 2];
      P[k + 1] = 0.12 * Math.sin(x * 0.45 + t * 1.3) + 0.07 * Math.sin(z * 0.6 - t * 0.9 + x * 0.2);
    }
    pos.needsUpdate = true;
    this.mesh.geometry.computeVertexNormals();
  }
}
