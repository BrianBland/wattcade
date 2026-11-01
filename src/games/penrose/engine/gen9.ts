// @ts-nocheck
/* Penrose Pedals engine: The main level generator: tiers, planner (planLevel3), checker (checkPlan3), solver (solve3), level builder (genDef3) and candidates3 for seed sweeps.
 * Installed into the shared engine scope in order (see ./index.ts); names come in from $scope and go back out to it. */
import * as T from 'three';

export function install($scope) {
const { B, CY, L3, LV, TAU, TEX, THEMES, UNIT, UP, V, archGeo, at, basic, clamp, cloudLayer, corners, crossDisc, faucetLift, lollipopLen, mix, mixPal, onFace, peelSwitch, powerOf, rider, setTri, sp, sprite, tone, tri, turntable, turtle } = $scope;

const mulberry = a => () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const hd = t => t.h * 180 / Math.PI;
/* ================= level generator v9: buttonless cadence lifts, no light machines. (v7: every machine, no points.) Extra machines chain off turntable stops instead of peeling spurs off the terrace ================= */
// Feedback folded in (v6): points are gone; a second turntable or hub sits at the end of an arm road leaving a stop; roads may barely cross on screen;
// the camera must turn at least twice and at least two keys must sit in pockets only perspective reaches; machine centres are painted in their button colour.
// v4's layouts, plus a camera crank with two views (front and a quarter turn). A perspective branch ('pview') leaves a turntable tip or a lift floor:
// for each view it may have a far road placed straight behind the tip along that view's line of sight, so the two meet on screen only in that view.
// Feedback folded in: the camera only appears in levels built around it; nothing may hide behind a lift's frame on screen; machine badges are small dots.
// Layout: a terrace road whose ends, and the ends of spurs peeled off it by points, can be pockets (teardrop cul-de-sacs),
// two-stop turntables, three-stop hubs or crossover discs. Machine stops and disc ports lead to branches: a pocket,
// an arm road ending in a pocket, or (zone 2 on) a pier whose end meets a lower island road only on screen.
// The plan carries an abstract track graph next to the geometry, and a solver searches it: the wheel parks in a pocket,
// the rider sets the machines, the wheel rides to the next pocket. Shortest ride wins; idling must never win or fall.
const G3 = { R_PEEL: 3, R_TURN: 1.5, TEAR: 1.25, ARM: 3, CR: 2, GATE_BACK: 20, LETTERS: 'yabz', DROP: 3, STEP: 1.6 };
const TURNS = { tt2: .35, hub3: .3, cross: .2 };
const TT_ONLY = { tt2: .6, hub3: .4 };
const CHAIN = { tt2: .75, hub3: .25 };
const TIERS = [
  { id: 'cross', zone: 3, label: 'Crossover discs', theme: 2, special: 'cross', spurs: [0, 0], mt: [2, 3], machines: [2, 3], keys: [2, 3], ends: TURNS, spurEnds: TURNS, spanP: null, island: 0, keygate: .4, legs: [5, 14] },
  { id: 'lift', zone: 2, label: 'Cadence lifts', theme: 1, special: 'lift', halfAdd: 4, spurs: [0, 0], mt: [2, 3], machines: [2, 3], keys: [2, 3], ends: TURNS, spurEnds: TURNS, spanP: null, island: 0, keygate: .4, legs: [5, 14] },
  { id: 'seesaw', zone: 4, label: 'Spring see-saws', theme: 3, special: 'seesaw', halfAdd: 4, spurs: [0, 0], mt: [2, 3], machines: [2, 3], keys: [2, 3], ends: TURNS, spurEnds: TURNS, spanP: null, island: 0, keygate: .4, legs: [5, 14] },
  { id: 'island', zone: 1, label: 'Piers that meet islands', theme: 0, special: null, spurs: [0, 0], mt: [2, 3], machines: [2, 3], keys: [2, 3], ends: TURNS, spurEnds: TURNS, spanP: null, island: 1, keygate: .4, legs: [5, 14] },
  { id: 'lift-views', zone: 2, label: 'Lifts with the camera', theme: 1, camera: true, pv: .5, special: 'lift', halfAdd: 7, spurs: [0, 0], mt: [2, 3], machines: [3, 4], keys: [2, 3], ends: TT_ONLY, spurEnds: TT_ONLY, spanP: null, island: 0, keygate: .3, legs: [5, 14] },
  { id: 'seesaw-chain', zone: 4, label: 'See-saws off a turntable', theme: 3, special: null, must: 'seesaw', chain: { seesaw: 1 }, halfAdd: 3, spurs: [0, 0], mt: [3, 3], machines: [3, 3], keys: [2, 3], ends: TT_ONLY, spurEnds: TT_ONLY, spanP: null, island: 0, keygate: .4, legs: [5, 14] },
  { id: 'lift-chain-views', zone: 2, label: 'Lifts off a turntable, with the camera', theme: 1, camera: true, pv: .5, special: null, must: 'lift', chain: { lift: 1 }, halfAdd: 4, spurs: [0, 0], mt: [3, 3], machines: [4, 4], keys: [2, 3], ends: TT_ONLY, spurEnds: TT_ONLY, spanP: null, island: 0, keygate: .3, legs: [5, 14] },
  { id: 'lift-chain', zone: 2, label: 'Lifts off a turntable', theme: 1, special: null, must: 'lift', chain: { lift: 1 }, halfAdd: 3, spurs: [0, 0], mt: [3, 3], machines: [3, 3], keys: [2, 3], ends: TT_ONLY, spurEnds: TT_ONLY, spanP: null, island: 0, keygate: .4, legs: [5, 14] },
  { id: 'cross-views', zone: 3, label: 'Crossover discs with the camera', theme: 2, camera: true, pv: .5, special: 'cross', spurs: [0, 0], mt: [2, 3], machines: [3, 4], keys: [2, 3], ends: TURNS, spurEnds: TURNS, spanP: null, island: 0, keygate: .3, legs: [5, 14] },
  { id: 'seesaw-views', zone: 4, label: 'See-saws off a turntable, with the camera', theme: 3, camera: true, pv: .5, special: null, must: 'seesaw', chain: { seesaw: 1 }, halfAdd: 4, spurs: [0, 0], mt: [3, 3], machines: [4, 4], keys: [2, 3], ends: TT_ONLY, spurEnds: TT_ONLY, spanP: null, island: 0, keygate: .3, legs: [5, 14] },
  { id: 'island-views', zone: 1, label: 'Piers and islands, with the camera', theme: 0, camera: true, pv: .5, special: null, spurs: [0, 0], mt: [2, 3], machines: [3, 4], keys: [2, 3], ends: TT_ONLY, spurEnds: TT_ONLY, spanP: null, island: 1, keygate: .3, legs: [5, 14] },
];
// the camera looks down viewDir(yaw); a road placed at p - k * viewDir meets p on screen only at that yaw. scrV is the screen position at a yaw
const viewDir5 = deg => { const a = deg * Math.PI / 180; return [Math.cos(a) + Math.sin(a), Math.cos(a) - Math.sin(a), 1]; };
const behind5 = (p, deg, k) => { const d = viewDir5(deg); return [p[0] - k * d[0], p[1] - k * d[1], p[2] - k * d[2]]; };
const scrV = (p, deg) => { const a = deg * Math.PI / 180; return scr3(p[0] * Math.cos(a) - p[1] * Math.sin(a), p[0] * Math.sin(a) + p[1] * Math.cos(a), p[2]); };
const depthV = (p, deg) => { const d = viewDir5(deg); return (p[0] * d[0] + p[1] * d[1] + p[2] * d[2]) / Math.sqrt(3); };
const scr3 = (x, y, z) => [(x - y) / Math.SQRT2, (2 * z - x - y) / Math.sqrt(6)];
const dirv = a => [Math.cos(a * Math.PI / 180), Math.sin(a * Math.PI / 180)];
const plen = pts => { let s = 0; for (let i = 1; i < pts.length; i++) s += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1], pts[i][2] - pts[i - 1][2]); return s; };

