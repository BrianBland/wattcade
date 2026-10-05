import * as THREE from 'three';
import { BLOCK } from '../sim/sim';
import { shader } from './look';
import { newFrame, type Path } from './path';

export const BLOCK_COLORS = ['#a35cff', '#3d8bff', '#2dffa0', '#ffd23d', '#ff3d5a'].map((c) => new THREE.Color(c));
const GREY_RIM = new THREE.Color('#ff2030');

const BLOCK_VS = /* glsl */ `
attribute float aKind; attribute float aPhase;
varying vec2 vUv; varying float vKind; varying vec3 vCol; varying float vDepth;
mat3 rotY(float a) { float c = cos(a), s = sin(a); return mat3(c, 0., -s, 0., 1., 0., s, 0., c); }
mat3 rotX(float a) { float c = cos(a), s = sin(a); return mat3(1., 0., 0., 0., c, s, 0., -s, c); }
void main() {
  vUv = uv; vKind = aKind; vCol = instanceColor;
  vec3 p = position;
  if (aKind > 0.5) p = rotX(0.785) * rotY(0.785) * p * 1.35;            // greys: a spiky diamond
  p = rotY(uTime * 1.7 + aPhase) * p;                                   // everything spins
  p *= 1.0 + 0.16 * uBeat;                                             // and pumps on the beat
  p.y += 0.12 * sin(uTime * 3.0 + aPhase);
  vec4 mv = modelViewMatrix * instanceMatrix * vec4(p, 1.0); vDepth = -mv.z; gl_Position = projectionMatrix * mv;
}`;
const BLOCK_FS = /* glsl */ `
varying vec2 vUv; varying float vKind; varying vec3 vCol; varying float vDepth;
void main() {
  float e = min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y));
  float rim = 1.0 - smoothstep(0.03, 0.16, e);
  float core = 1.0 - smoothstep(0.0, 0.5, length(vUv - 0.5));
  vec3 c;
  if (vKind > 0.5) {
    float pulse = 0.6 + 0.4 * sin(uTime * 12.0);
    float stripe = step(0.5, fract((vUv.x + vUv.y) * 3.0));
    c = vec3(0.16, 0.0, 0.02) * (0.5 + 0.5 * pulse) + vec3(0.5, 0.06, 0.0) * stripe * (0.4 + 0.3 * pulse) + vCol * rim * (2.4 + 2.0 * pulse);
  } else {
    c = vCol * (0.35 + 0.9 * core + 2.2 * rim) * (1.0 + 0.5 * uBeat);
  }
  gl_FragColor = vec4(mix(c, uFog, smoothstep(uNear, uFar, vDepth) * 0.9), 1.0);
}`;

interface Fly { i: number; t0: number; from: THREE.Vector3 }
interface Shard { pos: THREE.Vector3; vel: THREE.Vector3; rot: THREE.Euler; spin: THREE.Vector3; life: number; max: number; size: number }

