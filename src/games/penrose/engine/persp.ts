// @ts-nocheck
/* Penrose Pedals engine: Perspective studies: the camera crank and the hidden-gap rule change what a machine does.
 * Installed into the shared engine scope in order (see ./index.ts); names come in from $scope and go back out to it. */
import * as T from 'three';

export function install($scope) {
const { B, CY, L3, SD, THEMES, UNIT, UP, V, basic, clamp, cloudLayer, faucetLift, hd, mixPal, peelSwitch, setTri, sp, studyKit, tone, tri, turntable, turtle } = $scope;

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

Object.assign($scope, { viewDir, behind, cameraCrank, hiddenGap, dirv, PSTUDIES });
}
