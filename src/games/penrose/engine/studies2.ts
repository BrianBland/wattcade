// @ts-nocheck
/* Penrose Pedals engine: studies for the new mechanics (conveyor lanes first). Each study is a short level that shows one
 * mechanic working on its own before the composer uses it as a beat.
 * Installed into the shared engine scope in order (see ./index.ts); names come in from $scope and go back out to it. */
import * as T from 'three';

export function install($scope) {
const { B, CY, L3, UP, THEMES, V, basic, clamp, ftur, liveGap, loopPts, loopSlab, mixPal, rider, sAt, setTri, sp, tone, tri } = $scope;

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
      const t = ftur([.42, ys, .006], [-1, 0, 0], UP).curl(.4, 90).fwd(1.5).turn(.5, -90);
      t.fwd(-.3 - t.st.p[1]).curl(.3, -90).fwd(.5).turn(.5, -90).fwd(t.st.p[2] - .5 - .4 + .1).curl(.4, 90).fwd(2.6);
      const W = L.road(t.pts, { goal: true, pal }); P.W = W;
      const st = { on: false }; P.seam = st;
      st.m = L.machine({ key: 'b', name: 'Seam', size: .45, place: (h) => { h.position.copy(V(1.6, -5.9, .04)); g.add(h); }, tick() { return 0; } });
      A.forks.push({ s: sAt(A, [.42, ys, 0]), dir: 1, to: W, toK: 0, when: () => st.m.on, text: 'The seam is lit, so down is the wall' });
      L.view.updaters.push(() => { seamM.color.set(st.m.on ? (th.goal || '#E8553B') : '#FFFFFF'); seam.scale.z = st.m.on ? .16 : .06; L.say(`seam ${st.m.on ? 'lit' : 'dark'}`); });
    },
    spawn: (L) => ({ road: L.props.A, s: 1, dir: 1 }),
    solve(L, W, R) { R.gear = 4; R.cad = 80; L.props.seam.m.set(true); },
    center: [0, -1.5, 1.5], pts: [[-3, -3, 0], [5.6, -5.6, 0], [-.2, 3, 0], [-3, -3, 3.8], [5.6, 0, 0]], pad: .9, scenery: false },
];

Object.assign($scope, { conveyor, companion, NSTUDIES });
}
