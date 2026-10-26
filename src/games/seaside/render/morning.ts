// Chapter 1 in the voxel world (#189): poses the WorldView from the director's shot (render/morningShots.ts), blends the
// camera between shots, and drives the Morning's set-piece props: the rod (fishing stops and the Big One), the big
// white bird over the water, the gulls on the pier, the Big One's shadow, the splash, bubbles, the ring of teeth, the
// far lighthouse, the title fog and the water going glassy, then dark.
import * as THREE from 'three';
import { disposeSet } from './dispose';
import type { SeasideSnapshot } from '../sim/types';
import { addGrid } from '../stills/stage';
import { VoxelGrid } from '../voxel/grid';
import { definePalette } from '../voxel/palette';
import { hash2 } from '../voxel/noise';
import { coastRoute, edgeD, pierGeom, roadX, SEA_LEVEL } from '../world/coastLayout';
import { groundAt } from '../world/coast';
import { FishingRig } from './fishingRig';
import { bigOneView, morningShot, type MorningShot, type V3 } from './morningShots';
import { EVENING } from './flightShots';
import { STORY } from '../sim/story';

const BIG_PLAN_S = STORY.find((s) => s.id === 'bigOne')!.planS;
import type { WorldView } from './worldView';

const PAL = definePalette({
  white: 0xf7f6f1, white2: 0xe9e8e2, grey: 0x9aa3ab, dark: 0x2c2f33, beak: 0xf0b72c, red: 0xc8382c, glass: 0x34495a, lamp: 0xfff2c0, stone: 0xd9d3c4,
});
const P = PAL.idx;
const NONE = { cast: false, receive: false };
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const ease = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const mixHex = (a: number, b: number, t: number) => new THREE.Color(a).lerp(new THREE.Color(b), clamp01(t)).getHex();

/** A big white bird, wings spread (the angel's shape, seen once, far out). Faces +x. */
function buildBird(): VoxelGrid {
  const g = new VoxelGrid(0.18);
  g.wellipsoid([0, 0, 0], [1.1, 0.32, 0.3], P.white);
  g.wellipsoid([1.05, 0.12, 0], [0.32, 0.26, 0.24], P.white);
  g.wbox([1.32, 0.06, -0.06], [1.62, 0.14, 0.06], P.beak);
  for (const side of [-1, 1]) for (let i = 0; i < 18; i++) {
    const k = i / 17, z = side * (0.25 + k * 3.4), x = 0.25 - k * 0.7, w = 0.85 - k * 0.45;
    g.wbox([x - w, 0.02 + k * 0.35, Math.min(z, z + side * 0.2)], [x + 0.15, 0.16 + k * 0.35, Math.max(z, z + side * 0.2)], k > 0.82 ? P.grey : P.white);
  }
  g.wbox([-1.6, -0.05, -0.35], [-0.9, 0.08, 0.35], P.white2);
  return g;
}

/** A gull: sitting (wings folded) or flying (wings up). Faces +x. */
function buildGull(flying: boolean): VoxelGrid {
  const g = new VoxelGrid(0.025);
  g.wellipsoid([0, 0.12, 0], [0.17, 0.07, 0.07], P.white);
  g.wellipsoid([0.15, 0.18, 0], [0.06, 0.055, 0.05], P.white);
  g.wbox([0.2, 0.17, -0.012], [0.26, 0.19, 0.012], P.beak);
  g.wbox([-0.24, 0.1, -0.04], [-0.12, 0.14, 0.04], P.grey);
  if (flying) for (const side of [-1, 1]) g.wsegment([0, 0.15, side * 0.05], [-0.05, 0.3, side * 0.42], 0.03, P.grey);
  else { g.wellipsoid([-0.03, 0.15, 0], [0.13, 0.05, 0.08], P.grey); g.wbox([-0.02, 0, -0.02], [0.02, 0.06, 0.02], P.beak); }
  return g;
}

/** A white lighthouse with a red band and a black lantern room, and its keeper's house. Origin at the base. */
function buildLighthouse(): VoxelGrid {
  const g = new VoxelGrid(0.35);
  for (let y = 0; y < 17; y += 0.35) {
    const r = lerp(2.4, 1.6, y / 17);
    g.wellipsoid([0, y, 0], [r, 0.2, r], y > 11 && y < 13 ? P.red : P.white);
  }
  g.wellipsoid([0, 17.2, 0], [2.1, 0.25, 2.1], P.dark);
  g.wellipsoid([0, 18.3, 0], [1.3, 1.0, 1.3], P.glass);
  g.wellipsoid([0, 18.4, 0], [0.6, 0.6, 0.6], P.lamp);
  g.wellipsoid([0, 19.6, 0], [1.4, 0.7, 1.4], P.red);
  g.wbox([3, 0, -3], [9, 3.4, 3], P.stone);
  g.wbox([2.6, 3.4, -3.4], [9.4, 4.2, 3.4], P.red);
  return g;
}

