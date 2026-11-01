// @ts-nocheck
/* Penrose Pedals engine: Crossover discs and hubs, the key-and-gate kit, and the crossover studies.
 * Installed into the shared engine scope in order (see ./index.ts); names come in from $scope and go back out to it. */
import * as T from 'three';

export function install($scope) {
const { B, CY, L3, TAU, TEX, THEMES, UNIT, UP, V, at, basic, clamp, cloudLayer, mixPal, peelSwitch, setTri, sp, sprite, tone, tri, turntable, turtle } = $scope;

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


Object.assign($scope, { crossDisc, CROSS, DIRS, studyKit, crossWant, STUDIES });
}
