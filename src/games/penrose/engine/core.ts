// @ts-nocheck
/* Penrose Pedals engine: The engine core: materials, geometry, the view, the wheel, themes and scenery, roads, and the level player (makeLevel, the level flow).
 * Installed into the shared engine scope in order (see ./index.ts); names come in from $scope and go back out to it. */
import * as T from 'three';

export function install($scope) {
const { dom, hooks } = $scope;
const sceneryPass = (...a) => $scope.sceneryPass(...a);   // defined in a later module (combos)
// the campaign, filled by ./index.ts once every module is installed
const LEVELS = [];

const TAU = Math.PI * 2;
const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const FACE = { y: '#3b82ff', b: '#ff4d4d', z: '#ff9a2b', a: '#2bd96b' };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v)), lerp = (a, b, t) => a + (b - a) * t;
const ease = t => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
const hexRgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const mix = (a, b, t) => { const A = hexRgb(a), B = hexRgb(b); return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * clamp(t, 0, 1)).toString(16).padStart(2, '0')).join(''); };
const mixPal = (a, b, t) => ({ t: mix(a.t, b.t, t), l: mix(a.l, b.l, t), r: mix(a.r, b.r, t) });
const shade = (h, k) => mix(h, k > 0 ? '#ffffff' : '#000000', Math.abs(k));
const tone = (h, a = .82, b = .66) => ({ t: h, l: shade(h, -(1 - a)), r: shade(h, -(1 - b)) });
let seedState = 7; const rnd = () => (seedState = (seedState * 16807) % 2147483647) / 2147483647;

