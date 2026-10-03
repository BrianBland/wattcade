// Watershed scenery: sky gradient, forest that dies where the river erodes/floods/buries it, drifting clouds, a wavy sea.
import * as THREE from 'three';
import { SEA, hash2, sample } from '../sim/terrain';
import { boulderGeometry, broadleafGeometry, pineGeometry, swayMaterial, trunkGeometry } from './models';
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
    const pineMat = swayMaterial(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }), this.wind);
    const leafMat = swayMaterial(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 }), this.wind, 0.05);
    const rockMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 });
    this.meshes = [
      new THREE.InstancedMesh(pineGeometry(), pineMat, Math.max(1, counts[0])),
      new THREE.InstancedMesh(broadleafGeometry(), leafMat, Math.max(1, counts[1])),
      new THREE.InstancedMesh(boulderGeometry(), rockMat, Math.max(1, counts[2])),
    ];
    this.trunks = new THREE.InstancedMesh(trunkGeometry(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }), Math.max(1, counts[0] + counts[1]));
    const tint = new THREE.Color();
    for (const t of this.trees) this.meshes[t.kind].setColorAt(t.slot, tint.setScalar(0.88 + hash2(t.slot, t.kind, 3) * 0.24));
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
