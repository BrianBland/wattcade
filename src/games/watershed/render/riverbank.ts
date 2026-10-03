// Riverbank life (render-only, cosmetic): grass, flowers, reeds and cattails, pebbles and lily pads that grow where the
// river's habitat is and wilt where it isn't, so the banks follow the river as you carve it. Plus hopping frogs and
// fluttering butterflies. Placement is a fixed jittered grid of candidate spots (stable via hashing); each spot has a
// kind and a growth value re-targeted from the water fields a few times a second.
import * as THREE from 'three';
import { play } from '../../../audio/sfx';
import type { WatershedSnapshot } from '../sim/sim';
import { SEA, hash2, sample } from '../sim/terrain';
import {
  butterflyGeometry, flowerGeometry, frogGeometry, grassGeometry, lilyPadGeometry, lotusGeometry, pebbleGeometry, reedGeometry, swayMaterial,
} from './models';

const GRASS = 0, FLOWER = 1, REED = 2, PEBBLE = 3, LILY = 4;
const SIZE = [1.9, 1.35, 1, 1, 1];   // per-kind display scale (cartoon-sized so they read from the chase cam)
const FLOWER_COLORS = [0xff5fa2, 0xffd23f, 0xffffff, 0xb57bff, 0xff7a3d, 0x6ad1ff].map((c) => new THREE.Color(c));
const BUTTERFLY_COLORS = [0xffb000, 0x4fc3ff, 0xff5fa2, 0xfff06a, 0xb57bff].map((c) => new THREE.Color(c));

interface Spot { x: number; y: number; kind: number; slot: number; g: number; s: number; rot: number; h: number; lotus: boolean }
interface Frog { at: number; from: THREE.Vector3; to: THREE.Vector3; hop: number; wait: number; yaw: number; slot: number }
interface Fly { at: number; phase: number; speed: number }

export interface WaterFields {
  depth: Float32Array;                              // coarse smoothed depth
  speedAt(x: number, y: number): number;
}

export class Riverbank {
  readonly group = new THREE.Group();
  readonly wind = { value: 0 };
  private spots: Spot[] = [];
  private meshes: THREE.InstancedMesh[] = [];
  private lotus: THREE.InstancedMesh;
  private nearW: Float32Array; private tmp: Float32Array;
  private frogs: Frog[] = []; private frogMesh: THREE.InstancedMesh;
  private flies: Fly[] = []; private flyMesh: THREE.InstancedMesh;
  private homes: number[] = []; private flowersAlive: number[] = [];
  private m = new THREE.Matrix4(); private q = new THREE.Quaternion(); private e = new THREE.Euler(); private p = new THREE.Vector3(); private sc = new THREE.Vector3();
  private evalAcc = 1;

