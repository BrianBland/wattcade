// @ts-nocheck
/* Penrose Pedals engine: the Cube, a mega level on the four walls of a big box. Each wall holds one puzzle; the road
 * wraps round a vertical edge onto the next wall, and as the wheel rounds the edge the whole box turns a quarter so
 * the new wall faces you. Also the wall machines it is built from (a wall turntable, an awning curtain, a wall lift
 * and a hard-push beam), which other wall levels can reuse.
 * Installed into the shared engine scope in order (see ./index.ts); names come in from $scope and go back out to it. */
import * as T from 'three';

export function install($scope) {
const { B, CY, L3, THEMES, UNIT, V, basic, clamp, cloudLayer, drift, TEX, ease, ftur, mixPal, rider, sAt, setTri, sp, tone, tri, wallArt, SD } = $scope;

const add = (a, b, k = 1) => a.map((v, i) => v + b[i] * k);
const Zup = [0, 0, 1];
// three.js vectors for sketch directions (V swaps y and z)
const v3 = (d) => V(...d).normalize();

/** A wall's frame: n = outward normal, u = along the wall (the way the road heads to the next wall), z up. at(u, z, off) is a point off the wall. */
function wallFrame(origin, n, u) {
  return { n, u, at: (uu, zz, off = 0) => add(add(add(origin, n, off), u, uu), Zup, zz) };
}

/** A rounded rectangle loop painted on a wall, anticlockwise as seen from outside (cw: clockwise). Starts mid-bottom heading +u (cw: -u). */
function wallLoopPts(F, u0, u1, z0, z1, r, off, cw = false) {
  const w = u1 - u0, h = z1 - z0, sg = cw ? 1 : -1;
  const t = ftur(F.at((u0 + u1) / 2, z0, off), cw ? F.u.map((v) => -v) : F.u, F.n);
  t.fwd(w / 2 - r).turn(r, 90 * sg).fwd(h - 2 * r).turn(r, 90 * sg).fwd(w - 2 * r).turn(r, 90 * sg).fwd(h - 2 * r).turn(r, 90 * sg).fwd(w / 2 - r);
  return t.pts;
}

/** Point a group's local +x (sketch) along direction d within a wall: used for arms that swing in the wall's plane. */
function aimInWall(grp, F, deg) {
  const a = deg * Math.PI / 180, d = v3(add(F.u.map((v) => v * Math.cos(a)), Zup, Math.sin(a))), n = v3(F.n), u = v3(F.u);
  // a turn about the wall normal; V() mirrors the frame, so pick the sign that carries u onto d
  grp.quaternion.setFromAxisAngle(n, a);
  if (u.clone().applyQuaternion(grp.quaternion).dot(d) < .99) grp.quaternion.setFromAxisAngle(n, -a);
}
/** A matrix that places a unit box with its x, y, z along bx, by, bz (three vectors), scaled and centred at pos; kept right-handed. */
function boxMatrix(bx, by, bz, sx, sy, sz, pos) {
  const x = new T.Vector3().crossVectors(by, bz).dot(bx) < 0 ? bx.clone().negate() : bx;
  return new T.Matrix4().makeBasis(x, by, bz).multiply(new T.Matrix4().makeScale(sx, sy, sz)).setPosition(pos);
}

/**
 * An arm road on a wall pivot: it swings in the wall's plane between stops (degrees; 0 = along u, 90 = up the wall).
 * o: { F, parent, pivot: [u, z], len, stops: [a, b], start, key, name, hardPush?: rpm needed to move it, off }.
 * The arm's road starts at the pivot and runs out to its tip.
 */
function wallArm(L, o) {
  const th = L.th, F = o.F, off = o.off ?? .02, root = F.at(o.pivot[0], o.pivot[1], off);
  const pg = new T.Group(); pg.position.copy(V(...root)); o.parent.add(pg);
  const ag = new T.Group(); pg.add(ag);
  const mat = tri(th.mech, { fresh: true, side: true });
  const road = L.road(L3([0, 0, 0], F.u.map((v) => v * o.len), F.n), { g: ag, mat, edgeText: o.edgeText });
  // a hub disc flush on the wall
  const hub = new T.Mesh(new T.CylinderGeometry(.42, .42, .08, 28), tri(th.mechDark || th.idle)); hub.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), v3(F.n)); hub.position.copy(V(...F.n.map((v) => -v * .03))); pg.add(hub);
  const [lo, hi] = [Math.min(...o.stops), Math.max(...o.stops)];
  const st = { ang: o.start ?? o.stops[0], sweep: (o.start ?? o.stops[0]) === lo ? 1 : -1, road, F };
  const bl = o.at ? F.at(o.at[0], o.at[1], .06) : add(root, F.n, .06);
  st.m = L.machine({ key: o.key, name: o.name, size: .5, place: (h) => { h.position.copy(V(...bl)); h.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), v3(F.n)); o.parent.add(h); },
    tick(dt, drive) {
      const can = !o.hardPush || rider.cad >= o.hardPush;
      if (drive > 0 && can) { st.ang += st.sweep * drive * 30; if (st.ang <= lo || st.ang >= hi) { st.ang = clamp(st.ang, lo, hi); st.sweep *= -1; } }
      else if (!o.latch || drive <= 0) { const tgt = o.stops.reduce((a, d) => Math.abs(d - st.ang) < Math.abs(a - st.ang) ? d : a, o.stops[0]); st.ang += clamp(tgt - st.ang, -60 * dt, 60 * dt); }
      aimInWall(ag, F, st.ang); setTri(mat, mixPal(th.mech, tone(th.goal), clamp(this.bloom.e, 0, 1)));
      return drive > 0 ? (o.hardPush ? (can ? .9 : .5) : .3) : 0; } });
  aimInWall(ag, F, st.ang);
  st.at = (d) => Math.abs(st.ang - d) < .5;
  return st;
}