interface Pose { eye: V3; target: V3 }

/** A soft-edged ellipse (alpha map) for the Big One's shadow. */
function softEllipse(): THREE.Texture {
  if (typeof document === 'undefined') return new THREE.Texture();
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d')!, grad = g.createRadialGradient(32, 32, 4, 32, 32, 32);
  grad.addColorStop(0, '#fff'); grad.addColorStop(0.55, '#ddd'); grad.addColorStop(1, '#000');
  g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

export class MorningSet {
  readonly rig: FishingRig;
  private root = new THREE.Group();
  private bird = new THREE.Group();
  private gulls: Array<{ g: THREE.Group; sit: THREE.Group; fly: THREE.Group; at: THREE.Vector3; dir: THREE.Vector3; lag: number }> = [];
  private shadow: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private shadowG = new THREE.Group();
  private lighthouse = new THREE.Group();
  private splash: THREE.InstancedMesh;
  private bubbles: THREE.InstancedMesh;
  private mouth = new THREE.Group();
  private teeth: THREE.Mesh[] = [];
  private gumMat = new THREE.MeshBasicMaterial({ color: 0x14040a, fog: false, side: THREE.DoubleSide });
  private gum: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  private splashAt: THREE.Vector3 | null = null;
  private last: { id: string; pose: Pose } | null = null;
  private blend: { from: Pose; t0: number; dur: number } | null = null;
  private m4 = new THREE.Matrix4(); private q = new THREE.Quaternion(); private v3 = new THREE.Vector3();
  /** Title fog thinned by pedalling (0..1), on top of the scene's own clearing. */
  private clearing = 0;

  constructor(private view: WorldView) {
    const st = view.stage;
    this.rig = new FishingRig(st);
    addGrid(st, 'big bird', buildBird(), { palette: PAL.linear, jitter: 0.02 }, this.bird, NONE);
    this.bird.visible = false; this.bird.scale.setScalar(2.6); // ~20 m across: big, even far out
    const sit = buildGull(false), fly = buildGull(true), r = coastRoute(), Pg = pierGeom();
    for (let i = 0; i < 7; i++) {
      const g = new THREE.Group(), s = new THREE.Group(), f = new THREE.Group();
      addGrid(st, `gull ${i}`, sit, { palette: PAL.linear, jitter: 0.02 }, s, NONE);
      addGrid(st, `gull ${i} flying`, fly, { palette: PAL.linear, jitter: 0.02 }, f, NONE);
      g.add(s, f);
      const side = i % 2 ? 6.08 : -6.08, back = 1 + Math.floor(i / 2) * 5 + (i % 3) * 2.5, p = r.offset(Pg.end - back, side);
      const at = new THREE.Vector3(p.x, Pg.y + 1.12, p.z);
      g.position.copy(at); g.rotation.y = hash2(i, 3, 1) * Math.PI * 2;
      const a = (i / 7) * Math.PI * 2;
      this.gulls.push({ g, sit: s, fly: f, at, dir: new THREE.Vector3(Math.cos(a) * 0.6 + 0.7, 0, Math.sin(a) * 0.8).normalize(), lag: hash2(i, 9, 2) * 0.35 });
      this.root.add(g);
    }
    this.shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0x05202c, transparent: true, opacity: 0, depthWrite: false, alphaMap: softEllipse() }));
    this.shadow.rotation.x = -Math.PI / 2; this.shadow.scale.set(170, 34, 1); this.shadow.renderOrder = 2;
    this.shadowG.add(this.shadow);
    // the lighthouse on the point past the harbour
    const lz = -7790, lx = roadX(lz) + edgeD(lz) - 14;
    addGrid(st, 'lighthouse', buildLighthouse(), { palette: PAL.linear, jitter: 0.03 }, this.lighthouse, { cast: false, receive: false });
    this.lighthouse.position.set(lx, groundAt(lx, lz) - 0.5, lz);
    this.splash = new THREE.InstancedMesh(new THREE.BoxGeometry(0.22, 0.22, 0.22), new THREE.MeshLambertMaterial({ color: 0xf4fbff }), 90);
    this.splash.frustumCulled = false; this.splash.count = 0;
    this.bubbles = new THREE.InstancedMesh(new THREE.BoxGeometry(0.07, 0.07, 0.07), new THREE.MeshBasicMaterial({ color: 0xdff6ff, transparent: true, opacity: 0.55, fog: false }), 140);
    this.bubbles.frustumCulled = false; this.bubbles.count = 0;
    // the mouth: pale pillars on a ring in front of the eye, black beyond it; the ring closes
    const toothMat = new THREE.MeshLambertMaterial({ color: 0xefeadc, emissive: 0x5a554a, fog: false, flatShading: true });
    for (let i = 0; i < 22; i++) {
      const m = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1, 4), toothMat);
      this.teeth.push(m); this.mouth.add(m);
    }
    this.gum = new THREE.Mesh(new THREE.RingGeometry(1, 400, 48), this.gumMat);
    this.gum.position.z = -0.2; this.mouth.add(this.gum);
    this.mouth.visible = false;
    st.camera.add(this.mouth);
    this.root.add(this.bird, this.shadowG, this.lighthouse, this.splash, this.bubbles);
    st.scene.add(this.root);
  }

  /** Pose and render one frame of a Morning scene. `t` = story clock (s), `cadence` from the bike. Returns the shot. */
  frame(snap: SeasideSnapshot, t: number, dt: number, cadence: number): MorningShot | null {
    const shot = morningShot(snap);
    if (!shot) return null;
    const fx = shot.fx;
    // camera: ease from the last shot when the scene changes (a cut when the jump is big)
    let pose: Pose = { eye: shot.eye, target: shot.target };
    if (this.last && this.last.id !== snap.sceneId) {
      const jump = Math.hypot(pose.eye.x - this.last.pose.eye.x, pose.eye.z - this.last.pose.eye.z);
      this.blend = jump < 400 && snap.sceneId !== 'bigOne' ? { from: this.last.pose, t0: t, dur: 2.4 } : null;
    }
    if (this.blend) {
      const k = ease((t - this.blend.t0) / this.blend.dur), f = this.blend.from;
      if (k >= 1) this.blend = null;
      else pose = { eye: lerpV(f.eye, pose.eye, k), target: lerpV(f.target, pose.target, k) };
    }
    this.last = { id: snap.sceneId, pose };
    // atmosphere: the title's marine layer (pedalling thins it), under water (green → blue → black)
    if (snap.sceneId === 'title') this.clearing = clamp01(this.clearing + dt * (cadence > 40 ? 0.02 : -0.01));
    const fog = clamp01(fx.fog * (1 - this.clearing));
    const sky = this.view.world.sky;
    let atmos: Parameters<WorldView['frame']>[0]['atmos'];
    if (fx.under > 0) {
      const deep = mixHex(0x1f8a86, 0x0a3562, fx.dark), col = mixHex(deep, 0x000000, fx.dark ** 2 * 0.9);
      const u = fx.under;
      atmos = { fog: mixHex(sky.fog, col, u), density: lerp(sky.fogDensity, 0.05, u), zenith: mixHex(sky.zenith, col, u), horizon: mixHex(sky.horizon, col, u), sunI: lerp(sky.sunI, 0.6 * (1 - fx.dark), u), hemiI: lerp(sky.hemiI, 0.5 * (1 - fx.dark * 0.8), u) };
    } else if (snap.sceneId === 'sunset') atmos = { ...EVENING }; // the wings set you down in the evening (#195 dresses it)
    else if (fog > 0) {
      const f = fog ** 1.4, white = 0xe7ecec;
      atmos = { fog: mixHex(sky.fog, white, fog), density: lerp(sky.fogDensity, 0.05, f), zenith: mixHex(sky.zenith, white, fog), horizon: mixHex(sky.horizon, white, fog), ink: 1 - f };
    }
    this.props(shot, t);
    this.view.frame({ t, routeS: shot.s, speed: shot.speed, look: snap.look.name, dream: snap.look.dream, eye: pose.eye, aim: pose.target,
      bars: shot.bars, cadence: cadence || 86, atmos, calm: fx.calm });
    // the rod is posed after the camera moves
    const fishing = shot.rod === 'fish' ? snap.fishing : shot.rod === 'bigOne' ? bigOneView(snap.scene.progress * BIG_PLAN_S, snap.pull) : null;
    this.rig.update(fishing, t, shot.place ?? { waterY: SEA_LEVEL });
    return shot;
  }

  private props(shot: MorningShot, t: number) {
    const fx = shot.fx;
    // the big bird: far out over the water, gliding west, once
    this.bird.visible = fx.bird !== null;
    if (fx.bird !== null) {
      const u = fx.bird, e = shot.eye, fwd = new THREE.Vector3(shot.target.x - e.x, 0, shot.target.z - e.z).normalize();
      const left = new THREE.Vector3(fwd.z, 0, -fwd.x);
      this.bird.position.set(e.x, e.y + 34 + 12 * u + Math.sin(t * 0.9) * 0.6, e.z).addScaledVector(fwd, 280 + 30 * u).addScaledVector(left, 20 + 230 * u);
      this.bird.rotation.set(Math.sin(t * 0.7) * 0.08, Math.atan2(-left.z, left.x), 0);
    }
    // gulls on the end posts; they all leave at once
    const gs = fx.gulls;
    for (const g of this.gulls) {
      g.g.visible = gs !== null && gs < 1;
      if (gs === null) continue;
      const k = clamp01((gs - g.lag) / (1 - g.lag)), flap = Math.sin(t * 14 + g.lag * 40) > 0;
      g.sit.visible = k <= 0; g.fly.visible = k > 0;
      g.fly.scale.y = flap ? 1 : -0.6;
      g.g.position.copy(g.at).addScaledVector(g.dir, 30 * k * k).add(this.v3.set(0, 14 * k + Math.sin(k * 9) * 0.4, 0));
      if (k > 0) g.g.rotation.y = Math.atan2(-g.dir.z, g.dir.x);
    }
    // the shadow under the glassy water: slides in from the open sea until it is under the pier
    this.shadowG.visible = fx.shadow !== null && fx.under < 0.5;
    if (fx.shadow !== null) {
      const r = coastRoute(), Pg = pierGeom(), tg = r.tangent(Pg.end), along = lerp(240, 40, fx.shadow); // its tail ends under the pier
      const p = r.offset(Pg.end, 0);
      this.shadowG.position.set(p.x + tg.x * along, SEA_LEVEL + 0.06, p.z + tg.z * along);
      this.shadowG.rotation.y = Math.atan2(-tg.z, tg.x);
      this.shadow.material.opacity = 0.75 * clamp01(fx.shadow * 3) * (0.9 + 0.1 * Math.sin(t * 0.8));
    }
    // splash: one burst where the camera hits the water
    if (fx.splash !== null && fx.splash < 2) {
      if (!this.splashAt) this.splashAt = new THREE.Vector3(shot.eye.x, SEA_LEVEL, shot.eye.z);
      let n = 0;
      for (let i = 0; i < 90; i++) {
        const a = i * 2.39996, sp = 2.5 + hash2(i, 1, 7) * 5, up = 5 + hash2(i, 2, 7) * 9, age = fx.splash;
        this.v3.set(this.splashAt.x + Math.cos(a) * sp * age, SEA_LEVEL + up * age - 4.9 * age * age, this.splashAt.z + Math.sin(a) * sp * age);
        if (this.v3.y < SEA_LEVEL - 0.1) continue;
        this.m4.compose(this.v3, this.q, new THREE.Vector3(1, 1, 1).multiplyScalar(1.2 - age * 0.5));
        this.splash.setMatrixAt(n++, this.m4);
      }
      this.splash.count = n; this.splash.instanceMatrix.needsUpdate = true;
    } else { this.splash.count = 0; if (fx.splash === null) this.splashAt = null; }
    // bubbles streaming up past the eye
    if (fx.under > 0.5 && fx.black < 1) {
      const e = shot.eye;
      for (let i = 0; i < 140; i++) {
        const rise = (hash2(i, 5, 3) * 10 + t * (1.4 + hash2(i, 6, 3) * 1.6)) % 10;
        // a shell 2.5–9 m around the eye (never in its face)
        const a = hash2(i, 1, 3) * Math.PI * 2, r = 2.5 + hash2(i, 2, 3) * 6.5;
        this.v3.set(e.x + Math.cos(a) * r, e.y - 5 + rise, e.z + Math.sin(a) * r);
        this.m4.compose(this.v3, this.q, new THREE.Vector3(1, 1, 1).multiplyScalar(0.5 + hash2(i, 4, 3) * 0.8));
        this.bubbles.setMatrixAt(i, this.m4);
      }
      this.bubbles.count = 140; this.bubbles.instanceMatrix.needsUpdate = true;
    } else this.bubbles.count = 0;
    // the mouth closing around the frame
    this.mouth.visible = fx.mouth > 0;
    if (fx.mouth > 0) {
      const R = lerp(26, 0.6, ease(fx.mouth)), z = -16;
      this.mouth.position.set(0, 0, z);
      this.gum.scale.set(Math.max(0.01, R * 1.25 + 1), Math.max(0.01, R * 0.8 + 1), 1); // an oval jaw
      this.teeth.forEach((m, i) => {
        const a = (i / this.teeth.length) * Math.PI * 2 + 0.14, len = 3.2 + hash2(i, 7, 5) * 2.6;
        m.position.set(Math.cos(a) * (R * 1.25 + 0.4), Math.sin(a) * (R * 0.8 + 0.4), 0);
        m.rotation.set(0, 0, a + Math.PI / 2); // the tip points at the middle
        m.scale.set(1.6, len, 1.6);
      });
    }
  }

  dispose(): void {
    this.rig.dispose();
    disposeSet(this.mouth, this.root);
  }
}

const lerpV = (a: V3, b: V3, k: number): V3 => ({ x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k), z: lerp(a.z, b.z, k) });