/* ---------- the three-tone material: top / left / right colours picked by the face normal ---------- */
const VS = `varying vec3 vW;
void main() {
  #ifdef USE_INSTANCING
    vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0);
  #else
    vec4 w = modelMatrix * vec4(position, 1.0);
  #endif
  vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
const FS = `uniform vec3 ct; uniform vec3 cl; uniform vec3 cr; uniform float grad; uniform float opacity; varying vec3 vW;
void main() {
  vec3 n = normalize(cross(dFdx(vW), dFdy(vW)));
  // shade in the camera's frame: undo the view's yaw so a turned camera lights faces the same way the front view does
  vec3 cz = vec3(viewMatrix[0][2], viewMatrix[1][2], viewMatrix[2][2]); vec2 h = normalize(cz.xz + vec2(1e-5)), h0 = vec2(0.70710678);
  float np = dot(n.xz, h), nq = h.x * n.z - h.y * n.x; n = vec3(np * h0.x - nq * h0.y, n.y, np * h0.y + nq * h0.x);
  if (dot(n, vec3(1.0)) < 0.0) n = -n;
  vec3 w = pow(max(n, vec3(0.0)), vec3(1.6)); float s = w.x + w.y + w.z + 1e-4;
  vec3 c = (cr * w.x + ct * w.y + cl * w.z) / s;
  c *= 1.0 + grad * clamp(vW.y * 0.09, -1.0, 1.0);
  gl_FragColor = vec4(c, opacity); }`;
const triCache = new Map();
function tri(p, opt = {}) {
  const key = opt.fresh ? null : [p.t, p.l, p.r, opt.grad ?? .07, opt.side ?? 0, opt.opacity ?? 1].join();
  if (key && triCache.has(key)) return triCache.get(key);
  const m = new T.ShaderMaterial({ uniforms: { ct: { value: new T.Color(p.t) }, cl: { value: new T.Color(p.l) }, cr: { value: new T.Color(p.r) }, grad: { value: opt.grad ?? .07 }, opacity: { value: opt.opacity ?? 1 } },
    vertexShader: VS, fragmentShader: FS, extensions: { derivatives: true }, side: opt.side ? T.DoubleSide : T.FrontSide, transparent: (opt.opacity ?? 1) < 1, depthWrite: (opt.opacity ?? 1) >= 1 });
  if (key) triCache.set(key, m);
  return m;
}
const setTri = (m, p) => { m.uniforms.ct.value.set(p.t); m.uniforms.cl.value.set(p.l); m.uniforms.cr.value.set(p.r); };
const DEPTH_ONLY = new T.MeshBasicMaterial({ colorWrite: false, side: T.DoubleSide });
const basic = (c, o = {}) => new T.MeshBasicMaterial({ color: c, transparent: o.opacity !== undefined || !!o.add, opacity: o.opacity ?? 1, side: o.side ? T.DoubleSide : T.FrontSide, depthWrite: !o.add && o.opacity === undefined, blending: o.add ? T.AdditiveBlending : T.NormalBlending, map: o.map || null });

/* ---------- geometry helpers, in the sketches' coordinates: x, y = depth, z = up ---------- */
const UNIT = new T.BoxGeometry(1, 1, 1);
function B(g, x0, y0, z0, x1, y1, z1, mat) { const m = new T.Mesh(UNIT, mat); m.scale.set(x1 - x0, z1 - z0, y1 - y0); m.position.set((x0 + x1) / 2, (z0 + z1) / 2, (y0 + y1) / 2); g.add(m); return m; }
function CY(g, x, y, r, z0, z1, mat, seg = 28, rTop) { const m = new T.Mesh(new T.CylinderGeometry(rTop ?? r, r, z1 - z0, seg), mat); m.position.set(x, (z0 + z1) / 2, y); g.add(m); return m; }
const V = (x, y, z) => new T.Vector3(x, z, y);
function at(g, obj, x, y, z) { obj.position.copy(V(x, y, z)); g.add(obj); return obj; }
function archGeo(w, h, seg = 10) { const s = new T.Shape(), r = w / 2; s.moveTo(-r, 0); s.lineTo(r, 0); s.lineTo(r, h - r); s.absarc(0, h - r, r, 0, Math.PI, false); s.lineTo(-r, 0); return new T.ShapeGeometry(s, seg); }
function rectGeo(w, h) { const g = new T.PlaneGeometry(w, h); g.translate(0, h / 2, 0); return g; }
// put a flat shape on the +x face (face 'x') or the +y face (face 'y'); u runs along the face, v is up from z
function onFace(g, face, plane, u, v, geo, mat, lift = .012) {
  const m = new T.Mesh(geo, mat);
  if (face === 'x') { m.rotation.y = Math.PI / 2; m.position.copy(V(plane + lift, u, v)); } else { m.position.copy(V(u, plane + lift, v)); }
  g.add(m); return m;
}
function gearGeo(r, teeth, h, depth = .2, hole = 0) {
  const s = new T.Shape(), step = TAU / teeth, rr = r * (1 - depth);
  for (let i = 0; i < teeth; i++) { const a = i * step; const pts = [[rr, a], [r, a + step * .18], [r, a + step * .45], [rr, a + step * .63]];
    pts.forEach(([R, A], k) => (i === 0 && k === 0 ? s.moveTo : s.lineTo).call(s, R * Math.cos(A), R * Math.sin(A))); }
  s.closePath();
  if (hole) { const p = new T.Path(); p.absarc(0, 0, hole, 0, TAU, true); s.holes.push(p); }
  const geo = new T.ExtrudeGeometry(s, { depth: h, bevelEnabled: false, curveSegments: 4 }); geo.rotateX(-Math.PI / 2); return geo;
}
function petalGeo(len, wid, cup = .4, tipCurl = .15) {
  const s = new T.Shape(); s.moveTo(0, 0); s.bezierCurveTo(len * .2, wid * 1.1, len * .8, wid * .95, len, 0); s.bezierCurveTo(len * .8, -wid * .95, len * .2, -wid * 1.1, 0, 0);
  const g = new T.ShapeGeometry(s, 12); g.rotateX(-Math.PI / 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i); p.setY(i, cup * wid * Math.pow(z / wid, 2) + tipCurl * len * Math.pow(x / len, 3)); }
  return g;
}
function canvasTex(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new T.CanvasTexture(c); return t; }
const TEX = {};
TEX.glow = canvasTex(64, 64, (g) => { const r = g.createRadialGradient(32, 32, 0, 32, 32, 32); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(.35, 'rgba(255,255,255,.45)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 64, 64); });
TEX.dot = canvasTex(32, 32, (g) => { g.fillStyle = '#fff'; g.beginPath(); g.arc(16, 16, 14, 0, TAU); g.fill(); });
TEX.puff = canvasTex(64, 64, (g) => { g.fillStyle = '#fff'; for (const [x, y, r] of [[32, 36, 20], [20, 38, 13], [44, 38, 13], [32, 24, 14]]) { g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); } });
TEX.cloud = canvasTex(256, 96, (g) => { g.fillStyle = '#fff'; for (const [x, y, r] of [[60, 64, 30], [100, 50, 42], [150, 56, 36], [190, 66, 26], [128, 72, 30]]) { g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); } g.fillRect(40, 70, 170, 26); g.clearRect(0, 92, 256, 4); });
TEX.bird = canvasTex(64, 32, (g) => { g.strokeStyle = '#fff'; g.lineWidth = 4; g.lineCap = 'round'; g.beginPath(); g.moveTo(6, 10); g.quadraticCurveTo(20, 4, 32, 20); g.quadraticCurveTo(44, 4, 58, 10); g.stroke(); });
TEX.petal = canvasTex(32, 32, (g) => { g.fillStyle = '#fff'; g.beginPath(); g.ellipse(16, 16, 13, 7, .5, 0, TAU); g.fill(); });
TEX.diamond = canvasTex(32, 32, (g) => { g.fillStyle = '#fff'; g.beginPath(); g.moveTo(16, 1); g.lineTo(24, 16); g.lineTo(16, 31); g.lineTo(8, 16); g.fill(); });
TEX.ring = canvasTex(64, 64, (g) => { g.strokeStyle = '#fff'; g.lineWidth = 5; g.beginPath(); g.arc(32, 32, 26, 0, TAU); g.stroke(); });
function sprite(tex, w, h, color = '#fff', o = {}) {
  const m = new T.SpriteMaterial({ map: tex, color, transparent: true, opacity: o.opacity ?? 1, depthWrite: false, depthTest: o.depthTest ?? true, blending: o.add ? T.AdditiveBlending : T.NormalBlending });
  const s = new T.Sprite(m); s.scale.set(w, h, 1); if (o.order) s.renderOrder = o.order; return s;
}
// screen-space axes of the iso camera, in three coordinates
const SR = new T.Vector3(1, 0, -1).normalize(), SU = new T.Vector3(-1, 2, -1).normalize(), SD = new T.Vector3(1, 1, 1).normalize();
const toScreen = (p, c) => { const d = p.clone().sub(c); return [d.dot(SR), d.dot(SU)]; };

/* ---------- a view: one renderer, one scene, an iso orthographic camera ---------- */
const views = [];
const R3 = new T.WebGLRenderer({ antialias: true, alpha: true }); R3.setPixelRatio(Math.min(2, devicePixelRatio || 1)); R3.setClearColor(0x000000, 0);
R3.outputColorSpace = T.LinearSRGBColorSpace;   // the look was tuned without colour management (three r128)
class View {
  constructor(host) {
    this.host = host; this.aspect = () => (this.host.clientHeight || 400) / (this.host.clientWidth || 600); this.visible = true; this.t = 0; this.yaw = 0;
    this.cv = R3.domElement; this.cv.style.display = 'block'; host.appendChild(this.cv);
    this.camera = new T.OrthographicCamera(-1, 1, 1, -1, .1, 400);
    this.scene = new T.Scene(); this.updaters = [];
    views.push(this);
  }
  frame(center, bounds, pad = .5) { this.center = V(...center); this.bounds = bounds; this.pad = pad; this.resize(); }
  resize() {
    const w = this.host.clientWidth || 600, h = this.host.clientHeight || 400;
    if (w !== this.cssW || h !== this.cssH) R3.setSize(w, h);
    this.cssW = w; this.cssH = h; this.dirty = true; this.fit();
  }
  // fit the frustum to the bounds; a level framed per camera angle (yawFrames) blends between them as the camera turns
  fit() {
    if (!this.bounds) return; const w = this.cssW, h = this.cssH;
    let [x0, x1, y0, y1] = this.bounds; x0 -= this.pad; x1 += this.pad; y0 -= this.pad; y1 += this.pad;
    const bw = x1 - x0, bh = y1 - y0, a = w / h; if (bw / bh < a) { const nw = bh * a; x0 -= (nw - bw) / 2; x1 += (nw - bw) / 2; } else { const nh = bw / a; y0 -= (nh - bh) / 2; y1 += (nh - bh) / 2; }
    Object.assign(this.camera, { left: x0, right: x1, top: y1, bottom: y0 }); this.camera.updateProjectionMatrix(); this.aim();
  }
  aim() {
    if (this.yawFrames) { const [f0, f1] = this.yawFrames, k = clamp((this.yaw - f0.a) / (f1.a - f0.a), 0, 1);
      if (k !== this.yawK) { this.yawK = k; this.bounds = f0.b.map((v, i) => v + (f1.b[i] - v) * k); this.fit(); return; } }
    const d = SD.clone().applyAxisAngle(new T.Vector3(0, 1, 0), this.yaw); this.camera.position.copy(this.center).addScaledVector(d, 120); this.camera.up.set(0, 1, 0); this.camera.lookAt(this.center); if (this.roll) this.camera.rotateZ(this.roll); this.camera.updateMatrixWorld(); this.camera.matrixWorldInverse.copy(this.camera.matrixWorld).invert(); }
  sp(sx, sy, depth) { return this.center.clone().addScaledVector(SR, sx).addScaledVector(SU, sy).addScaledVector(SD, depth); }
  screenBox() { return [this.camera.left, this.camera.right, this.camera.bottom, this.camera.top]; }
  project(v) { const p = v.clone().project(this.camera); return [(p.x + 1) / 2 * this.cssW, (1 - p.y) / 2 * this.cssH]; }
  tick(dt) {
    if (!this.center) return; this.dirty = false; this.t += dt; for (const u of this.updaters) u(this.t, dt);
    R3.render(this.scene, this.camera);
    // layer 1 (the wheel) is drawn over everything already on screen, depth-tested only against layer 2 (everything but road decks)
    if (this.overlay) { const ac = R3.autoClear, bg = this.scene.background; R3.autoClear = false; R3.clearDepth(); this.scene.background = null;
      this.scene.overrideMaterial = DEPTH_ONLY; this.camera.layers.set(2); R3.render(this.scene, this.camera); this.scene.overrideMaterial = null;
      this.camera.layers.set(1); R3.render(this.scene, this.camera); this.camera.layers.set(0); this.scene.background = bg; R3.autoClear = ac; }
  }
  clear() { this.scene.clear(); this.updaters = []; this.yawFrames = null; this.yawK = undefined; this.overlay = false; }
}

/* ---------- the wheel ---------- */
// each look has its own wheel; a contrasting outline keeps it readable on any wall or sky
const WHEELS = {
  dusk: { tire: '#2A2640', rim: '#FF8E6E', spoke: '#FFF4EC', hub: '#FFD15C', line: '#FFFFFF', style: 'spokes' },
  garden: { tire: '#5A2C4A', rim: '#FF6FA5', spoke: '#FFE3EE', hub: '#FFD84D', line: '#FFFFFF', style: 'petals' },
  town: { tire: '#1F3A6B', rim: '#F2F6FF', spoke: '#E9864F', hub: '#E9864F', line: '#FFFFFF', style: 'tiles' },
  prism: { tire: '#FFF6D6', rim: '#FFD43B', spoke: '#FFFFFF', hub: '#FF5FB0', line: '#2A0F45', style: 'star', glow: '#FFE25A' },
  night: { tire: '#FFE6A8', rim: '#FFC861', spoke: '#FFF7E0', hub: '#FF8A3D', line: '#0B0D24', style: 'lantern', glow: '#FFC861' },
  brass: { tire: '#F6EBD2', rim: '#F7BE3E', spoke: '#2A1A08', hub: '#B1332A', line: '#1E140B', style: 'gear' },
  sky: { tire: '#24314F', rim: '#45C7B2', spoke: '#FFFFFF', hub: '#FFC94D', line: '#FFFFFF', style: 'spokes' },
};
function makeWheel(th) {
  const w = WHEELS[th.id] || WHEELS.dusk, g = new T.Group(), spin = new T.Group(); g.add(spin); spin.position.y = .37;
  const outline = new T.Mesh(new T.TorusGeometry(.29, .11, 10, 30), new T.MeshBasicMaterial({ color: w.line, side: T.BackSide })); spin.add(outline);
  spin.add(new T.Mesh(new T.TorusGeometry(.29, .075, 10, 30), tri(tone(w.tire, .9, .78))));
  spin.add(new T.Mesh(new T.TorusGeometry(.215, .03, 6, 30), tri(tone(w.rim, .86, .72))));
  const sp = tri(tone(w.spoke, .9, .8)), face = (geo, mat) => { const m = new T.Mesh(geo, mat); spin.add(m); return m; };
  if (w.style === 'petals') for (let i = 0; i < 5; i++) { const a = i / 5 * TAU, m = face(new T.CircleGeometry(.075, 12), basic(w.spoke, { side: true })); m.scale.set(1.5, .8, 1); m.position.set(Math.cos(a) * .11, Math.sin(a) * .11, 0); m.rotation.z = a; }
  else if (w.style === 'star') for (let i = 0; i < 4; i++) { const m = face(new T.OctahedronGeometry(.1, 0), sp); m.scale.set(2, .35, .3); m.rotation.z = i * Math.PI / 4; }
  else if (w.style === 'gear') { const gm = face(gearGeo(.19, 10, .05, .22, .07), tri(tone(w.rim))); gm.rotation.x = Math.PI / 2; gm.position.z = .025; }
  else for (let i = 0; i < 3; i++) { const s = face(UNIT, sp); s.scale.set(.44, .03, .03); s.rotation.z = i * Math.PI / 3; }
  if (w.style === 'tiles') for (let i = 0; i < 8; i++) { const a = i / 8 * TAU, m = face(new T.BoxGeometry(.05, .05, .16), tri(tone(w.rim))); m.position.set(Math.cos(a) * .29, Math.sin(a) * .29, 0); }
  if (w.style === 'gear') for (let i = 0; i < 12; i++) { const a = i / 12 * TAU, m = face(new T.BoxGeometry(.07, .07, .13), tri(tone(w.rim))); m.position.set(Math.cos(a) * .37, Math.sin(a) * .37, 0); m.rotation.z = a; }
  const hub = new T.Mesh(new T.CylinderGeometry(.055, .055, .16, 12), tri(tone(w.hub))); hub.rotation.x = Math.PI / 2; spin.add(hub);
  if (w.glow) { const gl = sprite(TEX.glow, 1.3, 1.3, w.glow, { opacity: .55, add: true }); gl.position.y = .37; g.add(gl); }
  const sh = new T.Mesh(new T.CircleGeometry(.3, 24), basic(th.ink || '#000000', { opacity: .2 })); sh.rotation.x = -Math.PI / 2; sh.scale.set(1, .55, 1); sh.position.y = .015; g.add(sh);
  g.userData.spin = spin; return g;
}
// place a wheel on a path point with its travel direction (2D sketch coords)
function placeWheel(w, x, y, z, dx, dy, roll) { w.position.copy(V(x, y, z)); w.rotation.y = Math.atan2(-dy, dx); w.userData.spin.rotation.z = -roll; }

/* ---------- a fluttering flag ---------- */
function makeFlag(g, x, y, z, color, ink, upd) {
  CY(g, x, y, .035, z, z + 1.5, tri(tone(ink)), 8);
  CY(g, x, y, .06, z + 1.5, z + 1.58, tri(tone('#FFD15C')), 10);
  const geo = new T.PlaneGeometry(.75, .44, 10, 1); geo.translate(.375, 0, 0);
  const m = new T.Mesh(geo, basic(color, { side: true })); m.position.copy(V(x, y, z + 1.25)); g.add(m);
  const base = geo.attributes.position.array.slice();
  upd.push(t => { const p = geo.attributes.position; for (let i = 0; i < p.count; i++) { const x0 = base[i * 3]; p.setZ(i, Math.sin(x0 * 7 - t * 6) * .07 * x0 / .75); p.setY(i, base[i * 3 + 1] - .05 * x0 * x0); } p.needsUpdate = true; });
}
function dashes(g, a, b, mat, z) { const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy), n = Math.floor(L / .38);
  for (let i = 0; i < n; i++) { const f = (i + .3) / n, m = new T.Mesh(UNIT, mat); m.scale.set(.17, .012, .045); m.position.copy(V(a[0] + dx * f, a[1] + dy * f, z + .006)); m.rotation.y = Math.atan2(-dy, dx); g.add(m); } }
function ringDashes(g, cx, cy, r, z, mat) { const n = Math.round(TAU * r / .38); for (let i = 0; i < n; i++) { const a = i / n * TAU, m = new T.Mesh(UNIT, mat); m.scale.set(.15, .012, .045); m.position.copy(V(cx + r * Math.cos(a), cy + r * Math.sin(a), z + .006)); m.rotation.y = Math.atan2(-Math.cos(a), -Math.sin(a)); g.add(m); } }

/* ================= the blooms: one per theme, all lying on the machine's own pivot plane ================= */
// Each returns { g, set(e, spin, t) } where local +y is the plane's normal; e springs past 1 when it engages.
function bloomIris(P) {   // mechanical: arms stacked in one bundle fan out and telescope; gear teeth rise from the ring
  const g = new T.Group(), mBase = tri(P.idle, { fresh: true }), mArm = tri(P.idle, { fresh: true }), mKnob = tri(P.mech, { fresh: true }), mCap = tri(P.mech, { fresh: true });
  const plate = new T.Mesh(new T.CylinderGeometry(.5, .54, .07, 36), mBase); plate.position.y = .035; g.add(plate);
  const gear = new T.Mesh(gearGeo(.5, 20, .1, .2, .3), mArm); gear.position.y = .07; g.add(gear);
  const arms = [];
  for (let i = 0; i < 6; i++) {
    const a = new T.Group(); a.position.y = .14; g.add(a);
    const sleeve = new T.Mesh(UNIT, mBase); sleeve.scale.set(.3, .1, .16); sleeve.position.set(.22, .01, 0); a.add(sleeve);
    const rod = new T.Mesh(UNIT, mArm); rod.scale.set(1, .065, .1); a.add(rod);
    const peg = new T.Mesh(new T.CylinderGeometry(.06, .075, 1, 10), mArm); a.add(peg);
    const knob = new T.Mesh(new T.CylinderGeometry(.1, .085, .1, 14), mKnob); a.add(knob);
    arms.push({ a, rod, peg, knob });
  }
  const cap = new T.Mesh(new T.SphereGeometry(.17, 16, 8, 0, TAU, 0, Math.PI / 2), mCap); cap.position.y = .14; g.add(cap);
  const bolt = new T.Mesh(new T.CylinderGeometry(.05, .05, .06, 10), tri(tone(P.ink))); bolt.position.y = .3; g.add(bolt);
  return { g, set(e, spin) {
    const k = clamp(e, 0, 1.25), c = clamp(e, 0, 1);
    setTri(mArm, mixPal(P.idle, P.mech, c)); setTri(mBase, mixPal(P.idle, P.mechDark || P.idle, c * .6)); setTri(mKnob, mixPal(P.idle, P.mech, c)); setTri(mCap, mixPal(P.idle, P.mech, Math.min(1, c * 1.3)));
    gear.rotation.y = -spin * .5; gear.scale.set(1, .3 + .7 * c, 1);
    arms.forEach(({ a, rod, peg, knob }, i) => {
      a.rotation.y = spin + i * TAU / 6 * ease(c) * (1 + (k - c));
      const L = .18 + .62 * k; rod.scale.x = L; rod.position.x = .1 + L / 2;
      const ph = .04 + .26 * k; peg.scale.y = ph; peg.position.set(.1 + L, ph / 2, 0); knob.position.set(.1 + L, ph, 0); knob.scale.setScalar(.5 + .6 * k);
    });
    cap.scale.set(1, .6 + .6 * c, 1);
  } };
}
function bloomFlower(P) {   // garden: a bud whose petals open down onto the plane, two rings, with leaves and stamens
  const g = new T.Group(), mOut = tri(P.idle, { fresh: true, side: true }), mIn = tri(P.idle, { fresh: true, side: true }), mLeaf = tri(P.leaf, { side: true });
  const leaves = [], outer = [], inner = [], stamens = [];
  for (let i = 0; i < 4; i++) { const r = new T.Group(); r.rotation.y = i * TAU / 4 + .4; const h = new T.Group(); r.add(h); h.add(new T.Mesh(petalGeo(.62, .17, .5, .05), mLeaf)); g.add(r); leaves.push(h); }
  for (let i = 0; i < 7; i++) { const r = new T.Group(); r.rotation.y = i * TAU / 7; const h = new T.Group(); h.position.set(.07, .05, 0); r.add(h); h.add(new T.Mesh(petalGeo(.5, .16, .7, .25), mOut)); g.add(r); outer.push({ r, h }); }
  for (let i = 0; i < 5; i++) { const r = new T.Group(); r.rotation.y = i * TAU / 5 + .3; const h = new T.Group(); h.position.set(.04, .07, 0); r.add(h); h.add(new T.Mesh(petalGeo(.32, .12, .8, .3), mIn)); g.add(r); inner.push({ r, h }); }
  const disc = new T.Mesh(new T.SphereGeometry(.1, 14, 8), tri(tone('#FFD24A'))); disc.position.y = .08; g.add(disc);
  for (let i = 0; i < 8; i++) { const s = new T.Group(); s.rotation.y = i * TAU / 8; const st = new T.Mesh(new T.CylinderGeometry(.012, .012, .2, 5), tri(tone('#F7E7B0'))); st.position.set(.05, .1, 0); st.rotation.z = -.5; const tip = new T.Mesh(new T.SphereGeometry(.03, 8, 6), tri(tone('#FFB321'))); tip.position.set(.1, .19, 0); s.add(st, tip); g.add(s); stamens.push(s); }
  return { g, set(e, spin, t) {
    const c = clamp(e, 0, 1), k = clamp(e, 0, 1.3);
    setTri(mOut, mixPal(P.idle, P.mech, c)); setTri(mIn, mixPal(P.idle, P.mechLight || P.mech, c));
    leaves.forEach((h, i) => h.rotation.z = .25 - .2 * c + Math.sin(t * 1.3 + i) * .03);
    outer.forEach(({ r, h }, i) => { r.rotation.y = i * TAU / 7 + spin; h.rotation.z = lerp(1.38, .16, k) + Math.sin(t * 2 + i) * .02 * c; });
    inner.forEach(({ r, h }, i) => { r.rotation.y = i * TAU / 5 + .3 + spin * 1.2; h.rotation.z = lerp(1.45, .6, k); });
    stamens.forEach((s, i) => { s.scale.setScalar(.2 + .8 * c); s.rotation.y = i * TAU / 8 + spin * 1.4; });
    disc.scale.setScalar(.6 + .5 * c);
  } };
}
function bloomHelm(P) {   // town: a ship's helm whose spokes slide out past a rising rim, with turned handles
  const g = new T.Group(), mWood = tri(P.idle, { fresh: true }), mTile = tri(P.idle, { fresh: true });
  const hub = new T.Mesh(new T.CylinderGeometry(.16, .18, .12, 20), mTile); hub.position.y = .06; g.add(hub);
  const cap = new T.Mesh(new T.CylinderGeometry(.09, .11, .06, 16), tri(tone('#F6F1E6'))); cap.position.y = .15; g.add(cap);
  const rim = new T.Mesh(new T.TorusGeometry(.4, .045, 8, 40), mWood); rim.rotation.x = Math.PI / 2; g.add(rim);
  const spokes = [];
  for (let i = 0; i < 8; i++) { const a = new T.Group(); a.rotation.y = i * TAU / 8; g.add(a);
    const s = new T.Mesh(new T.CylinderGeometry(.025, .03, 1, 8), mWood); s.rotation.z = Math.PI / 2; a.add(s);
    const h1 = new T.Mesh(new T.CylinderGeometry(.04, .03, .14, 10), mWood); h1.rotation.z = Math.PI / 2; a.add(h1);
    const h2 = new T.Mesh(new T.SphereGeometry(.05, 10, 8), mTile); a.add(h2);
    spokes.push({ a, s, h1, h2 }); }
  return { g, set(e, spin) {
    const c = clamp(e, 0, 1), k = clamp(e, 0, 1.25);
    setTri(mWood, mixPal(P.idle, P.mech, c)); setTri(mTile, mixPal(P.idle, P.accent, c));
    g.rotation.y = spin; rim.position.y = .05 + .1 * c; rim.scale.setScalar(.55 + .45 * k);
    spokes.forEach(({ s, h1, h2 }) => { const L = .2 + .5 * k; s.scale.y = L; s.position.set(L / 2, .08 + .06 * c, 0); h1.position.set(L + .06, .08 + .06 * c, 0); h2.position.set(L + .15, .08 + .06 * c, 0); h1.scale.setScalar(.4 + .6 * c); h2.scale.setScalar(.3 + .7 * c); });
  } };
}
function bloomCrystal(P) {   // prism: a closed geode of shards that falls open into a star and floats
  const g = new T.Group(), shards = [], mCore = tri(P.idle, { fresh: true });
  const core = new T.Mesh(new T.CylinderGeometry(.13, .15, 1, 6), mCore); g.add(core);
  const top = new T.Mesh(new T.ConeGeometry(.13, .16, 6), mCore); g.add(top);
  for (let i = 0; i < 6; i++) { const r = new T.Group(); r.rotation.y = i * TAU / 6; const h = new T.Group(); h.position.set(.12, .02, 0); r.add(h);
    const geo = new T.OctahedronGeometry(1, 0); geo.scale(.3, .07, .09); geo.translate(.3, 0, 0);
    const m = tri(P.idle, { fresh: true }); h.add(new T.Mesh(geo, m)); g.add(r); shards.push({ r, h, m, pal: P.ramp[i % P.ramp.length] }); }
  const orbit = new T.Group(); g.add(orbit);
  for (let i = 0; i < 5; i++) { const m = new T.Mesh(new T.TetrahedronGeometry(.05, 0), tri(tone('#FFF6C8'))); m.position.set(Math.cos(i * TAU / 5) * .72, .25, Math.sin(i * TAU / 5) * .72); orbit.add(m); }
  return { g, set(e, spin, t) {
    const c = clamp(e, 0, 1), k = clamp(e, 0, 1.3);
    setTri(mCore, mixPal(P.idle, P.mech, c)); const ch = .14 + .26 * c; core.scale.set(1, ch, 1); core.position.y = ch / 2; top.position.y = ch + .08;
    shards.forEach(({ r, h, m, pal }, i) => { r.rotation.y = i * TAU / 6 + spin; h.rotation.z = lerp(1.25, .12, k) + Math.sin(t * 2.4 + i) * .04 * c; h.position.y = .02 + .05 * c * Math.sin(t * 2 + i); setTri(m, mixPal(P.idle, mixPal(pal, P.mech, .25), c)); });
    orbit.rotation.y = -spin * 1.6 + t * .3 * c; orbit.scale.setScalar(Math.max(.001, c)); orbit.position.y = .05 * Math.sin(t * 3);
  } };
}
function bloomLantern(P, glows) {   // night: a folded umbrella of ribs opens, and paper lanterns at the tips light up
  const g = new T.Group(), ribs = [], mRib = tri(P.idle, { fresh: true });
  const pole = new T.Mesh(new T.CylinderGeometry(.04, .06, .3, 10), mRib); pole.position.y = .15; g.add(pole);
  const crown = new T.Mesh(new T.SphereGeometry(.09, 12, 8), mRib); crown.position.y = .3; g.add(crown);
  for (let i = 0; i < 8; i++) { const r = new T.Group(); r.rotation.y = i * TAU / 8; r.position.y = .28; const h = new T.Group(); r.add(h);
    const rib = new T.Mesh(UNIT, mRib); rib.scale.set(.56, .025, .035); rib.position.x = .28; h.add(rib);
    const lamp = new T.Group(); lamp.position.x = .56; h.add(lamp);
    const body = new T.Mesh(new T.CylinderGeometry(.065, .065, .13, 10), basic(P.idle.t)); body.position.y = -.1; lamp.add(body);
    const halo = sprite(TEX.glow, .5, .5, P.glow, { add: true, opacity: 0 }); halo.position.y = -.1; lamp.add(halo);
    g.add(r); ribs.push({ r, h, lamp, body, halo }); }
  return { g, set(e, spin, t) {
    const c = clamp(e, 0, 1), k = clamp(e, 0, 1.25);
    setTri(mRib, mixPal(P.idle, P.mech, c));
    ribs.forEach(({ r, h, lamp, body, halo }, i) => {
      r.rotation.y = i * TAU / 8 + spin * .6; h.rotation.z = lerp(1.35, -.18, k);
      lamp.rotation.z = -h.rotation.z + Math.sin(t * 2.2 + i * 1.7) * .12 * c;
      const fl = .85 + .15 * Math.sin(t * 9 + i * 3.1) * Math.sin(t * 5.3 + i);
      body.material.color.set(mix(P.idle.t, P.glow, c * fl)); halo.material.opacity = c * .9 * fl; halo.scale.setScalar(.25 + .35 * c);
    });
  } };
}
function bloomClock(P) {   // brass: planet gears slide out from under a sun gear and mesh with it; a second hand ticks
  const g = new T.Group(), mSun = tri(P.idle, { fresh: true }), mPl = tri(P.idle, { fresh: true }), mArm = tri(P.idle, { fresh: true });
  const plate = new T.Mesh(new T.CylinderGeometry(.24, .26, .06, 24), mArm); plate.position.y = .03; g.add(plate);
  const sun = new T.Mesh(gearGeo(.3, 16, .09, .18, .08), mSun); sun.position.y = .1; g.add(sun);
  const planets = [];
  for (let i = 0; i < 4; i++) { const a = new T.Group(); a.rotation.y = i * TAU / 4; a.position.y = .06; g.add(a);
    const arm = new T.Mesh(UNIT, mArm); arm.scale.set(1, .03, .06); a.add(arm);
    const pg = new T.Mesh(gearGeo(.15, 10, .07, .25, .04), mPl); a.add(pg);
    const pin = new T.Mesh(new T.CylinderGeometry(.03, .03, .12, 8), tri(tone(P.ink))); a.add(pin);
    planets.push({ a, arm, pg, pin }); }
  const face = new T.Mesh(new T.CylinderGeometry(.14, .14, .03, 24), tri(tone('#F7EEDC'))); face.position.y = .205; g.add(face);
  const hand = new T.Mesh(UNIT, tri(tone('#B1332A'))); hand.scale.set(.13, .012, .018); hand.position.y = .23; const handG = new T.Group(); handG.add(hand); hand.position.x = .05; g.add(handG);
  return { g, set(e, spin, t) {
    const c = clamp(e, 0, 1), k = clamp(e, 0, 1.2);
    setTri(mSun, mixPal(P.idle, P.mech, c)); setTri(mPl, mixPal(P.idle, P.mechLight || P.mech, c)); setTri(mArm, mixPal(P.idle, P.mechDark || P.mech, c));
    sun.rotation.y = spin;
    const d = lerp(.1, .43, k);
    planets.forEach(({ a, arm, pg, pin }, i) => { a.rotation.y = i * TAU / 4 + spin * .25; arm.scale.x = d; arm.position.x = d / 2; pg.position.x = d; pin.position.set(d, .08, 0); pg.rotation.y = -spin * (.3 / .15) * 1.05 - a.rotation.y; });
    const tick = Math.floor(t * 2) + ease((t * 2 % 1) * 6); handG.rotation.y = -tick * TAU / 60 * (c > .2 ? 1 : 0);
    face.scale.setScalar(.4 + .6 * c);
  } };
}
const BLOOMS = { gyro: (P) => bloomGyro(P), iris: bloomIris, flower: bloomFlower, helm: bloomHelm, crystal: bloomCrystal, lantern: bloomLantern, clock: bloomClock };

// wraps a bloom with a spring, a pedal-driven spin, and a ripple + sparks when it wakes
function machine(view, theme, plane, size) {
  const holder = new T.Group(); const b = BLOOMS[theme.bloom](theme); b.g.scale.setScalar(size); holder.add(b.g);
  plane(holder);
  const ripple = new T.Mesh(new T.RingGeometry(.48, .54, 48), basic(theme.mech.t, { opacity: 0, side: true })); ripple.rotation.x = -Math.PI / 2; ripple.position.y = .02; holder.add(ripple);
  const sparks = Array.from({ length: 8 }, () => { const s = sprite(TEX.diamond, .1, .1, theme.spark || '#FFF6C8', { opacity: 0, depthTest: false, order: 5 }); holder.add(s); return s; });
  const st = { target: 0, e: 0, v: 0, spin: 0, wake: -9, pedal: true, holder, size };
  st.set = (on) => { if (on && !st.target) st.wake = view.t; st.target = on ? 1 : 0; };
  view.updaters.push((t, dt) => {
    st.v += (70 * (st.target - st.e) - 8.5 * st.v) * dt; st.e += st.v * dt;
    if (st.target && st.pedal) st.spin += 1.5 * dt;
    b.set(st.e, st.spin, t);
    const w = t - st.wake, on = w >= 0 && w < 1;
    ripple.material.opacity = on ? (1 - w) * .8 : 0; ripple.scale.setScalar(size * (1 + w * 2.6));
    sparks.forEach((s, i) => { const a = i / 8 * TAU; s.material.opacity = on ? (1 - w) : 0; const r = size * (.4 + w * 1.4); s.position.set(Math.cos(a) * r, size * (.3 + w * .8) - w * w * size * .6, Math.sin(a) * r); s.scale.setScalar(size * .14 * (1 - w * .5)); });
  });
  return st;
}

/* ================= themes ================= */
const THEMES = [
  { id: 'dusk', name: 'Dusk Monument', bloom: 'iris', blurb: 'Lilac stone, domes and arched slits under a peach dusk. The machines are coral clockwork irises: a bundle of arms that fans out, telescopes and raises its handles.', chips: ['chapter 1', 'iris crank', 'petals and birds'],
    sky: 'linear-gradient(180deg,#B9B1E3 0%,#E5C9E2 52%,#FBD3BC 100%)', stone: { t: '#ECE6F6', l: '#B2A9D2', r: '#8D82B6' }, idle: { t: '#D6CFE6', l: '#A8A0C0', r: '#878099' }, mech: { t: '#FFAE93', l: '#E57A62', r: '#BF5A49' }, mechDark: { t: '#C98A7E', l: '#A86A5E', r: '#87504A' },
    ink: '#2A2640', lane: '#6E6596', win: { t: '#7C72A6', l: '#6A609A', r: '#544B80' }, goal: '#FF8E6E', spark: '#FFE2D2' },
  { id: 'garden', name: 'Garden Terraces', bloom: 'flower', blurb: 'Grass-topped sandstone terraces, low-poly trees, hanging vines and a waterfall. Here the machine is a real flower: the bud opens petal by petal.', chips: ['chapter 2', 'flower bloom', 'butterflies'],
    sky: 'linear-gradient(180deg,#BFE8F0 0%,#DDF3DA 55%,#F7F2CF 100%)', stone: { t: '#8FD66A', l: '#E5CFA0', r: '#C2A574' }, idle: { t: '#B9D59A', l: '#93B576', r: '#759858' }, mech: { t: '#FF95BE', l: '#EE6C98', r: '#C94D78' }, mechLight: { t: '#FFD3E3', l: '#FFB5CE', r: '#E795B2' },
    leaf: { t: '#6FCB4E', l: '#4DA53C', r: '#378530' }, ink: '#1F2E1A', lane: '#4E7A3A', goal: '#EE6C98', spark: '#FFE3EE', turf: { t: '#9BDD74', l: '#6CB24E', r: '#4F913A' } },
  { id: 'town', name: 'Painted Town', bloom: 'helm', blurb: 'Whitewashed walls, azulejo tile bands, blue shutters, terracotta roofs and laundry in the breeze, above a glittering sea. The machine is a ship\'s helm.', chips: ['chapter 3', 'helm', 'gulls and laundry'],
    sky: 'linear-gradient(180deg,#9FD6F2 0%,#D3EEF7 55%,#FFF2DC 100%)', stone: { t: '#FFFBF2', l: '#EEDFC4', r: '#D7BE97' }, idle: { t: '#E4DCCB', l: '#C7BCA6', r: '#A99D86' }, mech: { t: '#E9864F', l: '#C8643B', r: '#A24C2B' }, accent: { t: '#4F86D6', l: '#3268B5', r: '#234F92' },
    ink: '#2B2A33', lane: '#B7A27E', goal: '#3268B5', spark: '#FFFFFF', roof: { t: '#E58A5A', l: '#C8643B', r: '#A14A2A' }, blue: { t: '#5B8FDB', l: '#3A6DBA', r: '#2A5398' } },
  { id: 'prism', name: 'Sunset Prism', bloom: 'crystal', blurb: 'A violet to gold ramp: ziggurat blocks stepping through violet, magenta and orange under a striped sun. The machine is a geode of crystal shards that falls open into a star.', chips: ['chapter 4', 'crystal star', 'floating shapes'],
    sky: 'linear-gradient(180deg,#3A1670 0%,#8A2E9C 40%,#F0658A 72%,#FFC24A 100%)', ramp: [{ t: '#BF94FA', l: '#8E5FE0', r: '#663BB5' }, { t: '#FB93D6', l: '#DF57A4', r: '#AE387E' }, { t: '#FFB872', l: '#F58442', r: '#CB5E25' }],
    stone: { t: '#BF94FA', l: '#8E5FE0', r: '#663BB5' }, idle: { t: '#CDB9E3', l: '#A48DC4', r: '#7F69A0' }, mech: { t: '#FFF39B', l: '#FFD43B', r: '#E6A500' }, ink: '#2A0F45', lane: '#5A2E86', goal: '#FFE25A', spark: '#FFF6C8' },
  { id: 'night', name: 'Lantern Night', bloom: 'lantern', blurb: 'Indigo towers with flickering windows, string lights, a water tower and a crescent moon. The machine is an umbrella of ribs that opens and lights a ring of paper lanterns.', chips: ['chapter 5', 'lantern ring', 'fireflies'],
    sky: 'linear-gradient(180deg,#0D1130 0%,#1D1E4C 55%,#3A2A5E 100%)', stone: { t: '#474C84', l: '#30346A', r: '#232652' }, idle: { t: '#5A5E92', l: '#43477A', r: '#323663' }, mech: { t: '#FFD27A', l: '#E9A94A', r: '#B98030' }, glow: '#FFC861',
    ink: '#0B0D24', lane: '#7D84C8', goal: '#FFC861', spark: '#FFE69A' },
  { id: 'brass', name: 'Clockwork Brass', bloom: 'clock', blurb: 'Bronze walls with rivets, spinning wall gears, a working clock face, pipes that puff steam and a pumping piston. The machine is a planetary gear set that slides out and meshes.', chips: ['chapter 6', 'planetary gears', 'steam and clocks'],
    sky: 'linear-gradient(180deg,#1E140B 0%,#3E2914 50%,#7A5222 100%)', stone: { t: '#CFA45A', l: '#9C7034', r: '#734F22' }, idle: { t: '#A8916A', l: '#86714E', r: '#655539' }, mech: { t: '#FFE28E', l: '#F7BE3E', r: '#CF9216' }, mechLight: { t: '#FFF0BE', l: '#FFD86E', r: '#E4AE3A' }, mechDark: { t: '#C99A4A', l: '#A37630', r: '#7C5820' },
    ink: '#2A1A08', lane: '#6B4A1E', goal: '#FFE28E', spark: '#FFF0BE', pipe: { t: '#D9925A', l: '#B4703C', r: '#8A5228' } },
];
const sp = (th, k) => th.ramp ? th.ramp[k % th.ramp.length] : th.stone;

/* ---------- theme decoration ---------- */
function windowsOn(g, th, face, plane, u0, u1, z0, z1, opt = {}) {
  const geo = opt.arch === false ? null : archGeo(opt.w || .22, opt.h || .9);
  const step = opt.step || .8, out = [];
  for (let u = u0 + (opt.offset ?? .45); u < u1 - .25; u += step) for (let z = z0 + (opt.zOff ?? 0); z < z1 - (opt.h || .9) - .2; z += opt.zStep || 99) {
    const m = onFace(g, face, plane, u, z, geo || rectGeo(opt.w || .3, opt.h || .4), opt.mat || tri(th.win || mixPal(th.stone, { t: th.ink, l: th.ink, r: th.ink }, .45)));
    out.push(m); if (opt.sill) onFace(g, face, plane, u, z - .06, rectGeo((opt.w || .22) + .14, .06), opt.sill, .02);
  }
  return out;
}
function cloudLayer(view, th, color, n, opacity, y0, y1, speed = .25) {
  const [l, r, b, t] = view.screenBox(), W = r - l;
  for (let i = 0; i < n; i++) { const s = sprite(TEX.cloud, 3 + rnd() * 2.5, 1.2 + rnd() * .6, color, { opacity }); const base = { x: l + (i + .15 + .7 * rnd()) / n * W, y: lerp(b + (t - b) * y0, b + (t - b) * y1, (i % 2 + rnd()) / 2), v: speed };   // spread out and moving together, so clouds never pile up
    view.scene.add(s); view.updaters.push(tt => { const x = l + ((base.x - l + tt * base.v) % (W + 6)) - 3; s.position.copy(view.sp(x, base.y, -60)); }); }
}
function birds(view, color, n, y0, y1) {
  const [l, r, b, t] = view.screenBox(), W = r - l;
  for (let i = 0; i < n; i++) { const s = sprite(TEX.bird, .42, .21, color, { opacity: .8 }); const o = { x: rnd() * W, y: lerp(b + (t - b) * y0, b + (t - b) * y1, rnd()), v: .7 + rnd() * .4, f: rnd() * 6 };
    view.scene.add(s); view.updaters.push(tt => { const x = l + ((o.x + tt * o.v) % (W + 2)) - 1; s.position.copy(view.sp(x, o.y + Math.sin(tt * .9 + o.f) * .2, -50)); s.scale.set(.42, .21 * (.45 + .55 * Math.abs(Math.sin(tt * 7 + o.f))), 1); }); }
}
function drift(view, tex, color, n, size, opt = {}) {
  const [l, r, b, t] = view.screenBox(), W = r - l, H = t - b;
  for (let i = 0; i < n; i++) { const s = sprite(tex, size, size, color, { opacity: opt.opacity ?? .9, depthTest: false, order: 4, add: opt.add }); const o = { x: rnd() * W, y: rnd() * H, vx: (opt.vx ?? .25) * (.5 + rnd()), vy: (opt.vy ?? -.15) * (.5 + rnd()), f: rnd() * TAU };
    view.scene.add(s); view.updaters.push(tt => { const x = l + (((o.x + tt * o.vx) % W) + W) % W, y = b + (((o.y + tt * o.vy + Math.sin(tt + o.f) * .3) % H) + H) % H; s.position.copy(view.sp(x + Math.sin(tt * 1.3 + o.f) * .25, y, 30));
      s.material.rotation = tt * (opt.spin ?? 1) + o.f; if (opt.twinkle) s.material.opacity = (opt.opacity ?? .9) * (.35 + .65 * Math.abs(Math.sin(tt * opt.twinkle + o.f))); }); }
}
function backdrop(view, tex, w, h, sx, sy, depth = -90, color = '#fff', opacity = 1) { const s = sprite(tex, w, h, color, { opacity }); s.position.copy(view.sp(sx, sy, depth)); view.scene.add(s); return s; }

const TEXS = {};
TEXS.duskSun = canvasTex(256, 256, (g) => { const r = g.createRadialGradient(128, 128, 30, 128, 128, 128); r.addColorStop(0, 'rgba(255,240,220,1)'); r.addColorStop(.42, 'rgba(255,214,190,.95)'); r.addColorStop(.45, 'rgba(255,214,190,.35)'); r.addColorStop(1, 'rgba(255,214,190,0)'); g.fillStyle = r; g.fillRect(0, 0, 256, 256); });
TEXS.duskFar = canvasTex(512, 160, (g) => { g.fillStyle = '#fff'; const shapes = [[20, 70, 40, 90], [70, 40, 26, 120], [100, 90, 60, 70], [170, 20, 20, 140], [200, 60, 70, 100], [290, 80, 30, 80], [330, 30, 34, 130], [380, 70, 80, 90], [470, 50, 30, 110]];
  for (const [x, y, w, h] of shapes) { g.fillRect(x, y, w, h); g.beginPath(); g.arc(x + w / 2, y, w / 2, Math.PI, 0); g.fill(); } g.fillRect(0, 150, 512, 10); });
TEXS.hills = canvasTex(512, 200, (g) => { const cols = ['#B6E3B4', '#93D29A', '#74BF83']; cols.forEach((c, k) => { g.fillStyle = c; g.beginPath(); g.moveTo(0, 200); for (let x = 0; x <= 512; x += 8) g.lineTo(x, 70 + k * 38 + Math.sin(x * .012 + k * 2) * 26 + Math.sin(x * .031 + k) * 12); g.lineTo(512, 200); g.fill(); }); });
TEXS.sea = canvasTex(512, 200, (g) => { const r = g.createLinearGradient(0, 0, 0, 200); r.addColorStop(0, '#7FC6E4'); r.addColorStop(1, '#2F78B4'); g.fillStyle = r; g.fillRect(0, 40, 512, 160); g.fillStyle = '#E9D9B8'; g.beginPath(); g.moveTo(330, 42); g.quadraticCurveTo(380, 6, 440, 42); g.fill(); g.fillStyle = '#C9B48E'; g.fillRect(360, 30, 10, 12); });
TEXS.glint = canvasTex(32, 8, (g) => { g.fillStyle = '#fff'; g.fillRect(2, 3, 28, 2); });
TEXS.prismSun = canvasTex(256, 256, (g) => { const r = g.createLinearGradient(0, 20, 0, 236); r.addColorStop(0, '#FFF2A0'); r.addColorStop(.55, '#FFB04A'); r.addColorStop(1, '#F0508C'); g.fillStyle = r; g.beginPath(); g.arc(128, 128, 108, 0, TAU); g.fill(); g.globalCompositeOperation = 'destination-out'; for (let k = 0; k < 7; k++) { const y = 140 + k * 15; g.fillRect(0, y, 256, 3 + k * 1.3); } });
TEXS.moon = canvasTex(128, 128, (g) => { g.fillStyle = '#FFF4D6'; g.beginPath(); g.arc(64, 64, 40, 0, TAU); g.fill(); g.globalCompositeOperation = 'destination-out'; g.beginPath(); g.arc(84, 54, 36, 0, TAU); g.fill(); });
TEXS.skyline = canvasTex(512, 160, (g) => { g.fillStyle = '#fff'; let x = 0; while (x < 512) { const w = 18 + (x * 7 % 30), h = 40 + (x * 13 % 90); g.fillRect(x, 160 - h, w, h); x += w + 4; } });
TEXS.bigGear = canvasTex(256, 256, (g) => { g.fillStyle = '#fff'; g.beginPath(); const n = 14; for (let i = 0; i < n * 2; i++) { const a = i / (n * 2) * TAU, r = i % 2 ? 98 : 120; g.lineTo(128 + r * Math.cos(a), 128 + r * Math.sin(a)); } g.fill(); g.globalCompositeOperation = 'destination-out'; g.beginPath(); g.arc(128, 128, 60, 0, TAU); g.fill(); g.globalCompositeOperation = 'source-over'; for (let i = 0; i < 6; i++) { g.save(); g.translate(128, 128); g.rotate(i * TAU / 6); g.fillRect(-8, 0, 16, 64); g.restore(); } g.beginPath(); g.arc(128, 128, 20, 0, TAU); g.fill(); });
TEXS.tile = canvasTex(64, 64, (g) => { g.fillStyle = '#F4F6FB'; g.fillRect(0, 0, 64, 64); g.fillStyle = '#2F5FA8'; g.beginPath(); g.moveTo(32, 4); g.lineTo(60, 32); g.lineTo(32, 60); g.lineTo(4, 32); g.fill(); g.fillStyle = '#F4F6FB'; g.beginPath(); g.arc(32, 32, 12, 0, TAU); g.fill(); g.fillStyle = '#E9864F'; g.beginPath(); g.arc(32, 32, 6, 0, TAU); g.fill(); g.strokeStyle = '#2F5FA8'; g.lineWidth = 3; g.strokeRect(0, 0, 64, 64); });
TEXS.water = canvasTex(32, 128, (g) => { g.fillStyle = '#9FE0F0'; g.fillRect(0, 0, 32, 128); g.fillStyle = '#E8FBFF'; for (let i = 0; i < 6; i++) g.fillRect((i * 11) % 28, i * 22, 3, 14); g.fillStyle = '#6CC5DD'; for (let i = 0; i < 5; i++) g.fillRect((i * 17 + 6) % 28, i * 26 + 8, 2, 10); });
TEXS.water.wrapS = TEXS.water.wrapT = T.RepeatWrapping;

/* ---------- the level, shared by all six looks ---------- */
function buildLevel(view, th, opts = {}) {
  seedState = 11 + th.id.length * 7;
  const g = new T.Group(); view.scene.add(g); const up = view.updaters;
  const lane = tri(tone(th.lane));
  // base the monument floats on, stepping in underneath
  const baseP = mixPal(sp(th, 0), { t: th.ink, l: th.ink, r: th.ink }, .12);
  B(g, -0.4, -3.0, -3.4, 12.6, 1.5, -2.8, tri(baseP)); B(g, .6, -2.4, -4.1, 11.6, .9, -3.4, tri(mixPal(baseP, { t: th.ink, l: th.ink, r: th.ink }, .1))); B(g, 2.2, -1.8, -4.6, 10, .3, -4.1, tri(mixPal(baseP, { t: th.ink, l: th.ink, r: th.ink }, .2)));
  // towers
  const towerP = sp(th, 0), hallP = sp(th, 1), ledgeP = sp(th, 1), ringP = sp(th, 2), rightP = sp(th, 2);
  B(g, 0, -2.6, -2.8, 2.8, 0, 6, tri(towerP));
  B(g, 8.6, -2.6, -2.8, 12.2, -.4, 4.4, tri(hallP));
  B(g, 0, 0, -2.8, 2.8, 1, 2, tri(ledgeP)); dashes(g, [.25, .5], [2.75, .5], lane, 2);
  CY(g, 3.9, .5, 1.15, -2.8, 2, tri(ringP), 40); ringDashes(g, 3.9, .5, .78, 2, lane);
  B(g, 6.75, .25, -2.8, 7.25, .75, 1.68, tri(sp(th, 0)));
  B(g, 9, 0, -2.8, 12.2, 1, 2, tri(rightP)); dashes(g, [9.2, .5], [12, .5], lane, 2);
  makeFlag(g, 11.5, .5, 2, th.goal, th.ink, up);
  // the turntable bridge and its bloom on the pivot plane
  const arm = new T.Group(); arm.position.copy(V(7, .5, 2)); g.add(arm);
  const armMat = tri(th.idle, { fresh: true });
  const slab = new T.Mesh(UNIT, armMat); slab.scale.set(4, .32, 1); slab.position.y = -.16; arm.add(slab);
  for (let i = -4; i <= 4; i++) { if (Math.abs(i) < 2) continue; const d = new T.Mesh(UNIT, lane); d.scale.set(.17, .012, .045); d.position.set(i * .45, .006, 0); arm.add(d); }
  const crank = machine(view, th, h => { arm.add(h); }, .95);
  const st = { th: 30, armMat, crank, arm, auto: true };
  up.push((t, dt) => { if (crank.target && crank.pedal) st.th += 22 * dt; arm.rotation.y = -st.th * Math.PI / 180; setTri(armMat, mixPal(th.idle, th.mech, clamp(crank.e, 0, 1))); });
  // the wheel circling the roundabout
  const wheel = makeWheel(th); g.add(wheel);
  up.push(t => { const a = t * 1.5; placeWheel(wheel, 3.9 + .78 * Math.cos(a), .5 + .78 * Math.sin(a), 2, -Math.sin(a), Math.cos(a), t * 1.5 * .78 / .37); });
  view.frame([6.1, -.5, 1.2], (() => { const pts = [V(-.4, -3, 6.6), V(12.6, -3, 6), V(12.6, 1.5, -4.6), V(-.4, 1.5, -4.6), V(-.4, 1.5, 3), V(13, -3, 2), V(1.4, -1.3, 8.6)]; const c = V(6.1, -.5, 1.2); const s = pts.map(p => toScreen(p, c)); return [Math.min(...s.map(q => q[0])), Math.max(...s.map(q => q[0])), Math.min(...s.map(q => q[1])), Math.max(...s.map(q => q[1]))]; })(), .9);
  decorate[th.id](view, g, th, up);
  return st;
}

const decorate = {
  dusk(view, g, th, up) {
    // dome, drum, spire and pennant on the tower; stepped crown on the hall
    CY(g, 1.4, -1.3, 1.15, 6, 6.35, tri(mixPal(th.stone, th.win, .15)), 32);
    const dome = new T.Mesh(new T.SphereGeometry(1.0, 20, 10, 0, TAU, 0, Math.PI / 2), tri(th.mech)); dome.position.copy(V(1.4, -1.3, 6.35)); g.add(dome);
    CY(g, 1.4, -1.3, .05, 7.3, 8.3, tri(tone(th.ink)), 8, .02); const fin = new T.Mesh(new T.SphereGeometry(.1, 10, 8), tri(tone('#FFD15C'))); fin.position.copy(V(1.4, -1.3, 8.35)); g.add(fin);
    const pen = new T.Mesh(new T.ConeGeometry(.16, .7, 3), basic('#FF8E6E', { side: true })); pen.rotation.z = -Math.PI / 2; const penG = new T.Group(); penG.position.copy(V(1.4, -1.3, 8.05)); pen.position.x = .35; penG.add(pen); g.add(penG);
    up.push(t => { penG.rotation.y = Math.sin(t * 1.4) * .5 - .3; pen.scale.y = 1 + Math.sin(t * 6) * .06; });
    B(g, 8.9, -2.3, 4.4, 11.9, -.7, 4.75, tri(th.stone)); B(g, 9.3, -2, 4.75, 11.5, -1, 5.05, tri(th.stone)); const d2 = new T.Mesh(new T.SphereGeometry(.42, 16, 8, 0, TAU, 0, Math.PI / 2), tri(th.mech)); d2.position.copy(V(10.4, -1.5, 5.05)); g.add(d2);
    const sill = tri(mixPal(th.stone, { t: '#ffffff', l: '#ffffff', r: '#ffffff' }, .3));
    windowsOn(g, th, 'x', 2.8, -2.6, 0, 3.2, 6, { step: .75, w: .2, h: 1.3, sill }); windowsOn(g, th, 'y', 0, 0, 2.8, 3.4, 6, { step: .75, w: .2, h: 1.1, sill });
    windowsOn(g, th, 'y', -.4, 8.6, 12.2, 1.6, 4.4, { step: .8, w: .22, h: 1.2, sill }); windowsOn(g, th, 'x', 12.2, -2.6, -.4, 1.8, 4.4, { step: .7, w: .2, h: 1.1, sill });
    onFace(g, 'y', 1, 1.4, -2.2, archGeo(.6, 1.3), tri(th.win)); onFace(g, 'y', 1, 10.6, -2.2, archGeo(.6, 1.3), tri(th.win));
    B(g, 0, 1, 1.55, 2.8, 1.04, 1.7, tri(mixPal(th.stone, th.mech, .35))); B(g, 9, 1, 1.55, 12.2, 1.04, 1.7, tri(mixPal(th.stone, th.mech, .35)));
    const [l, r, b, t] = view.screenBox();
    backdrop(view, TEXS.duskSun, 6, 6, r - 3.2, b + (t - b) * .62, -110);
    backdrop(view, TEXS.duskFar, 18, 5.6, 0, b + 2.3, -100, '#D9C4E6', .9);
    cloudLayer(view, th, '#FFF1EC', 5, .85, .55, .95, .18);
    birds(view, '#6E5F99', 4, .62, .9);
    drift(view, TEX.petal, '#FFB9A3', 14, .16, { vx: .35, vy: -.2, spin: 1.6 });
  },
  garden(view, g, th, up) {
    const turf = tri(th.turf);
    for (const [x0, y0, x1, y1, z] of [[0, -2.6, 2.8, 0, 6], [8.6, -2.6, 12.2, -.4, 4.4]]) B(g, x0 - .06, y0 - .06, z - .18, x1 + .06, y1 + .06, z + .02, turf);
    for (const [x0, y0, x1, y1] of [[0, 0, 2.8, 1], [9, 0, 12.2, 1]]) B(g, x0 - .04, y0 - .04, 1.86, x1 + .04, y1 + .06, 1.99, turf);
    const tree = (x, y, z, s, ph) => { const tg = new T.Group(); tg.position.copy(V(x, y, z)); g.add(tg); const tr = new T.Mesh(new T.CylinderGeometry(.07 * s, .1 * s, .8 * s, 7), tri(tone('#8A5A34'))); tr.position.y = .4 * s; tg.add(tr);
      const c1 = new T.Mesh(new T.IcosahedronGeometry(.62 * s, 0), tri(th.leaf)); c1.position.y = 1.05 * s; tg.add(c1); const c2 = new T.Mesh(new T.IcosahedronGeometry(.42 * s, 0), tri(mixPal(th.leaf, th.turf, .5))); c2.position.set(.25 * s, 1.45 * s, .1 * s); tg.add(c2);
      up.push(t => { tg.rotation.z = Math.sin(t * 1.1 + ph) * .035; tg.rotation.x = Math.cos(t * .9 + ph) * .025; }); };
    tree(.7, -1.9, 6.02, 1.1, 0); tree(2.0, -.8, 6.02, .8, 2); tree(9.4, -1.6, 4.42, 1, 1); tree(11.5, -2, 4.42, .7, 3);
    const bush = (x, y, z, s) => { const m = new T.Mesh(new T.DodecahedronGeometry(.3 * s, 0), tri(th.leaf)); m.position.copy(V(x, y, z + .18 * s)); m.scale.y = .7; g.add(m); };
    bush(2.4, -2.2, 6, 1); bush(11.8, -.8, 4.4, 1.1); bush(9.2, -.7, 4.4, .8);
    for (let i = 0; i < 14; i++) { const f = new T.Mesh(new T.SphereGeometry(.055, 6, 4), tri(tone(['#FF95BE', '#FFE066', '#FFFFFF'][i % 3]))); const onTower = i < 8; f.position.copy(onTower ? V(.3 + rnd() * 2.2, -2.4 + rnd() * 2.2, 6.05) : V(8.8 + rnd() * 3.2, -2.4 + rnd() * 1.8, 4.45)); g.add(f); }
    // vines hanging off the top edges
    const leafM = tri(th.leaf, { side: true }), lg = new T.PlaneGeometry(.12, .16);
    const vine = (face, plane, u, ztop, n, ph) => { const vg = new T.Group(); g.add(vg); for (let k = 0; k < n; k++) { const m = new T.Mesh(lg, leafM); vg.add(m); m.userData.k = k; }
      up.push(t => vg.children.forEach(m => { const k = m.userData.k, sw = Math.sin(t * 1.4 + ph + k * .35) * .04 * k / n; const z = ztop - .1 - k * .14; if (face === 'x') { m.position.copy(V(plane + .03, u + sw + (k % 2 ? .05 : -.05), z)); m.rotation.set(0, Math.PI / 2, (k % 2 ? .6 : -.6)); } else { m.position.copy(V(u + sw + (k % 2 ? .05 : -.05), plane + .03, z)); m.rotation.set(0, 0, (k % 2 ? .6 : -.6)); } })); };
    [[-2.2, 10], [-1.5, 16], [-.6, 8]].forEach(([u, n], i) => vine('x', 2.8, u, 6, n, i)); [[.5, 12], [1.6, 18], [2.4, 7]].forEach(([u, n], i) => vine('y', 0, u, 6, n, i + 3));
    [[9.3, 9], [10.4, 14], [11.6, 6]].forEach(([u, n], i) => vine('y', -.4, u, 4.4, n, i + 6)); [[0.4, 6], [2.0, 9]].forEach(([u, n], i) => vine('y', 1, u, 1.9, n, i + 9));
    // a waterfall pouring off the hall into the void
    const wf = new T.Mesh(new T.PlaneGeometry(.7, 9.2), new T.MeshBasicMaterial({ map: TEXS.water, transparent: true, opacity: .92 })); wf.material.map = TEXS.water.clone(); wf.material.map.needsUpdate = true; wf.material.map.repeat.set(1, 4);
    wf.rotation.y = Math.PI / 2; wf.position.copy(V(12.23, -1.5, 4.25 - 4.6)); g.add(wf); B(g, 12.2, -1.95, 4.0, 12.5, -1.05, 4.2, tri(th.stone));
    up.push(t => { wf.material.map.offset.y = t * 1.4; });
    for (let i = 0; i < 4; i++) { const p = sprite(TEX.puff, .5, .4, '#E8FBFF', { opacity: .8 }); g.add(p); up.push(t => { const f = (t * .9 + i / 4) % 1; p.position.copy(V(12.6 + f * .5, -1.5 + (i - 1.5) * .25, -4.6 - f * .3)); p.material.opacity = .8 * (1 - f); p.scale.setScalar(.35 + f * .5); }); }
    // dangling roots under the island
    for (let i = 0; i < 9; i++) { const r = new T.Mesh(new T.CylinderGeometry(.02, .04, .9 + rnd() * 1.2, 5), tri(tone('#8A5A34'))); r.position.copy(V(2.6 + i * .85, -1 + rnd() * 1.2, -5.0 - rnd() * .3)); g.add(r); }
    const [l, r, b, t] = view.screenBox();
    backdrop(view, TEXS.duskSun, 5, 5, l + 3, b + (t - b) * .78, -110, '#FFFBE0');
    backdrop(view, TEXS.hills, 22, 7, 0, b + 2.6, -100, '#ffffff', .95);
    cloudLayer(view, th, '#FFFFFF', 5, .9, .6, .95, .2);
    drift(view, TEX.petal, '#7CC95A', 10, .17, { vx: .3, vy: -.18, spin: 2 });
    // butterflies
    for (let i = 0; i < 3; i++) { const bf = new T.Group(); const wm = basic(['#FFB5CE', '#FFE066', '#B5D9FF'][i], { side: true }); const w1 = new T.Mesh(new T.CircleGeometry(.12, 10), wm), w2 = w1.clone(); w1.position.x = .1; w2.position.x = -.1; const a = new T.Group(), b2 = new T.Group(); a.add(w1); b2.add(w2); bf.add(a, b2); view.scene.add(bf);
      up.push(t => { const s = t * .5 + i * 2.1; bf.position.copy(V(4 + 5 * Math.sin(s * .7 + i), .5 + 2 * Math.cos(s * .5 + i), 3.4 + 1.2 * Math.sin(s * 1.3))); bf.rotation.y = s; const f = Math.sin(t * 16 + i) * 1.1; a.rotation.y = f; b2.rotation.y = -f; }); }
  },
  town(view, g, th, up) {
    const roof = (x0, y0, x1, y1, z, h) => { const m = new T.Mesh(new T.ConeGeometry(Math.hypot(x1 - x0, y1 - y0) / 2, h, 4, 1), tri(th.roof)); m.rotation.y = Math.PI / 4; m.scale.set((x1 - x0) / Math.hypot(x1 - x0, y1 - y0) * 1.42, 1, (y1 - y0) / Math.hypot(x1 - x0, y1 - y0) * 1.42); m.position.copy(V((x0 + x1) / 2, (y0 + y1) / 2, z + h / 2)); g.add(m); };
    B(g, -.12, -2.72, 5.85, 2.92, .12, 6.05, tri(th.roof)); roof(-.1, -2.7, 2.9, .1, 6.05, 1.5);
    B(g, 8.48, -2.72, 4.25, 12.32, -.28, 4.45, tri(th.roof)); roof(8.5, -2.7, 12.3, -.3, 4.45, 1.2);
    B(g, 2.0, -2.3, 6.6, 2.4, -1.9, 7.6, tri(th.stone)); B(g, 1.95, -2.35, 7.6, 2.45, -1.85, 7.7, tri(th.roof));
    // tile bands
    const band = (face, plane, u0, u1, z) => { const w = u1 - u0, mt = new T.MeshBasicMaterial({ map: TEXS.tile.clone(), color: face === 'x' ? '#C9D0DE' : '#ECEFF6' }); mt.map.needsUpdate = true; mt.map.wrapS = T.RepeatWrapping; mt.map.repeat.set(w / .32, 1); onFace(g, face, plane, (u0 + u1) / 2, z, rectGeo(w, .32), mt); };
    band('x', 2.8, -2.6, 0, 5.3); band('y', 0, 0, 2.8, 5.3); band('y', -.4, 8.6, 12.2, 3.75); band('x', 12.2, -2.6, -.4, 3.75); band('y', 1, 0, 2.8, 1.45); band('y', 1, 9, 12.2, 1.45);
    // windows with shutters and flower boxes
    const win = tri(tone('#3C3B4C')), shut = tri(th.blue), pot = tri(th.roof);
    const wset = (face, plane, us, zs) => { for (const u of us) for (const z of zs) { onFace(g, face, plane, u, z, archGeo(.32, .62), win); onFace(g, face, plane, u - .27, z, rectGeo(.16, .5), shut, .02); onFace(g, face, plane, u + .27, z, rectGeo(.16, .5), shut, .02);
      if (face === 'y') { B(g, u - .22, plane, z - .14, u + .22, plane + .16, z - .02, pot); for (let k = 0; k < 3; k++) { const f = new T.Mesh(new T.SphereGeometry(.06, 6, 4), tri(tone(['#E8435A', '#FF8FB1', '#FFD24A'][k]))); f.position.copy(V(u - .13 + k * .13, plane + .08, z + .02)); g.add(f); } } } };
    wset('x', 2.8, [-2.0, -.7], [3.4, 1.4]); wset('y', 0, [.7, 2.1], [3.4]); wset('y', -.4, [9.4, 10.9], [2.3]); wset('x', 12.2, [-1.9, -1.0], [2.2]);
    onFace(g, 'y', 1, 10.6, -2.4, archGeo(.7, 1.4), tri(th.roof)); onFace(g, 'y', 0, 1.4, 1.0, archGeo(.6, 1.2), tri(tone('#2F5FA8')));
    // laundry on a sagging line between the tower and the hall
    const A = [2.8, -1.4, 4.9], Bp = [8.6, -1.6, 3.6]; const pts = []; for (let i = 0; i <= 16; i++) { const f = i / 16; pts.push(V(lerp(A[0], Bp[0], f), lerp(A[1], Bp[1], f), lerp(A[2], Bp[2], f) - Math.sin(f * Math.PI) * .55)); }
    g.add(new T.Line(new T.BufferGeometry().setFromPoints(pts), new T.LineBasicMaterial({ color: th.ink })));
    ['#E8435A', '#FFFFFF', '#5B8FDB', '#FFD24A', '#FFFFFF'].forEach((c, i) => { const f = (i + 1) / 6, p = pts[Math.round(f * 16)]; const geo = new T.PlaneGeometry(.36, .5, 4, 4); geo.translate(0, -.25, 0); const m = new T.Mesh(geo, basic(c, { side: true })); m.position.copy(p); m.rotation.y = -Math.PI / 4; g.add(m); const base = geo.attributes.position.array.slice();
      up.push(t => { const q = geo.attributes.position; for (let k = 0; k < q.count; k++) { const y = base[k * 3 + 1]; q.setZ(k, Math.sin(t * 4 + i + base[k * 3] * 5) * .06 * -y * 2); } q.needsUpdate = true; m.rotation.y = -Math.PI / 4 + Math.sin(t * 1.5 + i) * .15; }); });
    // potted cypress by the door
    const cyp = new T.Mesh(new T.ConeGeometry(.22, 1.1, 7), tri({ t: '#4E9A55', l: '#3C7F44', r: '#2E6536' })); cyp.position.copy(V(12.0, .7, 2.65)); g.add(cyp); CY(g, 12.0, .7, .17, 2, 2.15, pot, 10);
    const [l, r, b, t] = view.screenBox();
    backdrop(view, TEXS.sea, 24, 9, 0, b + 2.6, -100);
    for (let i = 0; i < 14; i++) { const s = sprite(TEXS.glint, .3, .06, '#FFFFFF', { opacity: 0 }); const x = l + rnd() * (r - l), y = b + .6 + rnd() * 3.2; s.position.copy(view.sp(x, y, -95)); view.scene.add(s); const ph = rnd() * TAU; up.push(tt => s.material.opacity = Math.max(0, Math.sin(tt * 1.7 + ph)) * .9); }
    backdrop(view, TEXS.duskSun, 4.5, 4.5, r - 3.5, b + (t - b) * .8, -110, '#FFF6D8');
    cloudLayer(view, th, '#FFFFFF', 4, .95, .55, .95, .22);
    birds(view, '#FFFFFF', 5, .55, .92);
  },
  prism(view, g, th, up) {
    const R = th.ramp;
    B(g, .3, -2.3, 6, 2.5, -.3, 6.5, tri(R[1])); B(g, .7, -1.9, 6.5, 2.1, -.7, 6.9, tri(R[2]));
    B(g, 8.9, -2.3, 4.4, 11.9, -.7, 4.8, tri(R[2])); B(g, 9.4, -1.9, 4.8, 11.4, -1.1, 5.1, tri(R[0]));
    const cr = new T.Mesh(new T.OctahedronGeometry(.5, 0), tri(th.mech)); cr.scale.set(.7, 1.5, .7); g.add(cr);
    const halo = sprite(TEX.glow, 2.4, 2.4, '#FFE97A', { add: true, opacity: .55 }); g.add(halo);
    up.push(t => { cr.position.copy(V(1.4, -1.3, 7.9 + Math.sin(t * 1.4) * .18)); cr.rotation.y = t * .8; halo.position.copy(cr.position); halo.material.opacity = .45 + .15 * Math.sin(t * 2); });
    const c2 = new T.Mesh(new T.OctahedronGeometry(.3, 0), tri(R[1])); c2.scale.set(.7, 1.5, .7); g.add(c2); up.push(t => { c2.position.copy(V(10.4, -1.5, 5.9 + Math.sin(t * 1.7 + 1) * .14)); c2.rotation.y = -t; });
    const bands = (face, plane, u0, u1, z0, h, k) => { const w = u1 - u0; onFace(g, face, plane, (u0 + u1) / 2, z0 + h * .64, rectGeo(w, .3), tri(R[(k + 1) % 3]), .015); onFace(g, face, plane, (u0 + u1) / 2, z0 + h * .3, rectGeo(w, .16), tri(R[(k + 2) % 3]), .015);
      for (let u = u0 + .45; u < u1 - .3; u += .7) { const s = new T.Shape(); s.moveTo(-.14, 0); s.lineTo(.14, 0); s.lineTo(0, .28); s.lineTo(-.14, 0); onFace(g, face, plane, u, z0 + h * .44, new T.ShapeGeometry(s), tri(th.mech), .02); } };
    bands('x', 2.8, -2.6, 0, -2.8, 8.8, 0); bands('y', 0, 0, 2.8, -2.8, 8.8, 0); bands('y', -.4, 8.6, 12.2, -2.8, 7.2, 1); bands('x', 12.2, -2.6, -.4, -2.8, 7.2, 1); bands('y', 1, 0, 2.8, -2.8, 4.8, 1); bands('y', 1, 9, 12.2, -2.8, 4.8, 2); bands('x', 12.2, 0, 1, -2.8, 4.8, 2);
    const [l, r, b, t] = view.screenBox();
    const sun = backdrop(view, TEXS.prismSun, 7, 7, 0, b + (t - b) * .42, -110);
    up.push(tt => sun.material.rotation = 0);
    const shapes = [new T.TorusGeometry(.5, .16, 8, 20), new T.TetrahedronGeometry(.55, 0), new T.OctahedronGeometry(.45, 0), new T.TorusGeometry(.35, .12, 6, 6), new T.IcosahedronGeometry(.4, 0)];
    for (let i = 0; i < 7; i++) { const m = new T.Mesh(shapes[i % shapes.length], tri(R[i % 3])); const sx = lerp(l + 1, r - 1, (i + .5) / 7), sy = lerp(b + 3, t - 1, rnd()); m.position.copy(view.sp(sx, sy, -40)); view.scene.add(m); const ph = rnd() * TAU;
      up.push(tt => { m.rotation.set(tt * .3 + ph, tt * .4, 0); m.position.copy(view.sp(sx, sy + Math.sin(tt * .7 + ph) * .3, -40)); }); }
    drift(view, TEX.diamond, '#FFF6C8', 16, .16, { vx: .1, vy: .25, spin: 0, twinkle: 2.4, add: true });
  },
  night(view, g, th, up) {
    const winMats = [];
    const lit = (face, plane, u0, u1, z0, z1) => { for (let z = z0; z < z1 - .5; z += .9) for (let u = u0 + .4; u < u1 - .35; u += .62) { const m = basic('#FFC861'); winMats.push({ m, on: rnd() > .3, ph: rnd() * 40 }); onFace(g, face, plane, u, z, rectGeo(.3, .44), m); } };
    lit('x', 2.8, -2.6, 0, -1.8, 6); lit('y', 0, 0, 2.8, 2.6, 6); lit('y', -.4, 8.6, 12.2, -1.8, 4.4); lit('x', 12.2, -2.6, -.4, -1.8, 4.4); lit('y', 1, 0, 2.8, -2.4, 1.6); lit('y', 1, 9, 12.2, -2.4, 1.6);
    up.push(t => winMats.forEach(w => { const flick = Math.floor(t * .25 + w.ph) % 7 === 0; const on = flick ? !w.on : w.on; w.m.color.set(on ? (Math.sin(t * 3 + w.ph) > .97 ? '#FFE3A0' : '#FFC861') : '#1A1C40'); }));
    // water tower on the tower roof, antenna with a blinking light on the hall
    for (const [dx, dy] of [[-.4, -.4], [.4, -.4], [-.4, .4], [.4, .4]]) CY(g, 1.4 + dx, -1.3 + dy, .04, 6, 6.9, tri(tone('#2A2E5A')), 6);
    CY(g, 1.4, -1.3, .62, 6.9, 7.8, tri({ t: '#6A5040', l: '#53402F', r: '#3E3024' }), 16); const cap = new T.Mesh(new T.ConeGeometry(.7, .5, 16), tri({ t: '#4A3A2E', l: '#3A2D24', r: '#2B2119' })); cap.position.copy(V(1.4, -1.3, 8.05)); g.add(cap);
    CY(g, 11.2, -1.4, .03, 4.4, 6.0, tri(tone('#9AA0C8')), 6); const blink = sprite(TEX.glow, .6, .6, '#FF4D4D', { add: true }); blink.position.copy(V(11.2, -1.4, 6.05)); g.add(blink); up.push(t => blink.material.opacity = (t % 1.6) < .2 ? 1 : .08);
    // string lights
    const A = [2.8, -.6, 5.6], Bp = [8.6, -.9, 4.1]; const pts = []; for (let i = 0; i <= 20; i++) { const f = i / 20; pts.push(V(lerp(A[0], Bp[0], f), lerp(A[1], Bp[1], f), lerp(A[2], Bp[2], f) - Math.sin(f * Math.PI) * .7)); }
    g.add(new T.Line(new T.BufferGeometry().setFromPoints(pts), new T.LineBasicMaterial({ color: '#0B0D24' })));
    pts.forEach((p, i) => { if (i % 2) return; const c = ['#FFC861', '#FF8FB1', '#86F2E2'][i / 2 % 3]; const bulb = new T.Mesh(new T.SphereGeometry(.05, 6, 4), basic(c)); bulb.position.copy(p); g.add(bulb); const gl = sprite(TEX.glow, .45, .45, c, { add: true }); gl.position.copy(p); g.add(gl); up.push(t => gl.material.opacity = .5 + .4 * Math.sin(t * 2.5 + i)); });
    const doorGlow = (x, y, z) => { onFace(g, 'y', y, x, z, archGeo(.7, 1.3), basic('#FFB54A')); const s = sprite(TEX.glow, 2, 2, '#FFB54A', { add: true, opacity: .35 }); s.position.copy(V(x, y + .1, z + .6)); g.add(s); };
    doorGlow(10.6, 1, -2.6);
    const [l, r, b, t] = view.screenBox();
    const moon = backdrop(view, TEXS.moon, 2.6, 2.6, r - 3, b + (t - b) * .82, -110); const mg = backdrop(view, TEX.glow, 6, 6, r - 3.1, b + (t - b) * .82, -111, '#FFF4D6', .25); mg.material.blending = T.AdditiveBlending;
    backdrop(view, TEXS.skyline, 22, 5, 0, b + 1.9, -100, '#252963', 1);
    for (let i = 0; i < 40; i++) { const s = sprite(TEX.dot, .06 + rnd() * .05, .06 + rnd() * .05, '#FFFFFF', { opacity: .8 }); s.position.copy(view.sp(lerp(l, r, rnd()), lerp(b + (t - b) * .35, t, rnd()), -105)); view.scene.add(s); const ph = rnd() * TAU, sp2 = .8 + rnd() * 2; up.push(tt => s.material.opacity = .25 + .6 * Math.abs(Math.sin(tt * sp2 + ph))); }
    drift(view, TEX.glow, '#FFE69A', 14, .3, { vx: .12, vy: .1, spin: 0, twinkle: 1.6, add: true, opacity: .9 });
  },
  brass(view, g, th, up) {
    // rivet rows along every visible edge, instanced
    const riv = []; const addRow = (a, b2, n) => { for (let i = 0; i <= n; i++) riv.push(V(lerp(a[0], b2[0], i / n), lerp(a[1], b2[1], i / n), lerp(a[2], b2[2], i / n))); };
    for (const [x0, y0, z0, x1, y1, z1] of [[0, -2.6, -2.8, 2.8, 0, 6], [8.6, -2.6, -2.8, 12.2, -.4, 4.4], [0, 0, -2.8, 2.8, 1, 2], [9, 0, -2.8, 12.2, 1, 2]]) {
      for (const z of [z1 - .15, z0 + .3]) { addRow([x1 + .02, y0 + .15, z], [x1 + .02, y1 - .15, z], Math.round((y1 - y0) / .3)); addRow([x0 + .15, y1 + .02, z], [x1 - .15, y1 + .02, z], Math.round((x1 - x0) / .3)); }
      addRow([x1 + .02, y1 + .02, z0 + .3], [x1 + .02, y1 + .02, z1 - .15], Math.round((z1 - z0) / .3)); }
    const rg = new T.SphereGeometry(.045, 6, 4), rm = tri(th.mech), inst = new T.InstancedMesh(rg, rm, riv.length); const mtx = new T.Matrix4(); riv.forEach((p, i) => { mtx.makeTranslation(p.x, p.y, p.z); inst.setMatrixAt(i, mtx); }); g.add(inst);
    // panels
    const panel = tri(mixPal(th.stone, { t: th.ink, l: th.ink, r: th.ink }, .14));
    for (const [face, plane, u0, u1, z0, z1] of [['x', 2.8, -2.4, -.2, -2.4, 5.7], ['y', 0, .2, 2.6, 2.4, 5.7], ['y', -.4, 8.8, 12, -2.4, 4.1], ['x', 12.2, -2.4, -.6, -2.4, 4.1]]) onFace(g, face, plane, (u0 + u1) / 2, z0, rectGeo(u1 - u0, z1 - z0), panel, .008);
    // a working clock on the tower's front
    const clock = new T.Group(); clock.position.copy(V(1.4, 0.02, 4.4)); g.add(clock);
    clock.add(new T.Mesh(new T.CircleGeometry(.95, 40), basic('#F6EBD2'))); const rim = new T.Mesh(new T.TorusGeometry(.95, .07, 8, 40), tri(th.mech)); clock.add(rim);
    for (let i = 0; i < 12; i++) { const k = new T.Mesh(UNIT, basic('#3A2A14')); k.scale.set(.04, i % 3 ? .1 : .18, .01); const a = i / 12 * TAU; k.position.set(Math.sin(a) * .78, Math.cos(a) * .78, .01); k.rotation.z = -a; clock.add(k); }
    const hand = (len, w, c) => { const h = new T.Group(); const m = new T.Mesh(UNIT, basic(c)); m.scale.set(w, len, .01); m.position.set(0, len / 2 - .08, .02); h.add(m); clock.add(h); return h; };
    const hh = hand(.48, .07, '#3A2A14'), mh = hand(.72, .045, '#3A2A14'), sh = hand(.8, .02, '#B1332A');
    up.push(t => { mh.rotation.z = -t * .35; hh.rotation.z = -t * .35 / 12 - 1; const s = Math.floor(t) + ease((t % 1) * 5); sh.rotation.z = -s * TAU / 60; });
    // spinning gears on the hall's side
    const wallGear = (y, z, r, teeth, dir, ph) => { const o = new T.Group(); o.position.copy(V(12.25, y, z)); o.rotation.z = -Math.PI / 2; g.add(o); const m = new T.Mesh(gearGeo(r, teeth, .1, .16, r * .25), tri(th.mech)); o.add(m); up.push(t => m.rotation.y = dir * t * .8 / r + ph); };
    wallGear(-1.7, 2.4, .62, 16, 1, 0); wallGear(-.82, 1.55, .36, 9, -1, .2); wallGear(-1.95, .9, .28, 7, -1, .1);
    // pipes with steam puffs
    const pipe = tri(th.pipe);
    CY(g, 11.8, -2.0, .16, 4.4, 6.0, pipe, 12); CY(g, 11.8, -2.0, .22, 6.0, 6.15, tri(th.mech), 12); CY(g, 9.4, -2.2, .12, 4.4, 5.3, pipe, 12);
    for (let i = 0; i < 6; i++) { const p = sprite(TEX.puff, .5, .45, '#F6EEE0', { opacity: .8 }); g.add(p); up.push(t => { const f = (t * .55 + i / 6) % 1; p.position.copy(V(11.8 + f * .4, -2.0, 6.2 + f * 1.8)); p.scale.setScalar(.3 + f * .9); p.material.opacity = .75 * (1 - f); }); }
    B(g, 2.8, -.4, 3.0, 3.05, -.2, 5.6, pipe); B(g, 2.8, -.4, 5.6, 3.05, -2.2, 5.85, pipe);
    // a piston pumping under the right ledge
    CY(g, 10.6, .5, .32, -4.6, -3.4, tri(th.stone), 16); const rod = CY(g, 10.6, .5, .1, -3.4, -2.8, tri(th.mechLight || th.mech), 10);
    up.push(t => { rod.position.y = -3.1 + Math.abs(Math.sin(t * 2.2)) * .25; });
    const [l, r, b, t] = view.screenBox();
    const bg1 = backdrop(view, TEXS.bigGear, 9, 9, l + 2.6, b + (t - b) * .66, -110, '#C08A3A', .16), bg2 = backdrop(view, TEXS.bigGear, 6, 6, r - 2.2, b + (t - b) * .34, -110, '#C08A3A', .12);
    up.push(tt => { bg1.material.rotation = tt * .05; bg2.material.rotation = -tt * .075; });
    const lamp = backdrop(view, TEX.glow, 10, 10, 0, b + (t - b) * .5, -112, '#FFB347', .25); lamp.material.blending = T.AdditiveBlending;
    drift(view, TEX.dot, '#FFE7B0', 18, .06, { vx: .08, vy: .1, spin: 0, twinkle: 1.2, add: true, opacity: .8 });
  },
};


/* ================= Plate 4: working scenes ================= */
// Every rule here is decided in screen space, because the rider believes what they see:
// a join that looks joined is joined, a gap you cannot see is not there, and a fall lands on whatever is drawn beneath it.

function bloomGyro(P) {   // sky: three rings lie stacked on the plane, then rise and tilt into a spinning gimbal around a lit orb
  const g = new T.Group(), mR = tri(P.idle, { fresh: true }), mO = tri(P.idle, { fresh: true });
  const base = new T.Mesh(new T.CylinderGeometry(.44, .52, .08, 32), tri(P.idle)); base.position.y = .04; g.add(base);
  const rings = [.46, .36, .26].map((r, i) => {
    const o = new T.Group(); g.add(o); const m = new T.Mesh(new T.TorusGeometry(r, .04, 8, 44), mR); m.rotation.x = Math.PI / 2; o.add(m);
    for (const s of [1, -1]) { const k = new T.Mesh(new T.SphereGeometry(.055, 10, 8), mO); k.position.set(s * r, 0, 0); o.add(k); }
    return o; });
  const orb = new T.Mesh(new T.SphereGeometry(.12, 18, 12), mO); g.add(orb);
  const halo = sprite(TEX.glow, .9, .9, P.mech.t, { opacity: 0, add: true }); g.add(halo);
  return { g, set(e, spin) {
    const c = clamp(e, 0, 1.25), k = clamp(e, 0, 1);
    setTri(mR, mixPal(P.idle, P.mech, k)); setTri(mO, mixPal(P.idle, P.mechLight || P.mech, k));
    rings.forEach((o, i) => { o.position.y = .12 + i * .02 + .34 * c; o.rotation.set(0, 0, 0); o.rotateY(spin * (1 + i * .7) * (i % 2 ? -1 : 1) + i);
      o.rotateX(c * [.35, 1.05, 1.5][i]); });
    orb.position.y = .12 + .34 * c; orb.scale.setScalar(.7 + .5 * k); halo.position.y = orb.position.y; halo.material.opacity = .7 * k;
  } };
}

const SKY = { id: 'sky', name: 'Sky Gyre', bloom: 'gyro', sky: 'linear-gradient(180deg,#7FB8F5 0%,#BEDCFA 42%,#F6E3F1 78%,#FFF1DA 100%)',
  stone: { t: '#FFFFFF', l: '#D3DDF4', r: '#A9B9E2' }, idle: { t: '#E3E8F4', l: '#BCC6DC', r: '#97A3BF' }, mech: { t: '#8BEAD6', l: '#45C7B2', r: '#2B9C8A' }, mechLight: { t: '#D9FFF6', l: '#A5F2E1', r: '#6FD9C3' },
  ink: '#24314F', lane: '#8796C2', goal: '#FFC94D', spark: '#FFFFFF' };

/* ---------- tracks: 3D samples with a surface normal; the wheel sticks while the path stays smooth ---------- */
class Track {
  constructor(samples, o = {}) {
    Object.assign(this, o); this.S = [];
    for (const q of samples) { const p = V(...q.p), n = V(...q.n).normalize(); const last = this.S[this.S.length - 1]; if (!last || last.p.distanceTo(p) > 1e-4) this.S.push({ p, n }); }
    this.cum = [0]; for (let i = 1; i < this.S.length; i++) this.cum.push(this.cum[i - 1] + this.S[i].p.distanceTo(this.S[i - 1].p));
    this.L = this.cum[this.cum.length - 1];
    this.S.forEach((q, i) => { const a = this.S[Math.max(0, i - 1)].p, b = this.S[Math.min(this.S.length - 1, i + 1)].p; q.d = b.clone().sub(a).normalize(); });
    this.q = []; this.qn = [];
  }
  sub(s0, s1, step = .08) { const k = Math.ceil((s1 - s0) / step), sk = v => [v.x, v.z, v.y];
    return new Track(Array.from({ length: k + 1 }, (_, i) => { const f = this.at(lerp(s0, s1, i / k)); return { p: sk(f.p), n: sk(f.n) }; })); }
  at(s) {
    if (this.loop) s = ((s % this.L) + this.L) % this.L; else s = clamp(s, 0, this.L);
    let lo = 0, hi = this.cum.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (this.cum[m] <= s) lo = m; else hi = m; }
    const A = this.S[lo], Bq = this.S[hi], f = (s - this.cum[lo]) / ((this.cum[hi] - this.cum[lo]) || 1);
    return { p: A.p.clone().lerp(Bq.p, f), n: A.n.clone().lerp(Bq.n, f).normalize(), d: Bq.p.clone().sub(A.p).normalize() };
  }
}
const L3 = (a, b, n, step = .1) => { const k = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) / step)); return Array.from({ length: k + 1 }, (_, i) => ({ p: a.map((v, j) => lerp(v, b[j], i / k)), n })); };
// arc around c in the plane of unit vectors u, v; normal 'in' points at the centre (a concave pipe), 'out' away, or a fixed vector
const ARC = (c, u, v, r, a0, a1, n, step = .08) => { const k = Math.max(2, Math.ceil(Math.abs(a1 - a0) * r / step));
  return Array.from({ length: k + 1 }, (_, i) => { const a = lerp(a0, a1, i / k), rad = u.map((x, j) => x * Math.cos(a) + v[j] * Math.sin(a));
    return { p: c.map((x, j) => x + r * rad[j]), n: n === 'in' ? rad.map(x => -x) : n === 'out' ? rad : n }; }); };
// a polyline with rounded corners (quadratic fillets), normal up
function filletPath(P, r, n = [0, 0, 1]) {
  const out = []; const sub = (a, b) => a.map((v, i) => v - b[i]), add = (a, b, k) => a.map((v, i) => v + b[i] * k), unit = a => { const l = Math.hypot(...a); return a.map(v => v / l); };
  let from = P[0];
  for (let i = 1; i < P.length - 1; i++) {
    const uin = unit(sub(P[i], P[i - 1])), uout = unit(sub(P[i + 1], P[i])), A = add(P[i], uin, -r), C = add(P[i], uout, r);
    out.push(...L3(from, A, n));
    for (let k = 1; k <= 12; k++) { const t = k / 12, a = (1 - t) * (1 - t), b = 2 * t * (1 - t), c = t * t; out.push({ p: A.map((v, j) => a * v + b * P[i][j] + c * C[j]), n }); }
    from = C;
  }
  out.push(...L3(from, P[P.length - 1], n)); return out;
}
// a solid ribbon along a track (top face on the path), or a dashed lane line when o.dash is set
function ribbon(tr, w, th, mat, o = {}) {
  const pos = [], quad = (a, b, c, d) => pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z, a.x, a.y, a.z, c.x, c.y, c.z, d.x, d.y, d.z);
  const lift = o.lift || 0, x0 = o.x0 || 0, mid = q => q.reduce((m, v) => m.add(v), new T.Vector3()).multiplyScalar(1 / q.length);
  const oquad = (a, b, c, d, r1, r2) => { const ctr = mid([...r1, ...r2]), nrm = new T.Vector3().subVectors(b, a).cross(new T.Vector3().subVectors(c, a)); if (nrm.dot(mid([a, b, c, d]).sub(ctr)) < 0) quad(a, d, c, b); else quad(a, b, c, d); };
  const C = i => { const { p, n, d } = tr.S[i], side = new T.Vector3().crossVectors(d, n).normalize(); const top = p.clone().addScaledVector(n, lift).addScaledVector(side, x0), bot = top.clone().addScaledVector(n, -th);
    return [top.clone().addScaledVector(side, w / 2), top.clone().addScaledVector(side, -w / 2), bot.clone().addScaledVector(side, -w / 2), bot.clone().addScaledVector(side, w / 2)]; };
  const n = tr.S.length;
  // with o.cull every face must wind outwards. The corner order of each cross-section is the same all along the road, so one test on
  // the first top face settles the winding for all of them (a per-face centroid test misjudges faces on tight bends and leaves holes)
  let flip = false;
  if (o.cull && n > 1) { const a = C(0), b = C(1), nrm = new T.Vector3().subVectors(a[1], a[0]).cross(new T.Vector3().subVectors(b[1], a[0])); flip = nrm.dot(tr.S[0].n) < 0; }
  for (let i = 0; i < n - 1; i++) {
    if (o.dash && (tr.cum[i] % o.dash[0]) > o.dash[1]) continue;
    const a = C(i), b = C(i + 1);
    for (let k = 0; k < (th ? 4 : 1); k++) flip ? quad(a[k], b[k], b[(k + 1) % 4], a[(k + 1) % 4]) : quad(a[k], a[(k + 1) % 4], b[(k + 1) % 4], b[k]);
  }
  // o.open = [start, end] leaves an end uncapped; with o.cull the faces wind outwards so a front-side material shows no inside
  if (th && !tr.loop) [0, n - 1].forEach((i, e) => { if (o.open && o.open[e]) return; const c = C(i); o.cull ? oquad(c[0], c[1], c[2], c[3], c, C(e ? i - 1 : i + 1)) : quad(c[0], c[1], c[2], c[3]); });
  const geo = new T.BufferGeometry(); geo.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
  return new T.Mesh(geo, mat);
}
function hull2(pts) { // monotone chain, counter-clockwise
  const P = pts.slice().sort((a, b) => a.x - b.x || a.y - b.y), cr = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x), lo = [], up = [];
  for (const p of P) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
  for (const p of P.reverse()) { while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}
const inHull = (h, p, m = .04) => h.every((a, i) => { const b = h[(i + 1) % h.length], ex = b.x - a.x, ey = b.y - a.y, l = Math.hypot(ex, ey); return ((ex * (p.y - a.y) - ey * (p.x - a.x)) / l) > m; });
function segHit(p, p2, a, b) { // where p→p2 crosses a→b: returns [t along p→p2, u along a→b] or null
  const rx = p2.x - p.x, ry = p2.y - p.y, sx = b.x - a.x, sy = b.y - a.y, den = rx * sy - ry * sx; if (Math.abs(den) < 1e-9) return null;
  const qx = a.x - p.x, qy = a.y - p.y, t = (qx * sy - qy * sx) / den, u = (qx * ry - qy * rx) / den; return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? [t, u] : null;
}

/* ---------- a scene: a view, tracks, a wheel that obeys the screen, and a camera crank ---------- */
const SPEED = 1.7, GRAV = 13, TOL = .2;
const corners = (x0, y0, z0, x1, y1, z1) => [[x0, y0, z0], [x1, y0, z0], [x0, y1, z0], [x1, y1, z0], [x0, y0, z1], [x1, y0, z1], [x0, y1, z1], [x1, y1, z1]].map(c => V(...c));
const boundsOf = (pts, c) => { const s = pts.map(p => toScreen(V(...p), V(...c))); return [Math.min(...s.map(q => q[0])), Math.max(...s.map(q => q[0])), Math.min(...s.map(q => q[1])), Math.max(...s.map(q => q[1]))]; };
const UP = [0, 0, 1];


/* ================= sample levels: engine ================= */
// Roads are two-way paths, optionally riding on a moving group (turntable, lift deck, see-saw beam).
// At a road's end the wheel looks, in order, for: a gap that is passable right now (light or darkness),
// a road that really starts there in 3D, a road that only looks joined on screen, and otherwise it falls camera-down.
const LV = { speed: 1.7, tol: .2, grav: 13 };
const gearRatio = gear => .5 + gear * .125, powerOf = (cad, gear, load) => (6 + 1.6 * gear) * (1 + load) * cad * TAU / 60;
const easeIO = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const bounce = t => { const n = 7.5625, d = 2.75; if (t < 1 / d) return n * t * t; if (t < 2 / d) return n * (t -= 1.5 / d) * t + .75; if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + .9375; return n * (t -= 2.625 / d) * t + .984375; };
const FACEKEYS = { y: ['y', 'i'], a: ['a', 'l'], b: ['b', 'k'], z: ['z', 'j'] };
const badgeIcon = k => `<svg viewBox="-9 -9 18 18" width="18" height="18" aria-hidden="true">${['y', 'a', 'b', 'z'].map(q => { const D = { y: [0, -1], a: [1, 0], b: [0, 1], z: [-1, 0] }[q]; return `<circle cx="${D[0] * 5}" cy="${D[1] * 5}" r="2.4" ${q === k ? `fill="${FACE[k]}"` : 'fill="none" stroke="currentColor" stroke-opacity=".5"'}/>`; }).join('')}</svg>`;

class Road {
  constructor(samples, o = {}) {
    Object.assign(this, o); this.S = [];
    for (const q of samples) { const p = V(...q.p), n = V(...q.n).normalize(), last = this.S[this.S.length - 1]; if (!last || last.p.distanceTo(p) > 1e-4) this.S.push({ p, n }); }
    this.cum = [0]; for (let i = 1; i < this.S.length; i++) this.cum.push(this.cum[i - 1] + this.S[i].p.distanceTo(this.S[i - 1].p));
    this.L = this.cum[this.cum.length - 1];
    this.S.forEach((q, i) => { const a = this.S[Math.max(0, i - 1)].p, b = this.S[Math.min(this.S.length - 1, i + 1)].p; q.d = b.clone().sub(a).normalize(); });
    this.wp = this.S.map(q => q.p.clone()); this.wn = this.S.map(q => q.n.clone()); this.q = []; this.qn = []; this.forks = this.forks || []; this.gaps = this.gaps || [];
  }
  refresh(v2, dir2) {
    const M = this.g ? this.g.matrixWorld : null;
    for (let i = 0; i < this.S.length; i++) { this.wp[i].copy(this.S[i].p); this.wn[i].copy(this.S[i].n); if (M) { this.wp[i].applyMatrix4(M); this.wn[i].transformDirection(M); } }
    this.q = this.wp.map(v2); this.qn = this.wp.map((p, i) => dir2(p, this.wn[i]).normalize());
  }
  at(s) {
    s = clamp(s, 0, this.L); let lo = 0, hi = this.cum.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (this.cum[m] <= s) lo = m; else hi = m; }
    const f = (s - this.cum[lo]) / ((this.cum[hi] - this.cum[lo]) || 1);
    return { p: this.wp[lo].clone().lerp(this.wp[hi], f), n: this.wn[lo].clone().lerp(this.wn[hi], f).normalize(), d: this.wp[hi].clone().sub(this.wp[lo]).normalize() };
  }
  end(k) { const f = this.at(k ? this.L : 0); return { p: f.p, out: k ? f.d : f.d.clone().negate() }; }   // outward direction at that end
}
// a turtle for flat (or evenly graded) roads; teardrop() is a cul-de-sac turnaround that comes back along the way it went
function turtle(x, y, hDeg, z) {
  const t = { x, y, z, h: hDeg * Math.PI / 180, grade: 0, pts: [],
    gr(g) { this.grade = g; return this; },
    add() { this.pts.push({ p: [this.x, this.y, this.z], n: [0, 0, 1] }); return this; },
    fwd(L) { const k = Math.max(1, Math.ceil(L / .08)); for (let i = 0; i < k; i++) { this.x += Math.cos(this.h) * L / k; this.y += Math.sin(this.h) * L / k; this.z += this.grade * L / k; this.add(); } return this; },
    arc(r, deg) { const a = deg * Math.PI / 180, sg = Math.sign(a), cx = this.x - sg * r * Math.sin(this.h), cy = this.y + sg * r * Math.cos(this.h); let phi = Math.atan2(this.y - cy, this.x - cx);
      const k = Math.max(2, Math.ceil(Math.abs(a) * r / .08)); for (let i = 0; i < k; i++) { phi += a / k; this.x = cx + r * Math.cos(phi); this.y = cy + r * Math.sin(phi); this.z += this.grade * Math.abs(a) * r / k; this.h += a / k; this.add(); } return this; },
    teardrop(r = 1) { return this.arc(r, 60).arc(r, -300).arc(r, 60); } };
  return t.add();
}
const lollipop = (x, y, hDeg, z, stick = 1, r = 1) => turtle(x, y, hDeg, z).fwd(stick).teardrop(r).fwd(stick).pts;
const lollipopLen = (stick = 1, r = 1) => 2 * stick + r * 420 * Math.PI / 180;

/* ================= the level player ================= */
const lvHost = dom.stage, lvBadges = dom.badges, lvFade = dom.fade;
const lvView = new View(lvHost);
const rider = { cad: 80, gear: 4, effort: null };
const ui = dom.ui;
let LVL = null, lvIndex = 0, autopilot = false;
const fade = { a: 0, to: 0, title: '', eyebrow: '', hold: 0 };

function makeLevel(def, idx) {
  const view = lvView; view.clear(); view.yaw = 0; view.roll = 0;
  const th = def.th(), g = new T.Group(); view.scene.add(g); view.scene.add(view.camera);
  dom.sky.style.background = th.sky; seedState = 5 + idx * 13;
  const v2 = p => { const q = p.clone().applyMatrix4(view.camera.matrixWorldInverse); return new T.Vector2(q.x, q.y); }, dir2 = (p, d) => v2(p.clone().add(d)).sub(v2(p));
  const L = { def, idx, th, g, view, roads: [], machines: [], props: {}, wins: 0, sayText: '', v2 };
  const lane = tri(tone(th.lane), { side: true, fresh: true }); L.lane = lane;
  L.road = (samples, o = {}) => { const r = new Road(samples, o); L.roads.push(r); const host = o.g || g;
    r.vo = { host, w: o.w || 1, th: o.th ?? .5, mat: o.mat || tri(o.pal || sp(th, 1), { side: true }), laneMat: o.laneMat || lane }; r.vis = [];
    if (!o.noDeck) { const m = ribbon(r, r.vo.w, r.vo.th, r.vo.mat); host.add(m); r.vis.push(m); r.deck = m; }
    if (!o.noLane) { const m = ribbon(r, .07, 0, r.vo.laneMat, { lift: .012, dash: [.38, .2] }); host.add(m); r.vis.push(m); }
    return r; };
  // machines: a bloom, a badge, a clutch, and a tick that turns rider drive into motion and load
  L.machine = (m) => { const st = Object.assign({ on: false, load: 0 }, m); st.bloom = machine(view, th, m.place, m.size || .6);
    // the button colour is painted on the machine itself: a cap at its centre, so no badge has to float over the scene
    { const fc = FACE[m.key], r = (m.size || .6) * .62, cap = new T.Mesh(new T.CylinderGeometry(r, r, .1, 36), tri({ t: fc, l: mix(fc, '#000000', .22), r: mix(fc, '#000000', .38) }));
      cap.position.y = .02; st.bloom.holder.add(cap); const ring = new T.Mesh(new T.RingGeometry(r * .62, r * .8, 36), basic('#FFFFFF', { opacity: .55, side: true })); ring.rotation.x = -Math.PI / 2; ring.position.y = .075; st.bloom.holder.add(ring); }
    const bd = document.createElement('button'); bd.className = 'badge'; bd.style.setProperty('--c', FACE[m.key]); bd.setAttribute('aria-label', `${m.name} (${m.key.toUpperCase()} button)`); bd.setAttribute('aria-pressed', 'false');
    bd.innerHTML = `<span class="disc">${m.key.toUpperCase()}</span>${badgeIcon(m.key)}`; lvBadges.appendChild(bd);
    const mb = document.createElement('button'); mb.className = 'mbtn'; mb.style.setProperty('--c', FACE[m.key]); mb.setAttribute('aria-pressed', 'false'); mb.innerHTML = `<i>${m.key.toUpperCase()}</i>${m.name}`; ui.mach.appendChild(mb);
    st.set = (on) => { st.on = on; bd.classList.toggle('on', on); for (const b of [bd, mb]) b.setAttribute('aria-pressed', on); };
    const tap = () => { setAutopilot(false); st.set(!st.on); }; bd.onclick = tap; mb.onclick = tap; st.bd = bd; L.machines.push(st); return st; };
  L.say = s => { L.sayText = s; };
  // wheel, portal and effects
  const wheel = makeWheel(th); g.add(wheel); L.wheel = wheel;
  const portal = new T.Group(); g.add(portal); const pRing = sprite(TEX.ring, 1, 1, th.goal, { opacity: 0, add: true }); portal.add(pRing); const pGlow = sprite(TEX.glow, 2, 2, th.goal, { opacity: 0, add: true }); portal.add(pGlow);
  const beam = new T.Mesh(new T.CylinderGeometry(.42, .42, 3, 20, 1, true), basic(th.goal, { opacity: 0, add: true, side: true })); beam.position.y = 1.5; portal.add(beam);
  const dust = new T.Mesh(new T.RingGeometry(.3, .38, 32), basic('#FFFFFF', { opacity: 0, side: true })); dust.rotation.x = -Math.PI / 2; portal.add(dust);
  const fx = Array.from({ length: 16 }, () => { const s = sprite(TEX.diamond, .18, .18, th.goal, { opacity: 0, depthTest: false, order: 6 }); g.add(s); return s; });
  let fxAt = null, fxT = 9;
  const goalRing = sprite(TEX.ring, 1.1, 1.1, th.goal, { opacity: .9, add: true }), goalGlow = sprite(TEX.glow, 2.2, 2.2, th.goal, { opacity: .55, add: true }); g.add(goalRing); g.add(goalGlow);
  def.build(L);
  if (def.scenery !== false && typeof sceneryPass === 'function') L.scenery = sceneryPass(L, def.scenery || {});
  // a perspective join reads as one road: wherever two road ends meet on screen, the nearer end is drawn without its end cap,
  // with faces that wind outwards, so through the open end you see the far road carrying on behind it
  view.updaters.push(() => {
    const toCam = view.camera.getWorldDirection(new T.Vector3()).negate(), want = new Map(), ends = [];
    for (const r of L.roads) if (!r.closed && r.q.length) for (const k of [0, 1]) { const e = r.end(k); ends.push({ r, k, p: e.p, s: v2(e.p), o: dir2(e.p, e.out).normalize() }); }
    for (let i = 0; i < ends.length; i++) for (let j = i + 1; j < ends.length; j++) { const A = ends[i], B = ends[j];
      if (A.s.distanceTo(B.s) > .25 || A.p.distanceTo(B.p) < .3 || A.o.dot(B.o) > -.85) continue;
      const N = A.p.dot(toCam) > B.p.dot(toCam) ? A : B; (want.get(N.r) || want.set(N.r, [false, false]).get(N.r))[N.k] = true; }
    for (const r of L.roads) { if (!r.deck || !r.vis.includes(r.deck) || r.vo.mat.transparent) continue; const f = want.get(r) || [false, false], key = f.join();
      if (key === (r.capKey || 'false,false')) continue; r.capKey = key; r.caps = r.caps || {};
      if (key !== 'false,false' && !r.caps[key]) { const mat = r.vo.mat, m2 = mat.clone(); if (mat.uniforms) m2.uniforms = mat.uniforms; m2.side = T.FrontSide;
        const m = ribbon(r, r.vo.w, r.vo.th, m2, { cull: true, open: f }); m.userData.road = true; m.visible = false; r.vo.host.add(m); r.caps[key] = m; }
      for (const [k2, m] of Object.entries(r.caps)) m.visible = k2 === key; r.deck.visible = key === 'false,false'; }
  });
  // frame the hand-picked points plus every road, so nothing the wheel rides on is ever cropped
  { const c = V(...def.center), m = .9, pad = def.pad ?? .8, Yx = new T.Vector3(0, 1, 0);
    g.updateMatrixWorld(true);
    // a level with a camera crank is framed separately for each camera angle it stops at; the view blends between them as it turns
    const frames = (def.yaws || [0]).map(yd => { const a = yd * Math.PI / 180, R2 = SR.clone().applyAxisAngle(Yx, a), U2 = SU.clone().applyAxisAngle(Yx, a), scr = p => { const d = p.clone().sub(c); return [d.dot(R2), d.dot(U2)]; };
      const b = [1e9, -1e9, 1e9, -1e9], add = (sx, sy, e = 0) => { b[0] = Math.min(b[0], sx - e); b[1] = Math.max(b[1], sx + e); b[2] = Math.min(b[2], sy - e); b[3] = Math.max(b[3], sy + e); };
      // the hand-picked points are chosen for the front view; a turned view is framed on its roads alone
      if (!yd) for (const q of def.pts) add(...scr(V(...q)));
      for (const r of L.roads) for (const q of r.S) add(...scr(r.g ? q.p.clone().applyMatrix4(r.g.matrixWorld) : q.p), m);
      // leave room for each machine's badge dot, which sits just above it
      const hs = L.machines.map(mm => { const p = new T.Vector3(); mm.bloom.holder.getWorldPosition(p); return scr(p); });
      for (let it = 0; it < 3; it++) { const w = view.host.clientWidth || 600, h = w * view.aspect(w), upp = Math.max((b[1] - b[0] + 2 * pad) / w, (b[3] - b[2] + 2 * pad) / h);
        for (const [sx, sy] of hs) { b[0] = Math.min(b[0], sx - 16 * upp); b[1] = Math.max(b[1], sx + 16 * upp); b[3] = Math.max(b[3], sy + 28 * upp - pad); } }
      return { a, b }; });
    view.frame(def.center, frames[0].b, pad); view.yawFrames = frames.length > 1 ? frames : null; view.yawK = undefined; }
  if (def.decor) def.decor(L);
  const W = { mode: 'spawn', t: 0, road: null, s: 0, dir: 1, spin: 0, pos: new T.Vector2(), vel: new T.Vector2(), vz: 0, from: null };
  L.W = W;
  const attach = (r, s, dir) => { W.mode = 'road'; W.road = r; W.s = s; W.dir = dir; };
  const enter = (r, k) => attach(r, k ? r.L : 0, k ? -1 : 1);
  const fall = (e, msg) => { W.mode = 'fall'; W.t = 0; W.pos.copy(v2(e.p)); W.vel.copy(dir2(e.p, e.out).normalize()).multiplyScalar(LV.speed * .45); W.vz = e.p.clone().applyMatrix4(view.camera.matrixWorldInverse).z; W.from = W.road; L.flash(msg || 'Off the edge'); };
  L.flash = (s) => { L.flashText = s; L.flashT = 0; };
  function atEnd(k, over) {
    const r = W.road, e = r.end(k);
    if (r.goal && k === 1) { W.mode = 'win'; W.t = 0; fxAt = e.p.clone(); fxT = 0; L.flash('Home'); return; }
    for (const j of r.joins || []) if (j.k === k) { attach(j.to, j.s, j.dir); return; }
    for (const gp of r.gaps) if (gp.k === k && gp.when()) { W.mode = 'hop'; W.t = 0; W.a = e.p; W.b = gp.to.end(gp.toK).p; W.hl = Math.max(.01, W.a.distanceTo(W.b)); W.to = gp; L.flash(gp.text || ''); return; }
    for (const kk of [0, 1]) for (const B of L.roads) { if (B === r) continue; const be = B.end(kk); if (be.p.distanceTo(e.p) < .18 && ((B.turntable && kk === 0) || (r.turntable && k === 0) || -be.out.dot(e.out) > .75)) { if (B.turnBack && B.solid && !B.solid()) { W.dir = -W.dir; L.flash(B.turnBack); return; } return enter(B, kk); } }
    const es = v2(e.p), eo = dir2(e.p, e.out).normalize();
    for (const kk of [0, 1]) for (const B of L.roads) { if (B === r && kk === k) continue; const be = B.end(kk); if (v2(be.p).distanceTo(es) < LV.tol && dir2(be.p, be.out.clone().negate()).normalize().dot(eo) > .85) { L.flash('Joined by perspective'); return enter(B, kk); } }
    if (r.bounce) { W.dir = -W.dir; L.flash(typeof r.bounce === 'string' ? r.bounce : 'Nothing there yet, so the wheel turned back'); return; }   // a fail-safe end: the wheel turns back instead of dropping
    fall(e, r.edgeText);
  }
  function step(dt) {
    W.t += dt;
    if (W.mode === 'road') {
      const r = W.road, prev = W.s; W.s += W.dir * LV.speed * dt; W.spin += LV.speed * dt / .37;
      for (const f of r.forks) if (f.dir === W.dir && (W.dir > 0 ? prev < f.s && W.s >= f.s : prev > f.s && W.s <= f.s) && f.when()) { enter(f.to, f.toK || 0); L.flash(f.text || ''); return; }
      if (r.solid && !r.solid()) { const f = r.at(W.s); return fall({ p: f.p, out: f.d.clone().multiplyScalar(W.dir) }, r.goneText); }
      if (r.blowBack && r.blowBack(W.dir)) { W.dir = -W.dir; L.flash(r.blowText || 'Blown back by the headwind'); return; }
      if (r.closed) { if (W.s >= r.L) W.s -= r.L; else if (W.s < 0) W.s += r.L; }
      else if (W.dir > 0 && W.s >= r.L) atEnd(1, W.s - r.L); else if (W.dir < 0 && W.s <= 0) atEnd(0, -W.s);
    } else if (W.mode === 'hop') { W.spin += LV.speed * dt / .37; if (W.t * LV.speed >= W.hl) enter(W.to.to, W.to.toK); }
    else if (W.mode === 'fall') {
      const gv = new T.Vector2(0, -1); W.vel.addScaledVector(gv, LV.grav * dt); const prev = W.pos.clone(); W.pos.addScaledVector(W.vel, dt); W.spin += LV.speed * dt / .37;
      let hit = null;
      for (const B of L.roads) { if (B === W.from && W.t < .3 && !B.selfCatch) continue; if (B.solid && !B.solid()) continue;
        for (let j = 0; j < B.q.length - 1; j++) { if (B === W.from && W.t < .3 && B.cum[j + 1] > B.L - 1.5) continue; const h = segHit(prev, W.pos, B.q[j], B.q[j + 1]); if (!h || (hit && h[0] >= hit.t)) continue;
          if (B.qn[j].dot(gv) < -.25) { const tan = B.q[j + 1].clone().sub(B.q[j]); hit = { t: h[0], B, s: lerp(B.cum[j], B.cum[j + 1], h[1]), dir: B.landDir || (tan.dot(W.vel) >= 0 ? 1 : -1) }; } } }
      if (hit) { attach(hit.B, hit.s, hit.dir); L.flash('Landed on what was drawn beneath'); }
      else if (W.t > 1.6) { W.mode = 'dead'; W.t = 0; L.flash('Fell. Back to the start'); }
    }
  }
  function pose(dt) {
    if (W.mode === 'road' || W.mode === 'spawn' || W.mode === 'win') {
      const f = W.road.at(W.s), d = f.d.clone().multiplyScalar(W.dir), side = new T.Vector3().crossVectors(d, f.n).normalize();
      wheel.quaternion.setFromRotationMatrix(new T.Matrix4().makeBasis(d, f.n, side)); wheel.position.copy(f.p);
      if (W.mode === 'spawn') { const k = clamp((W.t - .35) / .75, 0, 1); wheel.position.addScaledVector(f.n, (1 - bounce(k)) * 2.6); wheel.scale.setScalar(clamp(W.t / .35, 0, 1) * .95); }
      else if (W.mode === 'win') wheel.scale.setScalar(.95 * (1 - ease(W.t / .7)));
      else wheel.scale.setScalar(.95);
    } else if (W.mode === 'hop') wheel.position.copy(W.a).lerp(W.b, clamp(W.t * LV.speed / W.hl, 0, 1));
    else if (W.mode === 'fall' || W.mode === 'dead') { wheel.position.set(W.pos.x, W.pos.y, W.vz).applyMatrix4(view.camera.matrixWorld); if (W.mode === 'dead') wheel.scale.setScalar(.95 * Math.max(0, 1 - W.t * 3)); }
    wheel.userData.spin.rotation.z = -W.spin;
    wheelOnTop();
    // the spawn portal: a ring opens, a beam of light, the wheel drops in and bounces, a puff of dust
    const sp0 = L.spawnAt; portal.position.copy(sp0.p); portal.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), sp0.n);
    const ts = W.mode === 'spawn' ? W.t : 9;
    pRing.material.opacity = ts < 1.4 ? Math.sin(Math.min(1, ts / 1.4) * Math.PI) : 0; pRing.scale.setScalar(.4 + ease(ts / .6) * 1.3); pRing.position.y = .05;
    pGlow.material.opacity = ts < 1.4 ? .7 * Math.sin(Math.min(1, ts / 1.4) * Math.PI) : 0; pGlow.position.y = .4;
    beam.material.opacity = ts < 1.2 ? .22 * Math.sin(Math.min(1, ts / 1.2) * Math.PI) : 0;
    const dk = ts - 1.0; dust.material.opacity = dk > 0 && dk < .6 ? (1 - dk / .6) * .8 : 0; dust.scale.setScalar(1 + Math.max(0, dk) * 4); dust.position.y = .03;
    fxT += dt; fx.forEach((s, i) => { const on = fxAt && fxT < 1.2; s.material.opacity = on ? 1 - fxT / 1.2 : 0; if (!on) return; const a = i / fx.length * TAU, r = .3 + fxT * 2;
      s.position.copy(fxAt).add(new T.Vector3(Math.cos(a) * r, .6 + fxT * 2 - fxT * fxT * 1.2, Math.sin(a) * r)); s.material.rotation = fxT * 6; });
  }
  // roads never hide the wheel: two roads that meet on screen are one road to the eye, so the wheel is drawn over every road deck.
  // Anything else (a tower, a lift floor, a bridge leaf, scenery) still hides it, pixel by pixel: the wheel is drawn last, tested only
  // against the depth of those occluders (layer 2). Riding underneath a road, it shows through its own deck
  const wheelParts = []; wheel.userData.spin.traverse(o => { if (o.isMesh) { wheelParts.push(o); o.layers.set(1); } }); const wheelSet = new Set(wheelParts);
  function wheelOnTop() {
    const roadMesh = new Set(); for (const r of L.roads) for (const m of r.vis || []) roadMesh.add(m);
    g.traverse(o => { if (!o.isMesh || wheelSet.has(o)) return; const m = o.material, occ = !o.userData.road && !roadMesh.has(o) && m && !(m.transparent && (m.opacity ?? 1) < .5);
      if (occ) o.layers.enable(2); else o.layers.disable(2); });
    view.overlay = true;
  }
  const goalRoad = L.roads.find(r => r.goal);
  L.spawnAt = (() => { const r = def.spawn(L); const f = r.road.at(r.s); return { road: r.road, s: r.s, dir: r.dir, p: f.p, n: f.n }; });
  L.respawn = () => { const sp = L.spawnAt(); L.spawnAt = sp; Object.assign(W, { mode: 'spawn', t: 0, road: sp.road, s: sp.s, dir: sp.dir }); };
  view.updaters.unshift((t, dt) => {
    view.aim();
    g.updateMatrixWorld(true);
    for (const r of L.roads) r.refresh(v2, dir2);
    // the rider: cadence and gear drive every clutched machine
    if (autopilot && def.solve && W.mode !== 'win') def.solve(L, W, rider);
    let load = 0;
    for (const m of L.machines) { const drive = m.on ? rider.cad / 60 * dt * gearRatio(rider.gear) : 0; m.load = m.tick(dt, drive) || 0; load += m.load; m.bloom.set(m.on); m.bloom.pedal = rider.cad > 5; }
    if (L.drag) load += L.drag(dt);   // always-on machines (a dynamo) add their resistance without a button
    for (const d of L.drags || []) load += d(dt);
    L.load = load; L.P = rider.cad > 0 ? powerOf(rider.cad, rider.gear, load) : 0;
    if (def.cruise && L.state === 'play') { const [lo, hi] = def.cruise, inb = rider.cad >= lo && rider.cad <= hi; L.paceT = (L.paceT || 0) + dt; L.paceIn = (L.paceIn || 0) + (inb ? dt : 0); setTri(lane, inb ? mixPal(tone(th.lane), tone(th.goal), .6) : tone(th.lane)); }
    const sub = Math.ceil(dt / .01); if (L.state === 'play') for (let i = 0; i < sub; i++) step(dt / sub);
    if (W.mode === 'spawn' && W.t > 1.1 && L.state === 'play') W.mode = 'road';
    if (W.mode === 'spawn') W.t += dt;
    pose(dt);
    if (goalRoad) { const e = goalRoad.end(1); goalRing.position.copy(e.p).add(new T.Vector3(0, .5, 0)); goalGlow.position.copy(goalRing.position); goalRing.material.rotation = t * .8; goalRing.scale.setScalar(1 + .08 * Math.sin(t * 3)); }
    // badges follow their machines
    L.machines.forEach((m, i) => { const p = new T.Vector3(); m.bloom.holder.getWorldPosition(p); const [x, y] = view.project(p); m.bd.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`; });
    if (W.mode === 'win' && W.t > .5 && L.state === 'play') { L.state = 'won'; L.wonT = 0; hooks.onWon(L.idx); }
    if (W.mode === 'dead' && W.t > .4 && L.state === 'play') { L.state = 'restart'; fadeTo(1, '', ''); hooks.onFell(L.idx); }
    flowTick(dt);
  });
  L.state = 'play'; L.respawn();
  return L;
}
// the level flow: win flourish (sparks, a full turn of the world), fade to the next sky, title, fade in, spawn
function flowTick(dt) {
  const L = LVL; if (!L) return;
  if (L.state === 'won') { L.wonT += dt; const k = clamp(L.wonT / 1.9, 0, 1); if (L.yaw0 === undefined) L.yaw0 = lvView.yaw; lvView.yaw = L.yaw0 + easeIO(k) * TAU; L.g.scale.setScalar(1 + .06 * Math.sin(k * Math.PI));
    if (L.wonT > 1.5 && fade.to === 0) { const n = (L.idx + 1) % LEVELS.length; fadeTo(1, n === 0 ? 'Campaign complete · back to the start' : `${LEVELS[n].chapter && LEVELS[n].chapter !== LEVELS[L.idx].chapter ? LEVELS[n].chapter + ' · ' : ''}Level ${n + 1} of ${LEVELS.length}`, LEVELS[n].name, LEVELS[n].th().sky); }
    if (L.wonT > 2.4 && fade.a > .99) loadLevel((L.idx + 1) % LEVELS.length); }
  if (L.state === 'restart' && fade.a > .99) loadLevel(L.idx, true);
  // fade
  fade.a += clamp(fade.to - fade.a, -dt / .45, dt / .45);
  if (fade.to === 1 && fade.a >= 1) { fade.hold += dt; }
  lvFade.style.opacity = fade.a.toFixed(3); lvFade.style.pointerEvents = fade.a > .5 ? 'auto' : 'none';
  // readouts
  ui.cadOut.textContent = Math.round(rider.cad) + ' rpm'; if (autopilot) ui.cad.value = Math.round(rider.cad);
  const ft = L.flashT !== undefined && L.flashT < 2.4 ? L.flashText : ''; L.flashT = (L.flashT ?? 9) + dt;
  const pace = L.def.cruise && L.paceT > 1 ? `pace ${L.def.cruise[0]}–${L.def.cruise[1]} rpm · in band ${Math.round(L.paceIn / L.paceT * 100)}%` : '';
  const txt = [ft, L.sayText, pace].filter(Boolean).join(' · ');
  if (ui.status.textContent !== txt) ui.status.textContent = txt;
  const rd = `${Math.round(L.P)} W · resistance ${Math.round(Math.min(1.5, L.load) / 1.5 * 100)}%`; if (ui.read.textContent !== rd) ui.read.textContent = rd;
}
function fadeTo(to, eyebrow, title, sky) { fade.to = to; fade.hold = 0; if (to === 1) { lvFade.querySelector('.feb').textContent = eyebrow || ''; lvFade.querySelector('.ftt').textContent = title || ''; lvFade.style.background = sky || (LVL ? LVL.th.sky : '#000'); } }
function loadLevel(i, quiet) {
  lvBadges.innerHTML = ''; ui.mach.innerHTML = ''; lvIndex = i;
  LVL = makeLevel(LEVELS[i], i); fade.to = 0;
    ui.hint.innerHTML = LEVELS[i].hint; hooks.onLevel(i, LEVELS[i], LVL);
}
function setAutopilot(on) { autopilot = on; hooks.onAutopilot(on); }



