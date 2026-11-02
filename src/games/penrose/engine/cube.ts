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
/** Red and white edge stripes along the outer edge of a plate, so it reads as a made thing. */
function stripes(parent, a, b, n, la, depth, centre, col) {
  for (let k = 0; k < 4; k++) { const c = add(add(centre, a, -la / 2 + la / 8 + k * la / 4), n, depth - .07);
    const s = new T.Mesh(UNIT, basic(k % 2 ? '#FFFFFF' : col)); s.matrixAutoUpdate = false; s.matrix.copy(boxMatrix(v3(a), v3(b), v3(n), la / 4 - .02, .1, .14, V(...c))); parent.add(s); }
}

const CUBE_HINTS = [
  'Seven puzzles round a box of two storeys, and the box turns to follow you. <b>First wall:</b> swing the wall turntable (<b>Y</b>) level and the loop leads off round the corner.',
  '<b>Second wall:</b> the road ahead has a hole. Swing the awning out (<b>A</b>): from here the hole is hidden behind it, so it is not there.',
  '<b>Third wall:</b> no button. Spin up (about 85 rpm) to lift the deck level with the loop, ride on, then ease off (about 55) to let it down to the road out.',
  '<b>Fourth wall:</b> hold <b>B</b> and push hard (86 rpm or more) to stand the beam up. It is the way up to the second storey.',
  '<b>Upstairs.</b> The bridge (<b>Y</b>) has two jobs. Lower it and cross to the loop on the right. Then raise it again: standing up, its sail hides the hole in the climb, so the hole is not there. Raise it while you are on it and you drop.',
  'Spin up to bring the deck level with the loop and ride on, then ease right off (under 60) to set it down at the road out. <b>Keep it low</b>: its balcony is what hides the hole you pass under.',
  '<b>Last wall.</b> Swing the long arm (<b>A</b>) up. From here its tip meets the road on the roof, which lies far behind it.',
];

