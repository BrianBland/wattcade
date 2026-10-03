// The sky phases, drawn: a glowing sun, golden sunlit patches on the sea, vapor wisps rising from your column, a cartoon
// cloud with a face that grows as it soaks up cloudlets, and rain streaks under it on the peaks. Render-only.
import * as THREE from 'three';
import type { WatershedSnapshot } from '../sim/sim';
import { SEA } from '../sim/terrain';

const MAX_WISPS = 260, MAX_RAIN = 420;

function glowTexture(): THREE.Texture | null {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d'); if (!g) return null;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,250,220,1)'); grad.addColorStop(0.25, 'rgba(255,230,150,0.8)'); grad.addColorStop(1, 'rgba(255,200,100,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

/** A fluffy cluster of spheres; `face` adds googly eyes and a smile on the +X side. */
function cloudModel(face: boolean, seed = 0): THREE.Group {
  const g = new THREE.Group();
  const white = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, emissive: 0x8a9aa8, emissiveIntensity: 0.35 });
  const lobes = [[0, 0, 0, 1], [0.7, 0.15, 0.55, 0.75], [-0.75, 0.05, 0.45, 0.78], [0.2, 0.45, -0.2, 0.8], [-0.4, -0.05, -0.65, 0.7], [0.65, -0.1, -0.55, 0.68], [-0.1, 0.65, 0.35, 0.6]];
  lobes.forEach(([x, y, z, r], k) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(r, 18, 12), white);
    m.position.set(x + Math.sin(seed + k) * 0.05, y, z); m.castShadow = true; m.name = 'lobe'; g.add(m);
  });
  if (face) {
    const eyeW = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 }), eyeB = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.3 });
    for (const z of [0.32, -0.32]) {
      const w = new THREE.Mesh(new THREE.SphereGeometry(0.22, 14, 10), eyeW); w.position.set(1.42, 0.32, z); g.add(w);
      const p = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 8), eyeB); p.position.set(1.6, 0.31, z * 0.95); p.name = 'pupil'; g.add(p);
    }
    const smile = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.04, 6, 16, Math.PI), eyeB);
    smile.rotation.set(0, Math.PI / 2, Math.PI); smile.position.set(1.5, -0.02, 0); smile.name = 'smile'; g.add(smile);
    const blush = new THREE.MeshStandardMaterial({ color: 0xff9ab0, roughness: 0.8, transparent: true, opacity: 0.7 });
    for (const z of [0.6, -0.6]) { const b = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), blush); b.scale.set(0.4, 0.7, 1); b.position.set(1.38, 0.05, z); g.add(b); }
  }
  return g;
}

interface Wisp { x: number; y: number; z: number; vy: number; life: number; r: number }
interface Drop { x: number; z: number; y: number; floor: number; v: number }

export class SkyLayer {
  readonly group = new THREE.Group();
  private sun = new THREE.Group();
  private patches: THREE.Mesh[] = [];
  private wisps: Wisp[] = []; private wispMesh: THREE.InstancedMesh;
  private cloud = cloudModel(true);
  private cloudMats: THREE.MeshStandardMaterial[] = [];
  private puffs = new Map<number, { g: THREE.Group; t: number }>();
  private rain: Drop[] = []; private rainMesh: THREE.InstancedMesh;
  private lastVapor = 0; private alt = 18; private size = 1;
  /** Current drawn cloud scale (the camera keeps its distance in proportion). */
  visualScale = 1;
  private m = new THREE.Matrix4(); private q = new THREE.Quaternion(); private p = new THREE.Vector3(); private sc = new THREE.Vector3();
  /** World position of the cloud / vapor column (camera focus in the sky phases). */
  readonly focus = new THREE.Vector3();

