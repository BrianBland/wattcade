// Geological events, drawn: a meteor fireball streaking in during its warning then an impact flash and debris; a
// volcano vent with a smoke column, eruption sparks and an orange glow; dust clouds for quakes and landslides; and a
// camera-shake amount for the renderer. Ground colours (lava/scorch/debris) are in TerrainView. Render-only.
import * as THREE from 'three';
import type { WatershedSnapshot } from '../sim/sim';

const MAX_P = 260;
interface P { p: THREE.Vector3; v: THREE.Vector3; life: number; max: number; size: number; kind: 0 | 1 | 2 }   // 0 smoke, 1 spark, 2 dust

export class EventsLayer {
  readonly group = new THREE.Group();
  private parts: P[] = [];
  private smoke: THREE.InstancedMesh; private sparks: THREE.InstancedMesh; private dust: THREE.InstancedMesh;
  private fireball = new THREE.Group(); private vent: THREE.Mesh; private glow = new THREE.PointLight(0xff7a2a, 0, 60, 1.5);
  private flash = new THREE.PointLight(0xffe0a0, 0, 160, 1.2);
  private m = new THREE.Matrix4(); private q = new THREE.Quaternion(); private sc = new THREE.Vector3();
  private seen = new Map<string, string>();
  private shakeAmt = 0;

