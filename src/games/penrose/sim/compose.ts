/**
 * Pure strict-TypeScript beat composer for Penrose Pedals (`bc:<seed>`).
 * Plans a winding chain of holding-loop stations joined by varied puzzle beats
 * (gate, mirror, clutch, seesaw, camjoin, curtain, doors) with optional 270-deg knots,
 * station checkpoints, live HUD targets, and deterministic autopilot.
 */

import {
  clamp, DEG, makeIsoBasis, mulberry, UP_SKETCH, V,
  type OccluderBox, type Vec2, type Vec3,
} from './math';
import { L3, loopPts, sAt, SimRoad, turtle } from './road';
import {
  addLiveGap, createCameraCrank, createClutchBridge, createDoors, createPool, createSeesaw,
  DOOR_BANNERS,
} from './machines';
import type { BuiltSimLevel, FaceKey, SimLevelDef, SimMachine, ThemeId, VisualProp } from './types';

export type BeatKind = 'gate' | 'mirror' | 'clutch' | 'seesaw' | 'camjoin' | 'curtain' | 'doors';
export type DirKey = 'e' | 'n' | 'w' | 's';

export interface BeatSpec {
  gap: number;
  dz: number;
  keys: number;
  cam?: boolean;
}

export const BEATS: Record<BeatKind, BeatSpec> = {
  gate: { gap: 8, dz: 0, keys: 0 },
  mirror: { gap: 7, dz: 0, keys: 0 },
  clutch: { gap: 4.8, dz: 0, keys: 1 },
  seesaw: { gap: 9.4, dz: 2, keys: 1 },
  camjoin: { gap: 0, dz: -2, keys: 0, cam: true },
  curtain: { gap: 6.6, dz: 0, keys: 0, cam: true },
  doors: { gap: 6.5, dz: 0, keys: 1 },
};

const KEYS: readonly FaceKey[] = ['y', 'a', 'b', 'z'];
const THEMES_POOL: readonly ThemeId[] = ['dusk', 'garden', 'town', 'prism', 'brass'];
const ADJ = ['Quiet', 'Tilted', 'Folded', 'Hidden', 'Mirror', 'Lantern', 'Hollow', 'Slow', 'Turning', 'Borrowed', 'Paper', 'Second', 'Sleeping', 'Painted', 'Drifting', 'Patient', 'Silver', 'Crooked', 'Glass', 'Distant'];
const NOUN = ['Causeway', 'Cloister', 'Weir', 'Rampart', 'Terrace', 'Mill', 'Stair', 'Quay', 'Arbour', 'Gallery', 'Landing', 'Basin', 'Belfry', 'Orchard', 'Spillway', 'Court', 'Passage', 'Viaduct', 'Mooring', 'Watch'];

const DIRS: Record<DirKey, Vec2> = { e: [1, 0], n: [0, 1], w: [-1, 0], s: [0, -1] };
const OPP: Record<DirKey, DirKey> = { e: 'w', w: 'e', n: 's', s: 'n' };
const LOOP_HEADING: Record<DirKey, number> = { e: Math.PI / 2, n: Math.PI, w: -Math.PI / 2, s: 0 };

const HX = 2.6, HY = 1.8, ENTRY = 1.6, GOAL = 4, KR = 2.6, KA = 4.8;
const camDir = (yaw: number): Vec2 => (yaw === 90 ? [1, -1] : yaw === -90 ? [-1, 1] : [1, 1]);

const exitOf = (c: Vec2, h: Vec2, dir: DirKey): Vec2 =>
  dir === 'e' ? [c[0] + h[0], c[1]]
    : dir === 'w' ? [c[0] - h[0], c[1]]
      : dir === 'n' ? [c[0], c[1] + h[1]]
        : [c[0] - 0.8, c[1] - h[1]];

const stationAt = (F: Vec2, h: Vec2, dir: DirKey): Vec2 =>
  dir === 'e' ? [F[0] + h[0], F[1]]
    : dir === 'w' ? [F[0] - h[0], F[1]]
      : dir === 'n' ? [F[0] + 0.8, F[1] + h[1]]
        : [F[0], F[1] - h[1]];

interface LayoutPart {
  pts: Vec2[];
  z0: number;
  z1: number;
  k: number;
  tall?: boolean;
  air?: boolean;
  knot?: boolean;
  strict?: boolean;
  own?: boolean;
}

