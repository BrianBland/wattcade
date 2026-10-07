import * as THREE from 'three';
import { BLOCK } from '../sim/sim';
import { shader } from './look';
import { LW, newFrame, type Path } from './path';

export const BLOCK_COLORS = ['#a35cff', '#3d8bff', '#2dffa0', '#ffd23d', '#ff3d5a'].map((c) => new THREE.Color(c));
/** Hazards are the only monochrome thing on the track: black glass mines with white-hot spikes. */
const MINE_HOT = new THREE.Color('#ffffff'), MINE_DARK = new THREE.Color('#34343f');

const CUBE_VS = /* glsl */ `
attribute float aPhase;
varying vec2 vUv; varying vec3 vCol; varying float vDepth;
mat3 rotY(float a) { float c = cos(a), s = sin(a); return mat3(c, 0., -s, 0., 1., 0., s, 0., c); }
void main() {
  vUv = uv; vCol = instanceColor;
  vec3 p = rotY(uTime * 1.7 + aPhase) * position;                     // spin
  p *= 1.0 + 0.16 * uBeat;                                              // and pump on the beat
  p.y += 0.12 * sin(uTime * 3.0 + aPhase);
  vec4 mv = modelViewMatrix * instanceMatrix * vec4(p, 1.0); vDepth = -mv.z; gl_Position = projectionMatrix * mv;
}`;
const CUBE_FS = /* glsl */ `
varying vec2 vUv; varying vec3 vCol; varying float vDepth;
void main() {
  float e = min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y));
  float rim = 1.0 - smoothstep(0.03, 0.16, e);
  float core = 1.0 - smoothstep(0.0, 0.5, length(vUv - 0.5));
  vec3 c = vCol * (0.35 + 0.9 * core + 2.2 * rim) * (1.0 + 0.5 * uBeat);
  gl_FragColor = vec4(mix(c, uFog, smoothstep(uNear, uFar, vDepth) * 0.9), 1.0);
}`;

/** Mines: a jagged stellated ball. aTip = 0 at the core, 1 at a spike's point; aEdge = 1 on a spike's edges. */
const MINE_VS = /* glsl */ `
attribute float aPhase; attribute float aTip; attribute vec3 aBary;
varying float vTip; varying vec3 vBary; varying float vDepth; varying vec3 vN; varying float vPhase;
mat3 rotY(float a) { float c = cos(a), s = sin(a); return mat3(c, 0., -s, 0., 1., 0., s, 0., c); }
mat3 rotX(float a) { float c = cos(a), s = sin(a); return mat3(1., 0., 0., 0., c, s, 0., -s, c); }
void main() {
  vTip = aTip; vBary = aBary; vPhase = aPhase;
  mat3 r = rotY(uTime * 0.9 + aPhase) * rotX(uTime * 0.6 + aPhase * 2.0);  // tumbles, slower and heavier than the cubes
  float bristle = 1.0 + aTip * (0.18 * uBeat + 0.08 * sin(uTime * 9.0 + aPhase * 5.0)); // spikes bristle on the beat
  vec3 p = r * (position * bristle);
  vN = normalize(normalMatrix * (r * normal));
  vec4 mv = modelViewMatrix * instanceMatrix * vec4(p, 1.0); vDepth = -mv.z; gl_Position = projectionMatrix * mv;
}`;
const MINE_FS = /* glsl */ `
uniform vec3 uHot; uniform vec3 uDark;
varying float vTip; varying vec3 vBary; varying float vDepth; varying vec3 vN; varying float vPhase;
void main() {
  float edge = 1.0 - smoothstep(0.0, 0.06, min(vBary.x, min(vBary.y, vBary.z)));
  float strobe = step(0.5, fract(uTime * 6.0 + vPhase));                    // a hard 6 Hz warning blink
  float sheen = pow(max(0.0, 1.0 - abs(vN.z)), 3.0);
  vec3 c = uDark * (0.25 + 0.75 * sheen);
  c += uHot * edge * (vTip > 0.01 ? 0.5 + 0.9 * vTip : 0.22);                // white wire edges: faint on the core, hot up the spikes
  c += uHot * pow(vTip, 6.0) * (1.4 + 2.2 * strobe);                         // white-hot tips
  gl_FragColor = vec4(mix(c, uFog, smoothstep(uNear, uFar, vDepth) * 0.85), 1.0);
}`;

