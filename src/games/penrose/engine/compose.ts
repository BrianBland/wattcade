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
 * The chain turns as it goes (any heading but straight back), so a level winds round on itself; a layout check keeps every
 * part clear of the others on the ground and on screen from both camera angles. Heights step up (see-saw) and down (camera join). Every beat brings its own build, hint and autopilot policy.
 * composeDef(seed) gives a level definition (campaign item 'bc:<seed>'); levels stand on automatic terrain.
 * Installed into the shared engine scope after levels3 (see ./index.ts). */
import * as T from 'three';

export function install($scope) {
const { B, CY, V, L3, UP, THEMES, sp, tri, tone, basic, rider, mulberry, turtle, loopPts, sAt, reflection, skyRoad, clutchBridge, seesawM, cameraCrank, liveGap, matchingDoors, cloudLayer } = $scope;

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

const DIRS = { e: [1, 0], n: [0, 1], w: [-1, 0], s: [0, -1] };
const OPP = { e: 'w', w: 'e', n: 's', s: 'n' };
/** Where a beat heading `dir` leaves a station (centre c, half-size h). The loop runs anticlockwise from the middle of its
 * south side; the south exit sits .8 west of that point, since a fork at a loop's start point would never be crossed. */
const exitOf = (c, h, dir) => dir === 'e' ? [c[0] + h[0], c[1]] : dir === 'w' ? [c[0] - h[0], c[1]] : dir === 'n' ? [c[0], c[1] + h[1]] : [c[0] - .8, c[1] - h[1]];
/** The loop's heading at that exit point, travelling dir 1. */
const loopHeading = { e: Math.PI / 2, n: Math.PI, w: -Math.PI / 2, s: 0 };
/** The centre of the station a beat heading `dir` runs into at F (the entry road's end); an entry from the south also
 * keeps clear of the start point. */
const stationAt = (F, h, dir) => dir === 'e' ? [F[0] + h[0], F[1]] : dir === 'w' ? [F[0] - h[0], F[1]] : dir === 'n' ? [F[0] + .8, F[1] + h[1]] : [F[0], F[1] - h[1]];
const ENTRY = 1.6, GOAL = 4;
/** A knot: the road on to the next loop runs on, swings round a 270 degree turn while it climbs (or drops) two levels,
 * and crosses back over itself on a bridge, leaving square to the way it came. KR is the turn's radius, KA the run before
 * it; the crossing is KA - KR along. */
const KR = 2.6, KA = 4.8;
function knotShape(S0, d, z, side, dz, el) {
  const l = [-d[1] * side, d[0] * side], P = (u, v) => [S0[0] + d[0] * u + l[0] * v, S0[1] + d[1] * u + l[1] * v];
  const box = (u0, u1, v0, v1, z0, z1) => ({ pts: [P(u0, v0), P(u1, v0), P(u1, v1), P(u0, v1)], z0, z1 });
  const z2 = z + dz, lo = Math.min(z, z2), hi = Math.max(z, z2);
  return { d2: [-l[0], -l[1]], z2, F: P(KA - KR, -(2 + el)), cross: P(KA - KR, 0),
    // (the turn is checked against its own beat and the loops either side too; the straights join them)
    parts: [{ ...box(0, KA, -.6, .6, z, z), knot: true }, { ...box(KA - KR - .6, KA + KR + .6, -.6, 2 * KR + .6, lo, hi), knot: true, strict: true }, { ...box(KA - KR - .6, KA - KR + .6, -(2 + el), KR, z2, z2), knot: true, own: true }] };
}
/** Which headings a beat may take for the level's camera angle. A camera join's lane and a curtain's tower stand off the
 * road along the view direction; only these headings keep them clear of the road and the loops. */
const dirsFor = (kind, yaw) => kind === 'curtain' ? [yaw === 90 ? 'e' : 's'] : kind === 'camjoin' ? (yaw === 90 ? ['e', 'n', 'w'] : ['e', 's']) : ['e', 'n', 'w', 's'];

/** A beat's geometry from its exit point E along d at height z: where its road ends (the entry road starts there) and the
 * blocks it occupies, for the layout check. */
function beatShape(kind, E, d, z, yaw) {
  const r = [d[1], -d[0]], W = (u, v = 0) => [E[0] + d[0] * u + r[0] * v, E[1] + d[1] * u + r[1] * v];
  const box = (u0, u1, v0, v1, z0, z1) => ({ pts: [W(u0, v0), W(u1, v0), W(u1, v1), W(u0, v1)], z0, z1 });
  const B0 = BEATS[kind];
  if (kind === 'seesaw') return { end: W(B0.gap), z: z + 2, parts: [box(0, B0.gap, -.9, .9, z, z + 2)] };
  if (kind === 'camjoin') {
    const [vx, vy] = camDir(yaw), e = W(3.5), lo = [e[0] - 2 * vx, e[1] - 2 * vy], end = [lo[0] + d[0] * 2, lo[1] + d[1] * 2];
    const lane = { pts: [lo, end, [end[0] + r[0] * .01, end[1] + r[1] * .01], [lo[0] + r[0] * .01, lo[1] + r[1] * .01]], z0: z - 2, z1: z - 2 };
    return { end, z: z - 2, parts: [box(0, 3.5, -.6, .6, z, z), lane] };
  }
  if (kind === 'curtain') {
    const [vx, vy] = camDir(yaw), hc = W(3), tc = [hc[0] + 2.4 * vx, hc[1] + 2.4 * vy];
    return { end: W(B0.gap), z, parts: [box(0, B0.gap, -.6, .6, z, z), { pts: [[tc[0] - .85, tc[1] - .85], [tc[0] + .85, tc[1] - .85], [tc[0] + .85, tc[1] + .85], [tc[0] - .85, tc[1] + .85]], z0: z - 2.4, z1: z + 3.8, tall: true, air: true }] };
  }
  const wide = kind === 'gate' || kind === 'mirror' ? 1.5 : .6, parts = [box(0, B0.gap, -wide, wide, z, z)];
  // what the pool reflects is really there, up in the air off along the view diagonal: the sky road, the hung gate
  const up = (bx, sh) => ({ ...bx, pts: bx.pts.map((p) => [p[0] - sh, p[1] - sh]), tall: true });
  if (kind === 'mirror') parts.push({ ...up(box(-.3, B0.gap + .3, -.7, .7, 4.8, 5), 5), air: true });    // (on two slim posts)
  if (kind === 'gate') parts.push({ ...up(box(1.8, 2.6, -1.5, 1.5, 3.1, 4.8), 4.28), air: true });
  return { end: W(B0.gap), z, parts };
}

// ---- the layout check: no two parts of the chain that are not neighbours may touch, on the ground or on screen ----
const hull = (P) => { P = P.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]); const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]); const lo = [], up = [];
  for (const p of P) { while (lo.length > 1 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
  for (const p of P.slice().reverse()) { while (up.length > 1 && cr(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
  return lo.slice(0, -1).concat(up.slice(0, -1)); };
/** Do two convex polygons come within `gap` of each other (separating axes)? */
function touch(A, B, gap) {
  for (const Q of [A, B]) for (let i = 0; i < Q.length; i++) {
    const a = Q[i], b = Q[(i + 1) % Q.length], n = [b[1] - a[1], a[0] - b[0]], l = Math.hypot(n[0], n[1]) || 1;
    const pr = (P) => P.map((p) => (p[0] * n[0] + p[1] * n[1]) / l);
    const pa = pr(A), pb = pr(B);
    if (Math.max(...pa) + gap <= Math.min(...pb) || Math.max(...pb) + gap <= Math.min(...pa)) return false;
  }
  return true;
}
/** A part as drawn from yaw: its top (where the road is) and its whole column down to the land's base. */
const onScreen = (part, yaw, top) => { const [vx, vy] = camDir(yaw), pts = [];
  for (const p of part.pts) for (const zz of top || part.air ? [part.z0, part.z1] : [part.z0 - 3, part.z1]) pts.push([(vy * p[0] - vx * p[1]) / Math.SQRT2, (2 * zz - vx * p[0] - vy * p[1]) / Math.sqrt(6)]);
  return hull(pts); };
const depth = (part, yaw) => { const [vx, vy] = camDir(yaw); let s = 0; for (const p of part.pts) s += vx * p[0] + vy * p[1]; return s / part.pts.length + (part.z0 + part.z1) / 2; };
function clashes(part, placed, yaws) {
  for (const q of placed) {
    const hard = (a, b) => (a.strict || a.own) && !b.knot;
    if (q.k === part.k ? !(hard(part, q) || hard(q, part)) : Math.abs(q.k - part.k) <= 1 && !q.tall && !part.tall && !q.strict && !part.strict) continue;
    if (!q.tall && !part.tall && touch(part.pts, q.pts, .9)) return true;           // on the ground (towers may stand beside roads)
    for (const yaw of yaws) {
      // the nearer part, column and all, must not cover the farther one's road
      const [near, far] = depth(part, yaw) > depth(q, yaw) ? [part, q] : [q, part];
      if (touch(onScreen(near, yaw, false), onScreen(far, yaw, true), .25)) return true;
    }
  }
  return false;
}
const stationPart = (c, h, z, k) => ({ pts: [[c[0] - h[0] - .3, c[1] - h[1] - .3], [c[0] + h[0] + .3, c[1] - h[1] - .3], [c[0] + h[0] + .3, c[1] + h[1] + .3], [c[0] - h[0] - .3, c[1] + h[1] + .3]], z0: z, z1: z + .3, k });

/** Plan a level from a seed: the beat sequence, headings, heights and where every station stands. Pure (no three).
 * The chain turns as it goes, so a level winds round on itself instead of running off in a line; the layout check keeps
 * every part clear of the others on the ground and from both camera angles. */
function composePlan(seed) {
  const R = mulberry((seed * 2654435761) >>> 0), pick = (a) => a[Math.floor(R() * a.length)];
  const n = 3 + (R() < .45 ? 1 : 0) + (R() < .15 ? 1 : 0);
  const yaw = R() < .5 ? 90 : -90, beats = [], yaws = [0, yaw];
  const sizes = Array.from({ length: n + 1 }, () => [2 + R() * 1.1, 1.5 + R() * .7]);
  let z = R() < .5 ? 0 : 2, keys = 0, cam = false, c = [0, 0], prev = null, knots = R() < .6 ? 1 : 0;
  const placed = [stationPart(c, sizes[0], z, 0)], centers = [[0, 0, z]];
  for (let i = 0; i < n; i++) {
    const ok = Object.keys(BEATS).filter((b) => {
      const B0 = BEATS[b], last = beats[beats.length - 1];
      if (last && last.kind === b) return false;
      if (beats.filter((q) => q.kind === b).length >= 2) return false;
      if (keys + B0.keys + (B0.cam && !cam ? 1 : 0) > 4) return false;
      if (z + B0.dz < 0 || z + B0.dz > 4) return false;
      if (b === 'mirror' && last?.kind === 'gate') return false;
      return true; });
    // favour the beats used least so far, so a level mixes its puzzles
    const w = ok.map((b) => 1 / (1 + beats.filter((q) => q.kind === b).length * 2));
    let chosen = null;
    while (ok.length && !chosen) {
      const tot = w.reduce((a, b) => a + b, 0); let rr = R() * tot, ki = 0; for (let k = 0; k < ok.length; k++) { rr -= w[k]; if (rr <= 0) { ki = k; break; } }
      const kind = ok[ki], last = i === n - 1;
      // every heading the beat may take whose parts (and next station) fit; the one that keeps the level most compact wins,
      // with a little chance in it, so the chain winds round on itself rather than running off in a line
      const ds = dirsFor(kind, yaw).filter((dd) => dd !== (prev && OPP[prev]));
      let best = null;
      // a level with a knot to spare tries one on the way to the next loop first (if the heights allow it)
      const ways = [null]; if (knots && !last) for (const side of [1, -1]) for (const dz of [2, -2]) ways.unshift({ side, dz });
      for (const dir of ds) for (const kn of ways) {
        const d = DIRS[dir], E = exitOf(c, sizes[i], dir), sh = beatShape(kind, E, d, z, yaw);
        let F, d2 = d, z2 = sh.z, extra;
        if (kn) {
          if (sh.z + kn.dz < 0 || sh.z + kn.dz > 4) continue;
          const ks = knotShape(sh.end, d, sh.z, kn.side, kn.dz, ENTRY); F = ks.F; d2 = ks.d2; z2 = ks.z2; extra = ks.parts;
        } else { F = [sh.end[0] + d[0] * (last ? GOAL : ENTRY), sh.end[1] + d[1] * (last ? GOAL : ENTRY)]; extra = [{ pts: [sh.end, F, [F[0] + d[1] * .01, F[1] - d[0] * .01], [sh.end[0] + d[1] * .01, sh.end[1] - d[0] * .01]], z0: sh.z, z1: sh.z }]; }
        const parts = sh.parts.concat(extra).map((p) => ({ ...p, k: 2 * i + 1 }));
        const dir2 = Object.keys(DIRS).find((k) => DIRS[k][0] === d2[0] && DIRS[k][1] === d2[1]);
        const nc = last ? null : stationAt(F, sizes[i + 1], dir2);
        if (nc) parts.push(stationPart(nc, sizes[i + 1], z2, 2 * i + 2));
        if (parts.some((p) => clashes(p, p.strict || p.own ? placed.concat(parts.filter((q) => q !== p && (p.strict || q.k === p.k))) : placed, yaws))) continue;   // (a knot's turn also against its own beat)
        const xs = [], ys = []; for (const p of placed.concat(parts)) for (const q of p.pts) { xs.push(q[0]); ys.push(q[1]); }
        const score = Math.max(...xs) - Math.min(...xs) + Math.max(...ys) - Math.min(...ys) + (dir === prev ? 3 : 0) + R() * 4 - (kn ? 30 : 0);
        if (!best || score < best.score) best = { kind, dir, dir2, parts, nc, z2, score, knot: kn };
      }
      chosen = best;
      if (!chosen) { ok.splice(ki, 1); w.splice(ki, 1); }
    }
    if (!chosen) break;
    const B0 = BEATS[chosen.kind]; keys += B0.keys + (B0.cam && !cam ? 1 : 0); cam = cam || !!B0.cam;
    beats.push({ kind: chosen.kind, dir: chosen.dir, z, want: 1 + Math.floor(R() * 2), ...(chosen.knot ? { knot: chosen.knot } : {}) });
    if (chosen.knot) knots--;
    placed.push(...chosen.parts); prev = chosen.dir2; z = chosen.z2;
    if (chosen.nc) { c = chosen.nc; centers.push([c[0], c[1], z]); }
  }
  const kinds = new Set(beats.map((b) => b.kind));
  if (beats.length < 3 || kinds.size < 3) return null;
  return { seed, beats, yaw, cam, sizes: sizes.slice(0, beats.length + 1), centers, theme: pick([0, 1, 2, 3, 5]), name: `${pick(ADJ)} ${pick(NOUN)}` };
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
    const last = i === beats.length - 1, d = DIRS[b.dir], r = [d[1], -d[0]], z = b.z;
    const E = exitOf(S.c, S.h, b.dir);
    const W = (u, v = 0, zz = z) => [E[0] + d[0] * u + r[0] * v, E[1] + d[1] * u + r[1] * v, zz];
    const loopDir = loopHeading[b.dir];
    const st = { kind: b.kind, S, roads: [], key: b.key };
    // the road that ends the beat: it runs on into the next station, or is the road home
    let entry = null;
    const finish = (from, zz) => {      // from: [x, y] where the entry road starts; it runs along d (or ties a knot) into the next station
      let F, z2 = zz;
      if (b.knot) {
        const kn = b.knot, ks = knotShape(from, d, zz, kn.side, kn.dz, ENTRY); F = ks.F; z2 = ks.z2;
        const t = turtle(from[0], from[1], Math.atan2(d[1], d[0]) * 180 / Math.PI, zz);
        t.fwd(KA - KR).gr(kn.dz / (KR + 1.5 * Math.PI * KR)).fwd(KR).arc(KR, kn.side * 270).gr(0).fwd(KR + 2 + ENTRY);
        entry = L.road(t.pts, {}); (L.terrainIgnore ||= new Set()).add(entry); entry.selfCross = true;
        // it stands on piers (none where it crosses itself), clear of the land
        for (let s = .8; s < entry.L - .4; s += 2.4) { const q = entry.at(s).p; if (Math.hypot(q.x - ks.cross[0], q.z - ks.cross[1]) < 1.4) continue; CY(g, q.x, q.z, .18, -2.4, q.y - .18, stone, 12); }
        (L.anchors ||= []).push([ks.cross[0], ks.cross[1], 1.2]);
      } else { const len = last ? GOAL : ENTRY; F = [from[0] + d[0] * len, from[1] + d[1] * len]; entry = L.road(L3([from[0], from[1], zz], [F[0], F[1], zz], UP), last ? { goal: true } : {}); }
      if (!last) { const c = plan.centers[P.S.length]; const T2 = station(c[0], c[1], z2); entry.joins = [{ k: 1, to: T2, s: sAt(T2, [F[0], F[1], z2]), dir: 1 }]; st.T = T2; }
      st.roads.push(entry); return entry; };
    const fork = (to, when, text) => S.forks.push({ s: sAt(S, [E[0], E[1], z]), dir: 1, to, toK: 0, when, text });
    if (b.kind === 'gate' || b.kind === 'mirror') {
      const G = BEATS[b.kind].gap, a = W(.6, -1.4), c = W(G - .6, 1.4), pool = [Math.min(a[0], c[0]), Math.min(a[1], c[1]), Math.max(a[0], c[0]), Math.max(a[1], c[1])];
      if (b.kind === 'gate') {
        const X = L.road(L3(W(0), W(G), UP), {}); st.roads.push(X); const h0 = 3.2, h1 = 4.2, off = h1 - 2 * wz, gateM = tri(tone('#C9503F')), ug = 2.2;
        st.pool = reflection(L, { pool, wz, calm: 78, over(og) {
          const at = (p, zz) => V(p[0] - off, p[1] - off, zz);
          const box = (s, p, zz, mat, rc) => { const m = new T.Mesh(UNIT_BOX, mat); m.scale.set(s[0], s[2], s[1]); m.position.copy(at(p, zz)); m.userData.rc = rc; og.add(m); };
          const across = d[0] ? [.16, 2.2] : [2.2, .16];
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
      const a = Math.asin(1 / 2.5), X2 = 5 * Math.cos(a), base = Math.atan2(-d[1], -d[0]) * 180 / Math.PI;
      const A1 = L.road(L3(W(0), W(3), UP), {}); st.roads.push(A1);
      // the spring's post stands on the side of the beam away from the start view, so it hides none of the road
      const br = base * Math.PI / 180, sd = Math.sin(br) - Math.cos(br) > 0 ? -1 : 1;
      st.ss = seesawM(L, { P: W(3 + X2), base, sd, key: b.key, name: 'Spring' }); st.roads.push(st.ss.beam);
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
      const btn = [-d[0] * 1.2, -d[1] * 1.2];
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
