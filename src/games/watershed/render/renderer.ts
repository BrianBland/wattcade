// Watershed renderer: the valley as a little 3D diorama. Terrain mesh follows the eroding heightfield, a translucent
// river surface follows the water-depth grid, and every water parcel is an exaggerated glossy drop stretched along
// its velocity (muddy when it carries silt). Reads only the sim snapshot. Plain shading on purpose: polish comes later.
import * as THREE from 'three';
import type { BikeState, GameRenderer, InputState, Insets, Profile } from '../../../contracts';
import type { WatershedSnapshot } from '../sim/sim';
import { SEA, sample } from '../sim/terrain';
import { Hud } from './hud';
import { layout } from './layout';

const BASE = -10;          // diorama floor
const DROP_SCALE = 0.85;   // drop radius per cbrt(volume): exaggerated on purpose

const C = {
  grass: new THREE.Color(0x5f8f45), meadow: new THREE.Color(0x87a957), rock: new THREE.Color(0x8d8070), snow: new THREE.Color(0xf2f5f7),
  strata: new THREE.Color(0xb98a6a), earth: new THREE.Color(0x8a5a3a), canyon: new THREE.Color(0xb5603d),
  silt: new THREE.Color(0xd9c58e), seabed: new THREE.Color(0xc9b98a), skirt: new THREE.Color(0x6b4a33),
  drop: new THREE.Color(0x3fa6ff), mud: new THREE.Color(0xa8692e),
};

export class WatershedRenderer implements GameRenderer {
  private renderer?: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(38, 4 / 3, 1, 1200);
  private terrain?: THREE.Mesh; private river?: THREE.Mesh; private skirt?: THREE.Mesh; private sea?: THREE.Mesh;
  private drops?: THREE.InstancedMesh; private spring = new THREE.Group();
  private hud?: Hud;
  private container?: HTMLElement; private ro?: ResizeObserver;
  private size: [number, number] = [800, 600]; private insetB = 0;
  private nx = 0; private ny = 0; private lastVersion = -1;
  private wBlur = new Float32Array(0);
  private color = '#d64545';
  private m = new THREE.Matrix4(); private q = new THREE.Quaternion(); private v = new THREE.Vector3(); private sc = new THREE.Vector3(); private dir = new THREE.Vector3();
  private X = new THREE.Vector3(1, 0, 0); private tmpC = new THREE.Color();

  mount(container: HTMLElement, ctx: { profile: Readonly<Profile>; send?: (action: unknown) => void; insets?: Insets }) {
    this.insetB = ctx.insets?.bottom ?? 0;
    this.container = container; this.color = ctx.profile.color;
    const r = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(2, typeof devicePixelRatio === 'number' ? devicePixelRatio : 1));
    r.domElement.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none';
    container.appendChild(r.domElement);
    this.renderer = r;

    const s = this.scene;
    s.background = new THREE.Color(0xbfe3f5);
    s.fog = new THREE.Fog(0xbfe3f5, 260, 520);
    const sun = new THREE.DirectionalLight(0xfff4e0, 2.2); sun.position.set(-60, 120, 80);
    s.add(sun, new THREE.HemisphereLight(0xd8eeff, 0x55603a, 1.3));