export const mineMaterial = () => shader(MINE_VS, MINE_FS, { uHot: { value: MINE_HOT }, uDark: { value: MINE_DARK } });

/** A sea-mine / virus: a faceted core ball studded with 32 stubby three-sided spikes of uneven length. */
export function mineGeometry(): THREE.BufferGeometry {
  const pos: number[] = [], tip: number[] = [], bary: number[] = [];
  const push = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, ta: number, tb: number, tc: number) => {
    pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z); tip.push(ta, tb, tc); bary.push(1, 0, 0, 0, 1, 0, 0, 0, 1);
  };
  const core = new THREE.IcosahedronGeometry(0.58, 1).toNonIndexed(), cp = core.getAttribute('position');
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (let i = 0; i < cp.count; i += 3) { a.fromBufferAttribute(cp, i); b.fromBufferAttribute(cp, i + 1); c.fromBufferAttribute(cp, i + 2); push(a, b, c, 0, 0, 0); }
  // spike directions: the 12 icosahedron vertices and the 20 face centres
  const ico = new THREE.IcosahedronGeometry(1, 0), ip = ico.getAttribute('position'), dirs: THREE.Vector3[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < ip.count; i++) { const v = new THREE.Vector3().fromBufferAttribute(ip, i).normalize(), k = v.toArray().map((x) => x.toFixed(3)).join(); if (!seen.has(k)) { seen.add(k); dirs.push(v); } }
  const flat = ico.toNonIndexed().getAttribute('position');
  for (let i = 0; i < flat.count; i += 3) dirs.push(a.fromBufferAttribute(flat, i).add(b.fromBufferAttribute(flat, i + 1)).add(c.fromBufferAttribute(flat, i + 2)).normalize().clone());
  const t1 = new THREE.Vector3(), t2 = new THREE.Vector3(), apex = new THREE.Vector3(), base = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  dirs.forEach((d, k) => {
    const len = 1.0 + 0.28 * (((k * 7) % 5) / 4), w = 0.17;           // uneven: 1.0..1.28 m out
    t1.set(Math.abs(d.y) < 0.9 ? 0 : 1, Math.abs(d.y) < 0.9 ? 1 : 0, 0).cross(d).normalize(); t2.copy(d).cross(t1);
    for (let j = 0; j < 3; j++) { const th = (j / 3) * Math.PI * 2 + k; base[j].copy(d).multiplyScalar(0.5).addScaledVector(t1, Math.cos(th) * w).addScaledVector(t2, Math.sin(th) * w); }
    apex.copy(d).multiplyScalar(len);
    for (let j = 0; j < 3; j++) push(base[j], base[(j + 1) % 3], apex, 0.15, 0.15, 1);
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aTip', new THREE.Float32BufferAttribute(tip, 1));
  g.setAttribute('aBary', new THREE.Float32BufferAttribute(bary, 3));
  g.computeVertexNormals();
  return g;
}

interface Fly { i: number; t0: number; from: THREE.Vector3 }
/**
 * A shard. World shards (mine hits) fly free. Track shards (missed blocks) live in the craft's frame: `o` metres
 * along the track from the craft, `lx`/`ly` across/up — so a miss hits an invisible, viscous wall level with the
 * ship and drifts back past it slowly while it comes apart, however the track twists.
 */
interface Shard {
  pos: THREE.Vector3; vel: THREE.Vector3; rot: THREE.Euler; spin: THREE.Vector3; life: number; max: number; size: number;
  track: boolean; o: number; lx: number; ly: number; vo: number; vx: number; vy: number;
}
/** Track shards: start drifting back at this speed (m/s), then accelerate back this hard (m/s²) as the wall gives. */
const SLOW = { v0: 3, accel: 24, life: 0.5, spread: 2, drag: 1.6 };

/** Blocks on the track, collected blocks flying into the ship, misses shattering into shards. */
export class Blocks {
  readonly group = new THREE.Group();
  private cubes: THREE.InstancedMesh; private mines: THREE.InstancedMesh;
  /** Block index → instance index in its mesh (cubes or mines). */
  private slot: Int32Array;
  private shards: THREE.InstancedMesh; private pool: Shard[] = []; private free: number[] = [];
  private prev: Uint8Array; private flies: Fly[] = []; private primed = false;
  private m = new THREE.Matrix4(); private q = new THREE.Quaternion(); private v = new THREE.Vector3(); private s = new THREE.Vector3(); private fr = newFrame();
  private home: Float32Array;
  constructor(private path: Path) {
    const t = path.track, nMine = t.blocks.filter((b) => b.color < 0).length, nCube = t.blocks.length - nMine;
    const cubeGeo = new THREE.BoxGeometry(0.95, 0.95, 0.95), mineGeo = mineGeometry();
    this.cubes = new THREE.InstancedMesh(cubeGeo, shader(CUBE_VS, CUBE_FS), Math.max(1, nCube));
    this.mines = new THREE.InstancedMesh(mineGeo, mineMaterial(), Math.max(1, nMine));
    const cubePhase = new Float32Array(Math.max(1, nCube)), minePhase = new Float32Array(Math.max(1, nMine));
    this.slot = new Int32Array(t.blocks.length);
    this.home = new Float32Array(t.blocks.length * 3);
    let ci = 0, mi = 0;
    t.blocks.forEach((b, k) => {
      const mine = b.color < 0, i = mine ? mi++ : ci++;
      this.slot[k] = i; (mine ? minePhase : cubePhase)[i] = (k * 2.399) % 6.283;
      path.point(path.distAt(b.t), b.lane, mine ? 1.0 : 0.75, this.fr, this.v);
      this.home.set([this.v.x, this.v.y, this.v.z], k * 3);
      this.place(k, this.v, 1);
      if (!mine) this.cubes.setColorAt(i, BLOCK_COLORS[b.color]);
    });
    if (!nCube) this.cubes.setColorAt(0, BLOCK_COLORS[0]);
    if (!nCube) this.cubes.setMatrixAt(0, this.m.makeScale(0, 0, 0));
    if (!nMine) this.mines.setMatrixAt(0, this.m.makeScale(0, 0, 0));
    cubeGeo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(cubePhase, 1));
    mineGeo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(minePhase, 1));
    this.cubes.frustumCulled = false; this.mines.frustumCulled = false;
    this.prev = new Uint8Array(t.blocks.length);
    const SH = 900;
    this.shards = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ toneMapped: false }), SH);
    for (let i = 0; i < SH; i++) {
      this.pool.push({ pos: new THREE.Vector3(), vel: new THREE.Vector3(), rot: new THREE.Euler(), spin: new THREE.Vector3(), life: 0, max: 1, size: 0.2, track: false, o: 0, lx: 0, ly: 0, vo: 0, vx: 0, vy: 0 });
      this.free.push(i); this.shards.setMatrixAt(i, this.m.makeScale(0, 0, 0)); this.shards.setColorAt(i, BLOCK_COLORS[0]);
    }
    this.shards.frustumCulled = false;
    this.group.add(this.cubes, this.mines, this.shards);
  }

  private place(k: number, at: THREE.Vector3, scale: number) {
    const mesh = this.path.track.blocks[k].color < 0 ? this.mines : this.cubes;
    mesh.setMatrixAt(this.slot[k], this.m.compose(at, this.q.identity(), this.s.set(scale, scale, scale)));
  }
  private homeOf(k: number) { return this.v.set(this.home[k * 3], this.home[k * 3 + 1], this.home[k * 3 + 2]); }

  /** Burst of free-flying shards from `at` with colour `c`; `push` biases their direction (e.g. along the track). */
  shatter(at: THREE.Vector3, c: THREE.Color, count: number, speed: number, push: THREE.Vector3) {
    for (let i = 0; i < count && this.free.length; i++) {
      const id = this.free.pop()!, sh = this.pool[id];
      sh.track = false;
      sh.pos.copy(at).add(this.s.set((Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.6));
      sh.vel.set(Math.random() - 0.5, Math.random() * 0.8 + 0.2, Math.random() - 0.5).normalize().multiplyScalar(speed * (0.4 + Math.random())).add(push);
      sh.spin.set(Math.random() * 10, Math.random() * 10, Math.random() * 10); sh.rot.set(0, 0, 0);
      sh.max = sh.life = 0.6 + Math.random() * 0.6; sh.size = 0.12 + Math.random() * 0.22;
      this.shards.setColorAt(id, i % 3 === 0 ? MINE_HOT : c);
    }
    if (this.shards.instanceColor) this.shards.instanceColor.needsUpdate = true;
  }

  /** A firework: a sphere of bright shards flung out from `at` (world), slow to fall, half white-hot. */
  firework(at: THREE.Vector3, c: THREE.Color) {
    for (let i = 0; i < 46 && this.free.length; i++) {
      const id = this.free.pop()!, sh = this.pool[id];
      sh.track = false; sh.pos.copy(at);
      sh.vel.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(13 + Math.random() * 5);
      sh.spin.set(Math.random() * 8, Math.random() * 8, Math.random() * 8); sh.rot.set(0, 0, 0);
      sh.max = sh.life = 1.1 + Math.random() * 0.7; sh.size = 0.35 + Math.random() * 0.3;
      this.shards.setColorAt(id, i % 2 ? MINE_HOT : c);
    }
    if (this.shards.instanceColor) this.shards.instanceColor.needsUpdate = true;
  }

  /** A missed block cracks into a 3×3×3 of pieces against the viscous wall at the craft, then drifts back past it. */
  private crumble(k: number, c: THREE.Color) {
    const b = this.path.track.blocks[k], lx0 = b.lane * LW, ly0 = 0.75;
    for (let gx = -1; gx <= 1; gx++) for (let gy = -1; gy <= 1; gy++) for (let gz = -1; gz <= 1; gz++) {
      if (!this.free.length) break;
      const id = this.free.pop()!, sh = this.pool[id];
      sh.track = true;
      sh.o = gz * 0.32; sh.lx = lx0 + gx * 0.32; sh.ly = ly0 + gy * 0.32;
      const out = SLOW.spread * (0.5 + Math.random());
      sh.vx = gx * out + (Math.random() - 0.5) * 0.4; sh.vy = gy * out + Math.random() * 0.5; sh.vo = -SLOW.v0 + gz * out * 0.5;
      sh.spin.set((Math.random() - 0.5) * 4, (Math.random() - 0.5) * 4, (Math.random() - 0.5) * 4); sh.rot.set(0, 0, 0);
      sh.max = sh.life = SLOW.life * (0.75 + 0.5 * Math.random()); sh.size = 0.3;
      this.shards.setColorAt(id, c);
    }
    if (this.shards.instanceColor) this.shards.instanceColor.needsUpdate = true;
  }

  /**
   * Apply block state changes and animate. Calls back for the ship's reactions.
   * `craft` = ship world position; `dCraft` = its distance along the track; `fwd` = track forward.
   */
  update(state: Uint8Array, craft: THREE.Vector3, dCraft: number, fwd: THREE.Vector3, speed: number, dt: number, now: number,
    on: { absorb(c: THREE.Color): void; greyHit(): void }) {
    const t = this.path.track;
    if (!this.primed) { // first frame (mount mid-ride): show the current state without replaying history
      this.primed = true;
      for (let k = 0; k < state.length; k++) { this.prev[k] = state[k]; if (state[k] !== BLOCK.AHEAD && state[k] !== BLOCK.GREY_DODGED) this.place(k, this.v, 0); }
    }
    for (let k = 0; k < state.length; k++) {
      const st = state[k];
      if (st === this.prev[k]) continue;
      this.prev[k] = st;
      const b = t.blocks[k], c = b.color >= 0 ? BLOCK_COLORS[b.color] : MINE_DARK;
      if (st === BLOCK.HIT) this.flies.push({ i: k, t0: now, from: this.homeOf(k).clone() });
      else if (st === BLOCK.MISS) { this.crumble(k, c); this.place(k, this.v, 0); }
      else if (st === BLOCK.GREY_HIT) { this.shatter(this.homeOf(k).clone(), MINE_DARK, 40, 11, this.s.copy(fwd).multiplyScalar(speed * 0.7)); this.place(k, this.v, 0); on.greyHit(); }
      else if (st === BLOCK.GREY_DODGED) { /* it stays on the track behind you */ }
      else if (st === BLOCK.AHEAD) this.place(k, this.homeOf(k), 1); // a restart
    }
    // collected blocks zip into the ship
    this.flies = this.flies.filter((f) => {
      const a = (now - f.t0) / 0.14;
      if (a >= 1) { this.place(f.i, this.v, 0); const b = t.blocks[f.i]; on.absorb(BLOCK_COLORS[Math.max(0, b.color)]); return false; }
      this.v.copy(f.from).lerp(craft, a * a);
      this.place(f.i, this.v, 1 - 0.7 * a);
      return true;
    });
    this.cubes.instanceMatrix.needsUpdate = true; this.mines.instanceMatrix.needsUpdate = true;
    // shards: free ones tumble, fall and shrink; track ones ooze back past the ship, separating as they go
    let any = false;
    for (let i = 0; i < this.pool.length; i++) {
      const sh = this.pool[i]; if (sh.life <= 0) continue;
      any = true;
      sh.life -= dt;
      if (sh.life <= 0) { this.shards.setMatrixAt(i, this.m.makeScale(0, 0, 0)); this.free.push(i); continue; }
      const age = 1 - sh.life / sh.max;
      if (sh.track) {
        const drag = Math.exp(-SLOW.drag * dt);
        sh.vx *= drag; sh.vy = sh.vy * drag - 0.6 * dt; sh.vo -= SLOW.accel * age * dt;
        sh.o += sh.vo * dt; sh.lx += sh.vx * dt; sh.ly = Math.max(0.1, sh.ly + sh.vy * dt);
        this.path.at(dCraft + sh.o, this.fr);
        sh.pos.copy(this.fr.p).addScaledVector(this.fr.r, sh.lx).addScaledVector(this.fr.u, sh.ly);
      } else {
        sh.vel.y -= 9 * dt; sh.vel.multiplyScalar(1 - 0.8 * dt);
        sh.pos.addScaledVector(sh.vel, dt);
      }
      sh.rot.x += sh.spin.x * dt; sh.rot.y += sh.spin.y * dt; sh.rot.z += sh.spin.z * dt;
      // track pieces start as a whole cube (touching) and shrink apart; free ones just shrink
      const sz = sh.track ? sh.size * (age < 0.08 ? 1 : 1 - 0.75 * ((age - 0.08) / 0.92) ** 1.5) : sh.size * (1 - age);
      this.shards.setMatrixAt(i, this.m.compose(sh.pos, this.q.setFromEuler(sh.rot), this.s.set(sz, sz, sz)));
    }
    if (any) this.shards.instanceMatrix.needsUpdate = true;
  }
}
