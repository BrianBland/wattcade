// @ts-nocheck
/* Penrose Pedals engine: ambient life. Small, slow motion at the edges of a scene keeps it alive (Monument Valley's birds
 * and banners, Captain Toad's grass), but in a perception puzzle the eye must only be pulled by motion that matters. So
 * nothing here moves like a machine (no clean rotation stops, no sliding parts), and nothing is ever placed, or allowed
 * to drift, in front of or right beside the track: every piece keeps a margin, in screen space and from every camera
 * angle the level stops at, from the roads, the machines, the goal and any hole that opens by sight.
 * Per theme: garden grass and butterflies, dusk banners and birds, town laundry and gulls, prism floating crystals,
 * night lit windows, fireflies and stars, brass wall cogs and steam. Installed into the shared engine scope (./index.ts). */
import * as T from 'three';

export function install($scope) {
const { V, TAU, TEX, tri, tone, basic, sprite, mix, mixPal, gearGeo, reduce, SR, SU, SD, clamp, lerp, mulberry, skyAt } = $scope;
const Y = new T.Vector3(0, 1, 0);
// pieces grow with the level's framing, so a wide level's grass still reads as grass (1 at a 30 m wide view)
let SC = 1;
// wall pieces grow less: a bare stretch of wall is only so big
const WSC = () => Math.min(SC, 1.25), scaled = (m) => m.multiply(new T.Matrix4().makeScale(WSC(), WSC(), WSC()));

/** What must stay clear, as screen-space discs for each camera angle the level stops at. */
function keepModel(L) {
  const yaws = L.def.yaws || [0], axes = yaws.map(y => [SR, SU, SD].map(a => a.clone().applyAxisAngle(Y, y * Math.PI / 180)));
  const pts = [], add = (p, r) => pts.push({ p: p.clone(), r });
  L.g.updateMatrixWorld(true);
  for (const r of L.roads) { if (!r.S?.length) continue;
    const S = []; for (let s = 0; s <= r.L; s += .3) S.push(r.at(s).p); S.push(r.at(r.L).p);
    for (const p of S) add(p, .55);
    // a road on a machine sweeps: keep its whole reach clear, not just where it rests now
    if (r.g) { const c = S.reduce((a, p) => a.add(p), new T.Vector3()).multiplyScalar(1 / S.length); let R = 0; for (const p of S) R = Math.max(R, p.distanceTo(c));
      const piv = new T.Vector3().setFromMatrixPosition(r.g.matrixWorld); add(c, R + .4);
      // a turntable swings round its pivot (when the pivot is on the road itself, not a parent group's origin)
      if (piv.distanceTo(c) < R + .5) add(piv, Math.max(...S.map(p => p.distanceTo(piv))) + .4); }
    if (r.goal) { const e = r.at(r.L); for (let k = 0; k <= 5; k++) add(e.p.clone().addScaledVector(e.n, k * .9), 1); } }
  for (const m of L.machines) { const p = new T.Vector3(); m.bloom?.holder?.getWorldPosition(p); add(p, (m.size || .6) + .6); }
  for (const r of L.roads) for (const gp of r.gaps || []) { const a = r.end(gp.k).p, b = gp.to.end(gp.toK).p; for (let i = 0; i <= 6; i++) add(a.clone().lerp(b, i / 6), .8); }
  const scr = axes.map(a => pts.map(q => [q.p.dot(a[0]), q.p.dot(a[1]), q.r]));
  const clear = (p, rad) => axes.every((a, k) => { const x = p.dot(a[0]), y = p.dot(a[1]); return scr[k].every(([qx, qy, qr]) => (x - qx) ** 2 + (y - qy) ** 2 > (qr + rad) ** 2); });
  return { pts, axes, clear };
}

/** Opaque meshes of the level (what a ray can land on, or be hidden by). */
function solids(L) {
  const out = []; L.g.traverse(o => { if (!o.isMesh || o.isSprite || !o.visible || !o.geometry) return; const m = o.material; if (!m || m.colorWrite === false || (m.transparent && (m.opacity ?? 1) < .6)) return; out.push(o); });
  return out;
}

/**
 * A bounding volume hierarchy over the level's triangles in world space, so the spot search can cast thousands of rays
 * (three's Raycaster tests every triangle of every big terrain mesh it passes, about a millisecond a ray here).
 * hit(o, d, far) returns the nearest { distance, point, n (facing the ray), object } or null.
 */
function triBVH(meshes) {
  let N = 0; for (const m of meshes) { const g = m.geometry; N += (g.index ? g.index.count : g.attributes.position.count) / 3 | 0; }
  const P = new Float32Array(N * 9), C = new Float32Array(N * 3), owner = new Uint32Array(N), v = new T.Vector3();
  let k = 0; meshes.forEach((m, mi) => { const g = m.geometry, pos = g.attributes.position, ix = g.index, n = (ix ? ix.count : pos.count) / 3 | 0;
    for (let t = 0; t < n; t++, k++) { for (let j = 0; j < 3; j++) { v.fromBufferAttribute(pos, ix ? ix.getX(t * 3 + j) : t * 3 + j).applyMatrix4(m.matrixWorld); P[k * 9 + j * 3] = v.x; P[k * 9 + j * 3 + 1] = v.y; P[k * 9 + j * 3 + 2] = v.z; }
      for (let a = 0; a < 3; a++) C[k * 3 + a] = (P[k * 9 + a] + P[k * 9 + 3 + a] + P[k * 9 + 6 + a]) / 3; owner[k] = mi; } });
  const order = new Uint32Array(N); for (let i = 0; i < N; i++) order[i] = i;
  const B = [], kids = [];   // per node: [minx, miny, minz, maxx, maxy, maxz], [left, right] or [-start-1, count]
  const build = (lo, hi) => { const id = B.length, b = [1e30, 1e30, 1e30, -1e30, -1e30, -1e30], cb = b.slice(); B.push(b); kids.push(null);
    for (let i = lo; i < hi; i++) { const t = order[i]; for (let j = 0; j < 9; j++) { const a = j % 3, x = P[t * 9 + j]; if (x < b[a]) b[a] = x; if (x > b[a + 3]) b[a + 3] = x; }
      for (let a = 0; a < 3; a++) { const x = C[t * 3 + a]; if (x < cb[a]) cb[a] = x; if (x > cb[a + 3]) cb[a + 3] = x; } }
    if (hi - lo <= 8) { kids[id] = [-lo - 1, hi - lo]; return id; }
    let ax = 0; for (let a = 1; a < 3; a++) if (cb[a + 3] - cb[a] > cb[ax + 3] - cb[ax]) ax = a;
    const sub = Array.from(order.subarray(lo, hi)).sort((p, q) => C[p * 3 + ax] - C[q * 3 + ax]); order.set(sub, lo);
    const mid = (lo + hi) >> 1, l = build(lo, mid), r = build(mid, hi); kids[id] = [l, r]; return id; };
  if (N) build(0, N);
  const e1 = new T.Vector3(), e2 = new T.Vector3(), pv = new T.Vector3(), tv = new T.Vector3(), qv = new T.Vector3();
  function hit(o, d, far = Infinity) {
    if (!N) return null; const inv = [1 / d.x, 1 / d.y, 1 / d.z], oo = [o.x, o.y, o.z]; let best = far, bt = -1;
    const stack = [0];
    while (stack.length) { const id = stack.pop(), b = B[id]; let t0 = 0, t1 = best;
      for (let a = 0; a < 3; a++) { let ta = (b[a] - oo[a]) * inv[a], tb = (b[a + 3] - oo[a]) * inv[a]; if (ta > tb) { const s = ta; ta = tb; tb = s; } if (ta > t0) t0 = ta; if (tb < t1) t1 = tb; if (t0 > t1) break; }
      if (t0 > t1) continue; const kd = kids[id];
      if (kd[0] >= 0) { stack.push(kd[0], kd[1]); continue; }
      for (let i = -kd[0] - 1, e = i + kd[1]; i < e; i++) { const t = order[i], q = t * 9;
        e1.set(P[q + 3] - P[q], P[q + 4] - P[q + 1], P[q + 5] - P[q + 2]); e2.set(P[q + 6] - P[q], P[q + 7] - P[q + 1], P[q + 8] - P[q + 2]);
        pv.crossVectors(d, e2); const det = e1.dot(pv); if (Math.abs(det) < 1e-12) continue; const id2 = 1 / det;
        tv.set(o.x - P[q], o.y - P[q + 1], o.z - P[q + 2]); const u = tv.dot(pv) * id2; if (u < 0 || u > 1) continue;
        qv.crossVectors(tv, e1); const w = d.dot(qv) * id2; if (w < 0 || u + w > 1) continue; const dist = e2.dot(qv) * id2;
        if (dist > 1e-6 && dist < best) { best = dist; bt = t; } } }
    if (bt < 0) return null; const q = bt * 9;
    const n = new T.Vector3(P[q + 3] - P[q], P[q + 4] - P[q + 1], P[q + 5] - P[q + 2]).cross(new T.Vector3(P[q + 6] - P[q], P[q + 7] - P[q + 1], P[q + 8] - P[q + 2])).normalize();
    if (n.dot(d) > 0) n.negate();
    return { distance: best, point: o.clone().addScaledVector(d, best), n, object: meshes[owner[bt]] };
  }
  return { hit, tris: N };
}

// a big spot is a bare stretch of wall (no window, door or pipe on it) about 1.3 m wide and 1.7 m tall round the spot
const BIG = []; for (let u = -.6; u <= .61; u += .3) for (let v = -.9; v <= .76; v += .3) BIG.push([u, v]);

/**
 * Flat tops (ground) and bare camera-facing walls the camera can see, found by casting rays into the level. The search is
 * lazy: grid cells are visited in a seeded order, each cell's rays are cast at most once (and only as far as a request
 * needs), and a level gets a fixed ray budget.
 */
function spotSource(L, K, rnd, budget = 6000) {
  const occ = solids(L), bvh = triBVH(occ), box = new T.Box3(), none = { take: () => [] };
  for (const o of occ) { o.geometry.boundingBox || o.geometry.computeBoundingBox(); box.union(o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld)); }
  if (box.isEmpty()) return { ground: none, walls: none, used: () => 0 };
  let left = budget;
  const cast = (o, d, far) => { if (left <= 0) return undefined; left--; return bvh.hit(o, d, far); };
  const nrm = (h) => h.n, DOWN = new T.Vector3(0, -1, 0);
  const seen = (p) => K.axes.every(a => cast(p.clone().addScaledVector(a[2], .04), a[2], 200) === null);
  const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const size = box.getSize(new T.Vector3()), st = clamp((size.x + size.z) / 70, .35, .8);
  // ground: a downward ray per cell; real ground has room round it (a post top or a door lintel does not) and can be seen
  const gcells = []; for (let x = box.min.x; x <= box.max.x; x += st) for (let z = box.min.z; z <= box.max.z; z += st) gcells.push({ x, z });
  const groundAt = (c) => { if (c.s !== undefined) return c.s;
    const h = cast(new T.Vector3(c.x, box.max.y + 2, c.z), DOWN, 1e3); if (h === undefined) return null;
    c.s = h && nrm(h).y > .9 ? { p: h.point.clone(), obj: h.object, ok: null } : null; return c.s; };
  const groundOk = (s) => { if (s.ok !== null) return s.ok;
    const roomy = [[.4, 0], [-.4, 0], [0, .4], [0, -.4]].every(([dx, dz]) => { const k = cast(new T.Vector3(s.p.x + dx, box.max.y + 2, s.p.z + dz), DOWN, 1e3); return k && Math.abs(k.point.y - s.p.y) < .06; });
    return (s.ok = roomy && seen(s.p.clone().addScaledVector(Y, .3))); };
  // walls: a ray along the front view's line of sight per cell; keep upright faces that are flat and bare a little way round
  const [R, U, D] = K.axes[0], c0 = box.getCenter(new T.Vector3()), corners = []; for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) corners.push(new T.Vector3(x, y, z).sub(c0));
  const sx = corners.map(q => q.dot(R)), sy = corners.map(q => q.dot(U)), wcells = [];
  for (let u = Math.min(...sx); u <= Math.max(...sx); u += st) for (let v = Math.min(...sy); v <= Math.max(...sy); v += st) wcells.push({ u, v });
  const wallAt = (c) => { if (c.s !== undefined) return c.s;
    const h = cast(c0.clone().addScaledVector(R, c.u).addScaledVector(U, c.v).addScaledVector(D, 150), D.clone().negate(), 400); if (h === undefined) return null;
    const n = h && nrm(h); c.s = h && Math.abs(n.y) < .2 && n.dot(D) > .25 ? { p: h.point.clone(), n, t: new T.Vector3().crossVectors(Y, n).normalize(), obj: h.object, ok: null, big: null } : null; return c.s; };
  const flat = (s, du, dv) => { const k = cast(s.p.clone().addScaledVector(s.n, .3).addScaledVector(s.t, du).addScaledVector(Y, dv), s.n.clone().negate(), .4); return k && k.object === s.obj && Math.abs(k.distance - .3) < .06; };
  const wallOk = (s) => s.ok !== null ? s.ok : (s.ok = [[-.35, -.4], [.35, -.4], [-.35, .4], [.35, .4]].every(([a, b]) => flat(s, a, b)));
  const wallBig = (s) => s.big !== null ? s.big : (s.big = BIG.every(([a, b]) => flat(s, a, b)));
  const placed = [];
  /** Up to n spots clear of the track by rad, of each other (any kind) by sep, passing test. */
  const taker = (cells, at, ok) => (n, rad, sep, test = () => true, big = false) => { const out = [];
    for (const c of cells) { if (out.length >= n || left <= 0) break; const s = at(c); if (!s || out.some(o => o.p.distanceTo(s.p) < sep * SC) || placed.some(o => o.p.distanceTo(s.p) < .5 * SC) || !K.clear(s.p, rad * SC) || !test(s) || !ok(s) || (big && !wallBig(s))) continue; out.push(s); placed.push(s); }
    return out; };
  return { ground: { take: taker(shuffle(gcells), groundAt, groundOk) }, walls: { take: taker(shuffle(wcells), wallAt, wallOk) }, used: () => budget - left };
}

