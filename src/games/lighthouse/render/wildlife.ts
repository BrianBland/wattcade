// Wildlife around the island: a dolphin pod that escorts ships through calm seas, a whale that visits during a Steady Light
// streak, seals on the reef, puffins on the lighthouse cliff and sheep grazing the meadow. Cosmetic only (render side).
import * as THREE from 'three';
import { islandHeight, LIGHTHOUSE, LIGHTHOUSE_Y } from '../sim/layout';
import type { Fx } from './fx';
import { waveHeight } from './sea';
import { lam, mulberry } from './util';
import { REEFS } from './world';

export interface WildFrame {
  t: number; dt: number; night: number; storm: number; amp: number; meadow: number;
  /** Sailing ships the dolphins can escort: position and unit heading. */
  ships: Array<{ x: number; z: number; hx: number; hz: number }>;
  whale: { age: number; x: number; z: number };
}

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

function dolphinModel(): THREE.Group {
  const g = new THREE.Group();
  const skin = lam(0x5d7d96), belly = lam(0xcfdbe3);
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 6), skin); body.scale.set(2.3, 0.62, 0.66);
  const under = new THREE.Mesh(new THREE.SphereGeometry(0.46, 8, 6), belly); under.scale.set(2.0, 0.45, 0.55); under.position.y = -0.1;
  const snout = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.6, 6), skin); snout.rotation.z = -Math.PI / 2; snout.position.x = 1.3;
  const fin = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.55, 4), skin); fin.position.set(-0.1, 0.38, 0); fin.rotation.z = 0.5; fin.scale.z = 0.3;
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.06, 0.9), skin); tail.position.x = -1.25;
  g.add(body, under, snout, fin, tail);
  return g;
}

function whaleModel(): { g: THREE.Group; fluke: THREE.Group } {
  const g = new THREE.Group();
  const skin = lam(0x2f3e4c), belly = lam(0x9fb0bd);
  const body = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), skin); body.scale.set(5.2, 1.25, 1.5);
  const chin = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 6), belly); chin.scale.set(4.2, 0.8, 1.2); chin.position.set(0.6, -0.5, 0);
  const finL = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.12, 2.8), skin); finL.position.set(1.8, -0.5, 1.6); finL.rotation.set(0.3, 0.5, 0);
  const finR = finL.clone(); finR.position.z = -1.6; finR.rotation.set(-0.3, -0.5, 0);
  const hump = new THREE.Mesh(new THREE.ConeGeometry(0.4, 0.6, 5), skin); hump.position.set(-2.4, 1.05, 0);
  const fluke = new THREE.Group(); fluke.position.x = -5;
  const stock = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.7, 2.2, 6), skin); stock.rotation.z = Math.PI / 2; stock.position.x = -0.6;
  const blade = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.14, 4.2), skin); blade.position.x = -1.8;
  fluke.add(stock, blade);
  g.add(body, chin, finL, finR, hump, fluke);
  return { g, fluke };
}

function sealModel(): { g: THREE.Group; head: THREE.Object3D } {
  const g = new THREE.Group();
  const skin = lam(0x8b8f93);
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 6), skin); body.scale.set(1.5, 0.55, 0.65);
  const head = new THREE.Group(); head.position.set(0.7, 0.2, 0);
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.26, 7, 5), skin);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.06, 5, 4), lam(0x222222)); nose.position.x = 0.25;
  head.add(skull, nose);
  g.add(body, head);
  return { g, head };
}

function puffinModel(): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 0.5, 6), lam(0x1d1f24)); body.position.y = 0.25;
  const chest = new THREE.Mesh(new THREE.SphereGeometry(0.17, 6, 5), lam(0xf4f4f0)); chest.position.set(0.09, 0.24, 0); chest.scale.set(0.6, 1.2, 1);
  const face = new THREE.Mesh(new THREE.SphereGeometry(0.13, 6, 5), lam(0xf4f4f0)); face.position.set(0.04, 0.55, 0);
  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.18, 4), lam(0xff6a1a)); beak.rotation.z = -Math.PI / 2; beak.position.set(0.18, 0.54, 0);
  const feet = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.04, 0.22), lam(0xff7a2a)); feet.position.y = 0.02;
  g.add(body, chest, face, beak, feet);
  return g;
}

function sheepModel(): { g: THREE.Group; head: THREE.Object3D } {
  const g = new THREE.Group();
  const wool = new THREE.Mesh(new THREE.IcosahedronGeometry(0.42, 0), lam(0xf3f0e6)); wool.scale.set(1.25, 0.9, 0.95); wool.position.y = 0.55;
  const head = new THREE.Group(); head.position.set(0.5, 0.62, 0);
  const face = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.24, 0.22), lam(0x2b2622)); face.position.x = 0.1;
  const ears = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.42), lam(0x2b2622)); ears.position.set(0.02, 0.08, 0);
  head.add(face, ears);
  g.add(wool, head);
  const leg = new THREE.BoxGeometry(0.08, 0.32, 0.08), lm = lam(0x2b2622);
  for (const [x, z] of [[0.28, 0.17], [0.28, -0.17], [-0.28, 0.17], [-0.28, -0.17]]) { const l = new THREE.Mesh(leg, lm); l.position.set(x, 0.16, z); g.add(l); }
  g.traverse((o) => { o.castShadow = true; });
  return { g, head };
}

