/**
 * Pure strict-TypeScript roads and path builders for Penrose Pedals.
 * Matches the prototype's sketch coordinate system (x, y = depth, z = up) -> world (x, z, y).
 */

import {
  clamp, DEG, lerp, projectDir, projectPoint, transformDir, transformPoint,
  UP_SKETCH, V, v3Dist, v3Lerp, v3Neg, v3Norm, v3Sub, viewDirSketch,
  type IsoBasis, type Mat4, type Vec2, type Vec3,
} from './math';

export interface SketchSample {
  p: Vec3;
  n: Vec3;
}

export interface WorldSample {
  p: Vec3;
  n: Vec3;
  d: Vec3;
}

export interface RoadJoin {
  k: 0 | 1;
  to: SimRoad;
  s: number;
  dir: 1 | -1;
}

export interface RoadFork {
  s: number;
  dir: 1 | -1;
  to: SimRoad | (() => SimRoad);
  toK?: 0 | 1;
  toS?: number | (() => number);
  toDir?: 1 | -1;
  slide?: number;
  when: () => boolean;
  text?: string;
}

export interface RoadGap {
  k: 0 | 1;
  to: SimRoad;
  toK: 0 | 1;
  when: () => boolean;
  text?: string;
  /** Optional tag for visual/audio cue when a hidden gap or bridge opens. */
  kind?: 'hidden' | 'bridge' | 'dark';
}

export interface SimRoadOpts {
  id?: string;
  closed?: boolean;
  goal?: boolean;
  turntable?: boolean;
  bounce?: boolean | string;
  selfCatch?: boolean;
  selfCross?: boolean;
  landDir?: 1 | -1;
  edgeText?: string | (() => string);
  goneText?: string;
  turnBack?: string;
  solid?: () => boolean;
  blowBack?: (dir: 1 | -1) => boolean;
  blowText?: string;
  transform?: () => Mat4;
  /** Visual hints preserved for the Three.js renderer (sim never interprets colours). */
  w?: number;
  th?: number;
  palHex?: string;
  noDeck?: boolean;
  noLane?: boolean;
  flatDeck?: boolean;
  groupId?: string;
  seam?: number;
  stationIndex?: number;
  /** True when the road is an invisible reflection path over water. */
  isReflection?: boolean;
}

export class SimRoad {
  readonly id: string;
  readonly localS: WorldSample[] = [];
  readonly cum: number[] = [0];
  readonly L: number;

  wp: Vec3[] = [];
  wn: Vec3[] = [];
  q: Vec2[] = [];
  qn: Vec2[] = [];

  closed: boolean;
  goal: boolean;
  turntable: boolean;
  bounce?: boolean | string;
  selfCatch: boolean;
  selfCross: boolean;
  landDir?: 1 | -1;
  edgeText?: string | (() => string);
  goneText?: string;
  turnBack?: string;
  solid?: () => boolean;
  blowBack?: (dir: 1 | -1) => boolean;
  blowText?: string;
  transform?: () => Mat4;

  // Visual metadata for the renderer
  w: number;
  th: number;
  palHex?: string;
  noDeck: boolean;
  noLane: boolean;
  flatDeck: boolean;
  groupId?: string;
  seam?: number;
  stationIndex?: number;
  isReflection: boolean;

  joins: RoadJoin[] = [];
  forks: RoadFork[] = [];
  gaps: RoadGap[] = [];

  private lastProjKey = '';