  constructor(private wx: (j: number) => number, private wz: (i: number) => number, private heightAt: (x: number, y: number) => number) {
    const ball = new THREE.SphereGeometry(1, 10, 8);
    this.smoke = new THREE.InstancedMesh(ball, new THREE.MeshStandardMaterial({ color: 0x4a4644, roughness: 1, transparent: true, opacity: 0.75, depthWrite: false }), MAX_P);
    this.dust = new THREE.InstancedMesh(ball, new THREE.MeshStandardMaterial({ color: 0xb8a07a, roughness: 1, transparent: true, opacity: 0.6, depthWrite: false }), MAX_P);
    this.sparks = new THREE.InstancedMesh(new THREE.OctahedronGeometry(1, 0), new THREE.MeshBasicMaterial({ color: 0xffa040 }), MAX_P);
    for (const m of [this.smoke, this.dust, this.sparks]) { m.frustumCulled = false; m.count = 0; this.group.add(m); }
    const core = new THREE.Mesh(new THREE.SphereGeometry(1.6, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffe9a0 }));
    const halo = new THREE.Mesh(new THREE.SphereGeometry(3, 16, 12), new THREE.MeshBasicMaterial({ color: 0xff7a2a, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.fireball.add(core, halo); this.fireball.visible = false;
    this.vent = new THREE.Mesh(new THREE.ConeGeometry(5, 4.5, 14, 1, true), new THREE.MeshStandardMaterial({ color: 0x2b2624, roughness: 1, side: THREE.DoubleSide }));
    this.vent.visible = false;
    this.group.add(this.fireball, this.vent, this.glow, this.flash);
  }

  /** Camera shake amplitude (world units) right now. */
  get shake(): number { return this.shakeAmt; }

  update(s: WatershedSnapshot, dt: number, time: number, cue: (kind: string, phase: string) => void): void {
    let shake = 0;
    this.fireball.visible = false; this.glow.intensity = 0;
    this.flash.intensity *= Math.exp(-dt * 6);
    for (const e of s.events) {
      const key = `${e.kind}:${e.block}`;
      if (this.seen.get(key) !== e.state) { this.seen.set(key, e.state); cue(e.kind, e.state); }
      const at = new THREE.Vector3(this.wx(e.y), this.heightAt(e.x, e.y), this.wz(e.x));
      if (e.state === 'warning') {
        shake = Math.max(shake, 0.12);
        if (e.kind === 'meteor') {
          // streak in from high up-valley, arriving as the warning ends
          const k = 1 + e.age / e.warnS;                     // 0 → 1 over the warning
          const from = at.clone().add(new THREE.Vector3(-160, 140, 40));
          this.fireball.position.lerpVectors(from, at, k * k); this.fireball.visible = true;
          this.fireball.scale.setScalar(1 + k);
          if (Math.random() < 0.9) this.emit(this.fireball.position, new THREE.Vector3((Math.random() - 0.5) * 2, Math.random() * 2, (Math.random() - 0.5) * 2), 1.2, 1.4, 1);
        }
      }
      if (e.state === 'active' || (e.state === 'done' && e.age < 90)) {
        const a = e.age;
        if (e.kind === 'earthquake' && e.state === 'active') { shake = Math.max(shake, 0.9); if (Math.random() < 0.5) this.dustAround(at, 10); }
        if (e.kind === 'landslide' && e.state === 'active') { shake = Math.max(shake, 0.45); for (let n = 0; n < 2; n++) this.dustAround(at, 6); }
        if (e.kind === 'meteor' && a < 1.6) {
          shake = Math.max(shake, 2.4 * (1 - a / 1.6));
          if (a < dt * 2 + 0.05) {
            this.flash.position.copy(at).setY(at.y + 6); this.flash.intensity = 60;
            for (let n = 0; n < 60; n++) this.emit(at.clone().setY(at.y + 1), new THREE.Vector3((Math.random() - 0.5) * 30, 10 + Math.random() * 25, (Math.random() - 0.5) * 30), 1.4, 0.5, 1);
            for (let n = 0; n < 30; n++) this.dustAround(at, 7);
          }
        }
        if (e.kind === 'volcano') {
          this.vent.visible = true; this.vent.position.copy(at).setY(at.y + 1.2);
          const hot = Math.max(0, 1 - a / 50);
          this.glow.position.copy(at).setY(at.y + 5); this.glow.intensity = 25 * hot * (0.8 + 0.2 * Math.sin(time * 9));
          if (e.state === 'active' && a < 6) { shake = Math.max(shake, 0.5); this.emit(at.clone().setY(at.y + 4), new THREE.Vector3((Math.random() - 0.5) * 14, 14 + Math.random() * 14, (Math.random() - 0.5) * 14), 1.8, 0.45, 1); }
          if (Math.random() < 0.6 * Math.max(0.15, hot)) this.emit(at.clone().setY(at.y + 4), new THREE.Vector3((Math.random() - 0.5) * 1.5, 5 + Math.random() * 2, (Math.random() - 0.5) * 1.5), 6, 1.6, 0);
        }
      }
    }
    this.shakeAmt = shake;
    this.step(dt);
  }

  private dustAround(at: THREE.Vector3, r: number) {
    const p = at.clone().add(new THREE.Vector3((Math.random() - 0.5) * r * 2, 0.5, (Math.random() - 0.5) * r * 2));
    this.emit(p, new THREE.Vector3((Math.random() - 0.5) * 2, 1.5 + Math.random() * 2, (Math.random() - 0.5) * 2), 2.5, 1.4, 2);
  }
  private emit(p: THREE.Vector3, v: THREE.Vector3, max: number, size: number, kind: 0 | 1 | 2) {
    if (this.parts.length >= MAX_P * 3) return;
    this.parts.push({ p: p.clone(), v, life: 0, max, size, kind });
  }
  private step(dt: number) {
    this.parts = this.parts.filter((q) => q.life < q.max);
    const counts = [0, 0, 0], meshes = [this.smoke, this.sparks, this.dust];
    for (const q of this.parts) {
      q.life += dt;
      if (q.kind === 1) q.v.y -= 22 * dt; else q.v.multiplyScalar(Math.exp(-dt * 0.6));
      q.p.addScaledVector(q.v, dt);
      const k = q.life / q.max;
      const size = q.kind === 1 ? q.size * (1 - k) : q.size * (1 + k * 2.5);
      const mesh = meshes[q.kind], n = counts[q.kind]++;
      if (n >= MAX_P) continue;
      this.m.compose(q.p, this.q.identity(), this.sc.setScalar(Math.max(0.01, size)));
      mesh.setMatrixAt(n, this.m);
    }
    meshes.forEach((m, i) => { m.count = Math.min(MAX_P, counts[i]); m.instanceMatrix.needsUpdate = true; });
  }
}
