// The production first-person view of a streamed voxel world: stage (sky, fog, lights), TerrainLOD streaming along the
// route, the rider's bars, look blending + dream dial, post, the chunky-pixel setting / automatic perf fallback, and
// HUD insets. The game renderer drives it with frame({ t, routeS, speed, look, dream }) every animation frame.
import * as THREE from 'three';
import type { Insets } from '../../../contracts';
import { NO_INSETS } from '../../../contracts';
import { addGrid, aimSun, makeStage, type Stage } from '../stills/stage';
import type { WorldDef } from '../world/def';
import { TerrainLOD, type TerrainLODOpts } from '../world/terrainLOD';
import { buildBars, KIT } from '../world/rider';
import { applyLookState, LookDirector } from './looks';
import { PerfGovernor, type PixelSetting } from './perf';
import { PostFX } from './post';
import { rowToCameraY, viewLayout } from './viewLayout';

export interface WorldViewOpts {
  /** Drawing-buffer pixels per CSS pixel (default min(devicePixelRatio, 2)). */ pixelRatio?: number;
  pixel?: PixelSetting;
  workers?: number;
  stream?: TerrainLODOpts['stream'];
  /** Keep the drawing buffer (screenshots, capture scripts). */ preserve?: boolean;
  /** Dev builds: element that receives the fps / triangles / draw calls overlay text. */ overlay?: HTMLElement | null;
}

export interface WorldFrame {
  /** Story time (s): water, bob, look blends. */ t: number;
  routeS: number; speed: number;
  look?: string; dream?: number;
  /** Lateral offset from the route centre (m, + right); default the world's lane. */ lateral?: number;
  cadence?: number;
  /** Look at this world point instead of down the route (fishing stops look out to sea). */
  aim?: { x: number; y: number; z: number };
  /** Show the bars (default true; hidden while the rod is in hand). */
  bars?: boolean;
}

const RIG = { lane: 0, gaze: { ahead: 30, d: 0, dy: -0.5 } };

export class WorldView {
  readonly stage: Stage;
  terrain: TerrainLOD;
  readonly director: LookDirector;
  readonly governor: PerfGovernor;
  private post: PostFX;
  private bars = new THREE.Group();
  private uTime = { value: 0 };
  private extras: THREE.Object3D[] = [];
  private insets: Insets = NO_INSETS;
  private W = 1; private H = 1; private ratio: number;
  private lastT = -1; private lastReal = 0; private baseBarsY = -0.31;
  private overlayAcc = { n: 0, ms: 0, worst: 0, at: 0, text: '' };

  constructor(canvas: HTMLCanvasElement, public world: WorldDef, private o: WorldViewOpts = {}) {
    this.ratio = o.pixelRatio ?? Math.min(globalThis.devicePixelRatio || 1, 2);
    const sk = world.sky;
    this.stage = makeStage(canvas, 1, 1, { ...sk, sunDir: new THREE.Vector3(...sk.sunDir) }, { preserve: o.preserve ?? false, shadowMap: 2048 });
    this.stage.renderer.setPixelRatio(1);
    this.stage.renderer.info.autoReset = false; // count the whole frame (scene + post passes) for the overlay
    this.post = new PostFX(this.stage.renderer, 1, 1);
    this.director = new LookDirector(world.look);
    this.governor = new PerfGovernor({}, o.pixel === 'on' ? 2 : 0);
    addGrid(this.stage, 'bars', buildBars(), { palette: KIT.linear, jitter: 0.04 }, this.bars, { cast: false, receive: false });
    this.stage.camera.add(this.bars);
    this.terrain = this.makeTerrain();
    this.setupWorld();
  }

  private makeTerrain() {
    const t = new TerrainLOD(this.world, { workers: this.o.workers, water: { time: this.uTime, amp: this.world.waterAmp ?? 0.09 }, stream: this.o.stream });
    this.stage.scene.add(t.root);
    return t;
  }

  /** Lights, backdrop and fog for the current world (called on world switches). */
  private setupWorld() {
    const st = this.stage, sk = this.world.sky;
    this.extras.forEach((e) => st.scene.remove(e)); this.extras = [];
    (st.scene.fog as THREE.FogExp2).color.set(sk.fog); (st.scene.fog as THREE.FogExp2).density = sk.fogDensity;
    st.sun.color.set(sk.sunColor); st.sun.intensity = sk.sunI; st.sun.castShadow = !!sk.shadows;
    st.renderer.shadowMap.enabled = !!sk.shadows;
    st.scene.traverse((o) => { if ((o as THREE.HemisphereLight).isHemisphereLight) { const h = o as THREE.HemisphereLight; h.color.set(sk.hemiSky); h.groundColor.set(sk.hemiGround); h.intensity = sk.hemiI; } });
    st.scene.traverse((o) => { const m = (o as THREE.Mesh).material as THREE.ShaderMaterial | undefined; if (m?.uniforms?.zen) { m.uniforms.zen.value.set(sk.zenith); m.uniforms.hor.value.set(sk.horizon); m.uniforms.sun.value.set(...sk.sunDir).normalize(); m.uniforms.sunC.value.set(sk.sunColor); } });
    if (sk.plane) { // open sea beyond the voxels: a backdrop drawn first that never occludes (a 30 km quad z-fights otherwise)
      const pl = new THREE.Mesh(new THREE.PlaneGeometry(30000, 30000), new THREE.MeshLambertMaterial({ color: new THREE.Color(sk.plane.color), depthWrite: false }));
      pl.rotation.x = -Math.PI / 2; pl.position.y = sk.plane.y; pl.renderOrder = -0.5;
      this.extras.push(pl);
    }
    for (const l of sk.lights ?? []) { const pl = new THREE.PointLight(l.color, l.intensity, l.dist, 1.6); pl.position.set(...l.p); this.extras.push(pl); }
    this.extras.forEach((e) => st.scene.add(e));
    this.director.set(this.world.look); this.director.snap();
  }