/**
 * An awning hinged on a wall: folded up flat it hides nothing; swung out level it stands between the camera and the
 * wall below it. o: { F, parent, u0, u1, z, depth, key, name }.
 */
function awning(L, o) {
  const th = L.th, F = o.F, hinge = F.at((o.u0 + o.u1) / 2, o.z, .02);
  const hg = new T.Group(); hg.position.copy(V(...hinge)); o.parent.add(hg);
  // the leaf in hinge space: x along u, out along n; rotate about u to fold it up against the wall
  const leafM = tri(th.roof || th.mech, { fresh: true, side: true }), leaf = new T.Group(); hg.add(leaf);
  const w = o.u1 - o.u0, d = o.depth;
  const slab = new T.Mesh(UNIT, leafM); leaf.add(slab);
  // basis: local X = u, local Y = up, local Z = n (in three coords); the slab lies in u x n, thin in up
  const bx = v3(F.u), by = v3(Zup), bz = v3(F.n);
  slab.matrixAutoUpdate = false; slab.matrix.copy(boxMatrix(bx, by, bz, w, .08, d, bz.clone().multiplyScalar(d / 2)));
  for (let k = 0; k < 4; k++) { const stripe = new T.Mesh(UNIT, basic(k % 2 ? '#FFFFFF' : (th.goal || '#E8553B'))); stripe.matrixAutoUpdate = false;
    stripe.matrix.copy(boxMatrix(bx, by, bz, w / 4 - .02, .1, .14, bx.clone().multiplyScalar(-w / 2 + w / 8 + k * w / 4).add(bz.clone().multiplyScalar(d - .07)))); leaf.add(stripe); }
  const st = { ang: 90, sweep: -1, leaf };   // 90 = folded up, 0 = out level
  const axis = v3(F.u);
  st.m = L.machine({ key: o.key, name: o.name || 'Awning', size: .5, place: (h) => { h.position.copy(V(...F.at(...(o.at || [o.u1 + .6, o.z + .2]), .06))); h.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), v3(F.n)); o.parent.add(h); },
    tick(dt, drive) {
      if (drive > 0) { st.ang += st.sweep * drive * 30; if (st.ang <= 0 || st.ang >= 90) { st.ang = clamp(st.ang, 0, 90); st.sweep *= -1; } }
      else { const tgt = st.ang > 45 ? 90 : 0; st.ang += clamp(tgt - st.ang, -60 * dt, 60 * dt); }
      // fold about u: positive turns the out-pointing leaf up the wall
      leaf.quaternion.setFromAxisAngle(axis, 0); const q = new T.Quaternion().setFromUnitVectors(bz, by); const qa = new T.Quaternion().slerpQuaternions(new T.Quaternion(), q, st.ang / 90); leaf.quaternion.copy(qa);
      setTri(leafM, mixPal(th.roof || th.mech, tone(th.goal), clamp(this.bloom.e, 0, 1) * .5));
      return drive > 0 ? .3 : 0; } });
  { const q = new T.Quaternion().setFromUnitVectors(bz, by); leaf.quaternion.copy(q); }
  st.out = () => st.ang < .5;
  return st;
}