interface Dolphin { g: THREE.Group; ph: number; side: number; back: number; wasUp: boolean }
interface Sheep { g: THREE.Group; head: THREE.Object3D; x: number; z: number; tx: number; tz: number; wait: number; seed: number; hx: number; hz: number }

export class Wildlife {
  readonly group = new THREE.Group();
  private pod: Dolphin[] = [];
  private podPos = V(-30, 0, 46); private podDir = V(1, 0, 0); private podAlpha = 0;
  private whale: { g: THREE.Group; fluke: THREE.Group }; private spoutAt = -1;
  private seals: Array<{ g: THREE.Group; head: THREE.Object3D; base: THREE.Vector3; ph: number }> = [];
  private puffins: Array<{ g: THREE.Group; base: THREE.Vector3; ph: number; yaw: number }> = [];
  private sheep: Sheep[] = [];
  private tmp = V();

  constructor(private fx: Fx, private okSpot: (x: number, z: number) => boolean) {
    for (let i = 0; i < 4; i++) {
      const g = dolphinModel(); g.scale.setScalar(0.85 + (i % 2) * 0.15); g.visible = false; this.group.add(g);
      this.pod.push({ g, ph: i * 0.27, side: i % 2 ? 1 : -1, back: i * 1.6, wasUp: false });
    }
    this.whale = whaleModel(); this.whale.g.scale.setScalar(1.8); this.whale.g.visible = false; this.group.add(this.whale.g);
    // seals hauled out on the two reefs nobody wrecks on
    const r = mulberry(31);
    for (const [k, n] of [[1, 2], [2, 2]] as const) {
      const [x, z, s] = REEFS[k];
      for (let i = 0; i < n; i++) {
        const m = sealModel(); this.group.add(m.g);
        const base = V(x + (i - 0.5) * s * 0.7, s * 0.62 + 0.12, z + (r() - 0.5) * s * 0.4);
        m.g.position.copy(base); m.g.rotation.y = r() * Math.PI * 2;
        this.seals.push({ ...m, base, ph: r() * 10 });
      }
    }
    // puffins on the cliff top around the lighthouse, on the seaward side
    for (let i = 0, tries = 0; i < 7 && tries < 400; tries++) {
      const a = Math.PI * (0.35 + r() * 0.9), rr = 4.6 + r() * 3.2;
      const x = LIGHTHOUSE.x + Math.cos(a) * rr, z = LIGHTHOUSE.z + Math.sin(a) * rr, h = islandHeight(x, z);
      if (h < LIGHTHOUSE_Y - 2.5) continue;
      const g = puffinModel(); g.scale.setScalar(0.85); this.group.add(g);
      this.puffins.push({ g, base: V(x, h, z), ph: r() * 10, yaw: a + Math.PI }); i++;
    }
  }

  /** Flock size follows island bloom; each sheep grazes around a spot on open meadow. */
  private syncSheep(meadow: number) {
    const want = Math.min(14, 3 + Math.floor(meadow * 14));
    if (this.sheep.length === want) return;
    for (const s of this.sheep) this.group.remove(s.g);
    this.sheep = [];
    const r = mulberry(555);
    for (let it = 0; it < 3000 && this.sheep.length < want; it++) {
      const x = -22 + r() * 46, z = -18 + r() * 24;
      if (!this.okSpot(x, z)) continue;
      const m = sheepModel(); m.g.scale.setScalar(0.9 + r() * 0.25); this.group.add(m.g);
      this.sheep.push({ ...m, x, z, tx: x, tz: z, wait: r() * 6, seed: this.sheep.length + 1, hx: x, hz: z });
    }
  }

