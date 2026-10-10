// Jet Set Radio-style beauty pass for ONE sliver (the sunken plaza corner). Render-only, no new deps.
// Toon ramp shading (MeshToonMaterial + 3-step gradient), ink outlines (scaled inverted hulls), bold palette,
// procedural graffiti decals, hand-shaped props, sky gradient, flat cel shadows, and a light grade post pass
// (cadenza Post pattern) that only runs while the camera is near the sliver.
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { BUILDINGS, heightAt, PLAZA } from '../sim/world';

export type ArtStyle = 'sliver' | 'classic';
/** The styled sliver: sunken plaza + the tower on its east side. */
export const SLIVER = { x0: PLAZA.x0 - 4, z0: PLAZA.z0 - 8, x1: 96, z1: PLAZA.z1 + 4 };
/** 1 inside the sliver, fading to 0 over `fade` m outside. */
export function sliverAmt(x: number, z: number, fade = 25): number {
  const dx = Math.max(SLIVER.x0 - x, 0, x - SLIVER.x1), dz = Math.max(SLIVER.z0 - z, 0, z - SLIVER.z1);
  return Math.max(0, 1 - Math.hypot(dx, dz) / fade);
}
export const JSR = { pink: 0xff3fa4, lime: 0xb6ff2e, cyan: 0x19e0ff, yellow: 0xffe02e, orange: 0xff7a1a, violet: 0x7a3cff, ink: 0x140a24, shadow: 0x3b1f6b, skyTop: 0x2e7dff, skyMid: 0x7fe9ff, skyLow: 0xfff2a8 };

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
  for (let i = 0; i < 5; i++) { const a = i * 1.26; g.add(part(new THREE.IcosahedronGeometry(0.45, 0), i % 2 ? JSR.lime : 0x2ecc71, Math.cos(a) * 0.5, 1.05 + (i % 2) * 0.2, Math.sin(a) * 0.5, 0.04)); }
  const f = part(new THREE.OctahedronGeometry(0.22, 0), JSR.yellow, 0, 1.55, 0, 0.03); g.add(f);
  g.add(celShadow(1.2, 1.4));
  return g;
}
function tree(k: number): THREE.Group {
  const g = new THREE.Group();
  const trunk = part(new THREE.CylinderGeometry(0.22, 0.38, 3, 6), 0x8a4b2a, 0, 1.5, 0, 0.05); trunk.rotation.z = 0.08 * (k % 3 - 1); g.add(trunk);
  const cols = [JSR.lime, 0x37d67a, JSR.cyan];
  for (let i = 0; i < 3; i++) { const b = part(new THREE.IcosahedronGeometry(1.5 - i * 0.3, 0), cols[(i + k) % 3], (i - 1) * 0.6, 3.4 + i * 0.9, (i % 2) * 0.4, 0.08); b.rotation.set(i, k, 0); g.add(b); }
  g.add(celShadow(1.6, 5.5));
  return g;
}
function lamp(): THREE.Group {
  const g = new THREE.Group();
  g.add(part(new THREE.CylinderGeometry(0.1, 0.16, 4.6, 6), JSR.violet, 0, 2.3, 0, 0.04));
  const arm = part(new THREE.TorusGeometry(0.6, 0.07, 4, 10, Math.PI), JSR.violet, 0.6, 4.6, 0, 0.03); g.add(arm);
  const head = part(new THREE.ConeGeometry(0.42, 0.5, 6), JSR.pink, 1.2, 4.45, 0, 0.04); g.add(head);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), new THREE.MeshBasicMaterial({ color: 0xfff6b0 })); bulb.position.set(1.2, 4.15, 0); g.add(bulb);
  g.add(celShadow(0.5, 4.8));
  return g;
}
function ledge(len: number, map: THREE.Texture): THREE.Group {
  const g = new THREE.Group();
  const m = inked(new THREE.Mesh(new THREE.BoxGeometry(len, 1.1, 0.8), [toon(JSR.cyan), toon(JSR.cyan), toon(JSR.yellow), toon(JSR.cyan), toon(0xffffff, map), toon(0xffffff, map)]), 0.05);
  m.position.y = 0.55; g.add(m); g.add(celShadow(len / 2, 1.1));
  return g;
}