  constructor(s: WatershedSnapshot, private wx: (j: number) => number, private wz: (i: number) => number) {
    const { nx, ny, coastY } = s;
    this.nearW = new Float32Array(nx * ny); this.tmp = new Float32Array(nx * ny);
    const counts = [0, 0, 0, 0, 0];
    for (let j = 3; j < Math.min(ny - 2, coastY + 6); j++) for (let i = 2; i < nx - 2; i++) {
      const r = hash2(i, j, 401);
      const kind = r < 0.5 ? GRASS : r < 0.62 ? FLOWER : r < 0.76 ? REED : r < 0.88 ? PEBBLE : LILY;
      this.spots.push({
        x: i + hash2(i, j, 402) - 0.5, y: j + hash2(i, j, 403) - 0.5, kind, slot: counts[kind]++, g: 0,
        s: 0.75 + hash2(i, j, 404) * 0.6, rot: hash2(i, j, 405) * Math.PI * 2, h: hash2(i, j, 406), lotus: hash2(i, j, 407) < 0.25,
      });
    }
    const std = (o: THREE.MeshStandardMaterialParameters = {}) => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, ...o });
    const geos = [grassGeometry(), flowerGeometry(), reedGeometry(), pebbleGeometry(), lilyPadGeometry()];
    const mats = [
      swayMaterial(std({ side: THREE.DoubleSide }), this.wind, 0.22, 0), swayMaterial(std(), this.wind, 0.14, 0),
      swayMaterial(std(), this.wind, 0.05, 0.2), std({ roughness: 0.95 }), std({ roughness: 0.5, side: THREE.DoubleSide }),
    ];
    this.meshes = geos.map((g, k) => {
      const m = new THREE.InstancedMesh(g, mats[k], Math.max(1, counts[k]));
      m.count = counts[k]; m.frustumCulled = false; m.receiveShadow = true;
      for (let n = 0; n < counts[k]; n++) m.setMatrixAt(n, new THREE.Matrix4().makeScale(0, 0, 0));
      this.group.add(m); return m;
    });
    for (const sp of this.spots) {
      if (sp.kind === FLOWER) this.meshes[FLOWER].setColorAt(sp.slot, FLOWER_COLORS[Math.floor(sp.h * FLOWER_COLORS.length)]);
      if (sp.kind === GRASS) this.meshes[GRASS].setColorAt(sp.slot, new THREE.Color().setScalar(0.85 + sp.h * 0.3));
    }
    this.lotus = new THREE.InstancedMesh(lotusGeometry(), std({ roughness: 0.5 }), Math.max(1, counts[LILY]));
    this.lotus.count = counts[LILY]; this.lotus.frustumCulled = false;
    for (let n = 0; n < counts[LILY]; n++) this.lotus.setMatrixAt(n, new THREE.Matrix4().makeScale(0, 0, 0));
    this.group.add(this.lotus);

    this.frogMesh = new THREE.InstancedMesh(frogGeometry(), std({ roughness: 0.45 }), 8);
    this.frogMesh.castShadow = true; this.frogMesh.frustumCulled = false;
    for (let k = 0; k < 8; k++) this.frogs.push({ at: -1, from: new THREE.Vector3(), to: new THREE.Vector3(), hop: 1, wait: hash2(k, 1, 9) * 3, yaw: 0, slot: k });
    this.flyMesh = new THREE.InstancedMesh(butterflyGeometry(), std({ roughness: 0.6, side: THREE.DoubleSide }), 12);
    this.flyMesh.frustumCulled = false;
    for (let k = 0; k < 12; k++) {
      this.flies.push({ at: -1, phase: hash2(k, 2, 3) * 10, speed: 0.6 + hash2(k, 4, 5) * 0.6 });
      this.flyMesh.setColorAt(k, BUTTERFLY_COLORS[k % BUTTERFLY_COLORS.length]);
    }
    this.group.add(this.frogMesh, this.flyMesh);
  }

  /** Dilate depth by ~2 cells (max filter), so "near water" is cheap to ask. */
  private dilate(depth: Float32Array, nx: number, ny: number) {
    const a = this.tmp, b = this.nearW;
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      let m = 0; for (let d = -2; d <= 2; d++) { const ii = i + d; if (ii >= 0 && ii < nx) m = Math.max(m, depth[j * nx + ii]); }
      a[j * nx + i] = m;
    }
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      let m = 0; for (let d = -2; d <= 2; d++) { const jj = j + d; if (jj >= 0 && jj < ny) m = Math.max(m, a[jj * nx + i]); }
      b[j * nx + i] = m;
    }
  }

  private habitat(sp: Spot, z: number, d: number, nw: number, er: number, si: number, hard: number, speed: number): number {
    const bank = nw > 0.06;
    switch (sp.kind) {
      case GRASS: return z > SEA + 0.3 && d < 0.04 && z < 22 && hard > 0.4 && er < 0.8 && si < 1.2 && (bank || (sp.h < 0.35 && z < 14)) ? (bank ? 1.15 : 0.8) : 0;
      case FLOWER: return z > SEA + 0.3 && d < 0.04 && z < 16 && er < 0.5 && si < 0.8 && (bank ? sp.h < 0.8 : sp.h < 0.1) ? 1 : 0;
      case REED: return z > SEA - 0.1 && er < 1.5 && ((d > 0.03 && d < 0.35 && speed < 3.5) || (d < 0.04 && nw > 0.18)) ? 1 : 0;
      case PEBBLE: return z > SEA - 1 && si < 0.5 && nw > 0.06 && d < 0.4 && (er > 0.35 || sp.h < 0.5) ? 1 : 0;
      case LILY: return z >= SEA - 0.1 && d > 0.28 && speed < 1.6 ? 1 : 0;
    }
    return 0;
  }

  update(s: WatershedSnapshot, water: WaterFields, heightAt: (x: number, y: number) => number, dt: number, time: number): void {
    const { nx, ny, h, h0, hard } = s;
    this.wind.value = time;
    this.evalAcc += dt;
    if (this.evalAcc >= 0.35) {
      this.evalAcc = 0;
      this.dilate(water.depth, nx, ny);
      this.homes = []; this.flowersAlive = [];
      this.spots.forEach((sp, idx) => {
        const k = Math.min(ny - 1, Math.max(0, Math.round(sp.y))) * nx + Math.min(nx - 1, Math.max(0, Math.round(sp.x)));
        const z = heightAt(sp.x, sp.y), d = sample(water.depth, nx, ny, sp.x, sp.y), nw = sample(this.nearW, nx, ny, sp.x, sp.y);
        const target = this.habitat(sp, z, d, nw, h0[k] - h[k], h[k] - h0[k], hard[k], sp.kind === REED || sp.kind === LILY ? water.speedAt(sp.x, sp.y) : 0);
        const before = sp.g;
        sp.g += Math.max(-0.3, Math.min(0.18, target - sp.g));
        if (sp.g > 0.6 && (sp.kind === LILY || (sp.kind === GRASS && nw > 0.1 && d < 0.04))) this.homes.push(idx);
        if (sp.g > 0.6 && sp.kind === FLOWER) this.flowersAlive.push(idx);
        if (Math.abs(sp.g - before) < 1e-4 && sp.g === 0) return;
        const surf = sp.kind === LILY ? z + d * 0.9 + 0.06 : sp.kind === PEBBLE ? z - 0.04 : z - 0.02;
        this.e.set(sp.kind === LILY ? 0 : (sp.h - 0.5) * 0.2, sp.rot, 0); this.q.setFromEuler(this.e);
        this.p.set(this.wx(sp.y), surf, this.wz(sp.x));
        const k01 = Math.max(0, sp.g);
        this.sc.setScalar(sp.s * k01 * SIZE[sp.kind] * (sp.kind === PEBBLE ? 1 + sp.h : 1));
        this.m.compose(this.p, this.q, this.sc);
        this.meshes[sp.kind].setMatrixAt(sp.slot, this.m);
        if (sp.kind === LILY) {
          if (!sp.lotus) this.m.makeScale(0, 0, 0);
          this.lotus.setMatrixAt(sp.slot, this.m);
        }
      });
      for (const m of this.meshes) m.instanceMatrix.needsUpdate = true;
      this.lotus.instanceMatrix.needsUpdate = true;
    }
    this.updateFrogs(s, water, heightAt, dt, time);
    this.updateFlies(heightAt, time);
  }

  private spotPos(idx: number, heightAt: (x: number, y: number) => number, water: WaterFields, s: WatershedSnapshot, out: THREE.Vector3): THREE.Vector3 {
    const sp = this.spots[idx];
    const z = heightAt(sp.x, sp.y), d = sample(water.depth, s.nx, s.ny, sp.x, sp.y);
    return out.set(this.wx(sp.y), sp.kind === LILY ? z + d * 0.9 + 0.1 : z, this.wz(sp.x));
  }

  private updateFrogs(s: WatershedSnapshot, water: WaterFields, heightAt: (x: number, y: number) => number, dt: number, time: number) {
    for (const f of this.frogs) {
      const alive = f.at >= 0 && this.spots[f.at].g > 0.5;
      if (f.hop < 1) {
        f.hop = Math.min(1, f.hop + dt / 0.55);
        this.p.lerpVectors(f.from, f.to, f.hop); this.p.y += Math.sin(f.hop * Math.PI) * 1.1;
      } else {
        f.wait -= dt;
        if ((f.wait <= 0 || !alive) && this.homes.length) {
          // hop to a nearby home (lily pad or lush bank); first placement can be anywhere
          const cur = f.at >= 0 ? this.spots[f.at] : null;
          let best = -1;
          for (let tries = 0; tries < 12; tries++) {
            const cand = this.homes[Math.floor(Math.random() * this.homes.length)];
            const c = this.spots[cand];
            if (!cur || Math.hypot(c.x - cur.x, c.y - cur.y) < 6) { best = cand; break; }
          }
          if (best >= 0) {
            if (f.at < 0) { this.spotPos(best, heightAt, water, s, f.from); f.to.copy(f.from); f.hop = 1; }
            else { f.from.copy(f.to); this.spotPos(best, heightAt, water, s, f.to); f.hop = 0; play('plop', { vol: 0.15, minGapS: 0.4 }); }
            f.yaw = Math.atan2(-(f.to.z - f.from.z), f.to.x - f.from.x) || f.yaw;
            f.at = best;
          }
          f.wait = 3 + Math.random() * 7;
        } else if (alive && Math.random() < dt * 0.04) play('croak', { vol: 0.35, minGapS: 3 });
        this.p.copy(f.to);
      }
      const show = f.at >= 0 ? 1.25 : 0;
      this.q.setFromAxisAngle(Y, f.yaw);
      this.sc.set(show * (1 + 0.04 * Math.sin(time * 6 + f.slot)), show * (1 - 0.04 * Math.sin(time * 6 + f.slot)), show); // breathing
      this.m.compose(this.p, this.q, this.sc);
      this.frogMesh.setMatrixAt(f.slot, this.m);
    }
    this.frogMesh.instanceMatrix.needsUpdate = true;
  }

  private updateFlies(heightAt: (x: number, y: number) => number, time: number) {
    this.flies.forEach((b, k) => {
      if ((b.at < 0 || this.spots[b.at].g < 0.5 || Math.random() < 0.002) && this.flowersAlive.length) b.at = this.flowersAlive[Math.floor(Math.random() * this.flowersAlive.length)];
      if (b.at < 0) { this.m.makeScale(0, 0, 0); this.flyMesh.setMatrixAt(k, this.m); return; }
      const sp = this.spots[b.at], t = time * b.speed + b.phase;
      const x = sp.x + Math.sin(t * 1.3) * 1.4 + Math.sin(t * 3.1) * 0.3, y = sp.y + Math.cos(t * 1.1) * 1.4;
      this.p.set(this.wx(y), heightAt(sp.x, sp.y) + 1.2 + 0.4 * Math.sin(t * 2.3), this.wz(x));
      this.q.setFromAxisAngle(Y, t * 1.2);
      const flap = 0.25 + 0.75 * Math.abs(Math.sin(time * 16 + k));
      this.sc.set(1.2, 1.2, 1.2 * flap);
      this.m.compose(this.p, this.q, this.sc);
      this.flyMesh.setMatrixAt(k, this.m);
    });
    this.flyMesh.instanceMatrix.needsUpdate = true;
  }
}
const Y = new THREE.Vector3(0, 1, 0);
