// @ts-nocheck
/* Penrose Pedals engine: More machines: tide, buttonless cadence lift, wind.
 * Installed into the shared engine scope in order (see ./index.ts); names come in from $scope and go back out to it. */
import * as T from 'three';

export function install($scope) {
const { B, CY, L3, TEX, THEMES, UNIT, UP, V, archGeo, at, basic, behind, cameraCrank, clamp, cloudLayer, drift, filletPath, mixPal, onFace, powerOf, rider, setTri, sp, tone, tri } = $scope;
const clearSpot = (...a) => $scope.clearSpot(...a);   // defined in a later module
const stairPts = (...a) => $scope.stairPts(...a);   // defined in a later module

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

Object.assign($scope, { effort2, gyroCrank, loopPts, sAt, downhill, plumb, loopSlab, MSTUDIES, HI_T });
}