// ---- graffiti (procedural canvas) ----
function graffiti(text: string, w: number, h: number, seed: number): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); if (!g) return null;
  let s = seed; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  g.fillStyle = 'rgba(0,0,0,0)'; g.clearRect(0, 0, w, h);
  const pal = ['#ff3fa4', '#b6ff2e', '#19e0ff', '#ffe02e', '#ff7a1a', '#7a3cff'];
  for (let i = 0; i < 6; i++) { g.fillStyle = pal[Math.floor(rnd() * pal.length)] + '55'; g.beginPath(); g.arc(rnd() * w, rnd() * h, 20 + rnd() * h * 0.3, 0, 7); g.fill(); } // spray clouds
  g.font = `900 ${Math.floor(h * 0.62)}px "Arial Black", Impact, system-ui`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineJoin = 'round';
  const x = w / 2, y = h * 0.52;
  g.save(); g.translate(x, y); g.rotate((rnd() - 0.5) * 0.18); g.transform(1, 0, -0.18, 1, 0, 0);
  g.lineWidth = h * 0.16; g.strokeStyle = '#140a24'; g.strokeText(text, 0, 0);
  g.lineWidth = h * 0.07; g.strokeStyle = '#ffffff'; g.strokeText(text, 0, 0);
  const grd = g.createLinearGradient(0, -h * 0.3, 0, h * 0.3); grd.addColorStop(0, pal[seed % 6]); grd.addColorStop(1, pal[(seed + 2) % 6]);
  g.fillStyle = grd; g.fillText(text, 0, 0);
  g.restore();
  g.fillStyle = pal[seed % 6]; for (let i = 0; i < 7; i++) { const dx = w * 0.2 + rnd() * w * 0.6; g.fillRect(dx, h * 0.75, 4, 10 + rnd() * h * 0.2); } // drips
  g.fillStyle = '#ffffff'; for (let i = 0; i < 4; i++) { const sx = rnd() * w, sy = rnd() * h * 0.3; g.beginPath(); for (let k = 0; k < 8; k++) { const r = k % 2 ? 6 : 16, a = (k * Math.PI) / 4; g.lineTo(sx + Math.cos(a) * r, sy + Math.sin(a) * r); } g.fill(); } // sparkles
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
function decal(tex: THREE.Texture | null, w: number, h: number): THREE.Mesh {
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex ?? undefined, color: tex ? 0xffffff : JSR.pink, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }));
}
function tiles(): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d'); if (!g) return null;
  const cols = ['#ff8fcf', '#8ff3ff', '#fff1a6', '#c9ff8a'];
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { g.fillStyle = cols[(i + j * 2) % 4]; g.fillRect(i * 64, j * 64, 64, 64); }
  g.strokeStyle = '#3b1f6b'; g.lineWidth = 5; for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(i * 64, 0); g.lineTo(i * 64, 256); g.stroke(); g.beginPath(); g.moveTo(0, i * 64); g.lineTo(256, i * 64); g.stroke(); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(12, 12); t.colorSpace = THREE.SRGBColorSpace; t.magFilter = THREE.NearestFilter;
  return t;
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
  vec3 g = mix(vec3(l), c, 1.45);                       // saturation punch
  g = floor(g * 6.0 + 0.5) / 6.0 * 0.35 + g * 0.65;      // a touch of posterize
  g = (g - 0.5) * 1.1 + 0.52;                            // contrast, slight lift
  g *= mix(vec3(1.0), vec3(1.04, 0.98, 1.06), 1.0);      // magenta-warm tint
  float v = smoothstep(0.95, 0.35, length(vUv - 0.5)); g *= mix(1.0, 0.75 + 0.25 * v, 1.0);
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
          float band = step(0.9, fract((y + 0.02) * 9.0)) * step(0.0, y) * 0.06; c += band;
          gl_FragColor = vec4(mix(uFlat, c, uAmt), 1.0); }`,
    }));
    this.sky.renderOrder = -1; this.sky.frustumCulled = false;
    scene.add(this.sky, this.group);
    this.build();
  }

  private build() {
    const G = this.group;
    // tiled floor following the plaza steps
    const W = SLIVER.x1 - SLIVER.x0 - 4, D = SLIVER.z1 - SLIVER.z0, geo = new THREE.PlaneGeometry(W, D, 48, 64); geo.rotateX(-Math.PI / 2);
    const cx = SLIVER.x0 + W / 2, cz = SLIVER.z0 + D / 2, p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) p.setY(i, heightAt(p.getX(i) + cx, p.getZ(i) + cz) + 0.03);
    geo.computeVertexNormals();
    const floor = new THREE.Mesh(geo, toon(0xffffff, tiles() ?? undefined)); floor.position.set(cx, 0, cz);
    (floor.material as THREE.Material).polygonOffset = true; (floor.material as THREE.Material).polygonOffsetFactor = -1;
    G.add(floor);
    // stair nosings: bold stripes on each step edge
    for (let k = 1; k <= 5; k++) { const z = PLAZA.stairsZ + (PLAZA.stairsLen * k) / 5 - 0.05; const st = new THREE.Mesh(new THREE.BoxGeometry(PLAZA.x1 - PLAZA.x0, 0.08, 0.25), toon(k % 2 ? JSR.yellow : JSR.pink)); st.position.set((PLAZA.x0 + PLAZA.x1) / 2, heightAt(50, z - 0.3) + 0.07, z - 0.12); G.add(st); }
    const y = (x: number, z: number) => heightAt(x, z);
    const put = (o: THREE.Object3D, x: number, z: number, ry = 0) => { o.position.set(x, y(x, z), z); o.rotation.y = ry; G.add(o); };
    put(bench(), 40, 50, 0); put(bench(), 60, 50, 0); put(bench(), 50, 66, Math.PI); put(bench(), 72, 60, -Math.PI / 2);
    put(planter(JSR.pink), 35, 40); put(planter(JSR.cyan), 75, 40); put(planter(JSR.violet), 35, 72); put(planter(JSR.orange), 75, 74);
    [[32, 28], [48, 26], [64, 27], [80, 28], [88, 50], [88, 70], [33, 58]].forEach(([x, z], k) => put(tree(k), x, z));
    [[42, 34.5], [58, 34.5], [30, 48], [90, 40], [90, 62], [50, 82]].forEach(([x, z], k) => put(lamp(), x, z, k * 1.3));
    const tagA = graffiti('GTP!', 512, 256, 1), tagB = graffiti('NO CARS', 512, 256, 3), tagC = graffiti('PEDAL', 512, 256, 5), tagD = graffiti('WATT', 512, 256, 2);
    put(ledge(10, tagD as THREE.Texture), 50, 58, 0); put(ledge(8, tagB as THREE.Texture), 82, 56, Math.PI / 2);
    // big murals on the tower's west face and on the plaza's south stair wall
    const tower = BUILDINGS.find((b) => b.x0 === 95 && b.z0 === 30);
    if (tower) {
      const m1 = decal(tagA, 22, 11); m1.position.set(tower.x0 - 0.02, 7, 45); m1.rotation.y = -Math.PI / 2; G.add(m1);
      const m2 = decal(tagC, 18, 9); m2.position.set(tower.x0 - 0.02, 17, 66); m2.rotation.y = -Math.PI / 2; G.add(m2);
    }
    const m3 = decal(tagB, 10, 2.4); m3.position.set(65, 0.3, PLAZA.stairsZ - 0.6); m3.rotation.x = -Math.PI / 2; G.add(m3);
    const m4 = decal(tagC, 9, 2.6); m4.position.set(46, heightAt(46, 52) + 0.06, 54); m4.rotation.set(-Math.PI / 2, 0, 0.3); G.add(m4);
  }

  /** Toon + ink the buildings inside the sliver (material swap so 'classic' can switch back). */
  styleBuildings(meshes: Array<{ mesh: THREE.Mesh; b: { x0: number; z0: number; x1: number; z1: number } }>) {
    const cols = [JSR.lime, JSR.violet, JSR.cyan, JSR.pink];
    meshes.forEach(({ mesh, b }, i) => {
      const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2;
      if (sliverAmt(cx, cz, 0) <= 0 && !(b.x0 <= SLIVER.x1 && b.x1 >= SLIVER.x0 && b.z0 <= SLIVER.z1 && b.z1 >= SLIVER.z0)) return;
      const hull = new THREE.Mesh(mesh.geometry, INK); hull.scale.setScalar(1.012); hull.name = 'ink'; mesh.add(hull);
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
