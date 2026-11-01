// @ts-nocheck
/* Penrose Pedals engine: The curtain generator: a road with three holes, each hidden from one view by a tower, a cadence terrace or a shutter.
 * Installed into the shared engine scope in order (see ./index.ts); names come in from $scope and go back out to it. */
import * as T from 'three';

export function install($scope) {
const { B, CY, Road, TAU, THEMES, V, at, boxMesh, cameraCrank, clamp, clearSpot, cloudLayer, cutSamples, hiddenGap, hidesGap, loopPts, loopSlab, mixPal, mulberry, rider, rnd, sAt, setTri, sp, toCam, tone, tower, tri, turtle, viewDir } = $scope;

/* ================= generated curtains: a road with holes in it, each hidden from one point of view by a tower, a lifted terrace or a raised shutter ================= */
// The plan is pure geometry, made from a seed: a loop, a winding road out of it, three holes (one per machine), and for each hole an occluder placed
// straight in front of it along the camera's line of sight. A plan is kept only if every occluder hides its hole from the one
// view it is meant for, not from the others, and stands in front of no other piece of road from any view.
const CURTAIN_NAMES = [['Veil', 'Shutter', 'Lantern', 'Screen', 'Shadow', 'Blind', 'Curtain', 'Hidden', 'Folded', 'Quiet'], ['Walk', 'Lane', 'Terrace', 'Causeway', 'Arcade', 'Steps', 'Gallery', 'Rampart', 'Garden', 'Quay']];
function curtainPlan(seed) {
  const rnd = mulberry(seed * 7717 + 3), pick = a => a[Math.floor(rnd() * a.length)], vdv = y => { const v = viewDir(y); return [v[0], v[1], v[2]]; };
  const gw = 3.4 + Math.round(rnd() * 3) * .4, gh = 2.6 + Math.round(rnd() * 2) * .4;
  // three holes, three machines: a tower seen past from one camera angle, a terrace on a cadence lift, a shutter raised by a button
  const kinds = pick([['shutter', 'cam', 'lift'], ['cam', 'shutter', 'lift'], ['lift', 'cam', 'shutter'], ['shutter', 'lift', 'cam'], ['cam', 'lift', 'shutter'], ['lift', 'shutter', 'cam']]);
  // the road: west out of the loop's north-west corner, then three or four turns, straights and ramps
  const t = turtle(.6, gh, 180, 0), segs = []; let s = 0;
  const run = (len, gr = 0) => { t.gr(gr); const a = s; t.fwd(len); s += len * Math.hypot(1, gr); segs.push([a, s, gr]); t.gr(0); };
  run(2.6 + rnd() * 2.4);
  const turns = 4 + (rnd() < .5 ? 1 : 0);
  for (let i = 0; i < turns; i++) { const tr = pick([90, -90]); t.arc(1.1, tr); s += 1.1 * Math.PI / 2; run(3.2 + rnd() * 2.8, pick([0, 0, .3, -.3])); }
  const S = t.pts;
  // no crossings, and clear of the loop
  for (let i = 0; i < S.length; i += 3) { const p = S[i].p; if (i > 30 && p[0] > -1 && p[0] < gw + 1 && p[1] > -1 && p[1] < gh + 1) return null;
    for (let j = i + 50; j < S.length; j += 3) { const q = S[j].p; if (Math.hypot(p[0] - q[0], p[1] - q[1]) < 2 && Math.abs(p[2] - q[2]) < 2.2) return null; } }
  // three holes on three different straights (never on a ramp: the hole's ends must sit level)
  const flat = segs.map((g, i) => [g, i]).filter(([g]) => g[2] === 0 && g[1] - g[0] > 3.4);
  if (flat.length < 3) return null;
  const chosen = []; while (chosen.length < 3) { const c = Math.floor(rnd() * flat.length); if (!chosen.includes(c)) chosen.push(c); } chosen.sort((a, b) => a - b);
  const hs = chosen.map(c => flat[c][0]).map(g => g[0] + 1.1 + rnd() * (g[1] - g[0] - 3.4));
  const road = new Road(S), gap = a => [road.at(a).p.clone(), road.at(a + 1.2).p.clone()];
  const holes = hs.map((a, i) => ({ a, kind: kinds[i], pab: gap(a) }));
  const yaws = [0, 90];
  // the loop counts as road too, for the checks
  const G = new Road(loopPts(0, 0, gw, gh, 0, .6)), roads = [road, G];
  const near = (p, h) => p.distanceTo(h.pab[0].clone().lerp(h.pab[1], .5)) < 1.6;
  const covers = (meshes, skip) => { const ray = new T.Raycaster(); let n = 0;
    for (const r of roads) for (let x = 0; x <= r.L; x += .4) { const p = r.at(x).p; if (skip(p)) continue;
      for (const y of yaws) { const d = toCam(y); ray.set(p.clone().addScaledVector(d, 100), d.clone().negate()); const h = ray.intersectObjects(meshes, false); if (h.length && h[0].distance < 99.8) return true; }
      for (const m of meshes) { const bb = new T.Box3().setFromObject(m).expandByScalar(.6); if (bb.containsPoint(p)) return true; } }
    return false; };
  const tb = (x0, y0, z0, x1, y1, z1) => [x0, z0, y0, x1, z1, y1];   // sketch box to three box
  // a tower hides its hole from the side view (from the front it would always hide it, and the loop would never hold the wheel);
  // the terrace and the shutter hide theirs from whichever view the seed picks, so the camera matters for them too
  for (const h of holes) {
    h.yaw = h.kind === 'cam' ? 90 : pick([0, 90]);
    const pa = [h.pab[0].x, h.pab[0].z, h.pab[0].y], pb = [h.pab[1].x, h.pab[1].z, h.pab[1].y], vd = vdv(h.yaw);
    let ok = null;
    for (const k of [3.5, 4.5, 5.5, 3, 6.5, 2.5, 7.5]) {
      const qa = pa.map((v, j) => v + vd[j] * k), qb = pb.map((v, j) => v + vd[j] * k), x0 = Math.min(qa[0], qb[0]) - .5, x1 = Math.max(qa[0], qb[0]) + .5, y0 = Math.min(qa[1], qb[1]) - .5, y1 = Math.max(qa[1], qb[1]) + .5, zc = (qa[2] + qb[2]) / 2;
      if (h.kind === 'cam') {
        const top = zc + .55, box = tb(Math.min(x0, x1 - 1.3), Math.min(y0, y1 - 1.3), top - 9, x1, y1, top), m = [boxMesh(box)];
        if (!hidesGap(m, h.pab[0], h.pab[1], h.yaw) || hidesGap(m, h.pab[0], h.pab[1], h.yaw ? 0 : 90)) continue;
        if (covers(m, p => near(p, h))) continue;
        ok = { k, tower: [Math.min(x0, x1 - 1.3), Math.min(y0, y1 - 1.3), x1, y1, top] }; break;
      } else {
        const hi = tb(x0 - .3, y0 - .3, zc - .25, x1 + .3, y1 + .3, zc + .2), lo = hi.slice(); lo[1] -= 2.4; lo[4] -= 2.4;
        const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, post = tb(cx - .2, cy - .2, -7, cx + .2, cy + .2, zc - .25), mh = [boxMesh(hi)];
        if (!hidesGap(mh, h.pab[0], h.pab[1], h.yaw) || hidesGap([boxMesh(lo)], h.pab[0], h.pab[1], h.yaw) || hidesGap(mh, h.pab[0], h.pab[1], h.yaw ? 0 : 90)) continue;
        if (covers([boxMesh(hi), boxMesh(lo), boxMesh(post)], p => near(p, h))) continue;
        ok = { k, deck: [x0 - .3, y0 - .3, x1 + .3, y1 + .3, zc], post: [cx, cy] }; break;
      }
    }
    if (!ok) return null; Object.assign(h, ok);
  }
  // the tower must not hide another hole from that hole's own view, or that hole's machine would not matter
  for (const h of holes) for (const o of holes) if (o !== h && o.tower) { const box = tb(o.tower[0], o.tower[1], o.tower[4] - 9, o.tower[2], o.tower[3], o.tower[4]); if (hidesGap(box, h.pab[0], h.pab[1], h.yaw)) return null; }
  const theme = Math.floor(rnd() * 6), name = `${pick(CURTAIN_NAMES[0])} ${pick(CURTAIN_NAMES[1])}`;
  return { seed, gw, gh, S, holes: holes.map(h => ({ a: h.a, kind: h.kind, yaw: h.yaw, tower: h.tower, deck: h.deck, post: h.post })), yaws, theme, name };
}
function curtainDef(plan) {
  const { gw, gh, S, holes, yaws } = plan;
  const all = S.map(q => q.p).concat([[-.6, -.6, 0], [gw + .6, gh + .6, 0]]); for (const h of holes) if (h.tower) all.push([h.tower[0], h.tower[1], h.tower[4]], [h.tower[2], h.tower[3], h.tower[4] - 4]); else all.push([h.deck[0], h.deck[1], h.deck[4] + 1.4], [h.deck[2], h.deck[3], h.deck[4] - 3]);
  const lo = [0, 1, 2].map(j => Math.min(...all.map(p => p[j]))), hi = [0, 1, 2].map(j => Math.max(...all.map(p => p[j])));
  const view = y => y ? 'the side view' : 'the front view', step = h => h.kind === 'lift' ? `spin up to lift the terrace (from ${view(h.yaw)})` : h.kind === 'shutter' ? `raise the shutter (from ${view(h.yaw)})` : 'turn the camera to the side, past the tower';
  return { id: `curtain-${plan.seed}`, name: plan.name, th: () => THEMES[plan.theme], cruise: [55, 92], yaws, generated: true,
    hint: `A hole you cannot see is not there. Three holes cut the road home, each hidden from one point of view only: a tower hides one from the side, a terrace on a cadence lift (no button: about 55 rpm keeps it low, 85 lifts it into place) hides another, and a shutter you raise with <b>A</b> hides the third. <b>Y</b> turns the camera. The loop lets the wheel go only when the road ahead looks whole. In order: ${holes.map(step).join('; then ')}.`,
    build(L) {
      const th = L.th, g = L.g, P = L.props;
      const G = L.road(loopPts(0, 0, gw, gh, 0, .6), { closed: true }); P.G = G; loopSlab(g, -.5, -.5, gw + .5, gh + .5, -.5, tri(th.turf || sp(th, 0)), .9);
      let rest = S, off = 0; const pieces = [];
      for (const h of holes) { const [A, Bs] = cutSamples(rest, h.a - off, h.a - off + 1.2); pieces.push(A); rest = Bs; off = h.a + 1.2; }
      pieces.push(rest); P.pieces = pieces.map((ps, i) => L.road(ps, i === pieces.length - 1 ? { goal: true } : {}));
      const e = S[S.length - 1].p; B(g, e[0] - .9, e[1] - .9, e[2] - 2.4, e[0] + .9, e[1] + .9, e[2] - .5, tri(sp(th, 1)));
      // occluders: the tower stands on its own; the terrace and the shutter ride slim telescoping posts, 2.4 m apart between down and up
      const telescope = (grp, h) => { const [cx, cy] = h.post, z = h.deck[4]; CY(g, cx, cy, .28, -7, z - 3.1, tri(th.idle), 14); CY(grp, cx, cy, .2, z - 3.1, z - .7, tri(th.idle), 14); };
      P.holes = holes.map((h, i) => {
        let occ, mover = null;
        if (h.tower) { const [x0, y0, x1, y1, top] = h.tower, o = tower(L, x0, y0, x1, y1, top); occ = () => [o]; }
        else { const grp = new T.Group(); g.add(grp); grp.position.y = -2.4; const [x0, y0, x1, y1, z] = h.deck; mover = { grp, lvl: 0, z: 0, up: false };
          if (h.kind === 'lift') { B(grp, x0, y0, z - .25, x1, y1, z + .2, tri(th.turf || sp(th, 0))); B(grp, x0 + .1, y0 + .1, z - .7, x1 - .1, y1 - .1, z - .25, tri(sp(th, 0)));
            if (th.leaf) for (const f of [.25, .75]) { const x = x0 + (x1 - x0) * f, y = y0 + (y1 - y0) * (1 - f); CY(grp, x, y, .07, z + .2, z + .6, tri(tone('#9B7046')), 6); const cr = new T.Mesh(new T.IcosahedronGeometry(.36, 0), tri(th.leaf)); at(grp, cr, x, y, z + .85); }
            else { const [cx, cy] = h.post; CY(grp, cx, cy, .3, z + .2, z + .7, tri(sp(th, 0)), 14); const dm = new T.Mesh(new T.SphereGeometry(.34, 14, 7, 0, TAU, 0, Math.PI / 2), tri(th.roof || th.mech)); at(grp, dm, cx, cy, z + .7); } }
          else { // the shutter: a slatted panel in a frame, in the machine colour
            const sm = tri(th.mech, { fresh: true }); mover.mat = sm; B(grp, x0, y0, z - .25, x1, y1, z + .2, sm);
            for (const f of [.2, .4, .6, .8]) B(grp, x0 - .04, y0 - .04, z - .25 + .45 * f - .02, x1 + .04, y1 + .04, z - .25 + .45 * f + .02, tri(th.mechDark || th.idle));
            B(grp, x0 - .08, y0 - .08, z - .7, x1 + .08, y1 + .08, z - .25, tri(th.mechDark || th.idle)); }
          telescope(grp, h); occ = () => mover.z === 2.4 ? [grp] : []; }
        const hg = hiddenGap(L, P.pieces[i], 1, P.pieces[i + 1], 0, occ, { text: h.tower ? 'Behind the tower, so the hole was not there' : h.kind === 'lift' ? 'Behind the terrace, so the hole was not there' : 'Behind the shutter, so the hole was not there' });
        return Object.assign({ kind: h.kind, yaw: h.yaw, mover }, hg); });
      G.forks.push({ s: sAt(G, [.6, gh, 0]), dir: 1, to: P.pieces[0], toK: 0, when: () => P.holes[0].hidden(), text: 'The road ahead looks whole, so the wheel rides on' });
      const xs = [lo[0] - 2, hi[0] + 2], ys = [lo[1] - 2, hi[1] + 2], spots = [[xs[1], ys[0], 0], [xs[1], ys[1], 0], [gw + 2.4, gh / 2, 0], [gw / 2, -2.4, 0], [xs[0], ys[1], 0], [xs[0], ys[0], 0], [gw + 2.4, -2, 0], [-2.4, -2, 0]];
      const camAt = clearSpot(L, spots, yaws); P.cam = cameraCrank(L, { key: 'y', name: 'Camera', at: camAt, detents: [0, 90] });
      const L_ = P.holes.find(h => h.kind === 'lift').mover, SH = P.holes.find(h => h.kind === 'shutter').mover; P.liftM = L_; P.shutter = SH;
      (L.drags ||= []).push(() => L_.moving ? .2 : 0);
      const snap = m => { let z = m.lvl * 2.4; for (const f of [0, 2.4]) if (Math.abs(m.lvl * 2.4 - f) < .3) z = f; m.z = z; m.grp.position.y = z - 2.4; };
      L.view.updaters.push((t, dt) => { if (L.state !== 'play') return; const target = clamp((rider.cad - 55) / 30, 0, 1), prev = L_.lvl; L_.lvl += clamp(target - L_.lvl, -.67 * dt, .67 * dt); L_.moving = Math.abs(L_.lvl - prev) > 1e-5; snap(L_); });
      // the shutter's button: hold it and pedal to wind it up or down; let go and it settles at the nearer end
      SH.sweep = 1; const at2 = clearSpot(L, spots.filter(q => q !== camAt), yaws);
      SH.m = L.machine({ key: 'a', name: 'Shutter', size: .55, place: h => { h.position.copy(V(at2[0], at2[1], at2[2] + .04)); g.add(h); },
        tick(dt, drive) { if (drive > 0) { SH.lvl += SH.sweep * drive * .35; if (SH.lvl <= 0 || SH.lvl >= 1) { SH.lvl = clamp(SH.lvl, 0, 1); SH.sweep *= -1; } }
          else SH.lvl += clamp((SH.lvl > .5 ? 1 : 0) - SH.lvl, -.7 * dt, .7 * dt);
          snap(SH); setTri(SH.mat, mixPal(th.mech, tone(th.goal), clamp(this.bloom.e, 0, 1))); const off = Math.min(SH.lvl, 1 - SH.lvl); return drive > 0 ? .25 + .6 * Math.exp(-((off / .08) ** 2)) : 0; } });
      CY(g, at2[0], at2[1], .6, at2[2] - 2.4, at2[2] - .02, tri(sp(th, 0)), 28);
      L.view.updaters.push(() => { if (L.state !== 'play') return; L.say(`cadence ${Math.round(rider.cad)} rpm · terrace ${L_.z === 2.4 ? 'up' : L_.z === 0 ? 'down' : 'moving'} · shutter ${SH.z === 2.4 ? 'up' : SH.z === 0 ? 'down' : 'moving'} · camera ${P.cam.at(0) ? 'front' : P.cam.at(90) ? 'side' : 'turning'} · holes ${P.holes.map(h => h.hidden() ? 'hidden' : 'seen').join(', ')}`); });
    },
    spawn: L => ({ road: L.props.G, s: 1, dir: 1 }),
    solve(L, W, R) { const P = L.props, i = W.road === P.G ? 0 : P.pieces.indexOf(W.road), h = P.holes[i]; R.gear = 4;
      let want = P.cam.at(90) ? 90 : 0, cad = 62, sh = false; if (h) { want = h.yaw; if (h.kind === 'lift') cad = 85; if (h.kind === 'shutter') sh = P.shutter.z !== 2.4; } else cad = 70;
      R.cad = cad; P.shutter.m.set(sh); P.cam.m.set(!P.cam.at(want)); },
    center: lo.map((v, j) => (v + hi[j]) / 2), pts: [lo, hi, [lo[0], hi[1], lo[2]], [hi[0], lo[1], hi[2]]], pad: .8,
    decor(L) { cloudLayer(L.view, L.th, '#FFFFFF', 4, .8, .6, .95, .2); } };
}


Object.assign($scope, { CURTAIN_NAMES, curtainPlan, curtainDef });
}
