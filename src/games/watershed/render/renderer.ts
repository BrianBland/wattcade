// Watershed renderer: the valley as a 3D diorama. The terrain mesh follows the eroding heightfield, a translucent river
// surface follows the (time-smoothed) water-depth grid, and every water parcel is an exaggerated glossy drop stretched
// along its velocity: muddy when it carries silt, white when it's fast. Drops are extrapolated between sim ticks so
// motion stays smooth at any frame rate. Forest, clouds, sea swell, the salmon run, cue-driven sound and popups.
import * as THREE from 'three';
import type { BikeState, GameRenderer, InputState, Insets, Profile } from '../../../contracts';
import { play, setAmbient, stopAmbient } from '../../../audio/sfx';
import type { Cue, WatershedSnapshot } from '../sim/sim';
import { SEA, sample } from '../sim/terrain';
import { SalmonLayer } from './creatures';
import { Hud } from './hud';
import { layout } from './layout';
import { Clouds, Forest, SeaSurface, skyTexture } from './scenery';
import { TerrainView } from './terrainView';
import { OuterLand } from './outerLand';
import { Riverbank } from './riverbank';
import { SkyLayer } from './skyLayer';
import { JobsLayer } from './jobsLayer';
import { EventsLayer } from './eventsLayer';
import { WaterView } from './waterView';

const DROP_SCALE = 0.85;   // drop radius per cbrt(volume): exaggerated on purpose
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

const C = {
  drop: new THREE.Color(0x56b4ff), mud: new THREE.Color(0xb89a5c), foam: new THREE.Color(0xeaf8ff),
};

/** Popup copy for cues: title, sub line, seconds, tone. */
const POPUPS: Record<string, [string, string, number, '' | 'salmon' | 'warn']> = {
  evaporate: ['Rise from the sea.', 'Spin to lift vapor · steer into the sunlight (paddles, ◀▶, shifters) · A: heat wave', 6, ''],
  cloud: ['Gather your cloud.', 'Drift inland and steer into the cloudlets · a bigger cloud means more rain', 5, ''],
  rain: ['Rain on the mountains!', 'Grind for a downpour, spin for drizzle · your spring rises where it rains most', 6, ''],
  intro: ['You are the river.', 'Grind to carve deep · spin to carry silt · steer the spring ◀▶ · Y: follow view', 6, ''],
  salmonRun: ['The salmon are running!', 'Follow them home up the river you carved', 5, 'salmon'],
  salmonGo: ['Dodge the bears and eagles!', 'Steer with the paddles, ◀▶ or the shifters · A: sprint · spin past 95 rpm to leap falls', 6, 'salmon'],
  salmonStuck: ['Falls ahead!', 'Spin past 95 rpm to leap', 3, 'warn'],
};
const EVENT_TEXT: Record<string, { warn: [string, string]; hit: [string, string] }> = {
  earthquake: { warn: ['The ground is rumbling…', 'Hold on, something is shifting'], hit: ['Earthquake!', 'A saddle lifted shut and another opened: find the new path'] },
  landslide: { warn: ['Rocks are falling…', 'The valley wall is giving way'], hit: ['Landslide!', 'The river is dammed: grind through or go around'] },
  volcano: { warn: ['The mountain is waking up…', 'Smoke over the ridge'], hit: ['Eruption!', 'Lava has sealed the easy saddle: carve another way'] },
  meteor: { warn: ['Incoming!', 'Something is falling from the sky…'], hit: ['METEOR!', '…well, that\'s a new lake'] },
};
const JOB_DONE: Record<string, string> = { grist: 'The grist mill is grinding flour', saw: 'The sawmill is cutting planks', village: 'Millbrook stayed dry', dam: 'The beavers move on', fields: 'The fields are thriving' };
const JOB_MISS: Record<string, string> = { grist: 'Carve through to the mill and grind for heavy water', saw: 'The sawmill wants fast water: spin', village: 'The flood reached the houses', dam: 'Spin harder (A: surge) to wear the dam down', fields: 'Run the river beside the fields' };
const BOOST_TEXT: Record<string, string> = { evaporate: 'Heat wave!', cloud: 'Inhale!', rain: 'Cloudburst!', river: 'Surge!', salmon: 'Sprint!' };
const BLOCK_SUB: Record<string, string> = {
  grind: 'Grind it out: heavy water carves deep', spin: 'Spin it up: light water races silt to the sea',
  steady: 'Hold a steady spin', free: 'Ease off and watch the valley',
};

