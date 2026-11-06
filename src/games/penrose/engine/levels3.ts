// @ts-nocheck
/* Penrose Pedals engine: chapter 10, "Water and doors". Full levels built from the new mechanics in ./studies2.ts
 * (conveyor lanes, reflection pools, matching doors, gravity seams, the clutch bridge), each a chain of stations: a loop
 * that holds the wheel while the rider works the next beat out.
 * Installed into the shared engine scope after studies2 (see ./index.ts). */
import * as T from 'three';

export function install($scope) {
const { B, CY, basic, L3, Road, UP, THEMES, V, conveyor, reflection, matchingDoors, clutchBridge, ftur, loopPts, loopSlab, ribbon, rider, sAt, sp, tone, tri } = $scope;

const UNIT_BOX = new T.BoxGeometry(1, 1, 1);
const PAL = () => tone('#F3E6C4');
const floor = (L, x0, y0, x1, y1, z = 0) => B(L.g, x0, y0, z - .5, x1, y1, z - .02, tri(sp(L.th, 0)));
/** A road along points, laid on a slab of floor just under it (w: slab half-width). */
function strip(L, pts, o = {}, w = .55) {
  const r = L.road(pts, o);
  const xs = pts.map(q => q.p[0]), ys = pts.map(q => q.p[1]), z = pts[0].p[2] - .006;
  if (!o.noFloor) floor(L, Math.min(...xs) - w, Math.min(...ys) - w, Math.max(...xs) + w, Math.max(...ys) + w, z);
  return r;
}
/** The sky road for a pool: the water road lifted h and pulled back h, on piers at both ends. */
function skyRoad(L, og, pts, h, wz) {
  const sky = pts.map(q => ({ p: [q.p[0] - h, q.p[1] - h, wz + h], n: [0, 0, 1] })), rr = new Road(sky);
  const m = ribbon(rr, 1, .12, tri(PAL(), { side: true })); m.userData.rc = '#FFF4DC'; og.add(m);
  const ln = ribbon(rr, .07, 0, L.lane, { lift: .012, dash: [.38, .2] }); ln.userData.rc = '#B0624E'; og.add(ln);
  for (const q of [sky[0].p, sky[sky.length - 1].p]) { const c = new T.Mesh(new T.CylinderGeometry(.16, .2, q[2] + .5, 12), tri(sp(L.th, 0))); c.position.copy(V(q[0], q[1], (q[2] - .5) / 2 - .2)); c.userData.rc = '#E5CFA0'; og.add(c); }
}

const LEVELS3 = [
  { id: 'w-lanes', name: 'Lanes to the water', th: () => THEMES[1], cruise: [62, 95],
    hint: 'Two beats. Start the belt (<b>Y</b>) and hold 72 to 86 rpm: it carries the wheel two lanes over, onto the road to the pool. On the pool loop, the road high above lies reflected on the water. Ease under 74 rpm: the still pool makes the reflection real, and it carries you out to the pier.',
    build(L) {
      const th = L.th, g = L.g, P = L.props, pal = PAL(), dy = -1.7, wz = -.04, h = 6;
      const H = L.road(loopPts(-7, 0, 1, 2.6, 0, .8), { closed: true, pal }); P.H = H; loopSlab(g, -7.6, -.6, 1.6, 3.2, -.5, tri(th.turf), 1);
      // three lanes off the belt: one lane and three lanes run out into the air; two lanes is the road on
      const l1 = strip(L, L3([-3, dy, .006], [2.6, dy, .006], UP), { pal, edgeText: 'One lane was not enough' });
      const l3 = strip(L, L3([-3, 3 * dy, .006], [2.0, 3 * dy, .006], UP), { pal, edgeText: 'Three lanes was too far' });
      const t2 = ftur([-3, 2 * dy, .006], [1, 0, 0], UP).fwd(5.2).turn(1, -90).turn(1, 90).fwd(.2);
      const l2 = strip(L, t2.pts, { pal, noFloor: true }); P.l2 = l2; floor(L, -3.55, 2 * dy - .55, 2.75, 2 * dy + .55); floor(L, 2.6, -5.95, 4.95, 2 * dy + .55);
      P.belt = conveyor(L, { x: -1, y0: 0, dy, lanes: [l1, l2, l3], from: H, key: 'y', bands: [72, 86] });
      // the pool loop; its near side rides across the water
      const S2 = L.road(loopPts(3.4, -5.4, 11.4, -2.6, 0, .8), { closed: true, pal }); P.S2 = S2;
      floor(L, 2.8, -6, 5.2, -2.0); floor(L, 8.8, -6, 12, -2.0); floor(L, 5.2, -6, 8.8, -3.7);
      l2.joins = [{ k: 1, to: S2, s: sAt(S2, [4.4, -5.4, 0]), dir: 1 }];
      const wt = ftur([8.0, -2.6, .006], [-1, 0, 0], UP).turn(1, -90).fwd(1.4);
      const pool = reflection(L, { pool: [5.4, -3.5, 8.6, -.2], wz, over: (og) => skyRoad(L, og, ftur([8.8, -2.6, .006], [-1, 0, 0], UP).fwd(.8).turn(1, -90).fwd(1.4).pts, h, wz) });
      P.pool = pool;
      const W = L.road(wt.pts, { noDeck: true, noLane: true }); P.W = W;
      const G = strip(L, L3([7.0, -.2, .006], [7.0, 3.4, .006], UP), { goal: true }); P.G = G;
      S2.forks.push({ s: sAt(S2, [8.0, -2.6, 0]), dir: 1, to: W, toK: 0, when: () => pool.still(), text: 'The still pool shows a road, so there is one' });
      L.view.updaters.push(() => L.say(`belt ${P.belt.m.on ? 'on' : 'off'} · carries ${P.belt.shift()} · pool ${pool.still() ? 'still' : pool.ruffled() ? 'ruffled' : 'stirring'} · ${Math.round(rider.cad)} rpm`));
    },
    spawn: (L) => ({ road: L.props.H, s: 1, dir: 1 }),
    solve(L, W, R) { const P = L.props; R.gear = 4; P.belt.m.set(true); R.cad = [P.S2, P.W, P.G].includes(W.road) ? 66 : 80; },
    center: [2, -2, 1], pts: [[-7.6, -.6, 0], [-7.6, 3.2, 0], [12, -6, 0], [7.6, 3.8, 0], [1, -6.2, 6], [2.8, -8.6, 6]], pad: .8, scenery: false },
  { id: 'w-doors', name: 'Through the door, past the gate', th: () => THEMES[1], cruise: [62, 95],
    hint: 'Two beats. Turn the banner on your loop\'s door (<b>A</b>) until it matches the door across the gap: the two doors become one, and the wheel rides out on the far side. There the road home crosses a pool, and the pool shows a gate across it, the reflection of the portcullis hung high above. Pedal hard, above 86 rpm, to ruffle the water and break the gate.',
    build(L) {
      const th = L.th, g = L.g, P = L.props, pal = PAL(), wz = -.04, off = 6.5, h1 = off + 2 * wz, h0 = h1 - 1.0;
      const A = L.road(loopPts(-7, -3.4, -1, 0, 0, .8), { closed: true, pal }); P.A = A; loopSlab(g, -7.6, -4, -.4, .6, -.5, tri(th.turf), 1);
      // the far door, facing back the other way, and the road out of it into the pool loop
      const X2 = strip(L, L3([2.0, -5, .006], [3.4, -5, .006], UP), { pal, noFloor: true });
      const S2 = L.road(loopPts(2.4, -5, 8.4, -2.0, 0, .8), { closed: true, pal }); P.S2 = S2;
      X2.joins = [{ k: 1, to: S2, s: sAt(S2, [3.4, -5, 0]), dir: 1 }];
      floor(L, 2.0, -5.5, 2.8, -1.4); floor(L, 5.2, -5.5, 8.9, -1.4); floor(L, 2.8, -5.5, 5.2, -1.7);
      P.doors = matchingDoors(L, { road: A, at: [-4, 0], to: X2, far: [2.0, -5], farAng: Math.PI, key: 'a', want: 1, btn: [0, 1.3] });
      // the way home: off the pool loop's near side, over the water to the goal
      const E = L.road(ftur([5.0, -2.0, .006], [-1, 0, 0], UP).turn(1, -90).fwd(5).pts, { goal: true, pal }); P.E = E;
      floor(L, 3.45, 2.6, 4.55, 4.3);
      const gateM = tri(tone('#C9503F')), stone = tri(sp(th, 0)), yg = 1.2;
      const pool = reflection(L, { pool: [3.0, -1.5, 5.0, 2.6], wz, calm: 78, over(og) {
        // a portcullis hung high: shifted back by off, its reflection stands across the road at y = yg, spikes up
        const at = (x, y, z) => V(x - off, y - off, z);
        const box = (sx, sy, sz, x, y, z, mat, rc) => { const m = new T.Mesh(UNIT_BOX, mat); m.scale.set(sx, sz, sy); m.position.copy(at(x, y, z)); m.userData.rc = rc; og.add(m); };
        for (const xx of [3.3, 3.65, 4.0, 4.35, 4.7]) { box(.1, .1, h1 - h0, xx, yg, (h0 + h1) / 2, gateM, '#E2563F'); const tip = new T.Mesh(new T.ConeGeometry(.09, .22, 4), gateM); tip.rotation.x = Math.PI; tip.position.copy(at(xx, yg, h0 - .1)); tip.userData.rc = '#E2563F'; og.add(tip); }
        for (const zz of [h1, h0 + .35]) box(1.9, .16, .14, 4.0, yg, zz, gateM, '#E2563F');
        for (const xx of [3.0, 5.0]) { const zt = h1 + .5, c = new T.Mesh(new T.CylinderGeometry(.2, .24, zt + .5, 12), stone); c.position.copy(at(xx, yg, (zt - .5) / 2)); c.userData.rc = '#E5CFA0'; og.add(c); }
      } });
      P.pool = pool;
      S2.forks.push({ s: sAt(S2, [5.0, -2.0, 0]), dir: 1, to: E, toK: 0, when: () => pool.ruffled(), text: 'The ruffled pool shows no gate, so there is none' });
      L.view.updaters.push(() => L.say(`doors ${P.doors.match() ? 'match' : 'differ'} · gate ${pool.ruffled() ? 'gone' : 'shut'} · ${Math.round(rider.cad)} rpm`));
    },
    spawn: (L) => ({ road: L.props.A, s: 1, dir: 1 }),
    solve(L, W, R) { const P = L.props, d = P.doors; R.gear = 4; R.cad = [P.S2, P.E].includes(W.road) ? 92 : 80; if (!d.match() && (L.view.t || 0) % 1 < .05) d.m.set(!d.m.on); },
    center: [0, -1.5, 1], pts: [[-7.6, -4, 0], [-7.6, .6, 0], [8.9, -5.5, 0], [4, 4.3, 0], [-4, 0, 2.4], [-3.5, -5.3, 7.5]], pad: .8, scenery: false },

  { id: 'w-seam', name: 'Wind across, climb over', th: () => THEMES[1], cruise: [62, 95],
    hint: 'Two beats. Engage the clutch (<b>Z</b>) and pedal: the bridge winds out across the gap. Press <b>Z</b> again to lock it with its tip between the red bollards, and the wheel crosses to the tower loop. There, light the seam (<b>B</b>): down becomes the wall, and the wheel climbs the tower, wraps its corner and comes down the far side to home.',
    build(L) {
      const th = L.th, g = L.g, P = L.props, pal = PAL(), stone = tri(sp(th, 0));
      // the start loop, out to the right
      const A = L.road(loopPts(9.4, -4.4, 14.4, -1.0, 0, .8), { closed: true, pal }); P.A = A; loopSlab(g, 8.8, -5.0, 15.0, -.4, -.5, tri(th.turf), 1);
      const X1 = L.road(L3([9.4, -2.8, .006], [8.4, -2.8, .006], UP), { pal }); P.X1 = X1; floor(L, 8.4, -3.35, 8.8, -2.25);
      const X2 = L.road(L3([6.4, -2.8, .006], [5.5, -2.8, .006], UP), { pal });
      // the tower loop; the tower stands at the back, so nothing hides behind it
      B(g, -3, -3, -.5, -.3, 0, 3.6, stone); B(g, -3, -3, -.5, 0, -.3, 3.6, stone); CY(g, -.3, -.3, .3, -.5, 3.6, stone, 16);
      B(g, -3.1, -3.1, 3.6, .1, .1, 3.75, tri(th.idle));
      const T2 = L.road(loopPts(.42, -5, 5, -.6, 0, .8), { closed: true, pal }); P.T2 = T2; loopSlab(g, -.2, -5.6, 6.4, 0, -.5, tri(th.turf), 1);
      X2.joins = [{ k: 1, to: T2, s: sAt(T2, [5, -2.8, 0]), dir: 1 }];
      const br = clutchBridge(L, { from: X1, to: X2, key: 'z', btn: [11.9, -2.7] }); P.br = br; CY(g, 11.9, -2.7, .6, -2.4, -.02, stone, 24);
      A.forks.push({ s: sAt(A, [9.4, -2.8, 0]), dir: 1, to: X1, toK: 0, when: () => br.locked(), text: 'The bridge is locked, so the wheel heads for it' });
      // the seam, and the road over the tower
      const ys = -2.4, seamM = basic('#FFFFFF'), seam = new T.Mesh(UNIT_BOX, seamM); seam.scale.set(.9, .02, .1); seam.position.copy(V(.42, ys, .03)); g.add(seam);
      const t = ftur([.42, ys, .006], [-1, 0, 0], UP).curl(.4, 90).fwd(1.4).turn(.6, -90);
      t.fwd(-.3 - t.st.p[1]).curl(.32, -90).fwd(.5).turn(.6, -90).fwd(t.st.p[2] - .5 - .4 + .1).curl(.4, 90).fwd(2.6);
      const W = L.road(t.pts, { goal: true, th: .12, mat: tri({ t: '#F6EBD0', l: '#F2E2BE', r: '#EAD6AE' }, { side: true }) }); P.W = W;
      const e = t.pts[t.pts.length - 1].p; floor(L, e[0] - .6, .1, e[0] + .6, e[1] + .3);
      const sm = L.machine({ key: 'b', name: 'Seam', size: .45, place: (h) => { h.position.copy(V(2.7, -2.8, .04)); g.add(h); }, tick() { return 0; } }); P.seam = sm; CY(g, 2.7, -2.8, .6, -2.4, -.02, stone, 24);
      T2.forks.push({ s: sAt(T2, [.42, ys, 0]), dir: 1, to: W, toK: 0, when: () => sm.on, text: 'The seam is lit, so down is the wall' });
      L.view.updaters.push(() => { seamM.color.set(sm.on ? (th.goal || '#E8553B') : '#FFFFFF'); seam.scale.z = sm.on ? .16 : .06;
        L.say(`clutch ${br.m.on ? 'engaged' : br.locked() ? 'locked' : 'free'} · bridge ${br.len.toFixed(1)} m · seam ${sm.on ? 'lit' : 'dark'}`); });
    },
    spawn: (L) => ({ road: L.props.A, s: 1, dir: 1 }),
    solve(L, W, R) { const P = L.props, br = P.br; R.gear = 4; R.cad = 80;
      if (W.road === P.A || W.road === P.X1) { if (!br.m.on && !br.spans()) br.m.set(true); else if (br.m.on && br.len > 2.3) br.m.set(false); }
      if (W.road === P.T2 && !P.seam.on) P.seam.set(true); },
    center: [5, -2, 1.5], pts: [[-3, -3, 0], [15, -5, 0], [15, -.4, 0], [-1.4, 3.1, 0], [-3, -3, 3.8], [-.2, -5.6, 0]], pad: .8, scenery: false },

];

Object.assign($scope, { LEVELS3 });
}
