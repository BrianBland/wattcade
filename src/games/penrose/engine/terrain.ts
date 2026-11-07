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

/** The base: each outer outline (with the holes inside it) as one slab, with an underside that steps in three times. */
function drawBase(L, loops, bz, depth, top = 'gravel', side = 'strata') {
  const g = L.g, th = L.th, st = sp(th, 0), mat = surface(th, top, side);
  const under = surface(th, 'gravel', 'strata', { seed: 3, sidePal: { stone: mixPal(st, tone('#5B4636'), .2).l, stoneDark: mixPal(st, tone('#3B2A20'), .3).r } });
  for (const { outer, holes = [], r = .9 } of loops) {
    const o = roundPoly(outer, r), cx = outer.reduce((a, q) => a + q[0], 0) / outer.length, cy = outer.reduce((a, q) => a + q[1], 0) / outer.length;
    land(g, o, bz - depth, bz, mat, holes.map(h => roundPoly(h, Math.min(r, .6))));
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
  // clusters: flat static road at one height, joined through 1 m cells
  const cells = new Map(), lvl = (z) => Math.round(z * 20) / 20;
  for (const q of pts) if (q.flat) { const L0 = lvl(q.z); for (let i = Math.floor(q.x - .9); i <= Math.floor(q.x + .9); i++) for (let j = Math.floor(q.y - .9); j <= Math.floor(q.y + .9); j++) {
    const k = `${L0}|${i}|${j}`; if (!cells.has(k)) cells.set(k, []); cells.get(k).push(q); } }
  const seen = new Set(), comps = [];
  for (const k0 of cells.keys()) { if (seen.has(k0)) continue; const [z0] = k0.split('|').map(Number), stack = [k0], members = new Set(); seen.add(k0);
    while (stack.length) { const k = stack.pop(), [, i, j] = k.split('|').map(Number); for (const q of cells.get(k)) members.add(q);
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const n = `${z0}|${i + di}|${j + dj}`; if (cells.has(n) && !seen.has(n)) { seen.add(n); stack.push(n); } } }
    comps.push({ z: z0, pts: [...members] }); }
  const zMin = Math.min(...all.map(q => q.z)), bz = Math.floor((zMin - inset - 1.0) * 10) / 10;
  // the camera rays, and a box test against them
  const ray = new T.Raycaster(), dirs = yaws.map(y => toCam(y)), UNIT = new T.BoxGeometry(1, 1, 1);
  const boxMesh = (x0, y0, z0, x1, y1, z1) => { const m = new T.Mesh(UNIT); m.scale.set(x1 - x0, z1 - z0, y1 - y0); m.position.set((x0 + x1) / 2, (z0 + z1) / 2, (y0 + y1) / 2); m.updateMatrixWorld(true); return m; };
  const placed = [];
  for (const c of comps.sort((a, b) => b.pts.length - a.pts.length)) {
    if (c.pts.length < 6) continue;
    const top = c.z - inset; let x0 = Math.min(...c.pts.map(q => q.x)) - .8, x1 = Math.max(...c.pts.map(q => q.x)) + .8, y0 = Math.min(...c.pts.map(q => q.y)) - .8, y1 = Math.max(...c.pts.map(q => q.y)) + .8;
    // a fall on this level puts its end on the rim: cut the plateau back to it on the side it leaves by
    const mine = new Set(c.pts.map(q => q.ri)), myFalls = falls.filter(f => mine.has(f.ri) && Math.abs(f.z - c.z) < .1);
    for (const f of myFalls) { if (Math.abs(f.dx) >= Math.abs(f.dy)) { if (f.dx > 0) x1 = Math.min(x1, f.x); else x0 = Math.max(x0, f.x); } else { if (f.dy > 0) y1 = Math.min(y1, f.y); else y0 = Math.max(y0, f.y); } }
    if (x1 - x0 < 1.2 || y1 - y0 < 1.2) continue;
    // its own road must all still stand on it
    if (c.pts.some(q => q.x < x0 - .55 || q.x > x1 + .55 || q.y < y0 - .55 || q.y > y1 + .55)) continue;
    const own = new Set(c.pts);
    // nothing else may stand inside it or just over it, nothing moving may come near, and no other plateau may overlap it
    const crowd = all.some(q => !own.has(q) && q.x > x0 - (q.moving ? 1 : .35) && q.x < x1 + (q.moving ? 1 : .35) && q.y > y0 - (q.moving ? 1 : .35) && q.y < y1 + (q.moving ? 1 : .35) && (q.moving || q.z < top + 1.3) && !(q.ri >= 0 && !q.moving && Math.abs(q.z - c.z) < .06) && !(q.ri < 0 && !q.gap && q.z > top - .1));
    if (crowd || placed.some(p => x0 < p.rect[2] + .3 && x1 > p.rect[0] - .3 && y0 < p.rect[3] + .3 && y1 > p.rect[1] - .3)) continue;
    // and from every camera angle it must stand in front of nothing that has to stay in view
    const box = boxMesh(x0 - .1, y0 - .1, bz, x1 + .1, y1 + .1, top + .05);
    const hides = all.some(q => !own.has(q) && dirs.some(d => { ray.set(q.p.clone().addScaledVector(d, 100), d.clone().negate()); const h = ray.intersectObject(box, false); return h.length && h[0].distance < 99.8; }));
    if (hides) continue;
    placed.push({ rect: [x0, y0, x1, y1], top, z: c.z, falls: myFalls, area: (x1 - x0) * (y1 - y0) });
  }
  if (!placed.length) return [];
  // the base: every plateau grown by a metre, gaps under eighteen metres closed, so it reads as one piece, cut away beyond each fall
  const C = .5, F = new Set(), key = (i, j) => i + ',' + j, minX = Math.min(...placed.map(p => p.rect[0])) - 6, minY = Math.min(...placed.map(p => p.rect[1])) - 6;
  const cell = (x, y) => [Math.floor((x - minX) / C), Math.floor((y - minY) / C)];
  const fillRect = (S, x0, y0, x1, y1) => { const [i0, j0] = cell(x0, y0), [i1, j1] = cell(x1 - 1e-6, y1 - 1e-6); for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) S.add(key(i, j)); };
  for (const p of placed) fillRect(F, p.rect[0] - 1, p.rect[1] - 1, p.rect[2] + 1, p.rect[3] + 1);
  const grow = (S, n) => { let cur = S; for (let s = 0; s < n; s++) { const nx = new Set(cur); for (const k of cur) { const [i, j] = k.split(',').map(Number); for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) nx.add(key(i + a, j + b)); } cur = nx; } return cur; };
  const shrink = (S, n) => { let cur = S; for (let s = 0; s < n; s++) { const nx = new Set(); for (const k of cur) { const [i, j] = k.split(',').map(Number); if ([[1, 0], [-1, 0], [0, 1], [0, -1]].every(([a, b]) => cur.has(key(i + a, j + b)))) nx.add(k); } cur = nx; } return cur; };
  let B0 = shrink(grow(F, 18), 18);
  const under = new Set(); for (const p of placed) fillRect(under, p.rect[0] - .25, p.rect[1] - .25, p.rect[2] + .25, p.rect[3] + .25);
  for (const p of placed) for (const f of p.falls) { const ax = Math.abs(f.dx) >= Math.abs(f.dy), sx = ax ? Math.sign(f.dx) : 0, sy = ax ? 0 : Math.sign(f.dy);
    for (let s = 0; s < 40; s += C / 2) for (let w = -1.1; w <= 1.1; w += C / 2) { const [i, j] = cell(f.x + sx * s + (ax ? 0 : w), f.y + sy * s + (ax ? w : 0)), k = key(i, j); if (!under.has(k)) B0.delete(k); } }
  B0 = grow(shrink(B0, 1), 1);   // no slivers
  for (const k of under) B0.add(k);
  drawBase(L, traceCells(B0, C, minX, minY), bz, 1.2, o.base || 'gravel', 'strata');
  // surfaces: calm ones for the big plateaus, livelier ones only on small
  const big = o.surfaces || ['lawn', 'meadow', 'flagstone'], small = ['courtyard', 'beds', 'meadow', 'lawn'];
  let last = ''; placed.forEach((p, i) => { const pool = (p.area > 24 ? big : small).filter(s => s !== last), s = pool[Math.floor(rnd() * pool.length)]; last = s;
    drawPlateau(L, { rect: p.rect, top: p.top, surf: s, side: rnd() < .7 ? 'ashlar' : 'strata', flush: p.falls.length > 0 }, bz, i); });
  return placed;
}

Object.assign($scope, { land, roundPoly, rrect, terrain, autoTerrain, traceCells });
}