  constructor(samples: readonly SketchSample[], opts: SimRoadOpts = {}) {
    this.id = opts.id ?? '';
    this.closed = !!opts.closed;
    this.goal = !!opts.goal;
    this.turntable = !!opts.turntable;
    this.bounce = opts.bounce;
    this.selfCatch = !!opts.selfCatch;
    this.selfCross = !!opts.selfCross;
    this.landDir = opts.landDir;
    this.edgeText = opts.edgeText;
    this.goneText = opts.goneText;
    this.turnBack = opts.turnBack;
    this.solid = opts.solid;
    this.blowBack = opts.blowBack;
    this.blowText = opts.blowText;
    this.transform = opts.transform;
    this.w = opts.w ?? 1;
    this.th = opts.th ?? 0.5;
    this.palHex = opts.palHex;
    this.noDeck = !!opts.noDeck;
    this.noLane = !!opts.noLane;
    this.flatDeck = !!opts.flatDeck;
    this.groupId = opts.groupId;
    this.seam = opts.seam;
    this.stationIndex = opts.stationIndex;
    this.isReflection = !!opts.isReflection;

    for (const s of samples) {
      const p = V(s.p[0], s.p[1], s.p[2]);
      const n = v3Norm(V(s.n[0], s.n[1], s.n[2]));
      const last = this.localS[this.localS.length - 1];
      if (!last || v3Dist(last.p, p) > 1e-4) {
        this.localS.push({ p, n, d: [1, 0, 0] });
      }
    }
    for (let i = 1; i < this.localS.length; i++) {
      this.cum.push(this.cum[i - 1] + v3Dist(this.localS[i].p, this.localS[i - 1].p));
    }
    this.L = this.cum[this.cum.length - 1] ?? 0;
    for (let i = 0; i < this.localS.length; i++) {
      const a = this.localS[Math.max(0, i - 1)].p;
      const b = this.localS[Math.min(this.localS.length - 1, i + 1)].p;
      this.localS[i].d = v3Norm(v3Sub(b, a));
    }
    this.wp = this.localS.map((s) => [s.p[0], s.p[1], s.p[2]] as Vec3);
    this.wn = this.localS.map((s) => [s.n[0], s.n[1], s.n[2]] as Vec3);
    this.q = this.localS.map(() => [0, 0] as Vec2);
    this.qn = this.localS.map(() => [0, 1] as Vec2);
  }

  /** Recompute world & screen coords. Static roads skip work when projection key is unchanged. */
  refresh(basis: IsoBasis, projKey: string, force = false): void {
    const isDynamic = !!this.transform;
    if (!isDynamic && !force && this.lastProjKey === projKey) return;
    this.lastProjKey = projKey;
    const m = this.transform ? this.transform() : null;
    for (let i = 0; i < this.localS.length; i++) {
      const s = this.localS[i];
      const wp = m ? transformPoint(m, s.p) : s.p;
      const wn = m ? transformDir(m, s.n) : s.n;
      this.wp[i] = wp;
      this.wn[i] = wn;
      this.q[i] = projectPoint(wp, basis);
      this.qn[i] = projectDir(wn, basis);
    }
  }

  at(s: number): WorldSample {
    const clamped = clamp(s, 0, this.L);
    let lo = 0, hi = this.cum.length - 1;
    while (hi - lo > 1) {
      const m = (lo + hi) >> 1;
      if (this.cum[m] <= clamped) lo = m; else hi = m;
    }
    const span = this.cum[hi] - this.cum[lo] || 1;
    const f = (clamped - this.cum[lo]) / span;
    const a = this.wp[lo], b = this.wp[hi];
    return {
      p: v3Lerp(a, b, f),
      n: v3Norm(v3Lerp(this.wn[lo], this.wn[hi], f)),
      d: v3Norm(v3Sub(b, a)),
    };
  }

  end(k: 0 | 1): { p: Vec3; out: Vec3 } {
    const f = this.at(k ? this.L : 0);
    return { p: f.p, out: k ? f.d : v3Neg(f.d) };
  }

  getEdgeText(): string | undefined {
    return typeof this.edgeText === 'function' ? this.edgeText() : this.edgeText;
  }
}

// ---- Path builders (sketch coords) ----

export function L3(a: Vec3, b: Vec3, n: Vec3 = UP_SKETCH, step = 0.1): SketchSample[] {
  const dist = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const k = Math.max(1, Math.ceil(dist / step));
  const out: SketchSample[] = [];
  for (let i = 0; i <= k; i++) {
    const f = i / k;
    out.push({ p: [lerp(a[0], b[0], f), lerp(a[1], b[1], f), lerp(a[2], b[2], f)], n });
  }
  return out;
}