// live engine state (these are reassigned, so other modules read them through state())
const state = () => ({ LVL, lvIndex, autopilot });

Object.assign($scope, { LEVELS, state, TAU, reduce, FACE, clamp, lerp, ease, hexRgb, mix, mixPal, shade, tone, seedState, rnd, VS, FS, triCache, tri, setTri, DEPTH_ONLY, basic, UNIT, B, CY, V, at, archGeo, rectGeo, onFace, gearGeo, petalGeo, canvasTex, TEX, sprite, SR, SU, SD, toScreen, views, R3, View, WHEELS, makeWheel, placeWheel, makeFlag, dashes, ringDashes, bloomIris, bloomFlower, bloomHelm, bloomCrystal, bloomLantern, bloomClock, BLOOMS, machine, THEMES, sp, windowsOn, cloudLayer, birds, drift, backdrop, TEXS, buildLevel, decorate, bloomGyro, SKY, Track, L3, ARC, filletPath, ribbon, hull2, inHull, segHit, SPEED, GRAV, TOL, corners, boundsOf, UP, LV, gearRatio, powerOf, easeIO, bounce, FACEKEYS, badgeIcon, Road, turtle, lollipop, lollipopLen, lvHost, lvBadges, lvFade, lvView, rider, ui, LVL, lvIndex, autopilot, fade, makeLevel, flowTick, fadeTo, loadLevel, setAutopilot });
}