let plan3Why = '', CROSS_MAX = .03;
function planLevel3(seed, tier) {
  const Rn = mulberry(seed * 104729 + TIERS.indexOf(tier) * 7907 + 3), pick = a => a[Math.floor(Rn() * a.length)], rr = (a, b) => a + Rn() * (b - a), chance = p => Rn() < p;
  const wpick = w => { let t = Rn() * Object.values(w).reduce((a, b) => a + b, 0); for (const [k, v] of Object.entries(w)) { if ((t -= v) <= 0) return k; } return Object.keys(w)[0]; };
  const R = [], links = new Map(), machines = [], joinsAt = [], discs = [], ghosts = [];
  const plan = { seed, tier, R, links, machines, joinsAt, discs, ghosts, spurs: [], pockets: [], hosts: [], spans: [], boxes: [], posts: [], views: tier.camera ? [0, -90] : [0], cam: null };
  const road = (pts, o = {}) => { const r = { id: R.length, pts: pts.map(q => q.p || q), forks: [], joins: [], ...o }; r.len = plen(r.pts); R.push(r); return r; };
  const link = (a, ea, b, eb) => { links.set(`${a.id}:${ea}`, [b.id, eb]); };
  const pocketAt = (x, y, h, z, kind, o = {}) => { const td = turtle(x, y, h, z).fwd(.3).teardrop(G3.TEAR).fwd(.3); const p = road(td.pts, { kind: 'pocket', pocket: true, where: kind, heading: h, ...o }); plan.pockets.push(p); joinsAt.push([x, y, z]); return p; };
  // attach a pocket to the end e of road r (both directions)
  const capWithPocket = (r, e, kind) => { const P = r.pts[e ? r.pts.length - 1 : 0], Q = r.pts[e ? r.pts.length - 2 : 1], h = Math.atan2(P[1] - Q[1], P[0] - Q[0]) * 180 / Math.PI;
    const p = pocketAt(P[0], P[1], h, P[2], kind); link(r, e, p, 0); link(p, 1, r, e); return p; };
  // a branch leaving a tip (point + heading): returns { r: road entered at end 0, exit: the end that comes back to the tip }
  const branch = (tip, h, kind, where) => {
    if (kind === 'pocket') { const p = pocketAt(tip[0], tip[1], h, tip[2], where); return { r: p, inEnd: 0, outEnd: 1 }; }
    if (kind === 'light' || kind === 'dark') {   // arm, a span the lamp decides, arm, pocket
      const dv = dirv(h), P1 = [tip[0] + rr(1.4, 2) * dv[0], tip[1] + rr(1.4, 2) * dv[1], tip[2]], sl = kind === 'light' ? rr(2, 2.6) : rr(1.3, 1.8), P2 = [P1[0] + sl * dv[0], P1[1] + sl * dv[1], tip[2]], a2 = rr(1.6, 2.4), P3 = [P2[0] + a2 * dv[0], P2[1] + a2 * dv[1], tip[2]];
      const si = plan.spans.length, arm1 = road(L3(tip, P1, UP), { kind: 'arm', spanEnd: { span: si, end: 1 } }), arm2 = road(L3(P2, P3, UP), { kind: 'arm', host: true, spanEnd: { span: si, end: 0 } });
      const S = { kind, a: arm1.id, b: arm2.id, P1, P2, h, lamp: -1 }; plan.spans.push(S);
      if (kind === 'light') S.road = road(L3(P1, P2, UP), { kind: 'light', span: si }).id;
      capWithPocket(arm2, 1, `${where}, past a ${kind === 'light' ? 'light bridge' : 'dark gap'}`); plan.hosts.push(arm2); joinsAt.push(tip, [...P1, 2], [...P2, 2]);
      return { r: arm1, inEnd: 0, outEnd: 0 }; }
    const L = kind === 'chain' ? rr(4.2, 5.6) : rr(3.2, 4.2), e = [tip[0] + L * dirv(h)[0], tip[1] + L * dirv(h)[1], tip[2]], arm = road(L3(tip, e, UP), { kind: kind === 'pier' ? 'pier' : kind === 'chain' ? 'chain' : 'arm', host: kind === 'arm' });
    if (kind === 'chain') { joinsAt.push(tip); machineAt(wpick(tier.chain || CHAIN), arm, 1, h, 'chain', 1); return { r: arm, inEnd: 0, outEnd: 0 }; }
    joinsAt.push(tip);
    if (kind === 'arm') { capWithPocket(arm, 1, where); plan.hosts.push(arm); }
    else { const k = G3.DROP, fs = [e[0] - k, e[1] - k, e[2] - k], fe = [fs[0] + 3 * dirv(h)[0], fs[1] + 3 * dirv(h)[1], fs[2]], far = road(L3(fs, fe, UP), { kind: 'far', far: true });
      link(arm, 1, far, 0); link(far, 0, arm, 1); capWithPocket(far, 1, 'island'); plan.island = { pier: arm.id, far: far.id, e, fs }; joinsAt.push([...e, 1.4], [...fs, 1.4]); }
    return { r: arm, inEnd: 0, outEnd: 0 }; };
  // a perspective branch: from a tip, nothing in 3D; for each view, maybe a far road straight behind the tip along that view's line of sight
  const pviewAt = (tip, h, where, tag) => { const out = [null, null], vs = chance(.6) ? [0, 1] : chance(.5) ? [0] : [1]; joinsAt.push([...tip, 1.2]);
    for (const v of vs) { const lf = tag.lift !== undefined, k = lf ? rr(2.6, 3.6) + (tag.f - 1) * 3.4 : rr(2.6, 5.2), S = behind5(tip, plan.views[v], k), sg = lf ? (tag.f % 2 ? 1 : -1) * (v ? -1 : 1) : pick([-1, 1]);
      const t = turtle(S[0], S[1], h, S[2]).fwd(tag.lift !== undefined ? rr(1.3, 2) : rr(.8, 1.3)).arc(1.1, sg * 90).fwd(rr(1.6, 2.6));
      const fr = road(t.pts, { kind: 'pfar', host: true, pjoin: { ...tag, v } }); plan.hosts.push(fr); capWithPocket(fr, 1, `${where}, seen from the ${v ? 'side' : 'front'}`); out[v] = fr.id; joinsAt.push([...S, 1.6]); }
    return out; };
  let islands = tier.island >= 1 ? 1 : chance(tier.island) ? 1 : 0, chainLeft = 0;
  const branchKind = () => { if (islands > 0 && chance(.35)) { islands--; return 'pier'; } if (tier.spanP) { const u = Rn(); if (u < tier.spanP.light) return 'light'; if (u < tier.spanP.light + tier.spanP.dark) return 'dark'; } return chance(.5) ? 'pocket' : 'arm'; };
  // a road end that turns off a machine port: out a little, a quarter turn, then on to a pocket or a branch
  const portRoad = (P, h, side, o) => { const t = turtle(P[0], P[1], h, P[2]).fwd(.6).arc(1.2, side * 90).fwd(rr(1.6, 2.6)); const fr = road(t.pts, { host: true, ...o }); plan.hosts.push(fr);
    const k = branchKind(); if (k === 'light' || k === 'dark') { const b = branch([t.x, t.y, P[2]], hd(t), k, o.where); link(fr, 1, b.r, b.inEnd); link(b.r, b.outEnd, fr, 1); } else capWithPocket(fr, 1, o.where); return fr; };
  // a machine at a road end: r's end e sits at the pivot (turntables) or on the disc's back port (crossovers)
  const machineAt = (type, r, e, base, where, depth = 0) => {
    const P = r.pts[e ? r.pts.length - 1 : 0];
    if (type === 'lift') {   // a cul-de-sac deck on a water column; the road end is its ground floor, higher floors leave the same mouth
      const n = pick([2, 3]), step = G3.STEP, m = { i: machines.length, type: 'lift', J: P, base, step, n, def: n, floors: [], host: r.id }; machines.push(m);
      const deck = road(turtle(P[0], P[1], base, P[2]).fwd(1.2).teardrop(1).fwd(1.2).pts, { kind: 'pocket', pocket: true, where: 'lift', heading: base, liftDeck: m.i }); plan.pockets.push(deck); m.deck = deck.id;
      r.liftPort = { m: m.i, f: 0, end: e }; m.floors[0] = { r: r.id, end: e }; joinsAt.push([...P, 3.4]);
      const sides = chance(.5) ? [1, -1] : [-1, 1];
      for (let f = 1; f < n; f++) { if (tier.camera) { m.floors[f] = { pv: pviewAt([P[0], P[1], P[2] + f * step], base + 180, 'up the lift', { lift: m.i, f }) }; continue; }
        const fr = portRoad([P[0], P[1], P[2] + f * step], base + 180, sides[f - 1], { kind: 'floor', where: 'up the lift', liftPort: { m: m.i, f, end: 0 } }); m.floors[f] = { r: fr.id, end: 0 }; joinsAt.push([P[0], P[1], P[2] + f * step, 3]); }
      plan.boxes.push({ J: P, base, x0: .3, x1: Math.max(...deck.pts.map(q => (q[0] - P[0]) * Math.cos(base * Math.PI / 180) + (q[1] - P[1]) * Math.sin(base * Math.PI / 180))) + 1.25, half: Math.max(...deck.pts.map(q => Math.abs(-(q[0] - P[0]) * Math.sin(base * Math.PI / 180) + (q[1] - P[1]) * Math.cos(base * Math.PI / 180)))) + .6, z0: P[2] - 2.4, z1: P[2] + 3 * step + 1.2, own: deck.id });
      return m; }
    if (type === 'seesaw') {   // a beam on a pivot: at rest it joins the low road here to the high road at the far end; wound, the high road here to the low road there
      const a = Math.asin(1 / 2.5), X = 2.5 * Math.cos(a), dv = dirv(base), z0 = P[2], at = (k, z) => [P[0] + k * dv[0], P[1] + k * dv[1], z];
      const m = { i: machines.length, type: 'seesaw', base, P, X, def: 0, center: at(X, z0 + 1), host: r.id, ports: {} }; machines.push(m);
      const beam = road(L3(at(0, z0), at(2 * X, z0 + 2), UP), { kind: 'beam', beam: m.i }); m.beam = beam.id;
      m.ghost = road(L3(at(0, z0 + 2), at(2 * X, z0), UP), { kind: 'beam', ghost: true, beamOf: m.i }).id;
      r.ssPort = { m: m.i, port: 'LW', end: e }; m.ports.LW = { r: r.id, end: e };
      const sd = chance(.5) ? 1 : -1;
      // the far end: a spiral cul-de-sac that winds down from the high end to the low end, where you wind the spring
      const t = turtle(...at(2 * X, z0 + 2).slice(0, 2), base, z0 + 2); t.grade = -2 / lollipopLen(1, 1.2); t.fwd(1).teardrop(1.2).fwd(1);
      const spi = road(t.pts, { kind: 'pocket', pocket: true, where: 'see-saw spiral', heading: base, spiral: m.i, ssEnds: { 0: 'HE', 1: 'LE' } }); plan.pockets.push(spi); m.ports.HE = { r: spi.id, end: 0 }; m.ports.LE = { r: spi.id, end: 1 }; m.spiral = spi.id;
      const hw = portRoad(at(0, z0 + 2), base + 180, sd, { kind: 'port', where: 'up the see-saw', ssPort: { m: m.i, port: 'HW', end: 0 } }); m.ports.HW = { r: hw.id, end: 0 };
      joinsAt.push([...at(0, z0), 3.2], [...at(2 * X, z0), 3.2], [...at(X, z0 + 1), 2.6]);
      const sup = at(X, z0); plan.posts.push({ p: [sup[0] - .85 * dv[1] * sd, sup[1] + .85 * dv[0] * sd, z0], top: z0 + 1.3, own: m.i });
      return m; }
    if (type === 'tt2' || type === 'hub3') {
      const stops = type === 'hub3' ? [-90, 0, 90] : [0, pick([-90, 90])], m = { i: machines.length, type: 'tt', hub: type === 'hub3', pivot: P, base, stops, def: stops.indexOf(0), branch: [], host: r.id, depth }; machines.push(m);
      const arm = road(L3(P, [P[0] + G3.ARM * dirv(base)[0], P[1] + G3.ARM * dirv(base)[1], P[2]], UP), { kind: 'tt-arm', tt: m.i }); m.arm = arm.id;
      link(r, e, arm, 0); link(arm, 0, r, e); joinsAt.push([...P, 3.4]);
      stops.forEach((a, i) => { const h = base + a, tip = [P[0] + G3.ARM * dirv(h)[0], P[1] + G3.ARM * dirv(h)[1], P[2]];
        if (chainLeft > 0 && !depth && chance(.55)) { chainLeft--; const b = branch(tip, h, 'chain', 'chain'); b.r.tipOf = { m: m.i, i, outEnd: b.outEnd }; m.branch[i] = b.r.id; }
        else if (tier.camera && chance(tier.pv)) { (m.pv = m.pv || [])[i] = pviewAt(tip, h, type === 'hub3' ? 'hub' : 'turntable', { m: m.i, i }); m.branch[i] = -1; }
        else { const b = branch(tip, h, branchKind(), type === 'hub3' ? 'hub' : 'turntable'); b.r.tipOf = { m: m.i, i, outEnd: b.outEnd }; m.branch[i] = b.r.id; }
        if (a !== 0) ghosts.push({ piv: P, base, open: a }); });
      return m; }
    const m = { i: machines.length, type: 'cross', base, def: 0, R: G3.CR, ext: [], host: r.id }; machines.push(m);
    const c = [P[0] + G3.CR * dirv(base)[0], P[1] + G3.CR * dirv(base)[1], P[2]]; m.center = c; discs.push({ c, R: G3.CR });
    const port = k => [c[0] + G3.CR * dirv(base + 90 * k)[0], c[1] + G3.CR * dirv(base + 90 * k)[1], c[2]];
    // curves at state 0 (for the geometry checks): c1 from port 2 to port 1, c2 from port 0 to port 3
    const loc = (pts) => pts.map(q => { const [x, y] = q.p, a = base * Math.PI / 180; return [c[0] + x * Math.cos(a) - y * Math.sin(a), c[1] + x * Math.sin(a) + y * Math.cos(a), c[2]]; });
    const c1 = road(loc(turtle(-G3.CR, 0, 0, 0).arc(G3.CR, 90).pts), { kind: 'curve', curve: { m: m.i, c: 0 } }), c2 = road(loc(turtle(G3.CR, 0, 180, 0).arc(G3.CR, 90).pts), { kind: 'curve', curve: { m: m.i, c: 1 } });
    m.curves = [c1.id, c2.id]; joinsAt.push([...c, G3.CR + 2.4]);
    m.ext[2] = { r: r.id, inEnd: e, outEnd: e };
    for (const k of [0, 1, 3]) { const ck = chainLeft > 0 && !depth && chance(.5) ? (chainLeft--, 'chain') : branchKind(), b = branch(port(k), base + 90 * k, ck, 'crossover'); m.ext[k] = { r: b.r.id, inEnd: b.inEnd, outEnd: b.outEnd }; b.r.extOf = { m: m.i, k, outEnd: b.outEnd }; }
    r.extOf = { m: m.i, k: 2, outEnd: e };
    return m; };

  // --- the terrace road and its ends
  const nSp = Math.round(rr(tier.spurs[0], tier.spurs[1] + .49)), half = Math.round(rr(4.5 + 1.4 * nSp, 6 + 1.7 * nSp) * 2) / 2 + (tier.halfAdd ?? 3);
  const line = road(L3([-half, 0, 0], [half, 0, 0], UP), { kind: 'line' }); plan.line = line.id; plan.half = half;
  // aim for the tier's machine count: the spurs' points, plus turn machines on just enough of the ends
  const target = Math.round(rr(tier.mt[0], tier.mt[1] + .49)), extra = Math.min(2, target - nSp); chainLeft = target - nSp - extra; if (extra < 0) return (plan3Why = 'machine count', null);
  const slots = Array.from({ length: 2 + nSp }, (_, i) => i); for (let i = slots.length - 1; i > 0; i--) { const j = Math.floor(Rn() * (i + 1)); [slots[i], slots[j]] = [slots[j], slots[i]]; }
  const mSlot = new Set(slots.slice(0, extra)), noPocket = w => Object.fromEntries(Object.entries(w).filter(([k]) => k !== 'pocket'));
  const special = tier.special === 'mix' ? pick(['lift', 'seesaw']) : tier.special === 'mix5' ? pick(['lift', 'hub3']) : tier.special; plan.special = special; if (special && !extra) return (plan3Why = 'no slot for the special machine', null);
  const kindFor = (i, w) => !mSlot.has(i) ? 'pocket' : special && i === slots[0] ? special : wpick(noPocket(w));
  const endKinds = { W: kindFor(0, tier.ends), E: kindFor(1, tier.ends) };
  for (const [k, sg] of [['W', -1], ['E', 1]]) { const e = sg > 0 ? 1 : 0, base = sg > 0 ? 0 : 180;
    if (endKinds[k] === 'pocket') { const td = turtle(sg * half, 0, base, 0).fwd(.4).teardrop(G3.TEAR).fwd(.4), p = road(td.pts, { kind: 'pocket', pocket: true, where: 'line end', heading: base }); plan.pockets.push(p); link(line, e, p, 0); link(p, 1, line, e); joinsAt.push([sg * half, 0, 0]); }
    else machineAt(endKinds[k], line, e, base, 'line end'); }
  // --- spurs
  const PEEL = G3.R_PEEL * Math.SQRT1_2 + G3.R_TURN * (1 - Math.SQRT1_2), forks = [], spurKinds = [];
  for (let i = 0; i < nSp; i++) spurKinds.push(kindFor(2 + i, tier.spurEnds));
  for (let i = 0; i < nSp; i++) { let ok = false; const big = spurKinds[i] !== 'pocket';
    for (let t = 0; t < 80 && !ok; t++) { const X = Math.round(rr(-half + 1.2, half - 1.2) * 2) / 2, side = chance(.5) ? 1 : -1, dir = chance(.5) ? 1 : -1, x0 = X - PEEL * dir, span = [Math.min(x0, x0 + 2.12 * dir) - .4, Math.max(x0, x0 + 2.12 * dir) + .4];
      ok = span[0] > -half + .4 && span[1] < half - .4 && forks.every(f => (f.span[1] < span[0] || span[1] < f.span[0]) && Math.abs(f.x0 - x0) > 4 && Math.abs(f.X - X) > (f.side === side ? (big || f.big ? 9 : 4.8) : 1.2));
      if (ok) forks.push({ X, side, dir, x0, span, big, kind: spurKinds[i] }); }
    if (!ok) return (plan3Why = 'no room for spurs', null); }
  forks.sort((a, b) => a.x0 - b.x0);
  for (const f of forks) {
    const { side, dir, x0, kind } = f, ps = side * dir, h0 = dir > 0 ? 0 : 180, m = { i: machines.length, type: 'points', def: 0 }; machines.push(m);
    const lf = turtle(x0, 0, h0, -.004).arc(G3.R_PEEL, ps * 45), P1 = [lf.x, lf.y, 0];
    const t = turtle(P1[0], P1[1], h0 + ps * 45, 0); t.arc(G3.R_TURN, ps * 45); t.fwd(rr(1.4, 3)); if (chance(.3)) { const sg = pick([-1, 1]); t.arc(G3.R_TURN, sg * 90).fwd(rr(.8, 1.8)).arc(G3.R_TURN, -sg * 90); } t.fwd(2.8);
    const leaf = road(lf.pts, { kind: 'leaf', points: m.i }), spur = road(t.pts, { kind: 'spur', host: true, points: m.i });
    m.leaf = leaf.id; m.spur = spur.id; m.s = x0 + half; m.dir = dir; m.side = side; m.x0 = x0; m.ps = ps; m.P1 = P1; m.h1 = h0 + ps * 45;
    line.forks.push({ s: x0 + half, dir, to: leaf.id, toK: 0, pts: m.i });
    leaf.joins.push({ k: 0, to: line.id, s: x0 + half, dir: -dir }); link(leaf, 1, spur, 0); link(spur, 0, leaf, 1);
    joinsAt.push([x0, 0, 0], P1); plan.hosts.push(spur); plan.spurs.push({ m: m.i, side, dir, x0, kind });
    const H = hd(t);
    if (kind === 'pocket') { if (tier.spanP && chance(.6)) { const b = branch([t.x, t.y, 0], H, chance(.65) ? 'light' : 'dark', 'spur end'); link(spur, 1, b.r, b.inEnd); link(b.r, b.outEnd, spur, 1); } else capWithPocket(spur, 1, 'spur end'); }
    else machineAt(kind, spur, 1, H, 'spur end');
  }
  // --- gates: the gate home on one host road, sometimes a key gate on another; both branch off on the way back
  if (chainLeft > 0) return (plan3Why = 'no stop free for a chained turntable', null);
  const hosts = plan.hosts.filter(h => h.len >= 3.2); if (!hosts.length) return (plan3Why = 'no host', null);
  const gateOn = (h, kind) => { const P = h.pts, gi = P.length - 1 - G3.GATE_BACK; if (gi < 2) return null; const a = P[gi - 1], b = P[gi], hb = Math.atan2(a[1] - b[1], a[0] - b[0]) * 180 / Math.PI, sg = pick([-1, 1]);
    const s = plen(P.slice(0, gi + 1)), gt = turtle(b[0], b[1], hb, b[2]).arc(2.5, sg * 90); joinsAt.push([...b, 3.4]);
    if (kind === 'home') { gt.fwd(2.4); const g = road(gt.pts, { kind: 'goal', goal: true }); h.forks.push({ s, dir: -1, to: g.id, toK: 0, gate: 'all' }); plan.home = { host: h.id, gi, road: g.id }; return g; }
    gt.fwd(1.2); const br = road(gt.pts, { kind: 'branch' }); br.joins.push({ k: 0, to: h.id, s, dir: -1 }); const p = capWithPocket(br, 1, 'behind a key gate'); p.gated = true;
    h.forks.push({ s, dir: -1, to: br.id, toK: 0, gate: 'need' }); plan.keygate = { host: h.id, gi, road: br.id, pocket: p.id }; return br; };
  const hh = pick(hosts); if (!gateOn(hh, 'home')) return (plan3Why = 'gate host too short', null);
  const others = hosts.filter(h => h !== hh); if (others.length && chance(tier.keygate)) gateOn(pick(others), 'key');
  // --- keys
  const nKeys = Math.round(rr(tier.keys[0], tier.keys[1] + .49)), kg = plan.keygate ? R[plan.keygate.pocket] : null;
  const pool = plan.pockets.filter(p => !p.gated && p.liftDeck === undefined && p.spiral === undefined); for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Rn() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  // prefer pockets behind machines and on islands over the line ends
  pool.sort((a, b) => (a.where === 'line end') - (b.where === 'line end') || /seen from/.test(b.where) - /seen from/.test(a.where));
  const chosen = kg ? [kg, ...pool.slice(0, nKeys - 1)] : pool.slice(0, nKeys); if (chosen.length < 2) return (plan3Why = 'too few pockets', null);
  for (const p of chosen) p.key = true; if (kg) kg.need = chosen.length - 1 >= 2 && chance(.5) ? 2 : 1;
  plan.nKeys = chosen.length;
  // --- lamps: one per light bridge; each dark gap belongs to one of them (its lantern shows the gap is real)
  const lights = plan.spans.filter(S => S.kind === 'light'), darks = plan.spans.filter(S => S.kind === 'dark');
  if (lights.length > 2) return (plan3Why = 'too many light bridges', null); if (darks.length && !lights.length) return (plan3Why = 'dark gap with no lamp', null);
  if (tier.needLamp && !lights.length) return (plan3Why = 'no lamp', null); if (darks.length > lights.length) return (plan3Why = 'too many dark gaps', null);
  lights.forEach((S, k) => { const m = { i: machines.length, type: 'lamp', def: 0, spans: [plan.spans.indexOf(S)], no: k }; machines.push(m); S.lamp = m.i; });
  darks.forEach((S, k) => { const m = machines.find(m => m.type === 'lamp' && m.spans.length === 1 && m.no === k); m.spans.push(plan.spans.indexOf(S)); S.lamp = m.i; });
  // each span gets a lantern on a post beside it, on whichever side has more room
  for (const S of plan.spans) { const dv = dirv(S.h), mid = [(S.P1[0] + S.P2[0]) / 2, (S.P1[1] + S.P2[1]) / 2, S.P1[2]];
    const room = sg => { const q = [mid[0] - 1.7 * sg * dv[1], mid[1] + 1.7 * sg * dv[0]]; return Math.min(...R.flatMap(r => r.pts.map(p => Math.hypot(p[0] - q[0], p[1] - q[1]) + (Math.abs(p[2] - mid[2]) > 4 ? 9 : 0)))); };
    const sg = room(1) >= room(-1) ? 1 : -1; S.post = [mid[0] - 1.7 * sg * dv[1], mid[1] + 1.7 * sg * dv[0], mid[2]]; S.mid = mid; plan.posts.push({ p: S.post, top: mid[2] + 3.1, own: -1 }); }
  // the camera crank: a dial on a pedestal in open ground beside the terrace
  if (tier.camera) { const m = { i: machines.length, type: 'camera', def: 0 }; machines.push(m); plan.cam = m.i; let best = null;
    for (let x = -half; x <= half; x += 1) for (const y of [2.5, -2.5, 3.5, -3.5, 4.5, -4.5, 6, -6]) { const d = Math.min(...R.flatMap(r => r.pts.map(p => Math.hypot(p[0] - x, p[1] - y)))); if (d < 2.2) continue; const sc = Math.abs(y) + Math.abs(x) * .15 + Rn() * .5; if (!best || sc < best.sc) best = { x, y, sc }; }
    if (!best) return (plan3Why = 'no room for the camera crank', null); plan.camAt = [best.x, best.y, 0]; plan.posts.push({ p: plan.camAt, top: .6, own: -1 }); }
  if (machines.length < tier.machines[0] || machines.length > tier.machines[1]) return (plan3Why = `${machines.length} machines`, null);
  if (tier.island >= 1 && !plan.island) return (plan3Why = 'no island', null);
  return plan;
}