export function filletPath(P: readonly Vec3[], r: number, n: Vec3 = UP_SKETCH): SketchSample[] {
  const out: SketchSample[] = [];
  let from = P[0];
  for (let i = 1; i < P.length - 1; i++) {
    const p = P[i], prev = P[i - 1], next = P[i + 1];
    const uin = v3Norm(v3Sub(p, prev));
    const uout = v3Norm(v3Sub(next, p));
    const A: Vec3 = [p[0] - uin[0] * r, p[1] - uin[1] * r, p[2] - uin[2] * r];
    const C: Vec3 = [p[0] + uout[0] * r, p[1] + uout[1] * r, p[2] + uout[2] * r];
    out.push(...L3(from, A, n));
    for (let k = 1; k <= 12; k++) {
      const t = k / 12, a = (1 - t) * (1 - t), b = 2 * t * (1 - t), c = t * t;
      out.push({
        p: [a * A[0] + b * p[0] + c * C[0], a * A[1] + b * p[1] + c * C[1], a * A[2] + b * p[2] + c * C[2]],
        n,
      });
    }
    from = C;
  }
  out.push(...L3(from, P[P.length - 1], n));
  return out;
}

export interface FlatTurtle {
  x: number;
  y: number;
  z: number;
  h: number;
  grade: number;
  pts: SketchSample[];
  gr(g: number): FlatTurtle;
  add(): FlatTurtle;
  fwd(len: number): FlatTurtle;
  arc(r: number, deg: number): FlatTurtle;
  teardrop(r?: number): FlatTurtle;
}

export function turtle(x: number, y: number, hDeg: number, z: number): FlatTurtle {
  const t: FlatTurtle = {
    x, y, z, h: hDeg * DEG, grade: 0, pts: [],
    gr(g) { t.grade = g; return t; },
    add() { t.pts.push({ p: [t.x, t.y, t.z], n: [0, 0, 1] }); return t; },
    fwd(L) {
      const k = Math.max(1, Math.ceil(L / 0.08));
      for (let i = 0; i < k; i++) {
        t.x += Math.cos(t.h) * L / k;
        t.y += Math.sin(t.h) * L / k;
        t.z += t.grade * L / k;
        t.add();
      }
      return t;
    },
    arc(r, deg) {
      const a = deg * DEG, sg = Math.sign(a);
      const cx = t.x - sg * r * Math.sin(t.h), cy = t.y + sg * r * Math.cos(t.h);
      let phi = Math.atan2(t.y - cy, t.x - cx);
      const k = Math.max(2, Math.ceil(Math.abs(a) * r / 0.08));
      for (let i = 0; i < k; i++) {
        phi += a / k;
        t.x = cx + r * Math.cos(phi);
        t.y = cy + r * Math.sin(phi);
        t.z += t.grade * Math.abs(a) * r / k;
        t.h += a / k;
        t.add();
      }
      return t;
    },
    teardrop(r = 1) { return t.arc(r, 60).arc(r, -300).arc(r, 60); },
  };
  return t.add();
}

export const lollipop = (x: number, y: number, hDeg: number, z: number, stick = 1, r = 1): SketchSample[] =>
  turtle(x, y, hDeg, z).fwd(stick).teardrop(r).fwd(stick).pts;

export const lollipopLen = (stick = 1, r = 1): number => 2 * stick + r * 420 * DEG;

export const loopPts = (x0: number, y0: number, x1: number, y1: number, z: number, r = 1): SketchSample[] =>
  filletPath([[(x0 + x1) / 2, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z], [x0, y0, z], [(x0 + x1) / 2, y0, z]], r);

export interface FrameTurtle {
  pts: SketchSample[];
  st: { p: Vec3; d: Vec3; n: Vec3 };
  fwd(len: number, step?: number): FrameTurtle;
  turn(R: number, deg: number): FrameTurtle;
  curl(R: number, deg: number): FrameTurtle;
}

