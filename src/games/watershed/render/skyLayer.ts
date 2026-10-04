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
    const m = new THREE.Mesh(new THREE.SphereGeometry(r, 18, 12), white); m.userData.k = k;
    m.position.set(x + Math.sin(seed + k) * 0.05, y, z); m.castShadow = true; m.name = 'lobe'; g.add(m);
  });
  if (face) {
    const eyeW = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 }), eyeB = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.3 });
    for (const z of [0.32, -0.32]) {
      const w = new THREE.Mesh(new THREE.SphereGeometry(0.22, 14, 10), eyeW); w.position.set(1.42, 0.32, z); w.name = 'eye'; g.add(w);
      const p = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 8), eyeB); p.position.set(1.6, 0.31, z * 0.95); p.name = 'pupil'; p.userData.home = p.position.clone(); g.add(p);
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
  private pulse = 0; private pulseT = 9; private lastCaught = -1; private blinkIn = 3; private vx = 0; private lastZ = 0; private wispPulse = 0;
  private sparks: Array<{ p: THREE.Vector3; v: THREE.Vector3; life: number }> = []; private sparkMesh!: THREE.InstancedMesh;
  private shaft!: THREE.Mesh; private labels: Array<{ s: THREE.Sprite; life: number }> = [];
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
    // absorb sparkles, the sunlight shaft over the vapor column
    this.sparkMesh = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.35, 0), new THREE.MeshBasicMaterial({ color: 0xfff6b0, transparent: true, opacity: 0.95 }), 80);
    this.sparkMesh.frustumCulled = false; this.sparkMesh.count = 0;
    this.shaft = new THREE.Mesh(new THREE.CylinderGeometry(3, 5, 1, 24, 1, true).translate(0, 0.5, 0), new THREE.MeshBasicMaterial({ color: 0xffd76a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    this.shaft.renderOrder = 4;
    this.group.add(this.wispMesh, this.rainMesh, this.cloud, this.sparkMesh, this.shaft);
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
    // a living cloud: bob, roll into turns, breathe, bubble up when it absorbs, squeeze while it rains
    this.vx += ((this.focus.z - this.lastZ) / Math.max(1e-3, dt) - this.vx) * (1 - Math.exp(-dt * 6)); this.lastZ = this.focus.z;
    this.cloud.position.copy(this.focus).setY(this.alt + Math.sin(time * 0.8) * 0.5);
    this.cloud.rotation.set(Math.max(-0.35, Math.min(0.35, -this.vx * 0.04)), Math.sin(time * 0.3) * 0.08, Math.sin(time * 0.7) * 0.04);
    if (this.lastCaught >= 0 && sky.caught > this.lastCaught) { this.pulseT = 0; this.burst(this.cloud.position, 14 + (sky.caught - this.lastCaught) * 6); this.label(`+${Math.max(1, Math.round((sky.caught - this.lastCaught) * 3))}`); }
    this.lastCaught = sky.caught;
    this.pulseT += dt;
    this.pulse = 0.32 * Math.exp(-this.pulseT * 5) * Math.cos(this.pulseT * 17) + this.wispPulse;
    this.wispPulse *= Math.exp(-dt * 6);
    const squeeze = phase === 'rain' ? 0.06 + 0.06 * (1 - s.cadNorm) : 0;
    this.cloud.traverse((o) => {
      if (o.name !== 'lobe') return;
      const k = o.userData.k as number;
      o.scale.setScalar(1 + 0.07 * Math.sin(time * 1.9 + k * 1.3));
    });
    // eyes: track the next cloudlet (or drift), and blink now and then
    const next = sky.puffs.find((q) => q.state === 'ahead');
    const look = next ? Math.max(-1, Math.min(1, (next.x - sky.x) / 12)) : Math.sin(time * 0.6) * 0.5;
    this.blinkIn -= dt;
    const blink = this.blinkIn < 0 ? (this.blinkIn < -0.14 ? (this.blinkIn = 2.5 + Math.random() * 3.5, 1) : 0.1) : 1;
    this.cloud.traverse((o) => {
      if (o.name === 'pupil') { const h = o.userData.home as THREE.Vector3; o.position.set(h.x, h.y, h.z - look * 0.08); o.scale.y = blink; }
      if (o.name === 'eye') o.scale.y = blink;
    });
    this.visualScale = Math.max(0.6, this.size * 0.5 * (phase === 'evaporate' ? Math.min(1, 0.3 + sky.vapor / 60) : 1));
    this.cloud.scale.set(this.visualScale * (1 + this.pulse + squeeze * 0.5 * Math.sin(time * 6)), this.visualScale * (1 + this.pulse * 0.8 - squeeze * Math.abs(Math.sin(time * 6))), this.visualScale * (1 + this.pulse));
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
    this.wisps = this.wisps.filter((w) => {
      const keep = w.life < 5 && w.y < this.alt;
      if (!keep && w.y >= this.alt) this.wispPulse = Math.min(0.08, this.wispPulse + 0.012);  // each wisp swells the cloud a touch
      return keep;
    });
    // golden shaft + glowing column while the vapor column stands in sunlight
    const shaftOn = phase === 'evaporate' && sky.inSun ? 1 : 0;
    const sm = this.shaft.material as THREE.MeshBasicMaterial;
    sm.opacity += ((shaftOn ? 0.22 + 0.06 * Math.sin(time * 3) : 0) - sm.opacity) * (1 - Math.exp(-dt * 4));
    this.shaft.visible = sm.opacity > 0.01;
    this.shaft.position.set(this.wx(sky.seaY), SEA, this.wz(sky.x));
    this.shaft.scale.set(1, Math.max(1, this.alt - SEA), 1);
    (this.wispMesh.material as THREE.MeshStandardMaterial).emissive.setRGB(0.5 * shaftOn, 0.4 * shaftOn, 0.15 * shaftOn);
    this.updateSparks(dt);
    this.updateLabels(dt);
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
    // the valley-wide rain at the start of the salmon run falls over the whole head of the valley
    const valley = phase === 'salmon' && sky.raining > 0;
    const want = phase === 'rain' || valley ? Math.min(MAX_RAIN, Math.round(sky.raining * 18)) : 0;
    const heavy = 1 - s.cadNorm;
    const spot = (): [number, number] => {
      if (valley) return [12 + Math.random() * (s.nx - 24), 5 + Math.random() * 18];
      const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * sky.radius * 0.7;
      return [sky.x + Math.cos(a) * d, sky.y + Math.sin(a) * d];
    };
    const top = (gx: number, gy: number) => (valley ? heightAt(gx, gy) + 22 : this.alt - 1);
    while (this.rain.length < want) {
      const [gx, gy] = spot();
      this.rain.push({ x: this.wx(gy), z: this.wz(gx), y: top(gx, gy) - Math.random() * 6, floor: Math.max(SEA, heightAt(gx, gy)), v: 18 + heavy * 10 });
    }
    if (this.rain.length > want) this.rain.length = want;
    this.rain.forEach((r, k) => {
      r.y -= r.v * dt;
      if (r.y < r.floor) {
        const [gx, gy] = spot();
        r.x = this.wx(gy); r.z = this.wz(gx); r.y = top(gx, gy); r.floor = Math.max(SEA, heightAt(gx, gy));
      }
      this.m.compose(this.p.set(r.x, r.y, r.z), this.q.identity(), this.sc.set(0.6 + heavy * 1.4, 0.8 + heavy * 1.6, 0.6 + heavy * 1.4));
      this.rainMesh.setMatrixAt(k, this.m);
    });
    this.rainMesh.count = this.rain.length; this.rainMesh.instanceMatrix.needsUpdate = true;
  }

  private burst(at: THREE.Vector3, n: number) {
    for (let k = 0; k < n && this.sparks.length < 80; k++) {
      const v = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.8, Math.random() - 0.5).normalize().multiplyScalar(6 + Math.random() * 8);
      this.sparks.push({ p: at.clone(), v, life: 0 });
    }
  }
  private updateSparks(dt: number) {
    this.sparks = this.sparks.filter((sp) => sp.life < 0.9);
    this.sparks.forEach((sp, k) => {
      sp.life += dt; sp.v.multiplyScalar(Math.exp(-dt * 2.5)); sp.p.addScaledVector(sp.v, dt);
      const sz = Math.max(0, 1 - sp.life / 0.9) * this.visualScale * 0.4;
      this.m.compose(sp.p, this.q.setFromAxisAngle(this.p.set(0, 1, 0), sp.life * 8), this.sc.setScalar(sz));
      this.sparkMesh.setMatrixAt(k, this.m);
    });
    this.sparkMesh.count = this.sparks.length; this.sparkMesh.instanceMatrix.needsUpdate = true;
  }
  /** A floating "+N" above the cloud. */
  private label(text: string) {
    if (typeof document === 'undefined') return;
    const c = document.createElement('canvas'); c.width = 128; c.height = 64;
    const g = c.getContext('2d'); if (!g) return;
    g.font = 'bold 44px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = 8; g.strokeStyle = 'rgba(20,60,110,0.85)'; g.strokeText(text, 64, 34); g.fillStyle = '#fff'; g.fillText(text, 64, 34);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false }));
    sp.position.copy(this.cloud.position).setY(this.cloud.position.y + this.visualScale * 1.6);
    sp.scale.set(this.visualScale * 2.4, this.visualScale * 1.2, 1); sp.renderOrder = 10;
    this.group.add(sp); this.labels.push({ s: sp, life: 0 });
  }
  private updateLabels(dt: number) {
    this.labels = this.labels.filter((l) => {
      l.life += dt; l.s.position.y += dt * 3; (l.s.material as THREE.SpriteMaterial).opacity = Math.max(0, 1 - l.life / 1.4);
      if (l.life < 1.4) return true;
      this.group.remove(l.s); (l.s.material as THREE.SpriteMaterial).map?.dispose(); l.s.material.dispose(); return false;
    });
  }
}