// ---- the track-graph solver
function conn3(plan, r, e, cfg) {
  const L = plan.links.get(`${r}:${e}`); if (L) return L;
  const A = plan.R[r], M = plan.machines, view = plan.cam != null ? cfg[plan.cam] : 0;
  if (A.pjoin && e === 0) { const pj = A.pjoin; if (view !== pj.v) return null; return pj.lift !== undefined ? (cfg[pj.lift] === pj.f ? [M[pj.lift].deck, 0] : null) : (cfg[pj.m] === pj.i ? [M[pj.m].arm, 1] : null); }
  if (A.liftPort && e === A.liftPort.end) { const m = M[A.liftPort.m]; return cfg[m.i] === A.liftPort.f ? [m.deck, 0] : null; }
  if (A.liftDeck !== undefined && e === 1) { const m = M[A.liftDeck], fl = m.floors[cfg[m.i]]; if (!fl) return null; if (fl.pv) { const id = fl.pv[view]; return id != null ? [id, 0] : null; } return [fl.r, fl.end]; }
  if ((A.ssPort && e === A.ssPort.end) || (A.ssEnds && A.ssEnds[e])) { const m = M[A.spiral ?? A.ssPort.m], p = A.ssEnds ? A.ssEnds[e] : A.ssPort.port, on = cfg[m.i] === 0 ? (p === 'LW' || p === 'HE') : (p === 'HW' || p === 'LE'); return on ? [m.beam, p === 'LW' || p === 'HW' ? 0 : 1] : null; }
  if (A.beam !== undefined) { const m = M[A.beam], x = m.ports[e === 0 ? (cfg[m.i] ? 'HW' : 'LW') : (cfg[m.i] ? 'LE' : 'HE')]; return [x.r, x.end]; }
  if (A.spanEnd && e === A.spanEnd.end) { const S = plan.spans[A.spanEnd.span], lit = cfg[S.lamp] === 1;
    if (S.kind === 'light') return lit ? [S.road, e === 1 ? 0 : 1] : null;
    return lit ? null : e === 1 ? [S.b, 0] : [S.a, 1]; }
  if (A.kind === 'light') { const S = plan.spans[A.span]; return e === 1 ? [S.b, 0] : [S.a, 1]; }
  if (A.kind === 'tt-arm' && e === 1) { const m = M[A.tt]; if (m.pv && m.pv[cfg[m.i]]) { const id = m.pv[cfg[m.i]][view]; return id != null ? [id, 0] : null; } const b = plan.R[m.branch[cfg[m.i]]]; return b ? [b.id, 0] : null; }
  if (A.tipOf && e === A.tipOf.outEnd) { const m = M[A.tipOf.m]; return cfg[m.i] === A.tipOf.i ? [m.arm, 1] : null; }
  if (A.curve) { const m = M[A.curve.m], k = ((A.curve.c === 0 ? (e === 0 ? 2 : 1) : (e === 0 ? 0 : 3)) + cfg[m.i]) % 4, x = m.ext[k]; return x ? [x.r, x.inEnd] : null; }
  if (A.extOf && e === A.extOf.outEnd) { const m = M[A.extOf.m], k = (A.extOf.k - cfg[m.i] + 4) % 4; const ce = k === 2 ? [0, 0] : k === 1 ? [0, 1] : k === 0 ? [1, 0] : [1, 1]; return [m.curves[ce[0]], ce[1]]; }
  return null;
}
// ride from a position until the wheel parks in a pocket, reaches home, or falls
function trace3(plan, pos, cfg, keys) {
  let { r, s, dir } = pos, cost = 0, pj = 0;
  for (let step = 0; step < 60; step++) {
    const A = plan.R[r]; let best = null;
    for (const f of A.forks) { if (f.dir !== dir) continue; if (dir > 0 ? !(f.s > s + 1e-6) : !(f.s < s - 1e-6)) continue;
      const on = f.pts !== undefined ? cfg[f.pts] === 1 : f.gate === 'all' ? keys.n === plan.nKeys : f.gate === 'need' ? keys.n >= plan.R[plan.keygate.pocket].need : false;
      if (on && (!best || Math.abs(f.s - s) < Math.abs(best.s - s))) best = f; }
    if (best) { cost += Math.abs(best.s - s); const B = plan.R[best.to]; r = B.id; s = best.toK ? B.len : 0; dir = best.toK ? -1 : 1; continue; }
    const e = dir > 0 ? 1 : 0; cost += dir > 0 ? A.len - s : s;
    if (A.goal && e === 1) return { win: true, cost, pj };
    const j = A.joins.find(j => j.k === e); if (j) { r = j.to; s = j.s; dir = j.dir; continue; }
    const n = conn3(plan, r, e, cfg); if (!n) return { fall: true, cost, at: A.kind };
    const B = plan.R[n[0]]; if ((A.pjoin && e === 0) || B.pjoin) pj++; if (B.pocket) return { park: B.spiral !== undefined && n[1] === 1 ? B.id + UP3 : B.id, cost: cost + B.len, pj };
    r = B.id; s = n[1] ? B.len : 0; dir = n[1] ? -1 : 1;
  }
  return { loop: true, cost };
}
const UP3 = 10000;
const exitPos = (plan, p, cfg) => { const n = p >= UP3 ? conn3(plan, p - UP3, 0, cfg) : conn3(plan, p, 1, cfg); if (!n) return null; const B = plan.R[n[0]]; return { r: B.id, s: n[1] ? B.len : 0, dir: n[1] ? -1 : 1 }; };
function solve3(plan) {
  const M = plan.machines, keyIdx = new Map(); plan.R.filter(r => r.key).forEach((r, i) => keyIdx.set(r.id, i));
  const def = M.map(m => m.def), all = [[]]; for (const m of M) { const n = m.type === 'tt' ? m.stops.length : m.type === 'lift' ? m.n : 2, nx = []; for (const c of all) for (let v = 0; v < n; v++) nx.push([...c, v]); all.length = 0; all.push(...nx); }
  const take = (mask, p) => keyIdx.has(p % UP3) ? mask | (1 << keyIdx.get(p % UP3)) : mask, bits = x => { let n = 0; while (x) { n += x & 1; x >>= 1; } return n; };
  const spawn = { r: plan.line, s: plan.half, dir: 1 };
  // idle: default machines forever must never win or fall
  { let t = trace3(plan, spawn, def, { n: 0 }), seen = new Set(), mask = 0;
    for (let k = 0; k < 30; k++) { if (t.win) return { ok: false, why: 'idling wins' }; if (t.fall || t.loop) return { ok: false, why: 'idling falls' };
      mask = take(mask, t.park); const key = t.park + '|' + mask; if (seen.has(key)) break; seen.add(key); const ex = exitPos(plan, t.park, def); if (!ex) return { ok: false, why: 'idling falls' }; t = trace3(plan, ex, def, { n: bits(mask) }); }
    plan.freeKeys = bits(mask); }
  const first = trace3(plan, spawn, def, { n: 0 }); if (!first.park) return { ok: false, why: 'no first stop' };
  // Dijkstra over (pocket, keys); edges: any machine setting while parked
  const start = { p: first.park, mask: take(0, first.park), cost: first.cost, prev: null, cfg: def }, dist = new Map(), Q = [start]; dist.set(start.p + '|' + start.mask, start.cost);
  const full = (1 << plan.nKeys) - 1; let goal = null;
  while (Q.length) { Q.sort((a, b) => a.cost - b.cost); const cur = Q.shift(); if (cur.cost > (dist.get(cur.p + '|' + cur.mask) ?? 1e9) + 1e-9) continue;
    if (cur.won) { goal = cur; break; }
    for (const cfg of all) { const ex = exitPos(plan, cur.p, cfg); if (!ex) continue; const t = trace3(plan, ex, cfg, { n: bits(cur.mask) }); const c = cur.cost + t.cost + 2;
      if (t.win) { if (cur.mask === full) Q.push({ won: true, cost: c, prev: cur, cfg, p: -1, mask: full }); continue; }
      if (!t.park) continue; const mask = take(cur.mask, t.park), key = t.park + '|' + mask;
      if (c < (dist.get(key) ?? 1e9) - 1e-9) { dist.set(key, c); Q.push({ p: t.park, mask, cost: c, prev: cur, cfg }); } } }
  if (!goal) return { ok: false, why: 'no solution' };
  // the plan: in each pocket on the way, the setting to leave with
  const chain = []; for (let n = goal; n; n = n.prev) chain.unshift(n);
  const legs = []; for (let i = 0; i < chain.length - 1; i++) legs.push({ pocket: chain[i].p, cfg: chain[i + 1].cfg });
  let changes = 0, prev = def; const used = new Set(); for (const l of legs) { l.cfg.forEach((v, i) => { if (v !== prev[i]) { changes++; used.add(i); } }); prev = l.cfg; }
  let pj = 0, camMoves = 0, pc = plan.cam != null ? def[plan.cam] : 0; for (const l of legs) { const ex = exitPos(plan, l.pocket, l.cfg); if (!ex) continue; if (plan.R[ex.r].pjoin) pj++; pj += trace3(plan, ex, l.cfg, { n: plan.nKeys }).pj || 0; if (plan.cam != null && l.cfg[plan.cam] !== pc) { camMoves++; pc = l.cfg[plan.cam]; } }
  return { ok: true, legs, stops: legs.length, changes, used: used.size, cost: goal.cost, minutes: (goal.cost / LV.speed) / 60, pj, camMoves };
}

