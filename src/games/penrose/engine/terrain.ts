// @ts-nocheck
/* Penrose Pedals engine: terrain. Plateaus of different heights standing on one floating base, every top and side a
 * painted surface (./surfaces.ts), with a pale stone rim round each plateau, a plinth where it meets the base, rounded
 * corners throughout and a stepped underside.
 *  - terrain(L, o): a hand-placed layout (base outline + plateau rects).
 *  - autoTerrain(L, o): lays plateaus under a built level's own roads, for the generators (def.terrain). It groups the flat
 *    road at each height into clusters and gives each a plateau, keeping only plateaus that hide no road, hole or machine
 *    from any camera angle, crowd no lower road and no moving machine; a road end where the wheel falls is put on the
 *    plateau's rim, and the base is cut away beyond it, so the fall goes off the edge of the world.
 * Installed into the shared engine scope after surfaces (see ./index.ts). */
import * as T from 'three';

export function install($scope) {
const { mixPal, mulberry, sp, surface, tone, tri, toCam } = $scope;

/** A slab of land with any outline (sketch x, y points) and optional holes, from z0 up to z1: one mesh, so no seams across its top. */
function land(g, outline, z0, z1, mat, holes = []) {
  const v = (pts) => pts.map(([x, y]) => new T.Vector2(x, -y)), sh = new T.Shape(v(outline));
  for (const h of holes) sh.holes.push(new T.Path(v(h)));
  const geo = new T.ExtrudeGeometry(sh, { depth: z1 - z0, bevelEnabled: false, curveSegments: 1 });
  geo.rotateX(-Math.PI / 2); geo.translate(0, z0, 0); const m = new T.Mesh(geo, mat); m.userData.terrain = true; g.add(m); return m;
}
/** Round every corner of a polygon (convex or concave) with radius r (clamped to half of each edge). */
function roundPoly(pts, r, seg = 8) {
  const out = [], n = pts.length;
  for (let i = 0; i < n; i++) {
    const p = pts[i], a = pts[(i + n - 1) % n], b = pts[(i + 1) % n], la = Math.hypot(a[0] - p[0], a[1] - p[1]), lb = Math.hypot(b[0] - p[0], b[1] - p[1]), rr = Math.min(r, la / 2, lb / 2);
    const p0 = [p[0] + (a[0] - p[0]) / la * rr, p[1] + (a[1] - p[1]) / la * rr], p1 = [p[0] + (b[0] - p[0]) / lb * rr, p[1] + (b[1] - p[1]) / lb * rr];
    // a quadratic through the corner is close to a circular arc for right angles and stays smooth for any other
    for (let k = 0; k <= seg; k++) { const t = k / seg, u = 1 - t; out.push([u * u * p0[0] + 2 * u * t * p[0] + t * t * p1[0], u * u * p0[1] + 2 * u * t * p[1] + t * t * p1[1]]); }
  }
  return out;
}
const rrect = (x0, y0, x1, y1, r) => roundPoly([[x0, y0], [x1, y0], [x1, y1], [x0, y1]], r);
const area = (P) => P.reduce((a, p, i) => { const q = P[(i + 1) % P.length]; return a + p[0] * q[1] - q[0] * p[1]; }, 0) / 2;
const inside = (P, x, y) => { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const [xi, yi] = P[i], [xj, yj] = P[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; } return c; };

/** Chaikin corner cutting: a cell staircase becomes a smooth, organic curve (closed polygon). */
function smooth(P, n = 3) { let Q = P; for (let it = 0; it < n; it++) { const R = []; for (let i = 0; i < Q.length; i++) { const a = Q[i], b = Q[(i + 1) % Q.length]; R.push([a[0] * .75 + b[0] * .25, a[1] * .75 + b[1] * .25], [a[0] * .25 + b[0] * .75, a[1] * .25 + b[1] * .75]); } Q = R; } return Q; }
/** Push a smooth counter-clockwise polygon out by d (in by a negative d), along each vertex's averaged normal. */
function offsetPoly(P, d) {
  const n = P.length, E = P.map((p, i) => { const q = P[(i + 1) % n], l = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1; return [(q[1] - p[1]) / l, -(q[0] - p[0]) / l]; });
  return P.map((p, i) => { const a = E[(i + n - 1) % n], b = E[i], m = [a[0] + b[0], a[1] + b[1]], l = Math.hypot(...m) || 1, u = [m[0] / l, m[1] / l], k = Math.max(.5, u[0] * b[0] + u[1] * b[1]); return [p[0] + u[0] * d / k, p[1] + u[1] * d / k]; });
}
/** An extruded outline as a loose mesh (not added to the scene), for ray tests. */
function landMesh(outline, z0, z1) { const g = new T.Group(), m = land(g, outline, z0, z1, DEPTH); m.updateMatrixWorld(true); return m; }
const DEPTH = new T.MeshBasicMaterial({ side: T.DoubleSide });
/** A plateau of any smooth outline: plinth, painted body, and a rim of pale stone just proud of the top. */
function drawShape(L, t, bz, i) {
  const g = L.g, th = L.th, st = sp(th, 0), cope = tri({ t: mixPal(st, tone('#FFFFFF'), .45).l, l: st.l, r: st.r }), plinth = tri(mixPal({ t: st.l, l: st.l, r: st.r }, tone('#5B4636'), .15));
  if (!t.flush) land(g, offsetPoly(t.outline, .14), bz, bz + .2, plinth);
  land(g, t.outline, bz + .2, t.top, surface(th, t.surf || 'lawn', t.side || 'ashlar', { seed: 5 + i }));
  land(g, offsetPoly(t.outline, .06), t.top - .12, t.top + .03, cope, [offsetPoly(t.outline, -.14)]);
}
/** The base: each outer outline (with the holes inside it) as one slab, with an underside that steps in three times. */
function drawBase(L, loops, bz, depth, top = 'gravel', side = 'strata') {
  const g = L.g, th = L.th, st = sp(th, 0), mat = surface(th, top, side);
  const under = surface(th, 'gravel', 'strata', { seed: 3, sidePal: { stone: mixPal(st, tone('#5B4636'), .2).l, stoneDark: mixPal(st, tone('#3B2A20'), .3).r } });
  for (const { outer, holes = [], r = .9 } of loops) {
    const o = r > 0 ? roundPoly(outer, r) : outer, cx = outer.reduce((a, q) => a + q[0], 0) / outer.length, cy = outer.reduce((a, q) => a + q[1], 0) / outer.length;
    land(g, o, bz - depth, bz, mat, holes.map(h => r > 0 ? roundPoly(h, Math.min(r, .6)) : h));
    [[.94, .5], [.82, .6], [.6, .7]].reduce((z, [k, h]) => { land(g, o.map(([x, y]) => [cx + (x - cx) * k, cy + (y - cy) * k]), z - h, z, under); return z - h; }, bz - depth);
  }
}
/** A plateau on the base: plinth, body (painted top and sides) and a rounded rim of pale stone just proud of the top. */
function drawPlateau(L, t, bz, i) {
  const g = L.g, th = L.th, st = sp(th, 0), cope = tri({ t: mixPal(st, tone('#FFFFFF'), .45).l, l: st.l, r: st.r }), plinth = tri(mixPal({ t: st.l, l: st.l, r: st.r }, tone('#5B4636'), .15));
  const [x0, y0, x1, y1] = t.rect, top = t.top, cw = .2, ov = .06, r = t.r ?? Math.min(1.1, (x1 - x0) / 3, (y1 - y0) / 3);
  if (!t.flush) land(g, rrect(x0 - .14, y0 - .14, x1 + .14, y1 + .14, r + .14), bz, bz + .2, plinth);
  land(g, rrect(x0, y0, x1, y1, r), bz + .2, top, surface(th, t.surf || 'lawn', t.side || 'ashlar', { seed: 5 + i }));
  land(g, rrect(x0 - ov, y0 - ov, x1 + ov, y1 + ov, r + ov), top - .12, top + .03, cope, [rrect(x0 - ov + cw, y0 - ov + cw, x1 + ov - cw, y1 + ov - cw, Math.max(.05, r + ov - cw))]);
}

/**
 * A hand-placed layout. A plateau's z is the road level on it; its top sits .5 below, where loop slabs sit, so turntable
 * arms swing clear. o: { base: { outline: [[x, y]...], z, depth, top, side, r }, tops: [{ rect: [x0, y0, x1, y1], z, top, side, flush, r }] }
 */
function terrain(L, o) {
  const { z: bz, depth = 1.2 } = o.base;
  drawBase(L, [{ outer: o.base.outline, r: o.base.r ?? .9 }], bz, depth, o.base.top, o.base.side);
  o.tops.forEach((t, i) => drawPlateau(L, { ...t, top: t.z - .5, surf: t.top }, bz, i));
}

/** Trace the outline loops of filled cells (size c, origin ox, oy) as polygons: outers counter-clockwise, holes clockwise. */
function traceCells(filled, c, ox, oy) {
  const E = new Map(), key = (x, y) => x + ',' + y, F = (i, j) => filled.has(key(i, j));
  const add = (a, b) => { const k = key(...a); if (!E.has(k)) E.set(k, []); E.get(k).push(b); };
  for (const k of filled) { const [i, j] = k.split(',').map(Number);
    if (!F(i, j - 1)) add([i, j], [i + 1, j]); if (!F(i + 1, j)) add([i + 1, j], [i + 1, j + 1]);
    if (!F(i, j + 1)) add([i + 1, j + 1], [i, j + 1]); if (!F(i - 1, j)) add([i, j + 1], [i, j]); }
  const loops = [];
  while (E.size) {
    const [k0] = E.keys(), start = k0.split(',').map(Number), loop = [start]; let cur = start, prev = null;
    for (let guard = 0; guard < 100000; guard++) {
      const k = key(...cur), outs = E.get(k); if (!outs) break;
      // at a pinch point take the sharpest left turn, so touching corners split into separate loops
      let pick = 0; if (outs.length > 1 && prev) { const d0 = [cur[0] - prev[0], cur[1] - prev[1]]; pick = outs.findIndex(n => (d0[0] * (n[1] - cur[1]) - d0[1] * (n[0] - cur[0])) > 0); if (pick < 0) pick = 0; }
      const nx = outs.splice(pick, 1)[0]; if (!outs.length) E.delete(k);
      prev = cur; cur = nx; if (cur[0] === start[0] && cur[1] === start[1]) break; loop.push(cur);
    }
    // drop the points in the middle of straight runs
    const P = loop.filter((p, i) => { const a = loop[(i + loop.length - 1) % loop.length], b = loop[(i + 1) % loop.length]; return (p[0] - a[0]) * (b[1] - p[1]) - (p[1] - a[1]) * (b[0] - p[0]) !== 0; });
    if (P.length >= 4) loops.push(P.map(([i, j]) => [ox + i * c, oy + j * c]));
  }
  const outers = loops.filter(P => area(P) > 0).map(outer => ({ outer, holes: [] }));
  for (const h of loops.filter(P => area(P) < 0)) { const o = outers.find(O => inside(O.outer, h[0][0] + 1e-3, h[0][1] + 1e-3) || inside(O.outer, ...h[0])); if (o) o.holes.push(h); }
  return outers;
}

/**
 * Plateaus under a built level's roads. o: { inset (top below road level, default .52 so loop slabs stay just proud),
 * seed, surfaces: [...] }. Returns the plateaus placed (empty when none fits, and then nothing is drawn).
 */
function autoTerrain(L, o = {}) {
  const yaws = L.def.yaws || [0], inset = o.inset ?? .52, rnd = mulberry((o.seed ?? (L.idx || 0) * 977 + 41) >>> 0);
  L.g.updateMatrixWorld(true);
  // every road point in the world, sketch coordinates (x, y, z = up); flat static road is what plateaus can carry
  const pts = [], tmp = new T.Vector3(), nn = new T.Vector3();
  L.roads.forEach((r, ri) => { if (!r.S || r.S.length < 2) return; const M = r.g ? r.g.matrixWorld : null;
    for (let i = 0; i + 1 < r.S.length; i++) { const a = r.S[i], b = r.S[i + 1], n = Math.max(1, Math.ceil(a.p.distanceTo(b.p) / .3));
      for (let k = 0; k < n || (i + 2 === r.S.length && k === n); k++) { const t = k / n; tmp.copy(a.p).lerp(b.p, t); nn.copy(a.n).lerp(b.n, t).normalize(); if (M) { tmp.applyMatrix4(M); nn.transformDirection(M); }
        pts.push({ x: tmp.x, y: tmp.z, z: tmp.y, ri, flat: !M && nn.y > .97, moving: !!M && !r.turntable, p: tmp.clone() }); } } });
  if (!pts.length) return [];
  const extra = [];   // machine holders and the ends of every hole: these must stay in view too
  for (const m of L.machines) { const p = new T.Vector3(); m.bloom?.holder?.getWorldPosition(p); extra.push({ x: p.x, y: p.z, z: p.y, ri: -1, p }); }
  for (const r of L.roads) for (const gp of r.gaps) { const a = r.end(gp.k).p, b = gp.to.end(gp.toK).p; for (let i = 0; i <= 6; i++) { const p = a.clone().lerp(b, i / 6); extra.push({ x: p.x, y: p.z, z: p.y, ri: -1, p, gap: true }); } }
  const all = pts.concat(extra);
  // open road ends: no other road within reach and no join, i.e. where the wheel would fall (and hole ends)
  const falls = [];
  L.roads.forEach((r, ri) => { if (r.closed || r.g || !r.S || r.S.length < 2 || r.goal) return;
    for (const k of [0, 1]) { const e = r.end(k), joined = (r.joins || []).some(j => j.k === k), gap = r.gaps.some(gp => gp.k === k);
      const near = pts.some(q => q.ri !== ri && q.p.distanceTo(e.p) < .45) || extra.some(q => !q.gap && q.p.distanceTo(e.p) < .9);
      if (gap || (!joined && !near)) falls.push({ ri, x: e.p.x, y: e.p.z, z: e.p.y, dx: e.out.x, dy: e.out.z }); } });
  // plateau shapes live on one grid of half-metre cells: each cluster of flat road at one height takes the cells within a
  // metre of it, loses the cells beyond each fall (and across each hole), has its loops filled in, and is smoothed to curves
  const C = .5, gx = Math.min(...all.map(q => q.x)) - 10, gy = Math.min(...all.map(q => q.y)) - 10, key = (i, j) => i + ',' + j;
  const cellOf = (x, y) => [Math.floor((x - gx) / C), Math.floor((y - gy) / C)], ctr = (i, j) => [gx + (i + .5) * C, gy + (j + .5) * C];
  const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const grow = (S, n) => { let cur = S; for (let s = 0; s < n; s++) { const nx = new Set(cur); for (const k of cur) { const [i, j] = k.split(',').map(Number); for (const [a, b] of N4) nx.add(key(i + a, j + b)); } cur = nx; } return cur; };
  const shrink = (S, n) => { let cur = S; for (let s = 0; s < n; s++) { const nx = new Set(); for (const k of cur) { const [i, j] = k.split(',').map(Number); if (N4.every(([a, b]) => cur.has(key(i + a, j + b)))) nx.add(k); } cur = nx; } return cur; };
  const parts = (S) => { const seen = new Set(), out = []; for (const k0 of S) { if (seen.has(k0)) continue; const st = [k0], P = new Set([k0]); seen.add(k0);
    while (st.length) { const [i, j] = st.pop().split(',').map(Number); for (const [a, b] of N4) { const n = key(i + a, j + b); if (S.has(n) && !seen.has(n)) { seen.add(n); P.add(n); st.push(n); } } } out.push(P); } return out; };
  const fillHoles = (S) => { let i0 = 1e9, i1 = -1e9, j0 = 1e9, j1 = -1e9; for (const k of S) { const [i, j] = k.split(',').map(Number); i0 = Math.min(i0, i); i1 = Math.max(i1, i); j0 = Math.min(j0, j); j1 = Math.max(j1, j); }
    i0--; i1++; j0--; j1++; const out = new Set([key(i0, j0)]), st = [[i0, j0]];
    while (st.length) { const [i, j] = st.pop(); for (const [a, b] of N4) { const ni = i + a, nj = j + b, n = key(ni, nj); if (ni < i0 || ni > i1 || nj < j0 || nj > j1 || out.has(n) || S.has(n)) continue; out.add(n); st.push([ni, nj]); } }
    const F = new Set(); for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) if (!out.has(key(i, j))) F.add(key(i, j)); return F; };
  const cut = (S, f) => { const len = f.len ?? 6; for (const k of [...S]) { const [i, j] = k.split(',').map(Number), [cx, cy] = ctr(i, j), u = (cx - f.x) * f.dx + (cy - f.y) * f.dy, w = Math.abs((cx - f.x) * f.dy - (cy - f.y) * f.dx);
    if (u > -.1 && u < len + .1 && w < 1.3) S.delete(k); } };
  // hole ends cut only across the hole; an open end cuts everything beyond it
  for (const f of falls) { const r = L.roads[f.ri], gp = r.gaps.find(g => { const e = r.end(g.k).p; return Math.abs(e.x - f.x) < 1e-3 && Math.abs(e.z - f.y) < 1e-3; }); if (gp) { const b = gp.to.end(gp.toK).p; f.len = Math.hypot(b.x - f.x, b.z - f.y); } }
  const levels = new Map(); for (const q of pts) if (q.flat) { const z0 = Math.round(q.z * 20) / 20; if (!levels.has(z0)) levels.set(z0, []); levels.get(z0).push(q); }
  const comps = [];
  for (const [z0, qs] of levels) {
    const S = new Set(); for (const q of qs) { const [i, j] = cellOf(q.x, q.y); for (let a = -3; a <= 3; a++) for (let b = -3; b <= 3; b++) { const [cx, cy] = ctr(i + a, j + b); if (Math.hypot(cx - q.x, cy - q.y) < 1.05) S.add(key(i + a, j + b)); } }
    const fs = falls.filter(f => Math.abs(f.z - z0) < .1); for (const f of fs) cut(S, f);
    for (const P of parts(S)) { const F = fillHoles(P), own = qs.filter(q => F.has(key(...cellOf(q.x, q.y)))); if (own.length >= 6) comps.push({ z: z0, cells: F, pts: own, falls: fs.filter(f => F.has(key(...cellOf(f.x - f.dx * .3, f.y - f.dy * .3)))) }); }
  }
  const zMin = Math.min(...all.map(q => q.z)), bz = Math.floor((zMin - inset - 1.0) * 10) / 10;
  const ray = new T.Raycaster(), dirs = yaws.map(y => toCam(y)), taken = new Set();
  const placed = [];
  for (const c of comps.sort((a, b) => b.pts.length - a.pts.length)) {
    const top = c.z - inset, own = new Set(c.pts), near = grow(c.cells, 1), far = grow(c.cells, 2);
    // nothing else may stand on it or just over it, nothing moving may come near, and no other plateau may touch it
    const crowd = all.some(q => { if (own.has(q)) return false; const k = key(...cellOf(q.x, q.y));
      if (q.moving) return far.has(k); if (!near.has(k)) return false;
      if (q.ri >= 0 && Math.abs(q.z - c.z) < .06) return false;          // more road on this level, or a turntable arm
      if (q.ri < 0 && !q.gap && q.z > top - .1) return false;            // a machine standing on it
      if (q.gap && Math.abs(q.z - c.z) < .2) return false;               // a hole on this level (its cells were cut away)
      return q.z < top + 1.3; });
    if (crowd || [...near].some(k => taken.has(k))) continue;
    const outline = traceCells(c.cells, C, gx, gy).map(o => smooth(o.outer));
    if (!outline.length) continue;
    // and from every camera angle it must stand in front of nothing that has to stay in view
    const body = outline.map(o => landMesh(o, bz, top + .05)), hides = all.some(q => !own.has(q) && dirs.some(d => { ray.set(q.p.clone().addScaledVector(d, 100), d.clone().negate()); return body.some(m => { const h = ray.intersectObject(m, false); return h.length && h[0].distance < 99.8; }); }));
    if (hides) continue;
    for (const k of c.cells) taken.add(k);
    placed.push({ outline, cells: c.cells, top, z: c.z, falls: c.falls, area: c.cells.size * C * C });
  }
  if (!placed.length) return [];
  // the base: every plateau grown by a metre, gaps under eighteen metres closed so it reads as one piece, cut away beyond each fall
  const F = new Set(); for (const p of placed) for (const k of grow(p.cells, 2)) F.add(k);
  let B0 = shrink(grow(F, 18), 18); const under = new Set(); for (const p of placed) for (const k of p.cells) under.add(k);
  for (const p of placed) for (const f of p.falls) if (f.len === undefined) { for (const k of [...B0]) { if (under.has(k)) continue; const [i, j] = k.split(',').map(Number), [cx, cy] = ctr(i, j), u = (cx - f.x) * f.dx + (cy - f.y) * f.dy, w = Math.abs((cx - f.x) * f.dy - (cy - f.y) * f.dx); if (u > -.1 && w < 1.2) B0.delete(k); } }
  B0 = grow(shrink(B0, 1), 1); for (const k of under) B0.add(k);
  drawBase(L, traceCells(B0, C, gx, gy).map(o => ({ outer: smooth(o.outer), holes: o.holes.map(h => smooth(h)), r: 0 })), bz, 1.2, o.base || 'gravel', 'strata');
  // surfaces: calm ones for the big plateaus, livelier ones only on small
  const big = o.surfaces || ['lawn', 'meadow', 'flagstone'], small = ['courtyard', 'beds', 'meadow', 'lawn'];
  let last = ''; placed.forEach((p, i) => { const pool = (p.area > 24 ? big : small).filter(s => s !== last), s = pool[Math.floor(rnd() * pool.length)]; last = s;
    for (const ol of p.outline) drawShape(L, { outline: ol, top: p.top, surf: s, side: rnd() < .7 ? 'ashlar' : 'strata', flush: p.falls.length > 0 }, bz, i); });
  return placed;
}

Object.assign($scope, { land, roundPoly, rrect, smooth, offsetPoly, terrain, autoTerrain, traceCells });
}