    this.hud = new Hud(container);
    this.hud.setInsetBottom(this.insetB);
    this.resize(container.clientWidth || 800, container.clientHeight || 600);
    if (typeof ResizeObserver !== 'undefined') {
      this.ro = new ResizeObserver(() => this.resize(container.clientWidth || 800, container.clientHeight || 600));
      this.ro.observe(container);
    }
  }

  /** Grid (i across, j downstream) → world: X downstream (screen right), Z across (toward the camera), Y up. */
  private wx(j: number) { return j - this.ny / 2; }
  private wz(i: number) { return i - this.nx / 2; }

  private build(s: WatershedSnapshot) {
    const { nx, ny } = s;
    this.nx = nx; this.ny = ny;
    this.wBlur = new Float32Array(nx * ny);
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
    this.river = new THREE.Mesh(grid(false), new THREE.MeshPhongMaterial({ color: 0x2f8fd6, transparent: true, opacity: 0.62, shininess: 90, specular: 0xffffff, depthWrite: false }));
    this.river.renderOrder = 1;

    // diorama skirt: a vertical wall around the grid edge, from the terrain down to BASE
    const ring: Array<[number, number]> = [];
    for (let i = 0; i < nx; i++) ring.push([i, 0]);
    for (let j = 1; j < ny; j++) ring.push([nx - 1, j]);
    for (let i = nx - 2; i >= 0; i--) ring.push([i, ny - 1]);
    for (let j = ny - 2; j > 0; j--) ring.push([0, j]);
    ring.push(ring[0]);
    const sp = new Float32Array(ring.length * 2 * 3);
    ring.forEach(([i, j], n) => { sp.set([this.wx(j), 0, this.wz(i), this.wx(j), BASE, this.wz(i)], n * 6); });
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(sp, 3).setUsage(THREE.DynamicDrawUsage));
    const sidx: number[] = [];
    for (let n = 0; n < ring.length - 1; n++) { const a = n * 2, b = a + 1, c = a + 2, d = a + 3; sidx.push(a, b, c, b, d, c); }
    sg.setIndex(sidx); sg.computeVertexNormals();
    this.skirt = new THREE.Mesh(sg, new THREE.MeshLambertMaterial({ color: C.skirt, side: THREE.DoubleSide }));
    this.skirt.userData.ring = ring;

    // the sea: a translucent slab over the grid, below sea level the terrain shows through
    const seaG = new THREE.BoxGeometry(ny - 1.3, SEA - BASE - 0.3, nx - 1.3);
    this.sea = new THREE.Mesh(seaG, new THREE.MeshPhongMaterial({ color: 0x2a78b5, transparent: true, opacity: 0.55, shininess: 110, specular: 0xffffff, depthWrite: false }));
    this.sea.position.set(this.wx((ny - 1) / 2), (SEA + BASE) / 2 + 0.05, this.wz((nx - 1) / 2));
    this.sea.renderOrder = 2;

    // the drops: one instanced glossy sphere per water parcel
    const dg = new THREE.SphereGeometry(1, 10, 7);
    this.drops = new THREE.InstancedMesh(dg, new THREE.MeshPhongMaterial({ color: 0xffffff, shininess: 120, specular: 0x9fd8ff }), s.px.length);
    this.drops.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.drops.setColorAt(0, C.drop);
    this.drops.frustumCulled = false;

    // the spring: a ring of stones with a pillar in the rider's colour
    const stone = new THREE.MeshLambertMaterial({ color: 0x9a948a });
    for (let a = 0; a < 7; a++) {
      const m = new THREE.Mesh(new THREE.DodecahedronGeometry(0.9), stone);
      m.position.set(Math.cos((a / 7) * Math.PI * 2) * 2.6, 0.3, Math.sin((a / 7) * Math.PI * 2) * 2.6);
      this.spring.add(m);
    }
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 7, 8), new THREE.MeshLambertMaterial({ color: this.color, emissive: this.color, emissiveIntensity: 0.35 }));
    pillar.position.y = 3.5; this.spring.add(pillar);

    this.scene.add(this.terrain, this.river, this.skirt, this.sea, this.drops, this.spring);
    this.frameCamera();
  }

  private frameCamera() {
    if (!this.nx) return;
    const span = Math.max(this.ny, this.nx * 1.3);
    const aspect = this.size[0] / Math.max(1, this.size[1]);
    const dist = (span * 0.66) / Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) / Math.min(1.5, Math.max(0.6, aspect));
    this.camera.position.set(-6, dist * 0.68, dist * 0.74);
    this.camera.lookAt(-2, 2, 0);
  }

  private updateTerrain(s: WatershedSnapshot) {
    const { nx, ny, h, h0, hard, w } = s;
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
      if (d < -0.15) c.lerp(-d > 3 ? C.canyon : C.earth, Math.min(1, -d / 2.5));
      else if (d > 0.1) c.lerp(C.silt, Math.min(0.9, d / 1.5));
      if (w[k] > 0.05 && z >= SEA) c.multiplyScalar(0.75);
      CA[o] = c.r; CA[o + 1] = c.g; CA[o + 2] = c.b;
    }
    pos.needsUpdate = nor.needsUpdate = col.needsUpdate = true;

    // skirt follows the edge heights
    const ring = this.skirt!.userData.ring as Array<[number, number]>;
    const sp = (this.skirt!.geometry.getAttribute('position') as THREE.BufferAttribute);
    ring.forEach(([i, j], n) => { (sp.array as Float32Array)[n * 6 + 1] = Math.max(h[j * nx + i], BASE + 0.5); });
    sp.needsUpdate = true;
  }

  private updateRiver(s: WatershedSnapshot) {
    const { nx, ny, h, w } = s, B = this.wBlur;
    // 3×3 blur so the surface reads as a body of water, not a heap of splats
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      let a = 0, n = 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        const jj = j + dj, ii = i + di;
        if (jj < 0 || jj >= ny || ii < 0 || ii >= nx) continue;
        a += w[jj * nx + ii] * (di === 0 && dj === 0 ? 4 : 1); n += di === 0 && dj === 0 ? 4 : 1;
      }
      B[j * nx + i] = a / n;
    }
    const g = this.river!.geometry, pos = g.getAttribute('position') as THREE.BufferAttribute, nor = g.getAttribute('normal') as THREE.BufferAttribute;
    const P = pos.array as Float32Array, N = nor.array as Float32Array;
    const surf = (k: number) => (B[k] > 0.04 && h[k] > SEA - 0.2 ? h[k] + B[k] * 0.9 + 0.05 : h[k] - 0.4);
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const k = j * nx + i, o = k * 3;
      P[o + 1] = surf(k);
      const dx = (surf(Math.min(ny - 1, j + 1) * nx + i) - surf(Math.max(0, j - 1) * nx + i)) / 2;
      const dz = (surf(j * nx + Math.min(nx - 1, i + 1)) - surf(j * nx + Math.max(0, i - 1))) / 2;
      const inv = 1 / Math.hypot(dx, 1, dz);
      N[o] = -dx * inv; N[o + 1] = inv; N[o + 2] = -dz * inv;
    }
    pos.needsUpdate = nor.needsUpdate = true;
  }

  private updateDrops(s: WatershedSnapshot) {
    const d = this.drops!, { nx, ny, h } = s;
    const n = Math.min(s.n, d.count);
    for (let q = 0; q < n; q++) {
      const x = s.px[q], y = s.py[q], vx = s.pvx[q], vy = s.pvy[q], vol = s.pvol[q];
      const ground = sample(h, nx, ny, x, y), depth = sample(this.wBlur, nx, ny, x, y);
      const r = DROP_SCALE * Math.cbrt(vol);
      const top = Math.max(ground, SEA) + depth * 0.9;
      const sp = Math.hypot(vx, vy);
      const ahead = sample(h, nx, ny, x + vx * 0.1, y + vy * 0.1);
      this.dir.set(vy, (Math.max(SEA, ahead) - Math.max(SEA, ground)) * 10, vx);
      if (this.dir.lengthSq() < 1e-6) this.dir.set(1, 0, 0);
      this.dir.normalize();
      this.q.setFromUnitVectors(this.X, this.dir);
      this.v.set(this.wx(y), top + r * 0.55, this.wz(x));
      this.sc.set(r * (1 + Math.min(1, sp * 0.07)), r * 0.9, r * 0.9);
      this.m.compose(this.v, this.q, this.sc);
      d.setMatrixAt(q, this.m);
      d.setColorAt(q, this.tmpC.copy(C.drop).lerp(C.mud, Math.min(0.7, (s.psed[q] / Math.max(0.01, vol)) * 3)));
    }
    d.count = n;
    d.instanceMatrix.needsUpdate = true;
    if (d.instanceColor) d.instanceColor.needsUpdate = true;
  }

  render(snapshot: unknown, _bike: Readonly<BikeState>, _input: Readonly<InputState>) {
    const s = snapshot as WatershedSnapshot;
    if (!this.renderer || !s || !s.h) return;
    if (!this.terrain) this.build(s);
    if (s.version !== this.lastVersion) {
      this.lastVersion = s.version;
      this.updateTerrain(s); this.updateRiver(s); this.updateDrops(s);
    }
    const sx = s.sourceX;
    this.spring.position.set(this.wx(2), sample(s.h, s.nx, s.ny, sx, 2), this.wz(sx));
    this.hud?.setRpmRange(s.rpmLow, s.rpmHigh);
    this.hud?.update(s);
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
    this.hud?.unmount();
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose()); else mat?.dispose();
    });
    this.renderer?.dispose();
    this.renderer?.domElement.remove();
  }
}
