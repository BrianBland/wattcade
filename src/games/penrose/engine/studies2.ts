// @ts-nocheck
/* Penrose Pedals engine: studies for the new mechanics (conveyor lanes first). Each study is a short level that shows one
 * mechanic working on its own before the composer uses it as a beat.
 * Installed into the shared engine scope in order (see ./index.ts); names come in from $scope and go back out to it. */
import * as T from 'three';

export function install($scope) {
const { B, CY, L3, R3, Road, ribbon, UP, THEMES, V, basic, clamp, ftur, liveGap, loopPts, loopSlab, mixPal, rider, sAt, setTri, sp, tone, tri } = $scope;

/**
 * A conveyor belt laid across parallel lanes. Engaged (its button), it runs at your cadence and carries the wheel sideways
 * as it rolls over: the faster you pedal, the more lanes it shifts (bands: under lo -> 1 lane, lo..hi -> 2, over hi -> 3).
 * o: { x, y0 (the source lane), dy (lane spacing, signed: the direction it carries), lanes: [road per shift 1..n], key,
 *      bands: [lo, hi], from: the source road }
 */
function conveyor(L, o) {
  const th = L.th, g = L.g, n = o.lanes.length, y1 = o.y0 + o.dy * n, w = .9;
  const ylo = Math.min(o.y0, y1) - .7, yhi = Math.max(o.y0, y1) + .7;
  // the bed, flush with the ground, and slats that run across it while the belt is on
  B(g, o.x - w / 2 - .12, ylo - .12, -.5, o.x + w / 2 + .12, yhi + .12, .0, tri(th.mechDark || th.idle));
  const slatM = tri(th.mech, { fresh: true }), slats = [], gap = .38, len = yhi - ylo;
  for (let k = 0; k * gap < len; k++) { const m = new T.Mesh(UNIT_BOX, slatM); m.scale.set(w, .1, .14); g.add(m); slats.push(m); }
  const st = { off: 0, shift: () => { const [lo, hi] = o.bands; return rider.cad < lo ? 1 : rider.cad < hi ? 2 : 3; } };
  st.m = L.machine({ key: o.key || 'y', name: 'Conveyor', size: .5, place: (h) => { h.position.copy(V(o.x + 1.2, ylo - .3, .04)); g.add(h); },
    tick(dt, drive) { if (drive > 0) st.off += drive * 2.2; setTri(slatM, mixPal(th.mech, tone(th.goal), clamp(this.bloom.e, 0, 1) * .5)); return drive > 0 ? .25 : 0; } });
  L.view.updaters.push(() => { slats.forEach((m, k) => { let y = (k * gap + st.off * Math.sign(o.dy)) % len; if (y < 0) y += len; m.position.copy(V(o.x, ylo + y, .05)); }); });
  // the forks: one per shift, each landing on its lane where the belt crosses it, sliding across with the belt
  o.lanes.forEach((lane, i) => o.from.forks.push({ s: sAt(o.from, [o.x, o.y0, 0]), dir: 1, to: lane, toS: () => sAt(lane, [o.x + .3, o.y0 + o.dy * (i + 1), 0]), slide: .8, toDir: 1,
    when: () => st.m.on && st.shift() === i + 1, text: `The belt carries the wheel across ${i + 1} lane${i ? 's' : ''}` }));
  return st;
}
const UNIT_BOX = new T.BoxGeometry(1, 1, 1);

/**
 * A companion block on a rail. It keeps pace with the wheel: as the wheel laps its loop, the block runs back and forth
 * along the rail. Its button holds it where it is (press again to let it go). Held at the right spot, it stands between
 * the camera and a hole, so the hole is not there.
 * o: { follow: the loop it keeps pace with, a, b: rail ends [x, y, z], key }
 */
function companion(L, o) {
  const th = L.th, g = L.g, a = o.a, b = o.b, len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const dir = [(b[0] - a[0]) / len, (b[1] - a[1]) / len], z = a[2];
  // a slim rail on two posts
  const rail = new T.Mesh(UNIT_BOX, tri(th.mechDark || th.idle)); rail.scale.set(len + .4, .12, .16); rail.position.copy(V((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, z - .08)); rail.rotation.y = -Math.atan2(dir[1], dir[0]); g.add(rail);
  for (const p of [a, b]) CY(g, p[0], p[1], .07, -.5, z - .16, tri(th.mechDark || th.idle), 8);
  // the companion: a small block with two eyes
  const blk = new T.Group(); g.add(blk); const body = new T.Mesh(UNIT_BOX, tri(th.mech, { fresh: true })); body.scale.set(1.05, 1.05, 1.05); body.position.y = .53; blk.add(body);
  for (const sx of [-.17, .17]) { const eye = new T.Mesh(new T.SphereGeometry(.07, 10, 8), basic('#26243A')); eye.position.copy(V(.53, sx, .68)); blk.add(eye); }
  const st = { t: 0, held: false, blk, at: (x) => Math.abs(st.t * len - x) < .25 };
  st.m = L.machine({ key: o.key || 'a', name: 'Companion', size: .45, place: (h) => { h.position.copy(V(a[0] - .9 * dir[0], a[1] - .9 * dir[1], .04)); g.add(h); },
    tick(dt, drive) { return 0; }, set(on) {} });
  // a press holds it; a second press lets it go (the machine's on state is the hold)
  L.view.updaters.push(() => {
    st.held = st.m.on;
    const W = L.W;
    if (!st.held && W && W.road === o.follow && W.mode === 'road') { const f = W.s / o.follow.L; st.t = f < .5 ? f * 2 : 2 - f * 2; }
    blk.position.copy(V(a[0] + dir[0] * st.t * len, a[1] + dir[1] * st.t * len, z));
    blk.rotation.y = -Math.atan2(dir[1], dir[0]) + (st.held ? 0 : Math.sin(L.view.t * 9) * .05);
    setTri(body.material, mixPal(th.mech, tone(th.goal), st.held ? .45 : 0));
  });
  return st;
}

/**
 * A clutch bridge. Its button engages the clutch: while engaged, pedalling winds the deck out across a gap. Press again to
 * lock it where it is. Lock it with its tip on the catch across the gap and it carries the wheel; wind it past the catch and
 * the clutch slips and the deck runs back in. Nothing here asks the rider to stop pedalling.
 * o: { from: road whose end k=1 is the near lip, to: road whose end k=0 is the far lip, key, rate (m per drive unit), catch (m) }
 */
function clutchBridge(L, o) {
  const th = L.th, g = L.g, a = o.from.end(1).p, b = o.to.end(0).p, span = a.distanceTo(b), max = span + (o.catch || .6);
  const d = b.clone().sub(a).normalize(), deckM = tri(th.mech, { fresh: true });
  const deck = new T.Mesh(UNIT_BOX, deckM); g.add(deck);
  // the housing under the near lip, and the catch plate on the far lip (the tip must stop on it)
  const hz = a.y, house = new T.Mesh(UNIT_BOX, tri(th.mechDark || th.idle)); house.scale.set(.5, .7, 1.1); house.position.set(a.x - d.x * .25, hz - .4, a.z - d.z * .25); house.rotation.y = Math.atan2(-d.z, d.x); g.add(house);
  // the catch: two pairs of red bollards on the far side, marking where the tip must stop
  const catM = basic(th.goal || '#E8553B'), px = -d.z, pz = d.x;
  for (const t of [span, max]) for (const sd of [-.55, .55]) { const q = a.clone().addScaledVector(d, t); CY(g, q.x + px * sd, q.z + pz * sd, .07, hz - .1, hz + .28, catM, 10); }
  const st = { len: 0, was: false, spans: () => st.len >= span && st.len <= max, locked: () => !st.m.on && st.len > 0 };
  st.m = L.machine({ key: o.key || 'z', name: 'Clutch', size: .45, place: (h) => { if (o.btn) h.position.copy(V(o.btn[0], o.btn[1], (o.btnZ || 0) + .04)); else h.position.set(a.x - d.x * .9 + d.z * 1.1, .04, a.z - d.z * .9 + d.x * 1.1); g.add(h); },
    tick(dt, drive) { if (this.on && drive > 0) { st.len += drive * (o.rate || .22); if (st.len > max) st.len = 0; } return this.on && drive > 0 ? .3 : 0; } });
  L.view.updaters.push(() => {
    const l = Math.max(.001, st.len); deck.scale.set(l, .08, .9); deck.position.set(a.x + d.x * l / 2, hz - .07, a.z + d.z * l / 2); deck.rotation.y = house.rotation.y; deck.visible = st.len > .02;
    setTri(deckM, mixPal(th.mech, tone(th.goal), st.locked() && st.spans() ? .5 : 0));
  });
  o.from.gaps.push({ k: 1, to: o.to, toK: 0, when: () => st.locked() && st.spans(), text: 'The bridge was locked on the catch' });
  o.from.edgeText = st.len < span ? 'The bridge stopped short' : 'The bridge was not locked';
  return st;
}

/**
 * Reflections on a pool. Roads ride flat on the water, and the pool paints the reflection of whatever stands above it over
 * them, as a real pool would. While the water is still, what it shows is real: a reflected road is a road (the wheel can
 * turn onto it), a reflected gate is a gate (the road under it is shut). Hard pedalling raises a wind that ruffles the
 * water; ruffled, the reflection breaks up and none of it is there. Calm is a cadence under o.calm rpm, never a stop.
 * o: { pool: [x0, y0, x1, y1], wz (water height), calm, over(og): builds the things above the pool into og; meshes may set
 *      userData.rc for their reflected colour }
 * Seen from the fixed camera, the reflection of a point h above the water lands on the water at (x + h, y + h): reflect()
 * gives that spot, so a reflected road can be ridden by an invisible road laid there.
 */
let CLIP_ON = false;
function reflection(L, o) {
  const th = L.th, g = L.g, [x0, y0, x1, y1] = o.pool, wz = o.wz ?? -.04, calm = o.calm ?? 74;
  if (!CLIP_ON) { R3.localClippingEnabled = true; CLIP_ON = true; }
  // the basin: a stone rim, shallow walls and a dark bed under a bright, still surface
  const rimM = tri(sp(th, 0));
  for (const m of [B(g, x0 - .2, y0 - .2, -.5, x1 + .2, y0, -.02, rimM), B(g, x0 - .2, y1, -.5, x1 + .2, y1 + .2, -.02, rimM),
    B(g, x0 - .2, y0, -.5, x0, y1, -.02, rimM), B(g, x1, y0, -.5, x1 + .2, y1, -.02, rimM),
    B(g, x0, y0, -.5, x1, y1, wz - .02, tri({ t: '#7FC3D4', l: '#5FA7BA', r: '#4A8DA0' }))]) m.userData.keep = true;
  // the things above the pool, and their reflection: the same meshes flipped in the water plane, drawn flat over the
  // surface (and over any road riding on it), clipped to the pool's edge
  const og = new T.Group(); g.add(og); o.over(og);
  // clip to the pool as seen: a reflected point at height z shows on the water at (x + wz - z, y + wz - z), so each edge is
  // a plane through the view direction (three: x = x, y = up, z = sketch y)
  const k = Math.SQRT1_2, P3 = (nx, ny, nz, c) => new T.Plane(new T.Vector3(nx * k, ny * k, nz * k), c * k);
  const clip = [P3(1, -1, 0, wz - x0), P3(-1, 1, 0, x1 - wz), P3(0, -1, 1, wz - y0), P3(0, 1, -1, y1 - wz)];
  const rg = og.clone(true); rg.position.y = 2 * wz; rg.scale.y = -1; g.add(rg);
  const mats = [];
  rg.traverse((m) => { if (!m.isMesh) return; const c = new T.Color(m.userData.rc || '#FFFFFF').lerp(new T.Color('#7FC3D4'), .25);
    m.material = new T.MeshBasicMaterial({ color: c, transparent: true, opacity: .9, depthTest: false, depthWrite: false, side: T.DoubleSide, clippingPlanes: clip }); m.renderOrder = 6; mats.push(m.material); });
  // ripple rings that spread while the wind blows
  const rings = [0, 1, 2].map(() => { const m = new T.Mesh(new T.TorusGeometry(1, .02, 4, 40), new T.MeshBasicMaterial({ color: '#FFFFFF', transparent: true, opacity: 0, depthTest: false, depthWrite: false, clippingPlanes: clip })); m.rotation.x = Math.PI / 2; m.renderOrder = 7; g.add(m); return m; });
  const st = { wind: 0, og, still: () => st.wind < .15, ruffled: () => st.wind > .8, reflect: (p) => [p[0] + (p[2] - wz), p[1] + (p[2] - wz), wz + .046] };
  L.view.updaters.push((t0, dt0) => {
    const dt = dt0 || 1 / 60, target = clamp((rider.cad - calm) / 10, 0, 1); st.wind += (target - st.wind) * Math.min(1, dt * 2.5);
    const t = L.view.t || 0, w = st.wind;
    rg.visible = w < .95; rg.position.x = Math.sin(t * 7) * w * .12; rg.position.z = Math.cos(t * 5) * w * .08;
    for (const m of mats) m.opacity = .9 * (1 - w * w);
    rings.forEach((m, i) => { const f = ((t * .5 + i / 3) % 1); m.scale.setScalar(.3 + f * 1.4); m.material.opacity = w * (1 - f) * .9;
      m.position.copy(V(x0 + (x1 - x0) * (.3 + .2 * i), y0 + (y1 - y0) * (.35 + .15 * i), wz + .01)); });
  });
  return st;
}

/**
 * Matching doors. Two doorways with the same banner are one doorway: ride into one and you ride out of the other, and looking into one you see out of the other. The near
 * door's banner turns with its button (each press shows the next banner); when it matches the far door's, they connect.
 * o: { road, at: [x, y] on road, to: road the far door opens onto (from its start), far: [x, y], farAng, ang, key, banners, want }
 */
const PORTAL_VS = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
// closed: a calm spiral in the banner colour; open: the far side, looked up in screen space so it keeps the camera's view
const PORTAL_FS = `uniform float uT; uniform vec3 uC; uniform float uOpen; uniform sampler2D uMap; uniform vec2 uRes; uniform vec3 uSkyA; uniform vec3 uSkyB; varying vec2 vUv;
void main() { vec2 p = vUv - .5; p.x *= 1.12 / 1.46; float r = length(p), a = atan(p.y, p.x);
  float sw = smoothstep(-.3, .3, sin(a * 2. - r * 9. + uT * 1.6));
  vec3 c = mix(uC * .78, mix(uC, vec3(1.), .5), sw * .55 + smoothstep(.45, .0, r) * .45);
  vec2 sc = gl_FragCoord.xy / uRes; vec4 tx = texture2D(uMap, sc); vec3 sky = mix(uSkyB, uSkyA, sc.y);
  vec3 v = mix(sky, tx.rgb, tx.a); vec3 col = mix(c, v, uOpen);
  vec2 e = abs(vUv - .5) * 2.; float rim = step(.94, max(e.x, e.y * 1.01));
  gl_FragColor = vec4(mix(col, mix(uC, vec3(1.), .35), rim * (1. - uOpen * .6)), 1.); }`;
const BANNERS = ['#FF6B4A', '#FFC93C', '#46D6C2'];
function doorway(g, th, x, y, ang, z = 0) {
  const grp = new T.Group(); grp.position.copy(V(x, y, z)); grp.rotation.y = ang; g.add(grp);
  const stone = tri(sp(th, 0)), m = (sx, sy, sz, px, py, pz, mat) => { const b = new T.Mesh(UNIT_BOX, mat); b.scale.set(sx, sy, sz); b.position.set(px, py, pz); grp.add(b); return b; };
  for (const sd of [-.68, .68]) m(.24, 1.5, .24, 0, .75, sd, stone);
  m(.3, .22, 1.6, 0, 1.6, 0, stone);
  const bannerM = new T.MeshBasicMaterial({ color: '#FFFFFF' }), banner = m(.08, .5, .8, 0, 1.97, 0, bannerM);
  m(.12, .08, .96, 0, 2.26, 0, stone);
  // the portal: a swirl in the banner's colour that fills the opening; open, it shows a live view of the other side
  const pm = new T.ShaderMaterial({ uniforms: { uT: { value: 0 }, uC: { value: new T.Color('#FFFFFF') }, uOpen: { value: 0 }, uMap: { value: null }, uRes: { value: new T.Vector2(1, 1) }, uSkyA: { value: new T.Color('#BFE8F0') }, uSkyB: { value: new T.Color('#F7F2CF') } },
    side: T.DoubleSide, vertexShader: PORTAL_VS, fragmentShader: PORTAL_FS });
  const portal = new T.Mesh(new T.PlaneGeometry(1.12, 1.46), pm); portal.rotation.y = Math.PI / 2; portal.position.set(0, .745, 0); grp.add(portal);
  return { grp, bannerM, portal, pm };
}
function matchingDoors(L, o) {
  const th = L.th, g = L.g, bs = o.banners || BANNERS;
  const near = doorway(g, th, o.at[0], o.at[1], o.ang || 0, o.atZ || 0), far = doorway(g, th, o.far[0], o.far[1], o.farAng || 0, o.z || 0);
  far.bannerM.color.set(bs[o.want]);
  const st = { i: o.fixed ? o.want : 0, was: false, match: () => st.i === o.want, near, far };
  // a fixed pair is always open (no banner button): its use is in where it leads, which you see by looking through it
  if (!o.fixed) st.m = L.machine({ key: o.key || 'a', name: 'Banner', size: .45, place: (h) => { h.position.copy(V(o.at[0] + (o.btn?.[0] ?? 0), o.at[1] + (o.btn?.[1] ?? 1.3), (o.atZ || 0) + .04)); g.add(h); },
    tick() { if (this.on !== st.was) { st.was = this.on; st.i = (st.i + 1) % bs.length; } return 0; } });
  // the view through: the main camera carried through the doors (far * near^-1 * camera), so looking into the near door
  // shows the far side from the same angle, as if the two doorways were one. Rendered at screen size, sampled in screen space.
  const rt = new T.WebGLRenderTarget(4, 4), vc = new T.OrthographicCamera(); vc.matrixAutoUpdate = false; vc.matrixWorldAutoUpdate = false;
  const sky = (L.th.sky || '').match(/#[0-9A-Fa-f]{6}/g) || [];
  if (sky.length) { for (const d of [near, far]) { d.pm.uniforms.uSkyA.value.set(sky[0]); d.pm.uniforms.uSkyB.value.set(sky[sky.length - 1]); } }
  const M = new T.Matrix4(), inv = new T.Matrix4(), size = new T.Vector2();
  st.open = 0;
  L.view.updaters.push((t, dt) => {
    near.bannerM.color.set(bs[st.i]); near.pm.uniforms.uC.value.set(bs[st.i]); far.pm.uniforms.uC.value.set(bs[o.want]);
    near.pm.uniforms.uT.value = far.pm.uniforms.uT.value = t || 0;
    st.open += ((st.match() ? 1 : 0) - st.open) * Math.min(1, (dt || 1 / 60) * 3); near.pm.uniforms.uOpen.value = st.open;
    if (st.open < .01) return;
    const cam = L.view.camera; R3.getDrawingBufferSize(size); const sh = o.rtShift ?? 1, w = Math.max(4, size.x >> sh), h = Math.max(4, size.y >> sh);
    if (rt.width !== w || rt.height !== h) rt.setSize(w, h);
    near.pm.uniforms.uRes.value.copy(size);
    for (const k of ['left', 'right', 'top', 'bottom', 'near', 'far', 'zoom']) vc[k] = cam[k]; vc.updateProjectionMatrix();
    near.grp.updateMatrixWorld(); far.grp.updateMatrixWorld();
    M.copy(far.grp.matrixWorld).multiply(inv.copy(near.grp.matrixWorld).invert()).multiply(cam.matrixWorld);
    vc.matrix.copy(M); vc.matrixWorld.copy(M); vc.matrixWorldInverse.copy(M).invert(); vc.layers.enableAll();
    // hide the far doorway (it stands between that camera and the far side) and both portals while rendering
    const vis = [far.grp.visible, near.portal.visible]; far.grp.visible = false; near.portal.visible = false;
    const prev = R3.getRenderTarget(), cc = R3.getClearColor(new T.Color()), ca = R3.getClearAlpha();
    R3.setRenderTarget(rt); R3.setClearColor(0x000000, 0); R3.clear(); R3.render(L.view.scene, vc); R3.setRenderTarget(prev); R3.setClearColor(cc, ca);
    far.grp.visible = vis[0]; near.portal.visible = vis[1]; near.pm.uniforms.uMap.value = rt.texture;
  });
  o.road.forks.push({ s: sAt(o.road, [o.at[0], o.at[1], 0]), dir: 1, to: o.to, toS: o.toS ?? .05, toDir: 1, when: st.match, text: o.text || 'The two doors matched, so they were one door' });
  return st;
}


const NSTUDIES = [
  { id: 'n-belt', name: 'Lane change', th: () => THEMES[1], cruise: [65, 95],
    hint: 'A conveyor runs across the road. Press <b>Y</b> to start it: it runs at your cadence, and the wheel rolling over it is carried sideways, one lane under 72 rpm, two lanes from 72 to 86, three above 86. Only the second lane goes home.',
    build(L) {
      const th = L.th, g = L.g, P = L.props, pal = tone('#F3E6C4'), dy = -1.7;
      const H = L.road(loopPts(-7, 0, 1, 2.6, 0, .8), { closed: true, pal }); P.H = H; loopSlab(g, -7.6, -.6, 1.6, 3.2, -.5, tri(th.turf), 1);
      const lanes = [1, 2, 3].map((i) => {
        const y = dy * i, a = [-3, y, .006];
        if (i === 2) return L.road(L3(a, [7, y, .006], UP), { goal: true });
        return L.road(L3(a, [i === 1 ? 4.2 : 3.2, y, .006], UP), { pal, edgeText: i === 1 ? 'One lane was not enough' : 'Three lanes was too far' });
      });
      lanes.forEach((r, i) => B(g, -3.4, dy * (i + 1) - .55, -.5, i === 1 ? 7.4 : i === 0 ? 4.4 : 3.4, dy * (i + 1) + .55, -.02, tri(sp(th, 0))));
      P.belt = conveyor(L, { x: -1, y0: 0, dy, lanes, from: H, key: 'y', bands: [72, 86] });
      L.view.updaters.push(() => L.say(`belt ${P.belt.m.on ? 'on' : 'off'} · ${Math.round(rider.cad)} rpm · carries ${P.belt.shift()} lane${P.belt.shift() > 1 ? 's' : ''}`));
    },
    spawn: (L) => ({ road: L.props.H, s: 1, dir: 1 }),
    solve(L, W, R) { R.gear = 4; R.cad = 80; L.props.belt.m.set(true); },
    center: [0, -2, 0], pts: [[-7.6, -.6, 0], [1.6, 3.2, 0], [7.4, -3.9, 0], [-3.4, -5.7, 0]], pad: .9, scenery: false },

  { id: 'n-friend', name: 'A friend on the rail', th: () => THEMES[1], cruise: [65, 95],
    hint: 'A little block rides the rail above, keeping pace with you: as you lap the loop it runs out along the rail and back. The road home has a hole. Press <b>A</b> to hold your friend where it is; held just in front of the hole, it hides it, so the hole is not there and the wheel takes the road home. Press again to let it go.',
    build(L) {
      const th = L.th, g = L.g, P = L.props, pal = tone('#F3E6C4');
      const A = L.road(loopPts(-7, -3.4, -1, 0, 0, .8), { closed: true, pal }); P.A = A; loopSlab(g, -7.6, -4, -.4, .6, -.5, tri(th.turf), 1);
      const X1 = L.road(L3([-1, -1.7, .006], [3.1, -1.7, .006], UP), { pal }), X2 = L.road(L3([3.5, -1.7, .006], [8, -1.7, .006], UP), { goal: true }); P.X1 = X1;
      B(g, -.4, -2.3, -.5, 3.1, -1.1, -.02, tri(sp(th, 0))); B(g, 3.5, -2.3, -.5, 8.4, -1.1, -.02, tri(sp(th, 0)));
      const fr = companion(L, { follow: A, a: [.6, -.3, 1.4], b: [7.6, -.3, 1.4], key: 'a' }); P.fr = fr;
      // a ring on the rail marks the spot that stands in front of the hole
      const ring = new T.Mesh(new T.TorusGeometry(.5, .04, 6, 24), basic(th.goal || '#E8553B')); ring.rotation.x = Math.PI / 2; ring.position.copy(V(5.0, -.3, 1.42)); g.add(ring);
      P.hole = liveGap(L, X1, 1, X2, 0, () => [fr.blk], { text: 'Behind your friend, so the hole was not there' });
      A.forks.push({ s: sAt(A, [-1, -1.7, 0]), dir: 1, to: X1, toK: 0, when: () => P.hole.hidden(), text: 'The road home looks whole, so the wheel takes it' });
      L.view.updaters.push(() => L.say(`friend ${fr.held ? 'held' : 'following'} · hole ${P.hole.hidden() ? 'hidden' : 'in sight'}`));
    },
    spawn: (L) => ({ road: L.props.A, s: 1, dir: 1 }),
    solve(L, W, R) { const P = L.props; R.gear = 4; R.cad = 80; if (!P.fr.held && P.fr.at(4.4)) P.fr.m.set(true); },
    center: [0, -1.5, .5], pts: [[-7.6, -4, 0], [-7.6, .6, 0], [8.4, -2.3, 0], [7.6, -.3, 2.4]], pad: .9, scenery: false },

  { id: 'n-seam', name: 'Where down changes', th: () => THEMES[1], cruise: [65, 95],
    hint: 'A seam is painted across the road at the foot of the tower. Light it (<b>B</b>) and down becomes the wall: the wheel turns up the tower face, round its corner, down the other face and out onto the road home. Unlit, the wall is just a wall and the loop carries on.',
    build(L) {
      const th = L.th, g = L.g, P = L.props, pal = tone('#F3E6C4'), stone = tri(sp(th, 0));
      // the tower, its near corner rounded so the road can wrap it flush
      B(g, -3, -3, -.5, -.3, 0, 3.6, stone); B(g, -3, -3, -.5, 0, -.3, 3.6, stone); CY(g, -.3, -.3, .3, -.5, 3.6, stone, 16);
      B(g, -3.1, -3.1, 3.6, .1, .1, 3.75, tri(th.idle));
      const A = L.road(loopPts(.42, -5, 5, -.6, 0, .8), { closed: true, pal }); P.A = A; loopSlab(g, -.2, -5.6, 5.6, 0, -.5, tri(th.turf), 1);
      // the seam: a bar across the road at the fork
      const ys = -2.4, seamM = basic('#FFFFFF'), seam = new T.Mesh(UNIT_BOX, seamM); seam.scale.set(.9, .02, .1); seam.position.copy(V(.42, ys, .03)); g.add(seam);
      const t = ftur([.42, ys, .006], [-1, 0, 0], UP).curl(.4, 90).fwd(1.4).turn(.6, -90);
      t.fwd(-.3 - t.st.p[1]).curl(.32, -90).fwd(.5).turn(.6, -90).fwd(t.st.p[2] - .5 - .4 + .1).curl(.4, 90).fwd(2.6);
      // a thin deck, lit the same on every face, so the road reads as one road as it wraps the tower
      const W = L.road(t.pts, { goal: true, th: .12, mat: tri({ t: '#F4E5C6', l: '#F4E5C6', r: '#F4E5C6' }, { side: true }) }); P.W = W;
      const st = { on: false }; P.seam = st;
      st.m = L.machine({ key: 'b', name: 'Seam', size: .45, place: (h) => { h.position.copy(V(1.6, -5.9, .04)); g.add(h); }, tick() { return 0; } });
      A.forks.push({ s: sAt(A, [.42, ys, 0]), dir: 1, to: W, toK: 0, when: () => st.m.on, text: 'The seam is lit, so down is the wall' });
      L.view.updaters.push(() => { seamM.color.set(st.m.on ? (th.goal || '#E8553B') : '#FFFFFF'); seam.scale.z = st.m.on ? .16 : .06; L.say(`seam ${st.m.on ? 'lit' : 'dark'}`); });
    },
    spawn: (L) => ({ road: L.props.A, s: 1, dir: 1 }),
    solve(L, W, R) { R.gear = 4; R.cad = 80; L.props.seam.m.set(true); },
    center: [0, -1.5, 1.5], pts: [[-3, -3, 0], [5.6, -5.6, 0], [-.2, 3, 0], [-3, -3, 3.8], [5.6, 0, 0]], pad: .9, scenery: false },
  { id: 'n-clutch', name: 'Wind the bridge out', th: () => THEMES[1], cruise: [65, 95],
    hint: 'The road home crosses a gap. Press <b>Z</b> to engage the clutch: as you pedal, the bridge winds out across the gap. Press <b>Z</b> again to lock it. Lock it with its tip on the red catch and the wheel takes the road home. Wind it past the catch and the clutch slips and the bridge runs back in.',
    build(L) {
      const th = L.th, g = L.g, P = L.props, pal = tone('#F3E6C4');
      const A = L.road(loopPts(-7, -3.4, -1, 0, 0, .8), { closed: true, pal }); P.A = A; loopSlab(g, -7.6, -4, -.4, .6, -.5, tri(th.turf), 1);
      const X1 = L.road(L3([-1, -1.7, .006], [1.6, -1.7, .006], UP), { pal }), X2 = L.road(L3([4.1, -1.7, .006], [8, -1.7, .006], UP), { goal: true });
      B(g, -.4, -2.3, -.5, 1.6, -1.1, -.02, tri(sp(th, 0))); B(g, 4.1, -2.3, -.5, 8.4, -1.1, -.02, tri(sp(th, 0)));
      const br = clutchBridge(L, { from: X1, to: X2, key: 'z' }); P.br = br;
      A.forks.push({ s: sAt(A, [-1, -1.7, 0]), dir: 1, to: X1, toK: 0, when: () => br.locked(), text: 'The bridge is locked, so the wheel heads for it' });
      L.view.updaters.push(() => L.say(`clutch ${br.m.on ? 'engaged' : br.locked() ? 'locked' : 'free'} · bridge ${br.len.toFixed(1)} m${br.spans() ? ' · on the catch' : ''}`));
    },
    spawn: (L) => ({ road: L.props.A, s: 1, dir: 1 }),
    solve(L, W, R) { const br = L.props.br; R.gear = 4; R.cad = 80; if (!br.m.on && !br.spans()) br.m.set(true); else if (br.m.on && br.len > 2.75) br.m.set(false); },
    center: [0, -1.5, 0], pts: [[-7.6, -4, 0], [-7.6, .6, 0], [8.4, -2.3, 0], [-.4, -2.3, 0]], pad: .9, scenery: false },
  { id: 'n-doors', name: 'Two doors, one door', th: () => THEMES[1], cruise: [65, 95],
    hint: 'Two doorways with the same banner are one doorway: ride into one and you ride out of the other, and looking into one you see out of the other. Your loop runs through a door with a red banner. Each press of <b>A</b> turns it to the next banner. Match the door on the island and the loop takes you there.',
    build(L) {
      const th = L.th, g = L.g, P = L.props, pal = tone('#F3E6C4');
      const A = L.road(loopPts(-7, -3.4, -1, 0, 0, .8), { closed: true, pal }); P.A = A; loopSlab(g, -7.6, -4, -.4, .6, -.5, tri(th.turf), 1);
      const X2 = L.road(L3([2.0, -5, .806], [7, -5, .806], UP), { goal: true });
      B(g, 2.0, -5.6, -1.2, 7.4, -3.0, .78, tri(sp(th, 0)));
      // the far door faces the other way: the wheel enters the near door heading -x and leaves the far one heading +x
      P.doors = matchingDoors(L, { road: A, at: [-4, 0], to: X2, far: [2.0, -5], farAng: Math.PI, z: .8, key: 'a', want: 2, btn: [0, 1.3] });
      L.view.updaters.push(() => L.say(`doors ${P.doors.match() ? 'match' : 'differ'}`));
    },
    spawn: (L) => ({ road: L.props.A, s: 1, dir: 1 }),
    solve(L, W, R) { const d = L.props.doors; R.gear = 4; R.cad = 80; if (!d.match() && (L.view.t || 0) % 1 < .05) d.m.set(!d.m.on); },
    center: [0, -2.5, .5], pts: [[-7.6, -4, 0], [-7.6, .6, 0], [7.4, -5.6, 0], [-4, 0, 2], [2, -5, 2.8]], pad: .9, scenery: false },
  { id: 'n-pool', name: 'What the pool says', th: () => THEMES[1], cruise: [60, 95], terrain: { strip: true },
    hint: 'High above the pool runs a road you cannot reach, and its reflection lies on the water beside your road. What the still water shows is real: ride at a calm cadence, under 74 rpm, and the reflected road is a road, so the wheel turns onto it and out to the pier. Pedal hard and the wind ruffles the pool, and you carry straight on.',
    build(L) {
      const th = L.th, g = L.g, P = L.props, pal = tone('#F3E6C4'), wz = -.04, h = 4.8;
      const A = L.road(loopPts(-1, -3, 7, 0, 0, .8), { closed: true, pal }); P.A = A;
      const turf = tri(th.turf); B(g, -1.6, -3.6, -.5, .2, .6, -.02, turf); B(g, 3.8, -3.6, -.5, 7.6, .6, -.02, turf); B(g, .2, -3.6, -.5, 3.8, -1.1, -.02, turf);
      // the sky road: the water road lifted h and pulled back h, on two tall piers outside the loop
      const sky = ftur([3.8 - h, -h, wz + h], [-1, 0, 0], UP).fwd(.8).turn(1, -90).fwd(2.2);
      const pool = reflection(L, { pool: [.4, -.9, 3.6, 2.4], wz, over(og) {
        const rr = new Road(sky.pts), m = ribbon(rr, 1, .12, tri(pal, { side: true })); m.userData.rc = '#FFF4DC'; og.add(m);
        const ln = ribbon(rr, .07, 0, L.lane, { lift: .012, dash: [.38, .2] }); ln.userData.rc = '#B0624E'; og.add(ln);
        for (const q of [sky.pts[0].p, sky.pts[sky.pts.length - 1].p]) { (L.anchors ||= []).push([q[0], q[1], 1.1]); const c = new T.Mesh(new T.CylinderGeometry(.16, .2, q[2] + 2.4, 12), tri(sp(th, 0))); c.position.copy(V(q[0], q[1], (q[2] - 2.4) / 2)); c.userData.rc = '#E5CFA0'; og.add(c); }
      } });
      P.pool = pool;
      // the water road, where the sky road's reflection lies, and the pier it leads to
      const wt = ftur([3.0, 0, .006], [-1, 0, 0], UP).turn(1, -90).fwd(1.4);
      const W = L.road(wt.pts, { noDeck: true, noLane: true }); P.W = W;
      const G = L.road(L3([2.0, 2.4, .006], [2.0, 5.4, .006], UP), { goal: true }); B(g, 1.4, 2.4, -.5, 2.6, 5.8, -.02, tri(sp(th, 0)));
      A.forks.push({ s: sAt(A, [3.0, 0, 0]), dir: 1, to: W, toK: 0, when: () => pool.still(), text: 'The still pool shows a road, so there is one' });
      L.view.updaters.push(() => L.say(`pool ${pool.ruffled() ? 'ruffled' : pool.still() ? 'still' : 'stirring'} · ${Math.round(rider.cad)} rpm`));
    },
    spawn: (L) => ({ road: L.props.A, s: 1, dir: 1 }),
    solve(L, W, R) { R.gear = 4; R.cad = 68; },
    center: [1.5, -1, 1], pts: [[-1.6, -3.6, 0], [7.6, .6, 0], [2, 5.8, 0], [-2.8, -1.6, 5], [-1, -4.8, 5]], pad: .9, scenery: false },

  { id: 'n-pool2', name: 'Break the mirror', th: () => THEMES[1], cruise: [60, 95],
    hint: 'The road home rides across the pool, and the pool shows a gate standing across it: the reflection of the portcullis hung high above. What the still water shows is real, so the road is shut. Pedal hard, above 86 rpm, and the wind ruffles the water, the gate breaks up, and the road is open.',
    build(L) {
      const th = L.th, g = L.g, P = L.props, pal = tone('#F3E6C4'), wz = -.04, h0 = 3.2, h1 = 4.2, xg = 3.5;
      const A = L.road(loopPts(-7, -3.4, -1, 0, 0, .8), { closed: true, pal }); P.A = A; loopSlab(g, -7.6, -4, -.4, .6, -.5, tri(th.turf), 1);
      const X = L.road(L3([-1, -1.7, .006], [9, -1.7, .006], UP), { goal: true, pal });
      B(g, -.4, -2.3, -.5, 1.2, -1.1, -.02, tri(sp(th, 0))); B(g, 5.8, -2.3, -.5, 9.4, -1.1, -.02, tri(sp(th, 0)));
      // the portcullis, hung high between two towers; its reflection lands across the road at x = xg
      const gateM = tri(tone('#C9503F')), stone = tri(sp(th, 0));
      const pool = reflection(L, { pool: [1.2, -3.2, 5.8, 1.0], wz, calm: 78, over(og) {
        // a portcullis hung high: its top beam at h1, bars hanging to h0. Shifted back by (h1 - 2wz) in x and y, its
        // reflection stands on the road at xg, beam on the water and spikes up, a gate h1 - h0 tall
        const off = h1 - 2 * wz, at = (x, y, z) => V(x - off, y - off, z);
        const box = (sx, sy, sz, x, y, z, mat, rc) => { const m = new T.Mesh(UNIT_BOX, mat); m.scale.set(sx, sz, sy); m.position.copy(at(x, y, z)); m.userData.rc = rc; og.add(m); };
        for (const yy of [-2.5, -2.1, -1.7, -1.3, -.9]) { box(.1, .1, h1 - h0, xg, yy, (h0 + h1) / 2, gateM, '#E2563F'); const tip = new T.Mesh(new T.ConeGeometry(.09, .22, 4), gateM); tip.rotation.x = Math.PI; tip.position.copy(at(xg, yy, h0 - .1)); tip.userData.rc = '#E2563F'; og.add(tip); }
        for (const zz of [h1, h0 + .35]) box(.16, 2.2, .14, xg, -1.7, zz, gateM, '#E2563F');
        for (const yy of [-2.9, -.5]) { const zt = h1 + .5, c = new T.Mesh(new T.CylinderGeometry(.2, .24, zt + .5, 12), stone); c.position.copy(at(xg, yy, (zt - .5) / 2)); c.userData.rc = '#E5CFA0'; og.add(c); }
      } });
      P.pool = pool;
      A.forks.push({ s: sAt(A, [-1, -1.7, 0]), dir: 1, to: X, toK: 0, when: () => pool.ruffled(), text: 'The ruffled pool shows no gate, so there is none' });
      L.view.updaters.push(() => L.say(`pool ${pool.ruffled() ? 'ruffled' : pool.still() ? 'still' : 'stirring'} · gate ${pool.ruffled() ? 'gone' : 'shut'} · ${Math.round(rider.cad)} rpm`));
    },
    spawn: (L) => ({ road: L.props.A, s: 1, dir: 1 }),
    solve(L, W, R) { R.gear = 4; R.cad = 92; },
    center: [1, -1.5, 1], pts: [[-7.6, -4, 0], [-7.6, .6, 0], [9.4, -2.3, 0], [-1, -6.5, 5], [5.8, 1, 0]], pad: .9, scenery: false },

];

Object.assign($scope, { conveyor, companion, clutchBridge, reflection, matchingDoors, NSTUDIES });
}
