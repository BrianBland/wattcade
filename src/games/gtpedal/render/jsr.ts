// Jet Set Radio-style beauty pass for ONE sliver (the sunken plaza corner). Render-only, no new deps.
// Toon ramp shading (MeshToonMaterial + 3-step gradient), ink outlines (scaled inverted hulls), calm natural palette,
// hand-shaped props, sky gradient, flat cel shadows, and a light grade post pass
// (cadenza Post pattern) that only runs while the camera is near the sliver.
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { heightAt, PLAZA } from '../sim/world';

export type ArtStyle = 'sliver' | 'classic';
/** The styled sliver: sunken plaza + the tower on its east side. */
export const SLIVER = { x0: PLAZA.x0 - 4, z0: PLAZA.z0 - 8, x1: 96, z1: PLAZA.z1 + 4 };
/** 1 inside the sliver, fading to 0 over `fade` m outside. */
export function sliverAmt(x: number, z: number, fade = 25): number {
  const dx = Math.max(SLIVER.x0 - x, 0, x - SLIVER.x1), dz = Math.max(SLIVER.z0 - z, 0, z - SLIVER.z1);
  return Math.max(0, 1 - Math.hypot(dx, dz) / fade);
}
// calm, grounded palette (names kept for the prop code): brick/terracotta, sandstone, sage, deep green, weathered wood, slate, cream
export const JSR = { pink: 0xb5543a, lime: 0x8fa77a, cyan: 0x6f7f86, yellow: 0xe9dcc0, orange: 0x9a7350, violet: 0x4f5a5e, ink: 0x3a2618, shadow: 0x4a3a2e, skyTop: 0x7fa6c9, skyMid: 0xb9cfdc, skyLow: 0xeee3cf, sand: 0xd8c29a, deep: 0x3f6b45 };

let RAMP: THREE.DataTexture | null = null;
function ramp(): THREE.DataTexture {
  if (RAMP) return RAMP;
  const d = new Uint8Array([90, 90, 90, 255, 180, 180, 180, 255, 255, 255, 255, 255]);
  RAMP = new THREE.DataTexture(d, 3, 1, THREE.RGBAFormat); RAMP.minFilter = RAMP.magFilter = THREE.NearestFilter; RAMP.needsUpdate = true;
  return RAMP;
}
export const toon = (color: number, map?: THREE.Texture) => new THREE.MeshToonMaterial({ color, gradientMap: ramp(), ...(map ? { map } : {}) });
const INK = new THREE.MeshBasicMaterial({ color: JSR.ink, side: THREE.BackSide });
/** Ink outline: a slightly scaled back-face copy. Cheap and gap-free on convex primitives. */
export function inked(mesh: THREE.Mesh, thick = 0.06): THREE.Mesh {
  thick *= 0.7;
  mesh.geometry.computeBoundingBox();
  const s = mesh.geometry.boundingBox!.getSize(new THREE.Vector3());
  const hull = new THREE.Mesh(mesh.geometry, INK);
  hull.scale.set(1 + (2 * thick) / Math.max(0.05, s.x), 1 + (2 * thick) / Math.max(0.05, s.y), 1 + (2 * thick) / Math.max(0.05, s.z));
  hull.name = 'ink'; mesh.add(hull);
  return mesh;
}
const part = (geo: THREE.BufferGeometry, color: number, x: number, y: number, z: number, thick = 0.05) => { const m = inked(new THREE.Mesh(geo, toon(color)), thick); m.position.set(x, y, z); return m; };

