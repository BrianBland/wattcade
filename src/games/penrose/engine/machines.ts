// @ts-nocheck
/* Penrose Pedals engine: Reusable machines for the hand-built levels: turntables, peel switches, faucet lifts.
 * Installed into the shared engine scope in order (see ./index.ts); names come in from $scope and go back out to it. */
import * as T from 'three';

export function install($scope) {
const { B, CY, L3, UP, V, at, basic, clamp, gearRatio, lollipop, mixPal, ribbon, rider, setTri, sp, tone, tri, turtle } = $scope;

/* ---------- reusable machines for the longer levels ---------- */
// the part of a road between two distances along it, for drawing (logic always uses the whole road)
function trimRoad(r, s0, s1) {
  const at = s => { let i = 1; while (i < r.cum.length - 1 && r.cum[i] < s) i++; const f = clamp((s - r.cum[i - 1]) / ((r.cum[i] - r.cum[i - 1]) || 1), 0, 1), a = r.S[i - 1], b = r.S[i];
    return { p: a.p.clone().lerp(b.p, f), n: a.n.clone().lerp(b.n, f).normalize(), d: b.p.clone().sub(a.p).normalize() }; };
  const S = [at(s0)], cum = [s0]; r.S.forEach((q, i) => { if (r.cum[i] > s0 + 1e-3 && r.cum[i] < s1 - 1e-3) { S.push(q); cum.push(r.cum[i]); } }); S.push(at(s1)); cum.push(s1);
  return { S, cum };
}
// a road that ends at a turntable's pivot stops at the disc's rim in a curved socket, so the disc can turn inside it
function socket(L, r, k, rad) {
  const { host, w, th, mat, laneMat } = r.vo, hw = w / 2, e = Math.sqrt(rad * rad - hw * hw);
  r.vis.forEach(m => host.remove(m)); r.vis = [];
  const tr = k ? trimRoad(r, 0, r.L - rad) : trimRoad(r, rad, r.L);
  const deck = ribbon(tr, w, th, mat); host.add(deck); r.vis.push(deck);
  const ln = ribbon(trimRoad(r, k ? 0 : rad + .05, k ? r.L - rad - .05 : r.L), .07, 0, laneMat, { lift: .012, dash: [.38, .2] }); host.add(ln); r.vis.push(ln);
  const sh = new T.Shape(); sh.moveTo(rad, -hw); sh.lineTo(e, -hw); for (let i = 1; i < 16; i++) { const v = -hw + 2 * hw * i / 16; sh.lineTo(Math.sqrt(rad * rad - v * v), v); } sh.lineTo(e, hw); sh.lineTo(rad, hw); sh.lineTo(rad, -hw);
  const geo = new T.ExtrudeGeometry(sh, { depth: th, bevelEnabled: false, curveSegments: 1 });
  const q = r.S[k ? r.S.length - 1 : 0], din = k ? q.d.clone().negate() : q.d.clone(), side = new T.Vector3().crossVectors(din, q.n).normalize();
  geo.applyMatrix4(new T.Matrix4().makeBasis(din, side, q.n.clone().negate()).setPosition(q.p)); const m = new T.Mesh(geo, mat); host.add(m); r.vis.push(m);
}
function turntable(L, o) {   // a flush disc with a bridge arm, pivoting at one end: 0° continues the road, o.open swings it to another
  const th = L.th, g = L.g, bg = new T.Group(); bg.position.copy(V(...o.pivot)); g.add(bg); const rad = .8, w = 1, d0 = .5, base = o.base || 0; bg.rotation.y = -base * Math.PI / 180;
  const mat = tri(th.idle, { fresh: true, side: true }), road = L.road(L3([0, 0, 0], [o.len, 0, 0], UP), { g: bg, mat, turntable: true, noDeck: true, noLane: true });
  // the arm's tip is open and front-faced, so where it meets a road far behind on screen no end face covers that road
  const armMat = tri(th.idle, { fresh: true }); bg.add(ribbon(trimRoad(road, Math.sqrt(rad * rad - .25), road.L), w, d0, armMat, { cull: true, open: [false, true] })); bg.add(ribbon(trimRoad(road, rad + .05, road.L), .07, 0, L.lane, { lift: .012, dash: [.38, .2] }));
  const disc = CY(bg, 0, 0, rad, -d0, 0, mat, 48); const rim = new T.Mesh(new T.RingGeometry(rad - .1, rad - .05, 48), basic(th.lane, { side: true })); rim.rotation.x = -Math.PI / 2; rim.position.y = .014; bg.add(rim);
  const [px, py, pz] = o.pivot; CY(g, px, py, rad + .12, pz - d0 - .45, pz - d0 - .03, tri(th.mechDark || th.idle), 48);
  const P = V(...o.pivot); for (const r of L.roads) { if (r.g || r === road) continue; for (const k of [0, 1]) if (r.S[k ? r.S.length - 1 : 0].p.distanceTo(P) < .05) socket(L, r, k, rad); }
  const st = { ang: 0, sweep: Math.sign(o.open), road, rad };
  st.m = L.machine({ key: o.key, name: o.name, size: .55, place: h => { h.position.set(0, .02, 0); bg.add(h); },
    tick(dt, drive) {
      const det = o.detents || [0, o.open], lo = Math.min(...det), hi = Math.max(...det);
      if (drive > 0) { st.ang += st.sweep * drive * 28; if (st.ang <= lo || st.ang >= hi) { st.ang = clamp(st.ang, lo, hi); st.sweep *= -1; } }
      else { const tgt = det.reduce((a, d) => Math.abs(d - st.ang) < Math.abs(a - st.ang) ? d : a, det[0]); st.ang += clamp(tgt - st.ang, -60 * dt, 60 * dt); }
      bg.rotation.y = -(base + st.ang) * Math.PI / 180; setTri(mat, mixPal(th.idle, th.mech, clamp(this.bloom.e, 0, 1))); setTri(armMat, mixPal(th.idle, th.mech, clamp(this.bloom.e, 0, 1)));
      const off = Math.min(...(o.detents || [0, o.open]).map(d => Math.abs(st.ang - d))); return drive > 0 ? .25 + .7 * Math.exp(-((off / 7) ** 2)) : 0;
    } });
  return st;
}
function peelSwitch(L, o) {   // points that peel a road off a straight line: a curved leaf hinged at its far end, raised until cranked down
  const th = L.th, g = L.g, { line, s, dir } = o, R = o.R || 3, f = line.at(s), h = Math.atan2(f.d.z, f.d.x) * 180 / Math.PI + (dir < 0 ? 180 : 0);
  const tp = turtle(f.p.x, f.p.z, h, f.p.y + .006).arc(R, o.side * 45), P1 = [tp.x, tp.y, tp.z], hg = new T.Group(); hg.position.copy(V(...P1)); g.add(hg);
  const leafPts = tp.pts.map(q => ({ p: [q.p[0] - P1[0], q.p[1] - P1[1], q.p[2] - P1[2]], n: q.n }));
  const leafMat = tri(th.idle, { fresh: true, side: true }), leaf = L.road(leafPts, { g: hg, mat: leafMat, th: .18 });
  leaf.joins = [{ k: 0, to: line, s, dir: -dir }];
  // the leaf sits a hair above the line and carries its own lane, so when it is down the branch is drawn over the straight
  hg.add(ribbon(trimRoad(leaf, .05, leaf.L), .07, 0, L.lane, { lift: .014, dash: [.38, .2] }));
  line.forks.push({ s, dir, to: leaf, toK: 0, when: () => st.ang < 1, text: o.text || '' });
  const ha = (h + o.side * 45) * Math.PI / 180, axis = V(-Math.sin(ha), 0, Math.cos(ha)).normalize();
  const p0 = V(...leafPts[0].p), tipZ = sg => p0.clone().applyQuaternion(new T.Quaternion().setFromAxisAngle(axis, sg)).y, swing = tipZ(1) > tipZ(-1) ? 1 : -1;
  // the crank stands beside the line where the points begin, on the side they peel towards
  const hr = h * Math.PI / 180, C0 = [f.p.x - Math.sin(hr) * o.side * .95, f.p.z + Math.cos(hr) * o.side * .95, f.p.y];
  CY(g, C0[0], C0[1], .12, C0[2] - 2.4, C0[2] + .1, tri(th.mechDark || th.idle), 12);
  const st = { ang: 90, sweep: -1, leaf, end: [...P1, h + o.side * 45], at: f.p.clone() };
  st.m = L.machine({ key: o.key, name: o.name, size: .5, place: hh => { hh.position.copy(V(C0[0], C0[1], C0[2] + .14)); g.add(hh); },
    tick(dt, drive) {
      if (drive > 0) { st.ang += st.sweep * drive * 30; if (st.ang <= 0 || st.ang >= 90) { st.ang = clamp(st.ang, 0, 90); st.sweep *= -1; } }
      else { const tgt = st.ang > 45 ? 90 : 0; st.ang += clamp(tgt - st.ang, -60 * dt, 60 * dt); }
      hg.quaternion.setFromAxisAngle(axis, swing * st.ang / 90 * .5); setTri(leafMat, mixPal(mixPal(th.idle, sp(th, 1), clamp(1 - st.ang / 20, 0, 1)), th.mech, clamp(this.bloom.e, 0, 1)));   // once down, the leaf turns road-coloured: one finished road
      const off = Math.min(st.ang, 90 - st.ang); return drive > 0 ? .25 + .7 * Math.exp(-((off / 7) ** 2)) : 0;
    } });
  return st;
}
function faucetLift(L, o) {   // a cul-de-sac on a lift deck; cadence pumps water into the column under it, floors are detents
  const th = L.th, g = L.g, [jx, jy, jz] = o.J, step = o.step || 1.2, top = 3 * step, cg = new T.Group(); cg.position.copy(V(jx, jy, jz)); cg.rotation.y = -o.heading * Math.PI / 180; g.add(cg);
  const dg = new T.Group(); cg.add(dg);
  const pts = lollipop(0, 0, 0, 0, 1.2, 1), xs = pts.map(q => q.p[0]), ys = pts.map(q => q.p[1]);
  const x0 = .08, x1 = Math.max(...xs) + .45, y0 = Math.min(...ys) - .45, y1 = Math.max(...ys) + .45;
  B(dg, x0, y0, -.3, x1, y1, -.03, tri(th.idle));
  const deck = L.road(pts, { g: dg, w: .8, th: 0, pal: o.pal || sp(th, 1) });
  // the column: a slim glass tube under the middle of the cul-de-sac, clear of the road ends on screen
  const cpts = xs.filter(x => x > 1.5), ccx = (Math.min(...cpts) + Math.max(...cpts)) / 2, ccy = (y0 + y1) / 2;
  B(cg, x0 - .2, y0 - .2, -2.2, x1 + .2, y1 + .2, -1.8, tri(sp(th, 0)));
  const glass = CY(cg, ccx, ccy, .46, -1.8, -.8, tri({ t: '#E9FBFF', l: '#BFE8F2', r: '#9AD3E2' }, { opacity: .35 }), 24);
  const water = CY(cg, ccx, ccy, .36, -1.8, -.8, tri({ t: '#8FDCEF', l: '#55B9D2', r: '#3C9BB6' }, { opacity: .9 }), 20);
  const postMat = tri(o.postPal || th.mech), collars = [];
  for (const [px, py] of [[x0 - .12, y0 - .12], [x1 + .12, y0 - .12], [x0 - .12, y1 + .12], [x1 + .12, y1 + .12]]) {
    CY(cg, px, py, .07, -1.8, top + .45, postMat, 10); CY(cg, px, py, .12, top + .45, top + .55, postMat, 12);
    for (const h of [step, 2 * step, top]) collars.push({ h, m: CY(cg, px, py, .14, h - .06, h + .02, tri(th.mech, { fresh: true }), 14) }); }
  // the feed pipe and badge stand beyond the far end, or beside the deck when o.pipeSide is +1 / -1
  const ps = o.pipeSide || 0, px = ps ? (x0 + x1) / 2 : x1 + .55, py = ps ? ps * (Math.max(Math.abs(y0), Math.abs(y1)) + .55) : 0;
  CY(cg, px, py, .16, -2.2, top + 1.1, tri(o.pipePal || th.stone), 12);
  if (ps) B(cg, px - .12, Math.min(py, 0), -1.75, px + .12, Math.max(py, 0), -1.5, tri(o.pipePal || th.stone)); else B(cg, x1 + .2, -.12, -1.75, px, .12, -1.5, tri(o.pipePal || th.stone));
  const st = { lvl: 0, z: 0, deck, step, dg };
  st.m = (o.auto ? (m => { const fake = { on: false, set() {}, tick: m.tick, bloom: { e: 0 } }; (L.drags ||= []).push(dt => { return fake.tick(dt, rider.cad / 60 * dt * gearRatio(rider.gear)) || 0; }); m.place(new T.Group()); return fake; }) : L.machine)({ key: o.key, name: o.name, size: .7, place: h => { h.position.set(px, top + 1.1, py); cg.add(h); },
    tick(dt, drive) {
      const target = clamp((rider.cad - 55) / 45, 0, 1) * top, k = step / 1.2; if (drive > 0) st.lvl += clamp(target - st.lvl, -.9 * k * dt, .9 * k * dt);
      let z = st.lvl; for (const f of [0, step, 2 * step, top]) if (Math.abs(st.lvl - f) < .35 * k) z = f;
      st.z = z; dg.position.y = z;
      const gh = z - .3 + 1.8; glass.scale.y = gh; glass.position.y = -1.8 + gh / 2; const wh = Math.max(.02, z - .35 + 1.8); water.scale.y = wh; water.position.y = -1.8 + wh / 2;
      collars.forEach(c => setTri(c.m.material, Math.abs(z - c.h) < .01 ? tone(th.goal) : th.mech));
      const moved = Math.abs(st.lvl - (st.prevLvl ?? st.lvl)) > 1e-5; st.prevLvl = st.lvl; return drive > 0 && (moved || !o.auto) ? .3 + .1 * st.lvl / k : 0;
    } });
  return st;
}

/* ================= the levels ================= */

Object.assign($scope, { trimRoad, socket, turntable, peelSwitch, faucetLift });
}