/** A hole between two road ends that is only there while it can be seen; ends are read live, so it works on moving walls. */
function liveGap(L, A, kA, Bq, kB, occ, o = {}) {
  const ray = new T.Raycaster(), Yax = new T.Vector3(0, 1, 0);
  const hidden = () => { const d = SD.clone().applyAxisAngle(Yax, L.view.yaw), ms = []; for (const ob of occ()) ob.traverse((m) => { if (m.isMesh) ms.push(m); });
    const pa = A.end(kA).p, pb = Bq.end(kB).p;
    for (let i = 0; i <= 8; i++) { const p = pa.clone().lerp(pb, i / 8); p.y -= .1; ray.set(p.clone().addScaledVector(d, 150), d.clone().negate()); const h = ray.intersectObjects(ms, false); if (!h.length || h[0].distance > 149.7) return false; }
    return true; };
  const text = o.text || 'Hidden, so the hole was not there';
  A.gaps.push({ k: kA, to: Bq, toK: kB, when: hidden, text }); Bq.gaps.push({ k: kB, to: A, toK: kA, when: hidden, text });
  A.edgeText = Bq.edgeText = o.edge || 'The hole was in plain sight';
  return { hidden };
}

/** A small closed loop on a wall lift deck that slides up and down the wall with cadence (no button). */
function wallLift(L, o) {
  const th = L.th, F = o.F, lg = new T.Group(); o.parent.add(lg);
  const [u0, u1] = o.u, h = o.h, r = .4, pts = wallLoopPts(F, u0, u1, 0, h, r, .02);
  const loop = L.road(pts, { g: lg, closed: true, pal: o.pal || tone('#F2D49B') });
  // the deck: a plate behind the loop, standing a little proud of the wall
  const plate = new T.Mesh(UNIT, tri(th.mech, { fresh: true })); plate.matrixAutoUpdate = false;
  const bx = v3(F.u), by = v3(Zup), bz = v3(F.n), c = F.at((u0 + u1) / 2, h / 2, -.01);
  plate.matrix.copy(boxMatrix(bx, by, bz, u1 - u0 + .5, h + .5, .06, V(...c))); lg.add(plate);
  // rails up the wall
  for (const uu of [u0 - .35, u1 + .35]) { const rail = new T.Mesh(UNIT, tri(th.mechDark || th.idle)); rail.matrixAutoUpdate = false; const rc = F.at(uu, (o.lo + o.hi + h) / 2, .02);
    rail.matrix.copy(boxMatrix(bx, by, bz, .08, o.hi - o.lo + h + .6, .06, V(...rc))); o.parent.add(rail); }
  const st = { lvl: 0, z: o.lo, loop, lg, moving: false };
  L.view.updaters.push((t, dt) => {
    if (L.state !== 'play') return;
    const target = clamp((rider.cad - 55) / 30, 0, 1), prev = st.lvl; st.lvl += clamp(target - st.lvl, -.7 * dt, .7 * dt); st.moving = Math.abs(st.lvl - prev) > 1e-4;
    let z = o.lo + (o.hi - o.lo) * st.lvl; if (Math.abs(z - o.hi) < .06) z = o.hi; if (Math.abs(z - o.lo) < .06) z = o.lo; st.z = z;
    lg.position.copy(V(0, 0, z)); setTri(plate.material, mixPal(th.mech, tone(th.goal), st.z === o.hi || st.z === o.lo ? .35 : 0));
  });
  lg.position.copy(V(0, 0, o.lo));
  return st;
}

/* ---------------- the Cube ---------------- */
const CUBE_H = 3, CUBE_Z = 6, CR = .6;   // half width, height, corner radius of the road round each vertical edge
const WALLS = [
  { n: [1, 0, 0], u: [0, -1, 0] },
  { n: [0, -1, 0], u: [-1, 0, 0] },
  { n: [-1, 0, 0], u: [0, 1, 0] },
  { n: [0, 1, 0], u: [1, 0, 0] },
];

