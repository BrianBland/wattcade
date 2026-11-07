// @ts-nocheck
/* Penrose Pedals engine: the screen-space audit for a loaded level. Per camera angle it lists roads that overlap on
 * screen without meeting, road samples hidden behind something that is not that road, and the perspective joins.
 * Used by scripts/penrose-audit.mjs while designing levels. */
import * as T from 'three';

export function install($scope) {
const { SD } = $scope;

function auditLevel(L, o = {}) {
  const view = L.view, def = L.def, yaws = def.yaws || [0], Yx = new T.Vector3(0, 1, 0), out = [], step = o.step || .3;
  const own = new Map(); L.roads.forEach((r, i) => r.vis.forEach(m => own.set(m, i)));
  const skip = new Set(); if (L.wheel) L.wheel.traverse(m => skip.add(m));
  const meshes = []; L.g.traverse(m => { if (m.isMesh && !skip.has(m) && m.visible !== false && !(m.material && m.material.transparent)) meshes.push(m); });
  const name = r => { for (const [k, v] of Object.entries(L.props)) { if (v === r) return k; if (v && typeof v === 'object') for (const [k2, v2] of Object.entries(v)) if (v2 === r) return k + '.' + k2; } return 'r' + L.roads.indexOf(r); };
  const ray = new T.Raycaster();
  for (const yd of yaws) {
    view.yaw = yd * Math.PI / 180; view.aim(); L.g.updateMatrixWorld(true);
    const v2 = L.v2, dir2 = (p, d) => v2(p.clone().add(d)).sub(v2(p)); for (const r of L.roads) r.refresh(v2, dir2);
    const SDr = SD.clone().applyAxisAngle(Yx, view.yaw);
    // perspective-joined ends at this angle (screen-coincident ends of different roads, or a road's own two ends)
    const ends = []; L.roads.forEach(r => { if (r.closed) return; for (const k of [0, 1]) ends.push({ r, k, p: r.end(k).p.clone() }); });
    const joins = []; for (let i = 0; i < ends.length; i++) for (let j = i + 1; j < ends.length; j++) { const a = ends[i], b = ends[j]; if (v2(a.p).distanceTo(v2(b.p)) < .25 && a.p.distanceTo(b.p) > .3) joins.push([a, b]); }
    const nearJoin = (r, s) => joins.some(([a, b]) => [a, b].some(e => e.r === r && (e.k ? r.L - s : s) < 1.6));
    const S = L.roads.filter(r => !r.noDeck || r.closed).map(r => { const pts = []; for (let s = 0; s <= r.L; s += step) { const q = r.at(s); pts.push({ s, p: q.p, q2: v2(q.p) }); } return { r, pts }; });
    const over = {}, hid = {};
    for (let a = 0; a < S.length; a++) for (let b = a; b < S.length; b++) { const A = S[a], B = S[b]; let n = 0;
      for (const pa of A.pts) for (const pb of B.pts) { if (a === b && Math.abs(pa.s - pb.s) < 3) continue; if (a === b && A.r.closed && A.r.L - Math.abs(pa.s - pb.s) < 3) continue;
        if (pa.q2.distanceTo(pb.q2) < .9 && pa.p.distanceTo(pb.p) > 1.4 && !(nearJoin(A.r, pa.s) && nearJoin(B.r, pb.s))) n++; }
      if (n > (a === b ? 1 : 0)) over[name(A.r) + (a === b ? '' : '×' + name(B.r))] = n; }
    for (const { r, pts } of S) { let n = 0; for (const pt of pts) { const p = pt.p.clone(); p.y += .02; ray.set(p.clone().addScaledVector(SDr, 100), SDr.clone().negate()); const h = ray.intersectObjects(meshes, false).find(h => own.get(h.object) !== L.roads.indexOf(r));
        if (h && h.distance < 99.75) n++; } if (n) hid[name(r)] = `${n}/${pts.length}`; }
    const jv = joins.map(([a, b]) => { const p = (a.p.y > b.p.y ? a : b).p.clone(); return `${name(a.r)}${a.k}~${name(b.r)}${b.k}`; });
    out.push({ yaw: yd, over, hid, joins: jv });
  }
  view.yaw = 0; view.aim();
  return out;
}

Object.assign($scope, { auditLevel });
}