function hull5(pts) { const P = pts.map(([x, y]) => ({ x, y })).sort((a, b) => a.x - b.x || a.y - b.y), cr = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x), lo = [], up = [];
  for (const p of P) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
  for (const p of P.reverse()) { while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
  return lo.slice(0, -1).concat(up.slice(0, -1)); }
const inHull5 = (h, p) => h.every((a, i) => { const b = h[(i + 1) % h.length]; return (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x) > 0; });
// ---- geometry checks (honest roads stay apart; the island's screen join and the perspective joins are the only screen joins allowed)
function checkPlan3(plan) {
  const R = plan.R, bad = [], near = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const nearJoin = (p, k = 1) => plan.joinsAt.some(j => Math.hypot(p[0] - j[0], p[1] - j[1], p[2] - j[2]) < (j[3] || 2.6) * k);
  const mOf = A => A.curve ? 'c' + A.curve.m : A.beam !== undefined ? 'b' + A.beam : A.beamOf !== undefined ? 'b' + A.beamOf : null;
  const sameMachine = (A, B) => mOf(A) !== null && mOf(A) === mOf(B);
  const pvIds = m => (m.pv || []).flat().filter(x => x != null);
  const ownOf = m => m.type === 'camera' ? [] : m.type === 'tt' ? [m.arm, ...m.branch.filter(x => x >= 0), ...pvIds(m)] : m.type === 'cross' ? [...m.curves, ...m.ext.map(x => x.r)] : m.type === 'points' ? [m.leaf, m.spur]
    : m.type === 'lift' ? [m.deck, ...m.floors.filter(f => f.r != null).map(f => f.r), ...m.floors.flatMap(f => (f.pv || []).filter(x => x != null))] : m.type === 'seesaw' ? [m.beam, m.ghost, ...new Set(Object.values(m.ports).map(x => x.r))] : m.spans.flatMap(si => { const S = plan.spans[si]; return [S.a, S.b, S.road].filter(x => x != null); });
  // roads may come close only near a join they share: within two hops of each other in the track graph
  const adj = R.map(() => new Set()), tie = (a, b) => { if (a == null || b == null) return; adj[a].add(b); adj[b].add(a); };
  for (const [k, v] of plan.links) tie(+k.split(':')[0], v[0]);
  for (const r of R) { for (const f of r.forks) tie(r.id, f.to); for (const j of r.joins) tie(r.id, j.to); }
  for (const m of plan.machines) { const own = ownOf(m); for (const a of own) for (const b of own) if (a !== b) tie(a, b); }
  const close = (a, b) => adj[a].has(b) || [...adj[a]].some(c => adj[c].has(b));
  for (let a = 0; a < R.length; a++) for (let b = a + 1; b < R.length; b++) { const A = R[a], B = R[b]; if (sameMachine(A, B)) continue; let worst = 9; const tied = close(a, b);
    for (let i = 0; i < A.pts.length; i += 2) for (let j = 0; j < B.pts.length; j += 2) { const p = A.pts[i], q = B.pts[j], d = near(p, q); if (d < 1.5 && Math.abs(p[2] - q[2]) < 3.4 && !(tied && nearJoin(p) && nearJoin(q))) worst = Math.min(worst, d); }
    if (worst < 1.5) { bad.push(`${A.kind} too close to ${B.kind}`); if (bad.length > 3) return bad; } }
  // discs: nothing but their own ports inside
  for (const D of plan.discs) for (const A of R) { if (A.curve) continue; for (const p of A.pts) { const d = near(p, D.c); if (d < D.R - .1 && Math.abs(p[2] - D.c[2]) < 2) { bad.push(`${A.kind} cuts a crossover disc`); break; } } }
  // lift frames: nothing but the deck inside; posts: nothing running through them
  for (const X of plan.boxes) { const c = Math.cos(X.base * Math.PI / 180), sn = Math.sin(X.base * Math.PI / 180);
    for (const A of R) { if (A.id === X.own || A.ghost) continue; if (A.pts.some(p => { const dx = p[0] - X.J[0], dy = p[1] - X.J[1], u = dx * c + dy * sn, v = -dx * sn + dy * c; return u > X.x0 && u < X.x1 && Math.abs(v) < X.half && p[2] > X.z0 && p[2] < X.z1; })) { bad.push(`${A.kind} runs into a lift`); break; } } }
  for (const Q of plan.posts) for (const A of R) { if (A.ghost || (Q.own >= 0 && A.beam === Q.own)) continue; if (A.pts.some(p => near(p, Q.p) < .75 && p[2] < Q.top + .3)) { bad.push(`${A.kind} runs into a post`); break; } }
  // turntable swings
  for (const G of plan.ghosts) { const inSweep = q => { const d = near(q, G.piv); if (d > 4.2 || d < 1 || Math.abs(q[2] - G.piv[2]) > 2) return false; let a = Math.atan2(q[1] - G.piv[1], q[0] - G.piv[0]) * 180 / Math.PI - G.base; a = ((a % 360) + 540) % 360 - 180; return G.open > 0 ? a > 6 && a < G.open - 6 : a < -6 && a > G.open + 6; };
    for (const A of R) { if (A.kind === 'tt-arm') continue; if (A.pts.some(inSweep)) { bad.push(`${A.kind} in a turntable's swing`); break; } } }
  // ends that meet on screen without meeting in 3D (only the pier and its island road may)
  const ends = []; for (const A of R) if (A.kind !== 'tt-arm') ends.push({ A, p: A.pts[0], w: 0 }, { A, p: A.pts[A.pts.length - 1], w: 1 });   // arm tips are listed per stop below
  for (const G of plan.machines) if (G.type === 'tt') G.stops.forEach((a, i) => { const h = G.base + a; ends.push({ A: { kind: 'arm tip', id: -2, tip: [G.i, i] }, p: [G.pivot[0] + G3.ARM * dirv(h)[0], G.pivot[1] + G3.ARM * dirv(h)[1], G.pivot[2]] }); });
  for (const G of plan.machines) if (G.type === 'lift') for (let f = 1; f < G.n; f++) if (G.floors[f].pv) ends.push({ A: { kind: 'lift mouth', id: -3, mouth: [G.i, f] }, p: [G.J[0], G.J[1], G.J[2] + f * G.step] });
  const pjMatch = (x, y, vi) => { const pj = y.A.pjoin; if (!pj || y.w !== 0 || pj.v !== vi) return false; return x.A.tip ? pj.m === x.A.tip[0] && pj.i === x.A.tip[1] : x.A.mouth ? pj.lift === x.A.mouth[0] && pj.f === x.A.mouth[1] : false; };
  for (const [vi, yaw] of plan.views.entries()) for (let a = 0; a < ends.length; a++) for (let b = a + 1; b < ends.length; b++) { const e = ends[a], f = ends[b]; if (e.A === f.A) continue;
    if (Math.hypot(e.p[0] - f.p[0], e.p[1] - f.p[1], e.p[2] - f.p[2]) < .3) continue; const s1 = scrV(e.p, yaw), s2 = scrV(f.p, yaw);
    const wanted = (vi === 0 && ((e.A.kind === 'pier' && f.A.far) || (f.A.kind === 'pier' && e.A.far))) || pjMatch(e, f, vi) || pjMatch(f, e, vi); if (Math.hypot(s1[0] - s2[0], s1[1] - s2[1]) < .6 && !wanted) { bad.push(`ends of ${e.A.kind} and ${f.A.kind} meet on screen`); if (bad.length > 3) return bad; } }
  // nothing hides behind a lift's frame on screen, in any view (the feedback on the curtain study): only the lift's own deck and the roads that meet its mouth
  for (const X of plan.boxes) { const c = Math.cos(X.base * Math.PI / 180), sn = Math.sin(X.base * Math.PI / 180), m = plan.machines.find(q => q.type === 'lift' && q.J === X.J);
    const corners = []; for (const u of [X.x0, X.x1]) for (const v of [-X.half, X.half]) for (const z of [X.z0, X.z1]) corners.push([X.J[0] + u * c - v * sn, X.J[1] + u * sn + v * c, z]);
    const mouths = m ? Array.from({ length: m.n }, (_, f) => [X.J[0], X.J[1], X.J[2] + f * m.step]) : [];
    for (const yaw of plan.views) { const hull = hull5(corners.map(q => scrV(q, yaw))), dC = depthV([X.J[0] + (X.x0 + X.x1) / 2 * c, X.J[1] + (X.x0 + X.x1) / 2 * sn, (X.z0 + X.z1) / 2], yaw);
      for (const A of R) { if (A.id === X.own || A.ghost) continue; let n = 0;
        for (let k = 0; k < A.pts.length; k += 2) { const p = A.pts[k]; if (mouths.some(q => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) < 1.8)) continue; if (A.pjoin && A.pjoin.lift === (m && m.i) && plen(A.pts.slice(0, k + 1)) < 3) continue;
          const q = scrV(p, yaw); if (inHull5(hull, { x: q[0], y: q[1] }) && depthV(p, yaw) < dC) n++; }
        if (n >= 3) { bad.push(`${A.kind} hides behind a lift`); break; } } } }
  // roads that pass in front of each other on screen make a level hard to read
  plan.crossed = 0;
  for (const yaw of plan.views) { const SP = R.map(r => ({ r, s: r.pts.filter((_, k) => k % 3 === 0).map(p => ({ p, q: scrV(p, yaw), j: nearJoin(p, .55) })) })); let crossed = 0, total = 0;
    for (const A of SP) for (const a of A.s) { total++; if (a.j) continue; let hit = false; const strict = A.r.kind === 'pier' || A.r.far;
      for (const B of SP) { if (B === A || sameMachine(A.r, B.r) || (strict && (B.r.kind === 'pier' || B.r.far))) continue; for (const b of B.s) if ((strict || !b.j) && Math.hypot(a.q[0] - b.q[0], a.q[1] - b.q[1]) < .9 && near(a.p, b.p) > 1.5) { hit = true; break; } if (hit) break; }
      if (hit) { crossed++; if (strict) { bad.push('the island crosses another road on screen'); return bad; } } }
    plan.crossed = Math.max(plan.crossed, +(crossed / total).toFixed(3)); }
  if (plan.crossed > CROSS_MAX) bad.push('roads cross on screen');
  return bad;
}