/** A road from (u, z) on wall k heading +u to the edge, round it and onto wall k+1 up to u = uTo. Returns { pts, sEdge }. */
function cornerPts(F, k, u, z, uTo) {
  const off = .02, edgeU = CUBE_H + off - CR, t = ftur(F[k].at(u, z, off), F[k].u, F[k].n);
  t.fwd(edgeU - u); const sEdge = (edgeU - u) + CR * Math.PI / 4; t.curl(CR, -90); t.fwd(uTo - (-edgeU));
  return { pts: t.pts, sEdge };
}

const CUBES = [
  { id: 'x-cube', name: 'The Cube', th: () => THEMES[2], cruise: [70, 92],
    hint: 'Four walls, four puzzles, and the box turns to follow you. <b>First wall:</b> swing the wall turntable (<b>Y</b>) level and the loop leads off round the corner. <b>Second:</b> the road ahead has a hole; swing the awning out (<b>A</b>) and from here the hole is hidden behind it, so it is not there. <b>Third:</b> no button. Spin up (about 85 rpm) to lift the deck level with the loop, ride on, then ease off (about 55) to let it down to the road out. <b>Fourth:</b> hold <b>B</b> and push hard (86 rpm or more) to raise the beam; from here its tip meets the road on the roof, which lies far behind it, and that is the way home.',
    build(L) {
      const th = L.th, g = L.g, P = L.props, h = CUBE_H, H = CUBE_Z;
      const cube = new T.Group(); g.add(cube); P.cube = cube;
      const F = WALLS.map((w) => wallFrame([w.n[0] * h, w.n[1] * h, 0], w.n, w.u));
      // the box: rounded vertical edges so the corner roads wrap it flush
      const stone = tri(sp(th, 0)), R2 = CR - .02;
      B(cube, -h + R2, -h, 0, h - R2, h, H, stone); B(cube, -h, -h + R2, 0, h, h - R2, H, stone);
      for (const [sx, sy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) CY(cube, sx * (h - R2), sy * (h - R2), R2, 0, H, stone, 20);
      B(cube, -h - .1, -h - .1, H, h + .1, h + .1, H + .14, tri(th.idle));
      // the plinth it turns on
      CY(g, 0, 0, h * 1.5, -3, -.02, tri(sp(th, 1)), 48); CY(g, 0, 0, h * 1.35, -.02, 0, tri(th.idle), 48);
      // wall art: a different pattern on each wall and the roof
      const styles = ['tiles', 'arcade', 'mosaic', 'chevron'];
      F.forEach((f, k) => wallArt(L, cube, { centre: f.at(0, H / 2, 0), u: f.u, up: Zup, n: f.n, w: 2 * h - 2 * R2 - .1, h: H - .3, style: styles[k], seed: 11 + k }));
      wallArt(L, cube, { centre: [0, 0, H + .14], u: [1, 0, 0], up: [0, 1, 0], n: [0, 0, 1], w: 2 * h, h: 2 * h, style: 'meander', seed: 5 });
      const pal = tone('#F2D49B'), road = (pts, o = {}) => L.road(pts, { g: cube, pal, ...o });

      // wall 0: a loop and a wall turntable whose arm, swung level, leads to the corner
      const L0 = road(wallLoopPts(F[0], -2.2, .6, 1.0, 2.8, .45, .02), { closed: true }); P.L0 = L0;
      const disc = wallArm(L, { F: F[0], parent: cube, pivot: [.6, 1.9], len: 1.2, stops: [0, 179], start: 179, at: [1.6, 3.4], key: 'y', name: 'Wall turntable', edgeText: 'The arm pointed up into the air, so the wheel dropped' }); P.disc = disc;
      L0.forks.push({ s: sAt(L0, F[0].at(.6, 1.9, .02)), dir: 1, to: disc.road, toK: 0, when: () => disc.at(0), text: 'The arm is level, so the wheel rides out' });
      const c0 = cornerPts(F, 0, 1.8, 1.9, -1.2); const E0 = road(c0.pts); P.E0 = E0;

      // wall 1: a loop; its way out has a hole that only the awning, swung out, hides
      const L1 = road(wallLoopPts(F[1], -1.8, .4, 1.9, 3.5, .45, .02), { closed: true }); P.L1 = L1;
      E0.joins = [{ k: 1, to: L1, s: sAt(L1, F[1].at(-1.2, 1.9, .02)) + .02, dir: 1 }];
      const x1 = ftur(F[1].at(.4, 2.4, .02), Zup, F[1].n).fwd(1.6).turn(.5, 90).fwd(.6), X1 = road(x1.pts); P.X1 = X1;   // ends at u 1.5
      L1.forks.push({ s: sAt(L1, F[1].at(.4, 2.4, .02)), dir: 1, to: X1, toK: 0, when: () => P.hole1.hidden(), text: 'The road ahead looks whole, so the wheel rides on' });
      const c1 = cornerPts(F, 1, 2.0, 4.5, -.9); const E1 = road(c1.pts); P.E1 = E1;
      const aw = awning(L, { F: F[1], parent: cube, u0: .5, u1: 2.4, z: 4.95, depth: 1.0, key: 'a', name: 'Awning', at: [-1.0, 4.6] }); P.aw = aw;
      P.hole1 = liveGap(L, X1, 1, E1, 0, () => [aw.leaf], { text: 'Behind the awning, so the hole was not there' });

      // wall 2: a loop at the top; a lift deck beside it rides between the loop's level and the road out below
      const L2 = road(wallLoopPts(F[2], -1.8, -.2, 4.5, 5.6, .4, .02), { closed: true }); P.L2 = L2;
      E1.joins = [{ k: 1, to: L2, s: sAt(L2, F[2].at(-.9, 4.5, .02)) + .02, dir: 1 }];
      const lift = wallLift(L, { F: F[2], parent: cube, u: [.5, 1.9], h: 1.0, lo: 3.38, hi: 4.5 }); P.lift = lift;
      const C2 = road(L3(F[2].at(-.9, 4.5, .02), F[2].at(1.2, 4.5, .02), F[2].n), { edgeText: 'The deck was not there, so the wheel dropped' }); P.C2 = C2;
      L2.forks.push({ s: sAt(L2, F[2].at(-.9, 4.5, .02)), dir: 1, to: C2, toK: 0, when: () => lift.z === 4.5 && !lift.moving, text: 'The deck is level with the loop' });
      C2.forks.push({ s: C2.L - .06, dir: 1, to: lift.loop, toK: 0, when: () => lift.z === 4.5, text: 'Onto the lift deck' });
      // the deck loop starts mid-bottom (u 1.2), so join it there and run on
      const c2 = cornerPts(F, 2, 1.6, 3.38, -1.65); const E2 = road(c2.pts); P.E2 = E2;
      lift.loop.forks.push({ s: sAt(lift.loop, F[2].at(1.6, 0, .02)), dir: 1, to: E2, toK: 0, when: () => lift.z === 3.38, text: 'The deck is down at the road out' });

      // wall 3: a clockwise loop whose top runs on from the corner; a long beam on its top, raised by a hard push,
      // reaches above the roof line, where from here its tip meets a road on the roof
      const L3w = road(wallLoopPts(F[3], -2.2, .4, 1.58, 3.38, .5, .02, true), { closed: true }); P.L3 = L3w;
      E2.joins = [{ k: 1, to: L3w, s: sAt(L3w, F[3].at(-1.65, 3.38, .02)) + .02, dir: 1 }];
      const beam = wallArm(L, { F: F[3], parent: cube, pivot: [-1.2, 3.38], len: 4.8, stops: [75, 115], start: 115, at: [1.5, 1.1], key: 'b', name: 'Beam (push hard)', hardPush: 86, latch: true, edgeText: 'The beam led nowhere from here, so the wheel dropped' }); P.beam = beam;
      L3w.forks.push({ s: sAt(L3w, F[3].at(-1.2, 3.38, .02)), dir: 1, to: beam.road, toK: 0, when: () => beam.at(75), text: 'The beam is up, so the wheel climbs it' });
      // the roof road: in world space at the final turn (270°) its start lies 2 m behind the beam's tip along the view
      const tipW = (() => { const a = 75 * Math.PI / 180, u = -1.2 + 4.8 * Math.cos(a), z = 3.38 + 4.8 * Math.sin(a); return [h + .02, -u, z]; })();   // wall 3 faces +x at 270°, u runs along -y
      const k = tipW[2] - (H + .16), RW = [tipW[0] - k, tipW[1] - k, H + .16];
      // the roof road heads the way the beam's tip heads on screen
      const scr = (d) => [(d[0] - d[1]) * .7071, (2 * d[2] - d[0] - d[1]) * .4082];
      const a75 = 75 * Math.PI / 180, dTip = [0, -Math.cos(a75), Math.sin(a75)], sT = scr(dTip), nT = Math.hypot(...sT);
      let best = 0, bd = -2; for (let i = 0; i < 360; i++) { const f = i * Math.PI / 180, s = scr([Math.cos(f), Math.sin(f), 0]), nn = Math.hypot(...s), c = (s[0] * sT[0] + s[1] * sT[1]) / (nn * nT); if (c > bd) { bd = c; best = f; } }
      const dW = [Math.cos(best), Math.sin(best), 0];
      // to the cube's own frame: undo the 270° turn ((x, y) -> (-y, x) is +90°)
      const toLocal = (p) => [-p[1], p[0], p[2]];
      const r0 = toLocal(RW), d0 = toLocal(dW);
      // run a little way on, then bend toward the middle of the roof and stop short of it
      const toC = [-r0[0], -r0[1]], left = d0[0] * toC[1] - d0[1] * toC[0] > 0;
      const rt = ftur(r0, d0, Zup).fwd(.7).turn(.7, left ? 90 : -90).fwd(.9);
      const home = road(rt.pts, { goal: true }); P.home = home;

      // turning the box: as the wheel passes each edge, the next wall swings round to face you
      const turn = { k: 0, from: 0, to: 0, t: 1 }; P.turn = turn;
      const edges = [[E0, c0.sEdge], [E1, c1.sEdge], [E2, c2.sEdge]];
      L.view.updaters.push((t, dt) => {
        const W = L.W;
        if (W && W.mode === 'road') edges.forEach(([E, sE], i) => { if (W.road === E && W.s > sE - .4 && turn.k === i) { turn.k = i + 1; turn.from = cube.rotation.y; turn.to = -(i + 1) * Math.PI / 2; turn.t = 0; } });
        if (turn.t < 1) { turn.t = Math.min(1, turn.t + dt / 1.6); const e = turn.t < .5 ? 4 * turn.t ** 3 : 1 - Math.pow(-2 * turn.t + 2, 3) / 2; cube.rotation.y = turn.from + (turn.to - turn.from) * e; }
        // only the wall facing you shows its machine's tap target
        [disc, aw, beam].forEach((m, i) => { const face = [0, 1, 3][i]; if (m.m.bd) m.m.bd.style.visibility = turn.k === face && turn.t >= 1 ? 'visible' : 'hidden'; });
        L.say([`wall ${turn.k + 1} of 4`,
          turn.k === 0 ? `turntable ${disc.at(0) ? 'out to the corner' : disc.at(179) ? 'folded into the loop' : 'moving'}` :
          turn.k === 1 ? `awning ${aw.out() ? 'out' : 'folded'} · hole ${P.hole1.hidden() ? 'hidden' : 'in sight'}` :
          turn.k === 2 ? `cadence ${Math.round(rider.cad)} rpm · deck ${lift.z === 4.5 ? 'at the loop' : lift.z === 3.38 ? 'at the road out' : 'moving'}` :
          `beam ${beam.at(75) ? 'up' : beam.at(115) ? 'leaning back' : 'moving'}${rider.cad < 86 ? ' · push harder to move it' : ''}`].join(' · '));
      });
    },
    spawn: (L) => ({ road: L.props.L0, s: 1, dir: 1 }),
    solve(L, W, R) {
      const P = L.props, k = P.turn.k; R.gear = 4; R.cad = 80;
      P.disc.m.set(k === 0 && !P.disc.at(0));
      P.aw.m.set(k === 1 && !P.aw.out());
      if (k === 2) R.cad = W.road === P.lift.loop ? 50 : 90;
      if (k === 3) { R.cad = 95; P.beam.m.set(!P.beam.at(75)); } else P.beam.m.set(false);
    },
    center: [0, 0, 3.4], pts: [[3, -3, 0], [3, 3, 0], [-3, 3, 0], [-3, -3, 0], [3, -3, 8.4], [-3, 3, 6.2], [3, 3, 8.4], [0, 0, -3]], pad: .9,
    decor(L) { cloudLayer(L.view, L.th, '#FFFFFF', 5, .8, .55, .95, .18); },
    scenery: false },
];

Object.assign($scope, { wallFrame, wallLoopPts, aimInWall, wallArm, awning, liveGap, wallLift, CUBES });
}
