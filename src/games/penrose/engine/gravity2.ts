// @ts-nocheck
/* Penrose Pedals engine: More gravity: wall and underside roads with the wind (windSock, vane) and the tide.
 * Installed into the shared engine scope in order (see ./index.ts); names come in from $scope and go back out to it. */
import * as T from 'three';

export function install($scope) {
const { B, CY, L3, TEX, THEMES, UP, V, archGeo, basic, behind, cameraCrank, clamp, clearSpot, cloudLayer, drift, effort2, ftur, loopPts, mixPal, onFace, sAt, setTri, sp, tone, tri } = $scope;

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

Object.assign($scope, { windSock, vane, G2STUDIES });
}
