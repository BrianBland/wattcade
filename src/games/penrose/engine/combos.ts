// @ts-nocheck
/* Penrose Pedals engine: Combined levels (camera, impossible stairs, lifts) and sceneryPass, which dresses every level without hiding a road.
 * Installed into the shared engine scope in order (see ./index.ts); names come in from $scope and go back out to it. */
import * as T from 'three';

export function install($scope) {
const { B, CY, L3, R3, Road, SD, SR, SU, TAU, TEX, THEMES, UNIT, UP, V, archGeo, at, basic, behind, cameraCrank, clamp, cloudLayer, drift, filletPath, hiddenGap, lerp, loopPts, loopSlab, mixPal, mulberry, onFace, ribbon, rider, rnd, sAt, setTri, sp, tone, tri, turtle, viewDir } = $scope;

/* ================= combined levels: camera turns, impossible stairs, holes that exist only while seen ================= */
// cut a list of samples ({p, n}) into [0, a] and [b, end] by arc length, leaving a hole between a and b
function cutSamples(S, a, b) {
  const d = (u, v) => Math.hypot(u[0] - v[0], u[1] - v[1], u[2] - v[2]), lerp = (u, v, f) => u.map((x, i) => x + (v[i] - x) * f);
  const A = [S[0]], Bs = []; let c = 0;
  for (let i = 1; i < S.length; i++) { const l = d(S[i - 1].p, S[i].p), c1 = c + l;
    if (c < a && c1 >= a) A.push({ p: lerp(S[i - 1].p, S[i].p, (a - c) / l), n: S[i].n }); else if (c1 < a) A.push(S[i]);
    if (c < b && c1 >= b) Bs.push({ p: lerp(S[i - 1].p, S[i].p, (b - c) / l), n: S[i].n }); if (c1 > b) Bs.push(S[i]);
    c = c1; }
  return [A, Bs];
}
// a staircase that climbs round four legs (north first when sgn is 1, south first when -1) and ends at start + rise * viewDir(yaw):
// closed on screen at that yaw only
function stairPts(S, yaw, rise, A, B, e, sgn = 1) {
  const vd = viewDir(yaw), C = A + e - vd[0] * rise, D = B - sgn * vd[1] * rise;
  const xs = [[0, 0], [A, 0], [A, sgn * B], [A - C, sgn * B], [A - C, sgn * (B - D)], [A - C + e, sgn * (B - D)]].map(q => [S[0] + q[0], S[1] + q[1]]);
  let tot = 0; const cum = [0]; for (let i = 1; i < xs.length; i++) { tot += Math.hypot(xs[i][0] - xs[i - 1][0], xs[i][1] - xs[i - 1][1]); cum.push(tot); }
  const pts = xs.map((q, i) => [q[0], q[1], S[2] + rise * cum[i] / tot]);
  return { samples: filletPath(pts, .7), end: pts[pts.length - 1], pts };
}
// a stone tower with arched windows, x0..x1 by y0..y1, from deep below up to z1
function tower(L, x0, y0, x1, y1, z1, pal) {
  const th = L.th, m = tri(pal || sp(th, 0)), tg = new T.Group(); L.g.add(tg); B(tg, x0, y0, z1 - 9, x1, y1, z1, m); B(tg, x0 - .12, y0 - .12, z1, x1 + .12, y1 + .12, z1 + .18, tri(th.mechDark || th.idle));
  for (let z = z1 - 1.2; z > z1 - 5; z -= 1.5) { onFace(tg, 'x', x1, (y0 + y1) / 2, z - .4, archGeo(.3, .62), basic(th.win ? th.win.r : th.mech)); onFace(tg, 'y', y1, (x0 + x1) / 2, z - .4, archGeo(.3, .62), basic(th.win ? th.win.l : th.mech)); }
  return tg;
}
// --- placing scenery so the player always sees the track: a box (three.js coords [x0, y0, z0, x1, y1, z1]) is scored by
// how many road samples it would stand in front of, from each camera angle, or run through
const Yax3 = new T.Vector3(0, 1, 0), toCam = deg => SD.clone().applyAxisAngle(Yax3, deg * Math.PI / 180);
function boxMesh(b) { const m = new T.Mesh(UNIT); m.scale.set(b[3] - b[0], b[4] - b[1], b[5] - b[2]); m.position.set((b[0] + b[3]) / 2, (b[1] + b[4]) / 2, (b[2] + b[5]) / 2); m.updateMatrixWorld(true); return m; }
function coverCount(L, b, yaws, skip = () => false, roads = L.roads) {
  const m = boxMesh(b), ray = new T.Raycaster(); let n = 0;
  for (const r of roads) for (let s = 0; s <= r.L; s += .4) { const p = r.at(s).p; if (skip(p)) continue;
    if (p.x > b[0] - .7 && p.x < b[3] + .7 && p.z > b[2] - .7 && p.z < b[5] + .7 && p.y > b[1] - .8 && p.y < b[4] + .8) { n += 50; continue; }
    const wgt = r.closed || (s > 2.5 && s < r.L - 2.5) ? 1 : 5;
    for (const y of yaws) { const d = toCam(y); ray.set(p.clone().addScaledVector(d, 100), d.clone().negate()); const h = ray.intersectObject(m, false); if (h.length && h[0].distance < 99.8) n += wgt; } }
  return n;
}
// does a box hide every point of the hole between two road ends from this angle?
function hidesGap(b, pa, pb, yaw) { const m = Array.isArray(b) && typeof b[0] !== 'number' ? b : [boxMesh(b)], ray = new T.Raycaster(), d = toCam(yaw);
  for (let i = 0; i <= 8; i++) { const p = pa.clone().lerp(pb, i / 8); p.y -= .1; ray.set(p.clone().addScaledVector(d, 150), d.clone().negate()); const h = ray.intersectObjects(m, false); if (!h.length || h[0].distance > 149.7) return false; }
  return true; }
// spots along a path (arc length a, hole of length len) that the given meshes hide from yawHide but not from the other angles
function hiddenSpots(samples, meshes, yawHide, others, len = 1.2, from = 1, upto = 1e9) {
  const r = new Road(samples), out = [];
  for (let a = from; a + len < Math.min(r.L - 2, upto); a += .2) { const pa = r.at(a).p, pb = r.at(a + len).p; if (hidesGap(meshes, pa, pb, yawHide) && !others.some(y => hidesGap(meshes, pa, pb, y))) out.push(a); }
  return out;
}
const ghostDeck = samples => { const m = ribbon(new Road(samples), 1, .5, tri({ t: '#fff', l: '#fff', r: '#fff' })); m.updateMatrixWorld(true); return m; };
// a tower that hides the hole from yawHide and not from the other angles, covering as little track as it can
function towerFor(L, A, kA, Bk, kB, yawHide, yawsAll, o = {}) {
  const pa = A.end(kA).p.clone(), pb = Bk.end(kB).p.clone(), mid = pa.clone().lerp(pb, .5), d = toCam(yawHide), others = yawsAll.filter(y => y !== yawHide);
  const nearGap = p => p.distanceTo(mid) < 1.6; let best = null;
  for (let t = 1.2; t <= 7; t += .3) for (const hw of [.55, .7, .85, 1.05]) for (const up of [.5, .9, 1.4]) for (const dep of [2.6, 4, 6]) {
    const c = mid.clone().addScaledVector(d, t), top = c.y + up, b = [c.x - hw, top - dep, c.z - hw, c.x + hw, top, c.z + hw];
    if (!hidesGap(b, pa, pb, yawHide) || others.some(y => hidesGap(b, pa, pb, y))) continue;
    const n = coverCount(L, b, yawsAll, nearGap) + t * .3 - dep * .4; if (!best || n < best.n) best = { b, n }; }
  if (!best) throw new Error('no tower hides this hole');
  return best;
}
// the stretch of a path, and the tower in front of it, that hides a hole from yawHide only while covering the least track
function holeAndTower(L, samples, allSamples, yawHide, yaws, o = {}) {
  const roads = allSamples.map(x => new Road(x)), r = new Road(samples), d = toCam(yawHide), others = yaws.filter(y => y !== yawHide); let best = null;
  for (let a = o.from || 1; a + 1.2 < r.L - (o.tail || 6); a += .8) { const pa = r.at(a).p, pb = r.at(a + 1.2).p, mid = pa.clone().lerp(pb, .5), nearGap = p => p.distanceTo(mid) < 1.6;
    for (let t = 1.5; t <= 7; t += .5) for (const hw of [.6, .8]) for (const up of [.6, 1.2]) for (const dep of [2.6, 4.2]) {
      const c = mid.clone().addScaledVector(d, t), top = c.y + up, b = [c.x - hw, top - dep, c.z - hw, c.x + hw, top, c.z + hw];
      if (!hidesGap(b, pa, pb, yawHide) || others.some(y => hidesGap(b, pa, pb, y))) continue;
      const n = coverCount(L, b, yaws, nearGap, roads) + t * .2; if (!best || n < best.n) best = { a, b, n }; } }
  if (!best) throw new Error('no hole can hide behind a tower here');
  return best;
}
// a stone tower with a cap and arched windows from a three.js box
function towerMesh(L, b, pal) {
  const th = L.th, tg = new T.Group(); L.g.add(tg); const m = new T.Mesh(UNIT, tri(pal || sp(th, 0))); m.scale.set(b[3] - b[0], b[4] - b[1], b[5] - b[2]); m.position.set((b[0] + b[3]) / 2, (b[1] + b[4]) / 2, (b[2] + b[5]) / 2); tg.add(m);
  const cap = new T.Mesh(UNIT, tri(th.mechDark || th.idle)); cap.scale.set(b[3] - b[0] + .24, .18, b[5] - b[2] + .24); cap.position.set((b[0] + b[3]) / 2, b[4] + .09, (b[2] + b[5]) / 2); tg.add(cap);
  for (let y = b[4] - 1.1; y > b[1] + .8; y -= 1.5) { onFace(tg, 'x', b[3], (b[2] + b[5]) / 2, y - .4, archGeo(.3, .62), basic(th.win ? th.win.r : th.mech)); onFace(tg, 'y', b[5], (b[0] + b[3]) / 2, y - .4, archGeo(.3, .62), basic(th.win ? th.win.l : th.mech)); }
  return tg;
}
// the clearest spot for a machine pedestal among candidates (sketch [x, y, z])
function clearSpot(L, cands, yaws, r = .7) { let best = null; for (const c of cands) { const b = [c[0] - r, c[2] - 3, c[1] - r, c[0] + r, c[2] + .3, c[1] + r], n = coverCount(L, b, yaws); if (!best || n < best.n) best = { c, n }; } return best.c; }
const CSTUDIES = [
  { id: 'c-towers', name: 'Turn past the tower', th: () => THEMES[0], cruise: [72, 92], yaws: [0, 90],
    baked: [{"a":2.6,"b":[3.452,-0.833,0.266,4.652,1.767,1.466]},{"a":1.8,"b":[3.653,-3.885,5.534,4.853,-1.285,6.734]}],
    hint: 'Two endless staircases, and each one has a hole in its first flight. A hole you cannot see is not there: from the angle that closes a staircase, a tower stands in front of its hole, so the wheel laps safely. Turning the camera (<b>Y</b>) splits the staircase open onto the next one, but it also brings the hole into view. So wait until the wheel is past the tower, then turn.',
    build(L) {
      const P = L.props, peach = tone('#F4C3A8'), c = L.def.layout || { A0: 5, B0: 4, s0g: -1, k: 5, Lx: 4, A1: 4, B1: 4, s1g: 1, kh: -5 }, YB = 90;
      // lay everything out first, then choose the stretch of each staircase whose hole a tower can hide from its closing angle only
      const S0 = stairPts([0, 0, 0], 0, 2, c.A0, c.B0, 1.6, c.s0g), X0 = behind(S0.end, YB, c.k), X1 = [X0[0] + c.Lx, X0[1], X0[2]], S1 = stairPts(X1, YB, 2, c.A1, c.B1, 1.6, c.s1g);
      const H = behind(S1.end, 0, c.kh), Hs = L3(H, [H[0] + 4, H[1], H[2]], UP), Xs = L3(X0, X1, UP), all = [S0.samples, S1.samples, Xs, Hs];
      // (the search is slow, so its answer is baked into the level; delete `baked` to search again)
      const bk = L.def.baked, t0 = bk ? bk[0] : holeAndTower(L, S0.samples, all, 0, [0, YB]), t1 = bk ? bk[1] : holeAndTower(L, S1.samples, all, YB, [0, YB]);
      P.bake = JSON.stringify([t0, t1].map(t => ({ a: +t.a.toFixed(2), b: t.b.map(v => +v.toFixed(3)) })));
      const make = (st, yaw, pal, a) => { const [s1, s2] = cutSamples(st.samples, a, a + 1.2);
        const r1 = L.road(s1, { pal }), r2 = L.road(s2, { pal, seam: yaw, edgeText: 'The stairs did not meet at this angle' }); return { r1, r2, end: st.end }; };
      const s0 = make(S0, 0, undefined, t0.a); P.s0 = s0; P.land = L.road(Xs, { pal: peach }); const s1 = make(S1, YB, peach, t1.a); P.s1 = s1;
      const home = L.road(Hs, { goal: true }); P.home = home;
      const T0 = towerMesh(L, t0.b), T1 = towerMesh(L, t1.b, peach);
      const txt = { text: 'Behind the tower, so the hole was not there', edge: 'The stairs did not meet at this angle' };
      P.h0 = hiddenGap(L, s0.r1, 1, s0.r2, 0, () => [T0], txt); P.h1 = hiddenGap(L, s1.r1, 1, s1.r2, 0, () => [T1], txt);
      for (const r of [s0.r1, s1.r1]) r.edgeText = 'The hole was in plain sight';
      const at = clearSpot(L, [[-4, -3, 0], [-4, 3, 0], [9, -6, 0], [-2, -7, -2], [3, 7, 1], [12, 0, -2]], [0, YB]);
      const cam = cameraCrank(L, { key: 'y', name: 'Camera', at, detents: [0, YB] }); P.cam = cam;
      L.view.updaters.push(() => L.say(`camera ${cam.at(0) ? 'front' : cam.at(YB) ? 'turned 90°' : 'turning'} · first hole ${P.h0.hidden() ? 'hidden' : 'in sight'} · second hole ${P.h1.hidden() ? 'hidden' : 'in sight'}`));
    },
    spawn: L => ({ road: L.props.s0.r1, s: .3, dir: 1 }),
    solve(L, W, R) { R.cad = 80; const P = L.props, want = W.road === P.s0.r2 || W.road === P.land || W.road === P.s1.r1 ? 90 : W.road === P.s1.r2 ? 0 : W.road === P.s0.r1 ? 0 : null;
      P.cam.m.set(want !== null && !P.cam.at(want)); },
    center: [3, -2, 0], pts: [], pad: .8,
    decor(L) { cloudLayer(L.view, L.th, '#FFFFFF', 4, .75, .55, .95, .2); } },

  { id: 'c-under', name: 'Up and under', th: () => THEMES[1], cruise: [50, 92], yaws: [-90, 0],
    hint: 'The lift has no button: about 55 rpm keeps its deck on the ground, 85 sends it to the second floor. Ride slowly onto the deck, then spin up. At the top a road runs north, high in the air, and from this angle its end meets a road far below that passes right under the meadow loop you started on. That low road ends in a loop; turn the camera (<b>Y</b>) while you lap it, and its far side lines up with the road home.',
    build(L) {
      const th = L.th, g = L.g, P = L.props, step = 1.8, top = 3 * step, floors = [0, step, 2 * step, top], st = { lvl: 0, z: 0 }; P.lift = st;
      // the meadow loop, east of the lift; its north side runs on west onto the deck while the deck is down
      const gx = 3.5, G = L.road(loopPts(12.5 + gx, -1, 17.5 + gx, 1.6, 0, .6), { closed: true, pal: tone('#E9D7AE') }); P.G = G; loopSlab(g, 12 + gx, -1.5, 18 + gx, 2.1, -.5, tri(th.turf), .9);
      const dg = new T.Group(); g.add(dg); st.dg = dg; const dpal = tone('#F3E6C4');
      B(dg, 2.7, -1.5, -.3, 7.1, 2.1, -.03, tri(th.idle)); B(dg, 7.1, 1.15, -.3, 11.6 + gx, 2.05, -.03, tri(th.idle));
      const armW = L.road(L3([12.1 + gx, 1.6, .006], [6.2, 1.6, .006], UP), { g: dg, pal: dpal }); P.armW = armW;
      const D = L.road(loopPts(3.4, -1, 6.6, 1.6, 0, .8), { g: dg, closed: true, pal: dpal }); P.D = D;
      armW.joins = [{ k: 1, to: D, s: sAt(D, [6.2, 1.6, 0]) + .02, dir: 1 }];
      const armN = L.road(L3([6.6, .6, .006], [6.6, 3, .006], UP), { g: dg, pal: dpal }); P.armN = armN;
      G.forks.push({ s: sAt(G, [12.1 + gx, 1.6, 0]), dir: 1, to: armW, toK: 0, when: () => st.z === 0, text: 'The deck is down, so the road runs on' });
      D.forks.push({ s: sAt(D, [6.6, .6, 0]), dir: 1, to: armN, toK: 0, when: () => st.z === 2 * step, text: 'Second floor: the arm meets the high road' });
      // the high road north, and the low road it meets on screen from the starting angle: 9 m further away, so 9 m lower, and under the meadow
      const hz = 2 * step, E = [6.6, 5, hz], U = L.road(L3([6.6, 3, hz], E, UP), { pal: tone('#D9C7F0') }); P.U = U; CY(g, 6.6, 3.55, .32, hz - 3.4, hz - .5, tri(sp(th, 0)), 16);   // held up at its start: under its far end it would stand in front of the low road
      const X0 = behind(E, -90, 9), X = L.road(L3(X0, [X0[0], 4.6, X0[2]], UP), { pal: tone('#B7D3A0') }); P.X = X;
      const Q = L.road(loopPts(X0[0] - 3.4, 4.2, X0[0], 7.6, X0[2], .7), { closed: true, pal: tone('#B7D3A0') }); P.Q = Q;
      X.joins = [{ k: 1, to: Q, s: sAt(Q, [X0[0], 4.6, X0[2]]) + .02, dir: 1 }];
      loopSlab(g, X0[0] - 3.9, 3.7, X0[0] + .5, 8.1, X0[2] - .5, tri(th.turf), .9);
      // from the front, the low loop's far side lines up with the way home
      const exitP = [X0[0] - 2.6, 7.6, X0[2]], H0 = behind(exitP, 0, -4), home = L.road(L3(H0, [H0[0] - 4, H0[1], H0[2]], UP), { goal: true }); P.home = home;
      B(g, H0[0] - 4.1, H0[1] - .5, H0[2] - 2.4, H0[0] - 3.1, H0[1] + .5, H0[2] - .5, tri(sp(th, 0)));
      const cam = cameraCrank(L, { key: 'y', name: 'Camera', at: clearSpot(L, [[20, -3, 0], [20, 3, 0], [10, -4, 0], [1, -3, 0], [1, 4, 0], [16, 8, -2]], [-90, 0]), detents: [-90, 0] }); P.cam = cam;
      Q.forks.push({ s: sAt(Q, exitP), dir: 1, to: home, toK: 0, when: () => cam.at(0), text: 'Joined by perspective' });
      const ccx = 5, ccy = .3; B(g, 2.5, -1.7, -2.6, 7.3, 2.3, -2.2, tri(sp(th, 0)));
      const glass = CY(g, ccx, ccy, .46, -2.2, -.8, tri({ t: '#E9FBFF', l: '#BFE8F2', r: '#9AD3E2' }, { opacity: .35 }), 24);
      const water = CY(g, ccx, ccy, .36, -2.2, -.8, tri({ t: '#8FDCEF', l: '#55B9D2', r: '#3C9BB6' }, { opacity: .9 }), 20);
      (L.drags ||= []).push(() => st.moving ? .2 : 0);
      L.view.updaters.push((t, dt) => { if (L.state !== 'play') return;
        const target = clamp((rider.cad - 55) / 45, 0, 1) * top, prev = st.lvl; st.lvl += clamp(target - st.lvl, -1.35 * dt, 1.35 * dt); st.moving = Math.abs(st.lvl - prev) > 1e-4;
        let z = st.lvl; for (const f of floors) if (Math.abs(st.lvl - f) < .5) z = f; st.z = z; dg.position.y = z;
        const gh = z - .3 + 2.2; glass.scale.y = gh; glass.position.y = -2.2 + gh / 2; const wh = Math.max(.02, z - .35 + 2.2); water.scale.y = wh; water.position.y = -2.2 + wh / 2;
        L.say(`cadence ${Math.round(rider.cad)} rpm · deck ${z === 0 ? 'on the ground' : z === step ? 'first floor' : z === 2 * step ? 'second floor' : z === top ? 'third floor' : 'between floors'} · camera ${cam.at(-90) ? 'start' : cam.at(0) ? 'turned 90°' : 'turning'}`); });
    },
    spawn: L => ({ road: L.props.G, s: 1, dir: 1 }),
    solve(L, W, R) { const P = L.props, onDeck = W.road === P.armW || W.road === P.D || W.road === P.armN; R.cad = onDeck ? 85 : W.road === P.G ? 52 : 80; R.gear = 4;
      const want = W.road === P.Q ? 0 : -90; P.cam.m.set(!P.cam.at(want)); },
    center: [8, 2, -1], pts: [[22, 2.3, 6.5], [2.5, -1.7, -2.6], [2.7, -1.5, 6], [7.1, 2.1, 6], [2.7, 2.1, 6], [7.1, 5, 4]], pad: .8,
    decor(L) { cloudLayer(L.view, L.th, '#FFFFFF', 4, .8, .6, .95, .2); drift(L.view, TEX.petal, '#FFB5CE', 10, .14, { vx: .25, vy: -.15, spin: 1.2 }); } },
  { id: 'c-curtain', name: 'Hold the curtain', th: () => THEMES[1], cruise: [65, 90],
    hint: 'A hole you cannot see is not there. The garden deck has no button: about 55 rpm keeps it on the ground, 70 lifts it to the first floor, 85 to the second. From here the deck hangs in front of the road west, and each floor hides a different hole. The loop lets the wheel go only when the road ahead looks whole, so spin at 70 to hide the first hole, then spin up to 85 as soon as you are across, to hide the second.',
    build(L) {
      const th = L.th, g = L.g, P = L.props, fl = [0, 2.4, 4.8], st = { lvl: 0, z: 0 }; P.lift = st;
      const G = L.road(loopPts(7.5, 0, 12.5, 3, 0, .6), { closed: true, pal: tone('#E9D7AE') }); P.G = G; loopSlab(g, 7, -.5, 13, 3.5, -.5, tri(th.turf), .9);
      // the road west, with two holes: one behind the deck at the first floor, one behind it at the second
      const R = L3([8.2, 3, 0], [-10, 3, 0], UP), sH1 = 8.2 - -.4, sH2 = 8.2 - -5.2, [R1, rest] = cutSamples(R, sH1, sH1 + 1.2), [R2, R3] = cutSamples(rest, sH2 - sH1 - 1.2, sH2 - sH1);
      P.R1 = L.road(R1); P.R2 = L.road(R2); P.R3 = L.road(R3, { goal: true });
      B(g, -10.5, 2.3, -2.4, -8.6, 3.7, -.5, tri(sp(th, 0)));
      // the deck: a garden platform on a slim column, lifted by cadence wherever the wheel is
      const dg = new T.Group(); g.add(dg); B(dg, -2.4, 4.2, -.3, 2.4, 9, 0, tri(th.turf)); B(dg, -2.3, 4.3, -.75, 2.3, 8.9, -.3, tri(sp(th, 0)));
      for (const [x, y] of [[-1.7, 8.3], [1.7, 8.3], [-1.7, 4.9]]) { CY(dg, x, y, .08, 0, .5, tri(tone('#9B7046')), 6); const cr = new T.Mesh(new T.IcosahedronGeometry(.42, 0), tri(th.leaf)); at(dg, cr, x, y, .8); }
      CY(g, 0, 6.6, .34, -3, -.9, tri(th.idle), 14); CY(dg, 0, 6.6, .24, -5.6, -.75, tri(th.idle), 14); B(g, -1, 5.6, -6.6, 1, 7.6, -3, tri(sp(th, 0)));   // a telescoping column on a deep pedestal
      const water = CY(g, 0, 6.6, .2, -3, -.8, tri({ t: '#8FDCEF', l: '#55B9D2', r: '#3C9BB6' }, { opacity: .9 }), 12);
      const txt = { text: 'Behind the deck, so the hole was not there' };
      P.h1 = hiddenGap(L, P.R1, 1, P.R2, 0, () => [dg], txt); P.h2 = hiddenGap(L, P.R2, 1, P.R3, 0, () => [dg], txt);
      P.R1.edgeText = P.R2.edgeText = 'The hole was in plain sight';
      G.forks.push({ s: sAt(G, [8.2, 3, 0]), dir: 1, to: P.R1, toK: 0, when: () => P.h1.hidden(), text: 'The road ahead looks whole, so the wheel rides on' });
      (L.drags ||= []).push(() => st.moving ? .2 : 0);
      L.view.updaters.push((t, dt) => { if (L.state !== 'play') return;
        const target = clamp((rider.cad - 55) / 30, 0, 1) * 4.8, prev = st.lvl; st.lvl += clamp(target - st.lvl, -2 * dt, 2 * dt); st.moving = Math.abs(st.lvl - prev) > 1e-4;
        let z = st.lvl; for (const f of fl) if (Math.abs(st.lvl - f) < .4) z = f; st.z = z; dg.position.y = z;
        water.scale.y = 1; const wh = Math.max(.05, z + 2.2); water.scale.y = wh / 2.2; water.position.y = -3 + wh / 2 + .4;
        L.say(`cadence ${Math.round(rider.cad)} rpm · deck ${z === 0 ? 'on the ground' : z === 2.4 ? 'first floor' : z === 4.8 ? 'second floor' : 'moving'} · holes ${P.h1.hidden() ? 'first hidden' : P.h2.hidden() ? 'second hidden' : 'both in sight'}`); });
    },
    spawn: L => ({ road: L.props.G, s: 1, dir: 1 }),
    solve(L, W, R) { const P = L.props; R.gear = 4; R.cad = W.road === P.G || W.road === P.R1 ? 70 : 85; },
    center: [0, 3, 1], pts: [[-10.5, 2.3, -2.4], [13, 3.5, 0], [2.4, 9, 5.5], [-2.4, 4.2, 5.5]], pad: .8,
    decor(L) { cloudLayer(L.view, L.th, '#FFFFFF', 4, .8, .6, .95, .2); drift(L.view, TEX.petal, '#FFB5CE', 10, .14, { vx: .25, vy: -.15, spin: 1.2 }); } },
  { id: 'c-bridge', name: 'Bridge or curtain', th: () => THEMES[2], cruise: [72, 92],
    hint: 'One drawbridge, two jobs. Lowered, it carries the road from the upper loop to the way home. Raised, its leaf stands right in front of a hole in the low road, and a hole you cannot see is not there. The low loop lets the wheel go only when the road ahead looks whole. Raise the bridge (<b>Y</b>) to ride the low road and the ramp up to the upper loop, then lower it to ride home.',
    build(L) {
      const th = L.th, g = L.g, P = L.props, zl = -1.8, hx = 3, lw = 1.6, tR = 3, rx = hx - tR;
      // the upper loop, with the drawbridge hinged on its north side; raised, the leaf stands in the plane x = hx
      const K = L.road(loopPts(2.4, -3, 6.4, 1.6, 0, .6), { closed: true }); P.K = K; loopSlab(g, 1.9, -3.5, 6.9, 2.1, -.5, tri(sp(th, 1)), .9);
      // the low loop the wheel starts on; its west side runs on south as the low road, through the hole, then ramps up east into the upper loop
      const G = L.road(loopPts(rx, 2.6, rx + 2.6, 5.4, zl, .6), { closed: true, pal: tone('#EEDFC4') }); P.G = G; loopSlab(g, rx - .5, 2.1, rx + 3.1, 5.9, zl - .5, tri(sp(th, 0)), .9);
      const yH = 1.6 - tR + .6, t = turtle(rx, 3.2, -90, zl).fwd(3.2 + 4.5).arc(1.1, 90).gr(-zl / (3.3 - rx - 1.1)).fwd(3.3 - rx - 1.1).gr(0).arc(1.1, 90).fwd(1), lowR = t.pts;
      const sH = 3.2 - yH, [R1, R2] = cutSamples(lowR, sH, sH + 1.2); P.R1 = L.road(R1, { pal: tone('#EEDFC4') }); P.R2 = L.road(R2, { pal: tone('#EEDFC4') });
      P.R2.joins = [{ k: 1, to: K, s: sAt(K, [4.4, -3, 0]) + .02, dir: 1 }];
      const hg = new T.Group(); hg.position.copy(V(hx, 1.6, 0)); g.add(hg); const leafM = tri(th.mech, { fresh: true });
      const leaf = new T.Mesh(UNIT, leafM); leaf.scale.set(2.4, .3, lw); leaf.position.set(-1.2, -.18, 0); hg.add(leaf);
      const br = L.road(L3([0, 0, .006], [-2.4, 0, .006], UP), { g: hg, pal: tone('#E8C9A0'), th: .05 }); P.br = br;
      CY(g, hx, 1.6, .22, -2.4, -.05, tri(th.mechDark || th.idle), 10);
      const home = L.road(turtle(hx - 2.4, 1.6, 180, 0).fwd(.4).arc(1, -90).fwd(3.2).pts, { goal: true }); P.home = home;
      const st = { ang: 0, sweep: 1 }; P.bridge = st;
      P.hole = hiddenGap(L, P.R1, 1, P.R2, 0, () => [leaf], { text: 'Behind the raised bridge, so the hole was not there', edge: 'The hole was in plain sight' });
      G.forks.push({ s: sAt(G, [rx, 3.2, zl]), dir: 1, to: P.R1, toK: 0, when: () => P.hole.hidden(), text: 'The road ahead looks whole, so the wheel rides on' });
      K.forks.push({ s: sAt(K, [hx, 1.6, 0]), dir: 1, to: br, toK: 0, when: () => st.ang < 1, text: 'The bridge is down, so the road runs on' });
      const at = clearSpot(L, [[8.8, -2, 0], [8.8, 2, 0], [-3.5, -4, -1], [-3, 1, -1], [6, 4.4, 0], [-3.5, 6, -2], [9, -6, -1]], [0]);
      st.m = L.machine({ key: 'y', name: 'Drawbridge', size: .6, place: h => { h.position.copy(V(at[0], at[1], at[2] + .04)); g.add(h); },
        tick(dt, drive) {
          if (drive > 0) { st.ang += st.sweep * drive * 30; if (st.ang <= 0 || st.ang >= 90) { st.ang = clamp(st.ang, 0, 90); st.sweep *= -1; } }
          else { const tgt = st.ang > 45 ? 90 : 0; st.ang += clamp(tgt - st.ang, -60 * dt, 60 * dt); }
          hg.rotation.z = -st.ang / 90 * Math.PI / 2; setTri(leafM, mixPal(th.mech, tone(th.goal), clamp(this.bloom.e, 0, 1)));
          L.say(`bridge ${st.ang < 1 ? 'down' : st.ang > 89 ? 'raised' : 'moving'} · hole ${P.hole.hidden() ? 'hidden' : 'in sight'}`);
          const off = Math.min(st.ang, 90 - st.ang); return drive > 0 ? .25 + .7 * Math.exp(-((off / 7) ** 2)) : 0; } });
      CY(g, at[0], at[1], .6, at[2] - 2.4, at[2] - .02, tri(sp(th, 0)), 28);
    },
    spawn: L => ({ road: L.props.G, s: 1, dir: 1 }),
    solve(L, W, R) { const P = L.props, st = P.bridge; R.cad = 80; R.gear = 4; const up = W.road === P.G || W.road === P.R1; st.m.set(up ? st.ang < 89.5 : (W.road === P.K ? st.ang > .5 : false)); },
    center: [2, -1, -1], pts: [[-.5, 5.9, -4.2], [6.9, -6.7, -2.4], [3, 1.6, 2.6], [-1, 6, 0]], pad: .8,
    decor(L) { cloudLayer(L.view, L.th, '#FFFFFF', 4, .8, .6, .95, .2); } },
];
/* ================= scenery: floating islands, towers and columns, placed where no camera angle sees them in front of the track ================= */
function sceneryPass(L, o = {}) {
  const th = L.th, yaws = L.def.yaws || [0], rnd = mulberry(o.seed ?? (L.idx * 7919 + 17)), ray = new T.Raycaster();
  L.g.updateMatrixWorld(true);
  // what must stay in view: road samples (ends count more) and machine pedestals
  const pts = []; for (const r of L.roads) { if (!r.S[0]) continue; for (let s = 0; s <= r.L; s += .4) { const f = r.at(s), w = r.closed || (s > 2 && s < r.L - 2) ? 1 : 4, side = new T.Vector3().crossVectors(f.d, f.n).normalize();
    // the deck's centre line and both edges, so a thin column cannot stand between samples
    for (const e of [0, .5, -.5]) pts.push({ p: f.p.clone().addScaledVector(side, e).addScaledVector(f.n, .2), w }); } }
  for (const m of L.machines) { const p = new T.Vector3(); m.bloom.holder.getWorldPosition(p); pts.push({ p, w: 6 }); }
  // holes that open and close by sight must never be hidden by scenery
  for (const r of L.roads) for (const gp of r.gaps) { const a = r.end(gp.k).p, b = gp.to.end(gp.toK).p; for (let i = 0; i <= 6; i++) pts.push({ p: a.clone().lerp(b, i / 6), w: 6 }); }
  if (!pts.length) return;
  const axes = yaws.map(y => [SR.clone().applyAxisAngle(Yax3, y * Math.PI / 180), SU.clone().applyAxisAngle(Yax3, y * Math.PI / 180), toCam(y)]);
  const scr = (p, k) => [p.dot(axes[k][0]), p.dot(axes[k][1])];
  const bounds = axes.map((_, k) => { const s = pts.map(q => scr(q.p, k)); return [Math.min(...s.map(q => q[0])), Math.max(...s.map(q => q[0])), Math.min(...s.map(q => q[1])), Math.max(...s.map(q => q[1]))]; });
  const lo = new T.Vector3(1e9, 1e9, 1e9), hi = lo.clone().multiplyScalar(-1); for (const q of pts) { lo.min(q.p); hi.max(q.p); }
  // a candidate is a set of boxes (three.js coords); it is rejected if any box stands in front of, or runs into, anything that must stay in view
  const blocks = (boxes) => { const ms = boxes.map(b => boxMesh([b[0] - .3, b[1], b[2] - .3, b[3] + .3, b[4] + .3, b[5] + .3]));
    for (const q of pts) { for (const b of boxes) if (q.p.x > b[0] - .8 && q.p.x < b[3] + .8 && q.p.z > b[2] - .8 && q.p.z < b[5] + .8 && q.p.y > b[1] - 1 && q.p.y < b[4] + 1.2) return true;
      for (let k = 0; k < yaws.length; k++) { const d = axes[k][2]; ray.set(q.p.clone().addScaledVector(d, 100), d.clone().negate()); const h = ray.intersectObjects(ms, false); if (h.length && h[0].distance < 99.7) return true; } }
    return false; };
  const placed = [], want = o.count ?? Math.round(clamp((hi.x - lo.x + hi.z - lo.z) / 7, 3, 7));
  const stone = tri(sp(th, 0)), dark = tri(th.mechDark || th.idle), rock = tri(th.turf ? { t: th.turf.t, l: th.stone.l, r: th.stone.r } : th.idle), roof = tri(th.roof || th.mech), win = basic(th.win ? th.win.r : (th.glow || th.ink));
  for (let tries = 0; tries < 260 && placed.length < want; tries++) {
    const kind = rnd() < .55 ? 'tower' : rnd() < .5 ? 'column' : 'terrace';
    const x = lo.x - 4 + rnd() * (hi.x - lo.x + 8), z = lo.z - 4 + rnd() * (hi.z - lo.z + 8), base = lo.y - 3 + rnd() * (hi.y - lo.y + 2);
    const w = kind === 'tower' ? .9 + rnd() * .6 : kind === 'column' ? .5 + rnd() * .3 : 2.2 + rnd() * 1, h = kind === 'tower' ? 2.4 + rnd() * 3 : kind === 'column' ? 3 + rnd() * 4 : 2.4;
    const pw = kind === 'terrace' ? w : w + 1.2 + rnd() * 1;     // the floating island it stands on
    const boxes = [[x - pw / 2, base - 1.8, z - pw / 2, x + pw / 2, base, z + pw / 2], [x - w / 2, base, z - w / 2, x + w / 2, base + h + .6, z + w / 2]];
    const c = new T.Vector3(x, base + h / 2, z);
    if (placed.some(p => Math.hypot(p.x - x, p.z - z) < (p.r + pw / 2 + 1.2))) continue;
    // keep it inside the frame from every angle, and near enough the track to belong to the level
    if (axes.some((_, k) => { const [sx, sy] = scr(c, k), b = bounds[k]; return sx < b[0] - 1 || sx > b[1] + 1 || sy < b[2] - 2 || sy > b[3] + 1; })) continue;
    const near = Math.min(...pts.map(q => Math.hypot(...scr(q.p, 0).map((v, i) => v - scr(c, 0)[i])))); if (near > 6.5) continue;
    if (blocks(boxes)) continue;
    // build it: an island with a rocky underside, then the tower, column or terrace on top
    const gI = new T.Group(); L.g.add(gI); const isl = new T.Mesh(UNIT, rock); isl.scale.set(pw, .45, pw); isl.position.set(x, base - .225, z); gI.add(isl);
    const under = new T.Mesh(new T.ConeGeometry(pw * .62, 1.35, 4), tri(sp(th, 0))); under.rotation.set(Math.PI, Math.PI / 4, 0); under.position.set(x, base - .45 - .675, z); gI.add(under);
    if (kind === 'tower') { B(gI, x - w / 2, z - w / 2, base, x + w / 2, z + w / 2, base + h, stone);   // B takes sketch order (x, y, z)
      const cap = new T.Mesh(new T.ConeGeometry(w * .78, .7, 4), roof); cap.rotation.y = Math.PI / 4; cap.position.set(x, base + h + .35, z); gI.add(cap);
      for (let yy = base + h - 1; yy > base + .5; yy -= 1.3) { onFace(gI, 'x', x + w / 2, z, yy - .3, archGeo(.26, .55), win); onFace(gI, 'y', z + w / 2, x, yy - .3, archGeo(.26, .55), win); } }
    else if (kind === 'column') { CY(gI, x, z, w / 2, base, base + h, stone, 18); const dome = new T.Mesh(new T.SphereGeometry(w * .62, 16, 8, 0, TAU, 0, Math.PI / 2), roof); dome.position.set(x, base + h, z); gI.add(dome); CY(gI, x, z, w * .62, base + h - .12, base + h + .02, dark, 18); }
    else { // a stepped ziggurat crowned by a tree in the garden, a little domed shrine elsewhere
      for (let k = 0; k < 3; k++) { const ins = .25 + k * .4; B(gI, x - w / 2 + ins, z - w / 2 + ins, base + k * .4, x + w / 2 - ins, z + w / 2 - ins, base + (k + 1) * .4, k % 2 ? tri(th.idle) : stone); }
      const top = base + 1.2;
      if (th.leaf) { CY(gI, x, z, .09, top, top + .6, tri(tone('#9B7046')), 6); const cr = new T.Mesh(new T.IcosahedronGeometry(.55, 0), tri(th.leaf)); cr.position.set(x, top + .95, z); gI.add(cr); }
      else { CY(gI, x, z, .32, top, top + .5, stone, 14); const dm = new T.Mesh(new T.SphereGeometry(.36, 14, 7, 0, TAU, 0, Math.PI / 2), roof); dm.position.set(x, top + .5, z); gI.add(dm); } }
    placed.push({ x, z, r: pw / 2, kind });
  }
  return placed;
}

Object.assign($scope, { cutSamples, stairPts, tower, Yax3, toCam, boxMesh, coverCount, hidesGap, hiddenSpots, ghostDeck, towerFor, holeAndTower, towerMesh, clearSpot, CSTUDIES, sceneryPass });
}
