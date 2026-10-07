// Short-lived particles: coin sparkles when a ship docks, dust when something is built, splashes, whale spouts, fireworks.
import * as THREE from 'three';
import { softTexture } from './util';

export interface BurstOpts {
  n: number; color: number | number[]; speed: number; up?: number; gravity?: number; life?: number; spread?: number; drag?: number;
}

/** A fixed pool of points with per-particle velocity, colour and fade. One pool per blending mode / size. */
export class Particles {
  readonly points: THREE.Points;
  private pos: Float32Array; private col: Float32Array; private vel: Float32Array;
  private age: Float32Array; private life: Float32Array; private grav: Float32Array; private drag: Float32Array; private base: Float32Array;
  private next = 0; private live = 0;
  private c = new THREE.Color();

  constructor(private max: number, size: number, additive: boolean) {
    this.pos = new Float32Array(max * 3); this.col = new Float32Array(max * 4); this.vel = new Float32Array(max * 3);
    this.age = new Float32Array(max).fill(1e9); this.life = new Float32Array(max).fill(1); this.grav = new Float32Array(max);
    this.drag = new Float32Array(max); this.base = new Float32Array(max * 3);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 4));
    this.points = new THREE.Points(g, new THREE.PointsMaterial({
      size, map: softTexture(64, 0.25), vertexColors: true, transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    }));
    this.points.frustumCulled = false;
  }

  burst(at: THREE.Vector3, o: BurstOpts) {
    const cols = Array.isArray(o.color) ? o.color : [o.color];
    for (let k = 0; k < o.n; k++) {
      const i = this.next; this.next = (this.next + 1) % this.max;
      const a = Math.random() * Math.PI * 2, e = (Math.random() * 2 - 1) * (o.spread ?? 1);
      const sp = o.speed * (0.5 + Math.random() * 0.5);
      this.pos.set([at.x, at.y, at.z], i * 3);
      this.vel.set([Math.cos(a) * Math.cos(e * 1.2) * sp, (o.up ?? 0) + Math.sin(e * 1.2) * sp, Math.sin(a) * Math.cos(e * 1.2) * sp], i * 3);
      this.c.setHex(cols[k % cols.length]);
      this.base.set([this.c.r, this.c.g, this.c.b], i * 3);
      this.age[i] = 0; this.life[i] = (o.life ?? 1.2) * (0.7 + Math.random() * 0.6); this.grav[i] = o.gravity ?? 9; this.drag[i] = o.drag ?? 0.6;
    }
    this.live = this.max;
  }

  update(dt: number) {
    if (!this.live) return;
    let any = 0;
    for (let i = 0; i < this.max; i++) {
      const a = (this.age[i] += dt), l = this.life[i];
      if (a >= l) { this.col[i * 4 + 3] = 0; continue; }
      any++;
      const d = Math.exp(-this.drag[i] * dt);
      this.vel[i * 3] *= d; this.vel[i * 3 + 2] *= d; this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * d - this.grav[i] * dt;
      this.pos[i * 3] += this.vel[i * 3] * dt; this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt; this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      const k = a / l, tw = 0.75 + 0.25 * Math.sin(a * 30 + i);
      this.col.set([this.base[i * 3], this.base[i * 3 + 1], this.base[i * 3 + 2], (1 - k * k) * Math.min(1, a * 12) * tw], i * 4);
    }
    if (!any) this.live = 0;
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;
  }
}

const GOLD = [0xffd84a, 0xffe98a, 0xfff6c8, 0xffb627];
const FIREWORK = [[0xff5a7a, 0xffb3c6], [0x7de8ff, 0xffffff], [0xffd84a, 0xfff2a8], [0x9cf59c, 0xe0ffe0], [0xc89bff, 0xffffff], [0xff9f43, 0xffe0b0]];

/** All the celebration and splash effects the renderer fires from sim cues. */
export class Fx {
  readonly group = new THREE.Group();
  private glow = new Particles(900, 0.9, true);
  private water = new Particles(500, 0.7, false);
  private sparks = new Particles(1200, 2.2, true);
  private shells: Array<{ p: THREE.Vector3; v: THREE.Vector3; t: number; c: number[] }> = [];
  private tmp = new THREE.Vector3();

  constructor() { this.group.add(this.glow.points, this.water.points, this.sparks.points); }

  coins(at: THREE.Vector3) { this.glow.burst(at, { n: 46, color: GOLD, speed: 3.5, up: 6, gravity: 7, life: 1.6 }); }
  sparkle(at: THREE.Vector3, color: number[] = [0x9cf59c, 0xffffff, 0xffe98a]) { this.glow.burst(at, { n: 60, color, speed: 4, up: 3, gravity: 2, life: 1.4, drag: 1.5 }); }
  dust(at: THREE.Vector3) { this.water.burst(at, { n: 30, color: [0xd8c8a8, 0xbfae8e], speed: 3, up: 1, gravity: 1, life: 1.1, spread: 0.3, drag: 2.5 }); }
  splash(at: THREE.Vector3, big = 1) { this.water.burst(at, { n: Math.round(14 * big), color: [0xffffff, 0xdff3ff], speed: 1.8 * big, up: 3.2 * big, gravity: 9, life: 0.9, spread: 0.4 }); }
  spout(at: THREE.Vector3) { this.water.burst(at, { n: 60, color: [0xffffff, 0xe8f6ff], speed: 0.9, up: 9, gravity: 6, life: 1.8, spread: 0.15, drag: 1.2 }); }

  /** A rocket climbs from the harbour and bursts into a coloured shell. */
  firework(from: THREE.Vector3, delay = 0) {
    this.shells.push({ p: from.clone(), v: new THREE.Vector3((Math.random() - 0.5) * 3, 13 + Math.random() * 4, (Math.random() - 0.5) * 3), t: -delay, c: FIREWORK[Math.floor(Math.random() * FIREWORK.length)] });
  }
  fireworks(at: THREE.Vector3, n = 6) { for (let i = 0; i < n; i++) this.firework(this.tmp.set(at.x + (Math.random() - 0.5) * 16, at.y, at.z + (Math.random() - 0.5) * 6), i * 0.55); }

  update(dt: number) {
    for (let i = this.shells.length - 1; i >= 0; i--) {
      const s = this.shells[i];
      s.t += dt; if (s.t < 0) continue;
      s.v.y -= 9 * dt; s.p.addScaledVector(s.v, dt);
      if (Math.random() < 0.7) this.glow.burst(s.p, { n: 1, color: 0xfff2c0, speed: 0.3, gravity: 1, life: 0.4 });
      if (s.v.y < 2) { this.sparks.burst(s.p, { n: 110, color: s.c, speed: 12, up: 0, gravity: 2.5, life: 2, drag: 1.3 }); this.shells.splice(i, 1); }
    }
    this.glow.update(dt); this.water.update(dt); this.sparks.update(dt);
  }
}