function knotShape(S0: Vec2, d: Vec2, z: number, side: 1 | -1, dz: number, el: number) {
  const l: Vec2 = [-d[1] * side, d[0] * side];
  const P = (u: number, v: number): Vec2 => [S0[0] + d[0] * u + l[0] * v, S0[1] + d[1] * u + l[1] * v];
  const box = (u0: number, u1: number, v0: number, v1: number, z0: number, z1: number) => ({
    pts: [P(u0, v0), P(u1, v0), P(u1, v1), P(u0, v1)], z0, z1,
  });
  const z2 = z + dz, lo = Math.min(z, z2), hi = Math.max(z, z2);
  return {
    d2: [-l[0], -l[1]] as Vec2,
    z2,
    F: P(KA - KR, -(2 + el)),
    cross: P(KA - KR, 0),
    parts: [
      { ...box(0, KA, -0.6, 0.6, z, z), knot: true },
      { ...box(KA - KR - 0.6, KA + KR + 0.6, -0.6, 2 * KR + 0.6, lo, hi), knot: true, strict: true },
      { ...box(KA - KR - 0.6, KA - KR + 0.6, -(2 + el), KR, z2, z2), knot: true, own: true },
    ],
  };
}

const dirsFor = (kind: BeatKind, yaw: number): DirKey[] =>
  kind === 'curtain' ? [yaw === 90 ? 'e' : 's']
    : kind === 'camjoin' ? (yaw === 90 ? ['e', 'n', 'w'] : ['e', 's'])
      : ['e', 'n', 'w', 's'];

function beatShape(kind: BeatKind, E: Vec2, d: Vec2, z: number, yaw: number) {
  const r: Vec2 = [d[1], -d[0]];
  const W = (u: number, v = 0): Vec2 => [E[0] + d[0] * u + r[0] * v, E[1] + d[1] * u + r[1] * v];
  const box = (u0: number, u1: number, v0: number, v1: number, z0: number, z1: number) => ({
    pts: [W(u0, v0), W(u1, v0), W(u1, v1), W(u0, v1)], z0, z1,
  });
  const B0 = BEATS[kind];
  if (kind === 'seesaw') return { end: W(B0.gap), z: z + 2, parts: [box(0, B0.gap, -0.9, 0.9, z, z + 2)] };
  if (kind === 'camjoin') {
    const [vx, vy] = camDir(yaw);
    const e = W(3.5), lo: Vec2 = [e[0] - 2 * vx, e[1] - 2 * vy], end: Vec2 = [lo[0] + d[0] * 2, lo[1] + d[1] * 2];
    const lane = { pts: [lo, end, [end[0] + r[0] * 0.01, end[1] + r[1] * 0.01] as Vec2, [lo[0] + r[0] * 0.01, lo[1] + r[1] * 0.01] as Vec2], z0: z - 2, z1: z - 2 };
    return { end, z: z - 2, parts: [box(0, 3.5, -0.6, 0.6, z, z), lane] };
  }
  if (kind === 'curtain') {
    const [vx, vy] = camDir(yaw), hc = W(3), tc: Vec2 = [hc[0] + 2.4 * vx, hc[1] + 2.4 * vy];
    return {
      end: W(B0.gap), z,
      parts: [
        box(0, B0.gap, -0.6, 0.6, z, z),
        { pts: [[tc[0] - 0.85, tc[1] - 0.85], [tc[0] + 0.85, tc[1] - 0.85], [tc[0] + 0.85, tc[1] + 0.85], [tc[0] - 0.85, tc[1] + 0.85]] as Vec2[], z0: z - 2.4, z1: z + 3.8, tall: true, air: true },
      ],
    };
  }
  const wide = kind === 'gate' || kind === 'mirror' ? 1.5 : 0.6;
  const parts: Array<Omit<LayoutPart, 'k'>> = [box(0, B0.gap, -wide, wide, z, z)];
  const up = (bx: { pts: Vec2[]; z0: number; z1: number }, sh: number) => ({
    ...bx, pts: bx.pts.map((p) => [p[0] - sh, p[1] - sh] as Vec2), tall: true,
  });
  if (kind === 'mirror') parts.push({ ...up(box(-0.3, B0.gap + 0.3, -0.7, 0.7, 4.8, 5), 5), air: true });
  if (kind === 'gate') parts.push({ ...up(box(1.8, 2.6, -1.5, 1.5, 3.1, 4.8), 4.28), air: true });
  return { end: W(B0.gap), z, parts };
}

