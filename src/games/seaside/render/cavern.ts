// Chapter 3a in the voxel world (#192): poses the WorldView (on the cavern world) from the director's shot
// (render/cavernShots.ts) and drives the set: flames in the torch cages with a few lights that travel with you, the
// lava's glow coming up the mouth and out over the hall, magma eels leaping (some vaulting the bridge) with molten
// drips and splashes, embers rising, the line smoking over the lava, and the cooling fan: the bike's big fan spinning
// with your cadence, the eel on its stick cooling from molten orange through red to a plain grey-green, then eaten.
// The gate, Drill II and the fall (#193) are the gate set's (render/gate.ts), built as you near the gate.
import * as THREE from 'three';
import { disposeSet } from './dispose';
import type { SeasideSnapshot } from '../sim/types';
import { addGrid } from '../stills/stage';
import { VoxelGrid } from '../voxel/grid';
import { definePalette } from '../voxel/palette';
import { hash2 } from '../voxel/noise';
import { cx, GATE_U, LAVA_Y, LEAP_EVERY, leapAt, LEAPS, TORCH_EVERY, TORCHES, U_MOUTH } from '../world/cavernLayout';
import { GATE_SCENES, GateSet } from './gate';
import { CAVERN_SKY } from '../world/cavern';
import { FishingRig } from './fishingRig';
import { castTarget } from './fishingPose';
import { cavernShot, type CavernShot } from './cavernShots';
import type { V3 } from './morningShots';
import type { WorldView } from './worldView';

const PAL = definePalette({
  crust: 0x2a1410, ember: 0xff4a10, lava: 0xff7a1a, lava2: 0xffb02a, hot: 0xffe08a,
  steel: 0x8e959c, steel2: 0x5f656c, dark: 0x2a2d32, red: 0xc9452e, stick: 0x6e5236,
  eel: 0x6f7a62, eel2: 0x58624e, eelBelly: 0x9aa088, eelEye: 0x1a1a1a, seam: 0xffb02a,
});
const P = PAL.idx;
const NONE = { cast: false, receive: false };
const N_LIGHTS = 5, N_EELS = 10;
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const ease = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const lerpV = (a: V3, b: V3, k: number): V3 => ({ x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k), z: lerp(a.z, b.z, k) });
interface Pose { eye: V3; target: V3 }

/** A magma eel (head at +x, ~4.6 m before scaling): dark cooled bands over a molten body, a white-hot belly seam. */
function buildMagmaEel(): VoxelGrid {
  const g = new VoxelGrid(0.1);
  for (let i = 0; i <= 70; i++) {
    const u = i / 70, x = (u - 0.6) * 4.6, r = 0.4 * Math.sin(Math.PI * Math.min(1, 0.15 + u * 0.95)) + 0.07, y = Math.sin(u * 7) * 0.12;
    const band = Math.floor(u * 9) % 3 === 0;
    g.wellipsoid([x, y, 0], [0.14, r, r * 0.9], u > 0.9 ? P.hot : band ? P.crust : u % 0.22 < 0.11 ? P.lava : P.lava2);
    g.wellipsoid([x, y - r * 0.45, 0], [0.09, r * 0.45, r * 0.6], P.hot);
    if (i % 6 === 0) g.wellipsoid([x, y + r * 0.85, 0], [0.06, 0.1, 0.05], P.lava2);
  }
  for (const sz of [-1, 1]) g.wellipsoid([1.95, 0.08, sz * 0.18], [0.07, 0.07, 0.04], P.hot);
  for (let k = 0; k <= 5; k++) g.wellipsoid([-2.75 - k * 0.06, (k - 2.5) * 0.14, 0], [0.08, 0.08, 0.06], P.lava2);
  return g;
}