/** 3D frame turtle for roads climbing walls, ceilings, and corners (matches gravity.ts `ftur`). */
export function ftur(p: Vec3, d: Vec3, n: Vec3): FrameTurtle {
  const st = { p: [...p] as Vec3, d: [...d] as Vec3, n: [...n] as Vec3 };
  const pts: SketchSample[] = [{ p: [...p] as Vec3, n: [...n] as Vec3 }];
  const push = () => pts.push({ p: [...st.p] as Vec3, n: [...st.n] as Vec3 });
  const api: FrameTurtle = {
    pts, st,
    fwd(len, step = 0.2) {
      const k = Math.max(1, Math.ceil(len / step));
      for (let i = 0; i < k; i++) {
        st.p = [st.p[0] + st.d[0] * len / k, st.p[1] + st.d[1] * len / k, st.p[2] + st.d[2] * len / k];
        push();
      }
      return api;
    },
    turn(R, deg) {
      const k = Math.max(3, Math.ceil(Math.abs(deg) / 6));
      const a = Math.abs(deg) * DEG / k, sg = Math.sign(deg), ch = 2 * R * Math.sin(a / 2);
      for (let i = 0; i < k; i++) {
        const nx: Vec3 = [
          st.n[1] * st.d[2] - st.n[2] * st.d[1],
          st.n[2] * st.d[0] - st.n[0] * st.d[2],
          st.n[0] * st.d[1] - st.n[1] * st.d[0],
        ];
        const d2: Vec3 = [
          st.d[0] * Math.cos(a) + sg * nx[0] * Math.sin(a),
          st.d[1] * Math.cos(a) + sg * nx[1] * Math.sin(a),
          st.d[2] * Math.cos(a) + sg * nx[2] * Math.sin(a),
        ];
        const mid: Vec3 = [st.d[0] + d2[0], st.d[1] + d2[1], st.d[2] + d2[2]];
        const ml = Math.hypot(mid[0], mid[1], mid[2]) || 1;
        st.p = [st.p[0] + mid[0] / ml * ch, st.p[1] + mid[1] / ml * ch, st.p[2] + mid[2] / ml * ch];
        st.d = d2;
        push();
      }
      return api;
    },
    curl(R, deg) {
      const k = Math.max(3, Math.ceil(Math.abs(deg) / 6));
      const a = Math.abs(deg) * DEG / k, s = Math.sign(deg), ch = 2 * R * Math.sin(a / 2);
      for (let i = 0; i < k; i++) {
        const d2: Vec3 = [
          st.d[0] * Math.cos(a) + s * st.n[0] * Math.sin(a),
          st.d[1] * Math.cos(a) + s * st.n[1] * Math.sin(a),
          st.d[2] * Math.cos(a) + s * st.n[2] * Math.sin(a),
        ];
        const n2: Vec3 = [
          st.n[0] * Math.cos(a) - s * st.d[0] * Math.sin(a),
          st.n[1] * Math.cos(a) - s * st.d[1] * Math.sin(a),
          st.n[2] * Math.cos(a) - s * st.d[2] * Math.sin(a),
        ];
        const mid: Vec3 = [st.d[0] + d2[0], st.d[1] + d2[1], st.d[2] + d2[2]];
        const ml = Math.hypot(mid[0], mid[1], mid[2]) || 1;
        st.p = [st.p[0] + mid[0] / ml * ch, st.p[1] + mid[1] / ml * ch, st.p[2] + mid[2] / ml * ch];
        st.d = d2;
        st.n = n2;
        push();
      }
      return api;
    },
  };
  return api;
}

/** Find arc-length s along rd closest to sketch point p. */
export function sAt(rd: SimRoad, p: Vec3): number {
  let best = 0, bd = Infinity;
  for (let s = 0; s <= rd.L; s += 0.02) {
    const q = rd.at(s).p;
    const d = Math.hypot(q[0] - p[0], q[2] - p[1], q[1] - p[2]);
    if (d < bd) { bd = d; best = s; }
  }
  return best;
}