const SHADOW = new THREE.MeshBasicMaterial({ color: JSR.shadow, transparent: true, opacity: 0.42, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
/** Flat cel shadow: a blob under the prop plus a sheared slab cast away from the sun (-x,-z). */
function celShadow(r: number, h: number): THREE.Group {
  const g = new THREE.Group();
  const blob = new THREE.Mesh(new THREE.CircleGeometry(r, 12), SHADOW); blob.rotation.x = -Math.PI / 2; g.add(blob);
  const len = h * 0.7, w = r * 1.2, shp = new THREE.Shape();
  shp.moveTo(-w / 2, 0); shp.lineTo(w / 2, 0); shp.lineTo(w / 2 * 0.7 - len * 0.45, len); shp.lineTo(-w / 2 * 0.7 - len * 0.45, len); shp.closePath();
  const cast = new THREE.Mesh(new THREE.ShapeGeometry(shp), SHADOW); cast.rotation.set(-Math.PI / 2, 0, Math.PI * 0.8); g.add(cast);
  g.position.y = 0.03;
  return g;
}

// ---- props (hand-shaped from a few primitives each) ----
function bench(): THREE.Group {
  const g = new THREE.Group();
  for (let i = 0; i < 3; i++) g.add(part(new THREE.BoxGeometry(2.4, 0.12, 0.22), JSR.orange, 0, 0.55, -0.25 + i * 0.25, 0.03));
  for (let i = 0; i < 2; i++) g.add(part(new THREE.BoxGeometry(2.4, 0.12, 0.12), JSR.orange, 0, 0.85 + i * 0.25, 0.4, 0.03));
  for (const sx of [-1, 1]) { const leg = part(new THREE.CylinderGeometry(0.06, 0.08, 0.55, 6), JSR.ink, sx * 1.0, 0.27, 0, 0.02); g.add(leg); const arm = part(new THREE.TorusGeometry(0.3, 0.05, 4, 8, Math.PI), JSR.violet, sx * 1.15, 0.6, 0.05, 0.02); arm.rotation.y = Math.PI / 2; g.add(arm); }
  g.add(celShadow(1.3, 1.2));
  return g;
}
function planter(color: number): THREE.Group {
  const g = new THREE.Group();
  g.add(part(new THREE.CylinderGeometry(1.1, 0.8, 0.9, 8), color, 0, 0.45, 0, 0.06));
  for (let i = 0; i < 5; i++) { const a = i * 1.26; g.add(part(new THREE.IcosahedronGeometry(0.45, 0), i % 2 ? JSR.lime : JSR.deep, Math.cos(a) * 0.5, 1.05 + (i % 2) * 0.2, Math.sin(a) * 0.5, 0.04)); }
  
  g.add(celShadow(1.2, 1.4));
  return g;
}
function tree(k: number): THREE.Group {
  const g = new THREE.Group();
  const trunk = part(new THREE.CylinderGeometry(0.22, 0.38, 3, 6), 0x6b4a33, 0, 1.5, 0, 0.05); trunk.rotation.z = 0.08 * (k % 3 - 1); g.add(trunk);
  const cols = [JSR.lime, JSR.deep, 0x6c8a5a];
  for (let i = 0; i < 3; i++) { const b = part(new THREE.IcosahedronGeometry(1.5 - i * 0.3, 0), cols[(i + k) % 3], (i - 1) * 0.6, 3.4 + i * 0.9, (i % 2) * 0.4, 0.08); b.rotation.set(i, k, 0); g.add(b); }
  g.add(celShadow(1.6, 5.5));
  return g;
}
function lamp(): THREE.Group {
  const g = new THREE.Group();
  g.add(part(new THREE.CylinderGeometry(0.1, 0.16, 4.6, 6), JSR.violet, 0, 2.3, 0, 0.04));
  const arm = part(new THREE.TorusGeometry(0.6, 0.07, 4, 10, Math.PI), JSR.violet, 0.6, 4.6, 0, 0.03); g.add(arm);
  const head = part(new THREE.ConeGeometry(0.42, 0.5, 6), JSR.pink, 1.2, 4.45, 0, 0.04); g.add(head);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), new THREE.MeshBasicMaterial({ color: 0xfff1d0 })); bulb.position.set(1.2, 4.15, 0); g.add(bulb);
  g.add(celShadow(0.5, 4.8));
  return g;
}
function ledge(len: number): THREE.Group {
  const g = new THREE.Group();
  const m = inked(new THREE.Mesh(new THREE.BoxGeometry(len, 1.1, 0.8), toon(JSR.sand)), 0.05);
  m.position.y = 0.55; g.add(m); g.add(celShadow(len / 2, 1.1));
  return g;
}

