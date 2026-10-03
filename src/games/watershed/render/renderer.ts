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

const BASE = -10;          // diorama floor
const DROP_SCALE = 0.85;   // drop radius per cbrt(volume): exaggerated on purpose
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

const C = {
  grass: new THREE.Color(0x5f8f45), meadow: new THREE.Color(0x8db35a), rock: new THREE.Color(0x8d8070), snow: new THREE.Color(0xf2f5f7),
  strata: new THREE.Color(0xc49070), earth: new THREE.Color(0x8a5a3a), canyon: new THREE.Color(0xc0643c),
  silt: new THREE.Color(0xe0cc94), seabed: new THREE.Color(0xd6c592), wet: new THREE.Color(0x3d5a3a),
  drop: new THREE.Color(0x3aa0ff), mud: new THREE.Color(0xb89a5c), foam: new THREE.Color(0xeaf8ff),
};

/** Popup copy for cues: title, sub line, seconds, tone. */
const POPUPS: Record<string, [string, string, number, '' | 'salmon' | 'warn']> = {
  intro: ['You are the river.', 'Grind to carve deep · spin to carry silt to the sea · ▲▼ moves the spring', 6, ''],
  salmonRun: ['The salmon are running!', 'Steer the school with ▲▼ or the shifters · dodge bears and eagles', 6, 'salmon'],
  salmonStuck: ['Falls ahead!', 'Spin past 95 rpm to leap', 3, 'warn'],
};
const BLOCK_SUB: Record<string, string> = {
  grind: 'Grind it out: heavy water carves deep', spin: 'Spin it up: light water races silt to the sea',
  steady: 'Hold a steady spin', free: 'Ease off and watch the valley',
};

export class WatershedRenderer implements GameRenderer {
  private renderer?: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(38, 4 / 3, 1, 1200);
  private sun = new THREE.DirectionalLight(0xfff1dc, 2.4);
  private terrain?: THREE.Mesh; private river?: THREE.Mesh; private skirt?: THREE.Mesh; private seaBox?: THREE.Mesh;
  private drops?: THREE.InstancedMesh; private spring = new THREE.Group(); private springRing?: THREE.Mesh;
  private forest?: Forest; private clouds?: Clouds; private sea?: SeaSurface; private salmon?: SalmonLayer;
  private hud?: Hud;
  private ro?: ResizeObserver;
  private size: [number, number] = [800, 600]; private insetB = 0;
  private nx = 0; private ny = 0; private lastVersion = -1; private versionAt = 0; private lastFrame = 0; private lastCue = -1;
  private wBlur = new Float32Array(0); private wEma = new Float32Array(0);
  private color = '#d64545';
  private camBase = { pos: new THREE.Vector3(), tgt: new THREE.Vector3() };
  private camPos = new THREE.Vector3(); private camTgt = new THREE.Vector3(); private camInit = false;
  private treeAcc = 0; private dropsDirty = true; private dropK = 1;
  private m = new THREE.Matrix4(); private q = new THREE.Quaternion(); private v = new THREE.Vector3(); private sc = new THREE.Vector3(); private dir = new THREE.Vector3();
  private X = new THREE.Vector3(1, 0, 0); private tmpC = new THREE.Color(); private tmpV = new THREE.Vector3(); private tmpV2 = new THREE.Vector3();

  mount(container: HTMLElement, ctx: { profile: Readonly<Profile>; send?: (action: unknown) => void; insets?: Insets }) {
    this.insetB = ctx.insets?.bottom ?? 0;
    this.color = ctx.profile.color;
    const r = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(2, typeof devicePixelRatio === 'number' ? devicePixelRatio : 1));
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.domElement.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none';
    container.appendChild(r.domElement);
    this.renderer = r;