/* ---------- the pieces ---------- */
function grassTuft(L, s, rnd, up) {
  const th = L.th, g = new T.Group(); g.position.copy(s.p); g.scale.setScalar(SC); L.g.add(g);
  const pals = [th.leaf, th.turf, mixPal(th.leaf, th.turf, .5)].filter(Boolean);
  for (let i = 0; i < 5 + Math.floor(rnd() * 3); i++) { const h = .3 + rnd() * .28, m = new T.Mesh(new T.ConeGeometry(.045, h, 3), tri(pals[i % pals.length])); m.geometry.translate(0, h / 2, 0);
    const a = rnd() * TAU, r = rnd() * .18; m.position.set(Math.cos(a) * r, 0, Math.sin(a) * r); m.rotation.set((rnd() - .5) * .5, 0, (rnd() - .5) * .5); g.add(m); }
  if (rnd() < .4) { const f = new T.Mesh(new T.SphereGeometry(.05, 6, 4), tri(tone(['#FF95BE', '#FFE066', '#FFFFFF'][Math.floor(rnd() * 3)]))); f.position.set(0, .5, 0); g.add(f); }
  const ph = rnd() * TAU; up(t => { g.rotation.z = Math.sin(t * 1.3 + ph) * .09 + Math.sin(t * 3.1 + ph) * .02; g.rotation.x = Math.cos(t * 1.1 + ph) * .05; });
}
function butterfly(L, s, rnd, up, color) {
  const g = new T.Group(), wm = basic(color, { side: true }), wing = new T.CircleGeometry(.1, 10), a = new T.Group(), b = new T.Group();
  const w1 = new T.Mesh(wing, wm), w2 = new T.Mesh(wing, wm); w1.position.x = .085; w2.position.x = -.085; a.add(w1); b.add(w2); g.add(a, b); L.g.add(g);
  g.scale.setScalar(SC); const ph = rnd() * TAU, c = s.p.clone().addScaledVector(Y, .55 * SC);
  up(t => { const k = t * .45 + ph; g.position.set(c.x + Math.sin(k) * .45 * SC, c.y + Math.sin(k * 2.3) * .12 * SC, c.z + Math.sin(k * 2) * .25 * SC); g.rotation.y = Math.atan2(Math.cos(k) * .45, Math.cos(k * 2) * .5); const f = Math.sin(t * 15 + ph) * 1.1; a.rotation.z = f; b.rotation.z = -f; });
}
// a cloth hanging off a wall: a banner (one tall strip) or laundry (a line of small ones); the free edge sways
function cloths(L, s, rnd, up, items, line) {
  const g = new T.Group(); L.g.add(g); g.matrixAutoUpdate = false;
  const top = s.p.clone().addScaledVector(Y, .45 * WSC()).addScaledVector(s.n, .05); scaled(g.matrix.makeBasis(s.t, Y, s.n).setPosition(top));
  if (line) { const pts = []; for (let i = 0; i <= 8; i++) { const f = i / 8; pts.push(new T.Vector3(lerp(-.58, .58, f), -Math.sin(f * Math.PI) * .08, 0)); } g.add(new T.Line(new T.BufferGeometry().setFromPoints(pts), new T.LineBasicMaterial({ color: L.th.ink }))); }
  items.forEach(({ x, w, h, c }, i) => { const geo = new T.PlaneGeometry(w, h, 3, 5); geo.translate(0, -h / 2, 0); const base = geo.attributes.position.array.slice(); const m = new T.Mesh(geo, tri(tone(c), { side: true }));
    m.position.set(x, line ? -Math.sin((x + .5) * Math.PI) * .08 : 0, .02); g.add(m); const ph = rnd() * TAU;
    up(t => { const q = geo.attributes.position; for (let k = 0; k < q.count; k++) { const yy = -base[k * 3 + 1] / h; q.setZ(k, (Math.sin(t * 2.2 + ph + base[k * 3] * 6 + yy * 2) * .05 + .03) * yy * yy); } q.needsUpdate = true; }); });
}
// laundry on a line between two posts standing on the ground, broadside to the camera
function washLine(L, s, rnd, up, items) {
  const t = SR.clone().setY(0).normalize(), n = new T.Vector3().crossVectors(t, Y), post = tri(tone(L.th.ink === '#2B2A33' ? '#8A6A4A' : L.th.ink));
  for (const k of [-.6, .6]) { const m = new T.Mesh(new T.CylinderGeometry(.035, .04, 1.1, 6), post); m.position.copy(s.p).addScaledVector(t, k * WSC()).addScaledVector(Y, .55 * WSC()); m.scale.setScalar(WSC()); L.g.add(m); }
  cloths(L, { p: s.p.clone().addScaledVector(Y, .6 * WSC()), n, t }, rnd, up, items, true);
}
function litWindows(L, s, rnd, up, glow) {
  const g = new T.Group(); L.g.add(g); g.matrixAutoUpdate = false; scaled(g.matrix.makeBasis(s.t, Y, s.n).setPosition(s.p.clone().addScaledVector(s.n, .012)));
  const dark = mix(L.th.ink, glow, .12), cols = rnd() < .5 ? [0] : [-.24, .24], rows = rnd() < .5 ? [0] : [-.32, .32], wins = [];
  for (const x of cols) for (const y of rows) { const m = new T.Mesh(new T.PlaneGeometry(.26, .4), basic(glow)); m.position.set(x, y, 0); g.add(m); wins.push({ m, on: rnd() < .8, ph: rnd() * 50, per: 18 + rnd() * 30 }); }
  // a window goes dark (or lights) now and then, and the lit ones breathe a little, like a lamp behind a curtain
  up(t => wins.forEach(w => { const flip = ((t + w.ph) % w.per) < w.per * .22, on = flip ? !w.on : w.on; w.m.material.color.set(on ? mix(glow, '#FFFFFF', Math.max(0, Math.sin(t * .7 + w.ph)) * .18) : dark); }));
}
function wallCogs(L, s, rnd, up) {
  const th = L.th, pal = mixPal(th.pipe || th.idle, { t: th.ink, l: th.ink, r: th.ink }, .12), g = new T.Group(); L.g.add(g); g.matrixAutoUpdate = false; scaled(g.matrix.makeBasis(s.t, s.n, Y.clone().negate()).setPosition(s.p));
  const big = .5 + rnd() * .15, small = big * .55, cogs = [{ r: big, x: 0, z: 0, d: 1 }, { r: small, x: (big + small) * .82 * (rnd() < .5 ? 1 : -1), z: (big + small) * .45, d: -big / small }];
  const ph = rnd() * TAU;
  for (const c of cogs) { const m = new T.Mesh(gearGeo(c.r, Math.round(c.r * 30), .06, .22, c.r * .25), tri(pal)); m.position.set(c.x, .006, c.z); g.add(m);
    const hub = new T.Mesh(new T.CylinderGeometry(c.r * .18, c.r * .18, .09, 10), tri(mixPal(pal, { t: th.ink, l: th.ink, r: th.ink }, .3))); hub.position.set(c.x, .03, c.z); g.add(hub);
    up(t => { m.rotation.y = (t * .25 + ph) * c.d; }); }
}
function steam(L, s, rnd, up) {
  const c = mix('#FFFFFF', skyAt(L.th.sky, .5), .25), base = s.p.clone();
  for (let i = 0; i < 4; i++) { const p = sprite(TEX.puff, .4, .32, c, { opacity: 0 }); L.g.add(p); const ph = rnd();
    up(t => { const f = (t * .22 + ph + i / 4) % 1; p.position.copy(base).addScaledVector(Y, (.1 + f * 1.1) * SC); p.position.x += Math.sin(f * 4 + i) * .08 * SC; p.material.opacity = .5 * Math.sin(f * Math.PI); p.scale.set((.3 + f * .5) * SC, (.24 + f * .4) * SC, 1); }); }
}
function firefly(L, s, rnd, up, color) {
  const p = sprite(TEX.glow, .42 * SC, .42 * SC, color, { add: true, opacity: 0 }); L.g.add(p); const ph = rnd() * TAU, c = s.p.clone().addScaledVector(Y, .35 * SC);
  up(t => { const k = t * .3 + ph; p.position.set(c.x + Math.sin(k) * .4 * SC, c.y + (Math.sin(k * 1.7) * .22 + .1) * SC, c.z + Math.cos(k * 1.3) * .4 * SC); p.material.opacity = .85 * Math.max(0, Math.sin(t * 1.1 + ph)) ** 2; });
}
function crystal(L, s, rnd, up) {
  const R = L.th.ramp || [L.th.stone], m = new T.Mesh(new T.OctahedronGeometry(.3, 0), tri(R[Math.floor(rnd() * R.length)])); m.scale.set(.7 * SC, 1.5 * SC, .7 * SC); L.g.add(m);
  const halo = sprite(TEX.glow, 1.3 * SC, 1.3 * SC, L.th.spark || '#FFFFFF', { add: true, opacity: .35 }); L.g.add(halo);
  const ph = rnd() * TAU, c = s.p.clone().addScaledVector(Y, .9 * SC);
  up(t => { m.position.copy(c).addScaledVector(Y, Math.sin(t * .8 + ph) * .12); m.rotation.y = t * .35 + ph; halo.position.copy(m.position); halo.material.opacity = .25 + .12 * Math.sin(t * 1.3 + ph); });
}

