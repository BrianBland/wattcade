// Chapter 2b in the voxel world (#191): poses the WorldView (on the island world) from the director's shot
// (render/islandShots.ts) and drives the set: the paddle wheels the bike grew on the way up (turning with your
// cadence, splashing on each stroke), the driftwood fire burning with nobody there, the rod on the beach, leaves
// coming down through the canopy, the head's eyes catching the light, the dark of the hall with its sun shafts and
// dust, and the statue on its plinth (Lou, in stone; nobody says so).
import * as THREE from 'three';
import { disposeSet } from './dispose';
import type { SeasideSnapshot } from '../sim/types';
import { addGrid } from '../stills/stage';
import { VoxelGrid } from '../voxel/grid';
import { definePalette } from '../voxel/palette';
import { hash2 } from '../voxel/noise';
import { buildLou, LOU } from '../world/lou';
import { HALL, HEAD, headWorld, PLATEAU_Y, SEA_Y } from '../world/islandLayout';
import { FIRE, K, SHAFTS } from '../world/islandBuild';
import { islandGround } from '../world/island';
import { FishingRig } from './fishingRig';
import { islandShot, statuePoint, type IslandShot } from './islandShots';
import type { V3 } from './morningShots';
import type { WorldView } from './worldView';

const PAL = definePalette({
  wood: 0x8a6a48, wood2: 0x6e5236, iron: 0x3a3a3e, paddle: 0xd8c8a0, glow: 0xffd27a,
  flame: 0xffb030, flame2: 0xff6a1a, flame3: 0xfff0a0, smoke: 0x9a948c, smoke2: 0xbab4ac, water: 0xeefbff, leaf: 0x8ccf4a, leaf2: 0x5aa548, dust: 0xfff4d0,
});
const P = PAL.idx;
const NONE = { cast: false, receive: false };
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const ease = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const mixHex = (a: number, b: number, t: number) => new THREE.Color(a).lerp(new THREE.Color(b), clamp01(t)).getHex();
const lerpV = (a: V3, b: V3, k: number): V3 => ({ x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k), z: lerp(a.z, b.z, k) });
interface Pose { eye: V3; target: V3 }

/** A paddle wheel: hub, two rims, eight blades. Axis along x, origin at the hub. */
function buildWheel(): VoxelGrid {
  const g = new VoxelGrid(0.02), R = 0.42;
  g.wsegment([-0.09, 0, 0], [0.09, 0, 0], 0.06, P.iron);
  for (const x of [-0.08, 0.08]) for (let a = 0; a < Math.PI * 2; a += 0.05) g.wellipsoid([x, Math.cos(a) * R, Math.sin(a) * R], [0.015, 0.02, 0.02], P.wood2);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
    g.wsegment([0, 0, 0], [0, c * R, s * R], 0.015, P.wood);
    g.wbox([-0.09, c * R * 0.55 - 0.02, s * R * 0.55 - 0.02], [0.09, c * R * 1.05 + 0.02, s * R * 1.05 + 0.02], P.paddle);
  }
  return g;
}

export class IslandSet {
  readonly rig: FishingRig;
  private root = new THREE.Group();
  private wheels: THREE.Group[] = [];
  private wheelRoot = new THREE.Group();
  private fireLight = new THREE.PointLight(0xff9a40, 0, 14, 1.6);
  private fire: THREE.InstancedMesh; private smoke: THREE.InstancedMesh; private splash: THREE.InstancedMesh;
  private leaves: THREE.InstancedMesh; private dust: THREE.InstancedMesh;
  private eyes = new THREE.Group();
  private shafts = new THREE.Group();
  private statue = new THREE.Group();
  private statueLight = new THREE.SpotLight(0xffe2b0, 0, 40, 0.32, 0.5, 1.1);
  private statueFill = new THREE.PointLight(0xffc890, 0, 14, 1.4);
  private last: { id: string; pose: Pose } | null = null;
  private blend: { from: Pose; t0: number; dur: number } | null = null;
  private wheelA = 0;
  private m4 = new THREE.Matrix4(); private q = new THREE.Quaternion(); private v3 = new THREE.Vector3(); private sc = new THREE.Vector3(); private col = new THREE.Color();

