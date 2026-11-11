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
import { CH1, coastRoute, edgeD, pierGeom, roadX, SEA_LEVEL } from '../world/coastLayout';
import { groundAt } from '../world/coast';
import { FishingRig } from './fishingRig';
import { bigOneView, morningShot, shopDoor, type MorningShot, type V3 } from './morningShots';
import { textAt, textWidth } from '../world/coastBuild';
import { EVENING } from './flightShots';
import { STORY } from '../sim/story';
import { CAR_LANE, Traffic } from './traffic';
import { ALBATROSS, Flier, GULL, glideFlap, gullFlap } from './birds';
import { buildCar, CARS_PAL } from './cars';

/** Scenes with cars on the highway (the shop outings fish at the turnout too). */
const TRAFFIC_SCENES = new Set(['highway', 'turnout1', 'rollers', 'toPier', 'shop1', 'sunset']);
/** Scenes with gulls crossing the road. */
const GULL_SCENES = new Set(['title', 'highway', 'turnout1', 'rollers', 'toPier', 'shop1', 'sunset']);
const BIG_PLAN_S = STORY.find((s) => s.id === 'bigOne')!.planS;
import type { WorldView } from './worldView';

export const MORNING_PAL = definePalette({
  white: 0xf7f6f1, white2: 0xe9e8e2, grey: 0x9aa3ab, dark: 0x2c2f33, beak: 0xf0b72c, red: 0xc8382c, glass: 0x34495a, lamp: 0xfff2c0, stone: 0xd9d3c4,
});
const PAL = MORNING_PAL, P = PAL.idx;
const NONE = { cast: false, receive: false };
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const ease = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const mixHex = (a: number, b: number, t: number) => new THREE.Color(a).lerp(new THREE.Color(b), clamp01(t)).getHex();

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

/** The card on Lou's door in the evening: GONE / FISHING in red on a pale board, hung from a nail. Faces +z, centred. */
function buildGoneFishing(): VoxelGrid {
  const g = new VoxelGrid(0.03), cell = 0.06, W = 2.8, H = 1.24;
  for (let x = -W / 2; x < W / 2; x += g.size) for (let y = -H / 2; y < H / 2; y += g.size) {
    const edge = Math.abs(x) > W / 2 - 0.09 || Math.abs(y) > H / 2 - 0.09;
    let ink = false;
    for (const [line, v0] of [['GONE', 0.09], ['FISHING', -0.5]] as const) {
      const u = x + textWidth(line, cell) / 2;
      if (textAt(line, u, y - v0, cell)) ink = true;
    }
    g.wbox([x, y, -0.015], [x + g.size, y + g.size, 0.03], ink || edge ? P.red : P.stone);
  }
  g.wsegment([-W / 2 + 0.12, H / 2, 0], [0, H / 2 + 0.3, 0], 0.012, P.dark);
  g.wsegment([W / 2 - 0.12, H / 2, 0], [0, H / 2 + 0.3, 0], 0.012, P.dark);
  return g;
}