  constructor(private wx: (j: number) => number, private wz: (i: number) => number, sunDir: THREE.Vector3) {
    // the sun: a bright disc with a soft additive glow, along the light direction
    const tex = glowTexture();
    const disc = new THREE.Mesh(new THREE.SphereGeometry(9, 24, 16), new THREE.MeshBasicMaterial({ color: 0xfff3c4, fog: false }));
    this.sun.add(disc);
    if (tex) {
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false }));
      glow.scale.setScalar(70); this.sun.add(glow);
    }
    this.sun.position.copy(sunDir).normalize().multiplyScalar(330);
    this.group.add(this.sun);
    // sunlit patches on the sea
    for (let k = 0; k < 3; k++) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffc94a, map: tex, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }));
      m.renderOrder = 3; this.patches.push(m); this.group.add(m);
    }
    this.wispMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 12, 8), new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, roughness: 1, depthWrite: false }), MAX_WISPS);
    this.wispMesh.frustumCulled = false; this.wispMesh.renderOrder = 4;
    this.rainMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.05, 0.05, 1, 4).translate(0, 0.5, 0), new THREE.MeshBasicMaterial({ color: 0xbfe4ff, transparent: true, opacity: 0.7 }), MAX_RAIN);
    this.rainMesh.frustumCulled = false;
    this.cloud.traverse((o) => { const mm = (o as THREE.Mesh).material as THREE.MeshStandardMaterial; if (o.name === 'lobe' && mm && !this.cloudMats.includes(mm)) this.cloudMats.push(mm); });
    this.group.add(this.wispMesh, this.rainMesh, this.cloud);
  }

  update(s: WatershedSnapshot, dt: number, time: number, heightAt: (x: number, y: number) => number): void {
    const sky = s.sky, phase = s.phase;
    const skyPhase = phase === 'evaporate' || phase === 'cloud' || phase === 'rain';
    // patches
    this.patches.forEach((m, k) => {
      const sp = sky.sun[k];
      m.visible = phase === 'evaporate' && !!sp;
      if (!sp) return;
      m.position.set(this.wx(sky.seaY), SEA + 0.15, this.wz(sp.x));
      m.scale.set(sp.r * 1.3, 1, sp.r);
      (m.material as THREE.MeshBasicMaterial).opacity = 0.4 + 0.15 * Math.sin(time * 2 + k);
    });
    // cloud: altitude follows the terrain under it, size follows the sim
    const ground = Math.max(SEA, heightAt(sky.x, sky.y));
    const targetAlt = phase === 'evaporate' ? 14 + sky.radius * 0.4 : ground + 9 + sky.radius * 0.35;
    this.alt += (targetAlt - this.alt) * (1 - Math.exp(-dt * 1.2));
    this.size += (sky.radius - this.size) * (1 - Math.exp(-dt * 2));
    this.focus.set(this.wx(sky.y), this.alt, this.wz(sky.x));
    this.cloud.visible = skyPhase;
    this.cloud.position.copy(this.focus).setY(this.alt + Math.sin(time * 0.8) * 0.4);
    this.visualScale = Math.max(0.6, this.size * 0.5 * (phase === 'evaporate' ? Math.min(1, 0.3 + sky.vapor / 60) : 1));
    this.cloud.scale.setScalar(this.visualScale);
    const grey = phase === 'rain' ? 0.62 : 1;
    for (const mm of this.cloudMats) { mm.color.setScalar(grey); mm.emissiveIntensity = phase === 'rain' ? 0.1 : 0.35; }
    const smile = this.cloud.getObjectByName('smile'); if (smile) smile.scale.y = phase === 'rain' ? -1 : 1; // a determined frown while it rains

    // vapor wisps rising from the column into the cloud
    const dv = Math.max(0, sky.vapor - this.lastVapor); this.lastVapor = sky.vapor;
    if (phase === 'evaporate') {
      let n = Math.min(8, dv * 40 + (Math.random() < 0.3 ? 1 : 0));
      while (n-- > 0 && this.wisps.length < MAX_WISPS) {
        this.wisps.push({ x: this.wx(sky.seaY) + (Math.random() - 0.5) * 3, y: SEA + 0.3, z: this.wz(sky.x) + (Math.random() - 0.5) * 3, vy: 3 + Math.random() * 2, life: 0, r: 0.4 + Math.random() * 0.5 });
      }
    }
    this.wisps = this.wisps.filter((w) => w.life < 5 && w.y < this.alt);
    this.wisps.forEach((w, k) => {
      w.life += dt; w.y += w.vy * dt; w.x += Math.sin(time + k) * dt * 0.5;
      const grow = Math.min(1, w.life * 1.5) * (1 + w.life * 0.4);
      this.m.compose(this.p.set(w.x, w.y, w.z), this.q.identity(), this.sc.setScalar(w.r * grow));
      this.wispMesh.setMatrixAt(k, this.m);
    });
    this.wispMesh.count = this.wisps.length; this.wispMesh.instanceMatrix.needsUpdate = true;

    // cloudlets
    const live = new Set<number>();
    for (const pf of sky.puffs) {
      live.add(pf.id);
      let o = this.puffs.get(pf.id);
      if (!o) { o = { g: cloudModel(false, pf.id), t: 0 }; this.puffs.set(pf.id, o); this.group.add(o.g); }
      o.t += dt;
      const base = this.p.set(this.wx(pf.y), Math.max(SEA, heightAt(pf.x, pf.y)) + 12, this.wz(pf.x));
      const sz = Math.sqrt(pf.size) * 0.9;
      if (pf.state === 'caught') {
        o.g.position.lerp(this.cloud.position, 1 - Math.exp(-dt * 5));
        o.g.scale.multiplyScalar(Math.exp(-dt * 4));
      } else {
        o.g.position.copy(base).setY(base.y + Math.sin(time + pf.id) * 0.5);
        o.g.scale.setScalar(sz * Math.min(1, o.t) * (pf.state === 'missed' ? Math.max(0, 1 - pf.age * 0.05) : 1));
      }
      o.g.visible = skyPhase;
    }
    for (const [id, o] of this.puffs) if (!live.has(id)) { this.group.remove(o.g); o.g.traverse((x) => (x as THREE.Mesh).geometry?.dispose()); this.puffs.delete(id); }

    // rain streaks: count follows the rain rate, length/weight follow cadence (grind = downpour, spin = drizzle)
    const want = phase === 'rain' ? Math.min(MAX_RAIN, Math.round(sky.raining * 18)) : 0;
    const heavy = 1 - s.cadNorm;
    while (this.rain.length < want) {
      const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * sky.radius * 0.7;
      const gx = sky.x + Math.cos(a) * d, gy = sky.y + Math.sin(a) * d;
      this.rain.push({ x: this.wx(gy), z: this.wz(gx), y: this.alt - 1 - Math.random() * 6, floor: Math.max(SEA, heightAt(gx, gy)), v: 18 + heavy * 10 });
    }
    if (this.rain.length > want) this.rain.length = want;
    this.rain.forEach((r, k) => {
      r.y -= r.v * dt;
      if (r.y < r.floor) {
        const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * sky.radius * 0.7;
        const gx = sky.x + Math.cos(a) * d, gy = sky.y + Math.sin(a) * d;
        r.x = this.wx(gy); r.z = this.wz(gx); r.y = this.alt - 1; r.floor = Math.max(SEA, heightAt(gx, gy));
      }
      this.m.compose(this.p.set(r.x, r.y, r.z), this.q.identity(), this.sc.set(0.6 + heavy * 1.4, 0.8 + heavy * 1.6, 0.6 + heavy * 1.4));
      this.rainMesh.setMatrixAt(k, this.m);
    });
    this.rainMesh.count = this.rain.length; this.rainMesh.instanceMatrix.needsUpdate = true;
  }
}