  constructor(private view: WorldView) {
    const st = view.stage;
    this.rig = new FishingRig(st);
    // paddle wheels either side, at the water, turning with the cranks
    const wheel = buildWheel();
    for (const side of [-1, 1]) {
      const g = new THREE.Group(), inner = new THREE.Group();
      addGrid(st, `paddle wheel ${side}`, wheel, { palette: PAL.linear, jitter: 0.03 }, inner, NONE);
      g.add(inner); g.position.set(side * 0.85, 0, 0); this.wheels.push(inner); this.wheelRoot.add(g);
    }
    this.wheelRoot.visible = false; st.camera.add(this.wheelRoot);
    // the fire: flames, smoke, a warm light
    const inst = (n: number, mat: THREE.Material) => { const m = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat, n); m.frustumCulled = false; m.count = 0; this.root.add(m); return m; };
    this.fire = inst(60, new THREE.MeshBasicMaterial({ color: 0xffffff, fog: true }));
    this.smoke = inst(40, new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, depthWrite: false }));
    this.splash = inst(80, new THREE.MeshLambertMaterial({ color: 0xf4fbff }));
    this.leaves = inst(90, new THREE.MeshLambertMaterial({ color: 0xffffff }));
    this.dust = inst(160, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6, depthWrite: false, fog: false }));
    const f = FIRE(); this.fireLight.position.set(f[0], islandGround(f[0], f[2]) + 0.8, f[2]); this.root.add(this.fireLight);
    // the head's eyes: a warm glint in each socket
    const eg = new VoxelGrid(0.15);
    for (const sx of [-1, 1]) eg.wellipsoid([sx * 2.4 * K, 0, 0], [0.3 * K, 0.24 * K, 0.15], P.glow);
    addGrid(st, 'eye glints', eg, { palette: PAL.linear.map((x) => x * 1.8), jitter: 0 }, this.eyes, NONE, new THREE.MeshBasicMaterial({ vertexColors: true }));
    const [ex, ez] = HEAD.at;
    this.eyes.position.set(ex, PLATEAU_Y() + 7.75 * K, ez); this.eyes.rotation.y = Math.atan2(-HEAD.fwd[0], -HEAD.fwd[1]);
    this.eyes.translateZ(1.0 * K);
    // the hall: a shaft of light down each roof well
    for (const w of SHAFTS.slice(0, -1)) {
      const [x, z] = headWorld(0, w), m = new THREE.Mesh(new THREE.BoxGeometry(5.5, HALL.h + 30, 3.6), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.3, 1.15, 0.85), transparent: true, opacity: 0.07, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
      m.position.set(x, PLATEAU_Y() + (HALL.h + 30) / 2 - 0.2, z); m.rotation.y = Math.atan2(HEAD.fwd[0], HEAD.fwd[1]); m.renderOrder = 3;
      this.shafts.add(m);
    }
    // the statue: Lou in stone, three times life size, facing the way in
    addGrid(st, 'statue', buildLou({ finish: 'stone', scale: 4, voxel: 0.06 }), { palette: LOU.linear, jitter: 0.04 }, this.statue, NONE);
    const sp = statuePoint();
    this.statue.position.set(sp.x, sp.y - 3.2, sp.z); // Lou is modelled from the waist up (y ≥ 0.8 m × scale)
    this.statue.rotation.y = Math.atan2(-HEAD.fwd[0], -HEAD.fwd[1]); // facing back up the hall
    // the last well lights the statue
    this.statueLight.position.set(sp.x, sp.y + HALL.h + 6, sp.z); this.statueLight.target.position.set(sp.x, sp.y + 2, sp.z);
    this.statueFill.position.set(sp.x, sp.y + 2.5, sp.z).addScaledVector(new THREE.Vector3(-HEAD.fwd[0], 0, -HEAD.fwd[1]), 6);
    this.root.add(this.statueLight, this.statueLight.target, this.statueFill);
    this.root.add(this.eyes, this.shafts, this.statue);
    st.scene.add(this.root);
  }

  /** Pose and render one frame of an island scene. `t` = story clock (s). */
  frame(snap: SeasideSnapshot, t: number, dt: number, cadence: number): IslandShot | null {
    const shot = islandShot(snap);
    if (!shot) return null;
    const fx = shot.fx;
    let pose: Pose = { eye: shot.eye, target: shot.target };
    if (this.last && this.last.id !== snap.sceneId) {
      const jump = Math.hypot(pose.eye.x - this.last.pose.eye.x, pose.eye.z - this.last.pose.eye.z);
      this.blend = jump < 60 ? { from: this.last.pose, t0: t, dur: 2.4 } : null;
    }
    if (this.blend) {
      const k = ease((t - this.blend.t0) / this.blend.dur), f = this.blend.from;
      if (k >= 1) this.blend = null; else pose = { eye: lerpV(f.eye, pose.eye, k), target: lerpV(f.target, pose.target, k) };
    }
    this.last = { id: snap.sceneId, pose };
    this.props(snap, shot, pose, t, dt, cadence);
    const sky = this.view.world.sky;
    let atmos: Parameters<WorldView['frame']>[0]['atmos'];
    if (fx.inside > 0) { // the dark of the hall: warm brown haze, little sky light
      const k = fx.inside, col = mixHex(sky.fog, 0x4a3826, k);
      atmos = { fog: col, density: lerp(sky.fogDensity, 0.012, k), sunI: lerp(sky.sunI, 1.3, k), hemiI: lerp(sky.hemiI, 0.6, k) };
    }
    this.view.frame({ t, routeS: shot.s, speed: shot.speed, look: snap.look.name, dream: snap.look.dream, eye: pose.eye, aim: pose.target,
      bars: shot.bars, cadence: cadence || 80, atmos, roll: fx.paddle !== null ? fx.paddle * 0.25 : 0 });
    this.rig.update(shot.rod ? snap.fishing : null, t, shot.place ?? { waterY: SEA_Y });
    return shot;
  }

  private props(snap: SeasideSnapshot, shot: IslandShot, pose: Pose, t: number, dt: number, cadence: number) {
    const fx = shot.fx, eye = pose.eye;
    let n = 0;
    // paddle wheels: one turn per two crank turns, splashes as each blade bites
    this.wheelRoot.visible = fx.paddle !== null;
    if (fx.paddle !== null) {
      this.wheelRoot.position.set(0, -0.78, -1.35); // either side of the front wheel, half in the water
      this.wheelA += ((cadence || 0) / 60) * Math.PI * dt;
      for (const w of this.wheels) w.rotation.x = -this.wheelA;
      const bite = cadence > 20 ? 1 : 0;
      for (let i = 0; i < 80 && bite; i++) {
        const life = 0.6, age = ((t + i * 0.0137) % life), gen = Math.floor((t + i * 0.0137) / life), side = i % 2 ? 1 : -1;
        const fwd = new THREE.Vector3(pose.target.x - eye.x, 0, pose.target.z - eye.z).normalize(), right = new THREE.Vector3(-fwd.z, 0, fwd.x);
        const a = hash2(i, gen, 1) * Math.PI - Math.PI / 2, sp = 0.6 + hash2(i, gen, 2) * 1.2;
        this.v3.set(eye.x, SEA_Y, eye.z).addScaledVector(right, side * (0.85 + Math.cos(a) * 0.2)).addScaledVector(fwd, 1.1 - age * sp);
        this.v3.y = SEA_Y + 0.05 + (1.4 * age - 3 * age * age) * (0.6 + hash2(i, gen, 3));
        if (this.v3.y < SEA_Y) continue;
        this.m4.compose(this.v3, this.q, this.sc.setScalar(0.04 + 0.03 * hash2(i, gen, 4)));
        this.splash.setMatrixAt(n++, this.m4);
      }
    }
    this.splash.count = n; this.splash.instanceMatrix.needsUpdate = true;
    // the fire: flickering flames over the logs, smoke drifting off inland
    const f = FIRE(), fy = islandGround(f[0], f[2]), fireOn = Math.hypot(eye.x - f[0], eye.z - f[2]) < 260;
    this.fireLight.intensity = fireOn ? 3 + 1.2 * Math.sin(t * 11) * Math.sin(t * 7.3) : 0;
    n = 0;
    if (fireOn) for (let i = 0; i < 60; i++) {
      const life = 0.7 + hash2(i, 1, 5) * 0.5, age = (t * (0.8 + hash2(i, 2, 5) * 0.6) + hash2(i, 3, 5) * life) % life, k = age / life;
      const a = hash2(i, 4, 5) * Math.PI * 2, r = 0.25 * (1 - k) * hash2(i, 5, 5);
      this.v3.set(f[0] + Math.cos(a) * r + Math.sin(t * 3 + i) * 0.04, fy + 0.25 + k * 1.1, f[2] + Math.sin(a) * r);
      this.m4.compose(this.v3, this.q, this.sc.setScalar(0.16 * (1 - k) + 0.03));
      this.fire.setMatrixAt(n, this.m4);
      this.fire.setColorAt(n++, this.col.setRGB(...(k < 0.3 ? [3, 2.6, 1.4] : k < 0.65 ? [2.6, 1.3, 0.3] : [1.8, 0.5, 0.1]) as [number, number, number]));
    }
    this.fire.count = n; this.fire.instanceMatrix.needsUpdate = true; if (this.fire.instanceColor) this.fire.instanceColor.needsUpdate = true;
    n = 0;
    if (fireOn) for (let i = 0; i < 40; i++) {
      const life = 6, age = (t + (i / 40) * life) % life, k = age / life;
      this.v3.set(f[0] + k * 2.5 + Math.sin(t * 0.5 + i) * 0.3 * k, fy + 1.2 + k * 6, f[2] - k * 1.2);
      this.m4.compose(this.v3, this.q, this.sc.setScalar(0.25 + k * 0.9));
      this.smoke.setMatrixAt(n, this.m4); this.smoke.setColorAt(n++, this.col.setHex(i % 2 ? 0x9a948c : 0xbab4ac));
    }
    this.smoke.count = n; this.smoke.instanceMatrix.needsUpdate = true; if (this.smoke.instanceColor) this.smoke.instanceColor.needsUpdate = true;
    // leaves drifting down through the jungle, never across the eye's path
    n = 0;
    const jungle = snap.sceneId === 'cutStones' || snap.sceneId === 'monkeyMouth' || (snap.sceneId === 'boardwalk' && snap.scene.progress > 0.4);
    if (jungle) {
      const fwd = new THREE.Vector3(pose.target.x - eye.x, 0, pose.target.z - eye.z).normalize(), right = new THREE.Vector3(-fwd.z, 0, fwd.x);
      for (let i = 0; i < 90; i++) {
        const side = i % 2 ? 1 : -1, h0 = 4 + hash2(i, 4, 140) * 14, y = h0 - ((t * (0.6 + hash2(i, 1, 140) * 0.6) + hash2(i, 5, 140) * 20) % h0);
        this.v3.set(eye.x, eye.y - 1.5 + y, eye.z).addScaledVector(right, side * (2.5 + hash2(i, 2, 140) * 10) + Math.sin(t * 1.7 + i) * 0.5).addScaledVector(fwd, 2 + hash2(i, 3, 140) * 30);
        this.q.setFromEuler(new THREE.Euler(Math.sin(t * 3 + i) * 0.9, t * 2 + i, Math.cos(t * 2.5 + i) * 0.7));
        this.m4.compose(this.v3, this.q, this.sc.set(0.16, 0.02, 0.1));
        this.leaves.setMatrixAt(n, this.m4); this.leaves.setColorAt(n++, this.col.setHex(i % 3 ? 0x8ccf4a : 0x5aa548));
      }
      this.q.identity();
    }
    this.leaves.count = n; this.leaves.instanceMatrix.needsUpdate = true; if (this.leaves.instanceColor) this.leaves.instanceColor.needsUpdate = true;
    // the head's eyes brighten as you come up the approach; the hall's shafts and the dust turning in them
    this.eyes.visible = fx.eyes > 0;
    this.eyes.traverse((o) => { const m = (o as THREE.Mesh).material as THREE.MeshBasicMaterial | undefined; if (m?.color) m.color.setScalar(0.4 + 1.4 * fx.eyes ** 2 + 0.1 * Math.sin(t * 3)); });
    this.shafts.visible = fx.shafts;
    n = 0;
    if (fx.shafts) for (let i = 0; i < 160; i++) {
      const w = SHAFTS[i % SHAFTS.length] + (hash2(i, 1, 9) - 0.5) * 4, u = (hash2(i, 2, 9) - 0.5) * 6, [x, z] = headWorld(u, w);
      const y = PLATEAU_Y() + ((hash2(i, 3, 9) * HALL.h + t * 0.15 * (0.5 + hash2(i, 4, 9))) % HALL.h);
      this.v3.set(x + Math.sin(t * 0.3 + i) * 0.4, y, z + Math.cos(t * 0.27 + i) * 0.4);
      this.m4.compose(this.v3, this.q, this.sc.setScalar(0.03 + 0.03 * hash2(i, 5, 9)));
      this.dust.setMatrixAt(n++, this.m4);
    }
    this.dust.count = n; this.dust.instanceMatrix.needsUpdate = true;
    this.statue.visible = snap.sceneId === 'temple' || snap.sceneId === 'monkeyMouth';
    this.statueLight.intensity = fx.shafts ? 60 : 0; this.statueFill.intensity = fx.shafts ? 28 : 0;
  }

  dispose(): void {
    this.rig.dispose();
    disposeSet(this.wheelRoot, this.root);
  }
}