function hull2D(P: readonly Vec2[]): Vec2[] {
  const sorted = P.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cr = (o: Vec2, a: Vec2, b: Vec2) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo: Vec2[] = [], up: Vec2[] = [];
  for (const p of sorted) { while (lo.length > 1 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
  for (const p of sorted.slice().reverse()) { while (up.length > 1 && cr(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}

function polyTouch(A: readonly Vec2[], B: readonly Vec2[], gap: number): boolean {
  for (const Q of [A, B]) {
    for (let i = 0; i < Q.length; i++) {
      const a = Q[i], b = Q[(i + 1) % Q.length];
      const nx = b[1] - a[1], ny = a[0] - b[0], l = Math.hypot(nx, ny) || 1;
      let aMin = Infinity, aMax = -Infinity, bMin = Infinity, bMax = -Infinity;
      for (const p of A) { const v = (p[0] * nx + p[1] * ny) / l; if (v < aMin) aMin = v; if (v > aMax) aMax = v; }
      for (const p of B) { const v = (p[0] * nx + p[1] * ny) / l; if (v < bMin) bMin = v; if (v > bMax) bMax = v; }
      if (aMax + gap <= bMin || bMax + gap <= aMin) return false;
    }
  }
  return true;
}

function onScreenPoly(part: LayoutPart, yaw: number, top: boolean): Vec2[] {
  const [vx, vy] = camDir(yaw);
  const pts: Vec2[] = [];
  const zs = top || part.air ? [part.z0, part.z1] : [part.z0 - 3, part.z1];
  for (const p of part.pts) {
    for (const zz of zs) {
      pts.push([(vy * p[0] - vx * p[1]) / Math.SQRT2, (2 * zz - vx * p[0] - vy * p[1]) / Math.sqrt(6)]);
    }
  }
  return hull2D(pts);
}

function partDepth(part: LayoutPart, yaw: number): number {
  const [vx, vy] = camDir(yaw);
  let s = 0;
  for (const p of part.pts) s += vx * p[0] + vy * p[1];
  return s / part.pts.length + (part.z0 + part.z1) / 2;
}

function clashes(part: LayoutPart, placed: readonly LayoutPart[], yaws: readonly number[]): boolean {
  for (const q of placed) {
    const hard = (a: LayoutPart, b: LayoutPart) => !!(a.strict || a.own) && !b.knot;
    if (q.k === part.k ? !(hard(part, q) || hard(q, part)) : Math.abs(q.k - part.k) <= 1 && !q.tall && !part.tall && !q.strict && !part.strict) continue;
    if (!q.tall && !part.tall && polyTouch(part.pts, q.pts, 0.9)) return true;
    for (const yaw of yaws) {
      const [near, far] = partDepth(part, yaw) > partDepth(q, yaw) ? [part, q] : [q, part];
      if (polyTouch(onScreenPoly(near, yaw, false), onScreenPoly(far, yaw, true), 0.25)) return true;
    }
  }
  return false;
}

const stationPart = (c: Vec2, h: Vec2, z: number, k: number): LayoutPart => ({
  pts: [[c[0] - h[0] - 0.3, c[1] - h[1] - 0.3], [c[0] + h[0] + 0.3, c[1] - h[1] - 0.3], [c[0] + h[0] + 0.3, c[1] + h[1] + 0.3], [c[0] - h[0] - 0.3, c[1] + h[1] + 0.3]],
  z0: z, z1: z + 0.3, k,
});

export interface PlannedBeat {
  kind: BeatKind;
  dir: DirKey;
  z: number;
  want: number;
  knot?: { side: 1 | -1; dz: 2 | -2 };
}

export interface ComposePlan {
  seed: number;
  beats: PlannedBeat[];
  yaw: 90 | -90;
  cam: boolean;
  sizes: Vec2[];
  centers: Vec3[];
  theme: ThemeId;
  name: string;
}

/** Deterministic pure beat-chain planner. */
export function composePlan(seed: number): ComposePlan | null {
  const R = mulberry((seed * 2654435761) >>> 0);
  const pick = <T,>(a: readonly T[]): T => a[Math.floor(R() * a.length)];
  const n = 3 + (R() < 0.45 ? 1 : 0) + (R() < 0.15 ? 1 : 0);
  const yaw: 90 | -90 = R() < 0.5 ? 90 : -90;
  const beats: PlannedBeat[] = [];
  const yaws = [0, yaw];
  const sizes: Vec2[] = Array.from({ length: n + 1 }, () => [2 + R() * 1.1, 1.5 + R() * 0.7] as Vec2);
  let z = R() < 0.5 ? 0 : 2;
  let keys = 0, cam = false;
  let c: Vec2 = [0, 0];
  let prev: DirKey | null = null;
  let knots = R() < 0.6 ? 1 : 0;
  const placed: LayoutPart[] = [stationPart(c, sizes[0], z, 0)];
  const centers: Vec3[] = [[0, 0, z]];

  const allKinds = Object.keys(BEATS) as BeatKind[];

  for (let i = 0; i < n; i++) {
    const ok = allKinds.filter((b) => {
      const B0 = BEATS[b], last = beats[beats.length - 1];
      if (last && last.kind === b) return false;
      if (beats.filter((q) => q.kind === b).length >= 2) return false;
      if (keys + B0.keys + (B0.cam && !cam ? 1 : 0) > 4) return false;
      if (z + B0.dz < 0 || z + B0.dz > 4) return false;
      if (b === 'mirror' && last?.kind === 'gate') return false;
      return true;
    });
    const w = ok.map((b) => 1 / (1 + beats.filter((q) => q.kind === b).length * 2));
    type Candidate = {
      kind: BeatKind; dir: DirKey; dir2: DirKey; parts: LayoutPart[];
      nc: Vec2 | null; z2: number; score: number; knot: { side: 1 | -1; dz: 2 | -2 } | null;
    };
    let chosen: Candidate | null = null;

    while (ok.length && !chosen) {
      const tot = w.reduce((a, b) => a + b, 0);
      let rr = R() * tot, ki = 0;
      for (let k = 0; k < ok.length; k++) { rr -= w[k]; if (rr <= 0) { ki = k; break; } }
      const kind = ok[ki], last = i === n - 1;
      const ds = dirsFor(kind, yaw).filter((dd) => dd !== (prev ? OPP[prev] : null));
      let best: Candidate | null = null;
      const ways: Array<{ side: 1 | -1; dz: 2 | -2 } | null> = [null];
      if (knots && !last) {
        for (const side of [1, -1] as const) for (const dz of [2, -2] as const) ways.unshift({ side, dz });
      }
      for (const dir of ds) {
        for (const kn of ways) {
          const d = DIRS[dir], E = exitOf(c, sizes[i], dir), sh = beatShape(kind, E, d, z, yaw);
          let F: Vec2, d2: Vec2 = d, z2 = sh.z;
          let extra: Array<Omit<LayoutPart, 'k'>>;
          if (kn) {
            if (sh.z + kn.dz < 0 || sh.z + kn.dz > 4) continue;
            const ks = knotShape(sh.end, d, sh.z, kn.side, kn.dz, ENTRY);
            F = ks.F; d2 = ks.d2; z2 = ks.z2; extra = ks.parts;
          } else {
            const len = last ? GOAL : ENTRY;
            F = [sh.end[0] + d[0] * len, sh.end[1] + d[1] * len];
            extra = [{ pts: [sh.end, F, [F[0] + d[1] * 0.01, F[1] - d[0] * 0.01], [sh.end[0] + d[1] * 0.01, sh.end[1] - d[0] * 0.01]], z0: sh.z, z1: sh.z }];
          }
          const parts: LayoutPart[] = sh.parts.concat(extra).map((p) => ({ ...p, k: 2 * i + 1 }));
          const dir2 = (Object.keys(DIRS) as DirKey[]).find((k) => DIRS[k][0] === d2[0] && DIRS[k][1] === d2[1]) ?? dir;
          const nc = last ? null : stationAt(F, sizes[i + 1], dir2);
          if (nc) parts.push(stationPart(nc, sizes[i + 1], z2, 2 * i + 2));
          if (parts.some((p) => clashes(p, p.strict || p.own ? placed.concat(parts.filter((q) => q !== p && (p.strict || q.k === p.k))) : placed, yaws))) continue;
          const xs: number[] = [], ys: number[] = [];
          for (const p of placed.concat(parts)) for (const q of p.pts) { xs.push(q[0]); ys.push(q[1]); }
          const score: number = Math.max(...xs) - Math.min(...xs) + Math.max(...ys) - Math.min(...ys) + (dir === prev ? 3 : 0) + R() * 4 - (kn ? 30 : 0);
          if (!best || score < best.score) best = { kind, dir, dir2, parts, nc, z2, score, knot: kn };
        }
      }
      chosen = best;
      if (!chosen) { ok.splice(ki, 1); w.splice(ki, 1); }
    }
    if (!chosen) break;
    const B0 = BEATS[chosen.kind];
    keys += B0.keys + (B0.cam && !cam ? 1 : 0);
    cam = cam || !!B0.cam;
    beats.push({ kind: chosen.kind, dir: chosen.dir, z, want: 1 + Math.floor(R() * 2), ...(chosen.knot ? { knot: chosen.knot } : {}) });
    if (chosen.knot) knots--;
    placed.push(...chosen.parts);
    prev = chosen.dir2;
    z = chosen.z2;
    if (chosen.nc) { c = chosen.nc; centers.push([c[0], c[1], z]); }
  }

  const kinds = new Set(beats.map((b) => b.kind));
  if (beats.length < 3 || kinds.size < 3) return null;
  return {
    seed, beats, yaw, cam,
    sizes: sizes.slice(0, beats.length + 1),
    centers,
    theme: pick(THEMES_POOL),
    name: `${pick(ADJ)} ${pick(NOUN)}`,
  };
}

/** Build a SimLevelDef for a composed seed (`bc:<seed>`). */
export function makeComposeLevelDef(plan: ComposePlan, chapter: string, chapterIndex: number): SimLevelDef {
  let kn = 0;
  const camKey: FaceKey | null = plan.cam ? KEYS[kn++] : null;
  const beatKeys = plan.beats.map((b) => ({
    ...b,
    key: BEATS[b.kind].keys ? KEYS[kn++] : (BEATS[b.kind].cam ? camKey : null),
  }));

  const shortOf = (b: typeof beatKeys[number]): string => {
    const K = b.key?.toUpperCase() ?? '';
    switch (b.kind) {
      case 'gate': return 'spin above 86 rpm to break the pool gate';
      case 'mirror': return 'ease under 76 rpm so the still pool forms a road';
      case 'clutch': return `wind the clutch bridge (${K}) onto the red catch, then press ${K} to lock`;
      case 'seesaw': return `engage the spring (${K}) and push hard to tip the see-saw`;
      case 'camjoin': return `turn the camera (${K}) to line up the road below`;
      case 'curtain': return `turn the camera (${K}) so the tower hides the hole`;
      case 'doors': return `cycle the door banner (${K}) to match its twin`;
    }
  };

  return {
    id: `bc-${plan.seed}`,
    item: `bc:${plan.seed}`,
    name: plan.name,
    chapter,
    chapterIndex,
    theme: plan.theme,
    yaws: plan.cam ? [0, plan.yaw] : [0],
    cruise: [62, 95],
    hints: {
      nudge: `Station 1: ${shortOf(beatKeys[0])}.`,
      explain: beatKeys.map((b, i) => `${i + 1}. ${shortOf(b)}.`).join(' '),
    },
    center: [0, 0, 0],
    pts: [[0, 0, 0]],
    pad: 0.8,
    terrain: { strip: true, carve: true },
    scenery: false,
    ambient: true,
    build: () => buildComposedLevel(plan, beatKeys, camKey),
  };
}

function buildComposedLevel(
  plan: ComposePlan,
  beats: Array<PlannedBeat & { key: FaceKey | null }>,
  camKey: FaceKey | null,
): BuiltSimLevel {
  const roads: SimRoad[] = [];
  const machines: SimMachine[] = [];
  const occluders: OccluderBox[] = [];
  const visuals: VisualProp[] = [];
  const anchors: Array<[number, number, number]> = [];
  const carves: Array<[number, number, number]> = [];
  const terrainIgnoreRoadIds = new Set<string>();
  const hiddenGapChecks: Array<{ a: () => Vec3; b: () => Vec3; hidden: () => boolean }> = [];

  const stations: Array<{ r: SimRoad; c: Vec3; h: Vec2 }> = [];
  const sz = (i: number): Vec2 => plan.sizes[i] ?? [HX, HY];

  const addStation = (cx: number, cy: number, z: number, idx: number) => {
    const [hx, hy] = sz(idx);
    const r = new SimRoad(loopPts(cx - hx, cy - hy, cx + hx, cy + hy, z, 0.8), {
      id: `st_${idx}`, closed: true, stationIndex: idx,
    });
    roads.push(r);
    const st = { r, c: [cx, cy, z] as Vec3, h: [hx, hy] as Vec2 };
    stations.push(st);
    return st;
  };

  let curSt = addStation(0, 0, beats[0].z, 0);
  const cam = camKey
    ? createCameraCrank({
        id: 'cam', key: camKey, name: 'Camera',
        at: [-Math.min(1.2, sz(0)[0] - 1.3), 0, beats[0].z],
        detents: [0, plan.yaw],
      })
    : null;
  if (cam) {
    machines.push(cam.m);
    visuals.push({ kind: 'cameraDial', machineId: cam.m.id, pos: [-Math.min(1.2, sz(0)[0] - 1.3), 0, beats[0].z], detents: [0, plan.yaw] });
  }

  const getViewD = () => makeIsoBasis([0, 0, 0], (cam ? cam.ang() : 0) * DEG, 0).D;

  interface BuiltBeat {
    kind: BeatKind;
    key: FaceKey | null;
    S: SimRoad;
    roads: SimRoad[];
    br?: ReturnType<typeof createClutchBridge>;
    ss?: ReturnType<typeof createSeesaw>;
    doors?: ReturnType<typeof createDoors>;
    pool?: ReturnType<typeof createPool>;
    yaw?: number;
    span?: number;
  }
  const builtBeats: BuiltBeat[] = [];
  const wz = -0.04;

  beats.forEach((b, i) => {
    const last = i === beats.length - 1;
    const d = DIRS[b.dir], r = [d[1], -d[0]] as Vec2, z = b.z;
    const E = exitOf([curSt.c[0], curSt.c[1]], curSt.h, b.dir);
    const W = (u: number, v = 0, zz = z): Vec3 => [E[0] + d[0] * u + r[0] * v, E[1] + d[1] * u + r[1] * v, zz];
    const loopDir = LOOP_HEADING[b.dir];
    const st: BuiltBeat = { kind: b.kind, key: b.key, S: curSt.r, roads: [] };
    let nextSt: typeof curSt | null = null;

    const finishFrom = (rd: SimRoad, zz = z) => {
      const e = rd.end(1).p;
      const from: Vec2 = [e[0], e[2]];
      let F: Vec2, z2 = zz;
      let entry: SimRoad;
      if (b.knot) {
        const kn = b.knot, ks = knotShape(from, d, zz, kn.side, kn.dz, ENTRY);
        F = ks.F; z2 = ks.z2;
        const t = turtle(from[0], from[1], Math.atan2(d[1], d[0]) / DEG, zz);
        t.fwd(KA - KR).gr(kn.dz / (KR + 1.5 * Math.PI * KR)).fwd(KR).arc(KR, kn.side * 270).gr(0).fwd(KR + 2 + ENTRY);
        entry = new SimRoad(t.pts, { id: `knot_${i}`, selfCross: true });
        terrainIgnoreRoadIds.add(entry.id);
        for (let s = 0.8; s < entry.L - 0.4; s += 2.4) {
          const q = entry.at(s).p;
          if (Math.hypot(q[0] - ks.cross[0], q[2] - ks.cross[1]) < 1.4) continue;
          visuals.push({ kind: 'cyl', x: q[0], y: q[2], r: 0.18, z0: -2.4, z1: q[1] - 0.18, pal: 'stone', seg: 12 });
        }
        anchors.push([ks.cross[0], ks.cross[1], 1.2]);
      } else {
        const len = last ? GOAL : ENTRY;
        F = [from[0] + d[0] * len, from[1] + d[1] * len];
        entry = new SimRoad(L3([from[0], from[1], zz], [F[0], F[1], zz], UP_SKETCH), { id: `entry_${i}`, goal: last });
      }
      roads.push(entry);
      st.roads.push(entry);
      rd.joins.push({ k: 1, to: entry, s: 0, dir: 1 });
      if (!last) {
        const nc = plan.centers[stations.length];
        nextSt = addStation(nc[0], nc[1], z2, stations.length);
        entry.joins.push({ k: 1, to: nextSt.r, s: sAt(nextSt.r, [F[0], F[1], z2]), dir: 1 });
      }
    };

    const fork = (to: SimRoad, when: () => boolean, text: string) => {
      curSt.r.forks.push({ s: sAt(curSt.r, [E[0], E[1], z]), dir: 1, to, toK: 0, when, text });
    };

    if (b.kind === 'gate' || b.kind === 'mirror') {
      const G = BEATS[b.kind].gap;
      const a = W(0.6, -1.4), c = W(G - 0.6, 1.4);
      const poolBox: [number, number, number, number] = [Math.min(a[0], c[0]), Math.min(a[1], c[1]), Math.max(a[0], c[0]), Math.max(a[1], c[1])];
      const pool = createPool({ id: `pool_${i}`, calm: 78 });
      machines.push(pool.m);
      st.pool = pool;
      if (b.kind === 'gate') {
        const X = new SimRoad(L3(W(0), W(G), UP_SKETCH), { id: `gate_${i}` });
        roads.push(X); st.roads.push(X);
        const h0 = 3.2, h1 = 4.2, off = h1 - 2 * wz, ug = 2.2;
        for (const v of [-1.2, 1.2]) {
          const p = W(ug, v);
          anchors.push([p[0] - off, p[1] - off, 1.1]);
        }
        visuals.push({
          kind: 'pool', machineId: pool.m.id, pool: poolBox, wz,
          gate: { pos: W(ug, 0, z), axis: d[0] ? 'x' : 'y', h0, h1 },
        });
        finishFrom(X);
        fork(X, () => pool.ruffled(), 'The ruffled pool broke the gate');
      } else {
        const Wt = new SimRoad(L3(W(0), W(G), UP_SKETCH), { id: `mirror_${i}`, noDeck: true, noLane: true, isReflection: true });
        roads.push(Wt); st.roads.push(Wt);
        const p0 = W(0, 0, 0.006), p1 = W(G, 0, 0.006);
        anchors.push([p0[0] - 5, p0[1] - 5, 1.1], [p1[0] - 5, p1[1] - 5, 1.1]);
        visuals.push({ kind: 'pool', machineId: pool.m.id, pool: poolBox, wz, skyRoadPts: [p0, p1], skyRoadH: 5 });
        finishFrom(Wt);
        fork(Wt, () => pool.still(), 'The still pool formed a road');
      }
    } else if (b.kind === 'clutch') {
      const G = BEATS.clutch.gap;
      const X1 = new SimRoad(L3(W(0), W(1), UP_SKETCH), { id: `clA_${i}` });
      const X2 = new SimRoad(L3(W(G - 1), W(G), UP_SKETCH), { id: `clB_${i}` });
      roads.push(X1, X2); st.roads.push(X1, X2);
      const bp = W(0.2, 1.3);
      const br = createClutchBridge({ id: `clutch_${i}`, key: b.key!, from: X1, to: X2, btn: [bp[0], bp[1]], btnZ: z });
      machines.push(br.m);
      st.br = br; st.span = G - 2;
      visuals.push({ kind: 'cyl', x: bp[0], y: bp[1], r: 0.55, z0: z - 2.4, z1: z - 0.02, pal: 'stone', seg: 24 });
      visuals.push({ kind: 'clutchVisual', machineId: br.m.id, from: X1.end(1).p, to: X2.end(0).p, maxLen: br.max });
      finishFrom(X2);
      fork(X1, () => br.locked(), 'Bridge locked — rolling across');
    } else if (b.kind === 'seesaw') {
      const a = Math.asin(1 / 2.5), X2 = 5 * Math.cos(a);
      const base = Math.atan2(-d[1], -d[0]) / DEG;
      const A1 = new SimRoad(L3(W(0), W(3), UP_SKETCH), { id: `ssA_${i}` });
      const brRad = base * DEG;
      const sd: 1 | -1 = Math.sin(brRad) - Math.cos(brRad) > 0 ? -1 : 1;
      const ss = createSeesaw({ id: `seesaw_${i}`, key: b.key!, name: 'Spring', P: W(3 + X2), baseDeg: base, side: sd });
      machines.push(ss.m);
      const fe = W(3 + X2);
      carves.push([fe[0], fe[1], 1.5]);
      const B1 = new SimRoad(L3(W(3 + X2, 0, z + 2), W(BEATS.seesaw.gap, 0, z + 2), UP_SKETCH), { id: `ssB_${i}` });
      roads.push(A1, ss.beam, B1);
      st.roads.push(A1, ss.beam, B1);
      st.ss = ss;
      visuals.push({ kind: 'seesawVisual', machineId: ss.m.id, pivot: W(3 + X2), baseDeg: base, side: sd });
      finishFrom(B1, z + 2);
      fork(A1, () => ss.tip() > 0.95, 'See-saw tipped — climbing up');
    } else if (b.kind === 'camjoin') {
      const [vx, vy] = camDir(plan.yaw), La = 3.5;
      const A1 = new SimRoad(L3(W(0), W(La), UP_SKETCH), { id: `cjA_${i}`, edgeText: 'From here the road stops in mid-air' });
      const e = W(La), lo: Vec2 = [e[0] - 2 * vx, e[1] - 2 * vy];
      const lane = new SimRoad(L3([lo[0], lo[1], z - 2], [lo[0] + d[0] * 2, lo[1] + d[1] * 2, z - 2], UP_SKETCH), { id: `cjB_${i}` });
      roads.push(A1, lane); st.roads.push(A1, lane);
      carves.push([e[0] - 0.5 * vx, e[1] - 0.5 * vy, 1.4]);
      st.yaw = plan.yaw;
      finishFrom(lane, z - 2);
      fork(A1, () => !!cam?.at(plan.yaw), 'View aligned with the lane below');
    } else if (b.kind === 'curtain') {
      const G = BEATS.curtain.gap;
      const X1 = new SimRoad(L3(W(0), W(2.4), UP_SKETCH), { id: `cuA_${i}` });
      const X2 = new SimRoad(L3(W(3.6), W(G), UP_SKETCH), { id: `cuB_${i}` });
      roads.push(X1, X2); st.roads.push(X1, X2);
      const [vx, vy] = camDir(plan.yaw), hc = W(3), tc: Vec2 = [hc[0] + 2.4 * vx, hc[1] + 2.4 * vy];
      visuals.push({ kind: 'box', x0: tc[0] - 0.7, y0: tc[1] - 0.7, z0: z - 2.4, x1: tc[0] + 0.7, y1: tc[1] + 0.7, z1: z + 3.6, pal: 'stone', keep: true });
      visuals.push({ kind: 'box', x0: tc[0] - 0.85, y0: tc[1] - 0.85, z0: z + 3.6, x1: tc[0] + 0.85, y1: tc[1] + 0.85, z1: z + 3.8, pal: 'roof', keep: true });
      anchors.push([tc[0], tc[1], 1.4]);
      const occ: OccluderBox = { min: V(tc[0] - 0.7, tc[1] - 0.7, z - 2.4), max: V(tc[0] + 0.7, tc[1] + 0.7, z + 3.8) };
      occluders.push(occ);
      const gap = addLiveGap(X1, 1, X2, 0, () => [occ], getViewD, { text: 'Behind the tower — hole vanished' });
      hiddenGapChecks.push(gap);
      st.yaw = plan.yaw;
      finishFrom(X2);
      fork(X1, () => gap.hidden(), 'Tower hides the hole ahead');
    } else if (b.kind === 'doors') {
      const far = W(3);
      const X = new SimRoad(L3(far, W(BEATS.doors.gap), UP_SKETCH), { id: `dr_${i}` });
      roads.push(X); st.roads.push(X);
      const ang = Math.PI - loopDir, farAng = Math.PI - Math.atan2(d[1], d[0]);
      const btn: [number, number] = [-d[0] * 1.2, -d[1] * 1.2];
      const doors = createDoors({
        id: `doors_${i}`, road: curSt.r, at: [E[0], E[1]], atZ: z, to: X, want: b.want, key: b.key!, btn,
      });
      if (doors.m) machines.push(doors.m);
      st.doors = doors;
      visuals.push({
        kind: 'doorPair', machineId: doors.m!.id,
        near: [E[0], E[1], z], nearAng: ang, far: [far[0], far[1], z], farAng,
        banners: [...DOOR_BANNERS], want: b.want,
      });
      finishFrom(X);
    }

    builtBeats.push(st);
    if (nextSt) curSt = nextSt;
  });

  // Compute tight framing box over all roads
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const rd of roads) {
    for (const s of rd.localS) {
      x0 = Math.min(x0, s.p[0]); x1 = Math.max(x1, s.p[0]);
      y0 = Math.min(y0, s.p[2]); y1 = Math.max(y1, s.p[2]);
      z0 = Math.min(z0, s.p[1]); z1 = Math.max(z1, s.p[1]);
    }
  }
  const frameOverride = {
    center: [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2] as Vec3,
    pts: [[x0 - 1, y0 - 1, z0 - 2], [x1 + 1, y1 + 1, z1 + 1], [x0 - 1, y1 + 1, z0], [x1 + 1, y0 - 1, z1]] as Vec3[],
    pad: 0.8,
  };

  let doorStepCooldown = 0;

  return {
    roads,
    machines,
    keys: [],
    gates: [],
    occluders,
    visuals,
    anchors,
    carves,
    terrainIgnoreRoadIds,
    frameOverride,
    spawn: () => ({ road: stations[0].r, s: 1, dir: 1 }),
    hiddenGaps: () => hiddenGapChecks.map((g) => ({ a: g.a(), b: g.b(), hidden: g.hidden() })),
    hudTarget(wheel) {
      const bi = builtBeats.findIndex((st) => st.S === wheel.road || st.roads.includes(wheel.road));
      const st = builtBeats[bi];
      if (!st) return {};
      if (st.kind === 'gate') return { cadence: { min: 86, label: 'Ruffle pool' }, hintNudge: 'Pedal above 86 rpm to break the reflected gate.' };
      if (st.kind === 'mirror') return { cadence: { min: 55, max: 76, label: 'Still water' }, hintNudge: 'Ease under 76 rpm so the still pool reveals the road.' };
      if (st.kind === 'seesaw') return { zone: { min: 4, max: 5, label: 'Tip beam', source: 'power' }, focusMachine: st.ss?.m.id, hintNudge: `Clutch ${st.key?.toUpperCase()} and push hard to tip the see-saw.` };
      if (st.kind === 'clutch') return { focusMachine: st.br?.m.id, hintNudge: `Wind ${st.key?.toUpperCase()} onto the red bollards, then press ${st.key?.toUpperCase()} to lock.` };
      if (st.kind === 'doors') return { focusMachine: st.doors?.m?.id, hintNudge: `Press ${st.key?.toUpperCase()} to match the doorway banner.` };
      if (st.kind === 'camjoin' || st.kind === 'curtain') return { focusMachine: cam?.m.id, hintNudge: `Turn the camera (${camKey?.toUpperCase()}) a quarter turn.` };
      return {};
    },
    solve(wheel, out) {
      out.cad = 78;
      out.ftp = 0.78;
      out.gearScale = 1.0;
      const bi = builtBeats.findIndex((st) => st.S === wheel.road || st.roads.includes(wheel.road));
      const st = builtBeats[bi];
      const onS = !!st && st.S === wheel.road;
      let camWant = 0;

      for (const q of builtBeats) {
        if (q.br && q !== st && q.br.m.on) q.br.m.on = false;
        if (q.ss && q !== st) q.ss.m.on = false;
      }
      if (st) {
        if (st.kind === 'gate' && onS) out.cad = 92;
        if (st.kind === 'mirror' && onS) out.cad = 64;
        if (st.kind === 'clutch' && st.br && (onS || wheel.road === st.roads[0])) {
          if (!st.br.m.on && !st.br.spans()) st.br.m.on = true;
          else if (st.br.m.on && st.br.len() > (st.span ?? 2.8) + 0.3) st.br.m.on = false;
        }
        if (st.kind === 'seesaw' && st.ss) {
          const push = onS || wheel.road === st.roads[0] || (wheel.road === st.ss.beam && st.ss.tip() > 0.5);
          st.ss.m.on = push;
          if (push) { out.cad = 92; out.ftp = 1.25; }
        }
        if ((st.kind === 'camjoin' || st.kind === 'curtain') && st.yaw !== undefined) {
          camWant = st.yaw;
        }
        if (st.kind === 'doors' && st.doors && onS && !st.doors.match()) {
          doorStepCooldown--;
          if (doorStepCooldown <= 0) {
            st.doors.stepBanner();
            doorStepCooldown = 15;
          }
        }
      }
      if (cam) cam.driveTo(camWant);
    },
  };
}