/* ---------- the sky: birds, stars and motes that live behind the scene and fade out wherever the track is ---------- */
function skyLife(L, K, rnd, up, o) {
  const view = L.view, cam = view.camera, R = new T.Vector3(), U = new T.Vector3(), D = new T.Vector3(), items = [];
  const box = () => [cam.left, cam.right, cam.bottom, cam.top];
  // screen-space track mask, rebuilt each frame from the camera's current axes (it turns on crank levels)
  let scr = [];
  // 0 on or beside the track, rising to 1 over the next metre of screen
  const fadeAt = (p, rad) => { const x = p.dot(R), y = p.dot(U); let d = 1e9; for (const [qx, qy, qr] of scr) d = Math.min(d, Math.hypot(x - qx, y - qy) - qr); return clamp((d - rad) / 1, 0, 1); };
  view.trackFade = (p) => fadeAt(p, .3);
  up(() => { R.setFromMatrixColumn(cam.matrixWorld, 0); U.setFromMatrixColumn(cam.matrixWorld, 1); D.setFromMatrixColumn(cam.matrixWorld, 2); scr = K.pts.map(q => [q.p.dot(R), q.p.dot(U), q.r]); });
  const at = (sx, sy, depth) => view.center.clone().addScaledVector(R, sx).addScaledVector(U, sy).addScaledVector(D, depth);
  const add = (s, op, fn) => { view.scene.add(s); up((t, dt) => { fn(t); s.material.opacity = op(t) * fadeAt(s.position, .3); }); };
  if (o.birds) for (let i = 0; i < o.birds.n; i++) { const s = sprite(TEX.bird, .38 * SC, .19 * SC, o.birds.color, { opacity: 0 }), b = { x: rnd(), y: lerp(.7, .93, rnd()), v: .35 + rnd() * .25, f: rnd() * 6, glide: o.birds.glide };
    add(s, () => .75, t => { const [l, r, bt, tp] = box(), W = r - l + 2, x = l - 1 + ((b.x * W + t * b.v) % W), y = lerp(bt, tp, b.y) + Math.sin(t * .5 + b.f) * .25;
      s.position.copy(at(x, y, -50)); const flap = b.glide ? (Math.sin(t * .35 + b.f) > .6 ? Math.abs(Math.sin(t * 6 + b.f)) : .25) : Math.abs(Math.sin(t * 6 + b.f)); s.scale.set(.38 * SC, .19 * SC * (.4 + .6 * flap), 1); }); }
  if (o.stars) for (let i = 0; i < o.stars.n; i++) { const s = sprite(TEX.dot, .06, .06, o.stars.color, { opacity: 0 }), st = { x: rnd(), y: lerp(.55, .97, rnd()), ph: rnd() * TAU, sp: .6 + rnd() };
    add(s, t => .3 + .6 * Math.abs(Math.sin(t * st.sp * .5 + st.ph)), () => { const [l, r, bt, tp] = box(); s.position.copy(at(lerp(l, r, st.x), lerp(bt, tp, st.y), -70)); }); }
  if (o.motes) for (let i = 0; i < o.motes.n; i++) { const m = o.motes, s = sprite(m.tex, m.size, m.size, m.color, { opacity: 0, add: m.add }), q = { x: rnd(), y: rnd(), vx: m.vx * (.5 + rnd()), vy: m.vy * (.5 + rnd()), f: rnd() * TAU };
    add(s, t => (m.opacity ?? .8) * (m.twinkle ? .35 + .65 * Math.abs(Math.sin(t * m.twinkle + q.f)) : 1), t => { const [l, r, bt, tp] = box(), W = r - l, H = tp - bt;
      const x = l + (((q.x * W + t * q.vx) % W) + W) % W, y = bt + (((q.y * H + t * q.vy) % H) + H) % H; s.position.copy(at(x + Math.sin(t * 1.3 + q.f) * .25, y, -30)); s.material.rotation = t * (m.spin ?? 0) + q.f; }); }
}