/** Blocks on the track, collected blocks flying into the ship, misses shattering into shards. */
export class Blocks {
  readonly group = new THREE.Group();
  private mesh: THREE.InstancedMesh;
  private shards: THREE.InstancedMesh; private pool: Shard[] = []; private free: number[] = [];
  private prev: Uint8Array; private flies: Fly[] = [];
  private m = new THREE.Matrix4(); private q = new THREE.Quaternion(); private v = new THREE.Vector3(); private s = new THREE.Vector3(); private fr = newFrame();
  private home: Float32Array;
  constructor(private path: Path) {
    const t = path.track, n = Math.max(1, t.blocks.length);
    const geo = new THREE.BoxGeometry(0.95, 0.95, 0.95);
    const kind = new Float32Array(n), phase = new Float32Array(n);
    this.mesh = new THREE.InstancedMesh(geo, shader(BLOCK_VS, BLOCK_FS), n);
    this.home = new Float32Array(n * 3);
    t.blocks.forEach((b, k) => {
      kind[k] = b.color < 0 ? 1 : 0; phase[k] = (k * 2.399) % 6.283;
      path.point(path.distAt(b.t), b.lane, 0.75, this.fr, this.v);
      this.home.set([this.v.x, this.v.y, this.v.z], k * 3);
      this.place(k, this.v, 1);
      this.mesh.setColorAt(k, b.color < 0 ? GREY_RIM : BLOCK_COLORS[b.color]);
    });
    geo.setAttribute('aKind', new THREE.InstancedBufferAttribute(kind, 1));
    geo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phase, 1));
    this.mesh.frustumCulled = false;
    this.prev = new Uint8Array(t.blocks.length);
    const SH = 700;
    this.shards = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ toneMapped: false }), SH);
    for (let i = 0; i < SH; i++) {
      this.pool.push({ pos: new THREE.Vector3(), vel: new THREE.Vector3(), rot: new THREE.Euler(), spin: new THREE.Vector3(), life: 0, max: 1, size: 0.2 });
      this.free.push(i); this.shards.setMatrixAt(i, this.m.makeScale(0, 0, 0)); this.shards.setColorAt(i, BLOCK_COLORS[0]);
    }
    this.shards.frustumCulled = false;
    this.group.add(this.mesh, this.shards);
  }

  private place(k: number, at: THREE.Vector3, scale: number) {
    this.mesh.setMatrixAt(k, this.m.compose(at, this.q.identity(), this.s.set(scale, scale, scale)));
  }
  private homeOf(k: number) { return this.v.set(this.home[k * 3], this.home[k * 3 + 1], this.home[k * 3 + 2]); }

  /** Burst of shards from `at` with colour `c`; `push` biases their direction (e.g. along the track). */
  shatter(at: THREE.Vector3, c: THREE.Color, count: number, speed: number, push: THREE.Vector3) {
    for (let i = 0; i < count && this.free.length; i++) {
      const id = this.free.pop()!, sh = this.pool[id];
      sh.pos.copy(at).add(this.s.set((Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.6));
      sh.vel.set(Math.random() - 0.5, Math.random() * 0.8 + 0.2, Math.random() - 0.5).normalize().multiplyScalar(speed * (0.4 + Math.random())).add(push);
      sh.spin.set(Math.random() * 10, Math.random() * 10, Math.random() * 10); sh.rot.set(0, 0, 0);
      sh.max = sh.life = 0.6 + Math.random() * 0.6; sh.size = 0.12 + Math.random() * 0.22;
      this.shards.setColorAt(id, c);
    }
    if (this.shards.instanceColor) this.shards.instanceColor.needsUpdate = true;
  }

  /**
   * Apply block state changes and animate. Calls back for the ship's reactions.
   * `craft` = ship world position; `fwd` = track forward (shards fly with the track's flow).
   */
  update(state: Uint8Array, craft: THREE.Vector3, fwd: THREE.Vector3, speed: number, dt: number, now: number,
    on: { absorb(c: THREE.Color): void; greyHit(): void }) {
    const t = this.path.track;
    for (let k = 0; k < state.length; k++) {
      const st = state[k];
      if (st === this.prev[k]) continue;
      this.prev[k] = st;
      const b = t.blocks[k], c = b.color >= 0 ? BLOCK_COLORS[b.color] : GREY_RIM;
      if (st === BLOCK.HIT) this.flies.push({ i: k, t0: now, from: this.homeOf(k).clone() });
      else if (st === BLOCK.MISS) { this.shatter(this.homeOf(k).clone(), c, 14, 5, this.s.copy(fwd).multiplyScalar(speed * 0.35)); this.place(k, this.v, 0); }
      else if (st === BLOCK.GREY_HIT) { this.shatter(this.homeOf(k).clone(), GREY_RIM, 34, 11, this.s.copy(fwd).multiplyScalar(speed * 0.7)); this.place(k, this.v, 0); on.greyHit(); }
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
    this.mesh.instanceMatrix.needsUpdate = true;
    // shards: tumble, fall, shrink
    let any = false;
    for (let i = 0; i < this.pool.length; i++) {
      const sh = this.pool[i]; if (sh.life <= 0) continue;
      any = true;
      sh.life -= dt;
      if (sh.life <= 0) { this.shards.setMatrixAt(i, this.m.makeScale(0, 0, 0)); this.free.push(i); continue; }
      sh.vel.y -= 9 * dt; sh.vel.multiplyScalar(1 - 0.8 * dt);
      sh.pos.addScaledVector(sh.vel, dt);
      sh.rot.x += sh.spin.x * dt; sh.rot.y += sh.spin.y * dt; sh.rot.z += sh.spin.z * dt;
      const sz = sh.size * (sh.life / sh.max);
      this.shards.setMatrixAt(i, this.m.compose(sh.pos, this.q.setFromEuler(sh.rot), this.s.set(sz, sz, sz)));
    }
    if (any) this.shards.instanceMatrix.needsUpdate = true;
  }
}