/** The cooked eel on its stick (camera space, ~1 m, head at +x): plain grey-green, the seams that glow while hot. */
function buildStickEel(): { body: VoxelGrid; seams: VoxelGrid } {
  const body = new VoxelGrid(0.012), seams = new VoxelGrid(0.012);
  for (let i = 0; i <= 90; i++) {
    const u = i / 90, x = (u - 0.5) * 1.0, r = 0.06 * Math.sin(Math.PI * Math.min(1, 0.12 + u * 0.95)) + 0.012, y = Math.sin(u * 9) * 0.02;
    body.wellipsoid([x, y, 0], [0.02, r, r * 0.85], (v) => (v % 3 ? P.eel : P.eel2));
    body.wellipsoid([x, y - r * 0.5, 0], [0.016, r * 0.45, r * 0.6], P.eelBelly);
    if (i % 8 === 4) seams.wellipsoid([x, y + r * 0.2, 0], [0.012, r * 1.05, r * 0.95], P.seam);
  }
  for (const sz of [-1, 1]) body.wellipsoid([0.46, 0.012, sz * 0.03], [0.01, 0.01, 0.008], P.eelEye);
  body.wsegment([-0.62, -0.01, 0], [0.62, 0.01, 0], 0.008, P.stick); // the stick, through it lengthwise
  return { body, seams };
}

/** The fan (camera space, facing you): steel cage ring, hub, and the blade set (spun as its own group). */
function buildFan(): { frame: VoxelGrid; blades: VoxelGrid } {
  const frame = new VoxelGrid(0.02), blades = new VoxelGrid(0.02), R = 0.72;
  for (let a = 0; a < Math.PI * 2; a += 0.02) frame.wellipsoid([Math.cos(a) * R, Math.sin(a) * R, 0], [0.025, 0.025, 0.04], P.steel2);
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; frame.wsegment([0, 0, -0.06], [Math.cos(a) * R, Math.sin(a) * R, -0.02], 0.01, P.steel2); }
  frame.wellipsoid([0, 0, 0.02], [0.1, 0.1, 0.09], P.dark);
  frame.wsegment([0, -0.1, -0.05], [0, -1.2, -0.05], 0.04, P.dark); // the stand, down to the bike's drive
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    for (let r = 0.1; r < R - 0.06; r += 0.015) {
      const w = 0.07 + 0.14 * Math.sin((r / R) * Math.PI), q = a + 0.25 * (r / R);
      blades.wellipsoid([Math.cos(q) * r, Math.sin(q) * r, 0.03 * Math.sin(q * 3)], [0.012 + Math.abs(Math.sin(q)) * w * 0.5, 0.012 + Math.abs(Math.cos(q)) * w * 0.5, 0.012], i % 2 ? P.steel : P.red);
    }
  }
  return { frame, blades };
}

export class CavernSet {
  readonly rig: FishingRig;
  private root = new THREE.Group();
  private lights: THREE.PointLight[] = [];
  private under = new THREE.PointLight(0xff6a1a, 0, 60, 1.2);
  private flames: THREE.InstancedMesh; private drips: THREE.InstancedMesh; private embers: THREE.InstancedMesh; private smoke: THREE.InstancedMesh;
  private eels: THREE.Group[] = [];
  private fanRoot = new THREE.Group(); private blades = new THREE.Group(); private stick = new THREE.Group();
  private eelBody: THREE.MeshLambertMaterial; private eelSeams: THREE.MeshBasicMaterial;
  private steam: THREE.InstancedMesh; private wind: THREE.InstancedMesh;
  private last: { id: string; pose: Pose } | null = null;
  private blend: { from: Pose; t0: number; dur: number } | null = null;
  private fanA = 0; private fanSpin = 0;
  private gate: GateSet | null = null;
  private m4 = new THREE.Matrix4(); private q = new THREE.Quaternion(); private v3 = new THREE.Vector3(); private sc = new THREE.Vector3(); private col = new THREE.Color();