const CUBES = [
  { id: 'x-cube', name: 'The Cube', th: () => THEMES[2], cruise: [70, 92],
    hint: CUBE_HINTS[0],
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
      // wall art: a different pattern on each wall, storey and the roof
      const low = ['tiles', 'arcade', 'mosaic', 'chevron'], high = ['mosaic', 'chevron', 'tiles', 'arcade'], aw2 = 2 * h - 2 * R2 - .1;
      F.forEach((f, k) => { wallArt(L, cube, { centre: f.at(0, STOREY / 2, 0), u: f.u, up: Zup, n: f.n, w: aw2, h: STOREY - .2, style: low[k], seed: 11 + k });
        wallArt(L, cube, { centre: f.at(0, (STOREY + H) / 2, 0), u: f.u, up: Zup, n: f.n, w: aw2, h: H - STOREY - .2, style: high[k], seed: 31 + k }); });
      wallArt(L, cube, { centre: [0, 0, H + .14], u: [1, 0, 0], up: [0, 1, 0], n: [0, 0, 1], w: 2 * h, h: 2 * h, style: 'meander', seed: 5 });
      const pal = tone('#F2D49B'), road = (pts, o = {}) => L.road(pts, { g: cube, pal, ...o });

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
      const beam = wallArm(L, { F: F[3], parent: cube, pivot: [-1.2, 3.38], len: 4.8, stops: [75, 115], start: 115, at: [1.5, 1.1], key: 'b', name: 'Beam (push hard)', hardPush: 86, latch: true, edgeText: 'The beam led nowhere from here, so the wheel dropped' }); P.beam = beam;
      L3w.forks.push({ s: sAt(L3w, F[3].at(-1.2, 3.38, .02)), dir: 1, to: beam.road, toK: 0, when: () => beam.at(75), text: 'The beam is up, so the wheel climbs it' });

      /* ---- upper storey ---- */
      // wall 3, upstairs: on from the beam's tip, level off and round the corner
      const a75 = 75 * Math.PI / 180, tip3 = F[3].at(-1.2 + 4.8 * Math.cos(a75), 3.38 + 4.8 * Math.sin(a75), .02);
      const t3 = ftur(tip3, add(F[3].u.map((v) => v * Math.cos(a75)), Zup, Math.sin(a75)), F[3].n).turn(.6, 75);
      const zA = t3.st.p[2]; const s3 = roundEdge(t3, F, 3, -1.55); const U3 = road(t3.pts); P.U3 = U3;

      // wall 0, upstairs: a bridge with a sail. Lowered, it carries the wheel across to the right-hand loop; stood up again,
      // its sail stands out from the wall in front of the hole in the climb
      const A0 = road(wallLoopPts(F[0], -2.2, -.9, zA, zA + 1.6, .4, .02), { closed: true }); P.A0 = A0;
      U3.joins = [{ k: 1, to: A0, s: sAt(A0, F[0].at(-1.55, zA, .02)) + .02, dir: 1 }];
      const pz = zA + .8;
      const sail = wallArm(L, { F: F[0], parent: cube, pivot: [-.9, pz], len: 2.0, stops: [0, 90], start: 90, at: [-1.55, zA + 2.15], key: 'y', name: 'Sail bridge', edgeText: 'The bridge swung up under the wheel, so it dropped' }); P.sail = sail;
      // the sail: on the arm's right-hand side, standing out of the wall (in arm space: along u, across -z, out along n)
      const sailM = tri(th.roof || th.mech, { fresh: true, side: true }), sg = sail.road.vo.host, sc = add(F[0].u.map((v) => v * 1.0), Zup, -.3);
      plate(sg, F[0].u, Zup, F[0].n, 2.0, .06, .95, sc, sailM); stripes(sg, F[0].u, Zup, F[0].n, 2.0, .95, sc, th.goal || '#E8553B');
      A0.forks.push({ s: sAt(A0, F[0].at(-.9, pz, .02)), dir: 1, to: sail.road, toK: 0, when: () => sail.at(0), text: 'The bridge is down, so the wheel crosses' });
      // from the bridge's tip, down into a loop on the right
      const tq = ftur(F[0].at(1.1, pz, .02), F[0].u, F[0].n).fwd(.25).turn(.3, 90).fwd(pz - .3 - (zA - 1.0)), T0 = road(tq.pts); P.T0 = T0;
      const qz0 = zA - 1.9, Q0 = road(wallLoopPts(F[0], .08, 1.65, qz0, zA - .7, .3, .02, true), { closed: true }); P.Q0 = Q0;
      T0.joins = [{ k: 1, to: Q0, s: sAt(Q0, tq.st.p) + .02, dir: 1 }];
      // the climb: up the loop's left side, through the hole, then right along the top and round the corner
      const xs = F[0].at(.08, qz0 + .45, .02), hz0 = pz + .35, hz1 = pz + .85;
      const Xa = road(L3(xs, F[0].at(.08, hz0, .02), F[0].n)); P.Xa = Xa;
      const xb = ftur(F[0].at(.08, hz1, .02), Zup, F[0].n).fwd(zA + 1.95 - hz1).turn(.4, 90); const s4 = roundEdge(xb, F, 0, -1.75), Xb = road(xb.pts); P.Xb = Xb;
      const zB = xb.st.p[2];
      P.hole4 = liveGap(L, Xa, 1, Xb, 0, () => [sail.road.vo.host], { text: 'Behind the sail, so the hole was not there', edge: 'The hole was in plain sight' });
      Q0.forks.push({ s: sAt(Q0, F[0].at(.08, qz0 + .45, .02)), dir: 1, to: Xa, toK: 0, when: () => P.hole4.hidden(), text: 'The climb looks whole, so the wheel takes it' });

      // wall 1, upstairs: a loop at the top and a lift whose deck has a balcony. Down at the road out, the balcony stands
      // in front of the hole the road passes under, so the deck has to stay down until you are past
      const H1 = road(wallLoopPts(F[1], -2.2, -1.0, zB, Math.min(zB + 1.1, H - .35), .35, .02), { closed: true }); P.H1 = H1;
      Xb.joins = [{ k: 1, to: H1, s: sAt(H1, F[1].at(-1.75, zB, .02)) + .02, dir: 1 }];
      const lo1 = zB - 1.9, lift1 = wallLift(L, { F: F[1], parent: cube, u: [-.5, .7], h: 1.0, lo: lo1, hi: zB }); P.lift1 = lift1;
      plate(lift1.lg, F[1].u, Zup, F[1].n, 1.7, .08, 1.3, F[1].at(.1, -.25, 0), tri(th.roof || th.mech, { fresh: true }));
      stripes(lift1.lg, F[1].u, Zup, F[1].n, 1.7, 1.3, F[1].at(.1, -.25, 0), th.goal || '#E8553B');
      const C1 = road(L3(F[1].at(-1.4, zB, .02), F[1].at(.1, zB, .02), F[1].n), { edgeText: 'The deck was not there, so the wheel dropped' }); P.C1 = C1;
      H1.forks.push({ s: sAt(H1, F[1].at(-1.4, zB, .02)), dir: 1, to: C1, toK: 0, when: () => lift1.z === zB && !lift1.moving, text: 'The deck is level with the loop' });
      C1.forks.push({ s: C1.L - .06, dir: 1, to: lift1.loop, toK: 0, when: () => lift1.z === zB, text: 'Onto the lift deck' });
      const ra = ftur(F[1].at(.3, lo1, .02), F[1].u, F[1].n).fwd(.9).turn(.3, 90).fwd(.4).turn(.3, 90).fwd(.45), R1a = road(ra.pts); P.R1a = R1a;   // ends at u .75
      const rb = ftur(F[1].at(.35, lo1 - 1.0, .02), F[1].u.map((v) => -v), F[1].n).fwd(1.55).turn(.3, -90).fwd(.2).turn(.3, -90); const s5 = roundEdge(rb, F, 1, -1.6), R1b = road(rb.pts); P.R1b = R1b;
      const zC = rb.st.p[2];
      lift1.loop.forks.push({ s: sAt(lift1.loop, F[1].at(.3, 0, .02)), dir: 1, to: R1a, toK: 0, when: () => lift1.z === lo1, text: 'The deck is down at the road out' });
      P.hole5 = liveGap(L, R1a, 1, R1b, 0, () => [lift1.lg], { text: 'Under the balcony, so the hole was not there', edge: 'The deck rose, and the hole came into sight' });

      // wall 2, upstairs: a loop and a long arm; swung up, its tip meets a road on the roof, far behind it
      const F2l = road(wallLoopPts(F[2], -2.2, -.6, zC, zC + 2.0, .45, .02), { closed: true }); P.F2 = F2l;
      R1b.joins = [{ k: 1, to: F2l, s: sAt(F2l, F[2].at(-1.6, zC, .02)) + .02, dir: 1 }];
      const apz = zC + 1.4, alen = 4.8;
      const arm = wallArm(L, { F: F[2], parent: cube, pivot: [-.6, apz], len: alen, stops: [75, 115], start: 115, at: [1.2, zC + .3], key: 'a', name: 'Long arm', edgeText: 'The arm led nowhere from here, so the wheel dropped' }); P.arm = arm;
      F2l.forks.push({ s: sAt(F2l, F[2].at(-.6, apz, .02)), dir: 1, to: arm.road, toK: 0, when: () => arm.at(75), text: 'The arm is up, so the wheel climbs it' });
      // the roof road, placed in the cube's own frame for the turn at which wall 2 faces you (six quarter turns)
      { const KF = 6, rot = (p, a) => [p[0] * Math.cos(a) - p[1] * Math.sin(a), p[0] * Math.sin(a) + p[1] * Math.cos(a), p[2]];
        const sk = KF * Math.PI / 2, tipL = F[2].at(-.6 + alen * Math.cos(a75), apz + alen * Math.sin(a75), .02), tipW = rot(tipL, sk);
        const k = tipW[2] - (H + .16), RW = [tipW[0] - k, tipW[1] - k, H + .16];
        const scr = (d) => [(d[0] - d[1]) * .7071, (2 * d[2] - d[0] - d[1]) * .4082];
        const dTip = rot(add(F[2].u.map((v) => v * Math.cos(a75)), Zup, Math.sin(a75)), sk), sT = scr(dTip), nT = Math.hypot(...sT);
        let best = 0, bd = -2; for (let i = 0; i < 360; i++) { const f = i * Math.PI / 180, s = scr([Math.cos(f), Math.sin(f), 0]), nn = Math.hypot(...s), c = (s[0] * sT[0] + s[1] * sT[1]) / (nn * nT); if (c > bd) { bd = c; best = f; } }
        const r0 = rot(RW, -sk), d0 = rot([Math.cos(best), Math.sin(best), 0], -sk);
        // run a little way on, then bend toward the middle of the roof and stop short of it
        const toC = [-r0[0], -r0[1]], left = d0[0] * toC[1] - d0[1] * toC[0] > 0;
        const rt = ftur(r0, d0, Zup).fwd(.7).turn(.7, left ? 90 : -90).fwd(.9);
        P.home = road(rt.pts, { goal: true }); }

      // turning the box: as the wheel passes each edge, the next wall swings round to face you; the beam takes the camera upstairs
      const turn = { k: 0, from: 0, to: 0, t: 1 }; P.turn = turn; P.up = false; P.camZ = 0;
      const edges = [[E0, c0.sEdge], [E1, c1.sEdge], [E2, c2.sEdge], [U3, s3], [Xb, s4], [R1b, s5]];
      const machinesAt = [[disc], [aw], [], [beam], [sail], [], [arm]];
      for (const [k, ms] of machinesAt.entries()) for (const m of ms) m.m.live = () => turn.k === k && turn.t >= 1;
      let hintK = 0;
      L.view.updaters.push((t, dt) => {
        const W = L.W;
        if (W && W.mode === 'road') {
          edges.forEach(([E, sE], i) => { if (W.road === E && W.s > sE - .4 && turn.k === i) { turn.k = i + 1; turn.from = cube.rotation.y; turn.to = -(i + 1) * Math.PI / 2; turn.t = 0; } });
          if (W.road === beam.road || W.road === U3) P.up = true;
        }
        if (turn.t < 1) { turn.t = Math.min(1, turn.t + dt / 1.6); const e = turn.t < .5 ? 4 * turn.t ** 3 : 1 - Math.pow(-2 * turn.t + 2, 3) / 2; cube.rotation.y = turn.from + (turn.to - turn.from) * e; }
        // the camera rides up with the wheel to the second storey
        const zt = P.up ? STOREY + .2 : 0; if (P.camZ !== zt) { P.camZ += clamp(zt - P.camZ, -dt * 2.6, dt * 2.6); L.view.center.y = P.cz0 + P.camZ; }
        // only the wall facing you shows its machines' tap targets
        for (const m of L.machines) if (m.bd) m.bd.style.visibility = !m.live || m.live() ? 'visible' : 'hidden';
        if (turn.k !== hintK && $scope.dom) { hintK = turn.k; $scope.dom.ui.hint.innerHTML = CUBE_HINTS[hintK]; }
        L.say([`wall ${turn.k + 1} of 7`,
          turn.k === 0 ? `turntable ${disc.at(0) ? 'out to the corner' : disc.at(179) ? 'folded into the loop' : 'moving'}` :
          turn.k === 1 ? `awning ${aw.out() ? 'out' : 'folded'} · hole ${P.hole1.hidden() ? 'hidden' : 'in sight'}` :
          turn.k === 2 ? `cadence ${Math.round(rider.cad)} rpm · deck ${lift.z === 4.5 ? 'at the loop' : lift.z === 3.38 ? 'at the road out' : 'moving'}` :
          turn.k === 3 ? (P.up ? 'upstairs' : `beam ${beam.at(75) ? 'up' : beam.at(115) ? 'leaning back' : 'moving'}${rider.cad < 86 ? ' · push harder to move it' : ''}`) :
          turn.k === 4 ? `bridge ${sail.at(0) ? 'down' : sail.at(90) ? 'up' : 'moving'} · hole ${P.hole4.hidden() ? 'hidden' : 'in sight'}` :
          turn.k === 5 ? `cadence ${Math.round(rider.cad)} rpm · deck ${lift1.z === zB ? 'at the loop' : lift1.z === lo1 ? 'at the road out' : 'moving'} · hole ${P.hole5.hidden() ? 'hidden' : 'in sight'}` :
          `arm ${arm.at(75) ? 'up' : arm.at(115) ? 'leaning back' : 'moving'}`].join(' · '));
      });
      // a fall sends the wheel back to the loop on the wall it fell from, not to the start
      P.checkpoint = () => {
        const r = [null, L1, L2, L3w, A0, H1, F2l][turn.k];
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
      // the bridge: down while the wheel waits on the left loop, up again once it is across
      const across = W.road === P.T0 || W.road === P.Q0 || W.road === P.Xa;
      P.sail.m.set(k === 4 && (across ? !P.sail.at(90) : !P.sail.at(0)));
      if (k === 5) R.cad = W.road === P.H1 || W.road === P.C1 ? 90 : 45;
      P.arm.m.set(k === 6 && !P.arm.at(75));
    },
    center: [0, 0, 3.4], pts: [[3, -3, 0], [3, 3, 0], [-3, 3, 0], [-3, -3, 0], [3, -3, 8.4], [-3, 3, 6.2], [3, 3, 8.4], [0, 0, -3]], pad: .9,
    decor(L) {
      cloudLayer(L.view, L.th, '#FFFFFF', 5, .8, .55, .95, .18);
      // frame one storey at a time (the core frames every road, which would take in both storeys at once)
      const def = L.def, c = V(...def.center), b = [1e9, -1e9, 1e9, -1e9];
      for (const q of def.pts) { const d = V(...q).sub(c), sx = d.dot(SR), sy = d.dot(SU); b[0] = Math.min(b[0], sx); b[1] = Math.max(b[1], sx); b[2] = Math.min(b[2], sy); b[3] = Math.max(b[3], sy); }
      b[3] += .9; L.view.frame(def.center, b, def.pad); L.view.yawFrames = null; L.props.cz0 = L.view.center.y;
    },
    scenery: false },
];

Object.assign($scope, { wallFrame, wallLoopPts, aimInWall, wallArm, awning, liveGap, wallLift, CUBES });
}