  /** Switch worlds (scene transitions). The old world's tiles and workers are dropped. */
  setWorld(world: WorldDef): void {
    if (world === this.world) return;
    this.stage.scene.remove(this.terrain.root); this.terrain.dispose();
    this.world = world; this.terrain = this.makeTerrain(); this.setupWorld();
  }

  setInsets(insets: Insets): void { this.insets = insets; this.applyView(); }

  /** CSS size of the canvas. */
  resize(w: number, h: number): void {
    this.W = Math.max(1, Math.round(w * this.ratio)); this.H = Math.max(1, Math.round(h * this.ratio));
    this.stage.renderer.setSize(this.W, this.H, false);
    this.post.setSize(this.W, this.H);
    this.stage.camera.aspect = this.W / this.H;
    this.applyView();
  }

  private applyView() {
    const cam = this.stage.camera, H = this.H, k = this.ratio;
    const L = viewLayout(H, { ...this.insets, top: this.insets.top * k, bottom: this.insets.bottom * k });
    if (Math.abs(L.offsetY) > 0.5) cam.setViewOffset(this.W, H, 0, L.offsetY, this.W, H); else cam.clearViewOffset();
    cam.updateProjectionMatrix();
    // bars: rest on the bottom of the visible band (depth 0.46 m in front of the eye)
    this.bars.position.set(0, rowToCameraY(L.handsY, L, H, cam.fov, 0.46) - 0.06, -0.46);
    this.baseBarsY = this.bars.position.y;
  }

  /** Pose the camera on the route, stream, blend the look and render one frame. */
  frame(f: WorldFrame): void {
    const realNow = globalThis.performance?.now() ?? 0, realDt = this.lastReal ? (realNow - this.lastReal) / 1000 : 0;
    this.lastReal = realNow;
    const dt = this.lastT < 0 ? 0 : Math.max(0, Math.min(0.25, f.t - this.lastT));
    this.lastT = f.t;
    this.stage.renderer.info.reset();
    this.pose(f);
    // look: the scene's preset blended in, the dream dial eased, the chunky-pixel level from the setting or the governor
    if (this.o.pixel === 'auto' || this.o.pixel === undefined) this.governor.sample(realDt);
    this.director.pixelLevel = this.o.pixel === 'off' ? 0 : this.o.pixel === 'on' ? 2 : this.governor.level;
    if (f.look) this.director.set(f.look, f.dream);
    const look = this.director.step(dt);
    applyLookState(look);
    Object.assign(this.post.p, look.post);
    this.post.render(this.stage.scene, this.stage.camera, f.t);
    this.overlay(realDt);
  }

  /** Camera + streaming only (no render): the headless hitch script measures this. */
  pose(f: WorldFrame): void {
    const w = this.world, rig = w.rig ?? RIG, r = w.route, cam = this.stage.camera;
    const lane = f.lateral ?? rig.lane, ph = (f.t * (f.cadence ?? 86)) / 60 * Math.PI * 2;
    this.uTime.value = f.t;
    const p = r.offset(f.routeS, lane), g = r.offset(f.routeS + rig.gaze.ahead, rig.gaze.d);
    cam.position.set(p.x, p.y + w.eye + Math.sin(ph * 2) * 0.008, p.z);
    if (f.aim) cam.lookAt(f.aim.x, f.aim.y, f.aim.z); else cam.lookAt(g.x, g.y + rig.gaze.dy, g.z);
    this.bars.visible = f.bars ?? true;
    cam.rotateZ(Math.sin(ph) * 0.006);
    cam.updateMatrixWorld();
    this.bars.position.y = this.baseBarsY + Math.sin(ph * 2) * 0.003;
    this.bars.rotation.set(-cam.rotation.x + 0.12, 0, Math.sin(ph) * 0.02);
    const fwd = cam.getWorldDirection(new THREE.Vector3());
    aimSun(this.stage, cam.position.clone().addScaledVector(fwd, 55), new THREE.Vector3(...w.sky.sunDir), 75);
    this.terrain.update(cam.position, f.t, { routeS: f.routeS, speed: f.speed });
  }

  /** Dev overlay: fps, worst frame, triangles, draw calls, streaming, look. */
  private overlay(realDt: number) {
    const el = this.o.overlay;
    if (!el) return;
    const a = this.overlayAcc, info = this.stage.renderer.info.render, ts = this.terrain.stats;
    a.n++; a.ms += realDt * 1000; a.worst = Math.max(a.worst, realDt * 1000);
    if (a.ms >= 1000) {
      a.text = `${((a.n * 1000) / a.ms).toFixed(1)} fps · worst ${a.worst.toFixed(0)} ms`;
      a.n = 0; a.ms = 0; a.worst = 0;
    }
    el.textContent = `${a.text}\n${this.W}×${this.H} · ${(info.triangles / 1e6).toFixed(2)} M tris · ${info.calls} calls\n`
      + `${this.world.id} · tiles ${ts.leaves} in ${ts.clusters} clusters · pending ${ts.pending} · ${ts.workers} workers\n`
      + `look ${this.director.target} · dream ${this.director.current.post.dream.toFixed(2)} · pixel ×${this.director.current.post.pixel} (governor ${this.governor.level}, ${this.governor.fps.toFixed(0)} fps)`;
  }

  dispose(): void {
    this.terrain.dispose();
    this.post.dispose();
    this.stage.renderer.dispose();
  }
}