    const s = this.scene;
    s.background = skyTexture();
    s.fog = new THREE.Fog(0xdcf0f9, 240, 520);
    this.sun.position.set(-70, 130, 70);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera; sc.left = -95; sc.right = 95; sc.top = 75; sc.bottom = -75; sc.near = 10; sc.far = 360;
    this.sun.shadow.bias = -0.0006; this.sun.shadow.normalBias = 0.05;
    s.add(this.sun, this.sun.target, new THREE.HemisphereLight(0xd8eeff, 0x5a6a3a, 1.25));

    this.hud = new Hud(container);
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
    this.wBlur = new Float32Array(nx * ny); this.wEma = new Float32Array(nx * ny);
    const grid = (withColor: boolean) => {
      const g = new THREE.BufferGeometry();
      const pos = new Float32Array(nx * ny * 3);
      for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const k = (j * nx + i) * 3; pos[k] = this.wx(j); pos[k + 2] = this.wz(i); }
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
      g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(nx * ny * 3), 3).setUsage(THREE.DynamicDrawUsage));
      if (withColor) g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(nx * ny * 3), 3).setUsage(THREE.DynamicDrawUsage));
      const idx: number[] = [];
      for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
        const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1;
        idx.push(a, b, c, b, d, c);
      }
      g.setIndex(idx);
      return g;
    };
    this.terrain = new THREE.Mesh(grid(true), new THREE.MeshLambertMaterial({ vertexColors: true }));
    this.terrain.receiveShadow = true; this.terrain.castShadow = true;
    this.river = new THREE.Mesh(grid(false), new THREE.MeshPhongMaterial({ color: 0x2b8ad8, transparent: true, opacity: 0.6, shininess: 120, specular: 0xffffff, depthWrite: false }));
    this.river.renderOrder = 1; this.river.receiveShadow = true;

    // diorama skirt: a wall around the grid edge, from the terrain down to BASE (lighter at the top, dark at the base)
    const ring: Array<[number, number]> = [];
    for (let i = 0; i < nx; i++) ring.push([i, 0]);
    for (let j = 1; j < ny; j++) ring.push([nx - 1, j]);
    for (let i = nx - 2; i >= 0; i--) ring.push([i, ny - 1]);
    for (let j = ny - 2; j > 0; j--) ring.push([0, j]);
    ring.push(ring[0]);
    const sp = new Float32Array(ring.length * 6), scol = new Float32Array(ring.length * 6);
    const top = new THREE.Color(0x8a6244), bot = new THREE.Color(0x3a2618);
    ring.forEach(([i, j], n) => {
      sp.set([this.wx(j), 0, this.wz(i), this.wx(j), BASE, this.wz(i)], n * 6);
      scol.set([top.r, top.g, top.b, bot.r, bot.g, bot.b], n * 6);
    });
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(sp, 3).setUsage(THREE.DynamicDrawUsage));
    sg.setAttribute('color', new THREE.BufferAttribute(scol, 3));
    const sidx: number[] = [];
    for (let n = 0; n < ring.length - 1; n++) { const a = n * 2, b = a + 1, c = a + 2, d = a + 3; sidx.push(a, b, c, b, d, c); }
    sg.setIndex(sidx); sg.computeVertexNormals();
    this.skirt = new THREE.Mesh(sg, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
    this.skirt.userData.ring = ring;

    // the sea: a translucent slab (sides) with a swelling surface on top
    const seaG = new THREE.BoxGeometry(ny - 1.3, SEA - BASE - 0.4, nx - 1.3);
    this.seaBox = new THREE.Mesh(seaG, new THREE.MeshPhongMaterial({ color: 0x1f6aa5, transparent: true, opacity: 0.5, depthWrite: false }));
    this.seaBox.position.set(this.wx((ny - 1) / 2), (SEA - 0.4 + BASE) / 2, this.wz((nx - 1) / 2));
    this.seaBox.renderOrder = 2;
    this.sea = new SeaSurface(ny - 1.3, nx - 1.3, this.wx((ny - 1) / 2), this.wz((nx - 1) / 2));

    // drops: one instanced glossy sphere per water parcel
    const dg = new THREE.SphereGeometry(1, 12, 8);
    this.drops = new THREE.InstancedMesh(dg, new THREE.MeshPhongMaterial({ color: 0xffffff, shininess: 160, specular: 0xcfeeff, emissive: 0x0a2c4a }), s.px.length);
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

    this.forest = new Forest(s, this.wx, this.wz);
    this.clouds = new Clouds(ny + 60);
    this.salmon = new SalmonLayer(this.color, this.wx, this.wz);

    this.scene.add(this.terrain, this.river, this.skirt, this.seaBox, this.sea.mesh, this.drops, this.spring, this.forest.group, this.clouds.group, this.salmon.group);
    this.frameCamera();
  }

  private frameCamera() {
    if (!this.nx) return;
    const span = Math.max(this.ny, this.nx * 1.3);
    const aspect = this.size[0] / Math.max(1, this.size[1]);
    const dist = (span * 0.66) / Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) / Math.min(1.5, Math.max(0.6, aspect));
    this.camBase.pos.set(-6, dist * 0.68, dist * 0.74);
    this.camBase.tgt.set(-2, 2, 0);
    if (!this.camInit) { this.camPos.copy(this.camBase.pos); this.camTgt.copy(this.camBase.tgt); this.camInit = true; }
  }

  private updateCamera(s: WatershedSnapshot, dt: number, t: number) {
    const lead = s.salmon ? this.salmon?.leaderWorld(this.tmpV2) : null;
    let pos = this.camBase.pos, tgt = this.camBase.tgt;
    if (lead) {
      // follow the school: closer, from slightly downstream, so dodges read clearly
      tgt = lead.set(lead.x - 4, lead.y, lead.z * 0.5);
      pos = this.tmpV.set(tgt.x - 8, tgt.y + 78, tgt.z + 46);
    }
    const k = 1 - Math.exp(-dt * 1.2);
    this.camPos.lerp(pos, k); this.camTgt.lerp(tgt, k);
    // a gentle breathing drift so the diorama feels alive
    this.camera.position.set(this.camPos.x + Math.sin(t * 0.05) * 3, this.camPos.y + Math.sin(t * 0.07) * 1.5, this.camPos.z);
    this.camera.lookAt(this.camTgt);
  }

  private updateTerrain(s: WatershedSnapshot) {
    const { nx, ny, h, h0, hard } = s;
    const g = this.terrain!.geometry, pos = g.getAttribute('position') as THREE.BufferAttribute, nor = g.getAttribute('normal') as THREE.BufferAttribute, col = g.getAttribute('color') as THREE.BufferAttribute;
    const P = pos.array as Float32Array, N = nor.array as Float32Array, CA = col.array as Float32Array;
    const at = (i: number, j: number) => h[Math.min(ny - 1, Math.max(0, j)) * nx + Math.min(nx - 1, Math.max(0, i))];
    const c = this.tmpC;
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const k = j * nx + i, z = h[k], o = k * 3;
      P[o + 1] = z;
      const dx = (at(i, j + 1) - at(i, j - 1)) / 2, dz = (at(i + 1, j) - at(i - 1, j)) / 2;
      const inv = 1 / Math.hypot(dx, 1, dz);
      N[o] = -dx * inv; N[o + 1] = inv; N[o + 2] = -dz * inv;
      const slope = Math.hypot(dx, dz);
      if (z < SEA) c.copy(C.seabed).multiplyScalar(Math.max(0.55, 1 + z * 0.06));
      else {
        c.copy(C.meadow).lerp(C.grass, Math.min(1, z / 10));
        c.lerp(C.rock, Math.min(1, Math.max(0, (z - 18) / 8, (slope - 0.9) * 1.5)));
        c.lerp(C.strata, Math.min(1, Math.max(0, 0.75 - hard[k])) * 1.2);
        if (z > 28) c.lerp(C.snow, Math.min(1, (z - 28) / 3));
      }
      const d = z - h0[k];
      if (d < -0.15) {
        c.lerp(-d > 3 ? C.canyon : C.earth, Math.min(1, -d / 2.5));
        if (-d > 2) c.multiplyScalar(0.9 + 0.1 * Math.sin(z * 2.2)); // strata bands in the canyon walls
      } else if (d > 0.1) c.lerp(C.silt, Math.min(0.9, d / 1.5));
      if (this.wEma[k] > 0.05 && z >= SEA) c.lerp(C.wet, 0.3);
      CA[o] = c.r; CA[o + 1] = c.g; CA[o + 2] = c.b;
    }
    pos.needsUpdate = nor.needsUpdate = col.needsUpdate = true;
    g.computeBoundingSphere();

    const ring = this.skirt!.userData.ring as Array<[number, number]>;
    const sp = (this.skirt!.geometry.getAttribute('position') as THREE.BufferAttribute);
    ring.forEach(([i, j], n) => { (sp.array as Float32Array)[n * 6 + 1] = Math.max(h[j * nx + i], BASE + 0.5); });
    sp.needsUpdate = true;
  }

  private updateRiver(s: WatershedSnapshot) {
    const { nx, ny, h, w } = s, B = this.wBlur, E = this.wEma;
    // 3×3 blur, then a time EMA so the surface reads as a calm body of water, not flickering splats
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      let a = 0, n = 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        const jj = j + dj, ii = i + di;
        if (jj < 0 || jj >= ny || ii < 0 || ii >= nx) continue;
        const wt = di === 0 && dj === 0 ? 4 : 1;
        a += w[jj * nx + ii] * wt; n += wt;
      }
      const k = j * nx + i;
      B[k] = a / n; E[k] += (B[k] - E[k]) * 0.25;
    }
    const g = this.river!.geometry, pos = g.getAttribute('position') as THREE.BufferAttribute, nor = g.getAttribute('normal') as THREE.BufferAttribute;
    const P = pos.array as Float32Array, N = nor.array as Float32Array;
    const surf = (k: number) => (E[k] > 0.04 && h[k] > SEA - 0.2 ? h[k] + E[k] * 0.9 + 0.05 : h[k] - 0.4);
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const k = j * nx + i, o = k * 3;
      P[o + 1] = surf(k);
      const dx = (surf(Math.min(ny - 1, j + 1) * nx + i) - surf(Math.max(0, j - 1) * nx + i)) / 2;
      const dz = (surf(j * nx + Math.min(nx - 1, i + 1)) - surf(j * nx + Math.max(0, i - 1))) / 2;
      const inv = 1 / Math.hypot(dx, 1, dz);
      N[o] = -dx * inv; N[o + 1] = inv; N[o + 2] = -dz * inv;
    }
    pos.needsUpdate = nor.needsUpdate = true;
    g.computeBoundingSphere();
  }

  /** Place drops, extrapolated `ahead` seconds along their velocity (smooth between 30 Hz sim ticks). */
  private updateDrops(s: WatershedSnapshot, ahead: number) {
    const d = this.drops!, { nx, ny, h } = s;
    const n = Math.min(s.n, s.px.length);
    for (let q = 0; q < n; q++) {
      const vx = s.pvx[q], vy = s.pvy[q], vol = s.pvol[q];
      const x = s.px[q] + vx * ahead, y = s.py[q] + vy * ahead;
      const ground = Math.max(SEA, sample(h, nx, ny, x, y)), depth = sample(this.wEma, nx, ny, x, y);
      const r = DROP_SCALE * this.dropK * Math.cbrt(vol);
      const sp = Math.hypot(vx, vy);
      const groundAhead = Math.max(SEA, sample(h, nx, ny, x + vx * 0.1, y + vy * 0.1));
      this.dir.set(vy, (groundAhead - ground) * 10, vx);
      if (this.dir.lengthSq() < 1e-6) this.dir.set(1, 0, 0);
      this.dir.normalize();
      this.q.setFromUnitVectors(this.X, this.dir);
      this.v.set(this.wx(y), ground + depth * 0.9 + r * 0.55, this.wz(x));
      this.sc.set(r * (1 + Math.min(1, sp * 0.07)), r * 0.9, r * 0.9);
      this.m.compose(this.v, this.q, this.sc);
      d.setMatrixAt(q, this.m);
      if (this.dropsDirty) {
        this.tmpC.copy(C.drop).lerp(C.mud, Math.min(0.45, (s.psed[q] / Math.max(0.01, vol)) * 2)).lerp(C.foam, Math.min(0.55, Math.max(0, sp - 5) * 0.1));
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
      if (s.t < 8) this.popup('intro');
      return;
    }
    for (const c of list) {
      if (c.id <= this.lastCue) continue;
      this.lastCue = c.id;
      const d = c.data ?? {};
      switch (c.type) {
        case 'blockStart':
          if (d.style !== 'salmon' && Number(d.index) > 0) { this.hud?.popup(String(d.name), BLOCK_SUB[String(d.style)] ?? '', 3.5); play('chime', { vol: 0.7 }); }
          break;
        case 'salmonRun': this.popup('salmonRun'); play('splash'); play('reward', { vol: 0.6 }); break;
        case 'salmonHome': this.hud?.popup(`${d.fish} salmon home!`, 'They made it to the spring', 3, 'salmon'); play('reward'); break;
        case 'salmonStuck': this.popup('salmonStuck'); play('deny', { vol: 0.6 }); break;
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
  private popup(key: keyof typeof POPUPS) { const [t, sub, sec, tone] = POPUPS[key]; this.hud?.popup(t, sub, sec, tone); }

  private sound(s: WatershedSnapshot) {
    const flow = Math.min(1, s.n / 2200);
    // the river: a low rumble when grinding (heavy water), a bright hiss when spinning (light, fast water)
    setAmbient('river', 0.06 + 0.28 * flow, 260 + 1500 * s.cadNorm, 0.9);
    setAmbient('surf', 0.07, 420, 0.5);
  }

  render(snapshot: unknown, _bike: Readonly<BikeState>, _input: Readonly<InputState>) {
    const s = snapshot as WatershedSnapshot;
    if (!this.renderer || !s || !s.h) return;
    if (!this.terrain) this.build(s);
    const tNow = now();
    const dt = this.lastFrame ? Math.min(0.1, (tNow - this.lastFrame) / 1000) : 1 / 60;
    this.lastFrame = tNow;
    if (s.version !== this.lastVersion) {
      this.lastVersion = s.version; this.versionAt = tNow; this.dropsDirty = true;
      this.updateRiver(s); this.updateTerrain(s);
      this.treeAcc += dt;
      if (this.treeAcc > 0.25) { this.forest!.update(s, this.treeAcc); this.treeAcc = 0; }
    }
    // during the salmon run the river becomes the backdrop: smaller drops so the school stands out
    this.dropK += ((s.salmon ? 0.55 : 1) - this.dropK) * (1 - Math.exp(-dt * 2));
    this.updateDrops(s, Math.min(1 / 20, (tNow - this.versionAt) / 1000));
    const t = s.t;
    this.spring.position.set(this.wx(2), sample(s.h, s.nx, s.ny, s.sourceX, 2), this.wz(s.sourceX));
    const ph = (t * 0.8) % 1;
    this.springRing!.scale.setScalar(1 + 0.25 * ph); (this.springRing!.material as THREE.MeshBasicMaterial).opacity = 0.6 * (1 - ph);
    this.spring.visible = !s.salmon;
    this.clouds!.update(dt);
    this.sea!.update(tNow / 1000);
    this.salmon!.update(s, s.salmon, dt, tNow / 1000);
    this.updateCamera(s, dt, tNow / 1000);
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