/** Split sketch samples into [0..a] and [b..end], leaving a gap between a and b. */
export function cutSamples(S: readonly SketchSample[], a: number, b: number): [SketchSample[], SketchSample[]] {
  const A: SketchSample[] = [S[0]];
  const Bs: SketchSample[] = [];
  let c = 0;
  for (let i = 1; i < S.length; i++) {
    const p0 = S[i - 1].p, p1 = S[i].p;
    const l = Math.hypot(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]);
    const c1 = c + l;
    if (c < a && c1 >= a) {
      const f = (a - c) / (l || 1);
      A.push({ p: [lerp(p0[0], p1[0], f), lerp(p0[1], p1[1], f), lerp(p0[2], p1[2], f)], n: S[i].n });
    } else if (c1 < a) {
      A.push(S[i]);
    }
    if (c < b && c1 >= b) {
      const f = (b - c) / (l || 1);
      Bs.push({ p: [lerp(p0[0], p1[0], f), lerp(p0[1], p1[1], f), lerp(p0[2], p1[2], f)], n: S[i].n });
    }
    if (c1 > b) Bs.push(S[i]);
    c = c1;
  }
  return [A, Bs];
}

/** Penrose endless staircase: climbs round 4 legs and closes on screen at yaw only. */
export function stairPts(
  S: Vec3, yaw: number, rise: number, A: number, B: number, e: number, sgn: 1 | -1 = 1,
): { samples: SketchSample[]; end: Vec3; pts: Vec3[] } {
  const vd = viewDirSketch(yaw);
  const C = A + e - vd[0] * rise;
  const D = B - sgn * vd[1] * rise;
  const xs: Vec2[] = [
    [0, 0], [A, 0], [A, sgn * B], [A - C, sgn * B], [A - C, sgn * (B - D)], [A - C + e, sgn * (B - D)],
  ].map(([x, y]) => [S[0] + x, S[1] + y]);
  let tot = 0;
  const cum = [0];
  for (let i = 1; i < xs.length; i++) {
    tot += Math.hypot(xs[i][0] - xs[i - 1][0], xs[i][1] - xs[i - 1][1]);
    cum.push(tot);
  }
  const pts: Vec3[] = xs.map(([x, y], i) => [x, y, S[2] + rise * cum[i] / (tot || 1)]);
  return { samples: filletPath(pts, 0.7), end: pts[pts.length - 1], pts };
}

export function samplePolylineLen(pts: readonly SketchSample[]): number {
  let s = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1].p, b = pts[i].p;
    s += Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  }
  return s;
}

// ---- Wall frames (used by The Cube and wall levels) ----

export interface WallFrame {
  n: Vec3;
  u: Vec3;
  at(uu: number, zz: number, off?: number): Vec3;
}

export function wallFrame(origin: Vec3, n: Vec3, u: Vec3): WallFrame {
  return {
    n, u,
    at(uu: number, zz: number, off = 0): Vec3 {
      return [
        origin[0] + n[0] * off + u[0] * uu,
        origin[1] + n[1] * off + u[1] * uu,
        origin[2] + n[2] * off + u[2] * uu + zz,
      ];
    },
  };
}

export function wallLoopPts(F: WallFrame, u0: number, u1: number, z0: number, z1: number, r: number, off: number, cw = false): SketchSample[] {
  const w = u1 - u0, h = z1 - z0, sg = cw ? 1 : -1;
  const dir: Vec3 = cw ? [-F.u[0], -F.u[1], -F.u[2]] : F.u;
  const t = ftur(F.at((u0 + u1) / 2, z0, off), dir, F.n);
  t.fwd(w / 2 - r).turn(r, 90 * sg).fwd(h - 2 * r).turn(r, 90 * sg).fwd(w - 2 * r).turn(r, 90 * sg).fwd(h - 2 * r).turn(r, 90 * sg).fwd(w / 2 - r);
  return t.pts;
}
