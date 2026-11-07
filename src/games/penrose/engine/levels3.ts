// @ts-nocheck
/* Penrose Pedals engine: full levels built from the new mechanics in ./studies2.ts
 * (conveyor lanes, reflection pools, matching doors, gravity seams, the clutch bridge), each a chain of stations: a loop
 * that holds the wheel while the rider works the next beat out.
 * Installed into the shared engine scope after studies2 (see ./index.ts). */
import * as T from 'three';

export function install($scope) {
const { B, CY, mixPal, basic, cameraCrank, liveGap, filletPath, turntable, L3, Road, UP, THEMES, V, conveyor, reflection, matchingDoors, clutchBridge, ftur, loopPts, loopSlab, ribbon, rider, sAt, sp, tone, tri } = $scope;

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

/** A slab of land with any outline (sketch x, y points), from z0 up to z1: one mesh, so no seams across its top. */
function land(g, outline, z0, z1, mat) {
  const sh = new T.Shape(outline.map(([x, y]) => new T.Vector2(x, -y))), geo = new T.ExtrudeGeometry(sh, { depth: z1 - z0, bevelEnabled: false });
  geo.rotateX(-Math.PI / 2); geo.translate(0, z0, 0); const m = new T.Mesh(geo, mat); g.add(m); return m;
}
/** Low floor: top at -.5, the level loop slabs sit at, so turntable arms swing clear over it. */
const lowFloor = (L, x0, y0, x1, y1) => B(L.g, x0, y0, -1.1, x1, y1, -.5, tri(sp(L.th, 0)));
/**
 * A door station: a loop with two turntables, each able to swing its arm out to a spur that ends in a doorway.
 * In station space (offset ox, oy): the loop runs (7,0)->(10,0)->(10,4)->(0,4)->(0,3), arm T2 (0,3)->(0,1) [swings to -x],
 * (0,1)->(0,0)->(4,0), arm T1 (4,0)->(7,0) [swings to -y]. Spur ends: T1 door at (4,-4) heading -y; T2 door at (-3,3) heading -x.
 */
function doorStation(L, ox, oy, keys, oz = 0, bare = false) {
  const pal = PAL(), P = (x, y) => [x + ox, y + oy, oz];
  const R1 = L.road(filletPath([P(7, 0), P(10, 0), P(10, 4), P(0, 4), P(0, 3)], 1), { pal });
  const R2 = L.road(filletPath([P(0, 1), P(0, 0), P(4, 0)], 1), { pal });
  const S1 = L.road(L3(P(4, -3), P(4, -4.7), UP), { pal }), S2 = L.road(L3(P(-2, 3), P(-3.7, 3), UP), { pal });
  if (!bare) { loopSlab(L.g, ox - .6, oy - .6, ox + 10.6, oy + 4.6, -.5, tri(L.th.turf), 1);
    lowFloor(L, ox + 3.45, oy - 4.7, ox + 4.55, oy - .6); lowFloor(L, ox - 3.7, oy + 2.45, ox - .6, oy + 3.55); }
  const T1 = turntable(L, { key: keys[0], name: 'Turntable', pivot: P(4, 0), len: 3, open: -90 });
  const T2 = turntable(L, { key: keys[1], name: 'Turntable', pivot: P(0, 3), len: 2, base: -90, open: -90 });
  return { R1, R2, S1, S2, T1, T2, d1: [ox + 4, oy - 4], d2: [ox - 3, oy + 3], join: (x, y) => ({ to: R1, s: sAt(R1, P(x, y)), dir: 1 }) };
}

/**
 * A cliff where a bridge used to be: a crag of stacked, uneven strata whose top ends at (x, yEdge), the bridge's first span
 * snapped and hanging down the face, its far pier standing alone across the gap with a stub of deck, and stones falling.
 * The road runs south (-y) to the edge.
 */
function brokenCliff(L, x, yEdge, z = 0, zBase = -7) {
  const g = L.g, th = L.th, rock = tri(sp(th, 0)), dark = tri(mixPal(sp(th, 0), tone('#5B4636'), .1)), deck = tri(PAL(), { side: true });
  // the crag: strata stepping in and out as they go down, so it reads as rock, not a slab
  const strata = [[1.2, .4, 0], [1.12, .32, -1.1], [1.2, .42, -1.9], [1.0, .26, -3.0], [.9, .16, -4.0], [.72, 0, -5.0], [.5, -.25, -5.9]];
  for (let i = 0; i < strata.length; i++) {
    const [hw, back, z1] = strata[i], z0 = Math.max(i + 1 < strata.length ? strata[i + 1][2] : z1 - 1.2, zBase - z), front = i ? -.08 * (i % 2) - .04 * i : 0;
    if (z + z1 <= zBase) break;
    B(g, x - hw, yEdge - front, z + z0, x + hw, yEdge + 1.6 + back, z + z1 - .02, i % 2 ? dark : rock); }
  // the snapped first span, hanging from the lip, and its far pier (standing on the far bank) with a stub of deck
  const span = new T.Mesh(UNIT_BOX, deck); span.scale.set(.9, .12, 1.6); span.position.copy(V(x, yEdge - .25, z - .75)); span.rotation.x = -1.15; g.add(span);
  B(g, x - .34, yEdge - 3.65, zBase, x + .34, yEdge - 3.05, z - .14, rock);
  // the far stub is a real piece of road, lane and all, so the break reads as a bridge
  const sr = new Road(L3([x, yEdge - 3.75, z], [x, yEdge - 2.5, z], UP)); g.add(ribbon(sr, 1, .12, deck)); g.add(ribbon(sr, .07, 0, L.lane, { lift: .012, dash: [.38, .2] }));
  const span2 = new T.Mesh(UNIT_BOX, deck); span2.scale.set(.9, .12, 1.4); span2.position.copy(V(x, yEdge - 2.5 + .22, z - .68)); span2.rotation.x = 1.15; g.add(span2);
  const bit = new T.Mesh(UNIT_BOX, deck); bit.scale.set(.5, .1, .4); bit.position.copy(V(x + .2, yEdge - 2.6, z - .6)); bit.rotation.set(.5, .3, -.4); g.add(bit);
  for (const [dx, dy, sz, sz2] of [[.3, -1.2, -1.6, .22], [-.4, -1.9, -2.7, .16], [.1, -2.3, -3.9, .12]]) { const st = new T.Mesh(UNIT_BOX, rock); st.scale.setScalar(sz2); st.position.copy(V(x + dx, yEdge + dy, z + sz)); st.rotation.set(sz, dx * 3, dy); g.add(st); }
}

/**
 * Terrain: one base platform (any outline) with plateaus of different heights standing on it, styled like the game's
 * islands: turf tops with a lip, warm stone sides, a plinth where each plateau meets the base, and a stepped underside.
 * A plateau's z is the road level on it; its top sits .5 below, where loop slabs sit, so turntable arms swing clear.
 * o: { base: { outline: [[x, y]...], z, depth }, tops: [{ rect: [x0, y0, x1, y1], z }] }
 */
function terrain(L, o) {
  const g = L.g, th = L.th, st = sp(th, 0), turfP = th.turf || st;
  const side = tri({ t: turfP.t, l: st.l, r: st.r }), cap = tri(turfP), plinth = tri(mixPal({ t: turfP.t, l: st.l, r: st.r }, tone('#5B4636'), .12));
  const baseTop = tri({ t: mixPal(turfP, th.idle || st, .55).t, l: st.l, r: st.r }), under = tri(mixPal(st, tone('#5B4636'), .18));
  const { outline, z: bz, depth = 1.2 } = o.base, cx = outline.reduce((a, q) => a + q[0], 0) / outline.length, cy = outline.reduce((a, q) => a + q[1], 0) / outline.length;
  land(g, outline, bz - depth, bz, baseTop);
  // the underside steps in twice, so the platform reads as a carved, floating piece rather than a sheet
  [[.94, .5], [.82, .6], [.6, .7]].reduce((z, [k, h]) => { land(g, outline.map(([x, y]) => [cx + (x - cx) * k, cy + (y - cy) * k]), z - h, z, under); return z - h; }, bz - depth);
  for (const t of o.tops) {
    const [x0, y0, x1, y1] = t.rect, top = t.z - .5;
    B(g, x0 - .14, y0 - .14, bz, x1 + .14, y1 + .14, bz + .22, plinth);
    B(g, x0, y0, bz + .22, x1, y1, top - .16, side);
    B(g, x0 - .07, y0 - .07, top - .16, x1 + .07, y1 + .07, top, cap);
  }
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
      const W = L.road(t.pts, { goal: true, th: .12, mat: tri({ t: '#F4E5C6', l: '#F4E5C6', r: '#F4E5C6' }, { side: true }) }); P.W = W;
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

  { id: 'd-peek', name: 'Look before you ride', th: () => THEMES[1], cruise: [65, 92],
    hint: 'Every door here has the same white banner, and every door is open: ride into one and you ride out of its twin, wherever that is. Each loop has two turntables (<b>Y</b> and <b>A</b> here, <b>B</b> and <b>Z</b> on the next loop), each able to swing the road out to a door. Look through the doors before you choose: one leads on, one leads back, one leads nowhere.',
    build(L) {
      const th = L.th, g = L.g, P = L.props, pal = PAL(), white = ['#F4F1EA'];
      // plateaus of four heights on one floating base: the first loop, the second loop up a step, a bluff that ends at a gorge, and home on a tall mesa
      // the bluff and the mesa stand at one height, and the broken bridge once ran between them
      const zA = 0, zB = 1.5, zL = 2.6, zH = 2.6, zb = -1.6;
      terrain(L, { base: { outline: [[-5.6, 6.4], [16.4, 6.4], [16.4, -5.4], [30.4, -5.4], [30.4, -18.4], [3.6, -18.4], [3.6, -6.4], [-5.6, -6.4]], z: zb, depth: 1.2 },
        tops: [{ rect: [-4.4, -5.4, 15.2, 5.2], z: zA }, { rect: [10.8, -17.2, 29.2, -6.6], z: zB }, { rect: [4.6, -9.6, 7.4, -6.6], z: zL }, { rect: [4.8, -17.6, 7.2, -13.3], z: zH }] });
      const A = doorStation(L, 0, 0, ['y', 'a'], zA, true), Bs = doorStation(L, 15, -12, ['b', 'z'], zB, true); P.A = A; P.Bs = Bs;
      // where the doors come out: B's way in, A's way back in, a road to a broken bridge, and home
      const inB = L.road(L3([28, -8, zB], [24, -8, zB], UP), { pal }); inB.joins = [{ k: 1, ...Bs.join(24, 4 - 12) }];
      const inA = L.road(L3([14, 4, zA], [9, 4, zA], UP), { pal }); inA.joins = [{ k: 1, ...A.join(9, 4) }];
      const lost = L.road(L3([6, -8, zL], [6, -9.6, zL], UP), { pal, edgeText: 'The bridge was gone' }); brokenCliff(L, 6, -9.6, zL, zb);
      const home = L.road(L3([6, -14.2, zH], [6, -17.0, zH], UP), { goal: true });
      const pair = (road, at, ang, to, far, atZ, z) => matchingDoors(L, { road, at, ang, to, far, farAng: ang, atZ, z, fixed: true, want: 0, banners: white, rtShift: 2, text: 'Through the door and out of its twin' });
      pair(A.S2, A.d2, 0, inB, [28, -8], zA, zB);              // A, swung left: on to the second loop
      pair(A.S1, A.d1, -Math.PI / 2, lost, [6, -8], zA, zL);   // A, swung down: nowhere
      pair(Bs.S1, Bs.d1, -Math.PI / 2, home, [6, -14.2], zB, zH); // B, swung down: home
      pair(Bs.S2, Bs.d2, 0, inA, [14, 4], zB, zA);              // B, swung left: back to the start
      L.view.updaters.push(() => L.say(`A: ${Math.round(A.T1.ang)}° / ${Math.round(A.T2.ang)}° · B: ${Math.round(Bs.T1.ang)}° / ${Math.round(Bs.T2.ang)}°`));
    },
    spawn: (L) => ({ road: L.props.A.R1, s: 1, dir: 1 }),
    solve(L, W, R) { const { A, Bs } = L.props; R.gear = 4; R.cad = 80;
      const onA = [A.R1, A.R2, A.T1.road, A.T2.road].includes(W.road), farA = W.road === A.R2 || W.road === A.T1.road || (W.road === A.R1 && W.s < 6);
      A.T2.m.set(onA && farA && A.T2.ang > -89.5);
      const farB = W.road === Bs.R1 || W.road === Bs.T2.road || W.road === Bs.R2 && W.s < .5;
      Bs.T1.m.set(farB && Bs.T1.ang > -89.5); },
    center: [11, -6, 0], pts: [[-5.6, 6.4, -1.6], [-5.6, -6.4, -1.6], [3.6, -18.4, -1.6], [30.4, -18.4, -1.6], [30.4, -5.4, -1.6], [16.4, 6.4, -1.6], [8, -6, -5], [6, -17, 5.2], [6, -8, 5.2], [28, -8, 4]], pad: .5, scenery: false },

  { id: 's-behind', name: 'Round the back', th: () => THEMES[1], cruise: [65, 92], yaws: [0, 90],
    // two holes, each hidden by the tower only from the angle you are not at when you reach it: each curtain needs its own turn
    hint: 'Light the seam (<b>B</b>) and the wheel will climb the tower, cross its roof and go down the back. Down there the road has a hole, in plain sight from here. Turn the camera (<b>A</b>) a quarter and the tower stands in front of it, so it is not there. Round the side a loop holds you; its way home runs behind the tower with a hole of its own, hidden only from where you started. Turn the camera back.',
    build(L) {
      const th = L.th, g = L.g, P = L.props, pal = PAL(), stone = tri(sp(th, 0)), H = 3.6;
      // the tower, its two top edges rounded to the road's own curve, so the road hugs it over the roof
      const tower = new T.Group(), Rr = .38; g.add(tower);
      B(tower, -3, -3, -.5, 0, 0, H - Rr, stone); B(tower, -3 + Rr, -3, H - Rr, -Rr, 0, H, stone);
      for (const x of [-Rr, -3 + Rr]) { const c = new T.Mesh(new T.CylinderGeometry(Rr, Rr, 3, 32), stone); c.rotation.x = Math.PI / 2; c.position.copy(V(x, -1.5, H - Rr)); tower.add(c); }
      const A = L.road(loopPts(.42, -2.6, 5, 2.0, 0, .8), { closed: true, pal }); P.A = A; loopSlab(g, -.2, -3.2, 5.6, 2.6, -.5, tri(th.turf), 1);
      // the seam route: up the front face, over the roof, down the back face, then round the tower's left side to the first hole
      const ys = -.6, t = ftur([.42, ys, .006], [-1, 0, 0], UP).curl(.4, 90).fwd(H - .4 - .006 - .38).curl(.4, -90).fwd(2.24).curl(.4, -90).fwd(H - .4 - .006 - .38).curl(.4, 90)
        .turn(1, -90).fwd(1.2);
      const W = L.road(t.pts, { pal, th: .12, mat: tri({ t: '#F4E5C6', l: '#F4E5C6', r: '#F4E5C6' }, { side: true }) }); P.W = W;
      const we = t.pts[t.pts.length - 1].p, xw = we[0], y1 = we[1];
      floor(L, xw - .58, ys - .6, -3.0, y1);
      const seamM = basic('#FFFFFF'), seam = new T.Mesh(UNIT_BOX, seamM); seam.scale.set(.9, .02, .1); seam.position.copy(V(.42, ys, .03)); g.add(seam);
      // past the first hole, on to the holding loop
      const yC = 4.0, Rb = strip(L, L3([xw, y1 + .6, .006], [xw, yC + .8, .006], UP), { pal, noFloor: true }); floor(L, xw - .55, y1 + .6, xw + .55, yC - .6);
      const C = L.road(loopPts(xw - 5, yC, xw, yC + 3.4, 0, .8), { closed: true, pal }); P.C = C; loopSlab(g, xw - 5.6, yC - .6, xw + .6, yC + 4.0, -.5, tri(th.turf), 1);
      Rb.joins = [{ k: 1, to: C, s: sAt(C, [xw, yC + .8, 0]), dir: 1 }];
      const occ = () => [tower];
      P.h1 = liveGap(L, W, 1, Rb, 0, occ, { text: 'Behind the tower, from here, so the hole was not there' });
      // the way home: off the loop's near side, south past the tower, then east along its back, with the second hole
      // (it keeps clear of where the roof road lands on screen, so the two never seem to meet)
      const xe = xw - 3, ye = -5.6, hx = -3.9, e = ftur([xe - 1, yC, .006], [1, 0, 0], UP).turn(1, -90).fwd(yC - 1 - (ye + 1)).turn(1, 90).fwd(hx - (xe + 1));
      const E1 = L.road(e.pts, { pal }), E2 = L.road(L3([hx + .6, ye, .006], [3, ye, .006], UP), { goal: true }); P.E1 = E1; P.E2 = E2;
      floor(L, xe - .55, ye - .55, xe + .55, yC - .6); floor(L, xe + .55, ye - .55, hx, ye + .55); floor(L, hx + .6, ye - .55, 3.55, ye + .55);
      P.h2 = liveGap(L, E1, 1, E2, 0, occ, { text: 'Behind the tower, from this side, so the hole was not there' });
      const sm = L.machine({ key: 'b', name: 'Seam', size: .45, place: (h) => { h.position.copy(V(2.7, -1.3, .04)); g.add(h); }, tick() { return 0; } }); P.seam = sm;
      CY(g, 2.7, -1.3, .6, -2.4, -.02, stone, 24);
      P.cam = cameraCrank(L, { key: 'a', name: 'Camera', at: [2.7, .6, 0], detents: [0, 90] });
      A.forks.push({ s: sAt(A, [.42, ys, 0]), dir: 1, to: W, toK: 0, when: () => sm.on && P.h1.hidden(), text: 'The seam is lit, so down is the wall' });
      C.forks.push({ s: sAt(C, [xe - 1, yC, 0]), dir: 1, to: E1, toK: 0, when: () => P.h2.hidden(), text: 'From here the hole is behind the tower' });
      L.view.updaters.push(() => { seamM.color.set(sm.on ? (th.goal || '#E8553B') : '#FFFFFF'); seam.scale.z = sm.on ? .16 : .06;
        L.say(`seam ${sm.on ? 'lit' : 'dark'} · camera ${P.cam.at(0) ? 'front' : P.cam.at(90) ? 'quarter turn' : 'turning'} · first hole ${P.h1.hidden() ? 'hidden' : 'in sight'} · home hole ${P.h2.hidden() ? 'hidden' : 'in sight'}`); });
    },
    spawn: (L) => ({ road: L.props.A, s: 1, dir: 1 }),
    solve(L, W, R) { const P = L.props; R.gear = 4; R.cad = 80; if (W.road === P.A && !P.seam.on) P.seam.set(true);
      const want = [P.A, P.W].includes(W.road) ? 90 : 0; P.cam.m.set(!P.cam.at(want)); },
    center: [-1.5, 0, 1.2], pts: [[-10.1, 3.4, 0], [-10.1, 8.0, 0], [-3.8, 8.0, 0], [-8, -6.2, 0], [3.55, -6.2, 0], [5.6, 2.6, 0], [5.6, -3.2, 0], [-3, -3, 3.6], [0, 0, 3.6], [-3, 0, 3.6], [0, -3, 3.6]], pad: 1.0, scenery: false },

];

Object.assign($scope, { LEVELS3, terrain, land });
}
