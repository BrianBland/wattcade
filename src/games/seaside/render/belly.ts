// Chapter 2a in the voxel world (#190): poses the WorldView (on the belly world) from the director's shot
// (render/bellyShots.ts) and drives the set: the swallowed junk, the survey boat and its glinting parts, the bile-pool
// lights that travel with you, the walls breathing with the heartbeat, the bars unfolding into the drill, the bit
// spinning with your cadence, the tunnel face of each layer, chips and sparks, the cracks, the flood and the swim up
// toward the light (which grows with your power).
import * as THREE from 'three';
import type { SeasideSnapshot } from '../sim/types';
import { BELLY_LAYERS, PARTS, type PartId } from '../sim/belly';
import { addGlow, addLit, L, Particles, rnd, setGlow, wob } from '../stills/later/kit';
import { drillAxis, GUT_LIGHTS, PART_SPOTS } from '../world/bellyLayout';
import {
  buildBit, buildBoat, buildCracks, buildDinghy, buildDrillRig, buildFace, buildHubcap, buildPart, buildRod, buildSign, buildSparkle,
  buildTrap, buildTunnel, buildTyre, CHUCK, layerAtDepth,
} from '../world/bellyProps';
import { bellyShot, BREAK_T, type BellyShot } from './bellyShots';
import { LOOKS } from './looks';
import type { V3 } from './morningShots';
import type { WorldView } from './worldView';

const NONE = { cast: false, receive: false };
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const ease = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const mixHex = (a: number, b: number, t: number) => new THREE.Color(a).lerp(new THREE.Color(b), clamp01(t)).getHex();
const lerpV = (a: V3, b: V3, k: number): V3 => ({ x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k), z: lerp(a.z, b.z, k) });
const BELLY_POST = LOOKS.belly.post!;
const N_LIGHTS = 4, CHIPS = 90, SPARKS = 160, WATER = 160, MOTES = 60;
interface Pose { eye: V3; target: V3 }

