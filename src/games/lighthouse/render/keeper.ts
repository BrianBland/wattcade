// The lighthouse keeper: potters by the cottage on idle days, polishes the lens while you ride steady, waves at ships
// as they dock, holds their cap in a storm, and climbs the tower at dusk to light the lamp.
import * as THREE from 'three';
import { islandHeight, LIGHTHOUSE, LIGHTHOUSE_Y } from '../sim/layout';
import { box, capsule, cyl, ico, lam, sphere } from './util';

const KEEPER_COAT = new THREE.LatheGeometry([[0, 0.3], [0.15, 0.3], [0.17, 0.36], [0.175, 0.46], [0.165, 0.56], [0.165, 0.62], [0.14, 0.67], [0.08, 0.705], [0, 0.715]].map(([x, y]) => new THREE.Vector2(x, y)), 18);

const GALLERY_Y = LIGHTHOUSE_Y + 13.3, GALLERY_R = 1.62, DOOR = { x: LIGHTHOUSE.x, z: LIGHTHOUSE.z + 2.55 };
const GARDEN = { x: LIGHTHOUSE.x + 3.2, z: LIGHTHOUSE.z + 4.6 };
const CLIMB_S = 4;

export interface KeeperFrame {
  t: number; dt: number; inZone: boolean; storm: boolean; night: number;
  /** Seconds since the latest ship tied up (wave), and the harbour heading to face while waving. */
  dockAge: number; harbour: { x: number; z: number };
  /** True while the dusk ceremony wants the keeper up top. */
  wantUp: boolean; festival: boolean;
}

export class Keeper {
  readonly group = new THREE.Group();
  private arm: THREE.Group; private cap: THREE.Object3D; private body: THREE.Mesh; private legs: THREE.Group[] = [];
  private up = false; private first = true; private climbT = -1; private climbingUp = true;
  private ang = 0.6; private gx = GARDEN.x; private gz = GARDEN.z; private tx = GARDEN.x; private tz = GARDEN.z; private wait = 2;

  constructor() {
    // Built facing +x (the code below turns the keeper with face()). Shares the islanders' shapes.
    const g = this.group, coat = lam(0x23395a), skin = lam(0xf2c9a0);
    const add = (parent: THREE.Object3D, geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number) => {
      const me = new THREE.Mesh(geo, m); me.position.set(x, y, z); parent.add(me); return me;
    };
    for (const sz of [-1, 1]) {
      const leg = new THREE.Group(); leg.position.set(0, 0.36, sz * 0.075);
      add(leg, capsule(0.055, 0.2), lam(0x2d3138), 0, -0.155, 0);
      add(leg, sphere(0.06), lam(0x2a221c), 0.03, -0.31, 0).scale.set(1.3, 0.55, 0.9);
      this.legs.push(leg); g.add(leg);
    }
    this.body = add(g, KEEPER_COAT, coat, 0, 0, 0);
    add(g, cyl(0.168, 0.168, 0.05, 24), lam(0x3a2a1a), 0, 0.4, 0);
    add(g, sphere(0.13), skin, 0, 0.83, 0);
    add(g, sphere(0.026), skin, 0.128, 0.84, 0);
    const beard = add(g, ico(0.11), lam(0xf4f1ea), 0.07, 0.76, 0); beard.scale.set(0.8, 0.9, 1.15);
    this.cap = new THREE.Group();
    add(this.cap, cyl(0.14, 0.145, 0.1, 20), lam(0x1d2a40), 0, 0.95, 0);
    add(this.cap, cyl(0.15, 0.15, 0.02, 20), lam(0x111111), 0, 0.905, 0);
    const peak = add(this.cap, box(0.14, 0.02, 0.22), lam(0x111111), 0.15, 0.905, 0); peak.rotation.z = -0.15;
    this.arm = new THREE.Group(); this.arm.position.set(0, 0.645, 0.175);
    add(this.arm, capsule(0.042, 0.2), coat, 0, -0.14, 0);
    add(this.arm, sphere(0.045), skin, 0, -0.29, 0);
    const other = new THREE.Group(); other.position.set(0, 0.645, -0.175); other.rotation.x = 0.12;
    add(other, capsule(0.042, 0.2), coat, 0, -0.14, 0);
    add(other, sphere(0.045), skin, 0, -0.29, 0);
    g.add(this.cap, this.arm, other);
    g.traverse((o) => { o.castShadow = true; });
    g.scale.setScalar(1.4);
  }

  /** Swing the legs while walking. */
  private stride(t: number, moving: boolean) {
    const s = moving ? Math.sin(t * 8) * 0.5 : 0;
    this.legs[0].rotation.z = s; this.legs[1].rotation.z = -s;
  }