const NAMES3 = { 1: [['Lilac', 'Dusk', 'Coral', 'Quiet', 'Peach', 'Slow', 'Amber', 'Lavender', 'Pale', 'Evening', 'Rose', 'Hushed'], ['Steps', 'Arcade', 'Terrace', 'Causeway', 'Cloister', 'Crossing', 'Gallery', 'Landing', 'Rampart', 'Courtyard', 'Colonnade', 'Stair']],
  2: [['Fern', 'Moss', 'Clover', 'Willow', 'Meadow', 'Lily', 'Ivy', 'Hollow', 'Bramble', 'Sorrel', 'Thyme', 'Linden'], ['Terraces', 'Steps', 'Falls', 'Bower', 'Arbour', 'Pond', 'Walk', 'Garden', 'Pergola', 'Rill', 'Glade', 'Orchard']],
  3: [['Harbour', 'Azure', 'Salt', 'Tile', 'Shutter', 'Gull', 'Lantern', 'Terracotta', 'Sea', 'Chapel', 'Bell', 'Market'], ['Lane', 'Quay', 'Square', 'Steps', 'Arches', 'Wharf', 'Alley', 'Plaza', 'Rooftops', 'Mole', 'Stair', 'Row']] };
NAMES3[4] = [['Violet', 'Saffron', 'Magenta', 'Ember', 'Amethyst', 'Marigold', 'Plum', 'Tangerine', 'Orchid', 'Honey', 'Indigo', 'Coral'], ['Ziggurat', 'Steps', 'Terraces', 'Spring', 'Balance', 'Prism', 'Stair', 'Ramp', 'Court', 'Dais', 'Pivot', 'Gate']];
NAMES3[5] = [['Lantern', 'Moon', 'Candle', 'Firefly', 'Ink', 'Midnight', 'Star', 'Owl', 'Ember', 'Paper', 'Velvet', 'Hush'], ['Row', 'Yard', 'Steps', 'Alley', 'Court', 'Bridge', 'Square', 'Walk', 'Quarter', 'Lane', 'Roofs', 'Watch']];
NAMES3[6] = [['Brass', 'Copper', 'Cog', 'Rivet', 'Piston', 'Bellows', 'Gauge', 'Valve', 'Spindle', 'Ratchet', 'Boiler', 'Flywheel'], ['Works', 'Yard', 'Gallery', 'Floor', 'Hall', 'Shop', 'Foundry', 'Stair', 'Gantry', 'Mill', 'Court', 'Loft']];
// a see-saw built like the sample's: a beam on a pivot, wound by a spring that only holds while you push
function seesawM(L, o) {
  const th = L.th, g = L.g, a = Math.asin(1 / 2.5), X = 2.5 * Math.cos(a), outer = new T.Group(); outer.position.copy(V(...o.P)); outer.rotation.y = -o.base * Math.PI / 180; g.add(outer);
  const pivot = new T.Group(); pivot.position.copy(V(X, 0, 1)); outer.add(pivot); const beamMat = tri(th.idle, { fresh: true, side: true });
  const beam = L.road(L3([-2.5, 0, 0], [2.5, 0, 0], UP), { g: pivot, mat: beamMat, th: .35 });
  const sd = o.sd; B(outer, X - .3, -.85 * sd - .3, -3, X + .3, -.85 * sd + .3, 1.25, tri(sp(th, 2))); CY(outer, X, -.42 * sd, .14, .85, 1.15, tri(th.mech), 12).rotation.x = Math.PI / 2;
  const st = { c: 0, beam }; pivot.rotation.z = a;
  st.m = L.machine({ key: o.key, name: o.name, size: .6, place: h => { h.position.copy(V(X, -.85 * sd, 1.35)); outer.add(h); },
    tick(dt, drive) { const c = st.c, hold = 90 + 150 * c, P = powerOf(rider.cad, rider.gear, .2 + 1.3 * c);
      if (drive > 0) st.c += (P - hold) * .006 * dt; else st.c -= .3 * dt; st.c = clamp(st.c, 0, 1);
      const k = clamp((st.c - .1) / .8, 0, 1), sm = k * k * (3 - 2 * k); pivot.rotation.z = a * (1 - 2 * sm); st.tip = sm; setTri(beamMat, mixPal(th.idle, th.mech, sm));
      return drive > 0 ? .2 + 1.3 * st.c : 0; } });
  return st;
}
// a lamp: a lantern on a post beside each of its spans. Lit, its light bridge holds; dark, its dark gap holds
function lampM(L, o) {
  const th = L.th, g = L.g, glow = th.glow || th.goal, st = { b: 0 }, parts = [];
  o.spans.forEach((S, k) => { const [px, py, z] = S.post, [mx, my] = S.mid; B(g, px - .3, py - .3, Math.min(-2.4, z - 2.4), px + .3, py + .3, z - .5, tri(sp(th, 0))); CY(g, px, py, .08, z - .5, z + 3, tri(th.mechDark || th.idle), 8);
    const dx = mx - px, dy = my - py; B(g, Math.min(px, mx) - .05 + (dx ? 0 : 0), Math.min(py, my) - .05, z + 2.95, Math.max(px, mx) + .05, Math.max(py, my) + .05, z + 3.05, tri(th.mechDark || th.idle));
    const bulb = new T.Mesh(new T.SphereGeometry(.17, 14, 10), basic('#3A3D66')); at(g, bulb, mx, my, z + 2.8);
    const halo = sprite(TEX.glow, 2.6, 2.6, glow, { opacity: 0, add: true }); at(g, halo, mx, my, z + 2.8);
    const cg = new T.ConeGeometry(1.8, 3, 32, 1, true); cg.translate(0, -1.5, 0); const cone = new T.Mesh(cg, basic(glow, { opacity: 0, add: true, side: true })); at(g, cone, mx, my, z + 2.8);
    parts.push({ bulb, halo, cone }); if (k === 0) st.foot = [px, py, z - .5]; });
  st.m = L.machine({ key: o.key, name: o.name, size: .5, place: h => { h.position.copy(V(...st.foot)); g.add(h); },
    tick(dt, drive) { const tgt = drive > 0 ? clamp((rider.cad - 40) / 50, 0, 1) : 0; st.b += (tgt - st.b) * Math.min(1, dt * (drive > 0 ? 2.5 : 1.3));
      for (const p of parts) { p.bulb.material.color.set(mix('#3A3D66', glow, st.b)); p.halo.material.opacity = st.b * .9; p.cone.material.opacity = st.b * .14; } return drive > 0 ? .1 + .35 * st.b : 0; } });
  return st;
}
// the camera crank: a dial on a pedestal; pedalling turns the whole view, and it clicks into its detents
function cameraCrank(L, o) {
  const th = L.th, g = L.g, [x, y, z] = o.at, det = o.detents, lo = Math.min(...det), hi = Math.max(...det), st = { ang: det[0], sweep: det[0] === lo ? 1 : -1 };
  CY(g, x, y, .6, Math.min(-2.4, z - 2.4), z - .02, tri(sp(th, 0)), 32);
  const dial = new T.Group(); dial.position.copy(V(x, y, z)); g.add(dial); const dm = tri(th.mech, { fresh: true });
  const ring = new T.Mesh(new T.RingGeometry(.36, .48, 40), basic(th.lane, { side: true })); ring.rotation.x = -Math.PI / 2; ring.position.y = .02; dial.add(ring);
  for (const d of det) { const a = d * Math.PI / 180, tick = new T.Mesh(UNIT, basic(th.lane)); tick.scale.set(.16, .03, .05); tick.position.set(.56 * Math.cos(a), .03, -.56 * Math.sin(a)); tick.rotation.y = a; dial.add(tick); }
  const needle = new T.Group(); dial.add(needle); const nm = new T.Mesh(UNIT, dm); nm.scale.set(.42, .07, .1); nm.position.set(.2, .06, 0); needle.add(nm);
  st.m = L.machine({ key: o.key, name: o.name, size: .55, place: h => { h.position.copy(V(x, y, z + .04)); g.add(h); },
    tick(dt, drive) {
      if (drive > 0) { st.ang += st.sweep * drive * 30; if (st.ang <= lo || st.ang >= hi) { st.ang = clamp(st.ang, lo, hi); st.sweep *= -1; } }
      else { const tgt = det.reduce((a, d) => Math.abs(d - st.ang) < Math.abs(a - st.ang) ? d : a, det[0]); st.ang += clamp(tgt - st.ang, -60 * dt, 60 * dt); }
      L.view.yaw = st.ang * Math.PI / 180; needle.rotation.y = st.ang * Math.PI / 180; setTri(dm, mixPal(th.mech, tone(th.goal), clamp(this.bloom.e, 0, 1)));
      const off = Math.min(...det.map(d => Math.abs(st.ang - d))); return drive > 0 ? .2 + .5 * Math.exp(-((off / 7) ** 2)) : 0; } });
  st.at = d => Math.abs(st.ang - d) < .5;
  return st;
}
function genDef3(plan, sol) {
  const tier = plan.tier, Rn = mulberry(plan.seed * 31 + TIERS.indexOf(tier) * 101), N = NAMES3[tier.zone], name = `${N[0][Math.floor(Rn() * 12)]} ${N[1][Math.floor(Rn() * 12)]}`;
  let kn = 0; const M = plan.machines.map(m => ({ ...m, key: m.type === 'lift' ? null : G3.LETTERS[kn++] }));
  const spurOf = i => plan.spurs.find(s => s.m === i), sideName = m => { const s = spurOf(m.i), same = plan.spurs.filter(q => q.side === s.side).sort((a, b) => a.x0 - b.x0), base = s.side > 0 ? 'North' : 'South'; return same.length < 2 ? base : `${base}-${same.indexOf(s) === 0 ? 'west' : same.indexOf(s) === same.length - 1 ? 'east' : 'middle'}`; };
  const hostOf = m => { const A = plan.R[m.host]; if (A.kind === 'chain') { const p = m.pivot || m.center || m.J; return 'Outer ' + (Math.abs(p[0]) > Math.abs(p[1]) ? (p[0] > 0 ? 'east' : 'west') : (p[1] > 0 ? 'north' : 'south')); } return A.kind === 'line' ? (A.pts[0][0] + A.pts[A.pts.length - 1][0]) / 2 > (m.type === 'tt' ? m.pivot : m.type === 'cross' ? m.center : m.type === 'lift' ? m.J : m.P)[0] ? 'West' : 'East' : sideName(M[A.points]); };
  const mName = m => m.type === 'camera' ? 'Camera' : m.type === 'points' ? `${sideName(m)} points` : m.type === 'lamp' ? `Lamp ${['one', 'two'][m.no]}` : `${hostOf(m)} ${{ cross: 'crossover', lift: 'lift', seesaw: 'see-saw' }[m.type] || (m.hub ? 'hub' : 'turntable')}`;
  M.forEach(m => m.name = mName(m));
  const verb = m => m.type === 'camera' ? 'turns the camera a quarter: a turntable stop or lift floor that leads into thin air from one side meets a road far below from the other' : m.type === 'points' ? `lowers the ${m.name.toLowerCase()}` : m.type === 'cross' ? `turns the ${m.name.toLowerCase()} a quarter (it swaps which roads its two curves join)` : m.type === 'tt' ? (m.hub ? `swings the ${m.name.toLowerCase()} through its three stops` : `swings the ${m.name.toLowerCase()}`)
    : m.type === 'lift' ? `your cadence runs the ${m.name.toLowerCase()} all the time: hold about 50 rpm for the ground floor, 70 for the first${m.n > 2 ? ', 85 for the second' : ''}${m.floors.some(f => f.pv) ? ' (its upper floors open onto thin air)' : ''}`
    : m.type === 'seesaw' ? `winds the ${m.name.toLowerCase()}: push about 88 rpm and it tips the other way, but only while you keep pushing`
    : `lights ${m.name.toLowerCase()}: its ${m.spans.length > 1 ? 'light bridge holds only while lit, and its dark gap only while dark' : 'light bridge holds only while you keep it lit, above 70 rpm'}`;
  const kgR = plan.keygate ? plan.R[plan.keygate.pocket] : null;
  const hint = [`${M.map(m => `<b>${m.key ? m.key.toUpperCase() : 'No button:'}</b> ${verb(m)}`).join('; ')}.`, `There are ${plan.nKeys} keys${kgR ? `, one behind a key gate that opens once you carry ${kgR.need === 1 ? 'one key' : 'two'}` : ''}. The gate home opens for a wheel carrying every key.`,
    'Set a machine, or turn the camera, while the wheel is out in a cul-de-sac.'].filter(Boolean).join(' ');
  const all = plan.R.flatMap(r => r.pts).concat(plan.posts.map(q => q.p)), xs = all.map(p => p[0]), ys = all.map(p => p[1]), lm = [Math.min(...xs) - 2.4, Math.min(...ys) - 2.4];
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2, ztop = Math.max(...all.map(p => p[2]));
  return { id: `${tier.id}-${plan.seed}`, name, th: () => THEMES[tier.theme], cruise: [78, 92], hint, plan, sol, gen: true, yaws: plan.views,
    build(L) {
      const th = L.th, g = L.g, P = L.props, postMat = tri(sp(th, 1)), ER = []; P.ER = ER; P.keys = []; P.held = 0;
      const occupied = plan.R.filter(r => !r.ghost).flatMap(r => r.pts), swings = M.filter(m => m.type === 'tt' || m.type === 'cross').map(m => m.type === 'tt' ? m.pivot : m.center).concat(plan.camAt ? [plan.camAt] : []);
      const frames = M.filter(m => m.type === 'lift' || m.type === 'seesaw').map(m => m.type === 'lift' ? m.J : m.center);
      const post = (x, y, z) => { if (occupied.some(p => Math.hypot(p[0] - x, p[1] - y) < .9 && p[2] < z - .5)) return; if (swings.some(c => Math.hypot(c[0] - x, c[1] - y) < 4.2 && Math.abs(c[2] - z) < 1)) return; if (frames.some(c => Math.hypot(c[0] - x, c[1] - y) < 1.2)) return; CY(g, x, y, .14, Math.min(-2.4, z - 2.4), z - .25, postMat, 10); };
      const pier = (x, y, z) => CY(g, x, y, .5, Math.min(-2.6, z - 2.6), z - .3, tri(sp(th, 0)), 24);
      const mk = (r, o = {}) => { const e = L.road(r.pts.map(p => ({ p, n: [0, 0, 1] })), o); ER[r.id] = e; return e; };
      const sFar = (60 + 150) * Math.PI / 180 * G3.TEAR + .3;
      const mkKey = p => { const k = new T.Group(), m = basic(th.goal); const bow = new T.Mesh(new T.TorusGeometry(.2, .06, 8, 24), m); bow.position.y = .32; k.add(bow); const sh = new T.Mesh(UNIT, m); sh.scale.set(.07, .5, .07); k.add(sh);
        for (const [y, w] of [[-.16, .16], [-.04, .12]]) { const tooth = new T.Mesh(UNIT, m); tooth.scale.set(w, .06, .06); tooth.position.set(w / 2, y, 0); k.add(tooth); }
        k.add(sprite(TEX.glow, 1.4, 1.4, th.goal, { opacity: .45, add: true })); k.position.copy(p); g.add(k); const q = { k, p: p.clone(), got: false, t: 0 }; P.keys.push(q); return q; };
      const gates = []; const mkGate = (gt, need) => { const gq = gt.at(2), gd = gq.d, gn = new T.Vector3(-gd.z, 0, gd.x).normalize(), gateMat = tri(th.mech, { fresh: true });
        for (const k of [-.78, .78]) { const q = gq.p.clone().addScaledVector(gn, k); CY(g, q.x, q.z, .1, q.y - .3, q.y + .75, tri(th.mechDark || th.idle), 10); }
        const gate = new T.Group(); gate.position.copy(gq.p).addScaledVector(gn, -.78); gate.position.y += .6; gate.lookAt(gate.position.clone().add(gn)); g.add(gate);
        const bar = new T.Mesh(UNIT, gateMat); bar.scale.set(.12, .12, 1.6); bar.position.z = .8; bar.userData.gate = true; gate.add(bar);
        if (need === 'all') { const lock = new T.Mesh(new T.TorusGeometry(.16, .05, 8, 20), gateMat); lock.position.z = .78; lock.userData.gate = true; gate.add(lock); }
        else for (let k = 0; k < need; k++) { const pip = new T.Mesh(new T.SphereGeometry(.11, 12, 8), basic(th.goal)); pip.position.set(0, .16, .55 + k * .5 - (need - 1) * .25); pip.userData.gate = true; gate.add(pip); }
        gates.push({ gate, gateMat, open: () => need === 'all' ? P.held === P.keys.length : P.held >= need }); };
      const line = mk(plan.R[plan.line]); P.line = line; for (let x = -plan.half + 1.5; x <= plan.half - 1.5; x += 3) post(x, 0, 0);
      const built = new Set([plan.line]);
      for (const m of M.filter(m => m.type === 'points')) { m.obj = peelSwitch(L, { line, s: m.s, dir: m.dir, side: m.ps, key: m.key, name: m.name, text: `Peeled off ${m.side > 0 ? 'north' : 'south'}` }); ER[m.leaf] = m.obj.leaf; built.add(m.leaf);
        const sr = mk(plan.R[m.spur]); built.add(m.spur); for (let a = 2.4; a < sr.L - 1; a += 3.2) { const f = sr.at(a).p; post(f.x, f.z, f.y); } }
      for (const m of M.filter(m => m.type === 'tt')) { m.obj = turntable(L, { key: m.key, name: m.name, pivot: m.pivot, len: G3.ARM, base: m.base, open: m.stops.find(a => a !== 0), detents: m.stops }); ER[m.arm] = m.obj.road; built.add(m.arm); }
      for (const m of M.filter(m => m.type === 'cross')) { m.obj = crossDisc(L, { center: m.center, R: G3.CR, key: m.key, name: m.name, base: m.base }); ER[m.curves[0]] = m.obj.roads[0]; ER[m.curves[1]] = m.obj.roads[1]; built.add(m.curves[0]); built.add(m.curves[1]); }
      for (const m of M.filter(m => m.type === 'camera')) m.obj = cameraCrank(L, { key: m.key, name: m.name, at: plan.camAt, detents: plan.views });
      for (const m of M.filter(m => m.type === 'lift')) { m.obj = faucetLift(L, { auto: true, key: m.key, name: m.name, J: m.J, heading: m.base, step: m.step, ...(th.leaf ? { postPal: th.leaf, pipePal: th.leaf } : {}) }); ER[m.deck] = m.obj.deck; built.add(m.deck); }
      for (const m of M.filter(m => m.type === 'seesaw')) { const sup = plan.posts.find(q => q.own === m.i), dv = dirv(m.base), sd = Math.sign((sup.p[0] - m.center[0]) * -dv[1] + (sup.p[1] - m.center[1]) * dv[0]) || 1;
        m.obj = seesawM(L, { P: m.P, base: m.base, key: m.key, name: m.name, sd: -sd }); ER[m.beam] = m.obj.beam; built.add(m.beam); built.add(m.ghost); }
      const lit = b => ({ t: mix('#2A2D55', '#FFF2C4', b), l: mix('#22264A', '#FFD979', b), r: mix('#1C1F40', '#FFC24A', b) });
      for (const m of M.filter(m => m.type === 'lamp')) { const spans = m.spans.map(si => plan.spans[si]); m.obj = lampM(L, { key: m.key, name: m.name, spans });
        for (const S of spans) if (S.kind === 'light') { const mat = tri(lit(0), { fresh: true, opacity: .5, side: true }), lamp = m.obj;
          const e = mk(plan.R[S.road], { mat, th: .12, noLane: true, solid: () => lamp.b > .45, goneText: 'The light faded under the wheel' }); built.add(S.road);
          L.view.updaters.push(() => { setTri(mat, lit(lamp.b)); mat.uniforms.opacity.value = .92 * lamp.b; for (const v of e.vis || []) v.visible = mat.uniforms.opacity.value > .02; }); } }
      for (const r of plan.R) { if (built.has(r.id) || r.ghost) continue;
        if (r.pocket) { const e = mk(r); const hr = r.heading * Math.PI / 180, s0 = r.pts[0]; pier(s0[0] + 2.6 * Math.cos(hr), s0[1] + 2.6 * Math.sin(hr), s0[2]); if (r.key) e.keyObj = mkKey(e.at(sFar).p); continue; }
        if (r.goal) { const e = mk(r, { goal: true, pal: sp(th, 2) }); const q = e.S.at(-1).p; CY(g, q.x, q.z, .45, Math.min(-2.6, q.y - 2.6), q.y - .3, tri(sp(th, 0)), 20); continue; }
        const e = mk(r, r.far ? { pal: th.stone } : r.kind === 'pier' ? { pal: sp(th, 2), edgeText: 'Off the end of the pier' } : {});
        for (let a = 1.6; a < e.L - .6; a += 2.8) { const f = e.at(a).p; post(f.x, f.z, f.y); } }
      // dark gaps: the deck is painted across them until the lamp shows the hole
      for (const m of M.filter(m => m.type === 'lamp')) for (const si of m.spans) { const S = plan.spans[si]; if (S.kind !== 'dark') continue; const lamp = m.obj, A = ER[S.a], Bd = ER[S.b];
        A.gaps.push({ k: 1, to: Bd, toK: 0, when: () => lamp.b < .3, text: 'Crossed the dark gap unseen' }); Bd.gaps.push({ k: 0, to: A, toK: 1, when: () => lamp.b < .3, text: 'Crossed the dark gap unseen' });
        A.edgeText = Bd.edgeText = 'The lamp lit the gap, so it was real';
        const [x0, x1] = [Math.min(S.P1[0], S.P2[0]), Math.max(S.P1[0], S.P2[0])], [y0, y1] = [Math.min(S.P1[1], S.P2[1]), Math.max(S.P1[1], S.P2[1])], w = .5, z = S.P1[2];
        const darkMat = tri(sp(th, 1), { fresh: true, opacity: .99 }), paint = B(g, x0 - (x1 > x0 ? 0 : w), y0 - (y1 > y0 ? 0 : w), z - .5, x1 + (x1 > x0 ? 0 : w), y1 + (y1 > y0 ? 0 : w), z, darkMat);
        L.view.updaters.push(() => { darkMat.uniforms.opacity.value = clamp(1 - lamp.b * 2.2, 0, 1); paint.visible = darkMat.uniforms.opacity.value > .01; }); }
      // forks and joins, now that every road exists
      for (const r of plan.R) { const e = ER[r.id]; if (!e) continue;
        for (const f of r.forks) { if (f.pts !== undefined) continue; const host = e, gi = f.gate === 'all' ? plan.home.gi : plan.keygate.gi, sG = host.cum[Math.min(host.cum.length - 1, gi)];
          const kgR = plan.keygate && plan.R[plan.keygate.pocket];
          host.forks.push({ s: sG, dir: -1, to: ER[f.to], toK: 0, when: () => f.gate === 'all' ? P.held === P.keys.length : P.held >= kgR.need, text: f.gate === 'all' ? 'Every key, so the gate home opened' : 'The key gate opened' });
          if (f.gate === 'need') ER[f.to].joins = [{ k: 0, to: host, s: sG, dir: -1 }]; mkGate(ER[f.to], f.gate === 'all' ? 'all' : kgR.need); } }
      if (!plan.views[1]) { const [bx, by] = lm; B(g, bx - .9, by - .9, -2.4, bx + .9, by + .9, 1.6, tri(sp(th, 0))); at(g, new T.Mesh(new T.SphereGeometry(.85, 20, 12, 0, TAU, 0, Math.PI / 2), tri(th.roof || th.mech)), bx, by, 1.6);
        for (let k = 0; k < 2; k++) onFace(g, 'y', by + .9, bx, -.9 + k * 1.3, archGeo(.3, .7), basic((th.win || th.blue || th.leaf || th.stone).r)); }
      P.M = M; P.pocketOf = new Map(plan.R.filter(r => r.pocket).map(r => [ER[r.id], r.id]));
      L.view.updaters.push((tt, dt) => {
        for (const q of P.keys) { q.k.rotation.y = tt * 1.6; q.k.position.y = q.p.y + .8 + .1 * Math.sin(tt * 2);
          if (!q.got && L.wheel.position.distanceTo(q.p) < .7) { q.got = true; P.held++; L.flash(`Picked up a key (${P.held} of ${P.keys.length})`); }
          if (q.got) { q.t = Math.min(1, q.t + dt * 2.5); q.k.scale.setScalar(Math.max(.001, 1 - q.t)); q.k.position.y += q.t * 1.5; } }
        for (const G of gates) { const o = G.open(); G.gate.rotation.z += clamp((o ? -Math.PI / 2 : 0) - G.gate.rotation.z, -2 * dt, 2 * dt); setTri(G.gateMat, o ? tone(th.goal) : th.mech); }
        const ex = M.map(m => m.type === 'lift' ? `${m.name.toLowerCase()} ${m.obj.z === 0 ? 'ground' : Math.abs(m.obj.z - m.step) < .01 ? 'first floor' : Math.abs(m.obj.z - 2 * m.step) < .01 ? 'second floor' : 'moving'}` : m.type === 'lamp' ? `${m.name.toLowerCase()} ${Math.round(m.obj.b * 100)}%` : m.type === 'seesaw' ? `spring ${Math.round(m.obj.c * 100)}%` : m.type === 'camera' ? `camera ${m.obj.at(plan.views[0]) ? 'front' : m.obj.at(plan.views[1]) ? 'side' : 'turning'}` : '').filter(Boolean);
        L.say([`keys ${P.held} of ${P.keys.length}`, ...ex].join(' · ')); });
    },
    spawn: L => ({ road: L.props.line, s: plan.half, dir: 1 }),
    // the scripted solve follows the solver's plan. In each pocket: set the turn machines and lifts; lamps and see-saws are held for the whole next leg
    solve(L, W, Rd) { const P = L.props, pid = P.pocketOf.get(W.road), here = pid !== undefined && plan.R[pid].spiral !== undefined && W.dir < 0 ? pid + UP3 : pid;
      if (here !== undefined && P.lastRoad !== W.road) { P.leg = (P.leg ?? -1) + 1; if (!sol.legs[P.leg] || sol.legs[P.leg].pocket !== here) P.offPlan = true; }
      P.lastRoad = W.road; const leg = !P.offPlan && P.leg !== undefined ? sol.legs[P.leg] : null, parked = here !== undefined && !!leg;
      let cad = 85, lifting = false;
      // a buttonless lift follows cadence all the time: hold the floor this leg needs from the pocket until the next one
      for (const m of P.M) { if (m.type !== 'lift') continue; const f = leg ? leg.cfg[m.i] : m.n; if (f >= m.n) { cad = 80; continue; } cad = f === 0 ? 45 : 55 + 15 * f; lifting = Math.abs(m.obj.z - f * m.step) > 1e-3; }
      for (const m of P.M) { if (m.type === 'lift') continue;
        if (m.type === 'lamp' || m.type === 'seesaw') { const on = !!leg && leg.cfg[m.i] === 1 && !lifting; m.obj.m.set(on); if (on && m.type === 'seesaw') cad = 88; continue; }
        if (!parked) { m.obj.m.set(false); continue; } const want = leg.cfg[m.i];
        if (m.type === 'points') { const at = m.obj.ang < .5 ? 1 : m.obj.ang > 89.5 ? 0 : -1; m.obj.m.set(at !== want); }
        else if (m.type === 'tt') { m.obj.m.set(Math.abs(m.obj.ang - m.stops[want]) > .5); }
        else if (m.type === 'camera') { m.obj.m.set(!m.obj.at(plan.views[want])); }
        else { m.obj.m.set(m.obj.state() !== want); } }
      Rd.cad = cad; },
    center: [cx, cy, 0], pts: [[Math.min(...xs) - .5, Math.min(...ys) - .5, -2.4], [Math.max(...xs) + .5, Math.max(...ys) + .5, -2.4], plan.views[1] ? [cx, cy, 0] : [lm[0], lm[1], 3.6], [cx, cy, ztop + 1.2]], pad: .8,
    decor(L) { cloudLayer(L.view, L.th, '#FFFFFF', 4, .75, .55, .95, .2); } };
}
// one level per seed: try sub-seeds in order until a plan passes every check; keep the reasons the others failed
function tryPlan3(tier, sd) { const plan = planLevel3(sd, tier); if (!plan) return { bad: [plan3Why] };
  const bad = checkPlan3(plan); if (bad.length) return { bad };
  const sol = solve3(plan); if (!sol.ok) return { bad: [sol.why] };
  const why = []; if (sol.used < plan.machines.length) why.push('a machine is never needed'); if (sol.stops < tier.legs[0] || sol.stops > tier.legs[1]) why.push(`${sol.stops} stops is outside the tier`); if (plan.freeKeys > 1) why.push('free keys'); const has = t => plan.machines.some(m => t === 'hub3' ? m.type === 'tt' && m.hub : t === 'tt2' ? m.type === 'tt' : m.type === t);
  if ((plan.special || tier.must) && !has(plan.special || tier.must)) why.push('missing the tier machine'); { const nl = plan.machines.filter(m => m.type === 'lift').length; if (nl > 1) why.push('two lifts share one cadence'); if (nl && plan.machines.some(m => m.type === 'seesaw')) why.push('lift and see-saw fight over cadence'); } if (tier.camera && (sol.pj || 0) < 2) why.push('too few perspective joins on the way'); if (tier.camera && (sol.camMoves || 0) < 2) why.push('the camera turns fewer than twice'); if (tier.camera && plan.pockets.filter(p => p.key && /seen from/.test(p.where)).length < 2) why.push('fewer than two keys need perspective'); if (plan.special === 'lift' && !plan.machines.some(m => m.type === 'tt' || m.type === 'cross')) why.push('no turn machine');
  return { bad: why, plan, sol }; }