export class BellySet {
  private root = new THREE.Group();
  private parts = new Map<PartId, { g: THREE.Group; sparkle: THREE.Group }>();
  private lights: THREE.PointLight[] = [];
  private rig = new THREE.Group();
  private bit = new THREE.Group();
  private spin = new THREE.Group();
  private lamp = new THREE.SpotLight(0xfff0d8, 0, 9, 0.6, 0.6, 1.2);
  private hot = new THREE.PointLight(0xffb060, 0, 3, 1.6);
  private tunnel = new THREE.Group();
  private faces: THREE.Group[] = [];
  private cracks: THREE.Group[] = [];
  private sparks: Particles; private chips: Particles; private water: Particles; private motes: Particles;
  private sky = new THREE.Mesh(new THREE.CircleGeometry(1, 40), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, fog: false, depthWrite: false, side: THREE.DoubleSide }));
  private last: { id: string; pose: Pose } | null = null;
  private blend: { from: Pose; t0: number; dur: number } | null = null;
  private spinA = 0; private light = 0;
  private cam = new THREE.PerspectiveCamera();
  private v = new THREE.Vector3(); private v2 = new THREE.Vector3(); private zAxis = new THREE.Vector3(0, 0, 1);

  constructor(private view: WorldView) {
    const st = view.stage;
    const lit = (name: string, g: Parameters<typeof addLit>[2], parent: THREE.Object3D = this.root, jitter = 0.05) => addLit(st, name, g, jitter, NONE, parent);
    lit('old rod', buildRod()); lit('VISTA POINT', buildSign()); lit('dinghy', buildDinghy()); lit('tyre', buildTyre()); lit('crab trap', buildTrap());
    for (let i = 0; i < 3; i++) lit(`hubcap ${i}`, buildHubcap(i));
    lit('survey boat', buildBoat(), this.root, 0.06);
    for (const p of PARTS) {
      const g = new THREE.Group(), sparkle = addGlow(st, `${p.id} glint`, buildSparkle(p.id), 2, g);
      lit(p.id, buildPart(p.id), g);
      this.parts.set(p.id, { g, sparkle }); this.root.add(g);
    }
    for (let i = 0; i < N_LIGHTS; i++) { const l = new THREE.PointLight(0x5ff6e8, 6, 15, 1.6); this.lights.push(l); this.root.add(l); }
    // the drill: rig on the camera (in place of the bars), bit aimed at the face every frame
    lit('drill', buildDrillRig(), this.rig, 0.04);
    lit('bit', buildBit(), this.spin, 0.03);
    this.bit.add(this.spin); this.bit.position.set(...CHUCK); this.rig.add(this.bit);
    this.lamp.position.set(0, 0.02, -0.2); this.rig.add(this.lamp, this.lamp.target);
    this.rig.visible = false; st.camera.add(this.rig);
    // the tunnel at the stomach wall
    const A = drillAxis();
    this.tunnel.position.set(A.x, A.y, A.z);
    lit('tunnel', buildTunnel(), this.tunnel, 0.06);
    BELLY_LAYERS.forEach((l, i) => { const g = new THREE.Group(); lit(`${l.id} face`, buildFace(i), g, 0.06); this.faces.push(g); this.tunnel.add(g); });
    for (let k = 0; k < 3; k++) { const g = new THREE.Group(); addGlow(st, `cracks ${k}`, buildCracks(k), 2.4, g); g.visible = false; this.cracks.push(g); this.faces[2].add(g); }
    this.tunnel.add(this.hot);
    this.root.add(this.tunnel);
    this.sparks = new Particles(st, SPARKS, { intensity: 2.6, parent: this.root });
    this.chips = new Particles(st, CHIPS, { lit: true, parent: this.root });
    this.water = new Particles(st, WATER, { intensity: 1.6, parent: this.root });
    this.motes = new Particles(st, MOTES, { intensity: 2.4, parent: this.root });
    this.sky.rotation.x = Math.PI / 2; this.sky.renderOrder = 3; this.sky.visible = false; this.root.add(this.sky);
    st.scene.add(this.root);
  }

  /** Pose and render one frame of a belly scene. `t` = story clock (s). Returns the shot. */
  frame(snap: SeasideSnapshot, t: number, dt: number, bike: { cadence: number; powerFtp: number }): BellyShot | null {
    const shot = bellyShot(snap);
    if (!shot) return null;
    const fx = shot.fx;
    let pose: Pose = { eye: shot.eye, target: shot.target };
    if (this.last && this.last.id !== snap.sceneId) {
      const jump = Math.hypot(pose.eye.x - this.last.pose.eye.x, pose.eye.z - this.last.pose.eye.z);
      this.blend = jump < 400 && snap.sceneId !== 'breakthrough' ? { from: this.last.pose, t0: t, dur: 2.4 } : null;
    }
    if (this.blend) {
      const k = ease((t - this.blend.t0) / this.blend.dur), f = this.blend.from;
      if (k >= 1) this.blend = null;
      else pose = { eye: lerpV(f.eye, pose.eye, k), target: lerpV(f.target, pose.target, k) };
    }
    this.last = { id: snap.sceneId, pose };
    // the light from above grows with power (smoothed), on top of the climb
    this.light += (clamp01(bike.powerFtp / 1.3) - this.light) * (1 - Math.exp(-dt / 0.8));
    this.props(snap, shot, pose, t, dt, bike.cadence);
    const sky = this.view.world.sky;
    let atmos: Parameters<WorldView['frame']>[0]['atmos'];
    if (fx.flood > 0) {
      const water = mixHex(0x0f4a5a, 0x7fd0d8, fx.rise * 0.7 + this.light * 0.3), col = mixHex(sky.fog, water, fx.flood);
      atmos = { fog: col, density: lerp(sky.fogDensity, 0.045 - 0.02 * fx.rise, fx.flood), zenith: col, horizon: col, sunI: lerp(sky.sunI, 1.2, fx.rise), hemiI: lerp(sky.hemiI, 1.1, fx.flood) };
    }
    const post = fx.haze > 0 ? { bloom: lerp(BELLY_POST.bloom ?? 0.9, 2.6, fx.haze), threshold: lerp(BELLY_POST.threshold ?? 0.95, 0.3, fx.haze) } : undefined;
    this.view.frame({ t, routeS: shot.s, speed: shot.speed, look: snap.look.name, dream: snap.look.dream, eye: pose.eye, aim: pose.target,
      bars: shot.bars, barsDrop: fx.unfold ?? 0, cadence: bike.cadence || 70, atmos, roll: fx.roll, post });
    return shot;
  }

  private props(snap: SeasideSnapshot, shot: BellyShot, pose: Pose, t: number, dt: number, cadence: number) {
    const fx = shot.fx, eye = pose.eye, u = -eye.z, A = drillAxis();
    // walls breathe with the heartbeat, about the eye (scaling about the origin would swing the far gut around)
    const k = 1 + 0 * fx.heart, terr = this.view.terrain.root;
    terr.scale.set(k, k, 1); terr.position.set(eye.x * (1 - k), eye.y * (1 - k), 0);
    // the bile-pool lights nearest ahead of the eye
    const i0 = Math.max(0, Math.min(GUT_LIGHTS.length - N_LIGHTS, Math.floor((u - 4 + 12) / 17)));
    this.lights.forEach((l, i) => { const p = GUT_LIGHTS[i0 + i]; l.position.set(p[0], p[1], p[2]); l.intensity = 5 * (0.8 + 0.5 * fx.heart) * (1 - fx.flood); });
    // parts: gone once in hand; they glint as you come up on them
    for (const p of PARTS) {
      const it = this.parts.get(p.id)!, got = snap.parts ? snap.parts.items.find((x) => x.id === p.id)!.got : snap.sceneId !== 'belly' && snap.sceneId !== 'eyesOpen';
      it.g.visible = !got;
      const q = PART_SPOTS[p.id], d = Math.abs(u - q.u), near = clamp01(1 - (d - 2) / 22), reach = snap.parts?.reach === p.id ? 1 : 0;
      setGlow(it.sparkle, (0.25 + 1.3 * near + 0.9 * reach) * (0.75 + 0.25 * Math.sin(t * 6 + q.u)));
      it.sparkle.visible = near > 0;
    }
    // glowing motes drifting in the air round the eye
    const mo = fx.flood > 0 ? 0 : MOTES;
    for (let i = 0; i < mo; i++) {
      const a = rnd(i, 1, 120) * Math.PI * 2, r = 1.5 + rnd(i, 2, 120) * 7, z = eye.z - 4 - rnd(i, 3, 120) * 24;
      this.motes.set(i, [eye.x + Math.cos(a) * r + Math.sin(t * 0.4 + i * 1.3) * 0.5, eye.y - 1 + rnd(i, 4, 120) * 5 + Math.sin(t * 0.6 + i) * 0.4, z], 0.035 + 0.02 * Math.sin(t * 3 + i), i % 3 ? L.spot : L.spot2);
    }
    this.motes.commit(mo);
    // the drill rig rises into the hands as the bars sink
    const unfold = fx.unfold ?? 0;
    this.rig.visible = unfold > 0;
    this.rig.position.set(0, this.view.handsY * (0.66 / 0.46) + 0.05 - 0.6 * (1 - ease(unfold)), -0.66);
    this.bit.visible = unfold > 0.55;
    this.bit.scale.set(1, 1, 1);
    const d = fx.drill, layer = d ? layerAtDepth(d.depth) : 0, L0 = BELLY_LAYERS[layer];
    const boring = !!d && fx.since === null && (d.phase === 'bore' || d.phase === 'crack');
    // bit: spins with cadence (bucks with the layer's chatter), aimed at the face
    const rpm = (cadence || 0) * 3 * (d?.phase === 'rest' ? 0.35 : 1);
    this.spinA += (rpm / 60) * Math.PI * 2 * dt; this.spin.rotation.z = -this.spinA;
    const tunnelOn = snap.sceneId === 'spareParts' || snap.sceneId === 'drill1' || (snap.sceneId === 'breakthrough' && (fx.since ?? 0) < BREAK_T.outS);
    this.tunnel.visible = tunnelOn;
    if (unfold > 0) {
      this.cam.position.set(eye.x, eye.y, eye.z); this.cam.lookAt(pose.target.x, pose.target.y, pose.target.z); this.cam.updateMatrixWorld();
      if (d && fx.since === null) this.v.set(A.x, A.y, A.z - d.depth + 0.04 + d.back);
      else this.v.set(0, -0.12, -1.3).applyMatrix4(this.cam.matrixWorld); // idle: straight ahead
      this.cam.worldToLocal(this.v).sub(this.rig.position).sub(this.bit.position);
      const len = this.v.length();
      this.bit.quaternion.setFromUnitVectors(this.zAxis, this.v.normalize());
      this.bit.scale.set(1, 1, len);
    }
    const shake = boring ? L0.shake * (0.6 + 0.4 * Math.abs(wob(t * L0.chatter * 0.15, 3))) * clamp01(cadence / 60) : 0;
    this.rig.position.x += wob(t * L0.chatter * 0.4, 1) * shake; this.rig.position.y += wob(t * L0.chatter * 0.5, 2) * shake;
    this.lamp.intensity = tunnelOn && unfold > 0 ? 1.4 : 0; this.lamp.target.position.set(0, -0.1, -3);
    // the face of the layer at the bit; the cracks open in the last stretch; it all goes at the breakthrough
    const depth = d?.depth ?? 0;
    this.faces.forEach((f, i) => { f.visible = i === layer && (fx.since === null || fx.since < 0.12); f.position.z = -depth; });
    const crack = d?.phase === 'crack' ? d.k : 0;
    this.cracks.forEach((c, i) => { c.visible = crack > i * 0.3 + 0.05 || (fx.since !== null && fx.since < 0.12); });
    this.hot.position.set(0, 0, -depth + 0.25);
    this.hot.intensity = boring ? (0.4 + 0.5 * Math.abs(Math.sin(t * 37))) * clamp01(cadence / 50) * (layer === 0 ? 0.3 : 1) : 0;
    // chips and sparks off the face
    const tip = [A.x, A.y, A.z - depth + 0.06] as const;
    const rate = !d ? 0 : fx.since !== null ? (fx.since < 1.5 ? 2.5 : 0) : d.phase === 'bore' || d.phase === 'crack' ? clamp01(cadence / 60) : d.phase === 'rest' ? 0.25 : 0.1;
    const chipPal = layer === 0 ? [L.flesh2, L.fleshDark, L.flesh] : layer === 1 ? [L.cart, L.cart2, L.cartDark] : [L.bone, L.bone2, L.ribEdge];
    let n = 0;
    const nChips = Math.round(CHIPS * Math.min(1, rate));
    for (let i = 0; i < nChips; i++) {
      const life = d?.phase === 'rest' ? 1.4 : 0.9, born = (i / CHIPS) * life, age = ((t - born) % life + life) % life, gen = Math.floor((t - born) / life);
      const a = rnd(i, gen, 134) * Math.PI * 2, burst = fx.since !== null ? 3 : 1, sp = (0.5 + rnd(i, gen, 135) * 1.2) * burst, back = d?.phase === 'rest' ? 0.3 : (1.5 + rnd(i, gen, 136) * 2.5) * burst;
      const g = layer === 0 ? 5 : 3, p = [tip[0] + Math.cos(a) * sp * age, tip[1] + Math.sin(a) * sp * age * 0.8 - g * age * age, tip[2] + back * age];
      this.chips.set(n++, p, (0.012 + rnd(i, gen, 137) * 0.03) * (layer === 0 ? 1.6 : 1), chipPal[Math.floor(rnd(i, gen, 138) * 3)], [t * 9 + i, t * 7 + i * 2, 0]);
    }
    this.chips.commit(n);
    n = 0;
    const sparkRate = boring ? [0, 0.25, 1][layer] * clamp01(cadence / 55) : 0;
    for (let i = 0; i < Math.round(SPARKS * sparkRate); i++) { // sparks only where steel meets cartilage and bone
      const born = (i / SPARKS) * 0.35, age = ((t - born) % 0.35 + 0.35) % 0.35, gen = Math.floor((t - born) / 0.35);
      const a = rnd(i, gen, 130) * Math.PI * 2, sp = 1.2 + rnd(i, gen, 131) * 3.2, back = 0.6 + rnd(i, gen, 132) * 2.2;
      const p = [tip[0] + Math.cos(a) * sp * age, tip[1] + Math.sin(a) * sp * age * 0.8 - 2.5 * age * age, tip[2] + back * age];
      this.sparks.set(n++, p, [0.014, 0.014, (0.03 + 0.08 * (1 - age / 0.35)) * 1.6], rnd(i, gen, 133) < 0.6 ? L.spark : L.lavaHot, [Math.sin(a) * 0.8, Math.cos(a) * 0.8, 0]);
    }
    this.sparks.commit(n);
    // the flood: water bursting in past the eye, then bubbles streaming up round it on the way to the surface
    n = 0;
    if (fx.since !== null) {
      const s = fx.since;
      for (let i = 0; i < WATER; i++) {
        if (s < 2.2) { // a jet in through the hole, toward the camera
          const life = 0.7, born = (i / WATER) * life, age = ((s - born) % life + life) % life, gen = Math.floor((s - born) / life);
          const a = rnd(i, gen, 150) * Math.PI * 2, r = 0.2 + rnd(i, gen, 151) * 1.1;
          this.water.set(n++, [A.x + Math.cos(a) * r * (1 + age), A.y + Math.sin(a) * r * 0.8 * (1 + age), A.z - depth + age * 2.6], [0.025, 0.025, 0.08 + 0.12 * rnd(i, gen, 152)], rnd(i, gen, 153) < 0.4 ? L.spot2 : L.partGlow);
        } else {
          const rise = (rnd(i, 5, 3) * 10 + s * (1.6 + rnd(i, 6, 3) * 1.8)) % 10, a = rnd(i, 1, 3) * Math.PI * 2, r = 1.5 + rnd(i, 2, 3) * 6;
          this.water.set(n++, [eye.x + Math.cos(a) * r, eye.y - 5 + rise, eye.z + Math.sin(a) * r], 0.05 + rnd(i, 4, 3) * 0.06, L.spot2);
        }
      }
      // the light up there: a bright disc that grows as you climb (and as you push)
      const top = A.y + 52;
      this.sky.visible = true;
      this.sky.position.set(eye.x, Math.max(eye.y + 14, top), eye.z - 6);
      this.sky.scale.setScalar(4 + 9 * fx.rise + 6 * this.light);
      (this.sky.material as THREE.MeshBasicMaterial).color.setScalar(1.2 + 1.6 * this.light + fx.rise);
      (this.sky.material as THREE.MeshBasicMaterial).opacity = clamp01(fx.flood) * (0.25 + 0.35 * fx.rise + 0.25 * this.light);
    } else this.sky.visible = false;
    this.water.commit(n);
  }

  dispose(): void {
    const t = this.view.terrain.root;
    t.scale.set(1, 1, 1); t.position.set(0, 0, 0);
    this.view.stage.camera.remove(this.rig);
    this.view.stage.scene.remove(this.root);
  }
}