export class WatershedRenderer implements GameRenderer {
  private renderer?: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(40, 4 / 3, 1, 1600);
  private sun = new THREE.DirectionalLight(0xfff1dc, 2.4);
  private terrainView?: TerrainView; private water?: WaterView; private outer?: OuterLand; private landTick = 0;
  private drops?: THREE.InstancedMesh; private spring = new THREE.Group(); private extraSprings: THREE.Group[] = []; private springRing?: THREE.Mesh;
  private forest?: Forest; private bank?: Riverbank; private skyLayer?: SkyLayer; private jobs?: JobsLayer; private geo?: EventsLayer; private clouds?: Clouds; private sea?: SeaSurface; private salmon?: SalmonLayer;
  private hud?: Hud;
  private ro?: ResizeObserver;
  private size: [number, number] = [800, 600]; private insetB = 0;
  private nx = 0; private ny = 0; private lastVersion = -1; private versionAt = 0; private lastFrame = 0; private lastCue = -1;
  private color = '#d64545';
  private camBase = { pos: new THREE.Vector3(), tgt: new THREE.Vector3() };
  private camPos = new THREE.Vector3(); private camTgt = new THREE.Vector3(); private camInit = false;
  private camMode: 'overhead' | 'intro' | 'chase' = 'overhead'; private introRun = 0;
  private introFrom = { pos: new THREE.Vector3(), tgt: new THREE.Vector3() };
  private camHead = new THREE.Vector3(-1, 0, 0);
  private cL = new THREE.Vector3(); private cH = new THREE.Vector3(); private cP = new THREE.Vector3(); private cT = new THREE.Vector3();
  private cA = new THREE.Vector3(); private cB = new THREE.Vector3(); private cC = new THREE.Vector3(); private cD = new THREE.Vector3();
  private treeAcc = 0; private dropsDirty = true; private dropK = 1;
  private m = new THREE.Matrix4(); private q = new THREE.Quaternion(); private v = new THREE.Vector3(); private sc = new THREE.Vector3(); private dir = new THREE.Vector3();
  private X = new THREE.Vector3(1, 0, 0); private tmpC = new THREE.Color();

  mount(container: HTMLElement, ctx: { profile: Readonly<Profile>; send?: (action: unknown) => void; insets?: Insets }) {
    this.insetB = ctx.insets?.bottom ?? 0;
    this.color = ctx.profile.color;
    const r = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(2, typeof devicePixelRatio === 'number' ? devicePixelRatio : 1));
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.toneMapping = THREE.NeutralToneMapping; r.toneMappingExposure = 1.05;
    r.domElement.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none';
    container.appendChild(r.domElement);
    this.renderer = r;

    const s = this.scene;
    s.background = skyTexture();
    s.fog = new THREE.Fog(0xdcf0f9, 300, 950);
    this.sun.position.set(-70, 130, 70);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera; sc.left = -95; sc.right = 95; sc.top = 75; sc.bottom = -75; sc.near = 10; sc.far = 360;
    this.sun.shadow.bias = -0.0008; this.sun.shadow.normalBias = 0.12;
    s.add(this.sun, this.sun.target, new THREE.HemisphereLight(0xd8eeff, 0x5a6a3a, 1.25));