  update(f: WildFrame) {
    this.updateDolphins(f);
    this.updateWhale(f);
    const hide = f.storm > 0.3;
    for (const s of this.seals) {
      s.g.visible = !hide;
      s.g.position.y = s.base.y + Math.sin(f.t * 0.6 + s.ph) * 0.03;
      const look = Math.sin(f.t * 0.23 + s.ph);
      s.head.rotation.z = look > 0.6 ? 0.6 : 0.05; s.head.rotation.y = Math.sin(f.t * 0.4 + s.ph) * 0.4;
    }
    for (const p of this.puffins) {
      p.g.visible = !hide && f.night < 0.75;
      const hop = Math.max(0, Math.sin(f.t * 2.2 + p.ph * 3)) ** 8;
      p.g.position.set(p.base.x, p.base.y + hop * 0.25, p.base.z);
      p.g.rotation.y = p.yaw + Math.sin(f.t * 0.5 + p.ph) * 0.8;
    }
    this.syncSheep(f.meadow);
    for (const s of this.sheep) {
      const d = Math.hypot(s.tx - s.x, s.tz - s.z);
      if (d < 0.05) {
        s.wait -= f.dt;
        if (s.wait <= 0) {
          const r = mulberry(s.seed * 977 + Math.floor(f.t));
          for (let k = 0; k < 6; k++) { const x = s.hx + (r() - 0.5) * 6, z = s.hz + (r() - 0.5) * 6; if (this.okSpot(x, z)) { s.tx = x; s.tz = z; break; } }
          s.wait = 4 + r() * 8;
        }
      } else {
        const st = Math.min(d, 0.45 * f.dt);
        s.x += ((s.tx - s.x) / d) * st; s.z += ((s.tz - s.z) / d) * st;
        s.g.rotation.y = Math.atan2(-(s.tz - s.z), s.tx - s.x);
      }
      const moving = d >= 0.05;
      s.head.rotation.z = moving ? 0 : -0.7 + Math.sin(f.t * 3 + s.seed) * 0.08; // head down to graze
      s.g.position.set(s.x, islandHeight(s.x, s.z) - 0.02 + (moving ? Math.abs(Math.sin(f.t * 8 + s.seed)) * 0.05 : 0), s.z);
    }
  }

  private updateDolphins(f: WildFrame) {
    // they come out in calm, daylit seas, and fade away when it gets rough
    const want = f.storm < 0.15 && f.amp < 0.85 && f.night < 0.7 ? 1 : 0;
    this.podAlpha += (want - this.podAlpha) * Math.min(1, f.dt * 0.5);
    let target: THREE.Vector3, dir: THREE.Vector3;
    const ship = f.ships[0];
    if (ship) { target = this.tmp.set(ship.x + ship.hz * 4.5 + ship.hx * 3, 0, ship.z - ship.hx * 4.5 + ship.hz * 3); dir = V(ship.hx, 0, ship.hz); }
    else { const a = f.t * 0.035; target = this.tmp.set(22 + Math.cos(a) * 22, 0, -36 + Math.sin(a * 2) * 7); dir = V(-Math.sin(a), 0, Math.cos(a * 2) * 0.45).normalize(); }
    const k = 1 - Math.exp(-f.dt * 0.6);
    this.podPos.lerp(target, k); this.podDir.lerp(dir, k).normalize();
    const side = V(-this.podDir.z, 0, this.podDir.x);
    for (const d of this.pod) {
      const p = (f.t * 0.42 + d.ph) % 1, leap = p < 0.32, u = p / 0.32;
      const along = leap ? (u - 0.5) * 4.2 : 0;
      const x = this.podPos.x + side.x * d.side * (1 + d.back * 0.4) - this.podDir.x * d.back + this.podDir.x * along;
      const z = this.podPos.z + side.z * d.side * (1 + d.back * 0.4) - this.podDir.z * d.back + this.podDir.z * along;
      const sea = waveHeight(x, z, f.t, f.amp);
      d.g.visible = this.podAlpha > 0.5 && leap;
      if (leap) {
        d.g.position.set(x, sea - 0.4 + Math.sin(u * Math.PI) * 1.9, z);
        d.g.rotation.set(0, Math.atan2(-this.podDir.z, this.podDir.x), Math.cos(u * Math.PI) * 0.85);
      }
      if (d.wasUp !== leap && this.podAlpha > 0.5) this.fx.splash(V(x, sea, z), leap ? 0.6 : 1);
      d.wasUp = leap;
    }
  }

  private updateWhale(f: WildFrame) {
    const a = f.whale.age, w = this.whale;
    const on = a >= 0 && a < 30;
    w.g.visible = on;
    if (!on) { this.spoutAt = -1; return; }
    const x = f.whale.x - a * 0.6, z = f.whale.z;
    const sea = waveHeight(x, z, f.t, f.amp);
    let y: number, pitch = 0, fl = 0;
    if (a < 4) y = -4.5 + (a / 4) * 3.6;
    else if (a < 21) y = -0.9 + Math.sin(a * 0.8) * 0.18;
    else { const k = (a - 21) / 7; y = -0.9 - k * 5; pitch = -Math.min(1, k * 2.2) * 0.55; fl = Math.sin(Math.min(1, k * 1.6) * Math.PI) * 1.4; }
    w.g.position.set(x, sea + y, z);
    w.g.rotation.set(0, Math.PI, pitch); // swims toward -x
    w.fluke.rotation.z = -fl; // tail lifts clear of the water as she dives
    // blows: a few spouts while at the surface
    for (const at of [4.5, 10, 16]) if (this.spoutAt < at && a >= at) { this.spoutAt = at; this.fx.spout(V(x - 3.4, sea + 0.9, z)); }
    if (this.spoutAt < 26 && a >= 26) { this.spoutAt = 26; this.fx.splash(V(x + 9, sea, z), 3); }
  }
}
