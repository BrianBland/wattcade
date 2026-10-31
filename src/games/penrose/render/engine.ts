// @ts-nocheck
/*
 * Penrose Pedals engine: the design prototype's level player (roads, the wheel, machines, perspective joins, every level
 * and generator), moved over as one module. It is not yet typed and still owns the level logic; see ../NOTES.md for the
 * plan to move the road and machine logic into a deterministic sim. Coordinates: sketch (x, y = depth, z = up) → three (x, z, y).
 */
import * as T from 'three';
import type { EngineDom, EngineHooks, PenroseEngine } from './engineTypes';

export function createPenroseEngine(dom: EngineDom, hooks: EngineHooks): PenroseEngine {
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


  /* ---------- reusable machines for the longer levels ---------- */
  // the part of a road between two distances along it, for drawing (logic always uses the whole road)
  function trimRoad(r, s0, s1) {
    const at = s => { let i = 1; while (i < r.cum.length - 1 && r.cum[i] < s) i++; const f = clamp((s - r.cum[i - 1]) / ((r.cum[i] - r.cum[i - 1]) || 1), 0, 1), a = r.S[i - 1], b = r.S[i];
      return { p: a.p.clone().lerp(b.p, f), n: a.n.clone().lerp(b.n, f).normalize(), d: b.p.clone().sub(a.p).normalize() }; };
    const S = [at(s0)], cum = [s0]; r.S.forEach((q, i) => { if (r.cum[i] > s0 + 1e-3 && r.cum[i] < s1 - 1e-3) { S.push(q); cum.push(r.cum[i]); } }); S.push(at(s1)); cum.push(s1);
    return { S, cum };
  }
  // a road that ends at a turntable's pivot stops at the disc's rim in a curved socket, so the disc can turn inside it
  function socket(L, r, k, rad) {
    const { host, w, th, mat, laneMat } = r.vo, hw = w / 2, e = Math.sqrt(rad * rad - hw * hw);
    r.vis.forEach(m => host.remove(m)); r.vis = [];
    const tr = k ? trimRoad(r, 0, r.L - rad) : trimRoad(r, rad, r.L);
    const deck = ribbon(tr, w, th, mat); host.add(deck); r.vis.push(deck);
    const ln = ribbon(trimRoad(r, k ? 0 : rad + .05, k ? r.L - rad - .05 : r.L), .07, 0, laneMat, { lift: .012, dash: [.38, .2] }); host.add(ln); r.vis.push(ln);
    const sh = new T.Shape(); sh.moveTo(rad, -hw); sh.lineTo(e, -hw); for (let i = 1; i < 16; i++) { const v = -hw + 2 * hw * i / 16; sh.lineTo(Math.sqrt(rad * rad - v * v), v); } sh.lineTo(e, hw); sh.lineTo(rad, hw); sh.lineTo(rad, -hw);
    const geo = new T.ExtrudeGeometry(sh, { depth: th, bevelEnabled: false, curveSegments: 1 });
    const q = r.S[k ? r.S.length - 1 : 0], din = k ? q.d.clone().negate() : q.d.clone(), side = new T.Vector3().crossVectors(din, q.n).normalize();
    geo.applyMatrix4(new T.Matrix4().makeBasis(din, side, q.n.clone().negate()).setPosition(q.p)); const m = new T.Mesh(geo, mat); host.add(m); r.vis.push(m);
  }
  function turntable(L, o) {   // a flush disc with a bridge arm, pivoting at one end: 0° continues the road, o.open swings it to another
    const th = L.th, g = L.g, bg = new T.Group(); bg.position.copy(V(...o.pivot)); g.add(bg); const rad = .8, w = 1, d0 = .5, base = o.base || 0; bg.rotation.y = -base * Math.PI / 180;
    const mat = tri(th.idle, { fresh: true, side: true }), road = L.road(L3([0, 0, 0], [o.len, 0, 0], UP), { g: bg, mat, turntable: true, noDeck: true, noLane: true });
    // the arm's tip is open and front-faced, so where it meets a road far behind on screen no end face covers that road
    const armMat = tri(th.idle, { fresh: true }); bg.add(ribbon(trimRoad(road, Math.sqrt(rad * rad - .25), road.L), w, d0, armMat, { cull: true, open: [false, true] })); bg.add(ribbon(trimRoad(road, rad + .05, road.L), .07, 0, L.lane, { lift: .012, dash: [.38, .2] }));
    const disc = CY(bg, 0, 0, rad, -d0, 0, mat, 48); const rim = new T.Mesh(new T.RingGeometry(rad - .1, rad - .05, 48), basic(th.lane, { side: true })); rim.rotation.x = -Math.PI / 2; rim.position.y = .014; bg.add(rim);
    const [px, py, pz] = o.pivot; CY(g, px, py, rad + .12, pz - d0 - .45, pz - d0 - .03, tri(th.mechDark || th.idle), 48);
    const P = V(...o.pivot); for (const r of L.roads) { if (r.g || r === road) continue; for (const k of [0, 1]) if (r.S[k ? r.S.length - 1 : 0].p.distanceTo(P) < .05) socket(L, r, k, rad); }
    const st = { ang: 0, sweep: Math.sign(o.open), road, rad };
    st.m = L.machine({ key: o.key, name: o.name, size: .55, place: h => { h.position.set(0, .02, 0); bg.add(h); },
      tick(dt, drive) {
        const det = o.detents || [0, o.open], lo = Math.min(...det), hi = Math.max(...det);
        if (drive > 0) { st.ang += st.sweep * drive * 28; if (st.ang <= lo || st.ang >= hi) { st.ang = clamp(st.ang, lo, hi); st.sweep *= -1; } }
        else { const tgt = det.reduce((a, d) => Math.abs(d - st.ang) < Math.abs(a - st.ang) ? d : a, det[0]); st.ang += clamp(tgt - st.ang, -60 * dt, 60 * dt); }
        bg.rotation.y = -(base + st.ang) * Math.PI / 180; setTri(mat, mixPal(th.idle, th.mech, clamp(this.bloom.e, 0, 1))); setTri(armMat, mixPal(th.idle, th.mech, clamp(this.bloom.e, 0, 1)));
        const off = Math.min(...(o.detents || [0, o.open]).map(d => Math.abs(st.ang - d))); return drive > 0 ? .25 + .7 * Math.exp(-((off / 7) ** 2)) : 0;
      } });
    return st;
  }
  function peelSwitch(L, o) {   // points that peel a road off a straight line: a curved leaf hinged at its far end, raised until cranked down
    const th = L.th, g = L.g, { line, s, dir } = o, R = o.R || 3, f = line.at(s), h = Math.atan2(f.d.z, f.d.x) * 180 / Math.PI + (dir < 0 ? 180 : 0);
    const tp = turtle(f.p.x, f.p.z, h, f.p.y + .006).arc(R, o.side * 45), P1 = [tp.x, tp.y, tp.z], hg = new T.Group(); hg.position.copy(V(...P1)); g.add(hg);
    const leafPts = tp.pts.map(q => ({ p: [q.p[0] - P1[0], q.p[1] - P1[1], q.p[2] - P1[2]], n: q.n }));
    const leafMat = tri(th.idle, { fresh: true, side: true }), leaf = L.road(leafPts, { g: hg, mat: leafMat, th: .18 });
    leaf.joins = [{ k: 0, to: line, s, dir: -dir }];
    // the leaf sits a hair above the line and carries its own lane, so when it is down the branch is drawn over the straight
    hg.add(ribbon(trimRoad(leaf, .05, leaf.L), .07, 0, L.lane, { lift: .014, dash: [.38, .2] }));
    line.forks.push({ s, dir, to: leaf, toK: 0, when: () => st.ang < 1, text: o.text || '' });
    const ha = (h + o.side * 45) * Math.PI / 180, axis = V(-Math.sin(ha), 0, Math.cos(ha)).normalize();
    const p0 = V(...leafPts[0].p), tipZ = sg => p0.clone().applyQuaternion(new T.Quaternion().setFromAxisAngle(axis, sg)).y, swing = tipZ(1) > tipZ(-1) ? 1 : -1;
    // the crank stands beside the line where the points begin, on the side they peel towards
    const hr = h * Math.PI / 180, C0 = [f.p.x - Math.sin(hr) * o.side * .95, f.p.z + Math.cos(hr) * o.side * .95, f.p.y];
    CY(g, C0[0], C0[1], .12, C0[2] - 2.4, C0[2] + .1, tri(th.mechDark || th.idle), 12);
    const st = { ang: 90, sweep: -1, leaf, end: [...P1, h + o.side * 45], at: f.p.clone() };
    st.m = L.machine({ key: o.key, name: o.name, size: .5, place: hh => { hh.position.copy(V(C0[0], C0[1], C0[2] + .14)); g.add(hh); },
      tick(dt, drive) {
        if (drive > 0) { st.ang += st.sweep * drive * 30; if (st.ang <= 0 || st.ang >= 90) { st.ang = clamp(st.ang, 0, 90); st.sweep *= -1; } }
        else { const tgt = st.ang > 45 ? 90 : 0; st.ang += clamp(tgt - st.ang, -60 * dt, 60 * dt); }
        hg.quaternion.setFromAxisAngle(axis, swing * st.ang / 90 * .5); setTri(leafMat, mixPal(mixPal(th.idle, sp(th, 1), clamp(1 - st.ang / 20, 0, 1)), th.mech, clamp(this.bloom.e, 0, 1)));   // once down, the leaf turns road-coloured: one finished road
        const off = Math.min(st.ang, 90 - st.ang); return drive > 0 ? .25 + .7 * Math.exp(-((off / 7) ** 2)) : 0;
      } });
    return st;
  }
  function faucetLift(L, o) {   // a cul-de-sac on a lift deck; cadence pumps water into the column under it, floors are detents
    const th = L.th, g = L.g, [jx, jy, jz] = o.J, step = o.step || 1.2, top = 3 * step, cg = new T.Group(); cg.position.copy(V(jx, jy, jz)); cg.rotation.y = -o.heading * Math.PI / 180; g.add(cg);
    const dg = new T.Group(); cg.add(dg);
    const pts = lollipop(0, 0, 0, 0, 1.2, 1), xs = pts.map(q => q.p[0]), ys = pts.map(q => q.p[1]);
    const x0 = .08, x1 = Math.max(...xs) + .45, y0 = Math.min(...ys) - .45, y1 = Math.max(...ys) + .45;
    B(dg, x0, y0, -.3, x1, y1, -.03, tri(th.idle));
    const deck = L.road(pts, { g: dg, w: .8, th: 0, pal: o.pal || sp(th, 1) });
    // the column: a slim glass tube under the middle of the cul-de-sac, clear of the road ends on screen
    const cpts = xs.filter(x => x > 1.5), ccx = (Math.min(...cpts) + Math.max(...cpts)) / 2, ccy = (y0 + y1) / 2;
    B(cg, x0 - .2, y0 - .2, -2.2, x1 + .2, y1 + .2, -1.8, tri(sp(th, 0)));
    const glass = CY(cg, ccx, ccy, .46, -1.8, -.8, tri({ t: '#E9FBFF', l: '#BFE8F2', r: '#9AD3E2' }, { opacity: .35 }), 24);
    const water = CY(cg, ccx, ccy, .36, -1.8, -.8, tri({ t: '#8FDCEF', l: '#55B9D2', r: '#3C9BB6' }, { opacity: .9 }), 20);
    const postMat = tri(o.postPal || th.mech), collars = [];
    for (const [px, py] of [[x0 - .12, y0 - .12], [x1 + .12, y0 - .12], [x0 - .12, y1 + .12], [x1 + .12, y1 + .12]]) {
      CY(cg, px, py, .07, -1.8, top + .45, postMat, 10); CY(cg, px, py, .12, top + .45, top + .55, postMat, 12);
      for (const h of [step, 2 * step, top]) collars.push({ h, m: CY(cg, px, py, .14, h - .06, h + .02, tri(th.mech, { fresh: true }), 14) }); }
    // the feed pipe and badge stand beyond the far end, or beside the deck when o.pipeSide is +1 / -1
    const ps = o.pipeSide || 0, px = ps ? (x0 + x1) / 2 : x1 + .55, py = ps ? ps * (Math.max(Math.abs(y0), Math.abs(y1)) + .55) : 0;
    CY(cg, px, py, .16, -2.2, top + 1.1, tri(o.pipePal || th.stone), 12);
    if (ps) B(cg, px - .12, Math.min(py, 0), -1.75, px + .12, Math.max(py, 0), -1.5, tri(o.pipePal || th.stone)); else B(cg, x1 + .2, -.12, -1.75, px, .12, -1.5, tri(o.pipePal || th.stone));
    const st = { lvl: 0, z: 0, deck, step, dg };
    st.m = (o.auto ? (m => { const fake = { on: false, set() {}, tick: m.tick, bloom: { e: 0 } }; (L.drags ||= []).push(dt => { return fake.tick(dt, rider.cad / 60 * dt * gearRatio(rider.gear)) || 0; }); m.place(new T.Group()); return fake; }) : L.machine)({ key: o.key, name: o.name, size: .7, place: h => { h.position.set(px, top + 1.1, py); cg.add(h); },
      tick(dt, drive) {
        const target = clamp((rider.cad - 55) / 45, 0, 1) * top, k = step / 1.2; if (drive > 0) st.lvl += clamp(target - st.lvl, -.9 * k * dt, .9 * k * dt);
        let z = st.lvl; for (const f of [0, step, 2 * step, top]) if (Math.abs(st.lvl - f) < .35 * k) z = f;
        st.z = z; dg.position.y = z;
        const gh = z - .3 + 1.8; glass.scale.y = gh; glass.position.y = -1.8 + gh / 2; const wh = Math.max(.02, z - .35 + 1.8); water.scale.y = wh; water.position.y = -1.8 + wh / 2;
        collars.forEach(c => setTri(c.m.material, Math.abs(z - c.h) < .01 ? tone(th.goal) : th.mech));
        const moved = Math.abs(st.lvl - (st.prevLvl ?? st.lvl)) > 1e-5; st.prevLvl = st.lvl; return drive > 0 && (moved || !o.auto) ? .3 + .1 * st.lvl / k : 0;
      } });
    return st;
  }

  /* ================= the levels ================= */
  const LEVELS = [
    { id: 'turntable', name: 'The turntable switch', th: () => THEMES[0],
      hint: 'The wheel laps the loop. Clutch the turntable (<b>Y</b>) and pedal while the wheel is away from it: it swings a quarter turn and clicks into place, sending the next lap out onto the pier. The pier\'s end lines up on screen with the road far below, and that is enough.',
      build(L) {
        const th = L.th, g = L.g;
        B(g, -1.2, -.6, -2.4, 10.2, 4.6, -.5, tri(sp(th, 0))); B(g, -.6, 0, -3, 9.6, 4, -2.4, tri(mixPal(sp(th, 0), tone(th.ink), .12)));
        for (let i = 0; i < 5; i++) onFace(g, 'y', 4.6, .6 + i * 2, -2.1, archGeo(.5, 1.1), basic(th.win.l, { opacity: .7 }));
        const loop = L.road(filletPath([[6, 0, 0], [9, 0, 0], [9, 4, 0], [0, 4, 0], [0, 0, 0], [3, 0, 0]], 1)); L.props.loop = loop;
        const pier = L.road(L3([3, -3, 0], [3, -5, 0], UP)); B(g, 2.5, -5, -3.4, 3.5, -3.6, -.5, tri(sp(th, 1)));
        const low = L.road(L3([0, -8, -3], [0, -12.5, -3], UP), { goal: true }); B(g, -.5, -12.5, -6.4, .5, -11.5, -3.5, tri(sp(th, 1))); B(g, -.5, -9.2, -5.6, .5, -8.4, -3.5, tri(sp(th, 1)));
        // a dusk tower behind the loop
        B(g, -3.4, -1.6, -3, -1.6, .2, 4.4, tri(sp(th, 0))); const dome = new T.Mesh(new T.SphereGeometry(.85, 20, 12, 0, TAU, 0, Math.PI / 2), tri(th.mech)); at(g, dome, -2.5, -.7, 4.4);
        for (let k = 0; k < 3; k++) onFace(g, 'y', .2, -2.5, .2 + k * 1.3, archGeo(.36, .8), basic(th.win.r));
        const t1 = turntable(L, { key: 'y', name: 'Turntable', pivot: [3, 0, 0], len: 3, open: -90 }); L.props.t1 = t1;
        L.view.updaters.push(() => { const a = t1.ang; L.props.ang = a; L.say(`turntable ${Math.round(-a)}°${a <= -89.5 ? ' · open to the pier' : a >= -.5 ? ' · closing the loop' : ''}`); });
      },
      spawn: L => ({ road: L.props.loop, s: 7.5, dir: 1 }),
      solve(L, W, R) { const m = L.machines[0], far = W.road === L.props.loop && W.s > 2 && W.s < L.props.loop.L - 3.5;
        R.cad = 78; m.set(far && L.props.ang > -89.5); },
      center: [3.5, -1.5, .4], pts: [[-1.2, -.6, 0], [10.2, 4.6, 0], [-3.4, -1.6, 5.4], [0, -12.5, -3], [3, -5.2, 0], [10.2, 4.6, -3], [0, -12.5, -6.4], [-3.4, .2, -3]],
      decor(L) { cloudLayer(L.view, L.th, '#FFFFFF', 4, .75, .55, .95, .2); drift(L.view, TEX.petal, '#FFB9A3', 12, .15, { vx: .3, vy: -.18, spin: 1.4 }); } },

    { id: 'lift', name: 'Cul-de-sac lift', th: () => THEMES[1],
      hint: 'The garden loop runs out onto the lift deck, turns round in a cul-de-sac and comes back. While the wheel is on the deck, clutch the faucet (<b>A</b>) and hold 85 rpm: the water lifts the deck to the second floor and it clicks into place, so the wheel comes back out up there. Lift it while the wheel is on the ground and the loop has a hole in it.',
      build(L) {
        const th = L.th, g = L.g;
        B(g, -4.4, -1.4, -1.6, 3.05, 3.4, -.5, tri(th.turf)); B(g, -4.1, -1.1, -3, 2.8, 3.1, -1.6, tri(sp(th, 0)));
        const ground = L.road(lollipop(3, 1, 180, 0, 1, 2), { pal: tone('#E9D7AE') }); L.props.ground = ground;
        const lift = faucetLift(L, { key: 'a', name: 'Faucet', J: [3, 1, 0], heading: 0, step: 1.8, pal: tone('#F3E6C4'), postPal: th.leaf, pipePal: th.leaf }); L.props.lift = lift; L.props.deck = lift.deck;
        // second floor: out of the cul-de-sac, round a bend, and a pier whose end lines up with the far road on screen
        const f2 = L.road(turtle(3, 1, 180, 3.6).fwd(.6).arc(1, 90).fwd(2.6).pts); B(g, 1.0, -2.4, -2.2, 1.8, -1.6, 3.1, tri(sp(th, 0)));
        const far = L.road(L3([-2.2, -6.2, 0], [-2.2, -10.7, 0], UP), { goal: true, pal: tone('#E9D7AE') }); B(g, -2.8, -10.8, -1.6, -1.6, -6, -.5, tri(th.turf)); B(g, -2.6, -10.6, -2.6, -1.8, -6.2, -1.6, tri(sp(th, 0)));
        // trees
        for (const [x, y, s] of [[-3.6, -1, 1], [-3.8, 2.6, .8]]) { CY(g, x, y, .1 * s, -.5, .6 * s, tri(tone('#9B7046')), 8); const c = new T.Mesh(new T.IcosahedronGeometry(.6 * s, 0), tri(th.leaf)); at(g, c, x, y, .6 * s + .5 * s); }
        L.view.updaters.push(() => { const z = lift.z; L.props.z = z; L.say(`deck ${z.toFixed(2)} m${z === 3.6 ? ' · second floor' : z === 0 ? ' · ground' : [1.8, 5.4].includes(z) ? ' · wrong floor' : ''}`); });
      },
      spawn: L => ({ road: L.props.ground, s: 4, dir: 1 }),
      solve(L, W, R) { const m = L.machines[0], d = L.props.deck, prog = W.road === d ? (W.dir > 0 ? W.s : d.L - W.s) : 99;
        if (prog < 2.5 && L.props.z < 3.6) { m.set(true); R.cad = 85; } else if (L.props.z === 3.6 || W.road !== d) { m.set(false); R.cad = 72; } },
      center: [1.2, -2, 1.6], pts: [[-4.4, -1.4, 0], [7.6, 2.4, 0], [7.6, 2.4, 6.7], [8, 1, 7.4], [-2.2, -10.8, 0], [-4.1, 3.1, -3], [7.5, -.4, -2.6], [-2.6, -10.6, -2.6]],
      decor(L) { cloudLayer(L.view, L.th, '#FFFFFF', 4, .8, .6, .95, .2); drift(L.view, TEX.petal, '#FFB5CE', 10, .14, { vx: .25, vy: -.15, spin: 1.2 }); } },

    { id: 'seesaw', name: 'Spring see-saw', th: () => THEMES[3],
      hint: 'The see-saw rests tipped one way, so the wheel crosses up to the spiral. While it spirals down, clutch the spring (<b>Y</b>) and push: around 80 rpm in gear 4 (or more gear) winds it and tips the beam the other way. Keep pushing until the wheel is across, or the spring unwinds and the beam tips back.',
      build(L) {
        const th = L.th, g = L.g, a = Math.asin(1 / 2.5), X = 2.5 * Math.cos(a);
        const pivot = new T.Group(); pivot.position.copy(V(0, 0, 1)); g.add(pivot); const beamMat = tri(th.idle, { fresh: true, side: true });
        const beam = L.road(L3([-2.5, 0, 0], [2.5, 0, 0], UP), { g: pivot, mat: beamMat, th: .35 }); L.props.beam = beam;
        B(g, -.4, .55, -3.2, .4, 1.15, 1.25, tri(sp(th, 2))); CY(g, 0, .3, .14, .85, 1.15, tri(th.mech), 12).rotation.x = Math.PI / 2;
        const start = L.road(L3([-7.5, 0, 0], [-X, 0, 0], UP)); L.props.start = start; B(g, -7.8, -.6, -3, -6.4, .6, -.5, tri(sp(th, 0)));
        const t = turtle(X, 0, 0, 2); t.grade = -2 / lollipopLen(1, 1.2); const spiral = L.road(t.fwd(1).teardrop(1.2).fwd(1).pts, { pal: sp(th, 1) }); L.props.spiral = spiral;
        const cx = X + 1 + 1.2 * 1.732; CY(g, cx, 0, .5, -3.2, 1.2, tri(sp(th, 2)), 6); const gem = new T.Mesh(new T.OctahedronGeometry(.45, 0), tri(th.mech)); at(g, gem, cx, 0, 1.9); L.view.updaters.push(tt => gem.rotation.y = tt);
        const upper = L.road(L3([-X, 0, 2], [-4.6, 0, 2], UP), { pal: sp(th, 2) }); L.props.upper = upper; for (const y of [-1.05, .65]) B(g, -4.4, y, -3, -3.8, y + .4, 1.25, tri(sp(th, 2))); B(g, -4.4, -1.05, 1.25, -3.8, 1.05, 1.55, tri(sp(th, 2)));
        const goal = L.road(L3([-6.6, -2, 0], [-10.5, -2, 0], UP), { goal: true, pal: sp(th, 0) }); B(g, -10.6, -2.6, -2.4, -8.6, -1.4, -.5, tri(sp(th, 1)));
        let c = 0;
        L.machine({ key: 'y', name: 'Spring', size: .7, place: h => { h.position.copy(V(0, 1.15, .7)); h.rotation.x = Math.PI / 2; g.add(h); },
          tick(dt, drive) {
            const hold = 90 + 150 * c, P = powerOf(rider.cad, rider.gear, .2 + 1.3 * c);
            if (drive > 0) c += (P - hold) * .006 * dt; else c -= .3 * dt; c = clamp(c, 0, 1);
            const k = clamp((c - .1) / .8, 0, 1), sm = k * k * (3 - 2 * k); pivot.rotation.z = a * (1 - 2 * sm);
            setTri(beamMat, mixPal(th.idle, th.mech, sm)); L.props.c = c;
            L.say(`spring ${Math.round(c * 100)}% · needs ${Math.round(hold)} W${sm >= 1 ? ' · tipped toward the upper road' : sm <= 0 ? ' · resting' : ''}`);
            return drive > 0 ? .2 + 1.3 * c : 0;
          } });
      },
      spawn: L => ({ road: L.props.start, s: .6, dir: 1 }),
      solve(L, W, R) { const m = L.machines[0], on = W.road === L.props.spiral || (W.road === L.props.beam && L.props.c > .5);
        m.set(on); R.cad = on ? 88 : 70; },
      center: [-1.5, -.6, .4], pts: [[-7.8, -.6, 0], [7.5, 1.2, 0], [-10.6, -2.6, 0], [0, 1, 2.6], [6.3, 0, 2.6], [-7.8, .6, -3], [6, 0, -3.2], [-10.6, -1.4, -2.4]], pad: 1.1,
      decor(L) { drift(L.view, TEX.diamond, '#FFF39B', 14, .14, { vx: .05, vy: .12, twinkle: 1.6, add: true, opacity: .75 }); cloudLayer(L.view, L.th, '#FFD6F0', 3, .3, .6, .95, .15); } },

    { id: 'lamps', name: 'Lamps on, lamps off', th: () => THEMES[4],
      hint: 'The wheel shuttles between two cul-de-sacs. Light lamp one (<b>Y</b>, about 85 rpm) and the next time round, a road of light opens off the far bend. Then switch to lamp two (<b>B</b>) for the second light bridge, and let it go dark again before the last gap: that gap only holds while you cannot see it.',
      build(L) {
        const th = L.th, g = L.g, X = 9.732;
        const main = L.road(L3([0, 0, 0], [6, 0, 0], UP)); L.props.main = main;
        const west = L.road(lollipop(0, 0, 180, 0)), east = L.road(lollipop(6, 0, 0, 0)); L.props.east = east;
        B(g, -3.4, -1.4, -2.6, 9.9, 1.4, -.5, tri(sp(th, 0))); B(g, -3, -1, -3.4, 9.5, 1, -2.6, tri(mixPal(th.stone, tone(th.ink), .2)));
        const lit = (b) => ({ t: mix('#2A2D55', '#FFF2C4', b), l: mix('#22264A', '#FFD979', b), r: mix('#1C1F40', '#FFC24A', b) });
        const lightMat = tri(lit(0), { fresh: true, opacity: .5, side: true }), light2Mat = tri(lit(0), { fresh: true, opacity: .5, side: true });
        const lampY = { b: 0 }, lampB = { b: 0 }; L.props.lampY = lampY; L.props.lampB = lampB;
        const lightA = L.road(L3([X, 0, 0], [X, -3, 0], UP), { mat: lightMat, th: .12, noLane: true, solid: () => lampY.b > .45, goneText: 'The light faded under the wheel' }); L.props.lightA = lightA;
        east.forks.push({ s: 1 + Math.PI / 3 + 150 * Math.PI / 180, dir: 1, to: lightA, toK: 0, when: () => lampY.b > .6, text: 'Took the road of light' });
        const b1 = L.road(L3([X, -3, 0], [X, -4.5, 0], UP)); L.props.b1 = b1;
        const b2 = L.road(L3([X, -5.5, 0], [X, -9, 0], UP)); L.props.b2 = b2;
        const c = L.road(L3([X, -10, 0], [X, -12.6, 0], UP), { goal: true });
        const light2 = L.road(L3([X, -4.5, 0], [X, -5.5, 0], UP), { mat: light2Mat, th: .12, noLane: true, solid: () => lampB.b > .45, goneText: 'Lamp two was too dim' }); L.props.light2 = light2;
        b2.gaps.push({ k: 1, to: c, toK: 0, when: () => lampB.b < .3, text: 'Crossed the dark gap unseen' }); b2.edgeText = 'Lamp two lit the gap, so it was real';
              const darkMat = tri(sp(th, 1), { fresh: true, opacity: .99 }), dark = B(g, X - .5, -10, -.5, X + .5, -9, 0, darkMat);
        B(g, X - .7, -12.8, -2.4, X + .7, -2.8, -.5, tri(mixPal(th.stone, tone(th.ink), .2)));
        B(g, X - .5, -10, -2.4, X + .5, -9, -.5, tri(tone('#0B0D24')));   // the hole, only visible once lit
        // two lamp posts behind the road, each with a cone of light and a lantern bloom at its foot
        const lamp = (y, st, key, name, rad = 1.7) => {
          B(g, 7.6, y - .5, -2.4, 8.6, y + .5, -.5, tri(sp(th, 0))); CY(g, 8.1, y, .08, -.5, 3, tri(tone('#2A2D55')), 8); B(g, 8.05, y - .05, 2.95, X, y + .05, 3.05, tri(tone('#2A2D55')));
          const bulb = new T.Mesh(new T.SphereGeometry(.17, 14, 10), basic('#3A3D66')); at(g, bulb, X, y, 2.8);
          const halo = sprite(TEX.glow, 2.6, 2.6, th.glow, { opacity: 0, add: true }); at(g, halo, X, y, 2.8);
          const cg = new T.ConeGeometry(rad, 3, 32, 1, true); cg.translate(0, -1.5, 0); const cone = new T.Mesh(cg, basic(th.glow, { opacity: 0, add: true, side: true })); at(g, cone, X, y, 2.8);
          L.machine({ key, name, size: .5, place: h => { h.position.copy(V(8.1, y, -.5)); g.add(h); },
            tick(dt, drive) { const tgt = drive > 0 ? clamp((rider.cad - 40) / 50, 0, 1) : 0; st.b += (tgt - st.b) * Math.min(1, dt * (drive > 0 ? 2.5 : 1.3));
              bulb.material.color.set(mix('#3A3D66', th.glow, st.b)); halo.material.opacity = st.b * .9; cone.material.opacity = st.b * .14; return drive > 0 ? .1 + .35 * st.b : 0; } });
        };
        lamp(-1.5, lampY, 'y', 'Lamp one'); lamp(-7.3, lampB, 'b', 'Lamp two', 2.8);
        L.view.updaters.push(() => { setTri(lightMat, lit(lampY.b)); lightMat.uniforms.opacity.value = .92 * lampY.b; setTri(light2Mat, lit(lampB.b)); light2Mat.uniforms.opacity.value = .92 * lampB.b;
          for (const r of [lightA, light2]) for (const m of r.vis || []) m.visible = r.mat.uniforms.opacity.value > .02;
          darkMat.uniforms.opacity.value = clamp(1 - lampB.b * 2.2, 0, 1); dark.visible = darkMat.uniforms.opacity.value > .01;
          L.say(`lamp one ${Math.round(lampY.b * 100)}% · lamp two ${Math.round(lampB.b * 100)}%`); });
        // windows in the base and a moon
        for (let i = 0; i < 6; i++) onFace(g, 'y', 1.4, -2.6 + i * 2, -2, archGeo(.36, .8), basic(th.glow, { opacity: .5 + .4 * (i % 2) }));
      },
      spawn: L => ({ road: L.props.main, s: 1, dir: 1 }),
      solve(L, W, R) { const [Y, Bm] = L.machines, r = W.road, P = L.props;
        R.cad = 86;
        if (r === P.lightA) { Y.set(true); Bm.set(true); } else if (r === P.b1 || r === P.light2) { Y.set(false); Bm.set(true); } else if (r === P.b2) { Y.set(false); Bm.set(false); } else { Y.set(true); Bm.set(false); } },
      center: [4.8, -5, .2], pts: [[-3.4, -1.4, 0], [9.9, 1.4, 0], [9.7, -12.8, 0], [8.1, -1.5, 3.2], [8.1, -7.4, 3.2], [-3, 1, -3.4], [9.7, -12.8, -2.4], [-3.4, -1.4, -2.6]],
      decor(L) { drift(L.view, TEX.dot, '#FFE69A', 16, .07, { vx: .1, vy: .08, twinkle: 2, add: true, opacity: .9 }); const [l, r, b, t] = L.view.screenBox(); const moon = backdrop(L.view, TEX.glow, 3, 3, r - 2.2, t - 2, -100, '#FFF4D0', .9); } },
    { id: 'longway', name: 'The long way round', th: () => THEMES[0], cruise: [78, 92],
      hint: 'A longer ride with two pulses and one long climb between them. The wheel laps the loop round the dome tower. Swing the turntable (<b>Y</b>) while the wheel is away from it, and the next lap runs down the pier, which meets the far road on screen. The far road zigzags up behind the clock tower, and every pass has a gap in it that the tower hides, so the wheel rides straight across. At the top, hold 85 rpm with the faucet (<b>A</b>) while the wheel is on the lift deck. Miss the lift and the wheel rides all the way back down for another go. Hold the pace band (78–92 rpm) on the long stretches; the lane lights up while you are in it.',
      build(L) {
        const th = L.th, g = L.g, postMat = tri(sp(th, 1));
        // the loop: a flat holding lap round a little dome tower; no coil, the zigzag is this level's long stretch
        const loop = L.road(filletPath([[4, 0, 0], [8, 0, 0], [8, 4, 0], [-2, 4, 0], [-2, 0, 0], [1, 0, 0]], 1.2)); L.props.loop = loop;
        { const x = -.2, y = 2.2;
          CY(g, x, y, .75, -2.2, 1.2, tri(sp(th, 2)), 28); CY(g, x, y, .95, 1.2, 1.45, tri(sp(th, 0)), 28); CY(g, x, y, .95, -2.4, -2.2, tri(sp(th, 0)), 28);
          const dome = new T.Mesh(new T.SphereGeometry(.68, 22, 12, 0, TAU, 0, Math.PI / 2), tri(th.mech)); at(g, dome, x, y, 1.45);
          for (let k = 0; k < 2; k++) onFace(g, 'y', y + .76, x - .25 + k * .5, -.6 + k * .9, archGeo(.22, .5), basic(th.win.r));
          const ring = new T.Mesh(new T.TorusGeometry(.85, .05, 6, 40), basic('#FFD15C', { opacity: .9 })); ring.rotation.x = Math.PI / 2; at(g, ring, x, y, 2.4); L.view.updaters.push(t => { ring.position.y = 2.4 + .2 * Math.sin(t * 1.1); }); }
        for (const [x, y] of [[7.4, 0], [8, 2], [7.4, 4], [3, 4], [-1.4, 4], [-2, 1.4], [-1.2, 0]]) CY(g, x, y, .14, -2.2, -.25, postMat, 10);
        L.props.t1 = turntable(L, { key: 'y', name: 'Turntable', pivot: [1, 0, 0], len: 3, open: -90 });
        L.road(L3([1, -3, 0], [1, -5, 0], UP)); CY(g, 1, -4.2, .16, -2.2, -.25, postMat, 10);
        // the far road: it meets the pier only on screen, then zigzags up behind the clock tower; each pass has a gap the tower hides
        const t = turtle(-2, -8, -90, -3), cut = () => { const p = t.pts; t.pts = []; t.add(); return p; }, gaps = [];
        t.fwd(1.5).arc(1.5, 45).gr(1 / 9.2).fwd(4);
        const r1 = L.road(cut(), { pal: sp(th, 1) }); t.fwd(1.2); gaps.push([t.x, t.y, t.z]); cut();
        t.fwd(4).gr(0).arc(1, -180).gr(1 / 9.2).fwd(4); const r2 = L.road(cut(), { pal: sp(th, 1) }); t.fwd(1.2); gaps.push([t.x, t.y, t.z]); cut();
        t.fwd(4).gr(0).arc(1, 180).gr(1 / 9.2).fwd(4); const r3 = L.road(cut(), { pal: sp(th, 1) }); t.fwd(1.2); gaps.push([t.x, t.y, t.z]); cut();
        t.fwd(4); const r4 = L.road(cut(), { pal: sp(th, 1) }); const J = [t.x, t.y, t.z];
        // the clock tower stands in front of the middle of the zigzag
        const k = Math.SQRT1_2, mid = gaps[0], cx = mid[0] - .6 * k + 3.1 * k, cy = mid[1] + .6 * k + 3.1 * k, hw = 1.3;
        const g3 = gaps[2], u = (x, y, z) => (2 * z - x - y) / Math.sqrt(6), zt = (Math.sqrt(6) * (u(g3[0] - .6 * k, g3[1] + .6 * k, g3[2]) + 1.5) + cx + cy - 2 * hw) / 2;
        const towerC = [[cx - hw, cy - hw], [cx + hw, cy - hw], [cx - hw, cy + hw], [cx + hw, cy + hw]].flatMap(([x, y]) => [[x, y, -8.4], [x, y, zt]]);
        B(g, cx - hw, cy - hw, -8.4, cx + hw, cy + hw, zt, tri(sp(th, 0))); B(g, cx - hw - .15, cy - hw - .15, zt, cx + hw + .15, cy + hw + .15, zt + .3, tri(sp(th, 2)));
        const roof = new T.Mesh(new T.ConeGeometry(1.25, 1.6, 4), tri(th.mech)); roof.rotation.y = Math.PI / 4; at(g, roof, cx, cy, zt + 1.1);
        const face = new T.Mesh(new T.CircleGeometry(.62, 40), basic('#FFF4EC')); face.position.copy(V(cx + hw + .015, cy, zt - 1)); face.rotation.y = Math.PI / 2; g.add(face);
        const hand = new T.Mesh(UNIT, basic(th.ink)); hand.scale.set(.05, .5, .05); const hp = new T.Group(); hp.position.copy(V(cx + hw + .03, cy, zt - 1)); hp.rotation.y = Math.PI / 2; hand.position.y = .22; hp.add(hand); g.add(hp); L.view.updaters.push(tt => { hp.rotation.z = -tt * .5; });
        for (let i = 0; i < 4; i++) onFace(g, 'y', cy + hw, cx - .6 + (i % 2) * 1.2, zt - 3.2 - Math.floor(i / 2) * 2.4, archGeo(.36, .8), basic(th.win.r));
        for (let i = 0; i < 3; i++) onFace(g, 'x', cx + hw, cy - .5 + (i % 2), zt - 3.2 - i * 2.2, archGeo(.36, .8), basic(th.win.l, { opacity: .8 }));
        const hidden = p => { const h = hull2(towerC.map(c => L.v2(V(...c)))), q = V(...p), dq = q.clone().applyMatrix4(L.view.camera.matrixWorldInverse).z, dt = V(cx, cy, zt / 2).applyMatrix4(L.view.camera.matrixWorldInverse).z; return inHull(h, L.v2(q), .25) && dt > dq; };
        [[r1, r2], [r2, r3], [r3, r4]].forEach(([a, b]) => { const pa = a.S[a.S.length - 1].p, pb = b.S[0].p, ends = [[pa.x, pa.z, pa.y], [pb.x, pb.z, pb.y]], ok = () => ends.every(hidden);
          a.gaps.push({ k: 1, to: b, toK: 0, when: ok, text: 'Behind the tower, so the gap is hidden' }); b.gaps.push({ k: 0, to: a, toK: 1, when: ok, text: 'Behind the tower, so the gap is hidden' }); });
        for (const r of [r1, r2, r3, r4]) for (const sAt of [1.2, r.L - 1.2]) { if (r.L < 3) continue; const f = r.S.find((q, i) => r.cum[i] >= sAt).p; CY(g, f.x, f.z, .14, -8.2, f.y - .5, postMat, 10); }
        L.props.lift = faucetLift(L, { key: 'a', name: 'Faucet', J, heading: -45, step: 1.8, pal: sp(th, 1) });
        L.road(turtle(J[0], J[1], 135, J[2] + 3.6).fwd(.6).arc(1.5, 90).fwd(3).pts, { goal: true, pal: sp(th, 2) });
        { const e = L.roads[L.roads.length - 1].S.at(-1).p; CY(g, e.x, e.z, .4, -8.4, e.y - .55, tri(sp(th, 0)), 18); }
        L.props.tower = { cx, cy, zt, hidden };
        L.view.updaters.push(() => { const t1 = L.props.t1, lf = L.props.lift; L.say(`turntable ${Math.round(-t1.ang)}° · deck ${lf.z === 0 ? 'on the road' : lf.z === 3.6 ? 'second floor' : lf.z.toFixed(1) + ' m'}`); });
      },
      spawn: L => ({ road: L.props.loop, s: 1, dir: 1 }),
      solve(L, W, R) { R.cad = 85; const t1 = L.props.t1, lf = L.props.lift, lp = L.props.loop, far = W.road === lp && W.s > 2 && W.s < lp.L - 4;
        t1.m.set(far && t1.ang > -89.5); lf.m.set(W.road === lf.deck && lf.z < 3.6); },
      center: [2, -8, -1], pts: [[-2.6, 4.6, -2.4], [8.6, -.6, -2.4], [-.2, 2.2, 3.2], [-2, -8, -8.4], [5.6, -19, -8.4], [-5, -16, -8.4]], pad: .8,
      decor(L) { cloudLayer(L.view, L.th, '#FFFFFF', 5, .75, .5, .95, .2); drift(L.view, TEX.petal, '#FFB9A3', 14, .15, { vx: .3, vy: -.18, spin: 1.4 }); } },

    { id: 'mobius', name: 'Möbius', th: () => THEMES[5], cruise: [78, 92],
      hint: 'A Möbius loop built from straights: each of the two side straights is one long quarter twist, so the wheel rides one lap on top of the strip and the next lap underneath it. Where the near straight meets its corner, a drawbridge stands raised, ready to carry the road straight on to the goal tower. Crank it down (<b>Y</b>). The wheel only rides onto it on a lap on top; underneath, it passes below the bridge and comes round again. Hold the pace band on the long laps.',
      build(L) {
        const th = L.th, g = L.g, Z = 2.4, half = .06, a = 4, rc = 1.8, sl = 2 * (a - rc), tw = sl, w = 1.15, sm = u => u * u * (3 - 2 * u);
        // centre line: a rounded square, straights along x = a (S1), y = a (S2), x = -a (S3), y = -a (S4)
        const tt = turtle(a, -(a - rc), 90, Z); for (let k = 0; k < 4; k++) tt.fwd(sl).arc(rc, 90); const C = tt.pts, cum = [0];
        for (let i = 1; i < C.length; i++) cum.push(cum[i - 1] + Math.hypot(C[i].p[0] - C[i - 1].p[0], C[i].p[1] - C[i - 1].p[1]));
        const seg = sl + rc * Math.PI / 2, L1 = cum[cum.length - 1];
        // twist: a quarter turn along the whole of S2 and another along the whole of S4; flat on S1, S3 and the corners
        const psiAt = s => { const t2 = seg + sl / 2, t4 = 3 * seg + sl / 2, q = (c, s) => sm(clamp((s - c + tw / 2) / tw, 0, 1)); return Math.PI / 2 * (q(t2, s) + q(t4, s)); };
        const frame = (i, extra) => { const A = C[Math.max(0, i - 1)].p, Bp = C[Math.min(C.length - 1, i + 1)].p, dx = Bp[0] - A[0], dy = Bp[1] - A[1], l = Math.hypot(dx, dy), d = [dx / l, dy / l];
          const psi = psiAt(cum[i]) + extra, s0 = [d[1], -d[0]], n = [Math.sin(psi) * s0[0], Math.sin(psi) * s0[1], Math.cos(psi)]; return n; };
        const lap = extra => C.map((q, i) => { const n = frame(i, extra); return { p: [q.p[0] + half * n[0], q.p[1] + half * n[1], q.p[2] + half * n[2]], n }; });
        const l1 = lap(0), l2 = lap(Math.PI);
        const ring = L.road(l1.concat(l2.slice(1)), { closed: true, noDeck: true, laneMat: tri(tone(th.ink), { side: true }) }); L.props.ring = ring; L.props.L1 = L1; L.props.seg = seg;
        const one = new Road(l1);
        g.add(ribbon(one, w, 2 * half, tri(th.mech, { side: true })));
        const railMat = tri(th.mechDark, { side: true }), inkLane = tri(tone(th.ink), { side: true });
        // the outer rail stops where the drawbridge carries the straight on, so nothing crosses the way out
        const sF = sl, peel = 1.6;
        g.add(ribbon(one, .12, .16, railMat, { x0: -.56, lift: .02 }));
        for (const [a0, a1] of [[0, sF - .3], [sF + peel, L1]]) g.add(ribbon(trimRoad(one, a0, a1), .12, .16, railMat, { x0: .56, lift: .02 }));
        // hub with the crank, and posts under the strip's lower edge
        CY(g, 0, 0, 1.1, -3.4, Z + .4, tri(sp(th, 0)), 28); CY(g, 0, 0, 1.4, -3.6, -3.4, tri(th.mechDark), 28);
        for (const sAt of [seg + .2 + sl, 2 * seg + sl / 2, 3 * seg - rc * .8, 4 * seg - rc * Math.PI / 4]) {
          const i = cum.findIndex(c => c >= sAt), n = frame(i, 0), q = C[i].p, d = [C[i + 1].p[0] - q[0], C[i + 1].p[1] - q[1]], l = Math.hypot(...d), s0 = [d[1] / l, -d[0] / l];
          const psi = psiAt(cum[i]), sd = [Math.cos(psi) * s0[0], Math.cos(psi) * s0[1], -Math.sin(psi)]; const e1 = q.map((v, k) => v + sd[k] * w / 2), e2 = q.map((v, k) => v - sd[k] * w / 2);
          const lo = Math.abs(e1[2] - e2[2]) < .05 ? (Math.hypot(e1[0], e1[1]) > Math.hypot(e2[0], e2[1]) ? e1 : e2) : (e1[2] < e2[2] ? e1 : e2);
          CY(g, lo[0], lo[1], .1, -3.4, lo[2] - .02, tri(th.mechDark), 10); CY(g, lo[0], lo[1], .3, -3.6, -3.4, tri(th.mechDark), 16); }
        // the way out: a drawbridge hinged at its far end carries the near straight straight on past the corner, to the goal road and its tower
        const top = Z + half - .004, Hn = [a, a - rc + 2.4, top], hg = new T.Group(); hg.position.copy(V(...Hn)); g.add(hg);
        const leafMat = tri(th.idle, { fresh: true, side: true }), wayLane = inkLane;
        const leaf = L.road(L3([0, -2.4, 0], [0, 0, 0], UP), { g: hg, mat: leafMat, th: 2 * half + .06, w, laneMat: wayLane }); L.props.leaf = leaf;
        const exit = L.road(L3(Hn, [a, Hn[1] + 4.2, top], UP), { goal: true, mat: tri(th.mech, { side: true }), th: .3, w, laneMat: wayLane });
        for (const x0 of [.56, -.56]) g.add(ribbon(exit, .12, .16, railMat, { x0, lift: .02 }));
        CY(g, a, Hn[1] + 3.7, .55, -3.4, top - .31, tri(sp(th, 0)), 18); CY(g, a, Hn[1] + 3.7, .72, -3.6, -3.3, tri(th.mechDark), 18);
        CY(g, a, Hn[1] + .3, .1, -3.4, top - .3, tri(th.mechDark), 10); CY(g, a, Hn[1] + .3, .3, -3.6, -3.4, tri(th.mechDark), 16);
        { const pin = new T.Mesh(new T.CylinderGeometry(.08, .08, w + .3, 12), tri(th.mechDark)); pin.position.copy(V(a, Hn[1], top - .2)); pin.rotation.z = Math.PI / 2; g.add(pin); }
        const hatch = { ang: 90, sweep: -1 }; L.props.hatch = hatch;
        ring.forks.push({ s: sF, dir: 1, to: leaf, toK: 0, when: () => hatch.ang < 1, text: 'On top, and the bridge is down, so the road runs straight on' });
        // the crank stands on its own post outside the ring, beside the bridge, so its badge sits in open sky
        const cp = [a + 2.4, Hn[1] - 1.2, top - .2]; CY(g, cp[0], cp[1], .12, -3.4, cp[2] + .1, tri(th.mechDark), 12); CY(g, cp[0], cp[1], .3, -3.6, -3.4, tri(th.mechDark), 16);
        hatch.m = L.machine({ key: 'y', name: 'Drawbridge', size: .6, place: h => { h.position.copy(V(cp[0], cp[1], cp[2] + .14)); g.add(h); },
          tick(dt, drive) {
            if (drive > 0) { hatch.ang += hatch.sweep * drive * 30; if (hatch.ang <= 0 || hatch.ang >= 90) { hatch.ang = clamp(hatch.ang, 0, 90); hatch.sweep *= -1; } }
            else { const tgt = hatch.ang > 45 ? 90 : 0; hatch.ang += clamp(tgt - hatch.ang, -60 * dt, 60 * dt); }
            hg.rotation.x = hatch.ang / 90 * 1.1; const dn = clamp(1 - hatch.ang / 30, 0, 1); setTri(leafMat, mixPal(th.idle, th.mech, clamp(Math.max(this.bloom.e, dn), 0, 1)));
            const W = L.W, side = W.road === ring ? (W.s < L1 ? 'wheel on top' : 'wheel underneath') : '';
            L.say(`bridge ${hatch.ang < 1 ? 'down' : hatch.ang > 89 ? 'raised' : Math.round(90 - hatch.ang) + '°'}${side ? ' · ' + side : ''}`);
            const off = Math.min(hatch.ang, 90 - hatch.ang); return drive > 0 ? .25 + .7 * Math.exp(-((off / 7) ** 2)) : 0;
          } });
      },
      spawn: L => ({ road: L.props.ring, s: L.props.seg + .6, dir: 1 }),
      solve(L, W, R) { R.cad = 85; L.props.hatch.m.set(L.props.hatch.ang > .5); },
      center: [1, 2, 0], pts: [[-5, -5, 2.4], [5, 5, 2.4], [-5, 5, 2.4], [5, -5, 2.4], [-5, 5, -3.6], [5, -5, -3.6], [0, 0, 4], [4.6, 9.4, 2.5], [4.6, 9.4, -3.6], [6.8, 3, 2.4]], pad: 1,
      decor(L) { const [l, r, b, t] = L.view.screenBox(); const g1 = backdrop(L.view, TEXS.bigGear, 10, 10, l + 3, b + (t - b) * .7, -110, '#C08A3A', .14); L.view.updaters.push(tt => g1.material.rotation = tt * .05);
        drift(L.view, TEX.dot, '#FFE7B0', 16, .06, { vx: .08, vy: .1, spin: 0, twinkle: 1.2, add: true, opacity: .8 }); } },
    { id: 'keys', name: 'Two keys', th: () => THEMES[2], cruise: [78, 92],
      hint: 'The wheel shuttles along the harbour road between two cul-de-sacs. One key waits at the end of the south spur and the other at the top of the north zigzag, where a gate opens only for a wheel carrying both. Crank the south points (<b>Y</b>) down and the next eastbound pass peels off south; crank the north points (<b>A</b>) down and the next westbound pass peels off north. Each spur brings the wheel back onto the harbour road heading the other way. Go north first and the gate stays shut, so it is all the way back down, out south and up again.',
      build(L) {
        const th = L.th, g = L.g, postMat = tri(sp(th, 1)), keys = { s: false, n: false }; L.props.keys = keys;
        // the harbour road: a straight shuttle with a cul-de-sac at each end, safe to lap forever
        const line = L.road(L3([-6, 0, 0], [6, 0, 0], UP)); L.road(turtle(6, 0, 0, 0).fwd(.4).teardrop(1.1).fwd(.4).pts); L.road(turtle(-6, 0, 180, 0).fwd(.4).teardrop(1.1).fwd(.4).pts);
        for (const x of [-7.4, -4, 4, 7.4]) CY(g, x, 0, .14, -2.4, -.25, postMat, 10);
        L.props.line = line;
        // houses along the harbour, clear of both spurs
        for (const [x0, y0, x1, y1, z1] of [[3.6, -3.6, 5.8, -1.8, 1.6], [-8.6, -3.6, -6.6, -2, 1.1]]) { B(g, x0, y0, -2.4, x1, y1, z1, tri(sp(th, 0)));
          const roof = new T.Mesh(new T.ConeGeometry(1, .8, 4), tri(th.roof)); roof.scale.set((x1 - x0) * .78, 1, (y1 - y0) * .78); roof.rotation.y = Math.PI / 4; at(g, roof, (x0 + x1) / 2, (y0 + y1) / 2, z1 + .4);
          for (let i = 0; i < 2; i++) onFace(g, 'y', y1, x0 + (i + .5) * (x1 - x0) / 2, z1 - 1, archGeo(.26, .6), basic(th.blue.l)); }
        // south points: eastbound at x = -3.5, peeling right; the spur runs out to a cul-de-sac with the first key
        const SP = peelSwitch(L, { line, s: 2.5, dir: 1, side: -1, key: 'y', name: 'South points', text: 'Peeled off south' });
        const ts = turtle(...SP.end.slice(0, 2), SP.end[3], SP.end[2]); ts.fwd(2.5).arc(2, -45).fwd(2.5);
        const south = L.road(ts.pts), sEnd = [ts.x, ts.y, ts.z], sd = turtle(sEnd[0], sEnd[1], -90, sEnd[2]).teardrop(1.1), sDrop = L.road(sd.pts);
        { const f = south.at(south.L * .5).p; CY(g, f.x, f.z, .14, -2.4, f.y - .25, postMat, 10); } CY(g, sEnd[0], sEnd[1] - 1.9, .5, -2.6, sEnd[2] - .3, tri(sp(th, 0)), 24);
        // north points: westbound at x = 3.5, peeling right; the spur zigzags up to a cul-de-sac with the second key
        const NP = peelSwitch(L, { line, s: 9.5, dir: -1, side: -1, key: 'a', name: 'North points', text: 'Peeled off north' });
        const tn = turtle(...NP.end.slice(0, 2), NP.end[3], NP.end[2]); tn.fwd(1.2).arc(1.5, -45).fwd(1.5).arc(1.2, -90).gr(1 / 8).fwd(4).gr(0).arc(1.2, 180).gr(1 / 8).fwd(4).gr(0).arc(1.2, -180).gr(1 / 8).fwd(4).gr(0);
        const north = L.road(tn.pts), nEnd = [tn.x, tn.y, tn.z], nd = turtle(nEnd[0], nEnd[1], 0, nEnd[2]).teardrop(1.1), nDrop = L.road(nd.pts);
        for (let sAt = 3; sAt < north.L - 1; sAt += 3.4) { const f = north.at(sAt).p; CY(g, f.x, f.z, .14, -2.4, f.y - .25, postMat, 10); }
        CY(g, nEnd[0] + 1.9, nEnd[1], .5, -2.6, nEnd[2] - .3, tri(sp(th, 0)), 24);
        // the gate: on the way back from the key, a branch peels north off the top pass to the goal
        const sG = north.L - 1.6, fg = north.at(sG), gh = Math.atan2(fg.d.z, fg.d.x) * 180 / Math.PI + 180;
        const tg = turtle(fg.p.x, fg.p.z, gh, fg.p.y).arc(2.5, -45).fwd(3.5), goal = L.road(tg.pts, { goal: true, pal: sp(th, 2) });
        north.forks.push({ s: sG, dir: -1, to: goal, toK: 0, when: () => keys.s && keys.n, text: 'Both keys, so the gate opened' });
        { const e = goal.S.at(-1).p; CY(g, e.x, e.z, .45, -2.6, e.y - .3, tri(sp(th, 0)), 20); }
        const gq = goal.at(2.4), gd = gq.d, gn = new T.Vector3(-gd.z, 0, gd.x).normalize(), gateMat = tri(th.mech, { fresh: true });
        for (const k of [-.78, .78]) { const q = gq.p.clone().addScaledVector(gn, k); CY(g, q.x, q.z, .1, q.y - .3, q.y + .75, tri(th.mechDark || th.idle), 10); }
        const gate = new T.Group(); gate.position.copy(gq.p).addScaledVector(gn, -.78); gate.position.y += .6; gate.lookAt(gate.position.clone().add(gn)); g.add(gate);
        const bar = new T.Mesh(UNIT, gateMat); bar.scale.set(.12, .12, 1.6); bar.position.z = .8; bar.userData.gate = true; gate.add(bar);
        const lock = new T.Mesh(new T.TorusGeometry(.16, .05, 8, 20), gateMat); lock.position.z = .78; lock.userData.gate = true; gate.add(lock);
        // keys: a bow, a shaft and two teeth, spinning over the far end of each cul-de-sac
        const sFar = (60 + 150) * Math.PI / 180 * 1.1;
        const mkKey = (road, id) => { const f = road.at(sFar).p, k = new T.Group(), m = basic(th.goal);
          const bow = new T.Mesh(new T.TorusGeometry(.2, .06, 8, 24), m); bow.position.y = .32; k.add(bow);
          const sh = new T.Mesh(UNIT, m); sh.scale.set(.07, .5, .07); k.add(sh);
          for (const [y, w] of [[-.16, .16], [-.04, .12]]) { const tooth = new T.Mesh(UNIT, m); tooth.scale.set(w, .06, .06); tooth.position.set(w / 2, y, 0); k.add(tooth); }
          k.add(sprite(TEX.glow, 1.4, 1.4, th.goal, { opacity: .45, add: true }));
          k.position.copy(f); g.add(k); return { k, p: f.clone(), id, got: 0 }; };
        const K = [mkKey(sDrop, 's'), mkKey(nDrop, 'n')];
        L.view.updaters.push((tt, dt) => {
          for (const q of K) { q.k.rotation.y = tt * 1.6; q.k.position.y = q.p.y + .8 + .1 * Math.sin(tt * 2 + (q.id === 'n' ? 1 : 0));
            if (!keys[q.id] && L.wheel.position.distanceTo(q.p) < .7) { keys[q.id] = true; L.flash(`Picked up a key (${+keys.s + +keys.n} of 2)`); }
            if (keys[q.id]) { q.got = Math.min(1, q.got + dt * 2.5); q.k.scale.setScalar(Math.max(.001, 1 - q.got)); q.k.position.y += q.got * 1.5; } }
          const open = keys.s && keys.n; gate.rotation.z += clamp((open ? -Math.PI / 2 : 0) - gate.rotation.z, -2 * dt, 2 * dt);
          setTri(gateMat, open ? tone(th.goal) : th.mech);
          const pt = st => st.ang < 1 ? 'down' : st.ang > 89 ? 'up' : '…';
          L.say(`keys ${+keys.s + +keys.n} of 2 · gate ${open ? 'open' : 'shut'} · south points ${pt(SP)} · north points ${pt(NP)}`); });
        L.props.SP = SP; L.props.NP = NP; L.props.zones = { s: [SP.leaf, south, sDrop], n: [NP.leaf, north, nDrop, goal] };
      },
      spawn: L => ({ road: L.props.line, s: 1, dir: 1 }),
      solve(L, W, R) { R.cad = 85; const { SP, NP, keys, zones } = L.props, wp = L.wheel.position;
        const wantN = !keys.n || keys.s, wantS = keys.n && !keys.s;
        const drive = (P, z, want) => !z.includes(W.road) && wp.distanceTo(P.at) > 2.5 && (want ? P.ang > .5 : P.ang < 89.5);
        SP.m.set(drive(SP, zones.s, wantS)); NP.m.set(drive(NP, zones.n, wantN)); },
      center: [0, 2, 0], pts: [[-8.6, -3.6, -2.4], [7.6, 1, -2.4]], pad: .8,
      decor(L) { cloudLayer(L.view, L.th, '#FFFFFF', 4, .75, .55, .95, .2); } }
  ];

  /* ================= turntable studies: one machine, many branches ================= */
  // crossDisc: a flush disc carrying two opposing quarter curves between four ports (west, north, east, south).
  // State 0 joins W-N and E-S; a quarter turn joins N-E and S-W. One crank, four roads, every pairing reachable in two turns.
  function crossDisc(L, o) {
    const th = L.th, g = L.g, R = o.R || 2, base = o.base || 0, bg = new T.Group(); bg.position.copy(V(...o.center)); g.add(bg); bg.rotation.y = -base * Math.PI / 180;
    const mat = tri(th.idle, { fresh: true, side: true }), deckMat = tri(sp(th, 1), { side: true });
    CY(bg, 0, 0, R + .02, -.55, -.03, mat, 64);
    const rim = new T.Mesh(new T.RingGeometry(R - .12, R - .04, 64), basic(th.lane, { side: true })); rim.rotation.x = -Math.PI / 2; rim.position.y = -.02; bg.add(rim);
    const c1 = L.road(turtle(-R, 0, 0, 0).arc(R, 90).pts, { g: bg, mat: deckMat, th: .5 }), c2 = L.road(turtle(R, 0, 180, 0).arc(R, 90).pts, { g: bg, mat: deckMat, th: .5 });
    const [cx, cy, cz] = o.center; CY(g, cx, cy, R + .14, cz - 1.1, cz - .58, tri(th.mechDark || th.idle), 64);
    const st = { ang: 0, sweep: 1, roads: [c1, c2], R, center: V(...o.center) };
    st.port = k => { const a = (base + k * 90) * Math.PI / 180; return [cx + R * Math.cos(a), cy + R * Math.sin(a), cz]; };   // k: 0 W-side order is E,N,W,S by angle
    st.m = L.machine({ key: o.key, name: o.name, size: .6, place: h => { h.position.set(0, .02, 0); bg.add(h); },
      tick(dt, drive) {
        if (drive > 0) { st.ang += st.sweep * drive * 28; if (st.ang <= 0 || st.ang >= 90) { st.ang = clamp(st.ang, 0, 90); st.sweep *= -1; } }
        else { const tgt = st.ang > 45 ? 90 : 0; st.ang += clamp(tgt - st.ang, -60 * dt, 60 * dt); }
        bg.rotation.y = -(base + st.ang) * Math.PI / 180; setTri(mat, mixPal(th.idle, th.mech, clamp(this.bloom.e, 0, 1)));
        const off = Math.min(st.ang, 90 - st.ang); return drive > 0 ? .25 + .7 * Math.exp(-((off / 7) ** 2)) : 0; } });
    st.state = () => st.ang < .5 ? 0 : st.ang > 89.5 ? 1 : -1;
    return st;
  }
  // pairs for the cross disc (ports named by compass, base 0): state 0 W-N, E-S; state 1 N-E, S-W
  const CROSS = [{ W: 'N', N: 'W', E: 'S', S: 'E' }, { N: 'E', E: 'N', S: 'W', W: 'S' }];
  const DIRS = { E: [1, 0], N: [0, 1], W: [-1, 0], S: [0, -1] };

  // a small kit shared by the studies: pockets with keys, gates that branch off on the way back, posts
  function studyKit(L) {
    const th = L.th, g = L.g, K = [], gates = [], kit = { K, held: 0 }, postMat = tri(sp(th, 1));
    kit.post = (x, y, z) => CY(g, x, y, .14, Math.min(-2.4, z - 2.4), z - .25, postMat, 10);
    kit.pier = (x, y, z) => CY(g, x, y, .5, Math.min(-2.6, z - 2.6), z - .3, tri(sp(th, 0)), 24);
    kit.pocket = (x, y, h, z = 0, key = false) => { const td = turtle(x, y, h, z).fwd(.3).teardrop(1.1).fwd(.3), r = L.road(td.pts), hr = h * Math.PI / 180; kit.pier(x + 2.5 * Math.cos(hr), y + 2.5 * Math.sin(hr), z);
      if (key) { const p = r.at((60 + 150) * Math.PI / 180 * 1.1 + .6).p, k = new T.Group(), m = basic(th.goal);
        const bow = new T.Mesh(new T.TorusGeometry(.2, .06, 8, 24), m); bow.position.y = .32; k.add(bow); const sh = new T.Mesh(UNIT, m); sh.scale.set(.07, .5, .07); k.add(sh);
        for (const [yy, w] of [[-.16, .16], [-.04, .12]]) { const tooth = new T.Mesh(UNIT, m); tooth.scale.set(w, .06, .06); tooth.position.set(w / 2, yy, 0); k.add(tooth); }
        k.add(sprite(TEX.glow, 1.4, 1.4, th.goal, { opacity: .45, add: true })); k.position.copy(p); g.add(k); r.key = { k, p: p.clone(), got: false, t: 0 }; K.push(r.key); }
      return r; };
    kit.arm = (a, b) => { const r = L.road(L3(a, b, UP)); const n = Math.floor(Math.hypot(b[0] - a[0], b[1] - a[1]) / 3); for (let i = 1; i <= n; i++) { const f = i / (n + 1); kit.post(a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2]); } return r; };
    // the gate home: a branch off road r, 1.6 m from its far end, taken on the way back with every key
    kit.homeGate = (r, sg) => { const sG = r.L - 1.6, f = r.at(sG), h = Math.atan2(f.d.z, f.d.x) * 180 / Math.PI + 180;
      const gt = L.road(turtle(f.p.x, f.p.z, h, f.p.y).arc(2.5, sg * 90).fwd(2.4).pts, { goal: true, pal: sp(th, 2) }); const e = gt.S.at(-1).p; CY(g, e.x, e.z, .45, Math.min(-2.6, e.y - 2.4), e.y - .3, tri(sp(th, 0)), 20);
      r.forks.push({ s: sG, dir: -1, to: gt, toK: 0, when: () => kit.held === K.length, text: 'Every key, so the gate home opened' });
      const gq = gt.at(2), gd = gq.d, gn = new T.Vector3(-gd.z, 0, gd.x).normalize(), gateMat = tri(th.mech, { fresh: true });
      for (const k of [-.78, .78]) { const q = gq.p.clone().addScaledVector(gn, k); CY(g, q.x, q.z, .1, q.y - .3, q.y + .75, tri(th.mechDark || th.idle), 10); }
      const gate = new T.Group(); gate.position.copy(gq.p).addScaledVector(gn, -.78); gate.position.y += .6; gate.lookAt(gate.position.clone().add(gn)); g.add(gate);
      const bar = new T.Mesh(UNIT, gateMat); bar.scale.set(.12, .12, 1.6); bar.position.z = .8; bar.userData.gate = true; gate.add(bar);
      const lock = new T.Mesh(new T.TorusGeometry(.16, .05, 8, 20), gateMat); lock.position.z = .78; lock.userData.gate = true; gate.add(lock); gates.push({ gate, gateMat }); return gt; };
    kit.tick = () => L.view.updaters.push((tt, dt) => {
      for (const q of K) { q.k.rotation.y = tt * 1.6; q.k.position.y = q.p.y + .8 + .1 * Math.sin(tt * 2);
        if (!q.got && L.wheel.position.distanceTo(q.p) < .7) { q.got = true; kit.held++; L.flash(`Picked up a key (${kit.held} of ${K.length})`); }
        if (q.got) { q.t = Math.min(1, q.t + dt * 2.5); q.k.scale.setScalar(Math.max(.001, 1 - q.t)); q.k.position.y += q.t * 1.5; } }
      const open = kit.held === K.length; for (const G of gates) { G.gate.rotation.z += clamp((open ? -Math.PI / 2 : 0) - G.gate.rotation.z, -2 * dt, 2 * dt); setTri(G.gateMat, open ? tone(th.goal) : th.mech); }
      if (kit.say) L.say(kit.say()); });
    return kit;
  }
  // the next port the wheel should leave the cross disc by, to reach target port T from port X
  const crossWant = (X, T, cur) => { if (X === T) return null; for (const s of [0, 1]) if (CROSS[s][X] === T) return s; return cur >= 0 ? cur : 0; };

  const STUDIES = [
    { id: 'cross', name: 'The crossover', th: () => THEMES[0], cruise: [78, 92],
      hint: 'One disc, two curves, four roads. <b>Y</b> gives the disc a quarter turn: as drawn it joins west to north and east to south; turned, it joins north to east and south to west. Keys wait at the ends of the north and east roads. The gate home is on the south road, and you cannot get there from where you start without stopping somewhere on the way. Turn the disc while the wheel is out in a cul-de-sac.',
      build(L) { const P = L.props, kit = studyKit(L); P.kit = kit;
        const D = crossDisc(L, { center: [0, 0, 0], R: 2, key: 'y', name: 'Crossover' }); P.D = D;
        const len = { W: 6, N: 4.5, E: 4.5, S: 5.5 }; P.arms = {}; P.pockets = {};
        for (const k of ['W', 'N', 'E', 'S']) { const [dx, dy] = DIRS[k], a = [2 * dx, 2 * dy, 0], b = [(2 + len[k]) * dx, (2 + len[k]) * dy, 0];
          P.arms[k] = kit.arm(a, b); P.pockets[k] = kit.pocket(b[0], b[1], Math.atan2(dy, dx) * 180 / Math.PI, 0, k === 'N' || k === 'E'); }
        P.home = kit.homeGate(P.arms.S, 1);
        kit.say = () => `keys ${kit.held} of 2 · disc joins ${D.state() === 0 ? 'west–north, east–south' : D.state() === 1 ? 'north–east, south–west' : '…'}`; kit.tick();
        // a landmark behind it all
        B(L.g, -10.4, -9.4, -2.4, -8.6, -7.6, 1.6, tri(sp(L.th, 0))); at(L.g, new T.Mesh(new T.SphereGeometry(.85, 20, 12, 0, TAU, 0, Math.PI / 2), tri(L.th.mech)), -9.5, -8.5, 1.6); },
      spawn: L => ({ road: L.props.arms.W, s: 4.5, dir: -1 }),
      solve(L, W, Rd) { Rd.cad = 85; const P = L.props, kit = P.kit, D = P.D, wp = L.wheel.position;
        const T = !P.pockets.N.key.got ? 'N' : !P.pockets.E.key.got ? 'E' : 'S';
        let X = null; for (const k of ['W', 'N', 'E', 'S']) if (W.road === P.arms[k] || W.road === P.pockets[k] || (k === 'S' && W.road === P.home)) X = k;
        if (!X) { D.m.set(false); return; }   // on the disc: never turn
        const want = crossWant(X, T, D.state()), d = wp.distanceTo(D.center) - D.R, inward = W.road === P.arms[X] && W.dir < 0;
        const safe = W.road === P.pockets[X] || !inward || d > 4.5 || (D.m.on && d > 1.2);
        D.m.set(want !== null && D.state() !== want && safe); },
      center: [0, 0, 0], pts: [[-9, -9, -2.4], [9, 9, -2.4], [-9.5, -8.5, 3.6]], pad: .8,
      decor(L) { cloudLayer(L.view, L.th, '#FFFFFF', 4, .75, .55, .95, .2); } },

    { id: 'hub', name: 'Three-way hub', th: () => THEMES[0], cruise: [78, 92],
      hint: 'The terrace road ends at a hub. <b>A</b> swings its arm through three stops: north, east and south, each with a cul-de-sac. A crank lowers the north points (<b>Y</b>) for a third key. The gate home is on the south cul-de-sac road. Swing the hub while the wheel is away from it.',
      build(L) { const P = L.props, kit = studyKit(L); P.kit = kit; const th = L.th;
        const line = L.road(L3([-7, 0, 0], [3, 0, 0], UP)); P.line = line; for (const x of [-5.5, -2.5, 0.5]) kit.post(x, 0, 0);
        kit.pocket(-7, 0, 180);
        const pts = peelSwitch(L, { line, s: 7.5, dir: -1, side: -1, key: 'y', name: 'North points', text: 'Peeled off north' }); P.pts = pts;
        const st = turtle(pts.end[0], pts.end[1], pts.end[3], 0); st.arc(1.5, -45).fwd(2.4); const spur = L.road(st.pts); kit.post(st.pts[20].p[0], st.pts[20].p[1], 0);
        const sp1 = kit.pocket(st.x, st.y, 90, 0, true); P.spur = [pts.leaf, spur, sp1];
        const hub = turntable(L, { key: 'a', name: 'Hub', pivot: [3, 0, 0], len: 3, base: 0, open: 90, detents: [-90, 0, 90] }); P.hub = hub;
        const pE = kit.pocket(6, 0, 0, 0, true), pN = kit.pocket(3, 3, 90, 0, true);
        const sArm = L.road(L3([3, -3, 0], [3, -7.5, 0], UP)); kit.post(3, -5.2, 0); const pS = kit.pocket(3, -7.5, 270); P.home = kit.homeGate(sArm, 1);
        P.hubPockets = { 0: [pE], 90: [pN], '-90': [sArm, pS, P.home] }; P.keyAt = { E: pE, N: pN, spur: sp1 };
        kit.say = () => `keys ${kit.held} of 3 · hub ${Math.round(hub.ang) === 90 ? 'north' : Math.round(hub.ang) === -90 ? 'south' : Math.round(hub.ang) === 0 ? 'east' : '…'}`; kit.tick();
        B(L.g, -10.4, -10.4, -2.4, -8.6, -8.6, 1.6, tri(sp(th, 0))); at(L.g, new T.Mesh(new T.SphereGeometry(.85, 20, 12, 0, TAU, 0, Math.PI / 2), tri(th.mech)), -9.5, -9.5, 1.6); },
      spawn: L => ({ road: L.props.line, s: 3, dir: 1 }),
      solve(L, W, Rd) { Rd.cad = 85; const P = L.props, wp = L.wheel.position, hub = P.hub, k = P.keyAt;
        const tgt = !k.E.key.got ? { hub: 0 } : !k.spur.key.got ? { pts: true } : !k.N.key.got ? { hub: 90 } : { hub: -90 };
        const onHub = [hub.road, ...Object.values(P.hubPockets).flat()].includes(W.road), far = wp.distanceTo(hub.road.g.position) > 6 || (W.road === P.line && W.dir < 0);
        const at = [-90, 0, 90].find(d => Math.abs(hub.ang - d) < .5);
        hub.m.set(tgt.hub !== undefined && at !== tgt.hub && !onHub && (far || hub.m.on));
        const onSp = P.spur.includes(W.road), near = wp.distanceTo(P.pts.at) < 2.5;
        P.pts.m.set(!onSp && !near && (tgt.pts ? P.pts.ang > .5 : P.pts.ang < 89.5)); },
      center: [0, -1, 0], pts: [[-10, -10, -2.4], [9, 5, -2.4], [-9.5, -9.5, 3.6]], pad: .8,
      decor(L) { cloudLayer(L.view, L.th, '#FFFFFF', 4, .75, .55, .95, .2); } },

    { id: 'crosshub', name: 'Crossover to hub', th: () => THEMES[0], cruise: [78, 92],
      hint: 'The crossover again, but its east road runs into a hub. <b>Y</b> turns the crossover, <b>A</b> swings the hub through north, east and south. Two keys hide in the hub\'s pockets and one at the end of the north road. The gate home is on the south road.',
      build(L) { const P = L.props, kit = studyKit(L); P.kit = kit; const th = L.th;
        const D = crossDisc(L, { center: [0, 0, 0], R: 2, key: 'y', name: 'Crossover' }); P.D = D;
        const len = { W: 6, N: 4.5, E: 3.5, S: 5.5 }; P.arms = {}; P.pockets = {};
        for (const k of ['W', 'N', 'S']) { const [dx, dy] = DIRS[k], a = [2 * dx, 2 * dy, 0], b = [(2 + len[k]) * dx, (2 + len[k]) * dy, 0];
          P.arms[k] = kit.arm(a, b); P.pockets[k] = kit.pocket(b[0], b[1], Math.atan2(dy, dx) * 180 / Math.PI, 0, k === 'N'); }
        P.arms.E = kit.arm([2, 0, 0], [5.5, 0, 0]);
        const hub = turntable(L, { key: 'a', name: 'Hub', pivot: [5.5, 0, 0], len: 3, base: 0, open: 90, detents: [-90, 0, 90] }); P.hub = hub;
        const pE = kit.pocket(8.5, 0, 0), pN = kit.pocket(5.5, 3, 90, 0, true), pS = kit.pocket(5.5, -3, 270, 0, true);
        P.hubRoads = [hub.road, pE, pN, pS]; P.keyAt = { N: P.pockets.N, hubN: pN, hubS: pS };
        P.home = kit.homeGate(P.arms.S, 1);
        kit.say = () => `keys ${kit.held} of 3 · crossover ${D.state() === 0 ? 'W–N, E–S' : D.state() === 1 ? 'N–E, S–W' : '…'} · hub ${Math.round(hub.ang) === 90 ? 'north' : Math.round(hub.ang) === -90 ? 'south' : Math.round(hub.ang) === 0 ? 'east' : '…'}`; kit.tick();
        B(L.g, -10.4, -10.4, -2.4, -8.6, -8.6, 1.6, tri(sp(th, 0))); at(L.g, new T.Mesh(new T.SphereGeometry(.85, 20, 12, 0, TAU, 0, Math.PI / 2), tri(th.mech)), -9.5, -9.5, 1.6); },
      spawn: L => ({ road: L.props.arms.W, s: 4.5, dir: -1 }),
      solve(L, W, Rd) { Rd.cad = 85; const P = L.props, D = P.D, hub = P.hub, wp = L.wheel.position, k = P.keyAt;
        const goal = !k.N.key.got ? { port: 'N' } : !k.hubN.key.got ? { port: 'E', hub: 90 } : !k.hubS.key.got ? { port: 'E', hub: -90 } : { port: 'S' };
        let X = null; for (const q of ['W', 'N', 'S']) if (W.road === P.arms[q] || W.road === P.pockets[q] || (q === 'S' && W.road === P.home)) X = q;
        if (W.road === P.arms.E || P.hubRoads.includes(W.road)) X = 'E';
        // the hub: swing it while the wheel is west of the crossover or out in a far pocket
        const onHub = P.hubRoads.includes(W.road), at = [-90, 0, 90].find(d => Math.abs(hub.ang - d) < .5), hubFar = wp.distanceTo(hub.road.g.position) > 5.5;
        hub.m.set(goal.hub !== undefined && at !== goal.hub && !onHub && W.road !== P.arms.E && (hubFar || hub.m.on));
        if (!X) { D.m.set(false); return; }
        const want = crossWant(X, goal.port, D.state()), d = wp.distanceTo(D.center) - D.R, inward = W.road === P.arms[X] && W.dir < 0;
        const parked = X === 'E' ? onHub : W.road === P.pockets[X];
        const safe = parked || (!inward && X !== 'E') || (X === 'E' && W.road === P.arms.E && W.dir > 0) || d > 4.5 || (D.m.on && d > 1.2);
        D.m.set(want !== null && D.state() !== want && safe); },
      center: [0, 0, 0], pts: [[-9, -9, -2.4], [11, 8, -2.4], [-9.5, -9.5, 3.6]], pad: .8,
      decor(L) { cloudLayer(L.view, L.th, '#FFFFFF', 4, .75, .55, .95, .2); } }
  ];

  const mulberry = a => () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const hd = t => t.h * 180 / Math.PI;
  /* ================= level generator v9: buttonless cadence lifts, no light machines. (v7: every machine, no points.) Extra machines chain off turntable stops instead of peeling spurs off the terrace ================= */
  // Feedback folded in (v6): points are gone; a second turntable or hub sits at the end of an arm road leaving a stop; roads may barely cross on screen;
  // the camera must turn at least twice and at least two keys must sit in pockets only perspective reaches; machine centres are painted in their button colour.
  // v4's layouts, plus a camera crank with two views (front and a quarter turn). A perspective branch ('pview') leaves a turntable tip or a lift floor:
  // for each view it may have a far road placed straight behind the tip along that view's line of sight, so the two meet on screen only in that view.
  // Feedback folded in: the camera only appears in levels built around it; nothing may hide behind a lift's frame on screen; machine badges are small dots.
  // Layout: a terrace road whose ends, and the ends of spurs peeled off it by points, can be pockets (teardrop cul-de-sacs),
  // two-stop turntables, three-stop hubs or crossover discs. Machine stops and disc ports lead to branches: a pocket,
  // an arm road ending in a pocket, or (zone 2 on) a pier whose end meets a lower island road only on screen.
  // The plan carries an abstract track graph next to the geometry, and a solver searches it: the wheel parks in a pocket,
  // the rider sets the machines, the wheel rides to the next pocket. Shortest ride wins; idling must never win or fall.
  const G3 = { R_PEEL: 3, R_TURN: 1.5, TEAR: 1.25, ARM: 3, CR: 2, GATE_BACK: 20, LETTERS: 'yabz', DROP: 3, STEP: 1.6 };
  const TURNS = { tt2: .35, hub3: .3, cross: .2 };
  const TT_ONLY = { tt2: .6, hub3: .4 };
  const CHAIN = { tt2: .75, hub3: .25 };
  const TIERS = [
    { id: 'cross', zone: 3, label: 'Crossover discs', theme: 2, special: 'cross', spurs: [0, 0], mt: [2, 3], machines: [2, 3], keys: [2, 3], ends: TURNS, spurEnds: TURNS, spanP: null, island: 0, keygate: .4, legs: [5, 14] },
    { id: 'lift', zone: 2, label: 'Cadence lifts', theme: 1, special: 'lift', halfAdd: 4, spurs: [0, 0], mt: [2, 3], machines: [2, 3], keys: [2, 3], ends: TURNS, spurEnds: TURNS, spanP: null, island: 0, keygate: .4, legs: [5, 14] },
    { id: 'seesaw', zone: 4, label: 'Spring see-saws', theme: 3, special: 'seesaw', halfAdd: 4, spurs: [0, 0], mt: [2, 3], machines: [2, 3], keys: [2, 3], ends: TURNS, spurEnds: TURNS, spanP: null, island: 0, keygate: .4, legs: [5, 14] },
    { id: 'island', zone: 1, label: 'Piers that meet islands', theme: 0, special: null, spurs: [0, 0], mt: [2, 3], machines: [2, 3], keys: [2, 3], ends: TURNS, spurEnds: TURNS, spanP: null, island: 1, keygate: .4, legs: [5, 14] },
    { id: 'lift-views', zone: 2, label: 'Lifts with the camera', theme: 1, camera: true, pv: .5, special: 'lift', halfAdd: 7, spurs: [0, 0], mt: [2, 3], machines: [3, 4], keys: [2, 3], ends: TT_ONLY, spurEnds: TT_ONLY, spanP: null, island: 0, keygate: .3, legs: [5, 14] },
    { id: 'seesaw-chain', zone: 4, label: 'See-saws off a turntable', theme: 3, special: null, must: 'seesaw', chain: { seesaw: 1 }, halfAdd: 3, spurs: [0, 0], mt: [3, 3], machines: [3, 3], keys: [2, 3], ends: TT_ONLY, spurEnds: TT_ONLY, spanP: null, island: 0, keygate: .4, legs: [5, 14] },
    { id: 'lift-chain-views', zone: 2, label: 'Lifts off a turntable, with the camera', theme: 1, camera: true, pv: .5, special: null, must: 'lift', chain: { lift: 1 }, halfAdd: 4, spurs: [0, 0], mt: [3, 3], machines: [4, 4], keys: [2, 3], ends: TT_ONLY, spurEnds: TT_ONLY, spanP: null, island: 0, keygate: .3, legs: [5, 14] },
    { id: 'lift-chain', zone: 2, label: 'Lifts off a turntable', theme: 1, special: null, must: 'lift', chain: { lift: 1 }, halfAdd: 3, spurs: [0, 0], mt: [3, 3], machines: [3, 3], keys: [2, 3], ends: TT_ONLY, spurEnds: TT_ONLY, spanP: null, island: 0, keygate: .4, legs: [5, 14] },
    { id: 'cross-views', zone: 3, label: 'Crossover discs with the camera', theme: 2, camera: true, pv: .5, special: 'cross', spurs: [0, 0], mt: [2, 3], machines: [3, 4], keys: [2, 3], ends: TURNS, spurEnds: TURNS, spanP: null, island: 0, keygate: .3, legs: [5, 14] },
    { id: 'seesaw-views', zone: 4, label: 'See-saws off a turntable, with the camera', theme: 3, camera: true, pv: .5, special: null, must: 'seesaw', chain: { seesaw: 1 }, halfAdd: 4, spurs: [0, 0], mt: [3, 3], machines: [4, 4], keys: [2, 3], ends: TT_ONLY, spurEnds: TT_ONLY, spanP: null, island: 0, keygate: .3, legs: [5, 14] },
    { id: 'island-views', zone: 1, label: 'Piers and islands, with the camera', theme: 0, camera: true, pv: .5, special: null, spurs: [0, 0], mt: [2, 3], machines: [3, 4], keys: [2, 3], ends: TT_ONLY, spurEnds: TT_ONLY, spanP: null, island: 1, keygate: .3, legs: [5, 14] },
  ];
  // the camera looks down viewDir(yaw); a road placed at p - k * viewDir meets p on screen only at that yaw. scrV is the screen position at a yaw
  const viewDir5 = deg => { const a = deg * Math.PI / 180; return [Math.cos(a) + Math.sin(a), Math.cos(a) - Math.sin(a), 1]; };
  const behind5 = (p, deg, k) => { const d = viewDir5(deg); return [p[0] - k * d[0], p[1] - k * d[1], p[2] - k * d[2]]; };
  const scrV = (p, deg) => { const a = deg * Math.PI / 180; return scr3(p[0] * Math.cos(a) - p[1] * Math.sin(a), p[0] * Math.sin(a) + p[1] * Math.cos(a), p[2]); };
  const depthV = (p, deg) => { const d = viewDir5(deg); return (p[0] * d[0] + p[1] * d[1] + p[2] * d[2]) / Math.sqrt(3); };
  const scr3 = (x, y, z) => [(x - y) / Math.SQRT2, (2 * z - x - y) / Math.sqrt(6)];
  const dirv = a => [Math.cos(a * Math.PI / 180), Math.sin(a * Math.PI / 180)];
  const plen = pts => { let s = 0; for (let i = 1; i < pts.length; i++) s += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1], pts[i][2] - pts[i - 1][2]); return s; };

  let plan3Why = '', CROSS_MAX = .03;
  function planLevel3(seed, tier) {
    const Rn = mulberry(seed * 104729 + TIERS.indexOf(tier) * 7907 + 3), pick = a => a[Math.floor(Rn() * a.length)], rr = (a, b) => a + Rn() * (b - a), chance = p => Rn() < p;
    const wpick = w => { let t = Rn() * Object.values(w).reduce((a, b) => a + b, 0); for (const [k, v] of Object.entries(w)) { if ((t -= v) <= 0) return k; } return Object.keys(w)[0]; };
    const R = [], links = new Map(), machines = [], joinsAt = [], discs = [], ghosts = [];
    const plan = { seed, tier, R, links, machines, joinsAt, discs, ghosts, spurs: [], pockets: [], hosts: [], spans: [], boxes: [], posts: [], views: tier.camera ? [0, -90] : [0], cam: null };
    const road = (pts, o = {}) => { const r = { id: R.length, pts: pts.map(q => q.p || q), forks: [], joins: [], ...o }; r.len = plen(r.pts); R.push(r); return r; };
    const link = (a, ea, b, eb) => { links.set(`${a.id}:${ea}`, [b.id, eb]); };
    const pocketAt = (x, y, h, z, kind, o = {}) => { const td = turtle(x, y, h, z).fwd(.3).teardrop(G3.TEAR).fwd(.3); const p = road(td.pts, { kind: 'pocket', pocket: true, where: kind, heading: h, ...o }); plan.pockets.push(p); joinsAt.push([x, y, z]); return p; };
    // attach a pocket to the end e of road r (both directions)
    const capWithPocket = (r, e, kind) => { const P = r.pts[e ? r.pts.length - 1 : 0], Q = r.pts[e ? r.pts.length - 2 : 1], h = Math.atan2(P[1] - Q[1], P[0] - Q[0]) * 180 / Math.PI;
      const p = pocketAt(P[0], P[1], h, P[2], kind); link(r, e, p, 0); link(p, 1, r, e); return p; };
    // a branch leaving a tip (point + heading): returns { r: road entered at end 0, exit: the end that comes back to the tip }
    const branch = (tip, h, kind, where) => {
      if (kind === 'pocket') { const p = pocketAt(tip[0], tip[1], h, tip[2], where); return { r: p, inEnd: 0, outEnd: 1 }; }
      if (kind === 'light' || kind === 'dark') {   // arm, a span the lamp decides, arm, pocket
        const dv = dirv(h), P1 = [tip[0] + rr(1.4, 2) * dv[0], tip[1] + rr(1.4, 2) * dv[1], tip[2]], sl = kind === 'light' ? rr(2, 2.6) : rr(1.3, 1.8), P2 = [P1[0] + sl * dv[0], P1[1] + sl * dv[1], tip[2]], a2 = rr(1.6, 2.4), P3 = [P2[0] + a2 * dv[0], P2[1] + a2 * dv[1], tip[2]];
        const si = plan.spans.length, arm1 = road(L3(tip, P1, UP), { kind: 'arm', spanEnd: { span: si, end: 1 } }), arm2 = road(L3(P2, P3, UP), { kind: 'arm', host: true, spanEnd: { span: si, end: 0 } });
        const S = { kind, a: arm1.id, b: arm2.id, P1, P2, h, lamp: -1 }; plan.spans.push(S);
        if (kind === 'light') S.road = road(L3(P1, P2, UP), { kind: 'light', span: si }).id;
        capWithPocket(arm2, 1, `${where}, past a ${kind === 'light' ? 'light bridge' : 'dark gap'}`); plan.hosts.push(arm2); joinsAt.push(tip, [...P1, 2], [...P2, 2]);
        return { r: arm1, inEnd: 0, outEnd: 0 }; }
      const L = kind === 'chain' ? rr(4.2, 5.6) : rr(3.2, 4.2), e = [tip[0] + L * dirv(h)[0], tip[1] + L * dirv(h)[1], tip[2]], arm = road(L3(tip, e, UP), { kind: kind === 'pier' ? 'pier' : kind === 'chain' ? 'chain' : 'arm', host: kind === 'arm' });
      if (kind === 'chain') { joinsAt.push(tip); machineAt(wpick(tier.chain || CHAIN), arm, 1, h, 'chain', 1); return { r: arm, inEnd: 0, outEnd: 0 }; }
      joinsAt.push(tip);
      if (kind === 'arm') { capWithPocket(arm, 1, where); plan.hosts.push(arm); }
      else { const k = G3.DROP, fs = [e[0] - k, e[1] - k, e[2] - k], fe = [fs[0] + 3 * dirv(h)[0], fs[1] + 3 * dirv(h)[1], fs[2]], far = road(L3(fs, fe, UP), { kind: 'far', far: true });
        link(arm, 1, far, 0); link(far, 0, arm, 1); capWithPocket(far, 1, 'island'); plan.island = { pier: arm.id, far: far.id, e, fs }; joinsAt.push([...e, 1.4], [...fs, 1.4]); }
      return { r: arm, inEnd: 0, outEnd: 0 }; };
    // a perspective branch: from a tip, nothing in 3D; for each view, maybe a far road straight behind the tip along that view's line of sight
    const pviewAt = (tip, h, where, tag) => { const out = [null, null], vs = chance(.6) ? [0, 1] : chance(.5) ? [0] : [1]; joinsAt.push([...tip, 1.2]);
      for (const v of vs) { const lf = tag.lift !== undefined, k = lf ? rr(2.6, 3.6) + (tag.f - 1) * 3.4 : rr(2.6, 5.2), S = behind5(tip, plan.views[v], k), sg = lf ? (tag.f % 2 ? 1 : -1) * (v ? -1 : 1) : pick([-1, 1]);
        const t = turtle(S[0], S[1], h, S[2]).fwd(tag.lift !== undefined ? rr(1.3, 2) : rr(.8, 1.3)).arc(1.1, sg * 90).fwd(rr(1.6, 2.6));
        const fr = road(t.pts, { kind: 'pfar', host: true, pjoin: { ...tag, v } }); plan.hosts.push(fr); capWithPocket(fr, 1, `${where}, seen from the ${v ? 'side' : 'front'}`); out[v] = fr.id; joinsAt.push([...S, 1.6]); }
      return out; };
    let islands = tier.island >= 1 ? 1 : chance(tier.island) ? 1 : 0, chainLeft = 0;
    const branchKind = () => { if (islands > 0 && chance(.35)) { islands--; return 'pier'; } if (tier.spanP) { const u = Rn(); if (u < tier.spanP.light) return 'light'; if (u < tier.spanP.light + tier.spanP.dark) return 'dark'; } return chance(.5) ? 'pocket' : 'arm'; };
    // a road end that turns off a machine port: out a little, a quarter turn, then on to a pocket or a branch
    const portRoad = (P, h, side, o) => { const t = turtle(P[0], P[1], h, P[2]).fwd(.6).arc(1.2, side * 90).fwd(rr(1.6, 2.6)); const fr = road(t.pts, { host: true, ...o }); plan.hosts.push(fr);
      const k = branchKind(); if (k === 'light' || k === 'dark') { const b = branch([t.x, t.y, P[2]], hd(t), k, o.where); link(fr, 1, b.r, b.inEnd); link(b.r, b.outEnd, fr, 1); } else capWithPocket(fr, 1, o.where); return fr; };
    // a machine at a road end: r's end e sits at the pivot (turntables) or on the disc's back port (crossovers)
    const machineAt = (type, r, e, base, where, depth = 0) => {
      const P = r.pts[e ? r.pts.length - 1 : 0];
      if (type === 'lift') {   // a cul-de-sac deck on a water column; the road end is its ground floor, higher floors leave the same mouth
        const n = pick([2, 3]), step = G3.STEP, m = { i: machines.length, type: 'lift', J: P, base, step, n, def: n, floors: [], host: r.id }; machines.push(m);
        const deck = road(turtle(P[0], P[1], base, P[2]).fwd(1.2).teardrop(1).fwd(1.2).pts, { kind: 'pocket', pocket: true, where: 'lift', heading: base, liftDeck: m.i }); plan.pockets.push(deck); m.deck = deck.id;
        r.liftPort = { m: m.i, f: 0, end: e }; m.floors[0] = { r: r.id, end: e }; joinsAt.push([...P, 3.4]);
        const sides = chance(.5) ? [1, -1] : [-1, 1];
        for (let f = 1; f < n; f++) { if (tier.camera) { m.floors[f] = { pv: pviewAt([P[0], P[1], P[2] + f * step], base + 180, 'up the lift', { lift: m.i, f }) }; continue; }
          const fr = portRoad([P[0], P[1], P[2] + f * step], base + 180, sides[f - 1], { kind: 'floor', where: 'up the lift', liftPort: { m: m.i, f, end: 0 } }); m.floors[f] = { r: fr.id, end: 0 }; joinsAt.push([P[0], P[1], P[2] + f * step, 3]); }
        plan.boxes.push({ J: P, base, x0: .3, x1: Math.max(...deck.pts.map(q => (q[0] - P[0]) * Math.cos(base * Math.PI / 180) + (q[1] - P[1]) * Math.sin(base * Math.PI / 180))) + 1.25, half: Math.max(...deck.pts.map(q => Math.abs(-(q[0] - P[0]) * Math.sin(base * Math.PI / 180) + (q[1] - P[1]) * Math.cos(base * Math.PI / 180)))) + .6, z0: P[2] - 2.4, z1: P[2] + 3 * step + 1.2, own: deck.id });
        return m; }
      if (type === 'seesaw') {   // a beam on a pivot: at rest it joins the low road here to the high road at the far end; wound, the high road here to the low road there
        const a = Math.asin(1 / 2.5), X = 2.5 * Math.cos(a), dv = dirv(base), z0 = P[2], at = (k, z) => [P[0] + k * dv[0], P[1] + k * dv[1], z];
        const m = { i: machines.length, type: 'seesaw', base, P, X, def: 0, center: at(X, z0 + 1), host: r.id, ports: {} }; machines.push(m);
        const beam = road(L3(at(0, z0), at(2 * X, z0 + 2), UP), { kind: 'beam', beam: m.i }); m.beam = beam.id;
        m.ghost = road(L3(at(0, z0 + 2), at(2 * X, z0), UP), { kind: 'beam', ghost: true, beamOf: m.i }).id;
        r.ssPort = { m: m.i, port: 'LW', end: e }; m.ports.LW = { r: r.id, end: e };
        const sd = chance(.5) ? 1 : -1;
        // the far end: a spiral cul-de-sac that winds down from the high end to the low end, where you wind the spring
        const t = turtle(...at(2 * X, z0 + 2).slice(0, 2), base, z0 + 2); t.grade = -2 / lollipopLen(1, 1.2); t.fwd(1).teardrop(1.2).fwd(1);
        const spi = road(t.pts, { kind: 'pocket', pocket: true, where: 'see-saw spiral', heading: base, spiral: m.i, ssEnds: { 0: 'HE', 1: 'LE' } }); plan.pockets.push(spi); m.ports.HE = { r: spi.id, end: 0 }; m.ports.LE = { r: spi.id, end: 1 }; m.spiral = spi.id;
        const hw = portRoad(at(0, z0 + 2), base + 180, sd, { kind: 'port', where: 'up the see-saw', ssPort: { m: m.i, port: 'HW', end: 0 } }); m.ports.HW = { r: hw.id, end: 0 };
        joinsAt.push([...at(0, z0), 3.2], [...at(2 * X, z0), 3.2], [...at(X, z0 + 1), 2.6]);
        const sup = at(X, z0); plan.posts.push({ p: [sup[0] - .85 * dv[1] * sd, sup[1] + .85 * dv[0] * sd, z0], top: z0 + 1.3, own: m.i });
        return m; }
      if (type === 'tt2' || type === 'hub3') {
        const stops = type === 'hub3' ? [-90, 0, 90] : [0, pick([-90, 90])], m = { i: machines.length, type: 'tt', hub: type === 'hub3', pivot: P, base, stops, def: stops.indexOf(0), branch: [], host: r.id, depth }; machines.push(m);
        const arm = road(L3(P, [P[0] + G3.ARM * dirv(base)[0], P[1] + G3.ARM * dirv(base)[1], P[2]], UP), { kind: 'tt-arm', tt: m.i }); m.arm = arm.id;
        link(r, e, arm, 0); link(arm, 0, r, e); joinsAt.push([...P, 3.4]);
        stops.forEach((a, i) => { const h = base + a, tip = [P[0] + G3.ARM * dirv(h)[0], P[1] + G3.ARM * dirv(h)[1], P[2]];
          if (chainLeft > 0 && !depth && chance(.55)) { chainLeft--; const b = branch(tip, h, 'chain', 'chain'); b.r.tipOf = { m: m.i, i, outEnd: b.outEnd }; m.branch[i] = b.r.id; }
          else if (tier.camera && chance(tier.pv)) { (m.pv = m.pv || [])[i] = pviewAt(tip, h, type === 'hub3' ? 'hub' : 'turntable', { m: m.i, i }); m.branch[i] = -1; }
          else { const b = branch(tip, h, branchKind(), type === 'hub3' ? 'hub' : 'turntable'); b.r.tipOf = { m: m.i, i, outEnd: b.outEnd }; m.branch[i] = b.r.id; }
          if (a !== 0) ghosts.push({ piv: P, base, open: a }); });
        return m; }
      const m = { i: machines.length, type: 'cross', base, def: 0, R: G3.CR, ext: [], host: r.id }; machines.push(m);
      const c = [P[0] + G3.CR * dirv(base)[0], P[1] + G3.CR * dirv(base)[1], P[2]]; m.center = c; discs.push({ c, R: G3.CR });
      const port = k => [c[0] + G3.CR * dirv(base + 90 * k)[0], c[1] + G3.CR * dirv(base + 90 * k)[1], c[2]];
      // curves at state 0 (for the geometry checks): c1 from port 2 to port 1, c2 from port 0 to port 3
      const loc = (pts) => pts.map(q => { const [x, y] = q.p, a = base * Math.PI / 180; return [c[0] + x * Math.cos(a) - y * Math.sin(a), c[1] + x * Math.sin(a) + y * Math.cos(a), c[2]]; });
      const c1 = road(loc(turtle(-G3.CR, 0, 0, 0).arc(G3.CR, 90).pts), { kind: 'curve', curve: { m: m.i, c: 0 } }), c2 = road(loc(turtle(G3.CR, 0, 180, 0).arc(G3.CR, 90).pts), { kind: 'curve', curve: { m: m.i, c: 1 } });
      m.curves = [c1.id, c2.id]; joinsAt.push([...c, G3.CR + 2.4]);
      m.ext[2] = { r: r.id, inEnd: e, outEnd: e };
      for (const k of [0, 1, 3]) { const ck = chainLeft > 0 && !depth && chance(.5) ? (chainLeft--, 'chain') : branchKind(), b = branch(port(k), base + 90 * k, ck, 'crossover'); m.ext[k] = { r: b.r.id, inEnd: b.inEnd, outEnd: b.outEnd }; b.r.extOf = { m: m.i, k, outEnd: b.outEnd }; }
      r.extOf = { m: m.i, k: 2, outEnd: e };
      return m; };

    // --- the terrace road and its ends
    const nSp = Math.round(rr(tier.spurs[0], tier.spurs[1] + .49)), half = Math.round(rr(4.5 + 1.4 * nSp, 6 + 1.7 * nSp) * 2) / 2 + (tier.halfAdd ?? 3);
    const line = road(L3([-half, 0, 0], [half, 0, 0], UP), { kind: 'line' }); plan.line = line.id; plan.half = half;
    // aim for the tier's machine count: the spurs' points, plus turn machines on just enough of the ends
    const target = Math.round(rr(tier.mt[0], tier.mt[1] + .49)), extra = Math.min(2, target - nSp); chainLeft = target - nSp - extra; if (extra < 0) return (plan3Why = 'machine count', null);
    const slots = Array.from({ length: 2 + nSp }, (_, i) => i); for (let i = slots.length - 1; i > 0; i--) { const j = Math.floor(Rn() * (i + 1)); [slots[i], slots[j]] = [slots[j], slots[i]]; }
    const mSlot = new Set(slots.slice(0, extra)), noPocket = w => Object.fromEntries(Object.entries(w).filter(([k]) => k !== 'pocket'));
    const special = tier.special === 'mix' ? pick(['lift', 'seesaw']) : tier.special === 'mix5' ? pick(['lift', 'hub3']) : tier.special; plan.special = special; if (special && !extra) return (plan3Why = 'no slot for the special machine', null);
    const kindFor = (i, w) => !mSlot.has(i) ? 'pocket' : special && i === slots[0] ? special : wpick(noPocket(w));
    const endKinds = { W: kindFor(0, tier.ends), E: kindFor(1, tier.ends) };
    for (const [k, sg] of [['W', -1], ['E', 1]]) { const e = sg > 0 ? 1 : 0, base = sg > 0 ? 0 : 180;
      if (endKinds[k] === 'pocket') { const td = turtle(sg * half, 0, base, 0).fwd(.4).teardrop(G3.TEAR).fwd(.4), p = road(td.pts, { kind: 'pocket', pocket: true, where: 'line end', heading: base }); plan.pockets.push(p); link(line, e, p, 0); link(p, 1, line, e); joinsAt.push([sg * half, 0, 0]); }
      else machineAt(endKinds[k], line, e, base, 'line end'); }
    // --- spurs
    const PEEL = G3.R_PEEL * Math.SQRT1_2 + G3.R_TURN * (1 - Math.SQRT1_2), forks = [], spurKinds = [];
    for (let i = 0; i < nSp; i++) spurKinds.push(kindFor(2 + i, tier.spurEnds));
    for (let i = 0; i < nSp; i++) { let ok = false; const big = spurKinds[i] !== 'pocket';
      for (let t = 0; t < 80 && !ok; t++) { const X = Math.round(rr(-half + 1.2, half - 1.2) * 2) / 2, side = chance(.5) ? 1 : -1, dir = chance(.5) ? 1 : -1, x0 = X - PEEL * dir, span = [Math.min(x0, x0 + 2.12 * dir) - .4, Math.max(x0, x0 + 2.12 * dir) + .4];
        ok = span[0] > -half + .4 && span[1] < half - .4 && forks.every(f => (f.span[1] < span[0] || span[1] < f.span[0]) && Math.abs(f.x0 - x0) > 4 && Math.abs(f.X - X) > (f.side === side ? (big || f.big ? 9 : 4.8) : 1.2));
        if (ok) forks.push({ X, side, dir, x0, span, big, kind: spurKinds[i] }); }
      if (!ok) return (plan3Why = 'no room for spurs', null); }
    forks.sort((a, b) => a.x0 - b.x0);
    for (const f of forks) {
      const { side, dir, x0, kind } = f, ps = side * dir, h0 = dir > 0 ? 0 : 180, m = { i: machines.length, type: 'points', def: 0 }; machines.push(m);
      const lf = turtle(x0, 0, h0, -.004).arc(G3.R_PEEL, ps * 45), P1 = [lf.x, lf.y, 0];
      const t = turtle(P1[0], P1[1], h0 + ps * 45, 0); t.arc(G3.R_TURN, ps * 45); t.fwd(rr(1.4, 3)); if (chance(.3)) { const sg = pick([-1, 1]); t.arc(G3.R_TURN, sg * 90).fwd(rr(.8, 1.8)).arc(G3.R_TURN, -sg * 90); } t.fwd(2.8);
      const leaf = road(lf.pts, { kind: 'leaf', points: m.i }), spur = road(t.pts, { kind: 'spur', host: true, points: m.i });
      m.leaf = leaf.id; m.spur = spur.id; m.s = x0 + half; m.dir = dir; m.side = side; m.x0 = x0; m.ps = ps; m.P1 = P1; m.h1 = h0 + ps * 45;
      line.forks.push({ s: x0 + half, dir, to: leaf.id, toK: 0, pts: m.i });
      leaf.joins.push({ k: 0, to: line.id, s: x0 + half, dir: -dir }); link(leaf, 1, spur, 0); link(spur, 0, leaf, 1);
      joinsAt.push([x0, 0, 0], P1); plan.hosts.push(spur); plan.spurs.push({ m: m.i, side, dir, x0, kind });
      const H = hd(t);
      if (kind === 'pocket') { if (tier.spanP && chance(.6)) { const b = branch([t.x, t.y, 0], H, chance(.65) ? 'light' : 'dark', 'spur end'); link(spur, 1, b.r, b.inEnd); link(b.r, b.outEnd, spur, 1); } else capWithPocket(spur, 1, 'spur end'); }
      else machineAt(kind, spur, 1, H, 'spur end');
    }
    // --- gates: the gate home on one host road, sometimes a key gate on another; both branch off on the way back
    if (chainLeft > 0) return (plan3Why = 'no stop free for a chained turntable', null);
    const hosts = plan.hosts.filter(h => h.len >= 3.2); if (!hosts.length) return (plan3Why = 'no host', null);
    const gateOn = (h, kind) => { const P = h.pts, gi = P.length - 1 - G3.GATE_BACK; if (gi < 2) return null; const a = P[gi - 1], b = P[gi], hb = Math.atan2(a[1] - b[1], a[0] - b[0]) * 180 / Math.PI, sg = pick([-1, 1]);
      const s = plen(P.slice(0, gi + 1)), gt = turtle(b[0], b[1], hb, b[2]).arc(2.5, sg * 90); joinsAt.push([...b, 3.4]);
      if (kind === 'home') { gt.fwd(2.4); const g = road(gt.pts, { kind: 'goal', goal: true }); h.forks.push({ s, dir: -1, to: g.id, toK: 0, gate: 'all' }); plan.home = { host: h.id, gi, road: g.id }; return g; }
      gt.fwd(1.2); const br = road(gt.pts, { kind: 'branch' }); br.joins.push({ k: 0, to: h.id, s, dir: -1 }); const p = capWithPocket(br, 1, 'behind a key gate'); p.gated = true;
      h.forks.push({ s, dir: -1, to: br.id, toK: 0, gate: 'need' }); plan.keygate = { host: h.id, gi, road: br.id, pocket: p.id }; return br; };
    const hh = pick(hosts); if (!gateOn(hh, 'home')) return (plan3Why = 'gate host too short', null);
    const others = hosts.filter(h => h !== hh); if (others.length && chance(tier.keygate)) gateOn(pick(others), 'key');
    // --- keys
    const nKeys = Math.round(rr(tier.keys[0], tier.keys[1] + .49)), kg = plan.keygate ? R[plan.keygate.pocket] : null;
    const pool = plan.pockets.filter(p => !p.gated && p.liftDeck === undefined && p.spiral === undefined); for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Rn() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    // prefer pockets behind machines and on islands over the line ends
    pool.sort((a, b) => (a.where === 'line end') - (b.where === 'line end') || /seen from/.test(b.where) - /seen from/.test(a.where));
    const chosen = kg ? [kg, ...pool.slice(0, nKeys - 1)] : pool.slice(0, nKeys); if (chosen.length < 2) return (plan3Why = 'too few pockets', null);
    for (const p of chosen) p.key = true; if (kg) kg.need = chosen.length - 1 >= 2 && chance(.5) ? 2 : 1;
    plan.nKeys = chosen.length;
    // --- lamps: one per light bridge; each dark gap belongs to one of them (its lantern shows the gap is real)
    const lights = plan.spans.filter(S => S.kind === 'light'), darks = plan.spans.filter(S => S.kind === 'dark');
    if (lights.length > 2) return (plan3Why = 'too many light bridges', null); if (darks.length && !lights.length) return (plan3Why = 'dark gap with no lamp', null);
    if (tier.needLamp && !lights.length) return (plan3Why = 'no lamp', null); if (darks.length > lights.length) return (plan3Why = 'too many dark gaps', null);
    lights.forEach((S, k) => { const m = { i: machines.length, type: 'lamp', def: 0, spans: [plan.spans.indexOf(S)], no: k }; machines.push(m); S.lamp = m.i; });
    darks.forEach((S, k) => { const m = machines.find(m => m.type === 'lamp' && m.spans.length === 1 && m.no === k); m.spans.push(plan.spans.indexOf(S)); S.lamp = m.i; });
    // each span gets a lantern on a post beside it, on whichever side has more room
    for (const S of plan.spans) { const dv = dirv(S.h), mid = [(S.P1[0] + S.P2[0]) / 2, (S.P1[1] + S.P2[1]) / 2, S.P1[2]];
      const room = sg => { const q = [mid[0] - 1.7 * sg * dv[1], mid[1] + 1.7 * sg * dv[0]]; return Math.min(...R.flatMap(r => r.pts.map(p => Math.hypot(p[0] - q[0], p[1] - q[1]) + (Math.abs(p[2] - mid[2]) > 4 ? 9 : 0)))); };
      const sg = room(1) >= room(-1) ? 1 : -1; S.post = [mid[0] - 1.7 * sg * dv[1], mid[1] + 1.7 * sg * dv[0], mid[2]]; S.mid = mid; plan.posts.push({ p: S.post, top: mid[2] + 3.1, own: -1 }); }
    // the camera crank: a dial on a pedestal in open ground beside the terrace
    if (tier.camera) { const m = { i: machines.length, type: 'camera', def: 0 }; machines.push(m); plan.cam = m.i; let best = null;
      for (let x = -half; x <= half; x += 1) for (const y of [2.5, -2.5, 3.5, -3.5, 4.5, -4.5, 6, -6]) { const d = Math.min(...R.flatMap(r => r.pts.map(p => Math.hypot(p[0] - x, p[1] - y)))); if (d < 2.2) continue; const sc = Math.abs(y) + Math.abs(x) * .15 + Rn() * .5; if (!best || sc < best.sc) best = { x, y, sc }; }
      if (!best) return (plan3Why = 'no room for the camera crank', null); plan.camAt = [best.x, best.y, 0]; plan.posts.push({ p: plan.camAt, top: .6, own: -1 }); }
    if (machines.length < tier.machines[0] || machines.length > tier.machines[1]) return (plan3Why = `${machines.length} machines`, null);
    if (tier.island >= 1 && !plan.island) return (plan3Why = 'no island', null);
    return plan;
  }

  // ---- the track-graph solver
  function conn3(plan, r, e, cfg) {
    const L = plan.links.get(`${r}:${e}`); if (L) return L;
    const A = plan.R[r], M = plan.machines, view = plan.cam != null ? cfg[plan.cam] : 0;
    if (A.pjoin && e === 0) { const pj = A.pjoin; if (view !== pj.v) return null; return pj.lift !== undefined ? (cfg[pj.lift] === pj.f ? [M[pj.lift].deck, 0] : null) : (cfg[pj.m] === pj.i ? [M[pj.m].arm, 1] : null); }
    if (A.liftPort && e === A.liftPort.end) { const m = M[A.liftPort.m]; return cfg[m.i] === A.liftPort.f ? [m.deck, 0] : null; }
    if (A.liftDeck !== undefined && e === 1) { const m = M[A.liftDeck], fl = m.floors[cfg[m.i]]; if (!fl) return null; if (fl.pv) { const id = fl.pv[view]; return id != null ? [id, 0] : null; } return [fl.r, fl.end]; }
    if ((A.ssPort && e === A.ssPort.end) || (A.ssEnds && A.ssEnds[e])) { const m = M[A.spiral ?? A.ssPort.m], p = A.ssEnds ? A.ssEnds[e] : A.ssPort.port, on = cfg[m.i] === 0 ? (p === 'LW' || p === 'HE') : (p === 'HW' || p === 'LE'); return on ? [m.beam, p === 'LW' || p === 'HW' ? 0 : 1] : null; }
    if (A.beam !== undefined) { const m = M[A.beam], x = m.ports[e === 0 ? (cfg[m.i] ? 'HW' : 'LW') : (cfg[m.i] ? 'LE' : 'HE')]; return [x.r, x.end]; }
    if (A.spanEnd && e === A.spanEnd.end) { const S = plan.spans[A.spanEnd.span], lit = cfg[S.lamp] === 1;
      if (S.kind === 'light') return lit ? [S.road, e === 1 ? 0 : 1] : null;
      return lit ? null : e === 1 ? [S.b, 0] : [S.a, 1]; }
    if (A.kind === 'light') { const S = plan.spans[A.span]; return e === 1 ? [S.b, 0] : [S.a, 1]; }
    if (A.kind === 'tt-arm' && e === 1) { const m = M[A.tt]; if (m.pv && m.pv[cfg[m.i]]) { const id = m.pv[cfg[m.i]][view]; return id != null ? [id, 0] : null; } const b = plan.R[m.branch[cfg[m.i]]]; return b ? [b.id, 0] : null; }
    if (A.tipOf && e === A.tipOf.outEnd) { const m = M[A.tipOf.m]; return cfg[m.i] === A.tipOf.i ? [m.arm, 1] : null; }
    if (A.curve) { const m = M[A.curve.m], k = ((A.curve.c === 0 ? (e === 0 ? 2 : 1) : (e === 0 ? 0 : 3)) + cfg[m.i]) % 4, x = m.ext[k]; return x ? [x.r, x.inEnd] : null; }
    if (A.extOf && e === A.extOf.outEnd) { const m = M[A.extOf.m], k = (A.extOf.k - cfg[m.i] + 4) % 4; const ce = k === 2 ? [0, 0] : k === 1 ? [0, 1] : k === 0 ? [1, 0] : [1, 1]; return [m.curves[ce[0]], ce[1]]; }
    return null;
  }
  // ride from a position until the wheel parks in a pocket, reaches home, or falls
  function trace3(plan, pos, cfg, keys) {
    let { r, s, dir } = pos, cost = 0, pj = 0;
    for (let step = 0; step < 60; step++) {
      const A = plan.R[r]; let best = null;
      for (const f of A.forks) { if (f.dir !== dir) continue; if (dir > 0 ? !(f.s > s + 1e-6) : !(f.s < s - 1e-6)) continue;
        const on = f.pts !== undefined ? cfg[f.pts] === 1 : f.gate === 'all' ? keys.n === plan.nKeys : f.gate === 'need' ? keys.n >= plan.R[plan.keygate.pocket].need : false;
        if (on && (!best || Math.abs(f.s - s) < Math.abs(best.s - s))) best = f; }
      if (best) { cost += Math.abs(best.s - s); const B = plan.R[best.to]; r = B.id; s = best.toK ? B.len : 0; dir = best.toK ? -1 : 1; continue; }
      const e = dir > 0 ? 1 : 0; cost += dir > 0 ? A.len - s : s;
      if (A.goal && e === 1) return { win: true, cost, pj };
      const j = A.joins.find(j => j.k === e); if (j) { r = j.to; s = j.s; dir = j.dir; continue; }
      const n = conn3(plan, r, e, cfg); if (!n) return { fall: true, cost, at: A.kind };
      const B = plan.R[n[0]]; if ((A.pjoin && e === 0) || B.pjoin) pj++; if (B.pocket) return { park: B.spiral !== undefined && n[1] === 1 ? B.id + UP3 : B.id, cost: cost + B.len, pj };
      r = B.id; s = n[1] ? B.len : 0; dir = n[1] ? -1 : 1;
    }
    return { loop: true, cost };
  }
  const UP3 = 10000;
  const exitPos = (plan, p, cfg) => { const n = p >= UP3 ? conn3(plan, p - UP3, 0, cfg) : conn3(plan, p, 1, cfg); if (!n) return null; const B = plan.R[n[0]]; return { r: B.id, s: n[1] ? B.len : 0, dir: n[1] ? -1 : 1 }; };
  function solve3(plan) {
    const M = plan.machines, keyIdx = new Map(); plan.R.filter(r => r.key).forEach((r, i) => keyIdx.set(r.id, i));
    const def = M.map(m => m.def), all = [[]]; for (const m of M) { const n = m.type === 'tt' ? m.stops.length : m.type === 'lift' ? m.n : 2, nx = []; for (const c of all) for (let v = 0; v < n; v++) nx.push([...c, v]); all.length = 0; all.push(...nx); }
    const take = (mask, p) => keyIdx.has(p % UP3) ? mask | (1 << keyIdx.get(p % UP3)) : mask, bits = x => { let n = 0; while (x) { n += x & 1; x >>= 1; } return n; };
    const spawn = { r: plan.line, s: plan.half, dir: 1 };
    // idle: default machines forever must never win or fall
    { let t = trace3(plan, spawn, def, { n: 0 }), seen = new Set(), mask = 0;
      for (let k = 0; k < 30; k++) { if (t.win) return { ok: false, why: 'idling wins' }; if (t.fall || t.loop) return { ok: false, why: 'idling falls' };
        mask = take(mask, t.park); const key = t.park + '|' + mask; if (seen.has(key)) break; seen.add(key); const ex = exitPos(plan, t.park, def); if (!ex) return { ok: false, why: 'idling falls' }; t = trace3(plan, ex, def, { n: bits(mask) }); }
      plan.freeKeys = bits(mask); }
    const first = trace3(plan, spawn, def, { n: 0 }); if (!first.park) return { ok: false, why: 'no first stop' };
    // Dijkstra over (pocket, keys); edges: any machine setting while parked
    const start = { p: first.park, mask: take(0, first.park), cost: first.cost, prev: null, cfg: def }, dist = new Map(), Q = [start]; dist.set(start.p + '|' + start.mask, start.cost);
    const full = (1 << plan.nKeys) - 1; let goal = null;
    while (Q.length) { Q.sort((a, b) => a.cost - b.cost); const cur = Q.shift(); if (cur.cost > (dist.get(cur.p + '|' + cur.mask) ?? 1e9) + 1e-9) continue;
      if (cur.won) { goal = cur; break; }
      for (const cfg of all) { const ex = exitPos(plan, cur.p, cfg); if (!ex) continue; const t = trace3(plan, ex, cfg, { n: bits(cur.mask) }); const c = cur.cost + t.cost + 2;
        if (t.win) { if (cur.mask === full) Q.push({ won: true, cost: c, prev: cur, cfg, p: -1, mask: full }); continue; }
        if (!t.park) continue; const mask = take(cur.mask, t.park), key = t.park + '|' + mask;
        if (c < (dist.get(key) ?? 1e9) - 1e-9) { dist.set(key, c); Q.push({ p: t.park, mask, cost: c, prev: cur, cfg }); } } }
    if (!goal) return { ok: false, why: 'no solution' };
    // the plan: in each pocket on the way, the setting to leave with
    const chain = []; for (let n = goal; n; n = n.prev) chain.unshift(n);
    const legs = []; for (let i = 0; i < chain.length - 1; i++) legs.push({ pocket: chain[i].p, cfg: chain[i + 1].cfg });
    let changes = 0, prev = def; const used = new Set(); for (const l of legs) { l.cfg.forEach((v, i) => { if (v !== prev[i]) { changes++; used.add(i); } }); prev = l.cfg; }
    let pj = 0, camMoves = 0, pc = plan.cam != null ? def[plan.cam] : 0; for (const l of legs) { const ex = exitPos(plan, l.pocket, l.cfg); if (!ex) continue; if (plan.R[ex.r].pjoin) pj++; pj += trace3(plan, ex, l.cfg, { n: plan.nKeys }).pj || 0; if (plan.cam != null && l.cfg[plan.cam] !== pc) { camMoves++; pc = l.cfg[plan.cam]; } }
    return { ok: true, legs, stops: legs.length, changes, used: used.size, cost: goal.cost, minutes: (goal.cost / LV.speed) / 60, pj, camMoves };
  }

  function hull5(pts) { const P = pts.map(([x, y]) => ({ x, y })).sort((a, b) => a.x - b.x || a.y - b.y), cr = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x), lo = [], up = [];
    for (const p of P) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
    for (const p of P.reverse()) { while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
    return lo.slice(0, -1).concat(up.slice(0, -1)); }
  const inHull5 = (h, p) => h.every((a, i) => { const b = h[(i + 1) % h.length]; return (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x) > 0; });
  // ---- geometry checks (honest roads stay apart; the island's screen join and the perspective joins are the only screen joins allowed)
  function checkPlan3(plan) {
    const R = plan.R, bad = [], near = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
    const nearJoin = (p, k = 1) => plan.joinsAt.some(j => Math.hypot(p[0] - j[0], p[1] - j[1], p[2] - j[2]) < (j[3] || 2.6) * k);
    const mOf = A => A.curve ? 'c' + A.curve.m : A.beam !== undefined ? 'b' + A.beam : A.beamOf !== undefined ? 'b' + A.beamOf : null;
    const sameMachine = (A, B) => mOf(A) !== null && mOf(A) === mOf(B);
    const pvIds = m => (m.pv || []).flat().filter(x => x != null);
    const ownOf = m => m.type === 'camera' ? [] : m.type === 'tt' ? [m.arm, ...m.branch.filter(x => x >= 0), ...pvIds(m)] : m.type === 'cross' ? [...m.curves, ...m.ext.map(x => x.r)] : m.type === 'points' ? [m.leaf, m.spur]
      : m.type === 'lift' ? [m.deck, ...m.floors.filter(f => f.r != null).map(f => f.r), ...m.floors.flatMap(f => (f.pv || []).filter(x => x != null))] : m.type === 'seesaw' ? [m.beam, m.ghost, ...new Set(Object.values(m.ports).map(x => x.r))] : m.spans.flatMap(si => { const S = plan.spans[si]; return [S.a, S.b, S.road].filter(x => x != null); });
    // roads may come close only near a join they share: within two hops of each other in the track graph
    const adj = R.map(() => new Set()), tie = (a, b) => { if (a == null || b == null) return; adj[a].add(b); adj[b].add(a); };
    for (const [k, v] of plan.links) tie(+k.split(':')[0], v[0]);
    for (const r of R) { for (const f of r.forks) tie(r.id, f.to); for (const j of r.joins) tie(r.id, j.to); }
    for (const m of plan.machines) { const own = ownOf(m); for (const a of own) for (const b of own) if (a !== b) tie(a, b); }
    const close = (a, b) => adj[a].has(b) || [...adj[a]].some(c => adj[c].has(b));
    for (let a = 0; a < R.length; a++) for (let b = a + 1; b < R.length; b++) { const A = R[a], B = R[b]; if (sameMachine(A, B)) continue; let worst = 9; const tied = close(a, b);
      for (let i = 0; i < A.pts.length; i += 2) for (let j = 0; j < B.pts.length; j += 2) { const p = A.pts[i], q = B.pts[j], d = near(p, q); if (d < 1.5 && Math.abs(p[2] - q[2]) < 3.4 && !(tied && nearJoin(p) && nearJoin(q))) worst = Math.min(worst, d); }
      if (worst < 1.5) { bad.push(`${A.kind} too close to ${B.kind}`); if (bad.length > 3) return bad; } }
    // discs: nothing but their own ports inside
    for (const D of plan.discs) for (const A of R) { if (A.curve) continue; for (const p of A.pts) { const d = near(p, D.c); if (d < D.R - .1 && Math.abs(p[2] - D.c[2]) < 2) { bad.push(`${A.kind} cuts a crossover disc`); break; } } }
    // lift frames: nothing but the deck inside; posts: nothing running through them
    for (const X of plan.boxes) { const c = Math.cos(X.base * Math.PI / 180), sn = Math.sin(X.base * Math.PI / 180);
      for (const A of R) { if (A.id === X.own || A.ghost) continue; if (A.pts.some(p => { const dx = p[0] - X.J[0], dy = p[1] - X.J[1], u = dx * c + dy * sn, v = -dx * sn + dy * c; return u > X.x0 && u < X.x1 && Math.abs(v) < X.half && p[2] > X.z0 && p[2] < X.z1; })) { bad.push(`${A.kind} runs into a lift`); break; } } }
    for (const Q of plan.posts) for (const A of R) { if (A.ghost || (Q.own >= 0 && A.beam === Q.own)) continue; if (A.pts.some(p => near(p, Q.p) < .75 && p[2] < Q.top + .3)) { bad.push(`${A.kind} runs into a post`); break; } }
    // turntable swings
    for (const G of plan.ghosts) { const inSweep = q => { const d = near(q, G.piv); if (d > 4.2 || d < 1 || Math.abs(q[2] - G.piv[2]) > 2) return false; let a = Math.atan2(q[1] - G.piv[1], q[0] - G.piv[0]) * 180 / Math.PI - G.base; a = ((a % 360) + 540) % 360 - 180; return G.open > 0 ? a > 6 && a < G.open - 6 : a < -6 && a > G.open + 6; };
      for (const A of R) { if (A.kind === 'tt-arm') continue; if (A.pts.some(inSweep)) { bad.push(`${A.kind} in a turntable's swing`); break; } } }
    // ends that meet on screen without meeting in 3D (only the pier and its island road may)
    const ends = []; for (const A of R) if (A.kind !== 'tt-arm') ends.push({ A, p: A.pts[0], w: 0 }, { A, p: A.pts[A.pts.length - 1], w: 1 });   // arm tips are listed per stop below
    for (const G of plan.machines) if (G.type === 'tt') G.stops.forEach((a, i) => { const h = G.base + a; ends.push({ A: { kind: 'arm tip', id: -2, tip: [G.i, i] }, p: [G.pivot[0] + G3.ARM * dirv(h)[0], G.pivot[1] + G3.ARM * dirv(h)[1], G.pivot[2]] }); });
    for (const G of plan.machines) if (G.type === 'lift') for (let f = 1; f < G.n; f++) if (G.floors[f].pv) ends.push({ A: { kind: 'lift mouth', id: -3, mouth: [G.i, f] }, p: [G.J[0], G.J[1], G.J[2] + f * G.step] });
    const pjMatch = (x, y, vi) => { const pj = y.A.pjoin; if (!pj || y.w !== 0 || pj.v !== vi) return false; return x.A.tip ? pj.m === x.A.tip[0] && pj.i === x.A.tip[1] : x.A.mouth ? pj.lift === x.A.mouth[0] && pj.f === x.A.mouth[1] : false; };
    for (const [vi, yaw] of plan.views.entries()) for (let a = 0; a < ends.length; a++) for (let b = a + 1; b < ends.length; b++) { const e = ends[a], f = ends[b]; if (e.A === f.A) continue;
      if (Math.hypot(e.p[0] - f.p[0], e.p[1] - f.p[1], e.p[2] - f.p[2]) < .3) continue; const s1 = scrV(e.p, yaw), s2 = scrV(f.p, yaw);
      const wanted = (vi === 0 && ((e.A.kind === 'pier' && f.A.far) || (f.A.kind === 'pier' && e.A.far))) || pjMatch(e, f, vi) || pjMatch(f, e, vi); if (Math.hypot(s1[0] - s2[0], s1[1] - s2[1]) < .6 && !wanted) { bad.push(`ends of ${e.A.kind} and ${f.A.kind} meet on screen`); if (bad.length > 3) return bad; } }
    // nothing hides behind a lift's frame on screen, in any view (the feedback on the curtain study): only the lift's own deck and the roads that meet its mouth
    for (const X of plan.boxes) { const c = Math.cos(X.base * Math.PI / 180), sn = Math.sin(X.base * Math.PI / 180), m = plan.machines.find(q => q.type === 'lift' && q.J === X.J);
      const corners = []; for (const u of [X.x0, X.x1]) for (const v of [-X.half, X.half]) for (const z of [X.z0, X.z1]) corners.push([X.J[0] + u * c - v * sn, X.J[1] + u * sn + v * c, z]);
      const mouths = m ? Array.from({ length: m.n }, (_, f) => [X.J[0], X.J[1], X.J[2] + f * m.step]) : [];
      for (const yaw of plan.views) { const hull = hull5(corners.map(q => scrV(q, yaw))), dC = depthV([X.J[0] + (X.x0 + X.x1) / 2 * c, X.J[1] + (X.x0 + X.x1) / 2 * sn, (X.z0 + X.z1) / 2], yaw);
        for (const A of R) { if (A.id === X.own || A.ghost) continue; let n = 0;
          for (let k = 0; k < A.pts.length; k += 2) { const p = A.pts[k]; if (mouths.some(q => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) < 1.8)) continue; if (A.pjoin && A.pjoin.lift === (m && m.i) && plen(A.pts.slice(0, k + 1)) < 3) continue;
            const q = scrV(p, yaw); if (inHull5(hull, { x: q[0], y: q[1] }) && depthV(p, yaw) < dC) n++; }
          if (n >= 3) { bad.push(`${A.kind} hides behind a lift`); break; } } } }
    // roads that pass in front of each other on screen make a level hard to read
    plan.crossed = 0;
    for (const yaw of plan.views) { const SP = R.map(r => ({ r, s: r.pts.filter((_, k) => k % 3 === 0).map(p => ({ p, q: scrV(p, yaw), j: nearJoin(p, .55) })) })); let crossed = 0, total = 0;
      for (const A of SP) for (const a of A.s) { total++; if (a.j) continue; let hit = false; const strict = A.r.kind === 'pier' || A.r.far;
        for (const B of SP) { if (B === A || sameMachine(A.r, B.r) || (strict && (B.r.kind === 'pier' || B.r.far))) continue; for (const b of B.s) if ((strict || !b.j) && Math.hypot(a.q[0] - b.q[0], a.q[1] - b.q[1]) < .9 && near(a.p, b.p) > 1.5) { hit = true; break; } if (hit) break; }
        if (hit) { crossed++; if (strict) { bad.push('the island crosses another road on screen'); return bad; } } }
      plan.crossed = Math.max(plan.crossed, +(crossed / total).toFixed(3)); }
    if (plan.crossed > CROSS_MAX) bad.push('roads cross on screen');
    return bad;
  }

  const NAMES3 = { 1: [['Lilac', 'Dusk', 'Coral', 'Quiet', 'Peach', 'Slow', 'Amber', 'Lavender', 'Pale', 'Evening', 'Rose', 'Hushed'], ['Steps', 'Arcade', 'Terrace', 'Causeway', 'Cloister', 'Crossing', 'Gallery', 'Landing', 'Rampart', 'Courtyard', 'Colonnade', 'Stair']],
    2: [['Fern', 'Moss', 'Clover', 'Willow', 'Meadow', 'Lily', 'Ivy', 'Hollow', 'Bramble', 'Sorrel', 'Thyme', 'Linden'], ['Terraces', 'Steps', 'Falls', 'Bower', 'Arbour', 'Pond', 'Walk', 'Garden', 'Pergola', 'Rill', 'Glade', 'Orchard']],
    3: [['Harbour', 'Azure', 'Salt', 'Tile', 'Shutter', 'Gull', 'Lantern', 'Terracotta', 'Sea', 'Chapel', 'Bell', 'Market'], ['Lane', 'Quay', 'Square', 'Steps', 'Arches', 'Wharf', 'Alley', 'Plaza', 'Rooftops', 'Mole', 'Stair', 'Row']] };
  NAMES3[4] = [['Violet', 'Saffron', 'Magenta', 'Ember', 'Amethyst', 'Marigold', 'Plum', 'Tangerine', 'Orchid', 'Honey', 'Indigo', 'Coral'], ['Ziggurat', 'Steps', 'Terraces', 'Spring', 'Balance', 'Prism', 'Stair', 'Ramp', 'Court', 'Dais', 'Pivot', 'Gate']];
  NAMES3[5] = [['Lantern', 'Moon', 'Candle', 'Firefly', 'Ink', 'Midnight', 'Star', 'Owl', 'Ember', 'Paper', 'Velvet', 'Hush'], ['Row', 'Yard', 'Steps', 'Alley', 'Court', 'Bridge', 'Square', 'Walk', 'Quarter', 'Lane', 'Roofs', 'Watch']];
  NAMES3[6] = [['Brass', 'Copper', 'Cog', 'Rivet', 'Piston', 'Bellows', 'Gauge', 'Valve', 'Spindle', 'Ratchet', 'Boiler', 'Flywheel'], ['Works', 'Yard', 'Gallery', 'Floor', 'Hall', 'Shop', 'Foundry', 'Stair', 'Gantry', 'Mill', 'Court', 'Loft']];
  // a see-saw built like the sample's: a beam on a pivot, wound by a spring that only holds while you push
  function seesawM(L, o) {
    const th = L.th, g = L.g, a = Math.asin(1 / 2.5), X = 2.5 * Math.cos(a), outer = new T.Group(); outer.position.copy(V(...o.P)); outer.rotation.y = -o.base * Math.PI / 180; g.add(outer);
    const pivot = new T.Group(); pivot.position.copy(V(X, 0, 1)); outer.add(pivot); const beamMat = tri(th.idle, { fresh: true, side: true });
    const beam = L.road(L3([-2.5, 0, 0], [2.5, 0, 0], UP), { g: pivot, mat: beamMat, th: .35 });
    const sd = o.sd; B(outer, X - .3, -.85 * sd - .3, -3, X + .3, -.85 * sd + .3, 1.25, tri(sp(th, 2))); CY(outer, X, -.42 * sd, .14, .85, 1.15, tri(th.mech), 12).rotation.x = Math.PI / 2;
    const st = { c: 0, beam }; pivot.rotation.z = a;
    st.m = L.machine({ key: o.key, name: o.name, size: .6, place: h => { h.position.copy(V(X, -.85 * sd, 1.35)); outer.add(h); },
      tick(dt, drive) { const c = st.c, hold = 90 + 150 * c, P = powerOf(rider.cad, rider.gear, .2 + 1.3 * c);
        if (drive > 0) st.c += (P - hold) * .006 * dt; else st.c -= .3 * dt; st.c = clamp(st.c, 0, 1);
        const k = clamp((st.c - .1) / .8, 0, 1), sm = k * k * (3 - 2 * k); pivot.rotation.z = a * (1 - 2 * sm); st.tip = sm; setTri(beamMat, mixPal(th.idle, th.mech, sm));
        return drive > 0 ? .2 + 1.3 * st.c : 0; } });
    return st;
  }
  // a lamp: a lantern on a post beside each of its spans. Lit, its light bridge holds; dark, its dark gap holds
  function lampM(L, o) {
    const th = L.th, g = L.g, glow = th.glow || th.goal, st = { b: 0 }, parts = [];
    o.spans.forEach((S, k) => { const [px, py, z] = S.post, [mx, my] = S.mid; B(g, px - .3, py - .3, Math.min(-2.4, z - 2.4), px + .3, py + .3, z - .5, tri(sp(th, 0))); CY(g, px, py, .08, z - .5, z + 3, tri(th.mechDark || th.idle), 8);
      const dx = mx - px, dy = my - py; B(g, Math.min(px, mx) - .05 + (dx ? 0 : 0), Math.min(py, my) - .05, z + 2.95, Math.max(px, mx) + .05, Math.max(py, my) + .05, z + 3.05, tri(th.mechDark || th.idle));
      const bulb = new T.Mesh(new T.SphereGeometry(.17, 14, 10), basic('#3A3D66')); at(g, bulb, mx, my, z + 2.8);
      const halo = sprite(TEX.glow, 2.6, 2.6, glow, { opacity: 0, add: true }); at(g, halo, mx, my, z + 2.8);
      const cg = new T.ConeGeometry(1.8, 3, 32, 1, true); cg.translate(0, -1.5, 0); const cone = new T.Mesh(cg, basic(glow, { opacity: 0, add: true, side: true })); at(g, cone, mx, my, z + 2.8);
      parts.push({ bulb, halo, cone }); if (k === 0) st.foot = [px, py, z - .5]; });
    st.m = L.machine({ key: o.key, name: o.name, size: .5, place: h => { h.position.copy(V(...st.foot)); g.add(h); },
      tick(dt, drive) { const tgt = drive > 0 ? clamp((rider.cad - 40) / 50, 0, 1) : 0; st.b += (tgt - st.b) * Math.min(1, dt * (drive > 0 ? 2.5 : 1.3));
        for (const p of parts) { p.bulb.material.color.set(mix('#3A3D66', glow, st.b)); p.halo.material.opacity = st.b * .9; p.cone.material.opacity = st.b * .14; } return drive > 0 ? .1 + .35 * st.b : 0; } });
    return st;
  }
  // the camera crank: a dial on a pedestal; pedalling turns the whole view, and it clicks into its detents
  function cameraCrank(L, o) {
    const th = L.th, g = L.g, [x, y, z] = o.at, det = o.detents, lo = Math.min(...det), hi = Math.max(...det), st = { ang: det[0], sweep: det[0] === lo ? 1 : -1 };
    CY(g, x, y, .6, Math.min(-2.4, z - 2.4), z - .02, tri(sp(th, 0)), 32);
    const dial = new T.Group(); dial.position.copy(V(x, y, z)); g.add(dial); const dm = tri(th.mech, { fresh: true });
    const ring = new T.Mesh(new T.RingGeometry(.36, .48, 40), basic(th.lane, { side: true })); ring.rotation.x = -Math.PI / 2; ring.position.y = .02; dial.add(ring);
    for (const d of det) { const a = d * Math.PI / 180, tick = new T.Mesh(UNIT, basic(th.lane)); tick.scale.set(.16, .03, .05); tick.position.set(.56 * Math.cos(a), .03, -.56 * Math.sin(a)); tick.rotation.y = a; dial.add(tick); }
    const needle = new T.Group(); dial.add(needle); const nm = new T.Mesh(UNIT, dm); nm.scale.set(.42, .07, .1); nm.position.set(.2, .06, 0); needle.add(nm);
    st.m = L.machine({ key: o.key, name: o.name, size: .55, place: h => { h.position.copy(V(x, y, z + .04)); g.add(h); },
      tick(dt, drive) {
        if (drive > 0) { st.ang += st.sweep * drive * 30; if (st.ang <= lo || st.ang >= hi) { st.ang = clamp(st.ang, lo, hi); st.sweep *= -1; } }
        else { const tgt = det.reduce((a, d) => Math.abs(d - st.ang) < Math.abs(a - st.ang) ? d : a, det[0]); st.ang += clamp(tgt - st.ang, -60 * dt, 60 * dt); }
        L.view.yaw = st.ang * Math.PI / 180; needle.rotation.y = st.ang * Math.PI / 180; setTri(dm, mixPal(th.mech, tone(th.goal), clamp(this.bloom.e, 0, 1)));
        const off = Math.min(...det.map(d => Math.abs(st.ang - d))); return drive > 0 ? .2 + .5 * Math.exp(-((off / 7) ** 2)) : 0; } });
    st.at = d => Math.abs(st.ang - d) < .5;
    return st;
  }
  function genDef3(plan, sol) {
    const tier = plan.tier, Rn = mulberry(plan.seed * 31 + TIERS.indexOf(tier) * 101), N = NAMES3[tier.zone], name = `${N[0][Math.floor(Rn() * 12)]} ${N[1][Math.floor(Rn() * 12)]}`;
    let kn = 0; const M = plan.machines.map(m => ({ ...m, key: m.type === 'lift' ? null : G3.LETTERS[kn++] }));
    const spurOf = i => plan.spurs.find(s => s.m === i), sideName = m => { const s = spurOf(m.i), same = plan.spurs.filter(q => q.side === s.side).sort((a, b) => a.x0 - b.x0), base = s.side > 0 ? 'North' : 'South'; return same.length < 2 ? base : `${base}-${same.indexOf(s) === 0 ? 'west' : same.indexOf(s) === same.length - 1 ? 'east' : 'middle'}`; };
    const hostOf = m => { const A = plan.R[m.host]; if (A.kind === 'chain') { const p = m.pivot || m.center || m.J; return 'Outer ' + (Math.abs(p[0]) > Math.abs(p[1]) ? (p[0] > 0 ? 'east' : 'west') : (p[1] > 0 ? 'north' : 'south')); } return A.kind === 'line' ? (A.pts[0][0] + A.pts[A.pts.length - 1][0]) / 2 > (m.type === 'tt' ? m.pivot : m.type === 'cross' ? m.center : m.type === 'lift' ? m.J : m.P)[0] ? 'West' : 'East' : sideName(M[A.points]); };
    const mName = m => m.type === 'camera' ? 'Camera' : m.type === 'points' ? `${sideName(m)} points` : m.type === 'lamp' ? `Lamp ${['one', 'two'][m.no]}` : `${hostOf(m)} ${{ cross: 'crossover', lift: 'lift', seesaw: 'see-saw' }[m.type] || (m.hub ? 'hub' : 'turntable')}`;
    M.forEach(m => m.name = mName(m));
    const verb = m => m.type === 'camera' ? 'turns the camera a quarter: a turntable stop or lift floor that leads into thin air from one side meets a road far below from the other' : m.type === 'points' ? `lowers the ${m.name.toLowerCase()}` : m.type === 'cross' ? `turns the ${m.name.toLowerCase()} a quarter (it swaps which roads its two curves join)` : m.type === 'tt' ? (m.hub ? `swings the ${m.name.toLowerCase()} through its three stops` : `swings the ${m.name.toLowerCase()}`)
      : m.type === 'lift' ? `your cadence runs the ${m.name.toLowerCase()} all the time: hold about 50 rpm for the ground floor, 70 for the first${m.n > 2 ? ', 85 for the second' : ''}${m.floors.some(f => f.pv) ? ' (its upper floors open onto thin air)' : ''}`
      : m.type === 'seesaw' ? `winds the ${m.name.toLowerCase()}: push about 88 rpm and it tips the other way, but only while you keep pushing`
      : `lights ${m.name.toLowerCase()}: its ${m.spans.length > 1 ? 'light bridge holds only while lit, and its dark gap only while dark' : 'light bridge holds only while you keep it lit, above 70 rpm'}`;
    const kgR = plan.keygate ? plan.R[plan.keygate.pocket] : null;
    const hint = [`${M.map(m => `<b>${m.key ? m.key.toUpperCase() : 'No button:'}</b> ${verb(m)}`).join('; ')}.`, `There are ${plan.nKeys} keys${kgR ? `, one behind a key gate that opens once you carry ${kgR.need === 1 ? 'one key' : 'two'}` : ''}. The gate home opens for a wheel carrying every key.`,
      'Set a machine, or turn the camera, while the wheel is out in a cul-de-sac.'].filter(Boolean).join(' ');
    const all = plan.R.flatMap(r => r.pts).concat(plan.posts.map(q => q.p)), xs = all.map(p => p[0]), ys = all.map(p => p[1]), lm = [Math.min(...xs) - 2.4, Math.min(...ys) - 2.4];
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2, ztop = Math.max(...all.map(p => p[2]));
    return { id: `${tier.id}-${plan.seed}`, name, th: () => THEMES[tier.theme], cruise: [78, 92], hint, plan, sol, gen: true, yaws: plan.views,
      build(L) {
        const th = L.th, g = L.g, P = L.props, postMat = tri(sp(th, 1)), ER = []; P.ER = ER; P.keys = []; P.held = 0;
        const occupied = plan.R.filter(r => !r.ghost).flatMap(r => r.pts), swings = M.filter(m => m.type === 'tt' || m.type === 'cross').map(m => m.type === 'tt' ? m.pivot : m.center).concat(plan.camAt ? [plan.camAt] : []);
        const frames = M.filter(m => m.type === 'lift' || m.type === 'seesaw').map(m => m.type === 'lift' ? m.J : m.center);
        const post = (x, y, z) => { if (occupied.some(p => Math.hypot(p[0] - x, p[1] - y) < .9 && p[2] < z - .5)) return; if (swings.some(c => Math.hypot(c[0] - x, c[1] - y) < 4.2 && Math.abs(c[2] - z) < 1)) return; if (frames.some(c => Math.hypot(c[0] - x, c[1] - y) < 1.2)) return; CY(g, x, y, .14, Math.min(-2.4, z - 2.4), z - .25, postMat, 10); };
        const pier = (x, y, z) => CY(g, x, y, .5, Math.min(-2.6, z - 2.6), z - .3, tri(sp(th, 0)), 24);
        const mk = (r, o = {}) => { const e = L.road(r.pts.map(p => ({ p, n: [0, 0, 1] })), o); ER[r.id] = e; return e; };
        const sFar = (60 + 150) * Math.PI / 180 * G3.TEAR + .3;
        const mkKey = p => { const k = new T.Group(), m = basic(th.goal); const bow = new T.Mesh(new T.TorusGeometry(.2, .06, 8, 24), m); bow.position.y = .32; k.add(bow); const sh = new T.Mesh(UNIT, m); sh.scale.set(.07, .5, .07); k.add(sh);
          for (const [y, w] of [[-.16, .16], [-.04, .12]]) { const tooth = new T.Mesh(UNIT, m); tooth.scale.set(w, .06, .06); tooth.position.set(w / 2, y, 0); k.add(tooth); }
          k.add(sprite(TEX.glow, 1.4, 1.4, th.goal, { opacity: .45, add: true })); k.position.copy(p); g.add(k); const q = { k, p: p.clone(), got: false, t: 0 }; P.keys.push(q); return q; };
        const gates = []; const mkGate = (gt, need) => { const gq = gt.at(2), gd = gq.d, gn = new T.Vector3(-gd.z, 0, gd.x).normalize(), gateMat = tri(th.mech, { fresh: true });
          for (const k of [-.78, .78]) { const q = gq.p.clone().addScaledVector(gn, k); CY(g, q.x, q.z, .1, q.y - .3, q.y + .75, tri(th.mechDark || th.idle), 10); }
          const gate = new T.Group(); gate.position.copy(gq.p).addScaledVector(gn, -.78); gate.position.y += .6; gate.lookAt(gate.position.clone().add(gn)); g.add(gate);
          const bar = new T.Mesh(UNIT, gateMat); bar.scale.set(.12, .12, 1.6); bar.position.z = .8; bar.userData.gate = true; gate.add(bar);
          if (need === 'all') { const lock = new T.Mesh(new T.TorusGeometry(.16, .05, 8, 20), gateMat); lock.position.z = .78; lock.userData.gate = true; gate.add(lock); }
          else for (let k = 0; k < need; k++) { const pip = new T.Mesh(new T.SphereGeometry(.11, 12, 8), basic(th.goal)); pip.position.set(0, .16, .55 + k * .5 - (need - 1) * .25); pip.userData.gate = true; gate.add(pip); }
          gates.push({ gate, gateMat, open: () => need === 'all' ? P.held === P.keys.length : P.held >= need }); };
        const line = mk(plan.R[plan.line]); P.line = line; for (let x = -plan.half + 1.5; x <= plan.half - 1.5; x += 3) post(x, 0, 0);
        const built = new Set([plan.line]);
        for (const m of M.filter(m => m.type === 'points')) { m.obj = peelSwitch(L, { line, s: m.s, dir: m.dir, side: m.ps, key: m.key, name: m.name, text: `Peeled off ${m.side > 0 ? 'north' : 'south'}` }); ER[m.leaf] = m.obj.leaf; built.add(m.leaf);
          const sr = mk(plan.R[m.spur]); built.add(m.spur); for (let a = 2.4; a < sr.L - 1; a += 3.2) { const f = sr.at(a).p; post(f.x, f.z, f.y); } }
        for (const m of M.filter(m => m.type === 'tt')) { m.obj = turntable(L, { key: m.key, name: m.name, pivot: m.pivot, len: G3.ARM, base: m.base, open: m.stops.find(a => a !== 0), detents: m.stops }); ER[m.arm] = m.obj.road; built.add(m.arm); }
        for (const m of M.filter(m => m.type === 'cross')) { m.obj = crossDisc(L, { center: m.center, R: G3.CR, key: m.key, name: m.name, base: m.base }); ER[m.curves[0]] = m.obj.roads[0]; ER[m.curves[1]] = m.obj.roads[1]; built.add(m.curves[0]); built.add(m.curves[1]); }
        for (const m of M.filter(m => m.type === 'camera')) m.obj = cameraCrank(L, { key: m.key, name: m.name, at: plan.camAt, detents: plan.views });
        for (const m of M.filter(m => m.type === 'lift')) { m.obj = faucetLift(L, { auto: true, key: m.key, name: m.name, J: m.J, heading: m.base, step: m.step, ...(th.leaf ? { postPal: th.leaf, pipePal: th.leaf } : {}) }); ER[m.deck] = m.obj.deck; built.add(m.deck); }
        for (const m of M.filter(m => m.type === 'seesaw')) { const sup = plan.posts.find(q => q.own === m.i), dv = dirv(m.base), sd = Math.sign((sup.p[0] - m.center[0]) * -dv[1] + (sup.p[1] - m.center[1]) * dv[0]) || 1;
          m.obj = seesawM(L, { P: m.P, base: m.base, key: m.key, name: m.name, sd: -sd }); ER[m.beam] = m.obj.beam; built.add(m.beam); built.add(m.ghost); }
        const lit = b => ({ t: mix('#2A2D55', '#FFF2C4', b), l: mix('#22264A', '#FFD979', b), r: mix('#1C1F40', '#FFC24A', b) });
        for (const m of M.filter(m => m.type === 'lamp')) { const spans = m.spans.map(si => plan.spans[si]); m.obj = lampM(L, { key: m.key, name: m.name, spans });
          for (const S of spans) if (S.kind === 'light') { const mat = tri(lit(0), { fresh: true, opacity: .5, side: true }), lamp = m.obj;
            const e = mk(plan.R[S.road], { mat, th: .12, noLane: true, solid: () => lamp.b > .45, goneText: 'The light faded under the wheel' }); built.add(S.road);
            L.view.updaters.push(() => { setTri(mat, lit(lamp.b)); mat.uniforms.opacity.value = .92 * lamp.b; for (const v of e.vis || []) v.visible = mat.uniforms.opacity.value > .02; }); } }
        for (const r of plan.R) { if (built.has(r.id) || r.ghost) continue;
          if (r.pocket) { const e = mk(r); const hr = r.heading * Math.PI / 180, s0 = r.pts[0]; pier(s0[0] + 2.6 * Math.cos(hr), s0[1] + 2.6 * Math.sin(hr), s0[2]); if (r.key) e.keyObj = mkKey(e.at(sFar).p); continue; }
          if (r.goal) { const e = mk(r, { goal: true, pal: sp(th, 2) }); const q = e.S.at(-1).p; CY(g, q.x, q.z, .45, Math.min(-2.6, q.y - 2.6), q.y - .3, tri(sp(th, 0)), 20); continue; }
          const e = mk(r, r.far ? { pal: th.stone } : r.kind === 'pier' ? { pal: sp(th, 2), edgeText: 'Off the end of the pier' } : {});
          for (let a = 1.6; a < e.L - .6; a += 2.8) { const f = e.at(a).p; post(f.x, f.z, f.y); } }
        // dark gaps: the deck is painted across them until the lamp shows the hole
        for (const m of M.filter(m => m.type === 'lamp')) for (const si of m.spans) { const S = plan.spans[si]; if (S.kind !== 'dark') continue; const lamp = m.obj, A = ER[S.a], Bd = ER[S.b];
          A.gaps.push({ k: 1, to: Bd, toK: 0, when: () => lamp.b < .3, text: 'Crossed the dark gap unseen' }); Bd.gaps.push({ k: 0, to: A, toK: 1, when: () => lamp.b < .3, text: 'Crossed the dark gap unseen' });
          A.edgeText = Bd.edgeText = 'The lamp lit the gap, so it was real';
          const [x0, x1] = [Math.min(S.P1[0], S.P2[0]), Math.max(S.P1[0], S.P2[0])], [y0, y1] = [Math.min(S.P1[1], S.P2[1]), Math.max(S.P1[1], S.P2[1])], w = .5, z = S.P1[2];
          const darkMat = tri(sp(th, 1), { fresh: true, opacity: .99 }), paint = B(g, x0 - (x1 > x0 ? 0 : w), y0 - (y1 > y0 ? 0 : w), z - .5, x1 + (x1 > x0 ? 0 : w), y1 + (y1 > y0 ? 0 : w), z, darkMat);
          L.view.updaters.push(() => { darkMat.uniforms.opacity.value = clamp(1 - lamp.b * 2.2, 0, 1); paint.visible = darkMat.uniforms.opacity.value > .01; }); }
        // forks and joins, now that every road exists
        for (const r of plan.R) { const e = ER[r.id]; if (!e) continue;
          for (const f of r.forks) { if (f.pts !== undefined) continue; const host = e, gi = f.gate === 'all' ? plan.home.gi : plan.keygate.gi, sG = host.cum[Math.min(host.cum.length - 1, gi)];
            const kgR = plan.keygate && plan.R[plan.keygate.pocket];
            host.forks.push({ s: sG, dir: -1, to: ER[f.to], toK: 0, when: () => f.gate === 'all' ? P.held === P.keys.length : P.held >= kgR.need, text: f.gate === 'all' ? 'Every key, so the gate home opened' : 'The key gate opened' });
            if (f.gate === 'need') ER[f.to].joins = [{ k: 0, to: host, s: sG, dir: -1 }]; mkGate(ER[f.to], f.gate === 'all' ? 'all' : kgR.need); } }
        if (!plan.views[1]) { const [bx, by] = lm; B(g, bx - .9, by - .9, -2.4, bx + .9, by + .9, 1.6, tri(sp(th, 0))); at(g, new T.Mesh(new T.SphereGeometry(.85, 20, 12, 0, TAU, 0, Math.PI / 2), tri(th.roof || th.mech)), bx, by, 1.6);
          for (let k = 0; k < 2; k++) onFace(g, 'y', by + .9, bx, -.9 + k * 1.3, archGeo(.3, .7), basic((th.win || th.blue || th.leaf || th.stone).r)); }
        P.M = M; P.pocketOf = new Map(plan.R.filter(r => r.pocket).map(r => [ER[r.id], r.id]));
        L.view.updaters.push((tt, dt) => {
          for (const q of P.keys) { q.k.rotation.y = tt * 1.6; q.k.position.y = q.p.y + .8 + .1 * Math.sin(tt * 2);
            if (!q.got && L.wheel.position.distanceTo(q.p) < .7) { q.got = true; P.held++; L.flash(`Picked up a key (${P.held} of ${P.keys.length})`); }
            if (q.got) { q.t = Math.min(1, q.t + dt * 2.5); q.k.scale.setScalar(Math.max(.001, 1 - q.t)); q.k.position.y += q.t * 1.5; } }
          for (const G of gates) { const o = G.open(); G.gate.rotation.z += clamp((o ? -Math.PI / 2 : 0) - G.gate.rotation.z, -2 * dt, 2 * dt); setTri(G.gateMat, o ? tone(th.goal) : th.mech); }
          const ex = M.map(m => m.type === 'lift' ? `${m.name.toLowerCase()} ${m.obj.z === 0 ? 'ground' : Math.abs(m.obj.z - m.step) < .01 ? 'first floor' : Math.abs(m.obj.z - 2 * m.step) < .01 ? 'second floor' : 'moving'}` : m.type === 'lamp' ? `${m.name.toLowerCase()} ${Math.round(m.obj.b * 100)}%` : m.type === 'seesaw' ? `spring ${Math.round(m.obj.c * 100)}%` : m.type === 'camera' ? `camera ${m.obj.at(plan.views[0]) ? 'front' : m.obj.at(plan.views[1]) ? 'side' : 'turning'}` : '').filter(Boolean);
          L.say([`keys ${P.held} of ${P.keys.length}`, ...ex].join(' · ')); });
      },
      spawn: L => ({ road: L.props.line, s: plan.half, dir: 1 }),
      // the scripted solve follows the solver's plan. In each pocket: set the turn machines and lifts; lamps and see-saws are held for the whole next leg
      solve(L, W, Rd) { const P = L.props, pid = P.pocketOf.get(W.road), here = pid !== undefined && plan.R[pid].spiral !== undefined && W.dir < 0 ? pid + UP3 : pid;
        if (here !== undefined && P.lastRoad !== W.road) { P.leg = (P.leg ?? -1) + 1; if (!sol.legs[P.leg] || sol.legs[P.leg].pocket !== here) P.offPlan = true; }
        P.lastRoad = W.road; const leg = !P.offPlan && P.leg !== undefined ? sol.legs[P.leg] : null, parked = here !== undefined && !!leg;
        let cad = 85, lifting = false;
        // a buttonless lift follows cadence all the time: hold the floor this leg needs from the pocket until the next one
        for (const m of P.M) { if (m.type !== 'lift') continue; const f = leg ? leg.cfg[m.i] : m.n; if (f >= m.n) { cad = 80; continue; } cad = f === 0 ? 45 : 55 + 15 * f; lifting = Math.abs(m.obj.z - f * m.step) > 1e-3; }
        for (const m of P.M) { if (m.type === 'lift') continue;
          if (m.type === 'lamp' || m.type === 'seesaw') { const on = !!leg && leg.cfg[m.i] === 1 && !lifting; m.obj.m.set(on); if (on && m.type === 'seesaw') cad = 88; continue; }
          if (!parked) { m.obj.m.set(false); continue; } const want = leg.cfg[m.i];
          if (m.type === 'points') { const at = m.obj.ang < .5 ? 1 : m.obj.ang > 89.5 ? 0 : -1; m.obj.m.set(at !== want); }
          else if (m.type === 'tt') { m.obj.m.set(Math.abs(m.obj.ang - m.stops[want]) > .5); }
          else if (m.type === 'camera') { m.obj.m.set(!m.obj.at(plan.views[want])); }
          else { m.obj.m.set(m.obj.state() !== want); } }
        Rd.cad = cad; },
      center: [cx, cy, 0], pts: [[Math.min(...xs) - .5, Math.min(...ys) - .5, -2.4], [Math.max(...xs) + .5, Math.max(...ys) + .5, -2.4], plan.views[1] ? [cx, cy, 0] : [lm[0], lm[1], 3.6], [cx, cy, ztop + 1.2]], pad: .8,
      decor(L) { cloudLayer(L.view, L.th, '#FFFFFF', 4, .75, .55, .95, .2); } };
  }
  // one level per seed: try sub-seeds in order until a plan passes every check; keep the reasons the others failed
  function tryPlan3(tier, sd) { const plan = planLevel3(sd, tier); if (!plan) return { bad: [plan3Why] };
    const bad = checkPlan3(plan); if (bad.length) return { bad };
    const sol = solve3(plan); if (!sol.ok) return { bad: [sol.why] };
    const why = []; if (sol.used < plan.machines.length) why.push('a machine is never needed'); if (sol.stops < tier.legs[0] || sol.stops > tier.legs[1]) why.push(`${sol.stops} stops is outside the tier`); if (plan.freeKeys > 1) why.push('free keys'); const has = t => plan.machines.some(m => t === 'hub3' ? m.type === 'tt' && m.hub : t === 'tt2' ? m.type === 'tt' : m.type === t);
    if ((plan.special || tier.must) && !has(plan.special || tier.must)) why.push('missing the tier machine'); { const nl = plan.machines.filter(m => m.type === 'lift').length; if (nl > 1) why.push('two lifts share one cadence'); if (nl && plan.machines.some(m => m.type === 'seesaw')) why.push('lift and see-saw fight over cadence'); } if (tier.camera && (sol.pj || 0) < 2) why.push('too few perspective joins on the way'); if (tier.camera && (sol.camMoves || 0) < 2) why.push('the camera turns fewer than twice'); if (tier.camera && plan.pockets.filter(p => p.key && /seen from/.test(p.where)).length < 2) why.push('fewer than two keys need perspective'); if (plan.special === 'lift' && !plan.machines.some(m => m.type === 'tt' || m.type === 'cross')) why.push('no turn machine');
    return { bad: why, plan, sol }; }
  const SUB3 = 40;
  function plan3For(tierIdx, seed) { const tier = TIERS[tierIdx], fails = [];
    for (let a = 0; a < SUB3; a++) { const sd = seed * 1000 + a, r = tryPlan3(tier, sd); if (!r.bad.length) return { seed, sub: a, sd, fails, ...r }; fails.push(...r.bad); }
    return { seed, bad: ['no pass in ' + SUB3], fails }; }
  function candidates3(tierIdx, seeds) { const out = [];
    for (const seed of seeds) { const r = plan3For(tierIdx, seed); if (r.plan) { const plan = r.plan; r.bad = []; r.sig = plan.machines.map(m => m.type === 'tt' ? (m.hub ? 'hub' : 'tt') + (m.pv ? 'p' : '') : m.type + (m.floors && m.floors.some(f => f.pv) ? 'p' : '')).sort().join('+') + '|' + plan.R.filter(x => x.key).map(x => x.where).sort().join(','); } out.push(r); }
    return out; }
  const penroseGen9 = { setCross: v => { CROSS_MAX = v; }, TIERS, planLevel3, checkPlan3, solve3, genDef3, candidates3, plan3For };
  { const q = null;
    if (q) { LEVELS.length = 0; for (const it of q.split(',')) { const [ti, sd] = it.split(':').map(Number); const r = plan3For(ti, sd); if (r.plan) LEVELS.push(genDef3(r.plan, r.sol)); } } }

  const EXTRA = (() => {
  /* ================= perspective studies: the camera and the hidden-gap rule change what a machine does ================= */
  // The camera looks down viewDir(yaw). A road placed at end - k * viewDir meets that end on screen, so it joins only at that yaw.
  const viewDir = deg => { const a = deg * Math.PI / 180; return [Math.cos(a) + Math.sin(a), Math.cos(a) - Math.sin(a), 1]; };
  const behind = (p, deg, k) => { const d = viewDir(deg); return [p[0] - k * d[0], p[1] - k * d[1], p[2] - k * d[2]]; };
  // the camera crank: a dial on a pedestal; pedalling turns the whole view, and it clicks into its detents
  function cameraCrank(L, o) {
    const th = L.th, g = L.g, [x, y, z] = o.at, det = o.detents, lo = Math.min(...det), hi = Math.max(...det), st = { ang: det[0], sweep: det[0] === lo ? 1 : -1 };
    CY(g, x, y, .6, Math.min(-2.4, z - 2.4), z - .02, tri(sp(th, 0)), 32);
    const dial = new T.Group(); dial.position.copy(V(x, y, z)); g.add(dial); const dm = tri(th.mech, { fresh: true });
    const ring = new T.Mesh(new T.RingGeometry(.36, .48, 40), basic(th.lane, { side: true })); ring.rotation.x = -Math.PI / 2; ring.position.y = .02; dial.add(ring);
    for (const d of det) { const a = d * Math.PI / 180, tick = new T.Mesh(UNIT, basic(th.lane)); tick.scale.set(.16, .03, .05); tick.position.set(.56 * Math.cos(a), .03, -.56 * Math.sin(a)); tick.rotation.y = a; dial.add(tick); }
    const needle = new T.Group(); dial.add(needle); const nm = new T.Mesh(UNIT, dm); nm.scale.set(.42, .07, .1); nm.position.set(.2, .06, 0); needle.add(nm);
    st.m = L.machine({ key: o.key, name: o.name, size: .55, place: h => { h.position.copy(V(x, y, z + .04)); g.add(h); },
      tick(dt, drive) {
        if (drive > 0) { st.ang += st.sweep * drive * 30; if (st.ang <= lo || st.ang >= hi) { st.ang = clamp(st.ang, lo, hi); st.sweep *= -1; } }
        else { const tgt = det.reduce((a, d) => Math.abs(d - st.ang) < Math.abs(a - st.ang) ? d : a, det[0]); st.ang += clamp(tgt - st.ang, -60 * dt, 60 * dt); }
        L.view.yaw = st.ang * Math.PI / 180; needle.rotation.y = st.ang * Math.PI / 180; setTri(dm, mixPal(th.mech, tone(th.goal), clamp(this.bloom.e, 0, 1)));
        const off = Math.min(...det.map(d => Math.abs(st.ang - d))); return drive > 0 ? .2 + .5 * Math.exp(-((off / 7) ** 2)) : 0; } });
    st.at = d => Math.abs(st.ang - d) < .5;
    return st;
  }
  // a hole between two road ends: it is only there while you can see it. occ() lists what may stand in front of it
  function hiddenGap(L, A, kA, B, kB, occ, o = {}) {
    const ray = new T.Raycaster(), Yax = new T.Vector3(0, 1, 0), pa = A.end(kA).p.clone(), pb = B.end(kB).p.clone();
    const meshes = () => { const out = []; for (const ob of occ()) ob.traverse(m => { if (m.isMesh) out.push(m); }); return out; };
    const hidden = () => { const d = SD.clone().applyAxisAngle(Yax, L.view.yaw), ms = meshes();
      for (let i = 0; i <= 8; i++) { const p = pa.clone().lerp(pb, i / 8); p.y -= .1; ray.set(p.clone().addScaledVector(d, 150), d.clone().negate()); const h = ray.intersectObjects(ms, false); if (!h.length || h[0].distance > 149.7) return false; }
      return true; };
    const text = o.text || 'Hidden, so the hole was not there';
    A.gaps.push({ k: kA, to: B, toK: kB, when: hidden, text }); B.gaps.push({ k: kB, to: A, toK: kA, when: hidden, text });
    A.edgeText = B.edgeText = o.edge || 'The hole was in plain sight';
    return { hidden };
  }
  // the turtle's points as plain [x, y, z] arrays, for kit.arm-like roads with posts
  const dirv = hd => { const a = hd * Math.PI / 180; return [Math.cos(a), Math.sin(a)]; };

  const PSTUDIES = [
    { id: 'p-turn', name: 'Two views of one turntable', th: () => THEMES[0], cruise: [78, 92], yaws: [0, -90],
      hint: 'The turntable (<b>Y</b>) swings its arm north or south, out over nothing. From this angle the south arm meets a road far below on screen, so the wheel rolls on. Turn the camera (<b>A</b>) a quarter and each arm meets a different road. Two stops, two views: four places to go. Change things while the wheel is on the terrace or in its cul-de-sac, never while it is out on a far road, or the way back is gone.',
      build(L) {
        const th = L.th, g = L.g, P = L.props, kit = studyKit(L); P.kit = kit;
        const line = L.road(L3([-6, 0, 4], [0, 0, 4], UP)); P.line = line; for (const x of [-4.5, -1.2]) kit.post(x, 0, 4);
        P.west = kit.pocket(-6, 0, 180, 4);
        const tt = turntable(L, { key: 'y', name: 'Turntable', pivot: [0, 0, 4], len: 3, base: 0, open: 90, detents: [-90, 90] }); tt.ang = -90; tt.sweep = 1; P.tt = tt;
        CY(g, 0, 0, .3, -2.4, 3.1, tri(sp(th, 0)), 20);
        const T1 = [0, -3, 4], T2 = [0, 3, 4], far = {};
        // south arm: a road below it from each camera angle
        for (const [nm, tip, yaw, k, hd, len, key] of [['S0', T1, 0, 3, -90, 2, true], ['Sm', T1, -90, 3, -90, 2, true], ['N0', T2, 0, 2, 90, 2, true], ['Nm', T2, -90, 2, 90, 3.2, false]]) {
          const a = behind(tip, yaw, k), dv = dirv(hd), b = [a[0] + len * dv[0], a[1] + len * dv[1], a[2]], r = kit.arm(a, b); kit.post(a[0] + .6 * dv[0], a[1] + .6 * dv[1], a[2]);
          far[nm] = { r, pocket: kit.pocket(b[0], b[1], hd, b[2], key) }; }
        P.far = far; kit.homeGate(far.Nm.r, 1);
        P.cam = cameraCrank(L, { key: 'a', name: 'Camera', at: [-7.5, -4.5, 2], detents: [0, -90] });
        kit.say = () => `keys ${kit.held} of ${kit.K.length} · turntable ${tt.ang < -89 ? 'south' : tt.ang > 89 ? 'north' : 'swinging'} · camera ${P.cam.at(0) ? 'front' : P.cam.at(-90) ? 'quarter turn' : 'turning'}`; kit.tick();
      },
      spawn: L => ({ road: L.props.line, s: 1, dir: 1 }),
      solve(L, W, R) { R.cad = 85; const P = L.props, f = P.far, tt = P.tt, cam = P.cam;
        const want = !f.S0.pocket.key.got ? [-90, 0] : !f.N0.pocket.key.got ? [90, 0] : !f.Sm.pocket.key.got ? [-90, -90] : [90, -90];
        const home = W.road === P.west || (W.road === P.line && W.dir < 0);
        tt.m.set(home && Math.abs(tt.ang - want[0]) > .5); cam.m.set(home && !cam.at(want[1])); },
      center: [-1, -1, 1], pts: [[-9.6, -11.5, -2.4], [5, 8, -2.4], [-9.6, 8, 5], [5, -11.5, 5]], pad: .8,
      decor(L) { cloudLayer(L.view, L.th, '#FFFFFF', 4, .75, .55, .95, .2); } },

    { id: 'p-lift', name: 'Floors that land elsewhere', th: () => THEMES[1], cruise: [70, 92], yaws: [0, -90],
      hint: 'The lift (<b>Y</b>) has an honest road only on the ground floor. From the front, its first floor opens onto thin air but meets a road far below on screen, with a key. Turn the camera (<b>A</b>) a quarter and the same first floor meets a different road with a second key, and the second floor meets the road home. Hold about 70 rpm for the first floor and 85 for the second, and change floors and views while the wheel rides round the deck.',
      build(L) {
        const th = L.th, g = L.g, P = L.props, kit = studyKit(L); P.kit = kit;
        const lift = faucetLift(L, { key: 'y', name: 'Lift', J: [0, 0, 0], heading: 90, step: 1.6, postPal: th.leaf, pipePal: th.leaf }); P.lift = lift;
        P.terr = kit.arm([0, -3, 0], [0, 0, 0]); P.start = kit.pocket(0, -3, -90, 0);
        const far = {};
        // each far road bends away from its neighbours, so the stacks never lie over each other on screen
        for (const [nm, f, yaw, k, len, key, turn] of [['F10', 1, 0, 4, 1.4, true, -90], ['F1m', 1, -90, 4, 1.4, true, 90], ['F2m', 2, -90, 7, 2.6, false, -90]]) {
          const a = behind([0, 0, f * 1.6], yaw, k), t = turtle(a[0], a[1], -90, a[2]).fwd(.9).arc(1.1, turn).fwd(len), r = L.road(t.pts);
          for (const s of key ? [.5, r.L - .4] : [.5]) { const q = r.at(s).p; kit.post(q.x, q.z, q.y); }
          far[nm] = { r, pocket: kit.pocket(t.x, t.y, t.h * 180 / Math.PI, t.z, key) }; }
        P.far = far; kit.homeGate(far.F2m.r, -1);
        P.cam = cameraCrank(L, { key: 'a', name: 'Camera', at: [3, -2.5, 0], detents: [0, -90] });
        kit.say = () => `keys ${kit.held} of ${kit.K.length} · lift ${lift.z === 0 ? 'ground' : lift.z === 1.6 ? 'first floor' : lift.z === 3.2 ? 'second floor' : 'moving'} · camera ${P.cam.at(0) ? 'front' : P.cam.at(-90) ? 'quarter turn' : 'turning'}`; kit.tick();
      },
      spawn: L => ({ road: L.props.terr, s: .5, dir: 1 }),
      solve(L, W, R) { const P = L.props, f = P.far, lift = P.lift, cam = P.cam;
        const want = !f.F10.pocket.key.got ? [1, 0] : !f.F1m.pocket.key.got ? [1, -90] : [2, -90];
        const onDeck = W.road === lift.deck, liftOk = Math.abs(lift.z - want[0] * 1.6) < 1e-3;
        lift.m.set(onDeck && !liftOk); cam.m.set(onDeck && !cam.at(want[1])); R.cad = onDeck && !liftOk ? 55 + 15 * want[0] : 85; },
      center: [0, -4, -1], pts: [[-9, -13, -6], [9, -13, -6], [-6, 6, 5.5], [6, 6, 5.5], [0, 6, -2.4]], pad: .8,
      decor(L) { cloudLayer(L.view, L.th, '#FFFFFF', 4, .8, .6, .95, .2); } },

    { id: 'p-curtain', name: 'The lift as a curtain', th: () => THEMES[2], cruise: [70, 92],
      hint: 'A hole you cannot see is not there. The lift (<b>Y</b>) carries the wheel to a key on the first floor at about 70 rpm. Bring it down, then send the empty lift up to the second floor at about 85 rpm. From here the deck hangs right in front of the hole in the low road, so the wheel rolls straight across. Lower the points (<b>A</b>) to reach the low road. At any other floor the hole is in plain sight and the wheel falls.',
      build(L) {
        const th = L.th, g = L.g, P = L.props, kit = studyKit(L); P.kit = kit;
        const lift = faucetLift(L, { key: 'y', name: 'Lift', J: [0, 0, 0], heading: 90, step: 3, pipeSide: 1 }); P.lift = lift;
        const terr = L.road(L3([0, -9, 0], [0, 0, 0], UP)); P.terr = terr; for (const yy of [-7, -1.5]) kit.post(.75, yy, 0);
        P.start = kit.pocket(0, -9, -90, 0);
        // first floor: out of the mouth, a quarter turn east, a key
        const t1 = turtle(0, 0, -90, 3).fwd(.6).arc(1.2, 90).fwd(2); const f1 = L.road(t1.pts); kit.post(t1.x - 1, t1.y, 3); P.k1 = kit.pocket(t1.x, t1.y, 0, 3, true); P.f1 = f1;
        // the points peel the low road off the terrace; it ramps down to the hole, then on to a key and the gate home
        const pts = peelSwitch(L, { line: terr, s: 1.5, dir: 1, side: 1, key: 'a', name: 'Points', text: 'Peeled off west' }); P.pts = pts;
        const [ex, ey, ez, eh] = pts.end, ts = turtle(ex, ey, eh, ez).arc(1.5, 45); ts.gr(-.3).fwd(3.4).gr(0).fwd(.4); const spur = L.road(ts.pts); P.spur = spur;
        const hx = ts.x, hy = ts.y, hz = ts.z, gapA = [hx - 1.7, hy, hz];
        const B1 = L.road(L3(gapA, [gapA[0] - 8.5, hy, hz], UP)); P.B1 = B1; kit.post(gapA[0] - 1.6, hy, hz); kit.post(gapA[0] - 4.2, hy, hz); for (const s of [1.4, 3]) { const q = spur.at(s).p; kit.post(q.x, q.z, q.y); }
        P.k2 = kit.pocket(gapA[0] - 8.5, hy, 180, hz, true); kit.homeGate(B1, 1);
        P.hole = hiddenGap(L, spur, 1, B1, 0, () => [lift.dg], { edge: 'The hole was in plain sight' });
        kit.say = () => `keys ${kit.held} of ${kit.K.length} · lift ${lift.z === 0 ? 'ground' : lift.z === 3 ? 'first floor' : lift.z === 6 ? 'second floor' : 'moving'} · hole ${P.hole.hidden() ? 'hidden' : 'in sight'}`; kit.tick();
      },
      spawn: L => ({ road: L.props.terr, s: 4, dir: 1 }),
      solve(L, W, R) { const P = L.props, lift = P.lift, k1 = P.k1.key.got, onDeck = W.road === lift.deck;
        // first the key upstairs; then, with the wheel off the deck, send the lift to the second floor and take the low road
        const want = !k1 ? (onDeck || W.road === P.f1 || W.road === P.k1 ? 1 : 0) : (onDeck ? 0 : 2), ok = Math.abs(lift.z - want * 3) < 1e-3;
        const may = !k1 ? onDeck : (onDeck || W.road === P.start || (W.road === P.terr && W.dir < 0));
        lift.m.set(may && !ok); R.cad = may && !ok ? (want === 0 ? 45 : 55 + 15 * want) : 85;
        const peel = k1 && !onDeck; P.pts.m.set((peel ? P.pts.ang > .5 : P.pts.ang < 89.5) && (W.road === P.start || (W.road === P.terr && W.dir < 0) || onDeck)); },
      center: [-3, -3, 0], pts: [[-18, -7, -2.4], [7, -11, -2.4], [-4, 6, 7.5], [5, 6, -2.4]], pad: .8,
      decor(L) { cloudLayer(L.view, L.th, '#FFFFFF', 4, .8, .6, .95, .2); } }
  ];
  /* ================= more machines: tide, buttonless cadence lift, wind vane, gyroscope roll ================= */
  const effort2 = () => rider.effort ?? powerOf(rider.cad, rider.gear, 0);
  // the gyroscope: a dial whose needle rolls the whole view through its detents while held
  function gyroCrank(L, o) {
    const th = L.th, g = L.g, [x, y, z] = o.at, det = o.detents, lo = Math.min(...det), hi = Math.max(...det), st = { ang: 0, sweep: 1 };
    CY(g, x, y, .6, Math.min(-2.4, z - 2.4), z - .02, tri(sp(th, 0)), 32);
    const ring = new T.Group(); ring.position.copy(V(x, y, z + .9)); g.add(ring);
    const rm = tri(th.mech, { fresh: true }); const tor = new T.Mesh(new T.TorusGeometry(.55, .06, 8, 40), rm); ring.add(tor); const tor2 = new T.Mesh(new T.TorusGeometry(.42, .05, 8, 40), basic(th.lane)); tor2.rotation.y = Math.PI / 2; ring.add(tor2);
    CY(g, x, y, .06, z, z + .35, tri(th.mechDark || th.idle), 8);
    st.m = L.machine({ key: o.key, name: o.name, size: .55, place: h => { h.position.copy(V(x, y, z + .04)); g.add(h); },
      tick(dt, drive) {
        if (drive > 0) { st.ang += st.sweep * drive * 30; if (st.ang <= lo || st.ang >= hi) { st.ang = clamp(st.ang, lo, hi); st.sweep *= -1; } }
        else { const tgt = det.reduce((a, d) => Math.abs(d - st.ang) < Math.abs(a - st.ang) ? d : a, det[0]); st.ang += clamp(tgt - st.ang, -60 * dt, 60 * dt); }
        L.view.roll = st.ang * Math.PI / 180; tor.rotation.z = st.ang * Math.PI / 180; setTri(rm, mixPal(th.mech, tone(th.goal), clamp(this.bloom.e, 0, 1)));
        const off = Math.min(...det.map(d => Math.abs(st.ang - d))); return drive > 0 ? .2 + .5 * Math.exp(-((off / 7) ** 2)) : 0; } });
    st.at = d => Math.abs(st.ang - d) < .5;
    return st;
  }
  const loopPts = (x0, y0, x1, y1, z, r = 1) => filletPath([[(x0 + x1) / 2, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z], [x0, y0, z], [(x0 + x1) / 2, y0, z]], r);
  const sAt = (rd, p) => { let best = 0, bd = 1e9; for (let s = 0; s <= rd.L; s += .02) { const q = rd.at(s).p, d = Math.hypot(q.x - p[0], q.z - p[1], q.y - p[2]); if (d < bd) { bd = d; best = s; } } return best; };

  // how steeply a road runs down the screen at its start (1 = straight down)
  const downhill = (L, rd) => { const a = rd.at(0).p, b = rd.at(Math.min(.5, rd.L)).p, d = L.v2(b).sub(L.v2(a)).normalize(); return -d.y; };
  // a plumb bob that always hangs straight down the screen, marking a junction where the wheel rolls downhill
  function plumb(L, p) {
    const th = L.th, pg = new T.Group(); pg.position.copy(V(...p)); L.g.add(pg);
    const rod = new T.Mesh(UNIT, tri(th.mechDark || th.idle)); rod.scale.set(.06, 1.0, .06); rod.position.y = -.5; pg.add(rod);
    const bm = basic(th.goal), bob = new T.Mesh(new T.ConeGeometry(.24, .5, 16), bm); bob.rotation.x = Math.PI; bob.position.y = -1.2; pg.add(bob);
    const pin = new T.Mesh(new T.SphereGeometry(.12, 10, 8), tri(th.mech)); pg.add(pin);
    L.view.updaters.push(() => pg.quaternion.copy(L.view.camera.quaternion));
    return { set: on => bm.color.set(on ? '#FFFFFF' : th.goal) };
  }
  // a slab under a closed loop, drawn as four sides so the middle stays open
  function loopSlab(g, x0, y0, x1, y1, z, mat, w = .9) {
    B(g, x0, y0, z - 1.9, x1, y0 + w, z, mat); B(g, x0, y1 - w, z - 1.9, x1, y1, z, mat);
    B(g, x0, y0 + w, z - 1.9, x0 + w, y1 - w, z, mat); B(g, x1 - w, y0 + w, z - 1.9, x1, y1 - w, z, mat);
  }
  const MSTUDIES = [
    { id: 'm-lift', name: 'Cadence picks the floor', th: () => THEMES[1], cruise: [50, 92],
      hint: 'The lift has no button: your cadence fills its water column all the time, wherever the wheel is. About 55 rpm brings the deck to the ground, 70 to the first floor, 85 to the second. Loops hold the wheel, and it leaves a loop only where a piece completes the road straight ahead. Spin slowly so the deck sits on the ground and its arm completes the road out of your loop, then spin up to 85 rpm while you lap the deck: at the second floor its other arm meets the road home.',
      build(L) {
        const th = L.th, g = L.g, P = L.props, step = 1.8, top = 3 * step, floors = [0, step, 2 * step, top], st = { lvl: 0, z: 0 }; P.lift = st;
        // the ground loop, held until the deck is down
        const G = L.road(loopPts(-5.6, -1, -.9, 1.6, 0, .6), { closed: true, pal: tone('#E9D7AE') }); P.G = G; loopSlab(g, -6.1, -1.5, -.4, 2.1, -.5, tri(th.turf), .9);
        // the deck: an arm in from the ground loop, a loop to hold the wheel, an arm out east
        const dg = new T.Group(); g.add(dg); st.dg = dg;
        B(dg, -.3, -1.5, -.3, 4.1, 2.1, -.03, tri(th.idle));
        const armW = L.road(L3([-1.5, -1, .006], [1.8, -1, .006], UP), { g: dg, pal: tone('#F3E6C4') }); P.armW = armW;
        const D = L.road(loopPts(.4, -1, 3.6, 1.6, 0, .8), { g: dg, closed: true, pal: tone('#F3E6C4') }); P.D = D;
        armW.joins = [{ k: 1, to: D, s: sAt(D, [2, -1, 0]) + .02, dir: 1 }];
        const armE = L.road(L3([2.8, -1, .006], [5, -1, .006], UP), { g: dg, pal: tone('#F3E6C4') }); P.armE = armE;
        G.forks.push({ s: sAt(G, [-1.5, -1, 0]), dir: 1, to: armW, toK: 0, when: () => st.z === 0, text: 'The deck is down, so the road runs on' });
        D.forks.push({ s: sAt(D, [2.8, -1, 0]), dir: 1, to: armE, toK: 0, when: () => st.z === 2 * step, text: 'Second floor: the arm meets the road' });
        const f2 = L.road(L3([5, -1, 2 * step], [10, -1, 2 * step], UP), { goal: true }); B(g, 5, -1.5, -2.4, 6, -.5, 2 * step - .5, tri(sp(th, 0))); B(g, 9.2, -1.5, -2.4, 10.4, -.5, 2 * step - .5, tri(sp(th, 0)));
        // the slim water column under the deck loop
        const ccx = 2, ccy = .3; B(g, -.5, -1.7, -2.6, 4.3, 2.3, -2.2, tri(sp(th, 0)));
        const glass = CY(g, ccx, ccy, .46, -2.2, -.8, tri({ t: '#E9FBFF', l: '#BFE8F2', r: '#9AD3E2' }, { opacity: .35 }), 24);
        const water = CY(g, ccx, ccy, .36, -2.2, -.8, tri({ t: '#8FDCEF', l: '#55B9D2', r: '#3C9BB6' }, { opacity: .9 }), 20);
        for (const [x, y, s] of [[-7, -1.4, 1], [-7.2, 2.4, .8]]) { CY(g, x, y, .1 * s, -.5, .6 * s, tri(tone('#9B7046')), 8); const c = new T.Mesh(new T.IcosahedronGeometry(.6 * s, 0), tri(th.leaf)); at(g, c, x, y, .6 * s + .5 * s); }
        (L.drags ||= []).push(() => st.moving ? .2 : 0);
        L.view.updaters.push((t, dt) => { if (L.state !== 'play') return;
          const target = clamp((rider.cad - 55) / 45, 0, 1) * top, prev = st.lvl; st.lvl += clamp(target - st.lvl, -1.35 * dt, 1.35 * dt); st.moving = Math.abs(st.lvl - prev) > 1e-4;
          let z = st.lvl; for (const f of floors) if (Math.abs(st.lvl - f) < .5) z = f; st.z = z; dg.position.y = z;
          const gh = z - .3 + 2.2; glass.scale.y = gh; glass.position.y = -2.2 + gh / 2; const wh = Math.max(.02, z - .35 + 2.2); water.scale.y = wh; water.position.y = -2.2 + wh / 2;
          L.say(`cadence ${Math.round(rider.cad)} rpm · deck ${z === 0 ? 'on the ground' : z === step ? 'first floor' : z === 2 * step ? 'second floor' : z === top ? 'third floor' : 'between floors'}`); });
      },
      spawn: L => ({ road: L.props.G, s: 1, dir: 1 }),
      solve(L, W, R) { const P = L.props, onDeck = W.road === P.armW || W.road === P.D || W.road === P.armE || (W.road && W.road.goal); R.cad = onDeck ? 85 : 52; R.gear = 4; },
      center: [2, 0, 1.6], pts: [[-6.1, -1.5, 0], [10.4, -1.5, 0], [10.4, -.5, 3.6], [4.3, 2.3, 6], [-.5, -1.7, 6], [-6.1, 2.1, -2.4], [10.4, -.5, -2.6], [4.3, 2.3, -2.6]],
      decor(L) { cloudLayer(L.view, L.th, '#FFFFFF', 4, .8, .6, .95, .2); drift(L.view, TEX.petal, '#FFB5CE', 10, .14, { vx: .25, vy: -.15, spin: 1.2 }); } },

    { id: 'm-tide', name: 'The tide follows you', th: () => THEMES[2], cruise: [70, 92],
      hint: 'No button. The sea follows your average effort over the last quarter of a minute, wherever the wheel is: ride hard and the tide comes in, ease off and it goes out. The raft floats on it with a loop to hold the wheel and an arm at each end. At high tide its west arm completes the road out of the quay loop; at low tide its east arm meets the lower quay. Push until the wheel is on the raft, then ease off and let the tide carry you down.',
      build(L) {
        const th = L.th, g = L.g, P = L.props, HI = 1.6, TAU_S = 15, st = { avg: effort2(), z: 0, lvl: 0 }; P.tide = st;
        const U = L.road(loopPts(-6.6, -1.2, -1, 1.4, HI, .6), { closed: true }); P.U = U;
        { const m = tri(sp(th, 0)), z = HI - .5; B(g, -7.1, -1.7, z - 1.9, -2, -.7, z, m); B(g, -7.1, .9, z - 1.9, -.5, 1.9, z, m); B(g, -7.1, -.7, z - 1.9, -6.1, .9, z, m); B(g, -1.5, -.4, z - 1.9, -.5, .9, z, m); }
        const pg = new T.Group(); g.add(pg);
        B(pg, -.4, -1.7, -.5, 4.6, 2, -.2, tri(tone('#B98552')));
        for (const [x, y] of [[0, -1.4], [4.2, -1.4], [0, 1.7], [4.2, 1.7]]) { const barrel = CY(pg, x, y, .32, -.95, -.45, tri(tone('#C0623E')), 16); }
        const armW = L.road(L3([-1.6, -1.2, .006], [2.6, -1.2, .006], UP), { g: pg, pal: tone('#E8C9A0') }); P.armW = armW;
        const R0 = L.road(loopPts(1.2, -1.2, 4, 1.5, 0, .8), { g: pg, closed: true, pal: tone('#E8C9A0') }); P.R0 = R0;
        armW.joins = [{ k: 1, to: R0, s: sAt(R0, [2.6, -1.2, 0]) + .02, dir: 1 }];
        const armE = L.road(L3([3.2, -1.2, .006], [5.6, -1.2, .006], UP), { g: pg, pal: tone('#E8C9A0') }); P.armE = armE;
        U.forks.push({ s: sAt(U, [-1.6, -1.2, HI]), dir: 1, to: armW, toK: 0, when: () => st.z === HI, text: 'High tide: the raft completes the road' });
        R0.forks.push({ s: sAt(R0, [3.2, -1.2, 0]), dir: 1, to: armE, toK: 0, when: () => st.z === 0, text: 'Low tide: the raft meets the lower quay' });
        const low = L.road(L3([5.6, -1.2, 0], [10.5, -1.2, 0], UP), { goal: true }); P.low = low;
        B(g, 5.6, -1.7, -2.4, 10.8, -.7, -.5, tri(sp(th, 1)));
        for (const x of [-6.2, -4.2]) onFace(g, 'y', -1.7, x, -.8, archGeo(.36, .8), basic(th.win ? th.win.r : th.mech));
        const seaMat = tri({ t: '#7FC8E8', l: '#4FA6CC', r: '#3A8DB5' }, { fresh: true, opacity: .62 }), sea = B(g, -11, -6, -3, 12, 6, -1, seaMat);
        CY(g, -3.8, .1, .08, -2.4, HI + 1.8, tri(th.mechDark || th.idle), 8); const fl = CY(g, -3.8, .1, .22, 0, .2, basic(th.goal), 14);
        for (const z of [-.45, HI - .45]) B(g, -4.1, .04, z - .03, -3.5, .16, z + .03, basic('#FFFFFF'));
        L.view.updaters.push((t, dt) => { if (L.state !== 'play') return; const e = effort2(); st.e = e; st.avg += (e - st.avg) * Math.min(1, dt / TAU_S);
          const want = clamp((st.avg - 100) / 40, 0, 1) * HI; st.lvl += clamp(want - st.lvl, -.12 * dt, .12 * dt);
          let z = st.lvl; for (const f of [0, HI]) if (Math.abs(st.lvl - f) < .26) z = f; st.z = z; pg.position.y = z;
          const top = z - .45; sea.scale.y = top + 3; sea.position.y = (top - 3) / 2; fl.position.y = top + .1;
          L.say(`effort ${Math.round(e)} · average ${Math.round(st.avg)} · tide ${z === HI ? 'in' : z === 0 ? 'out' : Math.round(z / HI * 100) + '%'}`); });
      },
      spawn: L => ({ road: L.props.U, s: 1, dir: 1 }),
      solve(L, W, R) { const P = L.props, on = W.road === P.armW || W.road === P.R0 || W.road === P.armE || W.road === P.low; R.cad = on ? 70 : 96; R.gear = on ? 4 : 6; },
      center: [1, 0, .4], pts: [[-7.1, -1.7, 0], [10.8, -1.7, 0], [-7.1, 1.9, 1.6], [10.8, -.7, -2.4], [-3.8, .1, 3.4], [-11, -6, -1], [12, 6, -1]], pad: .6,
      decor(L) { cloudLayer(L.view, L.th, '#FFFFFF', 4, .8, .6, .95, .2); } },

    { id: 'c-tide', name: 'Low tide, high road', th: () => THEMES[2], cruise: [70, 92], yaws: [0, 90],
      hint: 'The sea follows your average effort over the last quarter of a minute: ride hard and the tide comes in, ease off and it goes out. At high tide the raft\'s west arm completes the road out of the quay loop. At low tide its east arm points out to sea, and the lighthouse road stands far off to one side, high above the water. Turn the camera (<b>Y</b>) a quarter turn and the two meet on screen. Push until the wheel is on the raft, ease off to let the tide out, then turn the view: going down is the way up.',
      build(L) {
        const th = L.th, g = L.g, P = L.props, HI = 1.6, TAU_S = 15, st = { avg: effort2(), z: 0, lvl: 0 }; P.tide = st;
        const U = L.road(loopPts(-6.6, -1.2, -1, 1.4, HI, .6), { closed: true }); P.U = U;
        { const m = tri(sp(th, 0)), z = HI - .5; B(g, -7.1, -1.7, z - 1.9, -2, -.7, z, m); B(g, -7.1, .9, z - 1.9, -.5, 1.9, z, m); B(g, -7.1, -.7, z - 1.9, -6.1, .9, z, m); B(g, -1.5, -.4, z - 1.9, -.5, .9, z, m); }
        const pg = new T.Group(); g.add(pg);
        B(pg, -.4, -1.7, -.5, 4.6, 2, -.2, tri(tone('#B98552')));
        for (const [x, y] of [[0, -1.4], [4.2, -1.4], [0, 1.7], [4.2, 1.7]]) { const barrel = CY(pg, x, y, .32, -.95, -.45, tri(tone('#C0623E')), 16); }
        const armW = L.road(L3([-1.6, -1.2, .006], [2.6, -1.2, .006], UP), { g: pg, pal: tone('#E8C9A0') }); P.armW = armW;
        const R0 = L.road(loopPts(1.2, -1.2, 4, 1.5, 0, .8), { g: pg, closed: true, pal: tone('#E8C9A0') }); P.R0 = R0;
        armW.joins = [{ k: 1, to: R0, s: sAt(R0, [2.6, -1.2, 0]) + .02, dir: 1 }];
        const armE = L.road(L3([3.2, -1.2, .006], [5.6, -1.2, .006], UP), { g: pg, pal: tone('#E8C9A0') }); P.armE = armE;
        U.forks.push({ s: sAt(U, [-1.6, -1.2, HI]), dir: 1, to: armW, toK: 0, when: () => st.z === HI, text: 'High tide: the raft completes the road' });
        R0.forks.push({ s: sAt(R0, [3.2, -1.2, 0]), dir: 1, to: armE, toK: 0, when: () => st.z === 0, text: 'Low tide: the arm lines up with the lighthouse road' });
        // the lighthouse road: from the turned camera, 4.5 m nearer and 4.5 m higher than the arm's end at low tide, so they meet only on screen, and only from there
        const LH = behind([5.6, -1.2, 0], 90, -4.5), low = L.road(L3(LH, [LH[0] + 4.4, LH[1], LH[2]], UP), { goal: true }); P.low = low;
        { const [hx, hy, hz] = [LH[0] + 3.6, LH[1], LH[2]]; CY(g, hx, hy, .75, -3, hz - .52, tri(sp(th, 0)), 20); for (let k = 0; k < 4; k++) CY(g, hx, hy, .77, hz - 1.2 - k * 1.6, hz - .9 - k * 1.6, basic('#E8553B'), 20); B(g, LH[0] - .2, LH[1] - .5, hz - .9, LH[0] + 2.6, LH[1] + .5, hz - .5, tri(sp(th, 1))); }
        for (const x of [-6.2, -4.2]) onFace(g, 'y', -1.7, x, -.8, archGeo(.36, .8), basic(th.win ? th.win.r : th.mech));
        const seaMat = tri({ t: '#7FC8E8', l: '#4FA6CC', r: '#3A8DB5' }, { fresh: true, opacity: .62 }), sea = B(g, -11, -6, -3, 12, 6, -1, seaMat);
        CY(g, -3.8, .1, .08, -2.4, HI + 1.8, tri(th.mechDark || th.idle), 8); const fl = CY(g, -3.8, .1, .22, 0, .2, basic(th.goal), 14);
        for (const z of [-.45, HI - .45]) B(g, -4.1, .04, z - .03, -3.5, .16, z + .03, basic('#FFFFFF'));
        L.view.updaters.push((t, dt) => { if (L.state !== 'play') return; const e = effort2(); st.e = e; st.avg += (e - st.avg) * Math.min(1, dt / TAU_S);
          const want = clamp((st.avg - 100) / 40, 0, 1) * HI; st.lvl += clamp(want - st.lvl, -.12 * dt, .12 * dt);
          let z = st.lvl; for (const f of [0, HI]) if (Math.abs(st.lvl - f) < .26) z = f; st.z = z; pg.position.y = z;
          const top = z - .45; sea.scale.y = top + 3; sea.position.y = (top - 3) / 2; fl.position.y = top + .1;
          L.say(`effort ${Math.round(e)} · average ${Math.round(st.avg)} · tide ${z === HI ? 'in' : z === 0 ? 'out' : Math.round(z / HI * 100) + '%'} · camera ${P.cam.at(0) ? 'front' : P.cam.at(90) ? 'turned 90°' : 'turning'}`); });
        P.cam = cameraCrank(L, { key: 'y', name: 'Camera', at: clearSpot(L, [[-9, 3, 0], [-9, -3, 0], [-4, 4, 0], [2, 4.5, 0], [-4, -4.5, 0], [7, 4, 0]], [0, 90]), detents: [0, 90] });
      },
      spawn: L => ({ road: L.props.U, s: 1, dir: 1 }),
      solve(L, W, R) { const P = L.props, on = W.road === P.armW || W.road === P.R0 || W.road === P.armE || W.road === P.low; R.cad = on ? 70 : 96; R.gear = on ? 4 : 6;
        const want = (W.road === P.R0 && P.tide.z === 0) || W.road === P.armE || W.road === P.low ? 90 : 0; P.cam.m.set(!P.cam.at(want)); },
      center: [1, 0, .4], pts: [[-7.1, -1.7, 0], [10.8, -1.7, 0], [-7.1, 1.9, 1.6], [10.8, -.7, -2.4], [-3.8, .1, 3.4], [-11, -6, -1], [12, 6, -1], [14.5, -5.2, 4.5], [13.7, -5.7, -3]], pad: .6,
      decor(L) { cloudLayer(L.view, L.th, '#FFFFFF', 4, .8, .6, .95, .2); } },

    { id: 'm-gyro', name: 'Endless stairs', th: () => THEMES[0], cruise: [70, 92], yaws: [0, 90],
      hint: 'Two endless staircases. Each one climbs all the way round and arrives back where it began, but only from one camera angle: in 3D its top step floats high above its bottom step, and the camera lines them up. Turn the camera (<b>Y</b>) and the first staircase splits open; its top step now lines up with a short landing that runs into the second staircase, which is closed from this angle. Turn back and the second one splits open onto the road home.',
      build(L) {
        const P = L.props, c = { A0: 5, B0: 4, s0g: -1, k: 5, Lx: 4, A1: 4, B1: 4, s1g: 1, kh: -5, rise: 2 }, YB = 90;
        const s0 = stairPts([0, 0, 0], 0, 2, c.A0, c.B0, 1.6, c.s0g); P.s0 = L.road(s0.samples, { seam: 0, edgeText: 'The stairs did not meet at this angle' });
        const X0 = behind(s0.end, YB, c.k), X1 = [X0[0] + c.Lx, X0[1], X0[2]]; P.land = L.road(L3(X0, X1, UP), { pal: tone('#F4C3A8') });
        const s1 = stairPts(X1, YB, 2, c.A1, c.B1, 1.6, c.s1g); P.s1 = L.road(s1.samples, { pal: tone('#F4C3A8'), seam: YB, edgeText: 'The stairs did not meet at this angle' });
        const H = behind(s1.end, 0, c.kh), home = L.road(L3(H, [H[0] + 4, H[1], H[2]], UP), { goal: true }); P.home = home;
        const cam = cameraCrank(L, { key: 'y', name: 'Camera', at: [-2.5, -6.5, 0], detents: [0, YB] }); P.cam = cam;
        L.view.updaters.push(() => L.say(`camera ${cam.at(0) ? 'front' : cam.at(YB) ? 'turned 90°' : 'turning'}`));
      },
      spawn: L => ({ road: L.props.s0, s: 1, dir: 1 }),
      solve(L, W, R) { R.cad = 80; const P = L.props, want = W.road === P.s0 || W.road === P.land ? 90 : W.road === P.s1 ? 0 : null; P.cam.m.set(want !== null && !P.cam.at(want)); },
      center: [3, -2, 0], pts: [[-3, -7, 0]], pad: .8,
      decor(L) { cloudLayer(L.view, L.th, '#FFFFFF', 4, .75, .55, .95, .2); } },

    { id: 'm-wind', name: 'Into the wind', th: () => THEMES[3], cruise: [70, 92],
      hint: 'The wind sock (<b>Y</b>) turns the wind round, a quarter at a time and always the same way,, and always streams the way the wind blows. Riding into the wind is heavier; with it at your back, lighter. The loop holds the wheel, and it rides on north across the drawbridge only once the bridge is down. The windmill inside the loop lowers the bridge only while the wind blows from the north, which is exactly the wind you then have to ride into.',
      build(L) {
        const th = L.th, g = L.g, P = L.props, st = { a: 180, sweep: -1 }; P.wind = st;
        const S = L.road(loopPts(-6, -1, 1.5, 6.6, 0, .6), { closed: true }); P.S = S; loopSlab(g, -6.5, -1.5, 2, 7.1, -.5, tri(sp(th, 0)), 1);
        const hg = new T.Group(); hg.position.copy(V(1.5, 8.2, 0)); g.add(hg);
        const bridge = L.road(L3([0, -2.2, 0], [0, 0, 0], UP), { g: hg, pal: tone('#C98B5B') }); P.bridge = bridge;
        S.forks.push({ s: sAt(S, [1.5, 6, 0]), dir: 1, to: bridge, toK: 0, when: () => hg.rotation.x === 0, text: 'The drawbridge is down, so the road runs on' });
        const home = L.road(L3([1.5, 8.2, 0], [1.5, 11.8, 0], UP), { goal: true }); home.landDir = 1; P.home = home; B(g, .4, 8.2, -2.4, 2.6, 11.9, -.5, tri(sp(th, 0)));
        B(g, -1.3, 4.1, -2.4, -.3, 5.1, 2.6, tri(sp(th, 2))); const rot = new T.Group(); rot.position.copy(V(-.8, 5.2, 2.2)); g.add(rot);
        for (let k = 0; k < 4; k++) { const bl = new T.Mesh(UNIT, tri(th.mech)); bl.scale.set(.16, 1.1, .04); bl.position.y = .55; const arm = new T.Group(); arm.rotation.z = k * Math.PI / 2; arm.add(bl); rot.add(arm); }
        // the wind sock: a striped cone on a mast that streams downwind
        const [sx, sy] = [-4, 3.6]; CY(g, sx, sy, .5, -2.4, -.02, tri(sp(th, 0)), 24); CY(g, sx, sy, .06, 0, 1.4, tri(th.mechDark || th.idle), 8);
        const sock = new T.Group(); sock.position.copy(V(sx, sy, 1.25)); g.add(sock); const hoop = new T.Mesh(new T.TorusGeometry(.24, .03, 6, 20), tri(th.mechDark || th.idle)); hoop.rotation.y = Math.PI / 2; sock.add(hoop);
        const cone = new T.Group(); sock.add(cone);
        for (let k = 0; k < 4; k++) { const r0 = .24 - k * .035, r1 = .24 - (k + 1) * .035, seg = new T.Mesh(new T.CylinderGeometry(r1, r0, .3, 18, 1, true), basic(k % 2 ? '#FFFFFF' : '#E8553B', { side: true })); seg.rotation.z = -Math.PI / 2; seg.position.x = .15 + k * .3; cone.add(seg); }
        const det = [0, 90, 180, 270];
        st.m = L.machine({ key: 'y', name: 'Wind sock', size: .55, place: h => { h.position.copy(V(sx, sy, .04)); g.add(h); },
          tick(dt, drive) { if (drive > 0) { st.a += drive * 40; if (st.a >= 360) st.a -= 360; }
            else { const tgt = [...det, 360].reduce((a, d) => Math.abs(d - st.a) < Math.abs(a - st.a) ? d : a, 0); st.a += clamp(tgt - st.a, -60 * dt, 60 * dt); if (st.a >= 359.99) st.a = 0; }
            return drive > 0 ? .3 : 0; } });
        st.at = d => Math.abs(st.a - d) < .5;
        const headOn = () => { const r = L.W && L.W.road; if (!r || L.W.mode !== 'road') return 0; const d = r.at(L.W.s).d.clone().multiplyScalar(L.W.dir), a = st.a * Math.PI / 180; return d.x * Math.cos(a) + d.z * Math.sin(a); };
        (L.drags ||= []).push(() => { const h = headOn(); return h > 0 ? .4 * h : .15 * h; });
        L.view.updaters.push((t, dt) => { const steady = det.some(d => st.at(d)); sock.rotation.y = -(st.a + 180) * Math.PI / 180; cone.rotation.z = steady ? -.05 + .04 * Math.sin(t * 7) : -.7; const north = st.at(90); rot.rotation.z += dt * (north ? 2.4 : .2);
          hg.rotation.x += clamp((north ? 0 : 1.1) - hg.rotation.x, -.8 * dt, .8 * dt); if (Math.abs(hg.rotation.x) < .01) hg.rotation.x = 0;
          const h = headOn();
          L.say(`wind from the ${['east', 'north', 'west', 'south'][Math.round(st.a / 90) % 4]}${steady ? '' : ' (turning)'} · ${h > .7 ? 'headwind' : h < -.7 ? 'tailwind' : 'crosswind'} · drawbridge ${hg.rotation.x === 0 ? 'down' : 'up'}`); });
      },
      spawn: L => ({ road: L.props.S, s: 1, dir: 1 }),
      solve(L, W, R) { const P = L.props, st = P.wind; st.m.set(!st.at(90)); R.cad = 80; R.gear = 4; },
      center: [-1, 4.5, .2], pts: [[-6.5, -1.5, 0], [2, -1.5, 0], [2.6, 11.9, 0], [-6.5, 7.1, 0], [-.8, 5.2, 4], [-4, 3.6, 1.7], [-6.5, -1.5, -2.4], [2.6, 11.9, -2.4]], pad: 1,
      decor(L) { cloudLayer(L.view, L.th, '#FFFFFF', 4, .8, .6, .95, .2); drift(L.view, TEX.petal, '#FFE0F0', 10, .12, { vx: .3, vy: -.1, spin: 1 }); } },

  ];
  function HI_T() { return 1.6; }
  /* ================= combined levels: camera turns, impossible stairs, holes that exist only while seen ================= */
  // cut a list of samples ({p, n}) into [0, a] and [b, end] by arc length, leaving a hole between a and b
  function cutSamples(S, a, b) {
    const d = (u, v) => Math.hypot(u[0] - v[0], u[1] - v[1], u[2] - v[2]), lerp = (u, v, f) => u.map((x, i) => x + (v[i] - x) * f);
    const A = [S[0]], Bs = []; let c = 0;
    for (let i = 1; i < S.length; i++) { const l = d(S[i - 1].p, S[i].p), c1 = c + l;
      if (c < a && c1 >= a) A.push({ p: lerp(S[i - 1].p, S[i].p, (a - c) / l), n: S[i].n }); else if (c1 < a) A.push(S[i]);
      if (c < b && c1 >= b) Bs.push({ p: lerp(S[i - 1].p, S[i].p, (b - c) / l), n: S[i].n }); if (c1 > b) Bs.push(S[i]);
      c = c1; }
    return [A, Bs];
  }
  // a staircase that climbs round four legs (north first when sgn is 1, south first when -1) and ends at start + rise * viewDir(yaw):
  // closed on screen at that yaw only
  function stairPts(S, yaw, rise, A, B, e, sgn = 1) {
    const vd = viewDir(yaw), C = A + e - vd[0] * rise, D = B - sgn * vd[1] * rise;
    const xs = [[0, 0], [A, 0], [A, sgn * B], [A - C, sgn * B], [A - C, sgn * (B - D)], [A - C + e, sgn * (B - D)]].map(q => [S[0] + q[0], S[1] + q[1]]);
    let tot = 0; const cum = [0]; for (let i = 1; i < xs.length; i++) { tot += Math.hypot(xs[i][0] - xs[i - 1][0], xs[i][1] - xs[i - 1][1]); cum.push(tot); }
    const pts = xs.map((q, i) => [q[0], q[1], S[2] + rise * cum[i] / tot]);
    return { samples: filletPath(pts, .7), end: pts[pts.length - 1], pts };
  }
  // a stone tower with arched windows, x0..x1 by y0..y1, from deep below up to z1
  function tower(L, x0, y0, x1, y1, z1, pal) {
    const th = L.th, m = tri(pal || sp(th, 0)), tg = new T.Group(); L.g.add(tg); B(tg, x0, y0, z1 - 9, x1, y1, z1, m); B(tg, x0 - .12, y0 - .12, z1, x1 + .12, y1 + .12, z1 + .18, tri(th.mechDark || th.idle));
    for (let z = z1 - 1.2; z > z1 - 5; z -= 1.5) { onFace(tg, 'x', x1, (y0 + y1) / 2, z - .4, archGeo(.3, .62), basic(th.win ? th.win.r : th.mech)); onFace(tg, 'y', y1, (x0 + x1) / 2, z - .4, archGeo(.3, .62), basic(th.win ? th.win.l : th.mech)); }
    return tg;
  }
  // --- placing scenery so the player always sees the track: a box (three.js coords [x0, y0, z0, x1, y1, z1]) is scored by
  // how many road samples it would stand in front of, from each camera angle, or run through
  const Yax3 = new T.Vector3(0, 1, 0), toCam = deg => SD.clone().applyAxisAngle(Yax3, deg * Math.PI / 180);
  function boxMesh(b) { const m = new T.Mesh(UNIT); m.scale.set(b[3] - b[0], b[4] - b[1], b[5] - b[2]); m.position.set((b[0] + b[3]) / 2, (b[1] + b[4]) / 2, (b[2] + b[5]) / 2); m.updateMatrixWorld(true); return m; }
  function coverCount(L, b, yaws, skip = () => false, roads = L.roads) {
    const m = boxMesh(b), ray = new T.Raycaster(); let n = 0;
    for (const r of roads) for (let s = 0; s <= r.L; s += .4) { const p = r.at(s).p; if (skip(p)) continue;
      if (p.x > b[0] - .7 && p.x < b[3] + .7 && p.z > b[2] - .7 && p.z < b[5] + .7 && p.y > b[1] - .8 && p.y < b[4] + .8) { n += 50; continue; }
      const wgt = r.closed || (s > 2.5 && s < r.L - 2.5) ? 1 : 5;
      for (const y of yaws) { const d = toCam(y); ray.set(p.clone().addScaledVector(d, 100), d.clone().negate()); const h = ray.intersectObject(m, false); if (h.length && h[0].distance < 99.8) n += wgt; } }
    return n;
  }
  // does a box hide every point of the hole between two road ends from this angle?
  function hidesGap(b, pa, pb, yaw) { const m = Array.isArray(b) && typeof b[0] !== 'number' ? b : [boxMesh(b)], ray = new T.Raycaster(), d = toCam(yaw);
    for (let i = 0; i <= 8; i++) { const p = pa.clone().lerp(pb, i / 8); p.y -= .1; ray.set(p.clone().addScaledVector(d, 150), d.clone().negate()); const h = ray.intersectObjects(m, false); if (!h.length || h[0].distance > 149.7) return false; }
    return true; }
  // spots along a path (arc length a, hole of length len) that the given meshes hide from yawHide but not from the other angles
  function hiddenSpots(samples, meshes, yawHide, others, len = 1.2, from = 1, upto = 1e9) {
    const r = new Road(samples), out = [];
    for (let a = from; a + len < Math.min(r.L - 2, upto); a += .2) { const pa = r.at(a).p, pb = r.at(a + len).p; if (hidesGap(meshes, pa, pb, yawHide) && !others.some(y => hidesGap(meshes, pa, pb, y))) out.push(a); }
    return out;
  }
  const ghostDeck = samples => { const m = ribbon(new Road(samples), 1, .5, tri({ t: '#fff', l: '#fff', r: '#fff' })); m.updateMatrixWorld(true); return m; };
  // a tower that hides the hole from yawHide and not from the other angles, covering as little track as it can
  function towerFor(L, A, kA, Bk, kB, yawHide, yawsAll, o = {}) {
    const pa = A.end(kA).p.clone(), pb = Bk.end(kB).p.clone(), mid = pa.clone().lerp(pb, .5), d = toCam(yawHide), others = yawsAll.filter(y => y !== yawHide);
    const nearGap = p => p.distanceTo(mid) < 1.6; let best = null;
    for (let t = 1.2; t <= 7; t += .3) for (const hw of [.55, .7, .85, 1.05]) for (const up of [.5, .9, 1.4]) for (const dep of [2.6, 4, 6]) {
      const c = mid.clone().addScaledVector(d, t), top = c.y + up, b = [c.x - hw, top - dep, c.z - hw, c.x + hw, top, c.z + hw];
      if (!hidesGap(b, pa, pb, yawHide) || others.some(y => hidesGap(b, pa, pb, y))) continue;
      const n = coverCount(L, b, yawsAll, nearGap) + t * .3 - dep * .4; if (!best || n < best.n) best = { b, n }; }
    if (!best) throw new Error('no tower hides this hole');
    return best;
  }
  // the stretch of a path, and the tower in front of it, that hides a hole from yawHide only while covering the least track
  function holeAndTower(L, samples, allSamples, yawHide, yaws, o = {}) {
    const roads = allSamples.map(x => new Road(x)), r = new Road(samples), d = toCam(yawHide), others = yaws.filter(y => y !== yawHide); let best = null;
    for (let a = o.from || 1; a + 1.2 < r.L - (o.tail || 6); a += .8) { const pa = r.at(a).p, pb = r.at(a + 1.2).p, mid = pa.clone().lerp(pb, .5), nearGap = p => p.distanceTo(mid) < 1.6;
      for (let t = 1.5; t <= 7; t += .5) for (const hw of [.6, .8]) for (const up of [.6, 1.2]) for (const dep of [2.6, 4.2]) {
        const c = mid.clone().addScaledVector(d, t), top = c.y + up, b = [c.x - hw, top - dep, c.z - hw, c.x + hw, top, c.z + hw];
        if (!hidesGap(b, pa, pb, yawHide) || others.some(y => hidesGap(b, pa, pb, y))) continue;
        const n = coverCount(L, b, yaws, nearGap, roads) + t * .2; if (!best || n < best.n) best = { a, b, n }; } }
    if (!best) throw new Error('no hole can hide behind a tower here');
    return best;
  }
  // a stone tower with a cap and arched windows from a three.js box
  function towerMesh(L, b, pal) {
    const th = L.th, tg = new T.Group(); L.g.add(tg); const m = new T.Mesh(UNIT, tri(pal || sp(th, 0))); m.scale.set(b[3] - b[0], b[4] - b[1], b[5] - b[2]); m.position.set((b[0] + b[3]) / 2, (b[1] + b[4]) / 2, (b[2] + b[5]) / 2); tg.add(m);
    const cap = new T.Mesh(UNIT, tri(th.mechDark || th.idle)); cap.scale.set(b[3] - b[0] + .24, .18, b[5] - b[2] + .24); cap.position.set((b[0] + b[3]) / 2, b[4] + .09, (b[2] + b[5]) / 2); tg.add(cap);
    for (let y = b[4] - 1.1; y > b[1] + .8; y -= 1.5) { onFace(tg, 'x', b[3], (b[2] + b[5]) / 2, y - .4, archGeo(.3, .62), basic(th.win ? th.win.r : th.mech)); onFace(tg, 'y', b[5], (b[0] + b[3]) / 2, y - .4, archGeo(.3, .62), basic(th.win ? th.win.l : th.mech)); }
    return tg;
  }
  // the clearest spot for a machine pedestal among candidates (sketch [x, y, z])
  function clearSpot(L, cands, yaws, r = .7) { let best = null; for (const c of cands) { const b = [c[0] - r, c[2] - 3, c[1] - r, c[0] + r, c[2] + .3, c[1] + r], n = coverCount(L, b, yaws); if (!best || n < best.n) best = { c, n }; } return best.c; }
  const CSTUDIES = [
    { id: 'c-towers', name: 'Turn past the tower', th: () => THEMES[0], cruise: [72, 92], yaws: [0, 90],
      baked: [{"a":2.6,"b":[3.452,-0.833,0.266,4.652,1.767,1.466]},{"a":1.8,"b":[3.653,-3.885,5.534,4.853,-1.285,6.734]}],
      hint: 'Two endless staircases, and each one has a hole in its first flight. A hole you cannot see is not there: from the angle that closes a staircase, a tower stands in front of its hole, so the wheel laps safely. Turning the camera (<b>Y</b>) splits the staircase open onto the next one, but it also brings the hole into view. So wait until the wheel is past the tower, then turn.',
      build(L) {
        const P = L.props, peach = tone('#F4C3A8'), c = L.def.layout || { A0: 5, B0: 4, s0g: -1, k: 5, Lx: 4, A1: 4, B1: 4, s1g: 1, kh: -5 }, YB = 90;
        // lay everything out first, then choose the stretch of each staircase whose hole a tower can hide from its closing angle only
        const S0 = stairPts([0, 0, 0], 0, 2, c.A0, c.B0, 1.6, c.s0g), X0 = behind(S0.end, YB, c.k), X1 = [X0[0] + c.Lx, X0[1], X0[2]], S1 = stairPts(X1, YB, 2, c.A1, c.B1, 1.6, c.s1g);
        const H = behind(S1.end, 0, c.kh), Hs = L3(H, [H[0] + 4, H[1], H[2]], UP), Xs = L3(X0, X1, UP), all = [S0.samples, S1.samples, Xs, Hs];
        // (the search is slow, so its answer is baked into the level; delete `baked` to search again)
        const bk = L.def.baked, t0 = bk ? bk[0] : holeAndTower(L, S0.samples, all, 0, [0, YB]), t1 = bk ? bk[1] : holeAndTower(L, S1.samples, all, YB, [0, YB]);
        P.bake = JSON.stringify([t0, t1].map(t => ({ a: +t.a.toFixed(2), b: t.b.map(v => +v.toFixed(3)) })));
        const make = (st, yaw, pal, a) => { const [s1, s2] = cutSamples(st.samples, a, a + 1.2);
          const r1 = L.road(s1, { pal }), r2 = L.road(s2, { pal, seam: yaw, edgeText: 'The stairs did not meet at this angle' }); return { r1, r2, end: st.end }; };
        const s0 = make(S0, 0, undefined, t0.a); P.s0 = s0; P.land = L.road(Xs, { pal: peach }); const s1 = make(S1, YB, peach, t1.a); P.s1 = s1;
        const home = L.road(Hs, { goal: true }); P.home = home;
        const T0 = towerMesh(L, t0.b), T1 = towerMesh(L, t1.b, peach);
        const txt = { text: 'Behind the tower, so the hole was not there', edge: 'The stairs did not meet at this angle' };
        P.h0 = hiddenGap(L, s0.r1, 1, s0.r2, 0, () => [T0], txt); P.h1 = hiddenGap(L, s1.r1, 1, s1.r2, 0, () => [T1], txt);
        for (const r of [s0.r1, s1.r1]) r.edgeText = 'The hole was in plain sight';
        const at = clearSpot(L, [[-4, -3, 0], [-4, 3, 0], [9, -6, 0], [-2, -7, -2], [3, 7, 1], [12, 0, -2]], [0, YB]);
        const cam = cameraCrank(L, { key: 'y', name: 'Camera', at, detents: [0, YB] }); P.cam = cam;
        L.view.updaters.push(() => L.say(`camera ${cam.at(0) ? 'front' : cam.at(YB) ? 'turned 90°' : 'turning'} · first hole ${P.h0.hidden() ? 'hidden' : 'in sight'} · second hole ${P.h1.hidden() ? 'hidden' : 'in sight'}`));
      },
      spawn: L => ({ road: L.props.s0.r1, s: .3, dir: 1 }),
      solve(L, W, R) { R.cad = 80; const P = L.props, want = W.road === P.s0.r2 || W.road === P.land || W.road === P.s1.r1 ? 90 : W.road === P.s1.r2 ? 0 : W.road === P.s0.r1 ? 0 : null;
        P.cam.m.set(want !== null && !P.cam.at(want)); },
      center: [3, -2, 0], pts: [], pad: .8,
      decor(L) { cloudLayer(L.view, L.th, '#FFFFFF', 4, .75, .55, .95, .2); } },

    { id: 'c-under', name: 'Up and under', th: () => THEMES[1], cruise: [50, 92], yaws: [-90, 0],
      hint: 'The lift has no button: about 55 rpm keeps its deck on the ground, 85 sends it to the second floor. Ride slowly onto the deck, then spin up. At the top a road runs north, high in the air, and from this angle its end meets a road far below that passes right under the meadow loop you started on. That low road ends in a loop; turn the camera (<b>Y</b>) while you lap it, and its far side lines up with the road home.',
      build(L) {
        const th = L.th, g = L.g, P = L.props, step = 1.8, top = 3 * step, floors = [0, step, 2 * step, top], st = { lvl: 0, z: 0 }; P.lift = st;
        // the meadow loop, east of the lift; its north side runs on west onto the deck while the deck is down
        const gx = 3.5, G = L.road(loopPts(12.5 + gx, -1, 17.5 + gx, 1.6, 0, .6), { closed: true, pal: tone('#E9D7AE') }); P.G = G; loopSlab(g, 12 + gx, -1.5, 18 + gx, 2.1, -.5, tri(th.turf), .9);
        const dg = new T.Group(); g.add(dg); st.dg = dg; const dpal = tone('#F3E6C4');
        B(dg, 2.7, -1.5, -.3, 7.1, 2.1, -.03, tri(th.idle)); B(dg, 7.1, 1.15, -.3, 11.6 + gx, 2.05, -.03, tri(th.idle));
        const armW = L.road(L3([12.1 + gx, 1.6, .006], [6.2, 1.6, .006], UP), { g: dg, pal: dpal }); P.armW = armW;
        const D = L.road(loopPts(3.4, -1, 6.6, 1.6, 0, .8), { g: dg, closed: true, pal: dpal }); P.D = D;
        armW.joins = [{ k: 1, to: D, s: sAt(D, [6.2, 1.6, 0]) + .02, dir: 1 }];
        const armN = L.road(L3([6.6, .6, .006], [6.6, 3, .006], UP), { g: dg, pal: dpal }); P.armN = armN;
        G.forks.push({ s: sAt(G, [12.1 + gx, 1.6, 0]), dir: 1, to: armW, toK: 0, when: () => st.z === 0, text: 'The deck is down, so the road runs on' });
        D.forks.push({ s: sAt(D, [6.6, .6, 0]), dir: 1, to: armN, toK: 0, when: () => st.z === 2 * step, text: 'Second floor: the arm meets the high road' });
        // the high road north, and the low road it meets on screen from the starting angle: 9 m further away, so 9 m lower, and under the meadow
        const hz = 2 * step, E = [6.6, 5, hz], U = L.road(L3([6.6, 3, hz], E, UP), { pal: tone('#D9C7F0') }); P.U = U; CY(g, 6.6, 3.55, .32, hz - 3.4, hz - .5, tri(sp(th, 0)), 16);   // held up at its start: under its far end it would stand in front of the low road
        const X0 = behind(E, -90, 9), X = L.road(L3(X0, [X0[0], 4.6, X0[2]], UP), { pal: tone('#B7D3A0') }); P.X = X;
        const Q = L.road(loopPts(X0[0] - 3.4, 4.2, X0[0], 7.6, X0[2], .7), { closed: true, pal: tone('#B7D3A0') }); P.Q = Q;
        X.joins = [{ k: 1, to: Q, s: sAt(Q, [X0[0], 4.6, X0[2]]) + .02, dir: 1 }];
        loopSlab(g, X0[0] - 3.9, 3.7, X0[0] + .5, 8.1, X0[2] - .5, tri(th.turf), .9);
        // from the front, the low loop's far side lines up with the way home
        const exitP = [X0[0] - 2.6, 7.6, X0[2]], H0 = behind(exitP, 0, -4), home = L.road(L3(H0, [H0[0] - 4, H0[1], H0[2]], UP), { goal: true }); P.home = home;
        B(g, H0[0] - 4.1, H0[1] - .5, H0[2] - 2.4, H0[0] - 3.1, H0[1] + .5, H0[2] - .5, tri(sp(th, 0)));
        const cam = cameraCrank(L, { key: 'y', name: 'Camera', at: clearSpot(L, [[20, -3, 0], [20, 3, 0], [10, -4, 0], [1, -3, 0], [1, 4, 0], [16, 8, -2]], [-90, 0]), detents: [-90, 0] }); P.cam = cam;
        Q.forks.push({ s: sAt(Q, exitP), dir: 1, to: home, toK: 0, when: () => cam.at(0), text: 'Joined by perspective' });
        const ccx = 5, ccy = .3; B(g, 2.5, -1.7, -2.6, 7.3, 2.3, -2.2, tri(sp(th, 0)));
        const glass = CY(g, ccx, ccy, .46, -2.2, -.8, tri({ t: '#E9FBFF', l: '#BFE8F2', r: '#9AD3E2' }, { opacity: .35 }), 24);
        const water = CY(g, ccx, ccy, .36, -2.2, -.8, tri({ t: '#8FDCEF', l: '#55B9D2', r: '#3C9BB6' }, { opacity: .9 }), 20);
        (L.drags ||= []).push(() => st.moving ? .2 : 0);
        L.view.updaters.push((t, dt) => { if (L.state !== 'play') return;
          const target = clamp((rider.cad - 55) / 45, 0, 1) * top, prev = st.lvl; st.lvl += clamp(target - st.lvl, -1.35 * dt, 1.35 * dt); st.moving = Math.abs(st.lvl - prev) > 1e-4;
          let z = st.lvl; for (const f of floors) if (Math.abs(st.lvl - f) < .5) z = f; st.z = z; dg.position.y = z;
          const gh = z - .3 + 2.2; glass.scale.y = gh; glass.position.y = -2.2 + gh / 2; const wh = Math.max(.02, z - .35 + 2.2); water.scale.y = wh; water.position.y = -2.2 + wh / 2;
          L.say(`cadence ${Math.round(rider.cad)} rpm · deck ${z === 0 ? 'on the ground' : z === step ? 'first floor' : z === 2 * step ? 'second floor' : z === top ? 'third floor' : 'between floors'} · camera ${cam.at(-90) ? 'start' : cam.at(0) ? 'turned 90°' : 'turning'}`); });
      },
      spawn: L => ({ road: L.props.G, s: 1, dir: 1 }),
      solve(L, W, R) { const P = L.props, onDeck = W.road === P.armW || W.road === P.D || W.road === P.armN; R.cad = onDeck ? 85 : W.road === P.G ? 52 : 80; R.gear = 4;
        const want = W.road === P.Q ? 0 : -90; P.cam.m.set(!P.cam.at(want)); },
      center: [8, 2, -1], pts: [[22, 2.3, 6.5], [2.5, -1.7, -2.6], [2.7, -1.5, 6], [7.1, 2.1, 6], [2.7, 2.1, 6], [7.1, 5, 4]], pad: .8,
      decor(L) { cloudLayer(L.view, L.th, '#FFFFFF', 4, .8, .6, .95, .2); drift(L.view, TEX.petal, '#FFB5CE', 10, .14, { vx: .25, vy: -.15, spin: 1.2 }); } },
    { id: 'c-curtain', name: 'Hold the curtain', th: () => THEMES[1], cruise: [65, 90],
      hint: 'A hole you cannot see is not there. The garden deck has no button: about 55 rpm keeps it on the ground, 70 lifts it to the first floor, 85 to the second. From here the deck hangs in front of the road west, and each floor hides a different hole. The loop lets the wheel go only when the road ahead looks whole, so spin at 70 to hide the first hole, then spin up to 85 as soon as you are across, to hide the second.',
      build(L) {
        const th = L.th, g = L.g, P = L.props, fl = [0, 2.4, 4.8], st = { lvl: 0, z: 0 }; P.lift = st;
        const G = L.road(loopPts(7.5, 0, 12.5, 3, 0, .6), { closed: true, pal: tone('#E9D7AE') }); P.G = G; loopSlab(g, 7, -.5, 13, 3.5, -.5, tri(th.turf), .9);
        // the road west, with two holes: one behind the deck at the first floor, one behind it at the second
        const R = L3([8.2, 3, 0], [-10, 3, 0], UP), sH1 = 8.2 - -.4, sH2 = 8.2 - -5.2, [R1, rest] = cutSamples(R, sH1, sH1 + 1.2), [R2, R3] = cutSamples(rest, sH2 - sH1 - 1.2, sH2 - sH1);
        P.R1 = L.road(R1); P.R2 = L.road(R2); P.R3 = L.road(R3, { goal: true });
        B(g, -10.5, 2.3, -2.4, -8.6, 3.7, -.5, tri(sp(th, 0)));
        // the deck: a garden platform on a slim column, lifted by cadence wherever the wheel is
        const dg = new T.Group(); g.add(dg); B(dg, -2.4, 4.2, -.3, 2.4, 9, 0, tri(th.turf)); B(dg, -2.3, 4.3, -.75, 2.3, 8.9, -.3, tri(sp(th, 0)));
        for (const [x, y] of [[-1.7, 8.3], [1.7, 8.3], [-1.7, 4.9]]) { CY(dg, x, y, .08, 0, .5, tri(tone('#9B7046')), 6); const cr = new T.Mesh(new T.IcosahedronGeometry(.42, 0), tri(th.leaf)); at(dg, cr, x, y, .8); }
        CY(g, 0, 6.6, .34, -3, -.9, tri(th.idle), 14); CY(dg, 0, 6.6, .24, -5.6, -.75, tri(th.idle), 14); B(g, -1, 5.6, -6.6, 1, 7.6, -3, tri(sp(th, 0)));   // a telescoping column on a deep pedestal
        const water = CY(g, 0, 6.6, .2, -3, -.8, tri({ t: '#8FDCEF', l: '#55B9D2', r: '#3C9BB6' }, { opacity: .9 }), 12);
        const txt = { text: 'Behind the deck, so the hole was not there' };
        P.h1 = hiddenGap(L, P.R1, 1, P.R2, 0, () => [dg], txt); P.h2 = hiddenGap(L, P.R2, 1, P.R3, 0, () => [dg], txt);
        P.R1.edgeText = P.R2.edgeText = 'The hole was in plain sight';
        G.forks.push({ s: sAt(G, [8.2, 3, 0]), dir: 1, to: P.R1, toK: 0, when: () => P.h1.hidden(), text: 'The road ahead looks whole, so the wheel rides on' });
        (L.drags ||= []).push(() => st.moving ? .2 : 0);
        L.view.updaters.push((t, dt) => { if (L.state !== 'play') return;
          const target = clamp((rider.cad - 55) / 30, 0, 1) * 4.8, prev = st.lvl; st.lvl += clamp(target - st.lvl, -2 * dt, 2 * dt); st.moving = Math.abs(st.lvl - prev) > 1e-4;
          let z = st.lvl; for (const f of fl) if (Math.abs(st.lvl - f) < .4) z = f; st.z = z; dg.position.y = z;
          water.scale.y = 1; const wh = Math.max(.05, z + 2.2); water.scale.y = wh / 2.2; water.position.y = -3 + wh / 2 + .4;
          L.say(`cadence ${Math.round(rider.cad)} rpm · deck ${z === 0 ? 'on the ground' : z === 2.4 ? 'first floor' : z === 4.8 ? 'second floor' : 'moving'} · holes ${P.h1.hidden() ? 'first hidden' : P.h2.hidden() ? 'second hidden' : 'both in sight'}`); });
      },
      spawn: L => ({ road: L.props.G, s: 1, dir: 1 }),
      solve(L, W, R) { const P = L.props; R.gear = 4; R.cad = W.road === P.G || W.road === P.R1 ? 70 : 85; },
      center: [0, 3, 1], pts: [[-10.5, 2.3, -2.4], [13, 3.5, 0], [2.4, 9, 5.5], [-2.4, 4.2, 5.5]], pad: .8,
      decor(L) { cloudLayer(L.view, L.th, '#FFFFFF', 4, .8, .6, .95, .2); drift(L.view, TEX.petal, '#FFB5CE', 10, .14, { vx: .25, vy: -.15, spin: 1.2 }); } },
    { id: 'c-bridge', name: 'Bridge or curtain', th: () => THEMES[2], cruise: [72, 92],
      hint: 'One drawbridge, two jobs. Lowered, it carries the road from the upper loop to the way home. Raised, its leaf stands right in front of a hole in the low road, and a hole you cannot see is not there. The low loop lets the wheel go only when the road ahead looks whole. Raise the bridge (<b>Y</b>) to ride the low road and the ramp up to the upper loop, then lower it to ride home.',
      build(L) {
        const th = L.th, g = L.g, P = L.props, zl = -1.8, hx = 3, lw = 1.6, tR = 3, rx = hx - tR;
        // the upper loop, with the drawbridge hinged on its north side; raised, the leaf stands in the plane x = hx
        const K = L.road(loopPts(2.4, -3, 6.4, 1.6, 0, .6), { closed: true }); P.K = K; loopSlab(g, 1.9, -3.5, 6.9, 2.1, -.5, tri(sp(th, 1)), .9);
        // the low loop the wheel starts on; its west side runs on south as the low road, through the hole, then ramps up east into the upper loop
        const G = L.road(loopPts(rx, 2.6, rx + 2.6, 5.4, zl, .6), { closed: true, pal: tone('#EEDFC4') }); P.G = G; loopSlab(g, rx - .5, 2.1, rx + 3.1, 5.9, zl - .5, tri(sp(th, 0)), .9);
        const yH = 1.6 - tR + .6, t = turtle(rx, 3.2, -90, zl).fwd(3.2 + 4.5).arc(1.1, 90).gr(-zl / (3.3 - rx - 1.1)).fwd(3.3 - rx - 1.1).gr(0).arc(1.1, 90).fwd(1), lowR = t.pts;
        const sH = 3.2 - yH, [R1, R2] = cutSamples(lowR, sH, sH + 1.2); P.R1 = L.road(R1, { pal: tone('#EEDFC4') }); P.R2 = L.road(R2, { pal: tone('#EEDFC4') });
        P.R2.joins = [{ k: 1, to: K, s: sAt(K, [4.4, -3, 0]) + .02, dir: 1 }];
        const hg = new T.Group(); hg.position.copy(V(hx, 1.6, 0)); g.add(hg); const leafM = tri(th.mech, { fresh: true });
        const leaf = new T.Mesh(UNIT, leafM); leaf.scale.set(2.4, .3, lw); leaf.position.set(-1.2, -.18, 0); hg.add(leaf);
        const br = L.road(L3([0, 0, .006], [-2.4, 0, .006], UP), { g: hg, pal: tone('#E8C9A0'), th: .05 }); P.br = br;
        CY(g, hx, 1.6, .22, -2.4, -.05, tri(th.mechDark || th.idle), 10);
        const home = L.road(turtle(hx - 2.4, 1.6, 180, 0).fwd(.4).arc(1, -90).fwd(3.2).pts, { goal: true }); P.home = home;
        const st = { ang: 0, sweep: 1 }; P.bridge = st;
        P.hole = hiddenGap(L, P.R1, 1, P.R2, 0, () => [leaf], { text: 'Behind the raised bridge, so the hole was not there', edge: 'The hole was in plain sight' });
        G.forks.push({ s: sAt(G, [rx, 3.2, zl]), dir: 1, to: P.R1, toK: 0, when: () => P.hole.hidden(), text: 'The road ahead looks whole, so the wheel rides on' });
        K.forks.push({ s: sAt(K, [hx, 1.6, 0]), dir: 1, to: br, toK: 0, when: () => st.ang < 1, text: 'The bridge is down, so the road runs on' });
        const at = clearSpot(L, [[8.8, -2, 0], [8.8, 2, 0], [-3.5, -4, -1], [-3, 1, -1], [6, 4.4, 0], [-3.5, 6, -2], [9, -6, -1]], [0]);
        st.m = L.machine({ key: 'y', name: 'Drawbridge', size: .6, place: h => { h.position.copy(V(at[0], at[1], at[2] + .04)); g.add(h); },
          tick(dt, drive) {
            if (drive > 0) { st.ang += st.sweep * drive * 30; if (st.ang <= 0 || st.ang >= 90) { st.ang = clamp(st.ang, 0, 90); st.sweep *= -1; } }
            else { const tgt = st.ang > 45 ? 90 : 0; st.ang += clamp(tgt - st.ang, -60 * dt, 60 * dt); }
            hg.rotation.z = -st.ang / 90 * Math.PI / 2; setTri(leafM, mixPal(th.mech, tone(th.goal), clamp(this.bloom.e, 0, 1)));
            L.say(`bridge ${st.ang < 1 ? 'down' : st.ang > 89 ? 'raised' : 'moving'} · hole ${P.hole.hidden() ? 'hidden' : 'in sight'}`);
            const off = Math.min(st.ang, 90 - st.ang); return drive > 0 ? .25 + .7 * Math.exp(-((off / 7) ** 2)) : 0; } });
        CY(g, at[0], at[1], .6, at[2] - 2.4, at[2] - .02, tri(sp(th, 0)), 28);
      },
      spawn: L => ({ road: L.props.G, s: 1, dir: 1 }),
      solve(L, W, R) { const P = L.props, st = P.bridge; R.cad = 80; R.gear = 4; const up = W.road === P.G || W.road === P.R1; st.m.set(up ? st.ang < 89.5 : (W.road === P.K ? st.ang > .5 : false)); },
      center: [2, -1, -1], pts: [[-.5, 5.9, -4.2], [6.9, -6.7, -2.4], [3, 1.6, 2.6], [-1, 6, 0]], pad: .8,
      decor(L) { cloudLayer(L.view, L.th, '#FFFFFF', 4, .8, .6, .95, .2); } },
  ];
  /* ================= scenery: floating islands, towers and columns, placed where no camera angle sees them in front of the track ================= */
  function sceneryPass(L, o = {}) {
    const th = L.th, yaws = L.def.yaws || [0], rnd = mulberry(o.seed ?? (L.idx * 7919 + 17)), ray = new T.Raycaster();
    L.g.updateMatrixWorld(true);
    // what must stay in view: road samples (ends count more) and machine pedestals
    const pts = []; for (const r of L.roads) { if (!r.S[0]) continue; for (let s = 0; s <= r.L; s += .4) { const f = r.at(s), w = r.closed || (s > 2 && s < r.L - 2) ? 1 : 4, side = new T.Vector3().crossVectors(f.d, f.n).normalize();
      // the deck's centre line and both edges, so a thin column cannot stand between samples
      for (const e of [0, .5, -.5]) pts.push({ p: f.p.clone().addScaledVector(side, e).addScaledVector(f.n, .2), w }); } }
    for (const m of L.machines) { const p = new T.Vector3(); m.bloom.holder.getWorldPosition(p); pts.push({ p, w: 6 }); }
    // holes that open and close by sight must never be hidden by scenery
    for (const r of L.roads) for (const gp of r.gaps) { const a = r.end(gp.k).p, b = gp.to.end(gp.toK).p; for (let i = 0; i <= 6; i++) pts.push({ p: a.clone().lerp(b, i / 6), w: 6 }); }
    if (!pts.length) return;
    const axes = yaws.map(y => [SR.clone().applyAxisAngle(Yax3, y * Math.PI / 180), SU.clone().applyAxisAngle(Yax3, y * Math.PI / 180), toCam(y)]);
    const scr = (p, k) => [p.dot(axes[k][0]), p.dot(axes[k][1])];
    const bounds = axes.map((_, k) => { const s = pts.map(q => scr(q.p, k)); return [Math.min(...s.map(q => q[0])), Math.max(...s.map(q => q[0])), Math.min(...s.map(q => q[1])), Math.max(...s.map(q => q[1]))]; });
    const lo = new T.Vector3(1e9, 1e9, 1e9), hi = lo.clone().multiplyScalar(-1); for (const q of pts) { lo.min(q.p); hi.max(q.p); }
    // a candidate is a set of boxes (three.js coords); it is rejected if any box stands in front of, or runs into, anything that must stay in view
    const blocks = (boxes) => { const ms = boxes.map(b => boxMesh([b[0] - .3, b[1], b[2] - .3, b[3] + .3, b[4] + .3, b[5] + .3]));
      for (const q of pts) { for (const b of boxes) if (q.p.x > b[0] - .8 && q.p.x < b[3] + .8 && q.p.z > b[2] - .8 && q.p.z < b[5] + .8 && q.p.y > b[1] - 1 && q.p.y < b[4] + 1.2) return true;
        for (let k = 0; k < yaws.length; k++) { const d = axes[k][2]; ray.set(q.p.clone().addScaledVector(d, 100), d.clone().negate()); const h = ray.intersectObjects(ms, false); if (h.length && h[0].distance < 99.7) return true; } }
      return false; };
    const placed = [], want = o.count ?? Math.round(clamp((hi.x - lo.x + hi.z - lo.z) / 7, 3, 7));
    const stone = tri(sp(th, 0)), dark = tri(th.mechDark || th.idle), rock = tri(th.turf ? { t: th.turf.t, l: th.stone.l, r: th.stone.r } : th.idle), roof = tri(th.roof || th.mech), win = basic(th.win ? th.win.r : (th.glow || th.ink));
    for (let tries = 0; tries < 260 && placed.length < want; tries++) {
      const kind = rnd() < .55 ? 'tower' : rnd() < .5 ? 'column' : 'terrace';
      const x = lo.x - 4 + rnd() * (hi.x - lo.x + 8), z = lo.z - 4 + rnd() * (hi.z - lo.z + 8), base = lo.y - 3 + rnd() * (hi.y - lo.y + 2);
      const w = kind === 'tower' ? .9 + rnd() * .6 : kind === 'column' ? .5 + rnd() * .3 : 2.2 + rnd() * 1, h = kind === 'tower' ? 2.4 + rnd() * 3 : kind === 'column' ? 3 + rnd() * 4 : 2.4;
      const pw = kind === 'terrace' ? w : w + 1.2 + rnd() * 1;     // the floating island it stands on
      const boxes = [[x - pw / 2, base - 1.8, z - pw / 2, x + pw / 2, base, z + pw / 2], [x - w / 2, base, z - w / 2, x + w / 2, base + h + .6, z + w / 2]];
      const c = new T.Vector3(x, base + h / 2, z);
      if (placed.some(p => Math.hypot(p.x - x, p.z - z) < (p.r + pw / 2 + 1.2))) continue;
      // keep it inside the frame from every angle, and near enough the track to belong to the level
      if (axes.some((_, k) => { const [sx, sy] = scr(c, k), b = bounds[k]; return sx < b[0] - 1 || sx > b[1] + 1 || sy < b[2] - 2 || sy > b[3] + 1; })) continue;
      const near = Math.min(...pts.map(q => Math.hypot(...scr(q.p, 0).map((v, i) => v - scr(c, 0)[i])))); if (near > 6.5) continue;
      if (blocks(boxes)) continue;
      // build it: an island with a rocky underside, then the tower, column or terrace on top
      const gI = new T.Group(); L.g.add(gI); const isl = new T.Mesh(UNIT, rock); isl.scale.set(pw, .45, pw); isl.position.set(x, base - .225, z); gI.add(isl);
      const under = new T.Mesh(new T.ConeGeometry(pw * .62, 1.35, 4), tri(sp(th, 0))); under.rotation.set(Math.PI, Math.PI / 4, 0); under.position.set(x, base - .45 - .675, z); gI.add(under);
      if (kind === 'tower') { B(gI, x - w / 2, z - w / 2, base, x + w / 2, z + w / 2, base + h, stone);   // B takes sketch order (x, y, z)
        const cap = new T.Mesh(new T.ConeGeometry(w * .78, .7, 4), roof); cap.rotation.y = Math.PI / 4; cap.position.set(x, base + h + .35, z); gI.add(cap);
        for (let yy = base + h - 1; yy > base + .5; yy -= 1.3) { onFace(gI, 'x', x + w / 2, z, yy - .3, archGeo(.26, .55), win); onFace(gI, 'y', z + w / 2, x, yy - .3, archGeo(.26, .55), win); } }
      else if (kind === 'column') { CY(gI, x, z, w / 2, base, base + h, stone, 18); const dome = new T.Mesh(new T.SphereGeometry(w * .62, 16, 8, 0, TAU, 0, Math.PI / 2), roof); dome.position.set(x, base + h, z); gI.add(dome); CY(gI, x, z, w * .62, base + h - .12, base + h + .02, dark, 18); }
      else { // a stepped ziggurat crowned by a tree in the garden, a little domed shrine elsewhere
        for (let k = 0; k < 3; k++) { const ins = .25 + k * .4; B(gI, x - w / 2 + ins, z - w / 2 + ins, base + k * .4, x + w / 2 - ins, z + w / 2 - ins, base + (k + 1) * .4, k % 2 ? tri(th.idle) : stone); }
        const top = base + 1.2;
        if (th.leaf) { CY(gI, x, z, .09, top, top + .6, tri(tone('#9B7046')), 6); const cr = new T.Mesh(new T.IcosahedronGeometry(.55, 0), tri(th.leaf)); cr.position.set(x, top + .95, z); gI.add(cr); }
        else { CY(gI, x, z, .32, top, top + .5, stone, 14); const dm = new T.Mesh(new T.SphereGeometry(.36, 14, 7, 0, TAU, 0, Math.PI / 2), roof); dm.position.set(x, top + .5, z); gI.add(dm); } }
      placed.push({ x, z, r: pw / 2, kind });
    }
    return placed;
  }
  /* ================= gravity: roads up walls and under beams; the wheel keeps to whatever surface it rides ================= */
  // a frame turtle: position, heading and road normal in sketch coords. fwd runs straight; curl pitches the heading toward
  // the normal (a positive angle rolls up a quarter-pipe onto a wall, a negative one rolls over an edge, onto a roof or under a beam)
  function ftur(p, d, n) {
    const st = { p: [...p], d: [...d], n: [...n] }, pts = [{ p: [...p], n: [...n] }], push = () => pts.push({ p: [...st.p], n: [...st.n] });
    const api = { pts, st,
      fwd(len, step = .2) { const k = Math.max(1, Math.ceil(len / step)); for (let i = 0; i < k; i++) { st.p = st.p.map((v, j) => v + st.d[j] * len / k); push(); } return api; },
      turn(R, deg) { const k = Math.max(3, Math.ceil(Math.abs(deg) / 6)), a = Math.abs(deg) * Math.PI / 180 / k, sg = Math.sign(deg), ch = 2 * R * Math.sin(a / 2);   // yaw about the road's normal
        for (let i = 0; i < k; i++) { const nx = [st.n[1] * st.d[2] - st.n[2] * st.d[1], st.n[2] * st.d[0] - st.n[0] * st.d[2], st.n[0] * st.d[1] - st.n[1] * st.d[0]], d2 = st.d.map((v, j) => v * Math.cos(a) + sg * nx[j] * Math.sin(a)), mid = st.d.map((v, j) => v + d2[j]), ml = Math.hypot(...mid);
          st.p = st.p.map((v, j) => v + mid[j] / ml * ch); st.d = d2; push(); } return api; },
      curl(R, deg) { const k = Math.max(3, Math.ceil(Math.abs(deg) / 6)), a = Math.abs(deg) * Math.PI / 180 / k, s = Math.sign(deg), ch = 2 * R * Math.sin(a / 2);
        for (let i = 0; i < k; i++) { const d2 = st.d.map((v, j) => v * Math.cos(a) + s * st.n[j] * Math.sin(a)), n2 = st.n.map((v, j) => v * Math.cos(a) - s * st.d[j] * Math.sin(a)), mid = st.d.map((v, j) => v + d2[j]), ml = Math.hypot(...mid);
          st.p = st.p.map((v, j) => v + mid[j] / ml * ch); st.d = d2; st.n = n2; push(); } return api; } };
    return api;
  }
  // a drawbridge hinged at h, its leaf reaching len along -x; raised it stands upright. Lowered, the loop's fork rides onto it
  function drawbridge(L, o) {
    const th = L.th, g = L.g, hg = new T.Group(); hg.position.copy(V(...o.hinge)); g.add(hg); const leafM = tri(th.mech, { fresh: true }), len = o.len || 2.4;
    const leaf = new T.Mesh(UNIT, leafM); leaf.scale.set(len, .3, o.w || 1.4); leaf.position.set(-len / 2, -.18, 0); hg.add(leaf);
    const road = L.road(L3([0, 0, .006], [-len, 0, .006], UP), { g: hg, pal: o.pal || tone('#E8C9A0'), th: .05 });
    CY(g, o.hinge[0], o.hinge[1], .22, o.hinge[2] - 2.4, o.hinge[2] - .05, tri(th.mechDark || th.idle), 10);
    const st = { ang: o.raised ? 90 : 0, sweep: o.raised ? -1 : 1, road, leaf };
    st.m = L.machine({ key: o.key, name: o.name || 'Drawbridge', size: .6, place: h => { h.position.copy(V(o.at[0], o.at[1], o.at[2] + .04)); g.add(h); },
      tick(dt, drive) {
        if (drive > 0) { st.ang += st.sweep * drive * 30; if (st.ang <= 0 || st.ang >= 90) { st.ang = clamp(st.ang, 0, 90); st.sweep *= -1; } }
        else { const tgt = st.ang > 45 ? 90 : 0; st.ang += clamp(tgt - st.ang, -60 * dt, 60 * dt); }
        hg.rotation.z = -st.ang / 90 * Math.PI / 2; setTri(leafM, mixPal(th.mech, tone(th.goal), clamp(this.bloom.e, 0, 1)));
        const off = Math.min(st.ang, 90 - st.ang); return drive > 0 ? .25 + .7 * Math.exp(-((off / 7) ** 2)) : 0; } });
    CY(g, o.at[0], o.at[1], .6, o.at[2] - 2.4, o.at[2] - .02, tri(sp(th, 0)), 28);
    return st;
  }
  const GSTUDIES = [
    { id: 'g-wall', name: 'Up the wall', th: () => THEMES[4], cruise: [70, 92], yaws: [0, 90],
      hint: 'Roads here run up walls, and the wheel keeps to them. Lower the drawbridge (<b>A</b>) and the next lap leaves the loop, rolls up the wall of the near tower and stops halfway up. Turn the camera (<b>Y</b>) a quarter turn while it climbs: from there the road on the near wall carries straight on up the far tower, which stands well behind it, and over its top to the goal. Miss the turn and the wheel drops back to the loop below.',
      build(L) {
        const th = L.th, g = L.g, P = L.props;
        const G = L.road(loopPts(3, -1, 7, 2, 0, .6), { closed: true }); P.G = G; loopSlab(g, 2.5, -1.5, 7.5, 2.5, -.5, tri(sp(th, 0)), .9);
        const br = drawbridge(L, { key: 'a', hinge: [3.6, 2, 0], len: 2.4, raised: true, at: clearSpot(L, [[8.6, -2.2, 0], [8.6, 3, 0], [5, 4, 0], [5, -3.2, 0]], [0, 90]) }); P.br = br;
        G.forks.push({ s: sAt(G, [3.6, 2, 0]), dir: 1, to: br.road, toK: 0, when: () => br.ang < 1, text: 'The bridge is down, so the road runs on' });
        // the near tower: the road rolls off the bridge onto its east face and climbs; the face is the one the camera always sees
        const R = .8, top1 = 3.4, s1 = ftur([1.2, 2, 0], [-1, 0, 0], [0, 0, 1]).fwd(.6).curl(R, 90).fwd(top1 - R); P.S1 = L.road(s1.pts, { pal: tone('#CFE3F7'), edgeText: 'Nothing above the wall from here, so the wheel dropped' });
        // its top is flush with the road's end: anything above it would stand in front of the far tower's road
        // the wall is flush with the road's surface, so the road reads as painted up the building rather than a pipe stuck on it
        const fx = .6 - R; B(g, fx - 2.2, .8, -2.6, fx - .02, 3.2, top1, tri(sp(th, 0))); B(g, fx - 2.3, .7, top1 - .12, fx - .02, 3.3, top1, tri(th.idle));
        // the far tower: 5 m behind the near one from the turned camera, so its wall road starts exactly where the near one stops
        const E = s1.st.p, S0 = behind(E, 90, 5), s2 = ftur(S0, [0, 0, 1], [1, 0, 0]).fwd(2.6).curl(.5, -90).fwd(2.2); P.S2 = L.road(s2.pts, { pal: tone('#CFE3F7') });
        const roofZ = S0[2] + 2.6 + .5; P.home = L.road(L3(s2.st.p, [s2.st.p[0] - 1.4, s2.st.p[1], roofZ], UP), { goal: true });
        B(g, S0[0] - 4.6, S0[1] - 1.2, S0[2] - 3.4, S0[0] - .02, S0[1] + 1.2, roofZ - .5, tri(sp(th, 0)));
        for (let k = 0; k < 3; k++) onFace(g, 'y', S0[1] + 1.2, S0[0] - 3.2, S0[2] - 2.6 + k * 1.6, archGeo(.3, .7), basic(th.win ? th.win.r : th.mech));
        for (let k = 0; k < 2; k++) onFace(g, 'y', 3.2, fx - 1.4, .4 + k * 1.6, archGeo(.3, .7), basic(th.win ? th.win.r : th.mech));
        const cam = cameraCrank(L, { key: 'y', name: 'Camera', at: clearSpot(L, [[8.6, 3.4, 0], [8.8, -2.6, 0], [5, -3.4, 0], [1, -1.8, 0]], [0, 90]), detents: [0, 90] }); P.cam = cam;
        L.view.updaters.push(() => L.say(`bridge ${br.ang < 1 ? 'down' : br.ang > 89 ? 'raised' : 'moving'} · camera ${cam.at(0) ? 'front' : cam.at(90) ? 'turned 90°' : 'turning'}`));
      },
      spawn: L => ({ road: L.props.G, s: 1, dir: 1 }),
      solve(L, W, R) { const P = L.props; R.cad = 80; R.gear = 4; const up = W.road === P.br.road || W.road === P.S1 || W.road === P.S2 || W.road === P.home;
        P.br.m.set(W.road === P.G && P.br.ang > .5); P.cam.m.set(!P.cam.at(up ? 90 : 0)); },
      center: [1, 3, 1], pts: [[7.5, -1.5, 0], [-1.6, 1.1, 5.5], [2.5, 2.5, -1.4], [-6, 8, 4]], pad: .9,
      decor(L) { cloudLayer(L.view, L.th, '#FFFFFF', 4, .8, .6, .95, .2); } },

    { id: 'g-under', name: 'Underneath', th: () => THEMES[3], cruise: [50, 92], yaws: [0, 90],
      hint: 'The beam is a lift with no button: about 55 rpm keeps it level with the loop, 85 raises it a floor. Ride onto it slowly. Its road rolls over the far end and runs back along the underside, the wheel upside down. While it is under there, spin up to raise the beam and turn the camera (<b>Y</b>): from the turned view, its underside meets the underside of a second, hanging beam. The wheel crosses still upside down, rolls round that beam\'s end and rides home on top.',
      build(L) {
        const th = L.th, g = L.g, P = L.props, step = 2.4, st = { lvl: 0, z: 0 }; P.lift = st;
        const G = L.road(loopPts(0, 0, 4, 3, 0, .6), { closed: true }); P.G = G; loopSlab(g, -.5, -.5, 4.5, 3.5, -.5, tri(sp(th, 0)), .9);
        const dg = new T.Group(); g.add(dg); const bpal = tone('#F2D49B');
        // the beam: a road along the top that rolls over the far end and comes back along the underside
        const bt = ftur([3.4, 0, 0], [1, 0, 0], [0, 0, 1]).fwd(8.5).curl(.6, -180).fwd(3.6); P.beam = L.road(bt.pts, { g: dg, pal: bpal, edgeText: 'Nothing below the beam\'s end from here, so the wheel fell' });
        // the beam's core and straps count as road: they never hide the wheel riding underneath
        B(dg, 4.6, -.45, -.72, 11.9, .45, -.48, tri(th.idle)).userData.road = true; for (const x of [6, 8.4, 10.6]) B(dg, x - .12, -.62, -1.25, x + .12, .62, .05, tri(th.mechDark || th.idle)).userData.road = true;
        G.forks.push({ s: sAt(G, [3.4, 0, 0]), dir: 1, to: P.beam, toK: 0, when: () => st.z === 0, text: 'The beam is level with the loop, so the road runs on' });
        // a lantern post in the water and the chain that lifts the beam
        const post = CY(g, 12.3, 1.4, .18, -4, step + 1.2, tri(sp(th, 1)), 12); const chain = CY(g, 12.3, .9, .05, 0, 1, basic(th.ink || '#333333'), 6);
        // from the turned camera with the beam a floor up, the underside road's end sits exactly over the start of the low road
        // from the turned view with the beam a floor up, the underside road's end meets the underside of a second beam, nearer and higher.
        // The wheel stays upside down across the join, then rolls round that beam's end onto its top and rides home the right way up
        const E = bt.st.p.map((v, j) => v + (j === 2 ? step : 0)), H0 = behind(E, 90, -4.5), u2 = ftur(H0, [-1, 0, 0], [0, 0, -1]).fwd(.8).turn(1, -90), p1 = [...u2.st.p];
        u2.fwd(3.2); const p2 = [...u2.st.p]; u2.curl(.6, -180).fwd(1.2); const home = L.road(u2.pts, { goal: true, pal: bpal }); P.home = home;
        { const z = H0[2]; B(g, p1[0] - .45, p2[1] - .6, z + .48, p1[0] + .45, p1[1] + .2, z + .72, tri(th.idle)).userData.road = true;
          for (const y of [p1[1] - .5, p2[1] + .3]) { B(g, p1[0] - .62, y - .12, z - .05, p1[0] + .62, y + .12, z + 1.25, tri(th.mechDark || th.idle)).userData.road = true; CY(g, p1[0], y, .05, z + 1.25, z + 5, basic(th.ink || '#333333'), 6); } }
        const cam = cameraCrank(L, { key: 'y', name: 'Camera', at: clearSpot(L, [[-2.2, -1.6, 0], [-2.2, 4.4, 0], [2, 5.2, 0], [2, -2.4, 0], [11.5, -2, 0]], [0, 90]), detents: [0, 90] }); P.cam = cam;
        (L.drags ||= []).push(() => st.moving ? .2 : 0);
        L.view.updaters.push((t, dt) => { if (L.state !== 'play') return;
          const target = clamp((rider.cad - 55) / 30, 0, 1) * step, prev = st.lvl; st.lvl += clamp(target - st.lvl, -1.35 * dt, 1.35 * dt); st.moving = Math.abs(st.lvl - prev) > 1e-4;
          let z = st.lvl; for (const f of [0, step]) if (Math.abs(st.lvl - f) < .4) z = f; st.z = z; dg.position.y = z;
          chain.scale.y = Math.max(.05, step + 1.2 - z); chain.position.y = z + chain.scale.y / 2;
          L.say(`cadence ${Math.round(rider.cad)} rpm · beam ${z === 0 ? 'level with the loop' : z === step ? 'a floor up' : 'moving'} · camera ${cam.at(0) ? 'front' : cam.at(90) ? 'turned 90°' : 'turning'}`); });
      },
      spawn: L => ({ road: L.props.G, s: 1, dir: 1 }),
      solve(L, W, R) { const P = L.props, on = W.road === P.beam, under = on && W.s > 7; R.gear = 4;
        R.cad = W.road === P.G ? 52 : under || W.road === P.home ? 88 : 52; P.cam.m.set(!P.cam.at(on || W.road === P.home ? 90 : 0)); },
      center: [3, 1, 0], pts: [[-.5, -.5, 0], [12.3, 1.4, 3.6], [-.5, 3.5, -1.4], [12, -.6, -1.4], [11, -8, 5.7]], pad: .9,
      decor(L) { cloudLayer(L.view, L.th, '#FFFFFF', 4, .8, .6, .95, .2); } },
  ];
  /* ================= more gravity: wall and underside roads with the wind and the tide ================= */
  // the wind sock: a striped cone on a mast; its button turns the wind a quarter at a time, always the same way. Riding into the
  // wind is heavier, with it at your back lighter. st.a is the bearing the wind blows from (0 east, 90 north, 180 west, 270 south)
  function windSock(L, sx, sy, a0, key = 'y') {
    const th = L.th, g = L.g, st = { a: a0 }; CY(g, sx, sy, .5, -2.4, -.02, tri(sp(th, 0)), 24); CY(g, sx, sy, .06, 0, 1.4, tri(th.mechDark || th.idle), 8);
    const sock = new T.Group(); sock.position.copy(V(sx, sy, 1.25)); g.add(sock); const hoop = new T.Mesh(new T.TorusGeometry(.24, .03, 6, 20), tri(th.mechDark || th.idle)); hoop.rotation.y = Math.PI / 2; sock.add(hoop);
    const cone = new T.Group(); sock.add(cone);
    for (let k = 0; k < 4; k++) { const r0 = .24 - k * .035, r1 = .24 - (k + 1) * .035, seg = new T.Mesh(new T.CylinderGeometry(r1, r0, .3, 18, 1, true), basic(k % 2 ? '#FFFFFF' : '#E8553B', { side: true })); seg.rotation.z = -Math.PI / 2; seg.position.x = .15 + k * .3; cone.add(seg); }
    const det = [0, 90, 180, 270];
    st.m = L.machine({ key, name: 'Wind sock', size: .55, place: h => { h.position.copy(V(sx, sy, .04)); g.add(h); },
      tick(dt, drive) { if (drive > 0) { st.a += drive * 40; if (st.a >= 360) st.a -= 360; }
        else { const tgt = [...det, 360].reduce((a, d) => Math.abs(d - st.a) < Math.abs(a - st.a) ? d : a, 0); st.a += clamp(tgt - st.a, -60 * dt, 60 * dt); if (st.a >= 359.99) st.a = 0; }
        return drive > 0 ? .3 : 0; } });
    st.at = d => Math.abs(st.a - d) < .5; st.steady = () => det.some(d => st.at(d));
    st.name = () => ['east', 'north', 'west', 'south'][Math.round(st.a / 90) % 4];
    st.headOn = () => { const r = L.W && L.W.road; if (!r || L.W.mode !== 'road') return 0; const d = r.at(L.W.s).d.clone().multiplyScalar(L.W.dir), a = st.a * Math.PI / 180; return d.x * Math.cos(a) + d.z * Math.sin(a); };
    (L.drags ||= []).push(() => { const h = st.headOn(); return h > 0 ? .4 * h : .15 * h; });
    L.view.updaters.push((t) => { sock.rotation.y = -(st.a + 180) * Math.PI / 180; cone.rotation.z = st.steady() ? -.05 + .04 * Math.sin(t * 7) : -.7; });
    return st;
  }
  // a vane: a road on a pivot that swings to point downwind. axis 'x' turns it in a wall facing +x; 'y' turns it under a ceiling
  function vane(L, o) {
    const th = L.th, vg = new T.Group(); vg.position.copy(V(...o.pivot)); L.g.add(vg); const mat = tri(th.mech, { fresh: true, side: true });
    const road = L.road(L3([0, 0, 0], o.len, o.n), { g: vg, mat, edgeText: o.edgeText }); CY(vg, 0, 0, .34, -.1, .06, tri(th.mechDark || th.idle), 18);
    if (o.axis === 'x') { const hub = vg.children[vg.children.length - 1]; hub.rotation.z = Math.PI / 2; hub.position.set(.04, 0, 0); }
    else { const hub = vg.children[vg.children.length - 1]; hub.position.set(0, .04, 0); }
    const st = { road, vg, mat, aligned: () => false };
    L.view.updaters.push(() => { const w = o.wind; let a = w.a * Math.PI / 180;
      if (o.axis === 'x') vg.rotation.x = (270 * Math.PI / 180) - a; else vg.rotation.y = Math.PI - a;   // downwind
      st.aligned = () => w.at(o.alignAt); setTri(mat, mixPal(th.mech, tone(th.goal), st.aligned() ? .7 : 0)); });
    return st;
  }
  const G2STUDIES = [
    { id: 'w-vane', name: 'Weathervane wall', th: () => THEMES[3], cruise: [70, 92],
      hint: 'The wheel laps a loop painted on the tower wall. On its lower side hangs a weathervane, a short road on a pivot that always points downwind. The wind sock (<b>Y</b>) turns the wind a quarter at a time. When the wind blows from the south the vane lies along the loop and the next lap rides out onto it, round the corner of the tower and up to the roof, with the wind at your back.',
      build(L) {
        const th = L.th, g = L.g, P = L.props;
        // the tower: its east face carries the loop; a step in the north-east corner leaves room for the road to wrap round onto the north face
        const wl = ftur([0, 3, 1], [0, 1, 0], [1, 0, 0]).fwd(1.3).turn(.7, 90).fwd(1.6).turn(.7, 90).fwd(2.6).turn(.7, 90).fwd(1.6).turn(.7, 90).fwd(1.3);
        const WL = L.road(wl.pts, { closed: true, pal: tone('#F2D49B') }); P.WL = WL;
        const wind = windSock(L, 4.2, 1.2, 180); P.wind = wind;
        const vn = vane(L, { pivot: [.03, 4.3, 1], len: [0, 2.4, 0], n: [1, 0, 0], axis: 'x', wind, alignAt: 270, edgeText: 'The vane pointed off into the air, so the wheel dropped' }); P.vane = vn;
        WL.forks.push({ s: sAt(WL, [0, 4.3, 1]), dir: 1, to: vn.road, toK: 0, when: () => vn.aligned(), text: 'The vane lies along the road, so the wheel rides on' });
        // from the vane's tip: round the corner onto the north face, along it and up, then over the top
        const n1 = ftur([0, 6.7, 1], [0, 1, 0], [1, 0, 0]).curl(.3, -90).fwd(.6).turn(.6, 90).fwd(3.2); n1.curl(.4, -90).fwd(1.6);
        const home = L.road(n1.pts, { goal: true, pal: tone('#F2D49B') }); P.home = home;
        // the tower's walls sit flush under its roads; its roof is level with the road over the top
        const roof = n1.st.p[2] - .5, stone = tri(sp(th, 0)); B(g, -2.8, -1.2, -3, -.02, 6.68, roof, stone); B(g, -2.8, 6.68, -3, -.32, 6.98, roof, stone);
        for (let k = 0; k < 2; k++) onFace(g, 'y', 6.98, -2.2, .2 + k * 1.8, archGeo(.3, .7), basic(th.win ? th.win.r : th.mech));
        L.view.updaters.push(() => L.say(`wind from the ${wind.name()}${wind.steady() ? '' : ' (turning)'} · vane ${vn.aligned() ? 'along the road' : 'off the road'}`));
      },
      spawn: L => ({ road: L.props.WL, s: 1, dir: 1 }),
      solve(L, W, R) { const P = L.props; P.wind.m.set(!P.wind.at(270)); R.cad = 80; R.gear = 4; },
      center: [0, 3, 1.5], pts: [[-2.8, -1.2, -3], [0, 7, 5.6], [4.2, 1.2, 1.4], [-2.8, 7, 5.6], [0, -1.2, -3]], pad: 1.4,
      decor(L) { cloudLayer(L.view, L.th, '#FFFFFF', 4, .8, .6, .95, .2); drift(L.view, TEX.petal, '#FFE0F0', 10, .12, { vx: .3, vy: -.1, spin: 1 }); } },

    { id: 't-mast', name: 'Spring tide', th: () => THEMES[2], cruise: [70, 92],
      hint: 'No button. The sea follows your average effort over the last quarter of a minute. At high tide the raft\'s arm completes the road out of the quay loop. The raft carries a mast with a road painted up its face. At low tide the top of that road lines up on screen with the road up the lighthouse wall, which stands far behind it. Push to bring the tide in, ride onto the raft, then ease off: as the tide goes out, the raft loop lets the wheel climb the mast, and from the top it carries on up the lighthouse and over onto its gallery.',
      build(L) {
        const th = L.th, g = L.g, P = L.props, HI = 1.6, TAU_S = 15, st = { avg: effort2(), z: 0, lvl: 0 }; P.tide = st;
        const U = L.road(loopPts(-6.6, -1.2, -1, 1.4, HI, .6), { closed: true }); P.U = U;
        { const m = tri(sp(th, 0)), z = HI - .5; B(g, -7.1, -1.7, z - 1.9, -2, -.7, z, m); B(g, -7.1, .9, z - 1.9, -.5, 1.9, z, m); B(g, -7.1, -.7, z - 1.9, -6.1, .9, z, m); B(g, -1.5, -.4, z - 1.9, -.5, .9, z, m); }
        const pg = new T.Group(); g.add(pg);
        B(pg, -1.5, -1.7, -.5, 4.6, 2.2, -.2, tri(tone('#B98552')));
        for (const [x, y] of [[0, -1.4], [4.2, -1.4], [0, 1.9], [4.2, 1.9]]) CY(pg, x, y, .32, -.95, -.45, tri(tone('#C0623E')), 16);
        const armW = L.road(L3([-1.6, -1.2, .006], [2.6, -1.2, .006], UP), { g: pg, pal: tone('#E8C9A0') }); P.armW = armW;
        const R0 = L.road(loopPts(1.2, -1.2, 4, 1.5, 0, .8), { g: pg, closed: true, pal: tone('#E8C9A0') }); P.R0 = R0;
        armW.joins = [{ k: 1, to: R0, s: sAt(R0, [2.6, -1.2, 0]) + .02, dir: 1 }];
        U.forks.push({ s: sAt(U, [-1.6, -1.2, HI]), dir: 1, to: armW, toK: 0, when: () => st.z === HI, text: 'High tide: the raft completes the road' });
        // the mast: from the raft loop's north side straight on west, up a quarter-pipe and up the mast's east face
        const mr = ftur([2, 1.5, .006], [-1, 0, 0], [0, 0, 1]).fwd(1.4).curl(.8, 90).fwd(4), mast = L.road(mr.pts, { g: pg, pal: tone('#E8C9A0'), edgeText: 'Nothing above the mast from here, so the wheel dropped' }); P.mast = mast;
        const mx = .6 - .8, mtop = mr.st.p[2]; B(pg, mx - 1.1, .9, -.2, mx - .02, 2.1, mtop, tri(tone('#C98B5B'))); B(pg, mx - 1.2, .8, mtop, mx + .1, 2.2, mtop + .12, tri(tone('#8A5A3A')));
        R0.forks.push({ s: sAt(R0, [2, 1.5, 0]), dir: 1, to: mast, toK: 0, when: () => st.z === 0, text: 'Low tide: the raft lets the wheel climb the mast' });
        // the lighthouse: 4.5 m behind the mast top at low tide, so its wall road starts exactly there on screen
        const E = mr.st.p, S0 = behind(E, 0, 4.5), lh = ftur(S0, [0, 0, 1], [1, 0, 0]).fwd(2.6).curl(.5, -90).fwd(1.8), roofZ = lh.st.p[2];
        const home = L.road(lh.pts, { goal: true, pal: tone('#E8C9A0') }); P.home = home;
        { const cx = S0[0] - 1.4, cy = S0[1]; CY(g, cx, cy, 1.38, -3, roofZ - .5, tri(sp(th, 0)), 28); for (let k = 0; k < 4; k++) CY(g, cx, cy, 1.4, roofZ - 1.6 - k * 1.6, roofZ - 1.2 - k * 1.6, basic('#E8553B'), 28);
          B(g, S0[0] - .5, cy - .6, -3, S0[0] - .02, cy + .6, roofZ - .5, tri(sp(th, 0))); const lamp = CY(g, cx, cy, .5, roofZ, roofZ + .9, basic(th.goal, { opacity: .6 }), 16); }
        const seaMat = tri({ t: '#7FC8E8', l: '#4FA6CC', r: '#3A8DB5' }, { fresh: true, opacity: .62 }), sea = B(g, -11, -7, -3, 12, 6, -1, seaMat);
        CY(g, -3.8, .1, .08, -2.4, HI + 1.8, tri(th.mechDark || th.idle), 8); const fl = CY(g, -3.8, .1, .22, 0, .2, basic(th.goal), 14);
        for (const z of [-.45, HI - .45]) B(g, -4.1, .04, z - .03, -3.5, .16, z + .03, basic('#FFFFFF'));
        L.view.updaters.push((t, dt) => { if (L.state !== 'play') return; const e = effort2(); st.e = e; st.avg += (e - st.avg) * Math.min(1, dt / TAU_S);
          const want = clamp((st.avg - 100) / 40, 0, 1) * HI; st.lvl += clamp(want - st.lvl, -.12 * dt, .12 * dt);
          let z = st.lvl; for (const f of [0, HI]) if (Math.abs(st.lvl - f) < .26) z = f; st.z = z; pg.position.y = z;
          const top = z - .45; sea.scale.y = top + 3; sea.position.y = (top - 3) / 2; fl.position.y = top + .1;
          L.say(`effort ${Math.round(e)} · average ${Math.round(st.avg)} · tide ${z === HI ? 'in' : z === 0 ? 'out' : Math.round(z / HI * 100) + '%'}`); });
      },
      spawn: L => ({ road: L.props.U, s: 1, dir: 1 }),
      solve(L, W, R) { const P = L.props, on = W.road === P.R0 || W.road === P.mast || W.road === P.home; R.cad = on ? 70 : 96; R.gear = on ? 4 : 6; },
      center: [-1, -1, 1], pts: [[-7.1, -1.7, 0], [4.6, 2.2, 0], [-7.1, 1.9, 1.6], [-.2, 1.5, 6.2], [-6, -3, 4.2], [4.6, -1.7, -1]], pad: .8,
      decor(L) { cloudLayer(L.view, L.th, '#FFFFFF', 4, .8, .6, .95, .2); } },

    { id: 'w-canopy', name: 'Under the canopy', th: () => THEMES[5], cruise: [70, 92], yaws: [0, 90],
      hint: 'The wheel laps a loop hung on chains, riding its underside, upside down. A weathervane hangs under one corner: a short road on a pivot that always points downwind. Turn the wind with the sock (<b>A</b>) until it blows from the west and the vane lines up with the loop. Out on the vane the road just stops, until you turn the camera (<b>Y</b>): from the side, the vane\'s tip meets the underside of a second hanging road, nearer and higher. The wheel crosses still upside down, rolls round its end and rides home on top.',
      build(L) {
        const th = L.th, g = L.g, P = L.props, zc = 3;
        const ul = ftur([2, 0, zc], [1, 0, 0], [0, 0, -1]).fwd(1.3).turn(.7, 90).fwd(1.6).turn(.7, 90).fwd(2.6).turn(.7, 90).fwd(1.6).turn(.7, 90).fwd(1.3);
        const UL = L.road(ul.pts, { closed: true, pal: tone('#F6C8E0') }); P.UL = UL;
        // the loop hangs on chains with nothing above it, so its whole path stays in sight from above
        for (const [x, y] of [[.2, -.2], [3.8, -.2], [.2, -2.8], [3.8, -2.8]]) CY(g, x, y, .05, zc + .5, zc + 6, basic(th.ink || '#333333'), 6);
        const wind = windSock(L, 6, -5.2, 90, 'a'); P.wind = wind;
        const vn = vane(L, { pivot: [3.3, 0, zc - .02], len: [2.4, 0, 0], n: [0, 0, -1], axis: 'y', wind, alignAt: 180, edgeText: 'The vane ended in thin air from here, so the wheel fell' }); P.vane = vn;
        UL.forks.push({ s: sAt(UL, [3.3, 0, zc]), dir: 1, to: vn.road, toK: 0, when: () => vn.aligned(), text: 'The vane lines up with the loop, so the wheel rides on' });
        // the second canopy: from the turned camera, nearer and higher, its underside starts exactly at the vane's tip
        const E = [5.7, 0, zc - .02], H0 = behind(E, 90, -4), u2 = ftur(H0, [1, 0, 0], [0, 0, -1]).fwd(2.6), p2 = [...u2.st.p]; u2.curl(.6, -180).fwd(1.6);
        const home = L.road(u2.pts, { goal: true, pal: tone('#F6C8E0') }); P.home = home;
        B(g, H0[0] - .2, H0[1] - .6, H0[2] + .48, p2[0] + .1, H0[1] + .6, H0[2] + .72, tri(th.idle)).userData.road = true;
        for (const x of [H0[0] + .4, p2[0] - .4]) CY(g, x, H0[1], .05, H0[2] + 1.25, H0[2] + 6, basic(th.ink || '#333333'), 6);
        const cam = cameraCrank(L, { key: 'y', name: 'Camera', at: clearSpot(L, [[7, 3, 0], [-2.5, 2.5, 0], [-2.5, -5, 0], [8, -2, 0], [2, 3.4, 0]], [0, 90]), detents: [0, 90] }); P.cam = cam;
        L.view.updaters.push(() => L.say(`wind from the ${wind.name()}${wind.steady() ? '' : ' (turning)'} · vane ${vn.aligned() ? 'along the loop' : 'off the loop'} · camera ${cam.at(0) ? 'front' : cam.at(90) ? 'side' : 'turning'}`));
      },
      spawn: L => ({ road: L.props.UL, s: 1, dir: 1 }),
      solve(L, W, R) { const P = L.props; R.cad = 80; R.gear = 4; P.wind.m.set(!P.wind.at(180)); P.cam.m.set(!P.cam.at(P.wind.at(180) ? 90 : 0)); },
      center: [3, -1, 3], pts: [[-.6, -3.6, 3], [4.6, .6, 4], [6, -5.2, 0], [-.6, .6, 6], [4.6, -3.6, 6]], pad: .9,
      decor(L) { cloudLayer(L.view, L.th, '#FFFFFF', 4, .8, .6, .95, .2); } },
  ];
  /* ================= generated curtains: a road with holes in it, each hidden from one point of view by a tower, a lifted terrace or a raised shutter ================= */
  // The plan is pure geometry, made from a seed: a loop, a winding road out of it, three holes (one per machine), and for each hole an occluder placed
  // straight in front of it along the camera's line of sight. A plan is kept only if every occluder hides its hole from the one
  // view it is meant for, not from the others, and stands in front of no other piece of road from any view.
  const CURTAIN_NAMES = [['Veil', 'Shutter', 'Lantern', 'Screen', 'Shadow', 'Blind', 'Curtain', 'Hidden', 'Folded', 'Quiet'], ['Walk', 'Lane', 'Terrace', 'Causeway', 'Arcade', 'Steps', 'Gallery', 'Rampart', 'Garden', 'Quay']];
  function curtainPlan(seed) {
    const rnd = mulberry(seed * 7717 + 3), pick = a => a[Math.floor(rnd() * a.length)], vdv = y => { const v = viewDir(y); return [v[0], v[1], v[2]]; };
    const gw = 3.4 + Math.round(rnd() * 3) * .4, gh = 2.6 + Math.round(rnd() * 2) * .4;
    // three holes, three machines: a tower seen past from one camera angle, a terrace on a cadence lift, a shutter raised by a button
    const kinds = pick([['shutter', 'cam', 'lift'], ['cam', 'shutter', 'lift'], ['lift', 'cam', 'shutter'], ['shutter', 'lift', 'cam'], ['cam', 'lift', 'shutter'], ['lift', 'shutter', 'cam']]);
    // the road: west out of the loop's north-west corner, then three or four turns, straights and ramps
    const t = turtle(.6, gh, 180, 0), segs = []; let s = 0;
    const run = (len, gr = 0) => { t.gr(gr); const a = s; t.fwd(len); s += len * Math.hypot(1, gr); segs.push([a, s, gr]); t.gr(0); };
    run(2.6 + rnd() * 2.4);
    const turns = 4 + (rnd() < .5 ? 1 : 0);
    for (let i = 0; i < turns; i++) { const tr = pick([90, -90]); t.arc(1.1, tr); s += 1.1 * Math.PI / 2; run(3.2 + rnd() * 2.8, pick([0, 0, .3, -.3])); }
    const S = t.pts;
    // no crossings, and clear of the loop
    for (let i = 0; i < S.length; i += 3) { const p = S[i].p; if (i > 30 && p[0] > -1 && p[0] < gw + 1 && p[1] > -1 && p[1] < gh + 1) return null;
      for (let j = i + 50; j < S.length; j += 3) { const q = S[j].p; if (Math.hypot(p[0] - q[0], p[1] - q[1]) < 2 && Math.abs(p[2] - q[2]) < 2.2) return null; } }
    // three holes on three different straights (never on a ramp: the hole's ends must sit level)
    const flat = segs.map((g, i) => [g, i]).filter(([g]) => g[2] === 0 && g[1] - g[0] > 3.4);
    if (flat.length < 3) return null;
    const chosen = []; while (chosen.length < 3) { const c = Math.floor(rnd() * flat.length); if (!chosen.includes(c)) chosen.push(c); } chosen.sort((a, b) => a - b);
    const hs = chosen.map(c => flat[c][0]).map(g => g[0] + 1.1 + rnd() * (g[1] - g[0] - 3.4));
    const road = new Road(S), gap = a => [road.at(a).p.clone(), road.at(a + 1.2).p.clone()];
    const holes = hs.map((a, i) => ({ a, kind: kinds[i], pab: gap(a) }));
    const yaws = [0, 90];
    // the loop counts as road too, for the checks
    const G = new Road(loopPts(0, 0, gw, gh, 0, .6)), roads = [road, G];
    const near = (p, h) => p.distanceTo(h.pab[0].clone().lerp(h.pab[1], .5)) < 1.6;
    const covers = (meshes, skip) => { const ray = new T.Raycaster(); let n = 0;
      for (const r of roads) for (let x = 0; x <= r.L; x += .4) { const p = r.at(x).p; if (skip(p)) continue;
        for (const y of yaws) { const d = toCam(y); ray.set(p.clone().addScaledVector(d, 100), d.clone().negate()); const h = ray.intersectObjects(meshes, false); if (h.length && h[0].distance < 99.8) return true; }
        for (const m of meshes) { const bb = new T.Box3().setFromObject(m).expandByScalar(.6); if (bb.containsPoint(p)) return true; } }
      return false; };
    const tb = (x0, y0, z0, x1, y1, z1) => [x0, z0, y0, x1, z1, y1];   // sketch box to three box
    // a tower hides its hole from the side view (from the front it would always hide it, and the loop would never hold the wheel);
    // the terrace and the shutter hide theirs from whichever view the seed picks, so the camera matters for them too
    for (const h of holes) {
      h.yaw = h.kind === 'cam' ? 90 : pick([0, 90]);
      const pa = [h.pab[0].x, h.pab[0].z, h.pab[0].y], pb = [h.pab[1].x, h.pab[1].z, h.pab[1].y], vd = vdv(h.yaw);
      let ok = null;
      for (const k of [3.5, 4.5, 5.5, 3, 6.5, 2.5, 7.5]) {
        const qa = pa.map((v, j) => v + vd[j] * k), qb = pb.map((v, j) => v + vd[j] * k), x0 = Math.min(qa[0], qb[0]) - .5, x1 = Math.max(qa[0], qb[0]) + .5, y0 = Math.min(qa[1], qb[1]) - .5, y1 = Math.max(qa[1], qb[1]) + .5, zc = (qa[2] + qb[2]) / 2;
        if (h.kind === 'cam') {
          const top = zc + .55, box = tb(Math.min(x0, x1 - 1.3), Math.min(y0, y1 - 1.3), top - 9, x1, y1, top), m = [boxMesh(box)];
          if (!hidesGap(m, h.pab[0], h.pab[1], h.yaw) || hidesGap(m, h.pab[0], h.pab[1], h.yaw ? 0 : 90)) continue;
          if (covers(m, p => near(p, h))) continue;
          ok = { k, tower: [Math.min(x0, x1 - 1.3), Math.min(y0, y1 - 1.3), x1, y1, top] }; break;
        } else {
          const hi = tb(x0 - .3, y0 - .3, zc - .25, x1 + .3, y1 + .3, zc + .2), lo = hi.slice(); lo[1] -= 2.4; lo[4] -= 2.4;
          const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, post = tb(cx - .2, cy - .2, -7, cx + .2, cy + .2, zc - .25), mh = [boxMesh(hi)];
          if (!hidesGap(mh, h.pab[0], h.pab[1], h.yaw) || hidesGap([boxMesh(lo)], h.pab[0], h.pab[1], h.yaw) || hidesGap(mh, h.pab[0], h.pab[1], h.yaw ? 0 : 90)) continue;
          if (covers([boxMesh(hi), boxMesh(lo), boxMesh(post)], p => near(p, h))) continue;
          ok = { k, deck: [x0 - .3, y0 - .3, x1 + .3, y1 + .3, zc], post: [cx, cy] }; break;
        }
      }
      if (!ok) return null; Object.assign(h, ok);
    }
    // the tower must not hide another hole from that hole's own view, or that hole's machine would not matter
    for (const h of holes) for (const o of holes) if (o !== h && o.tower) { const box = tb(o.tower[0], o.tower[1], o.tower[4] - 9, o.tower[2], o.tower[3], o.tower[4]); if (hidesGap(box, h.pab[0], h.pab[1], h.yaw)) return null; }
    const theme = Math.floor(rnd() * 6), name = `${pick(CURTAIN_NAMES[0])} ${pick(CURTAIN_NAMES[1])}`;
    return { seed, gw, gh, S, holes: holes.map(h => ({ a: h.a, kind: h.kind, yaw: h.yaw, tower: h.tower, deck: h.deck, post: h.post })), yaws, theme, name };
  }
  function curtainDef(plan) {
    const { gw, gh, S, holes, yaws } = plan;
    const all = S.map(q => q.p).concat([[-.6, -.6, 0], [gw + .6, gh + .6, 0]]); for (const h of holes) if (h.tower) all.push([h.tower[0], h.tower[1], h.tower[4]], [h.tower[2], h.tower[3], h.tower[4] - 4]); else all.push([h.deck[0], h.deck[1], h.deck[4] + 1.4], [h.deck[2], h.deck[3], h.deck[4] - 3]);
    const lo = [0, 1, 2].map(j => Math.min(...all.map(p => p[j]))), hi = [0, 1, 2].map(j => Math.max(...all.map(p => p[j])));
    const view = y => y ? 'the side view' : 'the front view', step = h => h.kind === 'lift' ? `spin up to lift the terrace (from ${view(h.yaw)})` : h.kind === 'shutter' ? `raise the shutter (from ${view(h.yaw)})` : 'turn the camera to the side, past the tower';
    return { id: `curtain-${plan.seed}`, name: plan.name, th: () => THEMES[plan.theme], cruise: [55, 92], yaws, generated: true,
      hint: `A hole you cannot see is not there. Three holes cut the road home, each hidden from one point of view only: a tower hides one from the side, a terrace on a cadence lift (no button: about 55 rpm keeps it low, 85 lifts it into place) hides another, and a shutter you raise with <b>A</b> hides the third. <b>Y</b> turns the camera. The loop lets the wheel go only when the road ahead looks whole. In order: ${holes.map(step).join('; then ')}.`,
      build(L) {
        const th = L.th, g = L.g, P = L.props;
        const G = L.road(loopPts(0, 0, gw, gh, 0, .6), { closed: true }); P.G = G; loopSlab(g, -.5, -.5, gw + .5, gh + .5, -.5, tri(th.turf || sp(th, 0)), .9);
        let rest = S, off = 0; const pieces = [];
        for (const h of holes) { const [A, Bs] = cutSamples(rest, h.a - off, h.a - off + 1.2); pieces.push(A); rest = Bs; off = h.a + 1.2; }
        pieces.push(rest); P.pieces = pieces.map((ps, i) => L.road(ps, i === pieces.length - 1 ? { goal: true } : {}));
        const e = S[S.length - 1].p; B(g, e[0] - .9, e[1] - .9, e[2] - 2.4, e[0] + .9, e[1] + .9, e[2] - .5, tri(sp(th, 1)));
        // occluders: the tower stands on its own; the terrace and the shutter ride slim telescoping posts, 2.4 m apart between down and up
        const telescope = (grp, h) => { const [cx, cy] = h.post, z = h.deck[4]; CY(g, cx, cy, .28, -7, z - 3.1, tri(th.idle), 14); CY(grp, cx, cy, .2, z - 3.1, z - .7, tri(th.idle), 14); };
        P.holes = holes.map((h, i) => {
          let occ, mover = null;
          if (h.tower) { const [x0, y0, x1, y1, top] = h.tower, o = tower(L, x0, y0, x1, y1, top); occ = () => [o]; }
          else { const grp = new T.Group(); g.add(grp); grp.position.y = -2.4; const [x0, y0, x1, y1, z] = h.deck; mover = { grp, lvl: 0, z: 0, up: false };
            if (h.kind === 'lift') { B(grp, x0, y0, z - .25, x1, y1, z + .2, tri(th.turf || sp(th, 0))); B(grp, x0 + .1, y0 + .1, z - .7, x1 - .1, y1 - .1, z - .25, tri(sp(th, 0)));
              if (th.leaf) for (const f of [.25, .75]) { const x = x0 + (x1 - x0) * f, y = y0 + (y1 - y0) * (1 - f); CY(grp, x, y, .07, z + .2, z + .6, tri(tone('#9B7046')), 6); const cr = new T.Mesh(new T.IcosahedronGeometry(.36, 0), tri(th.leaf)); at(grp, cr, x, y, z + .85); }
              else { const [cx, cy] = h.post; CY(grp, cx, cy, .3, z + .2, z + .7, tri(sp(th, 0)), 14); const dm = new T.Mesh(new T.SphereGeometry(.34, 14, 7, 0, TAU, 0, Math.PI / 2), tri(th.roof || th.mech)); at(grp, dm, cx, cy, z + .7); } }
            else { // the shutter: a slatted panel in a frame, in the machine colour
              const sm = tri(th.mech, { fresh: true }); mover.mat = sm; B(grp, x0, y0, z - .25, x1, y1, z + .2, sm);
              for (const f of [.2, .4, .6, .8]) B(grp, x0 - .04, y0 - .04, z - .25 + .45 * f - .02, x1 + .04, y1 + .04, z - .25 + .45 * f + .02, tri(th.mechDark || th.idle));
              B(grp, x0 - .08, y0 - .08, z - .7, x1 + .08, y1 + .08, z - .25, tri(th.mechDark || th.idle)); }
            telescope(grp, h); occ = () => mover.z === 2.4 ? [grp] : []; }
          const hg = hiddenGap(L, P.pieces[i], 1, P.pieces[i + 1], 0, occ, { text: h.tower ? 'Behind the tower, so the hole was not there' : h.kind === 'lift' ? 'Behind the terrace, so the hole was not there' : 'Behind the shutter, so the hole was not there' });
          return Object.assign({ kind: h.kind, yaw: h.yaw, mover }, hg); });
        G.forks.push({ s: sAt(G, [.6, gh, 0]), dir: 1, to: P.pieces[0], toK: 0, when: () => P.holes[0].hidden(), text: 'The road ahead looks whole, so the wheel rides on' });
        const xs = [lo[0] - 2, hi[0] + 2], ys = [lo[1] - 2, hi[1] + 2], spots = [[xs[1], ys[0], 0], [xs[1], ys[1], 0], [gw + 2.4, gh / 2, 0], [gw / 2, -2.4, 0], [xs[0], ys[1], 0], [xs[0], ys[0], 0], [gw + 2.4, -2, 0], [-2.4, -2, 0]];
        const camAt = clearSpot(L, spots, yaws); P.cam = cameraCrank(L, { key: 'y', name: 'Camera', at: camAt, detents: [0, 90] });
        const L_ = P.holes.find(h => h.kind === 'lift').mover, SH = P.holes.find(h => h.kind === 'shutter').mover; P.liftM = L_; P.shutter = SH;
        (L.drags ||= []).push(() => L_.moving ? .2 : 0);
        const snap = m => { let z = m.lvl * 2.4; for (const f of [0, 2.4]) if (Math.abs(m.lvl * 2.4 - f) < .3) z = f; m.z = z; m.grp.position.y = z - 2.4; };
        L.view.updaters.push((t, dt) => { if (L.state !== 'play') return; const target = clamp((rider.cad - 55) / 30, 0, 1), prev = L_.lvl; L_.lvl += clamp(target - L_.lvl, -.67 * dt, .67 * dt); L_.moving = Math.abs(L_.lvl - prev) > 1e-5; snap(L_); });
        // the shutter's button: hold it and pedal to wind it up or down; let go and it settles at the nearer end
        SH.sweep = 1; const at2 = clearSpot(L, spots.filter(q => q !== camAt), yaws);
        SH.m = L.machine({ key: 'a', name: 'Shutter', size: .55, place: h => { h.position.copy(V(at2[0], at2[1], at2[2] + .04)); g.add(h); },
          tick(dt, drive) { if (drive > 0) { SH.lvl += SH.sweep * drive * .35; if (SH.lvl <= 0 || SH.lvl >= 1) { SH.lvl = clamp(SH.lvl, 0, 1); SH.sweep *= -1; } }
            else SH.lvl += clamp((SH.lvl > .5 ? 1 : 0) - SH.lvl, -.7 * dt, .7 * dt);
            snap(SH); setTri(SH.mat, mixPal(th.mech, tone(th.goal), clamp(this.bloom.e, 0, 1))); const off = Math.min(SH.lvl, 1 - SH.lvl); return drive > 0 ? .25 + .6 * Math.exp(-((off / .08) ** 2)) : 0; } });
        CY(g, at2[0], at2[1], .6, at2[2] - 2.4, at2[2] - .02, tri(sp(th, 0)), 28);
        L.view.updaters.push(() => { if (L.state !== 'play') return; L.say(`cadence ${Math.round(rider.cad)} rpm · terrace ${L_.z === 2.4 ? 'up' : L_.z === 0 ? 'down' : 'moving'} · shutter ${SH.z === 2.4 ? 'up' : SH.z === 0 ? 'down' : 'moving'} · camera ${P.cam.at(0) ? 'front' : P.cam.at(90) ? 'side' : 'turning'} · holes ${P.holes.map(h => h.hidden() ? 'hidden' : 'seen').join(', ')}`); });
      },
      spawn: L => ({ road: L.props.G, s: 1, dir: 1 }),
      solve(L, W, R) { const P = L.props, i = W.road === P.G ? 0 : P.pieces.indexOf(W.road), h = P.holes[i]; R.gear = 4;
        let want = P.cam.at(90) ? 90 : 0, cad = 62, sh = false; if (h) { want = h.yaw; if (h.kind === 'lift') cad = 85; if (h.kind === 'shutter') sh = P.shutter.z !== 2.4; } else cad = 70;
        R.cad = cad; P.shutter.m.set(sh); P.cam.m.set(!P.cam.at(want)); },
      center: lo.map((v, j) => (v + hi[j]) / 2), pts: [lo, hi, [lo[0], hi[1], lo[2]], [hi[0], lo[1], hi[2]]], pad: .8,
      decor(L) { cloudLayer(L.view, L.th, '#FFFFFF', 4, .8, .6, .95, .2); } };
  }

  return { PSTUDIES, MSTUDIES, CSTUDIES, GSTUDIES, G2STUDIES, sceneryPass, curtainPlan, curtainDef }; })();
  const sceneryPass = EXTRA.sceneryPass;
  { const pool = {}; for (const d of [...LEVELS, ...STUDIES, ...EXTRA.PSTUDIES, ...EXTRA.MSTUDIES, ...EXTRA.CSTUDIES, ...EXTRA.GSTUDIES, ...EXTRA.G2STUDIES]) pool[d.id] = d;
    const CAMP = [{"name": "1 \u00b7 Turntables", "levels": ["turntable", "3:11", "3:28", "10:5", "10:45"]}, {"name": "2 \u00b7 Crossovers", "levels": ["cross", "crosshub", "0:7", "8:4", "8:30"]}, {"name": "3 \u00b7 Cadence lifts", "levels": ["m-lift", "c-curtain", "7:38", "c-under"]}, {"name": "4 \u00b7 See-saws", "levels": ["5:4", "5:23", "9:46"]}, {"name": "5 \u00b7 Tide and wind", "levels": ["m-tide", "c-tide", "m-wind"]}, {"name": "6 \u00b7 Walls and ceilings", "levels": ["g-wall", "w-vane", "g-under", "t-mast", "w-canopy"]}, {"name": "7 \u00b7 Sight", "levels": ["p-turn", "c-bridge", "m-gyro", "c-towers", "6:28", "6:20"]}, {"name": "8 \u00b7 Generated curtains", "levels": ["cg:297", "cg:187", "cg:86", "cg:510"]}];
    LEVELS.length = 0;
    for (const ch of CAMP) for (const it of ch.levels) {
      let d; if (typeof it === 'string' && pool[it]) d = pool[it]; else if (String(it).startsWith('cg:')) { const pl = EXTRA.curtainPlan(+String(it).slice(3)); if (!pl) continue; d = EXTRA.curtainDef(pl); } else { const [ti, sd] = String(it).split(':').map(Number); const r = penroseGen9.plan3For(ti, sd); if (!r.plan) continue; d = genDef3(r.plan, r.sol); }
      LEVELS.push(Object.assign(Object.create(d), { chapter: ch.name })); } }
  /* ---------- the engine's API: the renderer feeds the rider from the bike and the sim's commands ---------- */
  const machineFor = key => LVL && LVL.machines.find(m => m.key === key);
  return {
    levels: LEVELS.map((d, i) => ({ id: d.id, name: d.name, chapter: d.chapter })),
    get index() { return lvIndex; },
    get level() { return LVL; },
    get autopilot() { return autopilot; },
    rider,
    load(i, quiet) { setAutopilot(false); loadLevel(((i % LEVELS.length) + LEVELS.length) % LEVELS.length, quiet); },
    restart() { setAutopilot(false); loadLevel(lvIndex, true); },
    setAutopilot,
    toggle(key) { const m = machineFor(key); if (!m) return false; setAutopilot(false); m.set(!m.on); return true; },
    machines() { return LVL ? LVL.machines.map(m => ({ key: m.key, name: m.name, on: m.on })) : []; },
    load01() { return LVL ? Math.min(1.5, LVL.load || 0) / 1.5 : 0; },
    resize() { lvView.resize(); },
    tick(dt) { lvView.tick(reduce ? dt * .5 : dt); },
    /** Advance the level without drawing (scripted checks). */
    simulate(dt) { lvView.t += dt; for (const u of lvView.updaters.slice()) u(lvView.t, dt); },
    dispose() { lvView.clear(); R3.dispose(); R3.forceContextLoss(); R3.domElement.remove(); for (const t of [...Object.values(TEX), ...Object.values(TEXS)]) t.dispose(); },
  };
}