  /** Is the keeper on the gallery (not mid-climb)? */
  get onGallery() { return this.up && this.climbT < 0; }

  update(f: KeeperFrame) {
    const wantUp = f.wantUp || f.storm || f.inZone || f.night > 0.4 || f.festival;
    if (this.first) { this.first = false; this.up = wantUp; } // start where they belong, no climb on load
    if (wantUp !== this.up && this.climbT < 0) { this.climbT = 0; this.climbingUp = wantUp; this.up = wantUp; }
    const g = this.group;
    if (this.climbT >= 0) { // inside the tower: walk to the door, vanish, appear at the other end
      this.climbT += f.dt;
      g.visible = false;
      if (this.climbT > CLIMB_S) { this.climbT = -1; if (!this.climbingUp) { this.gx = DOOR.x; this.gz = DOOR.z + 0.6; this.tx = GARDEN.x; this.tz = GARDEN.z; } }
      return;
    }
    g.visible = true;
    this.arm.rotation.set(0, 0, 0); this.cap.position.set(0, 0, 0); this.cap.rotation.set(0, 0, 0);
    if (this.up) this.gallery(f); else this.ground(f);
  }

  private face(dx: number, dz: number) { this.group.rotation.y = Math.atan2(-dz, dx); }

  private gallery(f: KeeperFrame) {
    const g = this.group;
    const toward = (x: number, z: number) => Math.atan2(z - LIGHTHOUSE.z, x - LIGHTHOUSE.x);
    let target = this.ang, walk = false;
    if (f.dockAge < 7) target = toward(f.harbour.x, f.harbour.z);
    else if (f.storm) target = toward(LIGHTHOUSE.x + 10, LIGHTHOUSE.z + 30);
    else if (f.inZone) { target = this.ang + f.dt * 0.12; walk = Math.sin(f.t * 0.35) > 0.2; } // slow laps, pausing to polish
    const d = Math.atan2(Math.sin(target - this.ang), Math.cos(target - this.ang));
    this.ang += Math.sign(d) * Math.min(Math.abs(d), f.dt * (walk ? 0.45 : 0.9));
    const x = LIGHTHOUSE.x + Math.cos(this.ang) * GALLERY_R, z = LIGHTHOUSE.z + Math.sin(this.ang) * GALLERY_R;
    g.position.set(x, GALLERY_Y + (walk ? Math.abs(Math.sin(f.t * 7)) * 0.04 : 0), z);
    this.stride(f.t * 0.875, walk);
    const ox = Math.cos(this.ang), oz = Math.sin(this.ang);
    if (f.dockAge < 7) { // wave at the ship
      this.face(ox, oz);
      this.arm.rotation.x = -2.6 + Math.sin(f.t * 9) * 0.45;
    } else if (f.storm) { // hold on to that cap
      this.face(ox, oz);
      this.arm.rotation.x = -2.9; this.arm.rotation.z = 0.3;
      g.rotation.z = Math.sin(f.t * 3.1) * 0.06;
      this.cap.rotation.x = Math.sin(f.t * 5) * 0.08;
      return;
    } else if (f.inZone && !walk) { // face the lantern and polish in little circles
      this.face(-ox, -oz);
      this.arm.rotation.z = 1.35 + Math.sin(f.t * 6) * 0.25; this.arm.rotation.x = Math.cos(f.t * 6) * 0.25;
    } else if (walk) this.face(-oz, ox);
    else { this.face(ox, oz); this.arm.rotation.x = Math.sin(f.t * 0.6) * 0.1; }
    g.rotation.z = 0;
  }

  private ground(f: KeeperFrame) {
    const g = this.group, d = Math.hypot(this.tx - this.gx, this.tz - this.gz);
    if (d < 0.05) {
      this.wait -= f.dt;
      if (this.wait <= 0) { const a = f.t * 1.7; this.tx = GARDEN.x + Math.cos(a) * 1.6; this.tz = GARDEN.z + Math.sin(a) * 1.1; this.wait = 3 + (Math.sin(f.t) + 1) * 2; }
      this.arm.rotation.z = 0.7 + Math.sin(f.t * 3) * 0.2; // pottering: tending the flowers
      g.rotation.z = 0;
    } else {
      const st = Math.min(d, f.dt * 0.8);
      this.gx += ((this.tx - this.gx) / d) * st; this.gz += ((this.tz - this.gz) / d) * st;
      this.face(this.tx - this.gx, this.tz - this.gz);
    }
    this.stride(f.t, d >= 0.05);
    g.position.set(this.gx, Math.max(LIGHTHOUSE_Y - 0.5, islandHeight(this.gx, this.gz)) + (d >= 0.05 ? Math.abs(Math.sin(f.t * 8)) * 0.05 : 0), this.gz);
  }
}
