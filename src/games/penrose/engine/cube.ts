// @ts-nocheck
/* Penrose Pedals engine: the Cube, a mega level on the four walls of a big box. Each wall holds one puzzle; the road
 * wraps round a vertical edge onto the next wall, and as the wheel rounds the edge the whole box turns a quarter so
 * the new wall faces you. Also the wall machines it is built from (a wall turntable, an awning curtain, a wall lift
 * and a hard-push beam), which other wall levels can reuse.
 * Installed into the shared engine scope in order (see ./index.ts); names come in from $scope and go back out to it. */
import * as T from 'three';

export function install($scope) {
const { B, CY, L3, THEMES, UNIT, V, basic, clamp, cloudLayer, drift, TEX, ease, ftur, mixPal, rider, sAt, setTri, sp, tone, tri, wallArt, SD, SR, SU } = $scope;

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
  const th = L.th, F = o.F, off = o.off ?? .008, root = F.at(o.pivot[0], o.pivot[1], off), base = th.path || th.mech;
  const pg = new T.Group(); pg.position.copy(V(...root)); o.parent.add(pg);
  const ag = new T.Group(); pg.add(ag);
  const mat = tri(base, { fresh: true, side: true });
  // o.block: the arm ends in a block of that size, and its road runs on over the block's top edge, away from the wall
  const bs = o.block, BR = .08, pts = bs ? ftur([0, 0, 0], F.u, F.n).fwd(o.len).curl(BR, -90).fwd(bs / 2 - BR).pts : L3([0, 0, 0], F.u.map((v) => v * o.len), F.n);
  const road = L.road(pts, { g: ag, mat, th: .12, edgeText: o.edgeText });
  if (bs) plate(ag, F.u, Zup, F.n.map((v) => -v), bs, bs, bs, add(F.u.map((v) => v * (o.len + BR - .008 - bs / 2)), F.n, -.006), tri(th.roof));
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
      aimInWall(ag, F, st.ang); setTri(mat, mixPal(base, tone(th.goal), clamp(this.bloom.e, 0, 1) * .35));
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
  const leafM = tri(th.mech, { fresh: true, side: true }), leaf = new T.Group(); hg.add(leaf);
  const w = o.u1 - o.u0, d = o.depth;
  const slab = new T.Mesh(UNIT, leafM); leaf.add(slab);
  // basis: local X = u, local Y = up, local Z = n (in three coords); the slab lies in u x n, thin in up
  const bx = v3(F.u), by = v3(Zup), bz = v3(F.n);
  slab.matrixAutoUpdate = false; slab.matrix.copy(boxMatrix(bx, by, bz, w, .08, d, bz.clone().multiplyScalar(d / 2)));
  for (let k = 0; k < 4; k++) { const stripe = new T.Mesh(UNIT, basic(k % 2 ? (th.trim || '#FFFFFF') : (th.mechDark ? th.mechDark.l : th.goal || '#E8553B'))); stripe.matrixAutoUpdate = false;
    stripe.matrix.copy(boxMatrix(bx, by, bz, w / 4 - .02, .1, .14, bx.clone().multiplyScalar(-w / 2 + w / 8 + k * w / 4).add(bz.clone().multiplyScalar(d - .07)))); leaf.add(stripe); }
  const st = { ang: 90, sweep: -1, leaf };   // 90 = folded up, 0 = out level
  const axis = v3(F.u);
  st.m = L.machine({ key: o.key, name: o.name || 'Awning', size: .5, place: (h) => { h.position.copy(V(...F.at(...(o.at || [o.u1 + .6, o.z + .2]), .06))); h.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), v3(F.n)); o.parent.add(h); },
    tick(dt, drive) {
      if (drive > 0) { st.ang += st.sweep * drive * 30; if (st.ang <= 0 || st.ang >= 90) { st.ang = clamp(st.ang, 0, 90); st.sweep *= -1; } }
      else { const tgt = st.ang > 45 ? 90 : 0; st.ang += clamp(tgt - st.ang, -60 * dt, 60 * dt); }
      // fold about u: positive turns the out-pointing leaf up the wall
      leaf.quaternion.setFromAxisAngle(axis, 0); const q = new T.Quaternion().setFromUnitVectors(bz, by); const qa = new T.Quaternion().slerpQuaternions(new T.Quaternion(), q, st.ang / 90); leaf.quaternion.copy(qa);
      setTri(leafM, mixPal(th.mech, tone(th.goal), clamp(this.bloom.e, 0, 1) * .5));
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
  const loop = L.road(pts, { g: lg, closed: true, pal: o.pal || L.th.path || tone('#F2D49B') });
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
const CUBE_H = 3, CUBE_Z = 12, CR = .6, STOREY = 6.2;   // half width, height, corner radius of the road round each vertical edge, upper storey floor
const EDGE_U = CUBE_H + .02 - CR;   // where a wall road starts to wrap round the vertical edge
const WALLS = [
  { n: [1, 0, 0], u: [0, -1, 0] },
  { n: [0, -1, 0], u: [-1, 0, 0] },
  { n: [-1, 0, 0], u: [0, 1, 0] },
  { n: [0, 1, 0], u: [1, 0, 0] },
];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const plen = (pts) => { let s = 0; for (let i = 1; i < pts.length; i++) s += Math.hypot(...pts[i].p.map((v, j) => v - pts[i - 1].p[j])); return s; };

/** Carry a turtle heading +u on wall k on to the edge, round it and onto wall k+1 up to u = uTo. Returns the arc length at the edge. */
function roundEdge(t, F, k, uTo) {
  const uc = dot(t.st.p, F[k].u); t.fwd(EDGE_U - uc); const sEdge = plen(t.pts) + CR * Math.PI / 4;
  t.curl(CR, -90); t.fwd(uTo + EDGE_U); return sEdge;
}
/** A road from (u, z) on wall k heading +u to the edge, round it and onto wall k+1 up to u = uTo. Returns { pts, sEdge }. */
function cornerPts(F, k, u, z, uTo) {
  const t = ftur(F[k].at(u, z, .02), F[k].u, F[k].n); const sEdge = roundEdge(t, F, k, uTo);
  return { pts: t.pts, sEdge };
}
/** A plate standing out of a wall, used as a sail on an arm or a balcony under a lift deck. Box axes: a along the wall, b across, depth out along n. */
function plate(parent, a, b, n, la, lb, depth, centre, mat) {
  const m = new T.Mesh(UNIT, mat); m.matrixAutoUpdate = false;
  m.matrix.copy(boxMatrix(v3(a), v3(b), v3(n), la, lb, depth, V(...add(centre, n, depth / 2)))); parent.add(m); return m;
}

// Monument Valley's lesson: one soft palette, three flat tones per material, walkways paler than the walls they cross,
// one accent colour for everything that moves, and ornament that is sparse and sits only where nothing happens
const CUBE_THEME = Object.assign({}, THEMES[2], {
  sky: 'linear-gradient(180deg,#F3C9C4 0%,#F9DFD3 48%,#FFF3E6 100%)',
  stone: { t: '#FFF3EC', l: '#F8D8CB', r: '#E8B3A6' }, idle: { t: '#FBE9E1', l: '#EFC6BA', r: '#D9A396' },
  roof: { t: '#F1CFC2', l: '#F6DED3', r: '#E3B9AC' }, mech: { t: '#7FD3C4', l: '#3FA79A', r: '#2A7E78' }, mechDark: { t: '#3E9C92', l: '#2A7E78', r: '#1D5D5A' },
  path: { t: '#FFFAF2', l: '#FBEBD8', r: '#ECCDB0' }, ink: '#A86A66', lane: '#D9B79C', goal: '#2A7E78', trim: '#FFFFFF' });
const CUBE_HINTS = [
  'Six puzzles round a tower of two storeys, and the tower turns to follow you. <b>First wall:</b> swing the wall turntable (<b>Y</b>) level and the loop leads off round the corner.',
  '<b>Second wall:</b> the road ahead has a hole. Swing the awning out (<b>A</b>): from here the hole is hidden behind it, so it is not there.',
  '<b>Third wall:</b> no button. Spin up (about 85 rpm) to lift the deck level with the loop, ride on, then ease off (about 55) to let it down to the road out.',
  '<b>Fourth wall:</b> hold <b>B</b> and push hard (86 rpm or more) to stand the beam up. It is the way up to the second storey.',
  '<b>Upstairs.</b> The bridge (<b>Y</b>) has two jobs. Stand it up and ride on up it to the loop at the top. Then lay it flat again: lying flat, its sail hides the hole on the way down, so the hole is not there. Lay it flat while you are on it and you drop.',
  '<b>Last wall.</b> Stand the arm up (<b>A</b>). From here its tip meets the road on the roof, which lies far behind it.',
];

const CUBES = [
  { id: 'x-cube', name: 'The Cube', th: () => CUBE_THEME, cruise: [70, 92],
    hint: CUBE_HINTS[0],
    build(L) {
      const th = L.th, g = L.g, P = L.props, h = CUBE_H, H = CUBE_Z;
      const cube = new T.Group(); g.add(cube); P.cube = cube;
      const F = WALLS.map((w) => wallFrame([w.n[0] * h, w.n[1] * h, 0], w.n, w.u));
      // the box: rounded vertical edges so the corner roads wrap it flush
      const stone = tri(sp(th, 0)), R2 = CR - .02;
      B(cube, -h + R2, -h, 0, h - R2, h, H, stone); B(cube, -h, -h + R2, 0, h, h - R2, H, stone);
      for (const [sx, sy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) CY(cube, sx * (h - R2), sy * (h - R2), R2, 0, H, stone, 20);
      B(cube, -h - .14, -h - .14, H, h + .14, h + .14, H + .14, tri(th.roof));
      for (const [sx, sy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) { const fx = sx * (h - .05), fy = sy * (h - .05);
        CY(cube, fx, fy, .2, H + .14, H + .5, tri(th.roof), 16); const cone = new T.Mesh(new T.ConeGeometry(.24, .55, 16), tri(th.mech)); cone.position.copy(V(fx, fy, H + .77)); cube.add(cone); }
      // a storey line: a thin cornice ring painted round the tower (flush, so the roads cross it cleanly)
      // the plinth it turns on
      CY(g, 0, 0, h * 1.75, -3.6, -.62, tri(th.idle), 64); CY(g, 0, 0, h * 1.55, -.62, -.32, tri(th.roof), 64); CY(g, 0, 0, h * 1.42, -.32, -.02, tri(sp(th, 0)), 64); CY(g, 0, 0, h * 1.36, -.02, 0, tri(th.roof), 64);
      const pal = th.path, tuck = (pts) => pts.map((q) => ({ ...q, p: q.p.map((v, i) => v - q.n[i] * .012) }));
      const road = (pts, o = {}) => L.road(o.closed || o.goal ? pts : tuck(pts), { g: cube, pal, ...o });

      /* ---- lower storey ---- */
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
      const c2 = cornerPts(F, 2, 1.6, 3.38, -1.65); const E2 = road(c2.pts); P.E2 = E2;
      lift.loop.forks.push({ s: sAt(lift.loop, F[2].at(1.6, 0, .02)), dir: 1, to: E2, toK: 0, when: () => lift.z === 3.38, text: 'The deck is down at the road out' });

      // wall 3: a clockwise loop whose top runs on from the corner; a long beam on its top, stood up by a hard push,
      // is the way up to the second storey
      const L3w = road(wallLoopPts(F[3], -2.2, .4, 1.58, 3.38, .5, .02, true), { closed: true }); P.L3 = L3w;
      E2.joins = [{ k: 1, to: L3w, s: sAt(L3w, F[3].at(-1.65, 3.38, .02)) + .02, dir: 1 }];
      const beam = wallArm(L, { F: F[3], parent: cube, pivot: [-1.2, 3.38], len: 4.8, stops: [75, 105], start: 105, at: [1.5, 1.1], key: 'b', name: 'Beam (push hard)', hardPush: 86, latch: true, edgeText: 'The beam led nowhere from here, so the wheel dropped' }); P.beam = beam;
      L3w.forks.push({ s: sAt(L3w, F[3].at(-1.2, 3.38, .02)), dir: 1, to: beam.road, toK: 0, when: () => beam.at(75), text: 'The beam is up, so the wheel climbs it' });

      /* ---- upper storey ---- */
      // everything upstairs lives in its own group, hidden until the wheel heads up
      const upperG = new T.Group(); cube.add(upperG); const up = (pts, o = {}) => road(pts, { g: upperG, ...o });
      // wall 3, upstairs: on from the beam's tip, level off and round the corner
      const a75 = 75 * Math.PI / 180, tip3 = F[3].at(-1.2 + 4.8 * Math.cos(a75), 3.38 + 4.8 * Math.sin(a75), .02);
      const t3 = ftur(tip3, add(F[3].u.map((v) => v * Math.cos(a75)), Zup, Math.sin(a75)), F[3].n).turn(.6, 75);
      const zA = t3.st.p[2]; const s3 = roundEdge(t3, F, 3, -1.55); const U3 = up(t3.pts); P.U3 = U3;

      // wall 0, upstairs: a bridge with a sail. Stood up, it carries the wheel straight on up from the loop to a loop at the
      // top; laid flat again, its sail is a shelf standing out of the wall in front of the hole on the way down
      const A0 = up(wallLoopPts(F[0], -2.2, -.9, zA, zA + 1.2, .35, .02), { closed: true }); P.A0 = A0;
      U3.joins = [{ k: 1, to: A0, s: sAt(A0, F[0].at(-1.55, zA, .02)) + .02, dir: 1 }];
      const pz = zA + .85;   // the top of the loop's right side: the bridge, stood up, carries straight on
      const sail = wallArm(L, { F: F[0], parent: upperG, pivot: [-.9, pz], len: 1.7, stops: [0, 90], start: 0, at: [-1.55, zA + .6], key: 'y', name: 'Sail bridge', edgeText: 'The bridge went down under the wheel, so it dropped' }); P.sail = sail;
      // the sail, on the arm's right-hand side (in arm space: along u, across -z, out along n)
      const sg = sail.road.vo.host, sc = add(F[0].u.map((v) => v * .85), Zup, -.3);
      plate(sg, F[0].u, Zup, F[0].n, 1.3, .06, .95, sc, tri(th.mech, { fresh: true, side: true }));
      A0.forks.push({ s: sAt(A0, F[0].at(-.9, pz, .02)), dir: 1, to: sail.road, toK: 0, when: () => sail.at(90), text: 'The bridge stands up, so the wheel rides on up' });
      // from the bridge's top, right into a clockwise loop along the top of the wall
      const tq = ftur(F[0].at(-.9, pz + 1.7, .02), Zup, F[0].n).turn(.3, 90).fwd(1.1), T0 = up(tq.pts); P.T0 = T0;
      const qt = pz + 2.0, Q0 = up(wallLoopPts(F[0], .2, 1.9, qt - 1.2, qt, .35, .02, true), { closed: true }); P.Q0 = Q0;
      T0.joins = [{ k: 1, to: Q0, s: sAt(Q0, F[0].at(.6, qt, .02)) + .02, dir: 1 }];
      // the way down: off the loop's right side, past the bridge's tip, left under the sail (the hole), and round the corner low
      const xz = qt - .6, hz = pz - 1.0;
      const xa = ftur(F[0].at(1.9, xz, .02), Zup.map((v) => -v), F[0].n).fwd(xz - hz - .3).turn(.3, 90).fwd(.5), Xa = up(xa.pts); P.Xa = Xa;   // ends at u 1.1
      const xb = ftur(F[0].at(.7, hz, .02), F[0].u.map((v) => -v), F[0].n).fwd(.35).turn(.3, -90).fwd(.3).turn(.3, -90); const s4 = roundEdge(xb, F, 0, -1.55), Xb = up(xb.pts); P.Xb = Xb;
      const zB = xb.st.p[2];
      P.hole4 = liveGap(L, Xa, 1, Xb, 0, () => [sg], { text: 'Under the sail, so the hole was not there', edge: 'The hole was in plain sight' });
      Q0.forks.push({ s: sAt(Q0, F[0].at(1.9, xz, .02)), dir: 1, to: Xa, toK: 0, when: () => P.hole4.hidden(), text: 'The way down looks whole, so the wheel takes it' });

      // wall 1, upstairs: a tall loop and an arm on top of its right side; stood up, its tip meets a road on the roof, far behind it
      const F1l = up(wallLoopPts(F[1], -2.2, -.7, zB, zB + 3.2, .45, .02), { closed: true }); P.F1 = F1l;
      Xb.joins = [{ k: 1, to: F1l, s: sAt(F1l, F[1].at(-1.55, zB, .02)) + .02, dir: 1 }];
      const apz = zB + 3.2 - .45, alen = H + 1.0 - apz;
      const BS = .8, arm = wallArm(L, { F: F[1], parent: upperG, pivot: [-.7, apz], len: alen, block: BS, stops: [0, 90], start: 0, at: [-1.45, zB + .9], key: 'a', name: 'Tall arm', edgeText: 'The arm led nowhere from here, so the wheel dropped' }); P.arm = arm;
      F1l.forks.push({ s: sAt(F1l, F[1].at(-.7, apz, .02)), dir: 1, to: arm.road, toK: 0, when: () => arm.at(90), text: 'The arm stands up, so the wheel rides on up' });
      // the roof road, placed in the cube's own frame for the turn at which this wall faces you (five quarter turns)
      { const KF = 5, rot = (p, a) => [p[0] * Math.cos(a) - p[1] * Math.sin(a), p[0] * Math.sin(a) + p[1] * Math.cos(a), p[2]];
        // the arm's road ends on top of its block; that point, slid back along the line of sight onto the roof, is where the roof
        // road starts. A tile on the roof there is the block's top seen from here, so the road reads as going up the block's
        // face, over its edge and on across the top
        const sk = KF * Math.PI / 2, zt = apz + alen + .08, pA = add(F[1].at(-.7, zt, .008), F[1].n, -BS / 2);
        const k = zt - (H + .16), back = rot([1, 1, 1], -sk), r0 = pA.map((v, i) => v - k * back[i]), d0 = F[1].n.map((v) => -v);
        { const tc = add(r0, d0, 0), tile = new T.Mesh(UNIT, tri(th.roof)); tile.matrixAutoUpdate = false;
          tile.matrix.copy(boxMatrix(v3(F[1].u), v3(d0), v3(Zup), BS, BS, .012, V(tc[0], tc[1], H + .146))); upperG.add(tile); }
        const toC = [-r0[0], -r0[1]], left = d0[0] * toC[1] - d0[1] * toC[0] > 0;
        const rt = ftur(r0, d0, Zup).fwd(.8).turn(.7, left ? 90 : -90).fwd(.9);
        P.home = up(rt.pts, { goal: true });
        // a goal pavilion just past the end of the road: four slim piers, a slab and an accent dome; it reads from any side
        const e = rt.st.p, d = rt.st.d, sd = [-d[1], d[0], 0], pv = new T.Group(); upperG.add(pv); const pier = tri(th.roof), cap = tri(th.mech);
        const pc = add(e, d, .1), z0 = e[2] - .04, ph = 1.15;   // the road runs in under it
        for (const [a1, a2] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) { const c = add(add(pc, d, a1 * .42), sd, a2 * .42); CY(pv, c[0], c[1], .07, z0, z0 + ph, pier, 10); }
        B(pv, pc[0] - .58, pc[1] - .58, z0 + ph, pc[0] + .58, pc[1] + .58, z0 + ph + .12, pier);
        const dome = new T.Mesh(new T.SphereGeometry(.42, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), cap); dome.position.copy(V(pc[0], pc[1], z0 + ph + .12)); pv.add(dome);
        const fin = new T.Mesh(new T.ConeGeometry(.06, .3, 8), cap); fin.position.copy(V(pc[0], pc[1], z0 + ph + .66)); pv.add(fin); }

      // ornament, Monument Valley style: plain walls, a cornice line at each storey, and arched niches set only where no
      // road runs, so the eye reads the paths first. Roads are sampled in each wall's own coordinates to find the clear space.
      { const onWall = F.map(() => []);
        for (const r of L.roads) { if (r.g !== cube && r.g !== upperG) continue;
          for (const q of r.S) { const p3 = [q.p.x, q.p.z, q.p.y]; F.forEach((f, k) => { if (dot(p3, f.n) > h - .2) onWall[k].push([dot(p3, f.u), p3[2]]); }); } }
        const keep = [[disc, 0, [.6, 1.9], 1.4], [beam, 3, [-1.2, 3.38], 0], [sail, 0, [-.9, pz], 1.9], [arm, 1, [-.7, apz], 0]];
        for (const [, k, c, rr] of keep) if (rr) for (let a = 0; a < 360; a += 20) onWall[k].push([c[0] + rr * Math.cos(a * Math.PI / 180), c[1] + rr * Math.sin(a * Math.PI / 180)]);
        onWall[1].push([1.45, 4.95], [.5, 4.95], [2.4, 4.95]);   // the awning's hinge line
        F.forEach((f, k) => {
          const clear = (u, z, rad) => onWall[k].every(([a, b]) => Math.hypot(a - u, b - z) > rad);
          wallArt(L, cube, { centre: f.at(0, H / 2, 0), u: f.u, up: Zup, n: f.n, w: 2 * h - 2 * R2 - .1, h: H, style: 'niches', seed: 11 + k, clear, storey: STOREY,
            pal: { light: th.trim || '#FFFFFF', dark: th.ink, accent: th.mech.l } }); }); }
      wallArt(L, cube, { centre: [0, 0, H + .14], u: [1, 0, 0], up: [0, 1, 0], n: [0, 0, 1], w: 2 * h + .2, h: 2 * h + .2, style: 'panel', seed: 5, pal: { light: th.trim || '#FFFFFF', dark: th.ink, accent: th.mech.l } });

      // turning the box: as the wheel passes each edge, the next wall swings round to face you. Going upstairs, the tower
      // sinks into its plinth so the storey you are on stays in view; until then the upper storey fades into the sky
      const turn = { k: 0, from: 0, to: 0, t: 1 }; P.turn = turn; P.up = false; P.sink = 0;
      const edges = [[E0, c0.sEdge], [E1, c1.sEdge], [E2, c2.sEdge], [U3, s3], [Xb, s4]];
      const machinesAt = [[disc], [aw], [], [beam], [sail], [arm]];
      for (const [k, ms] of machinesAt.entries()) for (const m of ms) m.m.live = () => turn.k === k && turn.t >= 1;
      const haze = document.createElement('div'), skyTop = (th.sky.match(/#[0-9A-Fa-f]{6}/) || ['#BFE8F0'])[0];
      Object.assign(haze.style, { position: 'absolute', left: '0', top: '0', width: '100%', height: '17%', pointerEvents: 'none', background: `linear-gradient(180deg, ${skyTop} 0%, ${skyTop} 30%, ${skyTop}00 100%)` });
      $scope.dom?.badges?.appendChild(haze); P.haze = haze;
      // the upper storey's roads and machines appear only once you head up, so downstairs shows only the puzzles in play
      let upperShown = true;
      let hintK = 0;
      L.view.updaters.push((t, dt) => {
        const W = L.W;
        if (W && W.mode === 'road') {
          edges.forEach(([E, sE], i) => { if (W.road === E && W.s > sE - .4 && turn.k === i) { turn.k = i + 1; turn.from = cube.rotation.y; turn.to = -(i + 1) * Math.PI / 2; turn.t = 0; } });
          if (W.road === beam.road || W.road === U3) P.up = true;
        }
        if (turn.t < 1) { turn.t = Math.min(1, turn.t + dt / 1.6); const e = turn.t < .5 ? 4 * turn.t ** 3 : 1 - Math.pow(-2 * turn.t + 2, 3) / 2; cube.rotation.y = turn.from + (turn.to - turn.from) * e; }
        const st = P.up ? STOREY : 0; if (P.sink !== st) { P.sink += clamp(st - P.sink, -dt * 2.2, dt * 2.2); cube.position.y = -P.sink; }
        haze.style.opacity = (1 - P.sink / STOREY).toFixed(3);
        const show = P.sink > .5; if (show !== upperShown) { upperShown = show; upperG.visible = show; }
        for (const m of L.machines) if (m.bd) m.bd.style.visibility = !m.live || m.live() ? 'visible' : 'hidden';
        if (turn.k !== hintK && $scope.dom) { hintK = turn.k; $scope.dom.ui.hint.innerHTML = CUBE_HINTS[hintK]; }
        L.say([`wall ${turn.k + 1} of 6`,
          turn.k === 0 ? `turntable ${disc.at(0) ? 'out to the corner' : disc.at(179) ? 'folded into the loop' : 'moving'}` :
          turn.k === 1 ? `awning ${aw.out() ? 'out' : 'folded'} · hole ${P.hole1.hidden() ? 'hidden' : 'in sight'}` :
          turn.k === 2 ? `cadence ${Math.round(rider.cad)} rpm · deck ${lift.z === 4.5 ? 'at the loop' : lift.z === 3.38 ? 'at the road out' : 'moving'}` :
          turn.k === 3 ? (P.up ? 'upstairs' : `beam ${beam.at(75) ? 'up' : beam.at(105) ? 'leaning back' : 'moving'}${rider.cad < 86 ? ' · push harder to move it' : ''}`) :
          turn.k === 4 ? `bridge ${sail.at(90) ? 'standing' : sail.at(0) ? 'flat' : 'moving'} · hole ${P.hole4.hidden() ? 'hidden' : 'in sight'}` :
          `arm ${arm.at(90) ? 'standing' : arm.at(0) ? 'flat' : 'moving'}`].join(' · '));
      });
      // a fall sends the wheel back to the loop on the wall it fell from, not to the start
      P.checkpoint = () => {
        const r = [null, L1, L2, L3w, A0, F1l][turn.k];
        if (turn.k === 3) P.up = false;
        return r ? { road: r, s: .5, dir: 1 } : null;
      };
    },
    spawn: (L) => ({ road: L.props.L0, s: 1, dir: 1 }),
    checkpoint: (L) => L.props.checkpoint(),
    solve(L, W, R) {
      const P = L.props, k = P.turn.k; R.gear = 4; R.cad = 80;
      P.disc.m.set(k === 0 && !P.disc.at(0));
      P.aw.m.set(k === 1 && !P.aw.out());
      if (k === 2) R.cad = W.road === P.lift.loop ? 50 : 90;
      P.beam.m.set(k === 3 && !P.up && !P.beam.at(75)); if (k === 3 && !P.up) R.cad = 95;
      // the bridge: stood up while the wheel waits on the low loop, laid flat again once it is on the top loop
      const across = W.road === P.T0 || W.road === P.Q0 || W.road === P.Xa;
      P.sail.m.set(k === 4 && (across ? !P.sail.at(0) : !P.sail.at(90)));
      P.arm.m.set(k === 5 && !P.arm.at(90));
    },
    center: [0, 0, 3.4], pts: [[3, -3, 0], [3, 3, 0], [-3, 3, 0], [-3, -3, 0], [3, -3, 8.4], [-3, 3, 6.2], [3, 3, 8.4], [0, 0, -3]], pad: .9,
    decor(L) {
      cloudLayer(L.view, L.th, '#FFFFFF', 5, .8, .55, .95, .18);
      // frame one storey (the core frames every road, which would take in both storeys at once); the tower sinks instead
      const def = L.def, c = V(...def.center), b = [1e9, -1e9, 1e9, -1e9];
      for (const q of def.pts) { const d = V(...q).sub(c), sx = d.dot(SR), sy = d.dot(SU); b[0] = Math.min(b[0], sx); b[1] = Math.max(b[1], sx); b[2] = Math.min(b[2], sy); b[3] = Math.max(b[3], sy); }
      b[3] += .9; L.view.frame(def.center, b, def.pad); L.view.yawFrames = null;
    },
    scenery: false },
];

Object.assign($scope, { wallFrame, wallLoopPts, aimInWall, wallArm, awning, liveGap, wallLift, CUBES });
}