// ---- post grade (cadenza Post pattern; one cheap full-screen pass) ----
const GRADE = {
  uniforms: { tDiffuse: { value: null as THREE.Texture | null }, uAmt: { value: 0 } },
  vertexShader: /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
uniform sampler2D tDiffuse; uniform float uAmt; varying vec2 vUv;
void main() {
  vec3 c = texture2D(tDiffuse, vUv).rgb;
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  vec3 g = mix(vec3(l), c, 1.08);                       // a touch of saturation
  g = floor(g * 8.0 + 0.5) / 8.0 * 0.08 + g * 0.92;      // barely-there banding
  g = (g - 0.5) * 1.03 + 0.505;                         // gentle contrast
  g *= mix(vec3(1.0), vec3(1.03, 1.0, 0.95), 1.0);      // magenta-warm tint
  float v = smoothstep(0.95, 0.35, length(vUv - 0.5)); g *= 0.9 + 0.1 * v;
  gl_FragColor = vec4(mix(c, clamp(g, 0.0, 1.0), uAmt), 1.0);
}`,
};

export class JsrSliver {
  readonly group = new THREE.Group();
  private sky: THREE.Mesh; private skyU = { uTop: { value: new THREE.Color(JSR.skyTop) }, uMid: { value: new THREE.Color(JSR.skyMid) }, uLow: { value: new THREE.Color(JSR.skyLow) }, uFlat: { value: new THREE.Color(0x9fd8ff) }, uAmt: { value: 0 } };
  private composer?: EffectComposer; private grade?: ShaderPass;
  private styledBuildings: Array<{ mesh: THREE.Mesh; classic: THREE.Material; jsr: THREE.Material; hull: THREE.Mesh }> = [];
  private riderParts: Array<{ mesh: THREE.Mesh; classic: THREE.Material; hull: THREE.Mesh }> = [];
  private riderToon = new Map<THREE.Mesh, THREE.MeshToonMaterial>();
  private style: ArtStyle = 'sliver';

  constructor(scene: THREE.Scene) {
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(600, 24, 12), new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false, uniforms: this.skyU,
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform vec3 uTop; uniform vec3 uMid; uniform vec3 uLow; uniform vec3 uFlat; uniform float uAmt; varying vec3 vP;
        void main(){ float y = vP.y; vec3 c = y > 0.12 ? mix(uMid, uTop, smoothstep(0.12, 0.7, y)) : mix(uLow, uMid, smoothstep(-0.05, 0.12, y));
          
          gl_FragColor = vec4(mix(uFlat, c, uAmt), 1.0); }`,
    }));
    this.sky.renderOrder = -1; this.sky.frustumCulled = false;
    scene.add(this.sky, this.group);
    this.build();
  }

  private build() {
    const G = this.group;
    // sandstone paving following the plaza steps
    const W = SLIVER.x1 - SLIVER.x0 - 4, D = SLIVER.z1 - SLIVER.z0, geo = new THREE.PlaneGeometry(W, D, 48, 64); geo.rotateX(-Math.PI / 2);
    const cx = SLIVER.x0 + W / 2, cz = SLIVER.z0 + D / 2, p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) p.setY(i, heightAt(p.getX(i) + cx, p.getZ(i) + cz) + 0.03);
    geo.computeVertexNormals();
    const floor = new THREE.Mesh(geo, toon(0xcdb894)); floor.position.set(cx, 0, cz); // sandstone paving
    (floor.material as THREE.Material).polygonOffset = true; (floor.material as THREE.Material).polygonOffsetFactor = -1;
    G.add(floor);
    // stair nosings: bold stripes on each step edge
    for (let k = 1; k <= 5; k++) { const z = PLAZA.stairsZ + (PLAZA.stairsLen * k) / 5 - 0.05; const st = new THREE.Mesh(new THREE.BoxGeometry(PLAZA.x1 - PLAZA.x0, 0.08, 0.25), toon(k % 2 ? JSR.yellow : 0xa89a85)); st.position.set((PLAZA.x0 + PLAZA.x1) / 2, heightAt(50, z - 0.3) + 0.07, z - 0.12); G.add(st); }
    const y = (x: number, z: number) => heightAt(x, z);
    const put = (o: THREE.Object3D, x: number, z: number, ry = 0) => { o.position.set(x, y(x, z), z); o.rotation.y = ry; G.add(o); };
    put(bench(), 40, 50, 0); put(bench(), 60, 50, 0); put(bench(), 50, 66, Math.PI); put(bench(), 72, 60, -Math.PI / 2);
    put(planter(JSR.pink), 35, 40); put(planter(JSR.cyan), 75, 40); put(planter(JSR.violet), 35, 72); put(planter(JSR.orange), 75, 74);
    [[32, 28], [48, 26], [64, 27], [80, 28], [88, 50], [88, 70], [33, 58]].forEach(([x, z], k) => put(tree(k), x, z));
    [[42, 34.5], [58, 34.5], [30, 48], [90, 40], [90, 62], [50, 82]].forEach(([x, z], k) => put(lamp(), x, z, k * 1.3));
    put(ledge(10), 50, 58, 0); put(ledge(8), 82, 56, Math.PI / 2);
  }

  /** Toon + ink the buildings inside the sliver (material swap so 'classic' can switch back). */
  styleBuildings(meshes: Array<{ mesh: THREE.Mesh; b: { x0: number; z0: number; x1: number; z1: number } }>) {
    const cols = [0xa8573d, 0xc9a77c, 0x7d8a72, 0x6f7479]; // brick, sandstone, sage, slate
    meshes.forEach(({ mesh, b }, i) => {
      const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2;
      if (sliverAmt(cx, cz, 0) <= 0 && !(b.x0 <= SLIVER.x1 && b.x1 >= SLIVER.x0 && b.z0 <= SLIVER.z1 && b.z1 >= SLIVER.z0)) return;
      const hull = new THREE.Mesh(mesh.geometry, INK); hull.scale.setScalar(1.008); hull.name = 'ink'; mesh.add(hull);
      const jsr = toon(cols[i % cols.length]);
      this.styledBuildings.push({ mesh, classic: mesh.material as THREE.Material, jsr, hull });
      if (this.active) mesh.material = jsr; else hull.visible = false;
    });
  }
  /** Rider parts get toon + outline while in the sliver. */
  styleRider(parts: THREE.Mesh[]) {
    for (const m of parts) { const hull = inked(m, 0.05).getObjectByName('ink') as THREE.Mesh; this.riderParts.push({ mesh: m, classic: m.material as THREE.Material, hull }); }
  }

  setStyle(style: ArtStyle) {
    if (style === this.style) return; this.style = style;
    this.group.visible = style !== 'classic';
    for (const s of this.styledBuildings) { s.mesh.material = style === 'classic' ? s.classic : s.jsr; s.hull.visible = style !== 'classic'; }
  }
  get active() { return this.style !== 'classic'; }

  /** amt = how much of the look applies at the camera/rider (0 = classic frame, composer skipped). */
  frame(renderer: THREE.WebGLRenderer, scene: THREE.Scene, cam: THREE.PerspectiveCamera, riderAt: { x: number; z: number }) {
    const amt = this.active ? sliverAmt(riderAt.x, riderAt.z) : 0;
    this.sky.position.copy(cam.position); this.skyU.uAmt.value = amt; this.sky.visible = amt > 0.01;
    const inS = amt > 0.5;
    for (const r of this.riderParts) {
      const base = r.classic as THREE.MeshLambertMaterial;
      let t = this.riderToon.get(r.mesh); if (!t) { t = toon(base.color.getHex()); this.riderToon.set(r.mesh, t); }
      t.color.copy(base.color);
      r.mesh.material = inS ? t : base; r.hull.visible = inS;
    }
    if (scene.fog instanceof THREE.Fog) { scene.fog.color.set(0x9fd8ff).lerp(new THREE.Color(JSR.skyLow), amt * 0.7); }
    if (amt < 0.01) { renderer.render(scene, cam); return; }
    if (!this.composer) {
      this.composer = new EffectComposer(renderer); this.composer.addPass(new RenderPass(scene, cam));
      this.grade = new ShaderPass(GRADE); this.composer.addPass(this.grade); this.composer.addPass(new OutputPass());
      const sz = renderer.getSize(new THREE.Vector2()); this.composer.setSize(sz.x, sz.y);
    }
    (this.grade!.uniforms as typeof GRADE.uniforms).uAmt.value = amt;
    this.composer.render();
  }
  setSize(w: number, h: number) { this.composer?.setSize(w, h); }
  dispose() { if (this.composer) { for (const p of this.composer.passes) p.dispose(); this.composer.dispose(); } }
}
