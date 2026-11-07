// @ts-nocheck
/* Penrose Pedals engine: Gravity roads: up walls and under beams (ftur frame turtle).
 * Installed into the shared engine scope in order (see ./index.ts); names come in from $scope and go back out to it. */
import * as T from 'three';

export function install($scope) {
const { B, CY, L3, THEMES, UNIT, UP, V, archGeo, basic, behind, cameraCrank, clamp, clearSpot, cloudLayer, loopPts, loopSlab, mixPal, onFace, rider, sAt, setTri, sp, tone, tri } = $scope;

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

Object.assign($scope, { ftur, drawbridge, GSTUDIES });
}