    this.hud = new Hud(container);
    this.hud.setSend(ctx.send);
    this.hud.setInsetBottom(this.insetB);
    this.resize(container.clientWidth || 800, container.clientHeight || 600);
    if (typeof ResizeObserver !== 'undefined') {
      this.ro = new ResizeObserver(() => this.resize(container.clientWidth || 800, container.clientHeight || 600));
      this.ro.observe(container);
    }
  }

  /** Grid (i across, j downstream) → world: X downstream (screen right), Z across (toward the camera), Y up. */
  private wx = (j: number) => j - this.ny / 2;
  private wz = (i: number) => i - this.nx / 2;

  private build(s: WatershedSnapshot) {
    const { nx, ny } = s;
    this.nx = nx; this.ny = ny;
    this.terrainView = new TerrainView(nx, ny, this.wx, this.wz);
    this.water = new WaterView(nx, ny, this.wx, this.wz, this.sun.position);

    // the sea: a translucent slab (sides) with a swelling surface on top
    // the sea runs to the horizon; the land beyond the valley continues into hills and peaks
    this.sea = new SeaSurface(1400, 1100, this.wx(ny - 1) + 200, 0, 140);
    this.outer = new OuterLand(s, this.wx, this.wz);

    // drops: one instanced glossy sphere per water parcel
    const dg = new THREE.SphereGeometry(1, 12, 8);
    this.drops = new THREE.InstancedMesh(dg, new THREE.MeshPhongMaterial({ color: 0xffffff, shininess: 160, specular: 0xcfeeff, emissive: 0x1a4a78 }), s.px.length);
    this.drops.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.drops.setColorAt(0, C.drop);
    this.drops.frustumCulled = false;

    // the spring: a ring of stones, a pulse ring and a pillar in the rider's colour
    const stone = new THREE.MeshLambertMaterial({ color: 0x9a948a, flatShading: true });
    for (let a = 0; a < 7; a++) {
      const m = new THREE.Mesh(new THREE.DodecahedronGeometry(0.9), stone);
      m.position.set(Math.cos((a / 7) * Math.PI * 2) * 2.6, 0.3, Math.sin((a / 7) * Math.PI * 2) * 2.6);
      m.castShadow = true; this.spring.add(m);
    }
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 7, 8), new THREE.MeshLambertMaterial({ color: this.color, emissive: this.color, emissiveIntensity: 0.35 }));
    pillar.position.y = 3.5; pillar.castShadow = true; this.spring.add(pillar);
    this.springRing = new THREE.Mesh(new THREE.TorusGeometry(2.6, 0.12, 6, 32), new THREE.MeshBasicMaterial({ color: 0xbfeaff, transparent: true, opacity: 0.6 }));
    this.springRing.rotation.x = -Math.PI / 2; this.spring.add(this.springRing);

    // secondary springs: a smaller ring of stones each (no pillar; the rider steers the main one)
    for (let k = 0; k < 2; k++) {
      const g = new THREE.Group();
      for (let a = 0; a < 6; a++) {
        const m = new THREE.Mesh(new THREE.DodecahedronGeometry(0.7), stone);
        m.position.set(Math.cos((a / 6) * Math.PI * 2) * 2, 0.25, Math.sin((a / 6) * Math.PI * 2) * 2); m.castShadow = true; g.add(m);
      }
      g.visible = false; this.extraSprings.push(g); this.scene.add(g);
    }
    this.forest = new Forest(s, this.wx, this.wz);
    this.bank = new Riverbank(s, this.wx, this.wz);
    this.skyLayer = new SkyLayer(this.wx, this.wz, this.sun.position);
    this.jobs = new JobsLayer(s, this.wx, this.wz, (x, y) => this.terrainView!.heightAt(x, y));
    this.geo = new EventsLayer(this.wx, this.wz, (x, y) => this.terrainView!.heightAt(x, y));
    this.clouds = new Clouds(ny + 60);
    this.salmon = new SalmonLayer(this.color, this.wx, this.wz);

    this.scene.add(this.terrainView.mesh, this.water.mesh, this.outer.group, this.sea.mesh, this.drops, this.spring, this.forest.group, this.bank.group, this.skyLayer.group, this.jobs.group, this.geo.group, this.clouds.group, this.salmon.group);
    this.frameCamera();
  }

  private frameCamera() {
    if (!this.nx) return;
    const span = Math.max(this.ny, this.nx * 1.3);
    const aspect = this.size[0] / Math.max(1, this.size[1]);
    // look UP the valley from above the delta (spring at the top of the screen, sea at the bottom), so left/right on
    // screen is across the valley in every phase
    const k = Math.max(1, 1.35 / Math.max(0.5, aspect));   // portrait screens sit further back
    void span;
    this.camBase.pos.set(this.wx(this.ny - 1) + 62 * k, 172 * k, 0);
    this.camBase.tgt.set(this.wx(this.ny * 0.36), 0, 0);
    if (!this.camInit) { this.camPos.copy(this.camBase.pos); this.camTgt.copy(this.camBase.tgt); this.camInit = true; }
  }

  /** World point on the river centreline at grid row y (from the salmon view's path), at the water surface. */
  private pathWorld(s: WatershedSnapshot, path: Array<[number, number]>, y: number, out: THREE.Vector3): THREE.Vector3 {
    const f = Math.max(0, Math.min(path.length - 1.001, y / 4)), k = Math.floor(f), u = f - k;
    const x = path[k][0] + (path[k + 1][0] - path[k][0]) * u, yy = path[k][1] + (path[k + 1][1] - path[k][1]) * u;
    const ground = Math.max(SEA, sample(s.h, s.nx, s.ny, x, yy)) + sample(this.water!.depth, s.nx, s.ny, x, yy) * 0.9;
    return out.set(this.wx(yy), ground, this.wz(x));
  }

  /**
   * Camera: the overhead diorama view, or during the salmon run a chase cam low behind the lead salmon facing upstream.
   * Each run opens with an intro (the sim holds the school still): the first one sweeps down the river from high above
   * the spring to the sea, then swings around behind the leader; later ones swoop from overhead into the chase.
   * Between runs the camera pulls back up to the overhead view.
   */
  private updateCamera(s: WatershedSnapshot, dt: number, t: number) {
    const alt = s.view === 'follow';  // Y toggles each phase's alternate view
    if ((s.phase === 'evaporate' || s.phase === 'cloud' || s.phase === 'rain') && !alt) {
      // ride behind the vapor column / cloud from the downstream side, looking inland at the mountains
      this.camMode = 'overhead';
      const F = this.skyLayer!.focus, vs = this.skyLayer!.visualScale;
      const back = 20 + vs * 4, up = 9 + vs * 1.8;
      const tgt = this.cT.set(F.x - 18, F.y - 8, F.z * 0.8), pos = this.cP.set(F.x + back, F.y + up, F.z * 0.85);
      const k = 1 - Math.exp(-dt * 1.5);
      this.camPos.lerp(pos, k); this.camTgt.lerp(tgt, k);
      this.camera.position.copy(this.camPos); this.camera.lookAt(this.camTgt);
      return;
    }
    const f = s.salmon, L = f ? this.salmon?.leaderWorld(this.cL) : null;
    if (s.phase === 'river' && alt) {
      // follow the spring down the valley
      const S = this.spring.position;
      const k = 1 - Math.exp(-dt * 1.5);
      this.camPos.lerp(this.cP.set(S.x + 42, S.y + 46, S.z * 0.7), k); this.camTgt.lerp(this.cT.set(S.x + 8, S.y - 4, S.z * 0.85), k);
      this.camera.position.copy(this.camPos); this.camera.lookAt(this.camTgt);
      return;
    }
    if (f && L && alt && !f.restarting && f.intro <= 0) {
      // overview of the run: high above the school
      const k = 1 - Math.exp(-dt * 1.5);
      this.camPos.lerp(this.cP.set(L.x + 34, L.y + 70, L.z * 0.6), k); this.camTgt.lerp(this.cT.set(L.x - 16, L.y, L.z * 0.6), k);
      this.camera.position.copy(this.camPos); this.camera.lookAt(this.camTgt);
      return;
    }
    // pull up to the overview between runs, and as the school reaches the steep head of the valley (arrival from above)
    if (!f || !L || f.restarting || (f.y < 14 && f.intro <= 0)) {
      this.camMode = 'overhead';
      const k = 1 - Math.exp(-dt * (f ? 1.6 : 1.2));
      this.camPos.lerp(this.camBase.pos, k); this.camTgt.lerp(this.camBase.tgt, k);
      this.camera.position.set(this.camPos.x + Math.sin(t * 0.05) * 3, this.camPos.y + Math.sin(t * 0.07) * 1.5, this.camPos.z);
      this.camera.lookAt(this.camTgt);
      return;
    }
    // smoothed upstream heading in world space (grid y → world X, grid x → world Z)
    this.cH.set(f.heading.y, 0, f.heading.x).normalize();
    this.camHead.lerp(this.cH, this.camMode === 'chase' ? 1 - Math.exp(-dt * 2) : 1).normalize();
    // rail cam: ride the traced channel downstream of the leader (so bends and canyon walls stay out of the way),
    // shifted toward the leader's lane, and look ahead along the channel
    const up = 14, back = 19;
    const chasePos = this.pathWorld(s, f.path, Math.min(s.ny - 1, f.y + back), this.cP);
    const onPath = this.pathWorld(s, f.path, f.y, this.cC);
    chasePos.x += (L.x - onPath.x) * 0.6; chasePos.z += (L.z - onPath.z) * 0.6;
    chasePos.y = Math.max(chasePos.y, L.y) + up;
    const chaseTgt = this.pathWorld(s, f.path, Math.max(0, f.y - 9), this.cT);
    chaseTgt.lerp(L, 0.5);
    // approaching the steep head of the valley: start looking down at the school
    const head = Math.min(1, Math.max(0, 1 - (f.y - 14) / 12));
    chaseTgt.lerp(L, head * 0.6); chasePos.y += head * 10;

    if (f.intro > 0) {
      if (this.camMode !== 'intro' || f.run !== this.introRun) {
        this.camMode = 'intro'; this.introRun = f.run;
        this.introFrom.pos.copy(this.camera.position); this.introFrom.tgt.copy(this.camTgt);
      }
      const u = 1 - f.intro / Math.max(0.01, f.introTotal);
      const ease = (x: number) => { const c = Math.max(0, Math.min(1, x)); return c * c * (3 - 2 * c); };
      const pos = this.cA, tgt = this.cB;
      if (f.run === 1) {
        const leadY = f.y;
        if (u < 0.62) {
          // phase A: fly down the river from high above the spring, looking downstream
          const a = ease(u / 0.62), ys = 6 + (leadY - 16 - 6) * a;
          this.pathWorld(s, f.path, ys, pos); pos.y += 48 + (18 - 48) * a;
          this.pathWorld(s, f.path, Math.min(s.ny - 1, ys + 22), tgt);
          const k = ease(a / 0.2);
          pos.lerpVectors(this.introFrom.pos, pos, k); tgt.lerpVectors(this.introFrom.tgt, tgt, k);
        } else {
          // phase B: swing around the leader from upstream-high to the chase seat, turning to face upstream
          const b = ease((u - 0.62) / 0.38);
          this.pathWorld(s, f.path, leadY - 16, this.cC); this.cC.y += 18;
          const o0x = this.cC.x - L.x, o0z = this.cC.z - L.z, o1x = chasePos.x - L.x, o1z = chasePos.z - L.z;
          const th0 = Math.atan2(o0z, o0x), r0 = Math.hypot(o0x, o0z), r1 = Math.hypot(o1x, o1z);
          let dth = Math.atan2(o1z, o1x) - th0;
          while (dth <= 0) dth += Math.PI * 2;                    // swing via the viewer's side (+z) …
          if (Math.sin(th0 + dth / 2) < 0) dth -= Math.PI * 2;    // … whichever way that is
          const th = th0 + dth * b, r = r0 + (r1 - r0) * b;
          pos.set(L.x + Math.cos(th) * r, this.cC.y + (chasePos.y - this.cC.y) * b, L.z + Math.sin(th) * r);
          this.pathWorld(s, f.path, Math.min(s.ny - 1, leadY - 16 + 22), this.cD);
          tgt.lerpVectors(this.cD, chaseTgt, b);
        }
      } else {
        const k = ease(u);
        pos.lerpVectors(this.introFrom.pos, chasePos, k); tgt.lerpVectors(this.introFrom.tgt, chaseTgt, k);
      }
      this.camPos.copy(pos); this.camTgt.copy(tgt);
    } else {
      this.camMode = 'chase';
      const k = 1 - Math.exp(-dt * 3);
      this.camPos.lerp(chasePos, k); this.camTgt.lerp(chaseTgt, k);
    }
    this.liftClear(this.camPos, L);
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camTgt);
  }

  /** Raise `cam` until its line of sight to `look` clears the terrain (canyon walls, ridges) with some margin. */
  private liftClear(cam: THREE.Vector3, look: THREE.Vector3) {
    const tv = this.terrainView!, hAt = (wx: number, wz: number) => tv.heightAt(wz + this.nx / 2, wx + this.ny / 2);
    let need = hAt(cam.x, cam.z) + 3;
    for (const t of [0.2, 0.4, 0.6, 0.75]) {
      const ground = hAt(cam.x + (look.x - cam.x) * t, cam.z + (look.z - cam.z) * t);
      need = Math.max(need, (ground + 1.5 - look.y * t) / (1 - t));
    }
    const floor = hAt(cam.x, cam.z) + 2;
    if (cam.y < floor) cam.y = floor;                     // never inside the ground
    if (cam.y < need) cam.y += (need - cam.y) * 0.25;   // ease up above that so it doesn't pop
  }

  /** Place drops, extrapolated `ahead` seconds along their velocity (smooth between 30 Hz sim ticks). */
  private updateDrops(s: WatershedSnapshot, ahead: number) {
    const d = this.drops!, { nx, ny, h } = s;
    const n = Math.min(s.n, s.px.length);
    for (let q = 0; q < n; q++) {
      const vx = s.pvx[q], vy = s.pvy[q], vol = s.pvol[q];
      const x = s.px[q] + vx * ahead, y = s.py[q] + vy * ahead;
      const land = this.terrainView!.heightAt(x, y), ground = Math.max(SEA, land), depth = sample(this.water!.depth, nx, ny, x, y);
      // the water surface is the river; drops only appear as whitewater spray where the water is fast or falling
      // (the spring, rapids, falls: the foam field) and are hidden everywhere else
      const spray = land < SEA ? 0 : Math.max(sample(this.water!.foam, nx, ny, x, y) * 1.4, y < 4 ? 1 : 0, Math.min(1, Math.max(0, (Math.hypot(vx, vy) - 7) / 3)));
      if (spray < 0.08) { this.m.makeScale(0, 0, 0); d.setMatrixAt(q, this.m); continue; }
      const r = DROP_SCALE * this.dropK * Math.cbrt(vol) * Math.min(1, spray) * 0.8;
      const sp = Math.hypot(vx, vy);
      const groundAhead = Math.max(SEA, sample(h, nx, ny, x + vx * 0.1, y + vy * 0.1));
      this.dir.set(vy, (groundAhead - ground) * 10, vx);
      if (this.dir.lengthSq() < 1e-6) this.dir.set(1, 0, 0);
      this.dir.normalize();
      this.q.setFromUnitVectors(this.X, this.dir);
      this.v.set(this.wx(y), ground + depth * 0.9 + r * 0.6, this.wz(x));
      this.sc.set(r * (1 + Math.min(1, sp * 0.07)), r * 0.9, r * 0.9);
      this.m.compose(this.v, this.q, this.sc);
      d.setMatrixAt(q, this.m);
      if (this.dropsDirty) {
        this.tmpC.copy(C.drop).lerp(C.mud, Math.min(0.45, (s.psed[q] / Math.max(0.01, vol)) * 2)).lerp(C.foam, 0.35 + Math.min(0.4, Math.max(0, sp - 5) * 0.1));
        d.setColorAt(q, this.tmpC);
      }
    }
    d.count = n;
    d.instanceMatrix.needsUpdate = true;
    if (this.dropsDirty && d.instanceColor) d.instanceColor.needsUpdate = true;
    this.dropsDirty = false;
  }

  private cues(s: WatershedSnapshot) {
    const list: Cue[] = s.cues ?? [];
    if (this.lastCue < 0) {
      // first frame: don't replay history, but greet a fresh ride
      this.lastCue = list.length ? list[list.length - 1].id : 0;
      if (s.t < 8 && !s.menu) this.popup(s.phase === 'evaporate' ? 'evaporate' : 'intro');
      return;
    }
    for (const c of list) {
      if (c.id <= this.lastCue) continue;
      this.lastCue = c.id;
      const d = c.data ?? {};
      switch (c.type) {
        case 'blockStart':
          if (d.firstOfPhase && (d.phase === 'cloud' || d.phase === 'rain')) { this.popup(d.phase as 'cloud' | 'rain'); play('chime', { vol: 0.7 }); }
          else if (d.phase === 'river' && Number(d.index) > 0 && !d.firstOfPhase) { this.hud?.popup(String(d.name), BLOCK_SUB[String(d.style)] ?? '', 3.5); play('chime', { vol: 0.7 }); }
          break;
        case 'springRises': this.popup('intro'); play('splash'); play('chime', { vol: 0.8 }); break;
        case 'cloudlet': play('pickup', { vol: 0.6 }); break;
        case 'menuMove': play('uiMove'); break;
        case 'rideLength': play('uiSelect'); this.popup('evaporate'); break;
        case 'objective': this.hud?.popup(String(d.title), String(d.goal), 5); play('horn', { vol: 0.5 }); break;
        case 'objectiveDone': this.hud?.popup('Done! ✓', JOB_DONE[String(d.kind)] ?? 'Nice work', 3, 'salmon'); play('reward'); break;
        case 'objectiveFailed': this.hud?.popup('Missed it', JOB_MISS[String(d.kind)] ?? 'Next time', 3, 'warn'); play('deny', { vol: 0.5 }); break;
        case 'beavers': this.hud?.popup('Beavers!', 'They are damming the river. Spin to flush the dam away', 4, 'warn'); play('plop'); break;
        case 'damBroken': this.hud?.popup('Dam broken!', 'The river runs free', 2.5, 'salmon'); play('explode', { vol: 0.4 }); play('splash'); break;
        case 'flooding': this.hud?.popup('Millbrook is flooding!', 'Steer the spring away, grind a deeper channel', 2.5, 'warn'); play('bell', { vol: 0.6 }); break;
        case 'millTurning': play('chime', { vol: 0.5, minGapS: 3 }); break;
        case 'harvest': play('coin', { vol: 0.4, minGapS: 1 }); break;
        case 'boost': play('surge', { vol: 0.5 }); this.hud?.popup(BOOST_TEXT[String(d.phase)] ?? 'Boost!', '', 1.6); break;
        case 'sunlit': play('chime', { vol: 0.35, minGapS: 2 }); break;
        case 'salmonRun':
          if (s.salmon?.run === 1) this.popup('salmonRun'); else this.hud?.popup(`Salmon run ${s.salmon?.run ?? ''}`, 'A new school sets off from the sea', 3, 'salmon');
          play('splash'); play('reward', { vol: 0.6 }); break;
        case 'salmonGo':
          if (Number(d.run) === 1) this.popup('salmonGo'); else this.hud?.popup('Go!', 'Dodge, and spin to leap the falls', 2, 'salmon');
          play('go', { vol: 0.7 }); break;
        case 'salmonHome': this.hud?.popup(`${d.fish} salmon home!`, 'They made it to the spring', 3, 'salmon'); play('reward'); break;
        case 'salmonStuck': this.popup('salmonStuck'); play('deny', { vol: 0.6 }); break;
        case 'fork': this.hud?.popup('Fork ahead!', 'Steer ◀ or ▶ to choose a branch', 2.5, 'salmon'); play('uiMove'); break;
        case 'salmonLeap': play('whoosh'); play('splash', { vol: 0.6 }); break;
        case 'predatorWarn': play(d.kind === 'bear' ? 'roar' : 'screech', { vol: 0.8 }); break;
        case 'predatorStrike':
          play('splash', { vol: 0.8 });
          if (Number(d.caught) > 0) { play('hurt', { vol: 0.5 }); this.hud?.popup(`${d.kind === 'bear' ? 'Bear' : 'Eagle'} took ${d.caught}!`, 'Dodge to the far side', 2, 'warn'); }
          else play('plop');
          break;
        case 'gorge': play('milestone'); this.hud?.popup(`Gorge ${Number(d.depth) * 4} m deep`, 'Heavy water cuts deep', 2.5); break;
        case 'deltaGrew': play('chime', { vol: 0.6 }); break;
        case 'rideDone': play('unique'); break;
      }
    }
  }
  /** Popups and sounds as geological events change state. */
  private eventCue(kind: string, state: string) {
    const T = EVENT_TEXT[kind];
    if (!T) return;
    if (state === 'warning') { this.hud?.popup(T.warn[0], T.warn[1], 4, 'warn'); play(kind === 'meteor' ? 'whoosh' : 'thunder', { vol: 0.7 }); }
    if (state === 'active') { this.hud?.popup(T.hit[0], T.hit[1], 4, 'warn'); play(kind === 'volcano' ? 'bossStart' : kind === 'earthquake' ? 'thunder' : 'explode', { vol: kind === 'meteor' ? 0.9 : 0.6 }); }
  }
  private popup(key: keyof typeof POPUPS) { const [t, sub, sec, tone] = POPUPS[key]; this.hud?.popup(t, sub, sec, tone); }

  private sound(s: WatershedSnapshot) {
    const flow = Math.min(1, s.n / 2200);
    // the river: a low rumble when grinding (heavy water), a bright hiss when spinning (light, fast water)
    const sky = s.phase === 'evaporate' || s.phase === 'cloud' || s.phase === 'rain';
    setAmbient('river', sky ? 0.04 * flow : 0.06 + 0.28 * flow, 260 + 1500 * s.cadNorm, 0.9);
    setAmbient('rain', s.phase === 'rain' ? Math.min(0.3, s.sky.raining * 0.02) : 0, 2600 - 1400 * (1 - s.cadNorm), 0.5);
    setAmbient('wind', s.phase === 'cloud' ? 0.12 : s.phase === 'evaporate' ? 0.05 : 0, 380, 0.4);
    setAmbient('surf', 0.07, 420, 0.5);
  }

  render(snapshot: unknown, _bike: Readonly<BikeState>, _input: Readonly<InputState>) {
    const s = snapshot as WatershedSnapshot;
    if (!this.renderer || !s || !s.h) return;
    if (!this.terrainView) this.build(s);
    const tNow = now();
    const dt = this.lastFrame ? Math.min(0.1, (tNow - this.lastFrame) / 1000) : 1 / 60;
    this.lastFrame = tNow;
    if (s.version !== this.lastVersion) {
      this.lastVersion = s.version; this.versionAt = tNow; this.dropsDirty = true;
      this.water!.absorb(s);
      // the land changes slowly: rebuild it ~10×/s; the water surface ~15×/s
      if (this.landTick++ % 3 === 0) this.terrainView!.update(s, this.water!.depth);
      if (this.landTick % 2 === 0) this.water!.update(this.terrainView!.fh);
      this.treeAcc += dt;
      if (this.treeAcc > 0.25) { this.forest!.update(s, this.treeAcc, (x, y) => this.terrainView!.heightAt(x, y)); this.treeAcc = 0; }
    }
    // during the salmon run the river becomes the backdrop: smaller drops so the school stands out
    this.dropK += ((s.salmon ? (this.camMode === 'overhead' ? 0.55 : 0.38) : 1) - this.dropK) * (1 - Math.exp(-dt * 2));
    this.updateDrops(s, Math.min(1 / 20, (tNow - this.versionAt) / 1000));
    const t = s.t;
    this.spring.position.set(this.wx(2), sample(s.h, s.nx, s.ny, s.sourceX, 2), this.wz(s.sourceX));
    const ph = (t * 0.8) % 1;
    this.springRing!.scale.setScalar(1 + 0.25 * ph); (this.springRing!.material as THREE.MeshBasicMaterial).opacity = 0.6 * (1 - ph);
    this.spring.visible = !s.salmon && (s.phase === 'river');
    this.extraSprings.forEach((g, k) => {
      const sp = s.springs[k + 1];
      g.visible = !!sp && this.spring.visible;
      if (sp) g.position.set(this.wx(2), this.terrainView!.heightAt(sp.x, 2), this.wz(sp.x));
    });
    this.clouds!.update(dt);
    this.sea!.update(tNow / 1000);
    this.water!.tick(tNow / 1000);
    this.forest!.wind.value = tNow / 1000;
    this.bank!.update(s, this.water!, (x, y) => this.terrainView!.heightAt(x, y), dt, tNow / 1000);
    this.skyLayer!.update(s, dt, tNow / 1000, (x, y) => this.terrainView!.heightAt(x, y));
    this.jobs!.update(s, dt, tNow / 1000);
    this.geo!.update(s, dt, tNow / 1000, (kind, state) => this.eventCue(kind, state));
    this.salmon!.update(s, s.salmon, dt, tNow / 1000);
    this.updateCamera(s, dt, tNow / 1000);
    const shake = this.geo!.shake;
    if (shake > 0.01) this.camera.position.add(this.cA.set((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake));
    // the boundary fence lights up near whatever the rider is steering
    const sky = s.phase === 'evaporate' || s.phase === 'cloud' || s.phase === 'rain';
    const focus = sky ? this.skyLayer!.focus : s.salmon ? (this.salmon!.leaderWorld(this.cD) ?? this.spring.position) : this.spring.position;
    this.outer!.setFocus(focus);
    this.cues(s);
    this.sound(s);
    this.hud?.setRpmRange(s.rpmLow, s.rpmHigh);
    this.hud?.update(s);
    this.hud?.tick(dt);
    this.renderer.render(this.scene, this.camera);
  }

  resize(w: number, h: number) {
    this.renderer?.setSize(w, h, false);
    this.size = [w, h];
    this.camera.aspect = w / Math.max(1, h);
    this.hud?.setSize(w, h);
    this.frameCamera(); this.applyView();
  }

  setInsets(i: Insets) { this.insetB = i.bottom; this.hud?.setInsetBottom(i.bottom); this.applyView(); }

  /** Render edge-to-edge, but shift the view so the valley is centred above the shell HUD. */
  private applyView() {
    const [w, h] = this.size, off = layout(w, h, this.insetB).viewOffsetY;
    if (off > 0) this.camera.setViewOffset(w, Math.max(1, h), 0, off, w, Math.max(1, h)); else this.camera.clearViewOffset();
    this.camera.updateProjectionMatrix();
  }

  unmount() {
    this.ro?.disconnect();
    stopAmbient();
    this.hud?.unmount();
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose()); else mat?.dispose();
    });
    if (this.scene.background instanceof THREE.Texture) this.scene.background.dispose();
    this.renderer?.dispose();
    this.renderer?.domElement.remove();
  }
}