interface Pose { eye: V3; target: V3; heading: V3 }

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
  private bird: Flier;
  private flock: Flier[] = [];
  private gulls: Array<{ g: THREE.Group; sit: THREE.Group; fly: THREE.Group; at: THREE.Vector3; dir: THREE.Vector3; lag: number }> = [];
  private shadow: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private shadowG = new THREE.Group();
  private lighthouse = new THREE.Group();
  private gone = new THREE.Group();
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
  private traffic = new Traffic();
  private carTemplates = new Map<string, THREE.Group>();
  private carMeshes = new Map<number, THREE.Group>();
  private carRoot = new THREE.Group();
  /** Title fog thinned by pedalling (0..1), on top of the scene's own clearing. */
  private clearing = 0;
  /** The title's focus blur this frame (0..1), after pedalling. */ blur = 0;

  constructor(private view: WorldView) {
    const st = view.stage;
    this.rig = new FishingRig(st);
    this.bird = new Flier(st, 'big bird', ALBATROSS);
    this.bird.group.visible = false; this.bird.group.scale.setScalar(4.2); // ~30 m across: huge, even far out
    const gulls = new Map();
    for (let i = 0; i < 6; i++) { const f = new Flier(st, `gull ${i}`, GULL, gulls); f.group.visible = false; this.flock.push(f); this.root.add(f.group); }
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
    // the evening: Lou's shop shut, a card on the door
    // unlit, so it reads in the shade of the evening (the shop's a silhouette against the sun)
    addGrid(st, 'gone fishing', buildGoneFishing(), { palette: PAL.linear.map((c) => c * 0.8), jitter: 0.02 }, this.gone, NONE, new THREE.MeshBasicMaterial({ vertexColors: true }));
    const door = shopDoor(), tn = r.tangent(CH1.shop);
    this.gone.position.set(door.x, door.y, door.z); this.gone.rotation.y = Math.atan2(-tn.z, tn.x); // facing the road
    this.gone.visible = false;
    this.root.add(this.carRoot, this.bird.group, this.shadowG, this.lighthouse, this.splash, this.bubbles, this.gone);
    st.scene.add(this.root);
  }

  /** Pose and render one frame of a Morning scene. `t` = story clock (s), `cadence` from the bike. Returns the shot. */
  frame(snap: SeasideSnapshot, t: number, dt: number, cadence: number): MorningShot | null {
    const shot = morningShot(snap);
    if (!shot) return null;
    const fx = shot.fx;
    // camera: ease from the last shot when the scene changes (a cut when the jump is big)
    let pose: Pose = { eye: shot.eye, target: shot.target, heading: shot.heading };
    if (this.last && this.last.id !== snap.sceneId) {
      const jump = Math.hypot(pose.eye.x - this.last.pose.eye.x, pose.eye.z - this.last.pose.eye.z);
      this.blend = jump < 400 && snap.sceneId !== 'bigOne' ? { from: this.last.pose, t0: t, dur: 2.4 } : null;
    }
    if (this.blend) {
      const k = ease((t - this.blend.t0) / this.blend.dur), f = this.blend.from;
      if (k >= 1) this.blend = null;
      else pose = { eye: lerpV(f.eye, pose.eye, k), target: lerpV(f.target, pose.target, k), heading: lerpV(f.heading, pose.heading, k) };
    }
    this.last = { id: snap.sceneId, pose };
    // atmosphere: the title's marine layer and blur (pedalling clears them sooner), under water (green → blue → black)
    if (snap.sceneId === 'title') this.clearing = clamp01(this.clearing + dt * (cadence > 40 ? 0.02 : -0.01));
    const fog = clamp01(fx.fog * (1 - this.clearing));
    this.blur = clamp01(fx.blur * (1 - this.clearing));
    const sky = this.view.world.sky;
    let atmos: Parameters<WorldView['frame']>[0]['atmos'];
    if (fx.under > 0) {
      const deep = mixHex(0x1f8a86, 0x0a3562, fx.dark), col = mixHex(deep, 0x000000, fx.dark ** 2 * 0.9);
      const u = fx.under;
      atmos = { fog: mixHex(sky.fog, col, u), density: lerp(sky.fogDensity, 0.05, u), zenith: mixHex(sky.zenith, col, u), horizon: mixHex(sky.horizon, col, u), sunI: lerp(sky.sunI, 0.6 * (1 - fx.dark), u), hemiI: lerp(sky.hemiI, 0.5 * (1 - fx.dark * 0.8), u) };
    } else if (snap.sceneId === 'sunset') atmos = { ...EVENING }; // the wings set you down in the evening, the sun low over the sea
    else if (fog > 0) {
      const f = fog ** 1.4, white = 0xe7ecec;
      atmos = { fog: mixHex(sky.fog, white, fog), density: lerp(sky.fogDensity, 0.05, f), zenith: mixHex(sky.zenith, white, fog), horizon: mixHex(sky.horizon, white, fog), ink: 1 - f };
    }
    this.props(shot, t);
    this.gullsFlying(snap.sceneId, shot, t);
    this.cars(snap.sceneId, shot, pose, t, dt);
    this.gone.visible = snap.sceneId === 'sunset';
    this.view.frame({ t, routeS: shot.s, speed: shot.speed, look: snap.look.name, dream: snap.look.dream, eye: pose.eye, aim: pose.target,
      heading: pose.heading, bars: shot.bars, cadence: cadence || 86, atmos, calm: fx.calm });
    // the rod is posed after the camera moves
    const fishing = shot.rod === 'fish' ? snap.fishing : shot.rod === 'bigOne' ? bigOneView(snap.scene.progress * BIG_PLAN_S, snap.pull) : null;
    this.rig.update(fishing, t, shot.place ?? { waterY: SEA_LEVEL });
    return shot;
  }

  /**
   * Gulls along the coast: every so often a few cross the road ahead, flapping, from the sea inland or back. While the
   * big bird is up they fly out toward it, so you can see how small a gull is next to it.
   */
  private gullsFlying(id: string, shot: MorningShot, t: number) {
    const on = GULL_SCENES.has(id) && shot.fx.under === 0 && (id !== 'title' || shot.fx.lids > 0.6);
    const e = shot.eye, fwd = this.v3.set(shot.heading.x, 0, shot.heading.z).normalize().clone(), left = new THREE.Vector3(fwd.z, 0, -fwd.x);
    const big = shot.fx.bird, cycle = 23, k = Math.floor(t / cycle), local = t - k * cycle, life = 13;
    const h = (j: number) => hash2(k, j, 31);
    const show = on && (big !== null || (local < life && h(1) < 0.75));
    this.flock.forEach((f, i) => {
      f.group.visible = show && i < (big !== null ? 6 : 3 + Math.floor(h(2) * 3));
      if (!f.group.visible) return;
      const row = Math.floor((i + 1) / 2), side = i % 2 ? 1 : -1, jitter = hash2(i, k, 33);
      let ahead: number, across: number, up: number, dir: THREE.Vector3;
      if (big !== null) { // out over the water ahead, on the same line as the big bird but much nearer
        ahead = 42 + row * 5 + jitter * 6; across = -6 + 30 * big + side * row * 3; up = 12 + 4 * big + jitter * 3;
        dir = left.clone().multiplyScalar(0.75).addScaledVector(fwd, -0.66).normalize();
      } else {
        const way = h(3) < 0.5 ? 1 : -1, u = local / life; // crossing the road ahead, sea side to inland or back
        ahead = 28 + h(4) * 40 + row * 4; across = way * (55 - 110 * u) + side * row * 2.5; up = 5 + h(5) * 9 + jitter * 2;
        dir = left.clone().multiplyScalar(-way).addScaledVector(fwd, 0.8).normalize(); // angled away: wings broadside
      }
      f.group.position.set(e.x, e.y + up + Math.sin(t * 2 + i) * 0.3, e.z).addScaledVector(fwd, ahead).addScaledVector(left, across);
      f.group.rotation.set(0, 0, 0); f.group.rotateY(Math.atan2(-dir.z, dir.x)); f.group.rotateX(Math.sin(t * 1.3 + i) * 0.25);
      f.flap(gullFlap(t, i + k));
    });
  }

  /** Highway traffic: cars coming the other way and overtaking, on the highway scenes (and while you fish at the turnout). */
  private cars(id: string, shot: MorningShot, pose: Pose, t: number, dt: number) {
    const on = (id === 'title' ? shot.fx.lids > 0.5 : TRAFFIC_SCENES.has(id)) && shot.fx.under === 0;
    const r = coastRoute(), lat = r.nearest(pose.eye.x, pose.eye.z, 60)?.d ?? 4.2;
    const cars = this.traffic.step(t, dt, shot.s, lat, on), live = new Set<number>();
    for (const c of cars) {
      live.add(c.id);
      let m = this.carMeshes.get(c.id);
      if (!m) {
        const key = `${c.model}:${c.colour}`;
        let tpl = this.carTemplates.get(key);
        if (!tpl) { tpl = new THREE.Group(); addGrid(this.view.stage, `car ${key}`, buildCar(c.model, c.colour), { palette: CARS_PAL.linear, jitter: 0.03 }, tpl, { cast: true, receive: false }); this.carTemplates.set(key, tpl); }
        m = tpl.clone(); this.carMeshes.set(c.id, m); this.carRoot.add(m);
      }
      const p = r.offset(Math.max(0, Math.min(r.length, c.s)), c.dir > 0 ? CAR_LANE.with : CAR_LANE.toward), tg = r.tangent(Math.max(0, Math.min(r.length, c.s)));
      m.position.set(p.x, p.y - 0.12, p.z);
      m.rotation.y = Math.atan2(tg.x * c.dir, tg.z * c.dir);
    }
    for (const [id, m] of this.carMeshes) if (!live.has(id)) { this.carRoot.remove(m); this.carMeshes.delete(id); }
  }

  private props(shot: MorningShot, t: number) {
    const fx = shot.fx;
    // the big bird: far out over the water, gliding west, once
    const bird = this.bird.group;
    bird.visible = fx.bird !== null;
    if (fx.bird !== null) {
      // banked toward you: from below, the whole spread of the wings shows
      const at = fx.birdAt!, dir = new THREE.Vector3(fx.birdDir!.x, 0, fx.birdDir!.z).normalize();
      bird.position.set(at.x, at.y + Math.sin(t * 0.9) * 0.6, at.z);
      bird.rotation.set(0, 0, 0); bird.rotateY(Math.atan2(-dir.z, dir.x)); bird.rotateX(-0.32 + Math.sin(t * 0.7) * 0.08);
      this.bird.flap(glideFlap(t));
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
    disposeSet(this.mouth, this.root, ...this.carTemplates.values());
  }
}

const lerpV = (a: V3, b: V3, k: number): V3 => ({ x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k), z: lerp(a.z, b.z, k) });