const SUB3 = 40;
function plan3For(tierIdx, seed) { const tier = TIERS[tierIdx], fails = [];
  for (let a = 0; a < SUB3; a++) { const sd = seed * 1000 + a, r = tryPlan3(tier, sd); if (!r.bad.length) return { seed, sub: a, sd, fails, ...r }; fails.push(...r.bad); }
  return { seed, bad: ['no pass in ' + SUB3], fails }; }
function candidates3(tierIdx, seeds) { const out = [];
  for (const seed of seeds) { const r = plan3For(tierIdx, seed); if (r.plan) { const plan = r.plan; r.bad = []; r.sig = plan.machines.map(m => m.type === 'tt' ? (m.hub ? 'hub' : 'tt') + (m.pv ? 'p' : '') : m.type + (m.floors && m.floors.some(f => f.pv) ? 'p' : '')).sort().join('+') + '|' + plan.R.filter(x => x.key).map(x => x.where).sort().join(','); } out.push(r); }
  return out; }
const penroseGen9 = { setCross: v => { CROSS_MAX = v; }, TIERS, planLevel3, checkPlan3, solve3, genDef3, candidates3, plan3For };

Object.assign($scope, { mulberry, hd, G3, TURNS, TT_ONLY, CHAIN, TIERS, viewDir5, behind5, scrV, depthV, scr3, dirv, plen, plan3Why, CROSS_MAX, planLevel3, conn3, trace3, UP3, exitPos, solve3, hull5, inHull5, checkPlan3, NAMES3, seesawM, lampM, cameraCrank, genDef3, tryPlan3, SUB3, plan3For, candidates3, penroseGen9 });
}