/** Dress a level with its theme's ambient life. Returns a count of what was placed, by kind. */
function ambient(L) {
  SC = clamp((L.view.camera.right - L.view.camera.left) / 30, 1, 2);
  const th = L.th, rnd = mulberry(L.idx * 4481 + 23), K = keepModel(L), S = spotSource(L, K, rnd), n = {};
  const up = reduce ? (f => f(0, 0)) : (f => L.view.updaters.push(f));   // reduced motion: everything is placed and posed once, then holds still
  const put = (kind, list, fn) => { n[kind] = list.length; list.forEach(s => { const k0 = L.g.children.length; fn(s); for (const o of L.g.children.slice(k0)) o.userData.ambient = kind; }); };
  const sky = { motes: null }; const ground = S.ground.take, walls = S.walls.take;
  if (th.id === 'garden') {
    put('grass', ground(16, .75, .6), s => grassTuft(L, s, rnd, up));
    put('butterflies', ground(3, 1.1, 2.5), (s, i) => butterfly(L, s, rnd, up, ['#FFB5CE', '#FFE066', '#B5D9FF'][Math.floor(rnd() * 3)]));
    sky.birds = { n: 3, color: mix(th.ink, '#FFFFFF', .35) };
  } else if (th.id === 'dusk') {
    put('banners', walls(3, 1.1, 2.2, undefined, true), s => cloths(L, s, rnd, up, [{ x: 0, w: .42, h: 1.25, c: rnd() < .5 ? th.mech.t : th.goal }]));
    sky.birds = { n: 5, color: '#6E5F99' };
  } else if (th.id === 'town') {
    const wash = () => ['#E8435A', '#FFFFFF', '#5B8FDB', '#FFD24A'].sort(() => rnd() - .5).slice(0, 3).map((c, i) => ({ x: -.36 + i * .36, w: .28, h: .36 + rnd() * .14, c }));
    const lines = walls(2, 1.1, 2.5, s => !s.obj.userData.terrain, true); put('laundry', lines, s => cloths(L, s, rnd, up, wash(), true));
    put('washLines', ground(2 - lines.length, 1.2, 3), s => washLine(L, s, rnd, up, wash()));
    sky.birds = { n: 5, color: '#FFFFFF', glide: true };
  } else if (th.id === 'prism') {
    put('crystals', ground(4, 1.2, 2.5, s => K.clear(s.p.clone().addScaledVector(Y, 1.2 * SC), .7 * SC)), s => crystal(L, s, rnd, up));
    sky.motes = { n: 12, tex: TEX.diamond, size: .14, color: '#FFF6C8', vx: .08, vy: .2, twinkle: 1.8, add: true, opacity: .7 };
  } else if (th.id === 'night') {
    put('windows', walls(6, .8, 1.2, undefined, true), s => litWindows(L, s, rnd, up, th.glow || th.goal));
    // the windows the scenery already has (towers, see ./combos.ts) light and go dark one by one too
    const lit = []; L.g.traverse(o => { if (o.userData.window && o.material?.color) { o.material = o.material.clone(); lit.push({ m: o, c: o.material.color.clone(), ph: rnd() * 60, per: 20 + rnd() * 40 }); } });
    n.towerWindows = lit.length; const dim = new T.Color(mix(th.ink, '#000000', .2));
    up(t => lit.forEach(w => w.m.material.color.copy(((t + w.ph) % w.per) < w.per * .2 ? dim : w.c)));
    put('fireflies', ground(7, 1, 1), s => firefly(L, s, rnd, up, '#FFE69A'));
    sky.stars = { n: 26, color: '#FFF4D6' };
  } else if (th.id === 'brass') {
    put('cogs', walls(3, 1.1, 2.2, undefined, true), s => wallCogs(L, s, rnd, up));
    put('steam', ground(2, 1.3, 3, s => K.clear(s.p.clone().addScaledVector(Y, 1.2 * SC), .6 * SC)), s => steam(L, s, rnd, up));
    sky.motes = { n: 14, tex: TEX.dot, size: .05, color: '#FFE7B0', vx: .06, vy: .08, twinkle: 1.2, add: true, opacity: .7 };
  }
  if (!reduce) skyLife(L, K, rnd, up, sky);
  return n;
}

Object.assign($scope, { ambient, ambientKeep: keepModel, ambientSpots: spotSource });
}
