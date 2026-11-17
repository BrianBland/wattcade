// Salmon run visuals: the school (instanced, smoothed, wiggling, leaping), bears that lumber to the bank, rear and
// swipe, and eagles that spiral down (their shadow sharpening on the water) and dive. No target markers: the animals' own
// body language is the warning. Spray bursts on every strike.
import * as THREE from 'three';
import { SEA, sample } from '../sim/terrain';
import type { SalmonView, WatershedSnapshot } from '../sim/sim';
import { salmonGeometry, swimMaterial } from './models';
import { bearModel, eagleModel, poseBear, poseEagle } from './wildlife';

const MAX_FISH = 24;

interface PredObj {
  g: THREE.Group; kind: 'bear' | 'eagle'; seen: number; shadow: THREE.Mesh | null;
  /** Motion bookkeeping: last world position, smoothed speed, gait/wing-beat phase, heading and attitude. */
  last: THREE.Vector3; speed: number; gait: number; yaw: number; roll: number; pitch: number; rear: number; ang: number;
  splashed: boolean; away: THREE.Vector3;
}

/** A pool of spray droplets for strikes (instanced, ballistic, render-only). */
class Splash {
  readonly mesh: THREE.InstancedMesh;
  private p: Float32Array; private v: Float32Array; private life: Float32Array; private next = 0;
  private m = new THREE.Matrix4();
  constructor(private max = 64) {
    this.mesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.16, 8, 6), new THREE.MeshStandardMaterial({ color: 0xeaf8ff, roughness: 0.2, transparent: true, opacity: 0.9 }), max);
    this.mesh.frustumCulled = false;
    this.p = new Float32Array(max * 3); this.v = new Float32Array(max * 3); this.life = new Float32Array(max);
    for (let i = 0; i < max; i++) { this.m.makeScale(0, 0, 0); this.mesh.setMatrixAt(i, this.m); }
  }
  burst(at: THREE.Vector3, n: number, up: number) {
    for (let k = 0; k < n; k++) {
      const i = this.next++ % this.max, a = Math.random() * Math.PI * 2, r = 0.6 + Math.random() * 1.4;
      this.p.set([at.x, at.y, at.z], i * 3);
      this.v.set([Math.cos(a) * r, up * (0.6 + Math.random() * 0.6), Math.sin(a) * r], i * 3);
      this.life[i] = 0.7 + Math.random() * 0.4;
    }
  }
  update(dt: number) {
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      this.v[i * 3 + 1] -= 12 * dt;
      for (let c = 0; c < 3; c++) this.p[i * 3 + c] += this.v[i * 3 + c] * dt;
      const s = this.life[i] > 0 ? Math.min(1, this.life[i] * 2) : 0;
      this.m.makeScale(s, s * 1.3, s).setPosition(this.p[i * 3], this.p[i * 3 + 1], this.p[i * 3 + 2]);
      this.mesh.setMatrixAt(i, this.m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

function shadowTexture(): THREE.Texture | null {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'); if (!g) return null;
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

export class SalmonLayer {
  readonly group = new THREE.Group();
  private fish: THREE.InstancedMesh;
  private ring: THREE.Mesh;
  private shown: Array<{ x: number; y: number; z: number; s: number }> = [];
  private preds = new Map<number, PredObj>();
  private m = new THREE.Matrix4(); private q = new THREE.Quaternion(); private e = new THREE.Euler(); private p = new THREE.Vector3(); private sc = new THREE.Vector3();
  private hop = 0;
  private swim = { value: 0 };
  private splash = new Splash();
  private shadowTex = shadowTexture();
  private cA = new THREE.Vector3(); private cB = new THREE.Vector3();

  constructor(color: string, private wx: (j: number) => number, private wz: (i: number) => number) {
    const mat = swimMaterial(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.42, metalness: 0.05, side: THREE.DoubleSide }), this.swim);
    this.fish = new THREE.InstancedMesh(salmonGeometry(), mat, MAX_FISH + 1);
    this.fish.castShadow = true; this.fish.frustumCulled = false;
    this.fish.setColorAt(0, new THREE.Color(0xffffff).lerp(new THREE.Color(color), 0.45));
    for (let k = 1; k <= MAX_FISH; k++) this.fish.setColorAt(k, new THREE.Color().setScalar(0.92 + (k % 4) * 0.03));
    this.ring = new THREE.Mesh(new THREE.TorusGeometry(2, 0.16, 6, 28), new THREE.MeshBasicMaterial({ color }));
    this.ring.rotation.x = -Math.PI / 2;
    this.group.add(this.fish, this.ring, this.splash.mesh);
    this.group.visible = false;
  }

  /** dt = real seconds since last frame; time = sim seconds (for wiggle). */
  update(s: WatershedSnapshot, view: SalmonView | null, dt: number, time: number): void {
    this.group.visible = !!view;
    if (!view) { for (const [, o] of this.preds) this.dropPred(o); this.preds.clear(); this.shown = []; return; }
    const { nx, ny, h, w } = s;
    const surface = (x: number, y: number) => Math.max(sample(h, nx, ny, x, y), SEA) + sample(w, nx, ny, x, y) * 0.9;
    const k = 1 - Math.exp(-dt * 10);
    this.swim.value = time;
    this.hop = view.leaping ? Math.min(1, this.hop + dt * 3) : Math.max(0, this.hop - dt * 2);
    const all = [{ ...view.leader, alive: true }, ...view.fish].slice(0, MAX_FISH + 1);
    all.forEach((f, idx) => {
      const tx = this.wx(f.y), tz = this.wz(f.x);
      const leap = this.hop * Math.max(0, Math.sin(time * 4 + idx * 0.9)) * 1.8;
      const ty = surface(f.x, f.y) + 0.55 + leap;
      let cur = this.shown[idx];
      if (!cur || view.restarting) cur = this.shown[idx] = { x: tx, y: ty, z: tz, s: f.alive ? 1 : 0 };
      cur.x += (tx - cur.x) * k; cur.y += (ty - cur.y) * k; cur.z += (tz - cur.z) * k;
      cur.s += ((f.alive ? 1 : 0) - cur.s) * (1 - Math.exp(-dt * 6));
      const wig = Math.sin(time * 2.3 + idx * 1.7) * 0.08;  // body undulation is in the shader; this is a slow wander
      // face upstream along the channel: model nose is +X; grid heading (dx, dy) → world (dy, dx)
      const yaw = Math.atan2(-view.heading.x, view.heading.y);
      this.e.set(0, yaw + wig, leap > 0.1 ? 0.5 : 0); this.q.setFromEuler(this.e);
      this.p.set(cur.x, cur.y, cur.z);
      this.sc.setScalar((idx === 0 ? 1.25 : 0.85) * cur.s);
      this.m.compose(this.p, this.q, this.sc);
      this.fish.setMatrixAt(idx, this.m);
    });
    for (let idx = all.length; idx <= MAX_FISH; idx++) { this.m.makeScale(0, 0, 0); this.fish.setMatrixAt(idx, this.m); }
    this.fish.count = MAX_FISH + 1;
    this.fish.instanceMatrix.needsUpdate = true;
    const L = this.shown[0];
    if (L) { this.ring.position.set(L.x, L.y - 0.05, L.z); this.ring.scale.setScalar(1 + 0.1 * Math.sin(time * 5)); }

    // predators: no target markers. Bears telegraph by walking to the bank and rearing up; eagles circle lower
    // and lower, their shadow on the water sharpening, then fold their wings and dive.
    const live = new Set<number>();
    for (const pr of view.predators) {
      live.add(pr.id);
      let o = this.preds.get(pr.id);
      if (!o) { o = this.makePred(pr.kind); this.preds.set(pr.id, o); }
      o.seen += dt;
      const appear = Math.min(1, o.seen / 0.6);
      if (pr.kind === 'bear') this.updateBear(o, pr, h, nx, ny, surface, dt, time);
      else this.updateEagle(o, pr, surface, dt, time, appear);
    }
    for (const [id, o] of this.preds) if (!live.has(id)) { this.dropPred(o); this.preds.delete(id); }
    this.splash.update(dt);
  }

  private updateBear(o: PredObj, pr: SalmonView['predators'][number], h: Float32Array, nx: number, ny: number, surface: (x: number, y: number) => number, dt: number, time: number) {
    // bears lumber in from the woods to the water's edge, rear up as the school nears, swipe, then run back off
    const bx = pr.x + pr.side * 11 * (1 - pr.enter), by = pr.y;
    const lunge = pr.struck >= 0 ? Math.min(1, pr.struck * 4) * Math.max(0, 1 - (pr.struck - 0.6) * 1.5) : 0;
    const gx = bx - pr.side * lunge * 1.6;
    const ground = Math.max(sample(h, nx, ny, gx, by), SEA - 0.4);
    this.p.set(this.wx(by), ground, this.wz(gx));
    if (pr.struck > 2) this.p.y -= (pr.struck - 2) * 6;
    const vx = o.seen > dt ? (this.p.x - o.last.x) / Math.max(1e-3, dt) : 0, vz = o.seen > dt ? (this.p.z - o.last.z) / Math.max(1e-3, dt) : 0;
    o.last.copy(this.p);
    const speed = Math.hypot(vx, vz);
    o.speed += (speed - o.speed) * (1 - Math.exp(-dt * 6));
    o.gait += dt * (1.5 + o.speed * 1.6);
    // face where it's going when moving, else the water
    const faceWater = pr.side > 0 ? Math.PI / 2 : -Math.PI / 2;
    const want = o.speed > 1.2 ? Math.atan2(-vz, vx) : faceWater;
    let dy = want - o.yaw; while (dy > Math.PI) dy -= Math.PI * 2; while (dy < -Math.PI) dy += Math.PI * 2;
    o.yaw += dy * (1 - Math.exp(-dt * 5));
    o.g.position.copy(this.p);
    o.g.rotation.y = o.yaw;
    const rearT = pr.struck < 0 && pr.enter > 0.85 && pr.t < 1.6 ? 1 : 0;
    o.rear += (rearT - o.rear) * (1 - Math.exp(-dt * (rearT ? 4 : 10)));
    const swipe = pr.struck >= 0 && pr.struck < 0.7 ? pr.struck / 0.7 : 0;
    poseBear(o.g, { gait: o.gait, stride: Math.min(1, o.speed / 5), rear: o.rear, swipe, look: 0.25 * Math.sin(time * 0.7 + pr.id), roar: Math.max(o.rear * 0.8, swipe > 0 ? 1 - swipe : 0) });
    if (pr.struck >= 0 && !o.splashed) {
      o.splashed = true;
      const mx = gx - pr.side * 1.5;
      this.splash.burst(this.cA.set(this.wx(by), surface(mx, by) + 0.1, this.wz(mx)), 18, 3.5);
    }
  }

  private updateEagle(o: PredObj, pr: SalmonView['predators'][number], surface: (x: number, y: number) => number, dt: number, time: number, appear: number) {
    const ex = pr.x, ey = pr.y, ws = surface(ex, ey);
    const pre = Math.max(0, pr.t);
    if (pr.struck >= 0) {
      // climb away along the line it dived on, beating hard (carrying a salmon when it caught one)
      if (!o.splashed) { o.splashed = true; o.away.set(Math.cos(o.ang), 0, Math.sin(o.ang)); this.splash.burst(this.cA.set(this.wx(ey), ws + 0.1, this.wz(ex)), 14, 2.5); }
      const k = pr.struck;
      this.p.set(this.wx(ey) + o.away.x * k * 7, ws + 0.4 + k * k * 4 + k * 3, this.wz(ex) + o.away.z * k * 7);
    } else {
      // a slow, tightening spiral above the school's spot, gliding with the odd lazy wing beat
      o.ang += dt * (0.8 + 1.2 / (1 + pre));
      const r = Math.min(7, pre * 1.9), alt = pre * 4.2 + 0.3;
      this.p.set(this.wx(ey) + Math.cos(o.ang) * r, ws + 0.5 + alt, this.wz(ex) + Math.sin(o.ang) * r);
    }
    const v = this.cB.copy(this.p).sub(o.last).divideScalar(Math.max(1e-3, dt));
    if (o.seen <= dt) v.set(Math.cos(o.ang + Math.PI / 2), 0, Math.sin(o.ang + Math.PI / 2));
    o.last.copy(this.p);
    const horiz = Math.hypot(v.x, v.z);
    const yaw = horiz > 0.05 ? Math.atan2(-v.z, v.x) : o.yaw;
    let dyaw = yaw - o.yaw; while (dyaw > Math.PI) dyaw -= Math.PI * 2; while (dyaw < -Math.PI) dyaw += Math.PI * 2;
    const k = 1 - Math.exp(-dt * 6);
    o.yaw += dyaw * k;
    const turn = dt > 0 ? dyaw / dt : 0;
    o.roll += (Math.max(-0.9, Math.min(0.9, -turn * 0.35)) - o.roll) * k;
    const diving = pr.struck < 0 && pre < 1.1;
    const pitch = diving ? -0.9 * (1 - pre / 1.1) : Math.max(-0.6, Math.min(0.7, Math.atan2(v.y, Math.max(0.5, horiz))));
    o.pitch += (pitch - o.pitch) * k;
    o.g.position.copy(this.p);
    o.g.rotation.set(o.roll, o.yaw, o.pitch, 'YZX');
    o.g.scale.setScalar(appear * 1.25);
    const tuck = diving ? Math.min(1, (1.1 - pre) / 0.6) * (pre > 0.15 ? 1 : pre / 0.15) : 0;
    const climbing = pr.struck >= 0;
    const flap = climbing ? 1 : diving ? 0 : 0.15 + 0.85 * Math.max(0, Math.sin(time * 0.9 + pr.id * 2)) ** 3;
    o.gait += dt * (climbing ? 10 : 6);
    poseEagle(o.g, { beat: o.gait, flap, tuck, reach: pr.struck < 0 ? (pre < 0.5 ? 1 - pre / 0.5 : 0) : Math.max(0, 1 - pr.struck * 1.5) * 0.6, carrying: climbing && pr.caught > 0 });
    // its shadow on the water: soft and faint high up, darker and tighter as it drops
    if (o.shadow) {
      const alt = Math.max(0, this.p.y - ws);
      o.shadow.position.set(this.p.x, ws + 0.06, this.p.z);
      o.shadow.scale.setScalar(1.4 + alt * 0.08);
      (o.shadow.material as THREE.MeshBasicMaterial).opacity = appear * Math.max(0, 0.5 - alt * 0.018) * (climbing ? Math.max(0, 1 - pr.struck) : 1);
    }
  }

  private makePred(kind: 'bear' | 'eagle'): PredObj {
    const g = kind === 'bear' ? bearModel() : eagleModel();
    g.traverse((x) => { (x as THREE.Mesh).castShadow = true; });
    let shadow: THREE.Mesh | null = null;
    if (kind === 'eagle') {
      shadow = new THREE.Mesh(new THREE.CircleGeometry(1, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x0a1a24, map: this.shadowTex, transparent: true, opacity: 0, depthWrite: false }));
      shadow.renderOrder = 3; this.group.add(shadow);
    }
    this.group.add(g);
    return { g, kind, seen: 0, shadow, last: new THREE.Vector3(), speed: 0, gait: 0, yaw: 0, roll: 0, pitch: 0, rear: 0, ang: Math.random() * Math.PI * 2, splashed: false, away: new THREE.Vector3(1, 0, 0) };
  }
  private dropPred(o: PredObj) {
    this.group.remove(o.g);
    o.g.traverse((x) => { const m = x as THREE.Mesh; m.geometry?.dispose(); });
    if (o.shadow) { this.group.remove(o.shadow); o.shadow.geometry.dispose(); }
  }

  /** Smoothed leader position (world), for the camera. */
  leaderWorld(out: THREE.Vector3): THREE.Vector3 | null { const L = this.shown[0]; return L ? out.set(L.x, L.y, L.z) : null; }
}
