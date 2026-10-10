// Cel-style VFX juice, all cheap (3-4 draw calls total) and tunable from the sim (snapshot.fx):
// speed lines at high speed, landing dust puffs, cartoon smoke puffs on blasts, screen shake, squash & stretch.
import * as THREE from 'three';
import type { Snapshot } from '../sim/sim';
import { heightAt } from '../sim/world';
import { toon } from './jsr';
import { inkMat } from './chars';

interface Puff { x: number; y: number; z: number; vx: number; vy: number; vz: number; age: number; life: number; s0: number; s1: number; col: number }
const POOL = 96, LINES_N = 28;
const frac = (x: number) => x - Math.floor(x);
const rnd = (i: number, k: number) => frac(Math.sin(i * 127.1 + k * 311.7) * 43758.5453);

export class Fx {
  readonly group = new THREE.Group();
  private puffs: Puff[] = []; private seq = 0;
  private body: THREE.InstancedMesh; private ink: THREE.InstancedMesh; private lines: THREE.InstancedMesh; private lineMat: THREE.MeshBasicMaterial;
  private m = new THREE.Matrix4(); private q = new THREE.Quaternion(); private v = new THREE.Vector3(); private sc = new THREE.Vector3(); private c = new THREE.Color();
  private zero = new THREE.Matrix4().makeScale(0, 0, 0);
  private prevAir = false; private prevAirS = 0; private prevMode = ''; private prevEvAt = -99; private seenBlast = new Set<number>(); private prevT = -1;
  private npcAir = new Map<number, number>(); private ragDown = false;
  private shakeA = 0; private squashT = 9; private squashA = 0;
  /** camera offset applied this frame (renderer subtracts it before the next follow step) */
  readonly shake = new THREE.Vector3();
  /** rider bike/body y-scale for squash & stretch (1 = none) */
  squash = 1;
  constructor() {
    const g = new THREE.IcosahedronGeometry(1, 1);
    this.body = new THREE.InstancedMesh(g, toon(0xffffff), POOL); this.ink = new THREE.InstancedMesh(g, inkMat(0.09), POOL);
    for (const im of [this.body, this.ink]) { im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); im.frustumCulled = false; for (let i = 0; i < POOL; i++) im.setMatrixAt(i, this.zero); }
    for (let i = 0; i < POOL; i++) this.body.setColorAt(i, this.c.set(0xffffff));
    this.lineMat = new THREE.MeshBasicMaterial({ color: 0xfff6e4, transparent: true, opacity: 0, depthWrite: false, fog: false });
    this.lines = new THREE.InstancedMesh(new THREE.BoxGeometry(0.03, 0.03, 1), this.lineMat, LINES_N);
    this.lines.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.lines.frustumCulled = false; this.lines.renderOrder = 10;
    this.group.add(this.body, this.ink, this.lines);
  }
  private puff(x: number, y: number, z: number, n: number, opt: { spread: number; up: number; s0: number; s1: number; life: number; col: number }) {
    for (let i = 0; i < n; i++) {
      const k = this.seq++, a = rnd(k, 1) * Math.PI * 2, sp = opt.spread * (0.5 + rnd(k, 2) * 0.7);
      const p: Puff = { x, y, z, vx: Math.cos(a) * sp, vy: opt.up * (0.5 + rnd(k, 3)), vz: Math.sin(a) * sp, age: 0, life: opt.life * (0.7 + rnd(k, 4) * 0.6), s0: opt.s0, s1: opt.s1 * (0.7 + rnd(k, 5) * 0.6), col: opt.col };
      if (this.puffs.length >= POOL) this.puffs.shift(); this.puffs.push(p);
    }
  }
  frame(s: Snapshot, cam: THREE.PerspectiveCamera) {
    const dt = this.prevT < 0 ? 1 / 30 : Math.max(0, Math.min(0.1, s.t - this.prevT)); this.prevT = s.t;
    const fx = s.fx ?? { speedLines: 1, speedLineMin: 11, dust: 1, shake: 1, squash: 1, smoke: 1 };
    const R = s.rider;
    // --- triggers ---
    if (s.mode === 'bike' && this.prevAir && !R.air && this.prevAirS > 0.15) { // landing
      const k = Math.min(1, this.prevAirS / 1.2);
      if (fx.dust > 0) this.puff(R.x, R.y + 0.1, R.z, Math.round((5 + k * 9) * fx.dust), { spread: 2 + k * 3, up: 0.6, s0: 0.15, s1: 0.45 + k * 0.4, life: 0.6, col: 0xe6d6b8 });
      this.squashA = (0.12 + k * 0.22) * fx.squash; this.squashT = 0; this.shakeA = Math.max(this.shakeA, k * 0.12 * fx.shake);
    }
    if (s.mode === 'ragdoll' && this.prevMode !== 'ragdoll' && this.prevMode !== '') { // crash
      this.shakeA = Math.max(this.shakeA, 0.45 * fx.shake);
      if (fx.dust > 0) this.puff(R.x, R.y + 0.2, R.z, Math.round(10 * fx.dust), { spread: 3.5, up: 1.2, s0: 0.2, s1: 0.6, life: 0.7, col: 0xe6d6b8 });
    }
    for (const n of s.npcs) { // NPC thuds: a puff of dust where they hit the ground
      const was = this.npcAir.get(n.id) ?? 0; this.npcAir.set(n.id, n.airS);
      if (was > 0.15 && n.airS <= 0 && fx.dust > 0 && Math.hypot(n.x - R.x, n.z - R.z) < 60) this.puff(n.x, n.y + 0.1, n.z, Math.round(5 * fx.dust), { spread: 2, up: 0.5, s0: 0.12, s1: 0.4, life: 0.5, col: 0xd9c9a8 });
    }
    if (s.ragdoll && s.ragdoll.y <= heightAt(s.ragdoll.x, s.ragdoll.z, s.bridge) + 0.05 && !this.ragDown) { this.ragDown = true; this.shakeA = Math.max(this.shakeA, 0.3 * fx.shake); if (fx.dust > 0) this.puff(s.ragdoll.x, s.ragdoll.y + 0.1, s.ragdoll.z, Math.round(8 * fx.dust), { spread: 2.5, up: 0.6, s0: 0.15, s1: 0.5, life: 0.6, col: 0xd9c9a8 }); }
    if (!s.ragdoll) this.ragDown = false;
    if (s.lastEventAt !== this.prevEvAt) { this.prevEvAt = s.lastEventAt; if (s.lastEvent === 'tramHit') this.shakeA = Math.max(this.shakeA, 0.6 * fx.shake); }
    for (const b of s.blasts) {
      if (this.seenBlast.has(b.id)) continue; this.seenBlast.add(b.id);
      const d = Math.hypot(b.x - R.x, b.z - R.z), near = Math.max(0, 1 - d / 40);
      if (b.kind === 'boom') { this.shakeA = Math.max(this.shakeA, (0.25 + 0.6 * near) * fx.shake); if (fx.smoke > 0) { this.puff(b.x, b.y + 0.5, b.z, Math.round(12 * fx.smoke), { spread: 3.5, up: 2.2, s0: 0.5, s1: 1.4, life: 1.4, col: 0x8a8580 }); this.puff(b.x, b.y + 0.3, b.z, Math.round(6 * fx.smoke), { spread: 1.5, up: 3, s0: 0.4, s1: 1.1, life: 0.8, col: 0xf2b45a }); } }
      else if (b.kind === 'poof' && fx.smoke > 0) this.puff(b.x, b.y + 0.4, b.z, Math.round(8 * fx.smoke), { spread: 1.6, up: 2.4, s0: 0.3, s1: 0.9, life: 1.2, col: 0x5a524c });
      else if (b.kind === 'splash' && fx.dust > 0) this.puff(b.x, b.y + 0.2, b.z, Math.round(8 * fx.dust), { spread: 2.5, up: 3, s0: 0.2, s1: 0.5, life: 0.7, col: 0xcfe4e6 });
    }
    if (this.seenBlast.size > 200) this.seenBlast = new Set(s.blasts.map((b) => b.id));
    this.prevAir = s.mode === 'bike' && R.air; this.prevAirS = R.air ? R.airS : this.prevAirS * 0; this.prevMode = s.mode;
    // --- puffs: grow fast, drift up, shrink away (cartoon smoke, no transparency) ---
    let i = 0;
    this.puffs = this.puffs.filter((p) => (p.age += dt) < p.life);
    for (const p of this.puffs) {
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.vx *= 1 - 2.5 * dt; p.vz *= 1 - 2.5 * dt; p.vy *= 1 - 1.2 * dt;
      p.y = Math.max(p.y, heightAt(p.x, p.z, s.bridge) + 0.05);
      const u = p.age / p.life, sz = u < 0.25 ? p.s0 + (p.s1 - p.s0) * Math.sin((u / 0.25) * Math.PI / 2) : p.s1 * (1 - (u - 0.25) / 0.75) ** 1.5;
      this.m.compose(this.v.set(p.x, p.y, p.z), this.q.identity(), this.sc.setScalar(Math.max(0.001, sz)));
      this.body.setMatrixAt(i, this.m); this.ink.setMatrixAt(i, this.m); this.body.setColorAt(i, this.c.set(p.col)); i++;
    }
    for (let k = i; k < POOL; k++) { this.body.setMatrixAt(k, this.zero); this.ink.setMatrixAt(k, this.zero); }
    this.body.count = this.ink.count = Math.max(1, i);
    this.body.instanceMatrix.needsUpdate = this.ink.instanceMatrix.needsUpdate = true; if (this.body.instanceColor) this.body.instanceColor.needsUpdate = true;
    this.body.visible = this.ink.visible = i > 0;
    // --- squash & stretch: squash on touchdown, overshoot stretch, settle ---
    this.squashT += dt;
    const sq = this.squashT < 0.5 ? -this.squashA * Math.cos(this.squashT * 14) * Math.exp(-this.squashT * 7) : 0;
    this.squash = 1 + sq;
    // --- screen shake ---
    this.shakeA *= Math.exp(-6 * dt);
    const A = this.shakeA < 0.005 ? 0 : this.shakeA;
    this.shake.set(Math.sin(s.t * 61) * A, Math.sin(s.t * 47 + 1) * A * 0.7, Math.sin(s.t * 53 + 2) * A);
    // --- speed lines: thin cream streaks rushing past the view edges ---
    const speed = s.mode === 'bike' ? R.speed : 0, k = Math.max(0, Math.min(1, (speed - fx.speedLineMin) / 8)) * fx.speedLines;
    this.lines.visible = k > 0.02; this.lineMat.opacity = Math.min(0.6, 0.45 * k);
    if (this.lines.visible) {
      const fwd = new THREE.Vector3(); cam.getWorldDirection(fwd);
      const right = new THREE.Vector3().crossVectors(fwd, cam.up).normalize(), up = new THREE.Vector3().crossVectors(right, fwd).normalize();
      const tanH = Math.tan(((cam.fov * Math.PI) / 180) / 2);
      for (let n = 0; n < LINES_N; n++) {
        const th = rnd(n, 7) * Math.PI * 2, d = 2.5 + frac(rnd(n, 8) - s.t * (0.6 + speed * 0.05)) * 9, rr = d * tanH * (0.85 + rnd(n, 9) * 0.4);
        this.v.copy(cam.position).addScaledVector(fwd, d).addScaledVector(right, Math.cos(th) * rr * cam.aspect).addScaledVector(up, Math.sin(th) * rr);
        this.q.setFromUnitVectors(new THREE.Vector3(0, 0, 1), fwd);
        this.m.compose(this.v, this.q, this.sc.set(1, 1, 0.6 + k * 2.4)); this.lines.setMatrixAt(n, this.m);
      }
      this.lines.instanceMatrix.needsUpdate = true;
    }
  }
}
