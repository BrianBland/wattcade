// @ts-nocheck
/* Penrose Pedals engine: the beat composer. A generated level is a chain of stations (loops that hold the wheel) joined
 * by beats, each beat one of the puzzles the hand-built levels are made of:
 *  - gate:    the road out crosses a pool that shows a gate; sprint to ruffle the water and break it
 *  - mirror:  a still pool shows a road from high above; ease off and the reflected road is a road
 *  - clutch:  wind a bridge across a gap and lock it on its catch
 *  - seesaw:  the beam rests tipped away; wind its spring and ride it up a level
 *  - camjoin: the road out stops in the air; a quarter turn of the camera joins it to a lane a level down
 *  - curtain: the road out has a hole; a quarter turn puts a tower in front of it, so it is not there
 *  - doors:   turn the banner on the loop's door until it matches the far door, and ride through
 * The chain runs east (+x) or south (-y) at every step, so on screen it only ever moves one way and never folds back over
 * itself; heights step up (see-saw) and down (camera join). Every beat brings its own build, hint and autopilot policy.
 * composeDef(seed) gives a level definition (campaign item 'bc:<seed>'); levels stand on automatic terrain.
 * Installed into the shared engine scope after levels3 (see ./index.ts). */
import * as T from 'three';

export function install($scope) {
const { B, CY, V, L3, UP, THEMES, sp, tri, tone, basic, rider, mulberry, loopPts, sAt, reflection, skyRoad, clutchBridge, seesawM, cameraCrank, liveGap, matchingDoors, cloudLayer } = $scope;

const UNIT_BOX = new T.BoxGeometry(1, 1, 1);
const HX = 2.6, HY = 1.8;                         // a station loop's half-size
const KEYS = ['y', 'a', 'b', 'z'];
const camDir = (yaw) => yaw === 90 ? [1, -1] : yaw === -90 ? [-1, 1] : [1, 1];   // horizontal part of the view direction (towards the camera)

/** What each beat needs: its length out from the station (gap), the height step, how many buttons it takes, the camera. */
const BEATS = {
  gate: { gap: 8, dz: 0, keys: 0 },
  mirror: { gap: 7, dz: 0, keys: 0 },
  clutch: { gap: 4.8, dz: 0, keys: 1 },
  seesaw: { gap: 9.4, dz: 2, keys: 1 },
  camjoin: { gap: 0, dz: -2, keys: 0, cam: true },
  curtain: { gap: 6.6, dz: 0, keys: 0, cam: true },
  doors: { gap: 6.5, dz: 0, keys: 1 },
};

const ADJ = ['Quiet', 'Tilted', 'Folded', 'Hidden', 'Mirror', 'Lantern', 'Hollow', 'Slow', 'Turning', 'Borrowed', 'Paper', 'Second', 'Sleeping', 'Painted', 'Drifting', 'Patient', 'Silver', 'Crooked', 'Glass', 'Distant'];
const NOUN = ['Causeway', 'Cloister', 'Weir', 'Rampart', 'Terrace', 'Mill', 'Stair', 'Quay', 'Arbour', 'Gallery', 'Landing', 'Basin', 'Belfry', 'Orchard', 'Spillway', 'Court', 'Passage', 'Viaduct', 'Mooring', 'Watch'];

/** Plan a level from a seed: the beat sequence, directions and heights. Pure (no three). */
function composePlan(seed) {
  const R = mulberry((seed * 2654435761) >>> 0), pick = (a) => a[Math.floor(R() * a.length)];
  const n = 3 + (R() < .6 ? 1 : 0) + (R() < .3 ? 1 : 0);
  const yaw = R() < .5 ? 90 : -90, beats = [];
  let z = R() < .5 ? 0 : 2, keys = 0, cam = false;
  for (let i = 0; i < n; i++) {
    const ok = Object.keys(BEATS).filter((b) => {
      const B0 = BEATS[b], last = beats[beats.length - 1];
      if (last && last.kind === b) return false;
      if (beats.filter((q) => q.kind === b).length >= 2) return false;
      if (keys + B0.keys + (B0.cam && !cam ? 1 : 0) > 4) return false;
      if (z + B0.dz < 0 || z + B0.dz > 4) return false;
      if (b === 'mirror' && beats.some((q) => q.kind === 'gate') && last?.kind === 'gate') return false;
      return true; });
    if (!ok.length) break;
    // favour the beats used least so far, so a level mixes its puzzles
    const w = ok.map((b) => 1 / (1 + beats.filter((q) => q.kind === b).length * 2)), tot = w.reduce((a, b) => a + b, 0);
    let r = R() * tot, kind = ok[0]; for (let k = 0; k < ok.length; k++) { r -= w[k]; if (r <= 0) { kind = ok[k]; break; } }
    const B0 = BEATS[kind]; keys += B0.keys + (B0.cam && !cam ? 1 : 0); cam = cam || !!B0.cam;
    // a curtain's tower stands on the camera side of its hole; only one heading per camera angle keeps it clear of the loops
    const dir = kind === 'curtain' ? (yaw === 90 ? 'e' : 's') : kind === 'camjoin' && yaw === 90 ? 'e' : R() < .5 ? 'e' : 's';
    beats.push({ kind, dir, z, want: 1 + Math.floor(R() * 2) }); z += B0.dz;
  }
  const kinds = new Set(beats.map((b) => b.kind));
  if (beats.length < 3 || kinds.size < 3) return null;
  // every station its own size, so the loops are not all one stamp
  const sizes = beats.map(() => [2.2 + R() * 1.4, 1.6 + R() * .9]).concat([[2.2 + R() * 1.4, 1.6 + R() * .9]]);
  return { seed, beats, yaw, cam, sizes, theme: pick([0, 1, 2, 3, 5]), name: `${pick(ADJ)} ${pick(NOUN)}` };
}

/** The level definition for a plan. */
function composeDef(plan) {
  const hintOf = { gate: 'the road out crosses a pool that shows a gate across it: pedal above 86 rpm to ruffle the water and break the gate',
    mirror: 'the still pool shows a road from high above: ease under 78 rpm and the reflected road is a road',
    clutch: (k) => `engage the clutch (<b>${k}</b>) and pedal to wind the bridge across, then press <b>${k}</b> again to lock its tip between the red bollards`,
    seesaw: (k) => `the see-saw rests tipped away: clutch its spring (<b>${k}</b>) and push about 90 rpm until it tips, and keep pushing as you ride it up`,
    camjoin: (k) => `the road out stops in the air: turn the camera (<b>${k}</b>) a quarter and it meets the lane below`,
    curtain: (k) => `the road out has a hole: turn the camera (<b>${k}</b>) a quarter so the tower stands in front of it, and it is not there`,
    doors: (k) => `turn the banner on the loop's door (<b>${k}</b>) until it matches the far door, and the two doors are one` };
  const order = ['First', 'Then', 'Next', 'After that', 'Last'];
  let kn = 0; const camKey = plan.cam ? KEYS[kn++] : null;
  const beats = plan.beats.map((b) => ({ ...b, key: BEATS[b.kind].keys ? KEYS[kn++] : (BEATS[b.kind].cam ? camKey : null) }));
  const hint = beats.map((b, i) => { const h = hintOf[b.kind]; return `${order[Math.min(i, 4)]}, ${typeof h === 'function' ? h(b.key.toUpperCase()) : h}.`; }).join(' ');
  return { id: `bc-${plan.seed}`, name: plan.name, th: () => THEMES[plan.theme], cruise: [62, 95], hint, plan, generated: true, composed: true, terrain: { strip: true, carve: true },
    yaws: plan.cam ? [0, plan.yaw] : [0],
    build(L) { buildComposed(L, plan, beats, camKey); },
    spawn: (L) => ({ road: L.props.S[0], s: 1, dir: 1 }),
    solve(L, W, R) { solveComposed(L, W, R); },
    center: [0, 0, 0], pts: [[0, 0, 0]], pad: .8, scenery: false,
    frame(L) { return L.props.frame; },
    decor(L) { cloudLayer(L.view, L.th, '#FFFFFF', 4, .8, .6, .95, .2); } };
}

function buildComposed(L, plan, beats, camKey) {
  const th = L.th, g = L.g, P = L.props, pal = sp(th, 1), stone = tri(sp(th, 0)), wz = -.04;
  P.S = []; P.beats = []; P.camWant = 0;
  const sz = (i) => plan.sizes?.[i] || [HX, HY];
  const station = (cx, cy, z) => { const [hx, hy] = sz(P.S.length), r = L.road(loopPts(cx - hx, cy - hy, cx + hx, cy + hy, z, .8), { closed: true }); r.c = [cx, cy, z]; r.h = [hx, hy]; P.S.push(r); return r; };
  // the camera crank, shared by every beat that turns the view; it stands inside the first loop
  let S = station(0, 0, beats[0].z);
  if (camKey) P.cam = cameraCrank(L, { key: camKey, name: 'Camera', at: [-Math.min(1.2, sz(0)[0] - 1.3), 0, beats[0].z], detents: [0, plan.yaw] });
  beats.forEach((b, i) => {
    const last = i === beats.length - 1, d = b.dir === 'e' ? [1, 0] : [0, -1], r = [d[1], -d[0]], z = b.z;
    const E = b.dir === 'e' ? [S.c[0] + S.h[0], S.c[1]] : [S.c[0] - .8, S.c[1] - S.h[1]];   // (off the loop's start point, where a fork would never be crossed)
    const W = (u, v = 0, zz = z) => [E[0] + d[0] * u + r[0] * v, E[1] + d[1] * u + r[1] * v, zz];
    const loopDir = b.dir === 'e' ? Math.PI / 2 : 0;     // the loop's heading at its exit point, travelling dir 1
    const st = { kind: b.kind, S, roads: [], key: b.key };
    // the road that ends the beat: it runs on into the next station, or is the road home
    let entry = null;
    const finish = (from, zz) => {      // from: [x, y] where the entry road starts; it runs along d into the next station
      const len = last ? 4 : 1.6, F = [from[0] + d[0] * len, from[1] + d[1] * len];
      entry = L.road(L3([from[0], from[1], zz], [F[0], F[1], zz], UP), last ? { goal: true } : {});
      if (!last) { const [hx, hy] = sz(P.S.length), c = b.dir === 'e' ? [F[0] + hx, F[1]] : [F[0], F[1] - hy]; const T2 = station(c[0], c[1], zz); entry.joins = [{ k: 1, to: T2, s: sAt(T2, [F[0], F[1], zz]), dir: 1 }]; st.T = T2; }
      st.roads.push(entry); return entry; };
    const fork = (to, when, text) => S.forks.push({ s: sAt(S, [E[0], E[1], z]), dir: 1, to, toK: 0, when, text });
    if (b.kind === 'gate' || b.kind === 'mirror') {
      const G = BEATS[b.kind].gap, a = W(.6, -1.4), c = W(G - .6, 1.4), pool = [Math.min(a[0], c[0]), Math.min(a[1], c[1]), Math.max(a[0], c[0]), Math.max(a[1], c[1])];
      if (b.kind === 'gate') {
        const X = L.road(L3(W(0), W(G), UP), {}); st.roads.push(X); const h0 = 3.2, h1 = 4.2, off = h1 - 2 * wz, gateM = tri(tone('#C9503F')), ug = 2.2;
        st.pool = reflection(L, { pool, wz, calm: 78, over(og) {
          const at = (p, zz) => V(p[0] - off, p[1] - off, zz);
          const box = (s, p, zz, mat, rc) => { const m = new T.Mesh(UNIT_BOX, mat); m.scale.set(s[0], s[2], s[1]); m.position.copy(at(p, zz)); m.userData.rc = rc; og.add(m); };
          const across = b.dir === 'e' ? [.16, 2.2] : [2.2, .16];
          for (const v of [-.8, -.4, 0, .4, .8]) { const p = W(ug, v); box([.1, .1, h1 - h0], p, (h0 + h1) / 2, gateM, '#E2563F'); const tip = new T.Mesh(new T.ConeGeometry(.09, .22, 4), gateM); tip.rotation.x = Math.PI; tip.position.copy(at(p, h0 - .1)); tip.userData.rc = '#E2563F'; og.add(tip); }
          for (const zz of [h1, h0 + .35]) box([...across, .14], W(ug, 0), zz, gateM, '#E2563F');
          for (const v of [-1.2, 1.2]) { const p = W(ug, v), zt = h1 + .5, cyl = new T.Mesh(new T.CylinderGeometry(.2, .24, zt + 2.4, 12), stone); cyl.position.copy(at(p, (zt - 2.4) / 2)); cyl.userData.rc = '#E5CFA0'; og.add(cyl); (L.anchors ||= []).push([p[0] - off, p[1] - off, 1.1]); }
        } });
        X.joins = []; finishFrom(X);
        fork(X, () => st.pool.ruffled(), 'The ruffled pool shows no gate, so there is none');
      } else {
        const Wt = L.road(L3(W(0), W(G), UP), { noDeck: true, noLane: true }); st.roads.push(Wt);
        st.pool = reflection(L, { pool, wz, calm: 78, over(og) { skyRoad(L, og, L3(W(0, 0, .006), W(G, 0, .006), UP), 5, wz, -2.4); } });
        finishFrom(Wt);
        fork(Wt, () => st.pool.still(), 'The still pool shows a road, so there is one');
      }
    } else if (b.kind === 'clutch') {
      const G = BEATS.clutch.gap, X1 = L.road(L3(W(0), W(1), UP), {}), X2 = L.road(L3(W(G - 1), W(G), UP), {}); st.roads.push(X1, X2);
      const bp = W(.2, 1.3); st.br = clutchBridge(L, { from: X1, to: X2, key: b.key, btn: [bp[0], bp[1]], btnZ: z }); CY(g, bp[0], bp[1], .55, z - 2.4, z - .02, stone, 24);
      st.span = G - 2; finishFrom(X2);
      fork(X1, () => st.br.locked(), 'The bridge is locked, so the wheel heads for it');
    } else if (b.kind === 'seesaw') {
      const a = Math.asin(1 / 2.5), X2 = 5 * Math.cos(a), base = b.dir === 'e' ? 180 : 90;
      const A1 = L.road(L3(W(0), W(3), UP), {}); st.roads.push(A1);
      st.ss = seesawM(L, { P: W(3 + X2), base, sd: 1, key: b.key, name: 'Spring' }); st.roads.push(st.ss.beam);
      { const fe = W(3 + X2); (L.terrainCarve ||= []).push([fe[0], fe[1], 1.5]); }
      const B1 = L.road(L3(W(3 + X2, 0, z + 2), W(BEATS.seesaw.gap, 0, z + 2), UP), { pal }); st.roads.push(B1);
      finishFrom(B1, z + 2);
      fork(A1, () => st.ss.tip > .95, 'The beam is over, so the way up is open');
    } else if (b.kind === 'camjoin') {
      const [vx, vy] = camDir(plan.yaw), La = 3.5;
      const A1 = L.road(L3(W(0), W(La), UP), { pal, edgeText: 'From here the road stops in the air' }); st.roads.push(A1);
      const e = W(La), lo = [e[0] - 2 * vx, e[1] - 2 * vy];
      // the lane below starts where the road's end meets it on screen from the turned view, and runs on along d
      const lane = L.road(L3([lo[0], lo[1], z - 2], [lo[0] + d[0] * 2, lo[1] + d[1] * 2, z - 2], UP), {}); st.roads.push(lane);
      (L.terrainCarve ||= []).push([e[0] - .5 * vx, e[1] - .5 * vy, 1.4]);   // so the land under the road's end hides no part of the lane
      st.yaw = plan.yaw; finishFrom(lane, z - 2);
      fork(A1, () => P.cam.at(plan.yaw), 'From this side the road meets the lane below');
    } else if (b.kind === 'curtain') {
      const G = BEATS.curtain.gap, X1 = L.road(L3(W(0), W(2.4), UP), {}), X2 = L.road(L3(W(3.6), W(G), UP), {}); st.roads.push(X1, X2);
      const [vx, vy] = camDir(plan.yaw), hc = W(3), tc = [hc[0] + 2.4 * vx, hc[1] + 2.4 * vy], tw = new T.Group(); g.add(tw);
      B(tw, tc[0] - .7, tc[1] - .7, z - 2.4, tc[0] + .7, tc[1] + .7, z + 3.6, stone); B(tw, tc[0] - .85, tc[1] - .85, z + 3.6, tc[0] + .85, tc[1] + .85, z + 3.8, tri(th.roof || th.mech || sp(th, 2)));
      (L.anchors ||= []).push([tc[0], tc[1], 1.4]);
      st.gap = liveGap(L, X1, 1, X2, 0, () => [tw], { text: 'Behind the tower, from here, so the hole was not there' }); st.yaw = plan.yaw;
      finishFrom(X2);
      fork(X1, () => st.gap.hidden(), 'From here the hole is behind the tower');
    } else if (b.kind === 'doors') {
      const far = W(3), X = L.road(L3(far, W(BEATS.doors.gap), UP), {}); st.roads.push(X);
      const ang = Math.PI - loopDir, farAng = Math.PI - Math.atan2(d[1], d[0]);
      const btn = b.dir === 'e' ? [-1.2, 0] : [0, 1.2];
      st.doors = matchingDoors(L, { road: S, at: [E[0], E[1]], ang, atZ: z, to: X, far: [far[0], far[1]], farAng, z, key: b.key, want: b.want, btn, rtShift: 2 });
      finishFrom(X);
    }
    function finishFrom(rd, zz = z) { const e = rd.end(1).p; finish([e.x, e.z], zz); rd.joins = [...(rd.joins || []), { k: 1, to: entry, s: 0, dir: 1 }]; }
    P.beats.push(st);
    if (!last) S = st.T;
  });
  // framing: every road point, low and high
  const ps = []; for (const r of L.roads) for (const q of r.S || []) ps.push([q.p.x, q.p.z, q.p.y]);
  const lo = [0, 1, 2].map((j) => Math.min(...ps.map((p) => p[j]))), hi = [0, 1, 2].map((j) => Math.max(...ps.map((p) => p[j])));
  P.frame = { center: lo.map((v, j) => (v + hi[j]) / 2), pts: [[lo[0] - 1, lo[1] - 1, lo[2] - 2], [hi[0] + 1, hi[1] + 1, hi[2] + 1], [lo[0] - 1, hi[1] + 1, lo[2]], [hi[0] + 1, lo[1] - 1, hi[2]]] };
  L.view.updaters.push(() => { const bi = P.at ?? 0, st = P.beats[bi]; L.say(`beat ${Math.min(bi + 1, P.beats.length)} of ${P.beats.length} · ${st ? st.kind : 'home'} · ${Math.round(rider.cad)} rpm`); });
}

/** The autopilot: whichever beat the wheel is at, do what that beat asks. */
function solveComposed(L, W, R) {
  const P = L.props; R.gear = 4; R.cad = 76;
  let bi = P.beats.findIndex((st) => st.S === W.road || st.roads.includes(W.road));
  if (bi < 0) bi = P.beats.length; P.at = bi;
  const st = P.beats[bi], onS = st && st.S === W.road;
  let camWant = 0;
  for (const q of P.beats) { if (q.br && q !== st && q.br.m.on) q.br.m.set(false); if (q.ss && q !== st) q.ss.m.set(false); }
  if (st) {
    if (st.kind === 'gate' && onS) R.cad = 92;
    if (st.kind === 'mirror' && onS) R.cad = 66;
    if (st.kind === 'clutch' && (onS || W.road === st.roads[0])) { const br = st.br; if (!br.m.on && !br.spans()) br.m.set(true); else if (br.m.on && br.len > st.span + .3) br.m.set(false); }
    if (st.kind === 'seesaw') { const push = onS || W.road === st.roads[0] || (W.road === st.ss.beam && st.ss.tip > .5); st.ss.m.set(push); if (push) R.cad = 92; }
    if (st.kind === 'camjoin' || st.kind === 'curtain') camWant = st.yaw;
    if (st.kind === 'doors' && onS && !st.doors.match() && (L.view.t || 0) % 1 < .05) st.doors.m.set(!st.doors.m.on);
  }
  if (P.cam) P.cam.m.set(!P.cam.at(camWant));
}

Object.assign($scope, { BEATS, composePlan, composeDef });
}