  constructor(private view: WorldView) {
    const st = view.stage;
    this.rig = new FishingRig(st);
    for (let i = 0; i < N_LIGHTS; i++) { const l = new THREE.PointLight(0xff9a40, 0, 26, 1.4); this.lights.push(l); this.root.add(l); }
    this.root.add(this.under);
    const inst = (n: number, mat: THREE.Material, parent: THREE.Object3D = this.root) => { const m = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat, n); m.frustumCulled = false; m.count = 0; parent.add(m); return m; };
    this.flames = inst(8 * 14, new THREE.MeshBasicMaterial({ color: 0xffffff, fog: true }));
    this.drips = inst(400, new THREE.MeshBasicMaterial({ color: 0xffffff, fog: true }));
    this.embers = inst(180, new THREE.MeshBasicMaterial({ color: 0xffffff, fog: true }));
    this.smoke = inst(48, new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.45, depthWrite: false }));
    // the leaping eels: one model (unlit, bright), cloned
    const glowPal = PAL.linear.map((x, i) => (Math.floor(i / 3) === P.crust ? x : x * 2.3));
    const proto = new THREE.Group();
    addGrid(st, 'magma eel', buildMagmaEel(), { palette: glowPal, jitter: 0 }, proto, NONE, new THREE.MeshBasicMaterial({ vertexColors: true, fog: true }));
    proto.removeFromParent();
    for (let i = 0; i < N_EELS; i++) { const g = new THREE.Group(), inner = proto.clone(); inner.scale.setScalar(2.6); g.add(inner); g.visible = false; this.eels.push(g); this.root.add(g); }
    // the fan and the eel on its stick, in front of the bars
    const fan = buildFan();
    addGrid(st, 'fan frame', fan.frame, { palette: PAL.linear, jitter: 0.03 }, this.fanRoot, NONE);
    addGrid(st, 'fan blades', fan.blades, { palette: PAL.linear, jitter: 0.03 }, this.blades, NONE);
    this.blades.position.z = 0.05; this.fanRoot.add(this.blades);
    this.fanRoot.position.set(0.05, -0.12, -2.3);
    const eel = buildStickEel();
    this.eelBody = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.eelSeams = new THREE.MeshBasicMaterial({ vertexColors: true });
    addGrid(st, 'stick eel', eel.body, { palette: PAL.linear, jitter: 0.03 }, this.stick, NONE, this.eelBody);
    addGrid(st, 'stick eel seams', eel.seams, { palette: PAL.linear, jitter: 0 }, this.stick, NONE, this.eelSeams);
    this.steam = inst(24, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.22, depthWrite: false }), this.stick);
    this.wind = inst(24, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.18, depthWrite: false }), this.fanRoot);
    this.fanRoot.visible = false; this.stick.visible = false;
    st.camera.add(this.fanRoot, this.stick);
    st.scene.add(this.root);
  }

  /** Pose and render one frame of a Chapter 3a scene. `t` = story clock (s). */
  frame(snap: SeasideSnapshot, t: number, dt: number, cadence: number): CavernShot | null {
    const shot = cavernShot(snap);
    if (!shot) return null;
    let pose: Pose = { eye: shot.eye, target: shot.target };
    if (this.last && this.last.id !== snap.sceneId) this.blend = { from: this.last.pose, t0: t, dur: 2.2 };
    if (this.blend) {
      const k = ease((t - this.blend.t0) / this.blend.dur), f = this.blend.from;
      if (k >= 1) this.blend = null; else pose = { eye: lerpV(f.eye, pose.eye, k), target: lerpV(f.target, pose.target, k) };
    }
    this.last = { id: snap.sceneId, pose };
    this.props(snap, shot, pose, t, dt, cadence);
    // the gate's props once you're near it; the floor's shudder shakes the eye
    if (!this.gate && (GATE_SCENES.has(snap.sceneId) || -pose.eye.z > GATE_U - 600)) this.gate = new GateSet(this.view);
    const jolt = this.gate?.update(snap, shot, pose, t, dt, cadence);
    const eye = jolt ? { x: pose.eye.x + jolt.x, y: pose.eye.y + jolt.y, z: pose.eye.z + jolt.z } : pose.eye;
    const k = shot.fx.hall, sk = CAVERN_SKY, black = shot.fx.gate?.fall?.black ?? 0;
    // the cave is dark and close (torchlight); out in the hall the lava lights everything from below; the fall is black
    const fog = new THREE.Color(0x24160e).lerp(new THREE.Color(sk.fog), k).lerp(new THREE.Color(0), black).getHex();
    const atmos = { fog, density: lerp(lerp(0.026, sk.fogDensity, k), 0.5, black), sunI: lerp(0.05, sk.sunI, k) * (1 - black), hemiI: lerp(lerp(0.85, sk.hemiI, k), 0.25, black),
      ...(black > 0 && { zenith: new THREE.Color(sk.zenith).lerp(new THREE.Color(0), black).getHex(), horizon: new THREE.Color(sk.horizon).lerp(new THREE.Color(0), black).getHex(), sunColor: new THREE.Color(sk.sunColor).lerp(new THREE.Color(0), black).getHex() }) };
    this.view.terrain.root.visible = black < 0.98; // nothing out there in the void
    this.view.frame({ t, routeS: shot.s, speed: shot.speed, look: snap.look.name, dream: snap.look.dream, eye, aim: pose.target,
      bars: shot.bars, barsDrop: shot.fx.gate?.unfold ?? 0, cadence: cadence || 80, atmos, post: { shimmer: shot.fx.shimmer } });
    this.rig.update(shot.rod ? snap.fishing : null, t, shot.place ?? { waterY: LAVA_Y });
    return shot;
  }

  private props(snap: SeasideSnapshot, shot: CavernShot, pose: Pose, t: number, dt: number, cadence: number) {
    const fx = shot.fx, eye = pose.eye, uEye = -eye.z;
    // torches: the few ahead are lit; flames in the cages near you
    const k0 = Math.max(0, Math.floor((shot.s - 10) / TORCH_EVERY));
    this.lights.forEach((l, i) => {
      const tc = TORCHES[k0 + i];
      if (!tc) { l.intensity = 0; return; }
      l.position.set(tc.x - tc.side * 0.5, tc.y + 0.4, tc.z);
      l.intensity = (16 + 3 * Math.sin(t * 13 + i * 2) * Math.sin(t * 7.7 + i)) * (1 - fx.hall);
    });
    let n = 0;
    for (let j = Math.max(0, k0 - 1); j < Math.min(TORCHES.length, k0 + 7) && n < 8 * 14; j++) {
      const tc = TORCHES[j];
      for (let i = 0; i < 14; i++) {
        const life = 0.45 + hash2(i, j, 5) * 0.35, age = (t * (0.9 + hash2(i, j, 6) * 0.5) + hash2(i, j, 7) * life) % life, kk = age / life;
        const a = hash2(i, j, 8) * Math.PI * 2, r = 0.09 * (1 - kk) * hash2(i, j, 9);
        this.v3.set(tc.x + Math.cos(a) * r + Math.sin(t * 5 + i) * 0.015, tc.y + 0.08 + kk * 0.45, tc.z + Math.sin(a) * r);
        this.m4.compose(this.v3, this.q, this.sc.setScalar(0.09 * (1 - kk) + 0.02));
        this.flames.setMatrixAt(n, this.m4);
        this.flames.setColorAt(n++, this.col.setRGB(...(kk < 0.3 ? [3, 2.5, 1.3] : kk < 0.65 ? [2.6, 1.2, 0.3] : [1.6, 0.4, 0.08]) as [number, number, number]));
      }
    }
    this.flames.count = n; this.flames.instanceMatrix.needsUpdate = true; if (this.flames.instanceColor) this.flames.instanceColor.needsUpdate = true;
    // the lava's glow from below the bridge, travelling with you
    this.under.position.set(eye.x, LAVA_Y + 6, eye.z - 12); this.under.intensity = 140 * fx.hall;
    // leaping eels near you: the leap slots from just behind to ~240 m ahead
    n = 0;
    let e = 0;
    const j0 = Math.max(0, Math.floor((uEye - U_MOUTH - 30 - 30) / LEAP_EVERY));
    for (let j = j0; j < LEAPS.length && e < N_EELS && fx.eels; j++) {
      const l = LEAPS[j];
      if (l.u0 > uEye + 240) break;
      const ph = ((t + l.phase) % l.period) / l.period, k = ph / l.air;
      if (k > 1) continue;
      const g = this.eels[e++], p = leapAt(l, k), q = leapAt(l, Math.min(1, k + 0.02));
      g.visible = true; g.position.set(p.x, p.y, p.z); g.lookAt(q.x, q.y, q.z); g.rotateY(-Math.PI / 2);
      g.rotateX(Math.sin(t * 6 + j) * 0.35); g.rotateY(Math.sin(t * 9 + j) * 0.18); // writhing
      for (let d = 1; d < 22 && n < 400; d++) { // molten drips trailing it
        const kk = k - d * 0.014; if (kk < 0) break;
        const dp = leapAt(l, kk);
        this.v3.set(dp.x + (hash2(d, j, 150) - 0.5) * 0.9, dp.y - d * 0.08 - ((t * 3) % 1) * 0.1, dp.z + (hash2(d, j, 151) - 0.5) * 0.9);
        this.m4.compose(this.v3, this.q, this.sc.setScalar(0.24 * (1 - d / 22) + 0.06)); this.drips.setMatrixAt(n, this.m4);
        this.drips.setColorAt(n++, this.col.setRGB(...(d % 2 ? [2.6, 1.3, 0.25] : [2.4, 0.5, 0.06]) as [number, number, number]));
      }
      if (k > 0.92 || k < 0.07) for (let d = 0; d < 16 && n < 400; d++) { // the splash where it goes in or comes out
        const a = hash2(d, j, 152) * Math.PI * 2, rr = 0.4 + hash2(d, j, 153) * 1.8, w = k < 0.5 ? l.lx0 : l.lx1, uu = k < 0.5 ? l.u0 : l.u1;
        this.v3.set(cx(uu) + w + Math.cos(a) * rr, LAVA_Y + 0.3 + hash2(d, j, 154) * 2.6 * (k < 0.5 ? 1 - k / 0.07 : (k - 0.92) / 0.08), -uu + Math.sin(a) * rr * 1.6);
        this.m4.compose(this.v3, this.q, this.sc.setScalar(0.3)); this.drips.setMatrixAt(n, this.m4); this.drips.setColorAt(n++, this.col.setRGB(3, 2.5, 1.2));
      }
    }
    for (let i = e; i < N_EELS; i++) this.eels[i].visible = false;
    this.drips.count = n; this.drips.instanceMatrix.needsUpdate = true; if (this.drips.instanceColor) this.drips.instanceColor.needsUpdate = true;
    // embers drifting up out of the lava either side (never over the deck)
    n = 0;
    if (fx.hall > 0.2) for (let i = 0; i < 180; i++) {
      const side = hash2(i, 1, 155) < 0.5 ? -1 : 1, uu = uEye - 10 + hash2(i, 2, 155) * 160, lx = side * (5 + hash2(i, 6, 155) * 34), h = 34, rise = 1.5 + hash2(i, 3, 155) * 2;
      this.v3.set(cx(uu) + lx + Math.sin(t + i) * 0.8, LAVA_Y + 1 + ((t * rise + hash2(i, 4, 155) * h) % h), -uu);
      this.m4.compose(this.v3, this.q, this.sc.setScalar((0.16 + 0.08 * Math.sin(t * 6 + i)) * fx.hall)); this.embers.setMatrixAt(n, this.m4);
      this.embers.setColorAt(n++, this.col.setRGB(...(i % 4 ? [2.4, 0.5, 0.06] : [2.6, 1.3, 0.25]) as [number, number, number]));
    }
    this.embers.count = n; this.embers.instanceMatrix.needsUpdate = true; if (this.embers.instanceColor) this.embers.instanceColor.needsUpdate = true;
    // the line smokes where it hangs over the lava
    n = 0;
    const f = snap.fishing;
    if (shot.rod && f && (f.phase === 'wait' || f.phase === 'bite' || f.phase === 'pull')) {
      const tg = castTarget(f), w = this.rig.water(tg.x, tg.far, shot.place!), fwd = new THREE.Vector3(pose.target.x - eye.x, 0, pose.target.z - eye.z).normalize();
      const tip = new THREE.Vector3(eye.x, eye.y + 0.6, eye.z).addScaledVector(fwd, 1.6);
      for (let i = 0; i < 48; i++) {
        const life = 2.2, age = (t + (i / 48) * life) % life, kk = age / life, along = 0.3 + 0.7 * hash2(i, Math.floor((t + (i / 48) * life) / life), 160);
        this.v3.lerpVectors(tip, w, along); this.v3.y += kk * 3 + Math.sin(t * 2 + i) * 0.2; this.v3.x += Math.sin(t * 0.7 + i) * 0.3 * kk;
        this.m4.compose(this.v3, this.q, this.sc.setScalar(0.12 + kk * 0.5)); this.smoke.setMatrixAt(n, this.m4); this.smoke.setColorAt(n++, this.col.setHex(i % 2 ? 0x6a625c : 0x8a827a));
      }
    }
    this.smoke.count = n; this.smoke.instanceMatrix.needsUpdate = true; if (this.smoke.instanceColor) this.smoke.instanceColor.needsUpdate = true;
    this.fanProps(fx.fan, t, dt, cadence);
  }

  /** The cooling fan scene: blades geared to the cranks, the eel's glow fading with the sim's, then three bites. */
  private fanProps(fan: CavernShot['fx']['fan'], t: number, dt: number, cadence: number) {
    this.fanRoot.visible = this.stick.visible = !!fan;
    if (!fan) { this.fanSpin = 0; return; }
    // spin up toward the cadence (geared ×2.5), coast down while you eat
    const want = fan.eat > 0 ? 0 : ((cadence || 0) / 60) * Math.PI * 2 * 2.5;
    this.fanSpin += (want - this.fanSpin) * (1 - Math.exp(-dt / 0.8));
    this.fanA += this.fanSpin * dt; this.blades.rotation.z = -this.fanA;
    const g = fan.glow, hot = ease(g);
    // molten orange → red → plain grey-green: the body's emissive fades out, the seams go dark last
    this.eelBody.emissive.setRGB(1.4 * hot + 0.25 * g, 0.55 * hot * hot, 0.1 * hot * hot * hot);
    this.eelBody.color.setRGB(lerp(1, 0.7, hot), lerp(1, 0.5, hot), lerp(1, 0.45, hot));
    this.eelSeams.color.setScalar(0.15 + 2.2 * g);
    const bites = Math.min(3, Math.floor(fan.eat * 3.99)), chew = fan.eat > 0 ? Math.sin(fan.eat * 3.99 * Math.PI * 2) * 0.02 : 0;
    this.stick.position.set(-0.08 + 0.12 * bites, -0.3 + chew, lerp(-1.15, -0.62, ease(clamp01(fan.eat * 3))));
    this.stick.rotation.set(0.15, 0.25, -0.12);
    this.stick.scale.set(1 - 0.27 * bites, 1, 1); // what's left of it
    // steam off it while it's hot; wisps of air from the fan while you're in the band
    let n = 0;
    for (let i = 0; i < 24 && g > 0.05; i++) {
      const life = 1.6, age = (t + (i / 24) * life) % life, kk = age / life, x = (hash2(i, Math.floor((t + (i / 24) * life) / life), 170) - 0.5) * 0.9;
      this.v3.set(x + kk * 0.12, 0.05 + kk * 0.5, Math.sin(t + i) * 0.04 + kk * 0.15);
      this.m4.compose(this.v3, this.q, this.sc.setScalar((0.005 + kk * 0.014) * Math.min(1, g * 2))); this.steam.setMatrixAt(n++, this.m4);
    }
    this.steam.count = n; this.steam.instanceMatrix.needsUpdate = true;
    n = 0;
    const blow = Math.min(1, this.fanSpin / 30) * (fan.inBand ? 1 : 0.4);
    for (let i = 0; i < 24 && blow > 0.05 && fan.eat === 0; i++) {
      const life = 0.5, age = (t + (i / 24) * life) % life, kk = age / life, a = hash2(i, 1, 171) * Math.PI * 2, r = 0.15 + hash2(i, 2, 171) * 0.5;
      this.v3.set(Math.cos(a) * r, Math.sin(a) * r * 0.7, 0.2 + kk * 1.4);
      this.m4.compose(this.v3, this.q, this.sc.set(0.008, 0.008, 0.18 * blow)); this.wind.setMatrixAt(n++, this.m4);
    }
    this.wind.count = n; this.wind.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    this.gate?.dispose(); this.gate = null; this.view.terrain.root.visible = true;
    this.rig.dispose();
    disposeSet(this.fanRoot, this.stick, this.root);
  }
}
