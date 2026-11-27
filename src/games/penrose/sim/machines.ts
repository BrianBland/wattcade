/**
 * Pure strict-TypeScript machine state machines for Penrose Pedals.
 * Implements auto-latching 2-position/detent machines, FTP-relative see-saws & beams
 * (with ERG cadence-surge parity), signed wind loads, clutch bridge warning/recoil,
 * and clean HUD status/progress indicators.
 */

import {
  clamp, DEG, isGapHidden, lerp, matFromPosQuat, matFromPosRotX, matFromPosRotY, matFromPosRotZ,
  matIdentity, matMul, quatFromAxisAngle, quatFromUnitVectors, quatIdentity, quatSlerp,
  UP_SKETCH, V, v3Dot, v3Norm, v3Sub,
  type Mat4, type OccluderBox, type Quat, type Vec3,
} from './math';
import { ftur, L3, lollipop, sAt, SimRoad, turtle, wallLoopPts, type WallFrame } from './road';
import type { BikeInput, FaceKey, SimEvent, SimMachine, SimTunables, WheelState } from './types';

type EmitFn = (e: Omit<SimEvent, 'id'>) => void;

const CRANK_TICK_DEG = 18;

/** Helper for detent-based machines with auto-latch on arrival. */
function makeDetentStepper(
  detents: readonly number[],
  startAngle: number,
  speedDegPerDrive: number,
  wrap360 = false,
) {
  const sorted = [...detents].sort((a, b) => a - b);
  let ang = startAngle;
  let sweep: 1 | -1 = startAngle <= sorted[0] + 0.5 ? 1 : -1;
  let targetDeg: number | null = null;
  let tickAccum = 0;

  const nearestIdx = (): number => {
    let best = 0, bd = Infinity;
    for (let i = 0; i < sorted.length; i++) {
      let d = Math.abs(sorted[i] - ang);
      if (wrap360) d = Math.min(d, 360 - d);
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  };

  const pickNextTarget = (dirHint: -1 | 0 | 1 = 0): number => {
    const idx = nearestIdx();
    if (wrap360) {
      const step = dirHint < 0 ? -1 : 1;
      const next = (idx + step + sorted.length) % sorted.length;
      sweep = step > 0 ? 1 : -1;
      return sorted[next];
    }
    if (sorted.length === 2) {
      const next = idx === 0 ? 1 : 0;
      sweep = next > idx ? 1 : -1;
      return sorted[next];
    }
    if (dirHint !== 0) {
      const next = clamp(idx + dirHint, 0, sorted.length - 1);
      if (next !== idx) {
        sweep = dirHint > 0 ? 1 : -1;
        return sorted[next];
      }
    }
    let next = idx + sweep;
    if (next < 0 || next >= sorted.length) {
      sweep = (sweep * -1) as 1 | -1;
      next = clamp(idx + sweep, 0, sorted.length - 1);
    }
    return sorted[next];
  };

  return {
    get ang() { return ang; },
    set ang(v: number) { ang = v; },
    get target() { return targetDeg; },
    at(deg: number): boolean {
      let d = Math.abs(ang - deg);
      if (wrap360) d = Math.min(d, 360 - d);
      return d < 0.5;
    },
    atAnyDetent(): boolean {
      return sorted.some((d) => this.at(d));
    },
    /** Called when player presses the machine button. */
    onPress(m: SimMachine, dirHint: -1 | 0 | 1, tunAutoLatch: boolean, emit: EmitFn): void {
      if (tunAutoLatch) {
        if (!m.on) {
          targetDeg = pickNextTarget(dirHint);
          m.on = true;
          emit({ kind: 'engage', pos: m.capPos });
        } else if (sorted.length === 2) {
          // Pressing again mid-swing reverses to the opposite detent
          const other = sorted.find((d) => d !== targetDeg) ?? sorted[0];
          targetDeg = other;
          sweep = other > ang ? 1 : -1;
          emit({ kind: 'engage', pos: m.capPos });
        } else {
          // Multi-stop: pressing mid-swing disengages cleanly to nearest detent
          m.on = false;
          targetDeg = null;
          emit({ kind: 'disengage', pos: m.capPos });
        }
      } else {
        m.on = !m.on;
        targetDeg = null;
        emit({ kind: m.on ? 'engage' : 'disengage', pos: m.capPos });
      }
    },
    /** Autopilot helper: engage toward a specific detent angle (or disengage if already there). */
    driveTo(m: SimMachine, wantDeg: number | null): void {
      if (wantDeg === null || this.at(wantDeg)) {
        m.on = false;
        targetDeg = null;
        return;
      }
      targetDeg = wantDeg;
      if (wrap360) {
        const cw = ((wantDeg - ang) % 360 + 360) % 360;
        sweep = cw <= 180 ? 1 : -1;
      } else {
        sweep = wantDeg >= ang ? 1 : -1;
      }
      m.on = true;
    },
    step(m: SimMachine, dt: number, drive: number, tun: SimTunables, emit: EmitFn, activeLoad = 0.58): number {
      const lo = sorted[0], hi = sorted[sorted.length - 1];
      if (m.on && drive > 0) {
        const delta = drive * speedDegPerDrive;
        if (targetDeg !== null) {
          let diff = targetDeg - ang;
          if (wrap360) {
            diff = ((targetDeg - ang + 540) % 360) - 180;
            if (Math.abs(diff) === 180) diff = sweep * 180;
          }
          if (Math.abs(diff) <= delta + 0.05) {
            ang = wrap360 ? ((targetDeg % 360) + 360) % 360 : targetDeg;
            m.on = false;
            targetDeg = null;
            tickAccum = 0;
            emit({ kind: 'latch', pos: m.capPos });
            return 0; // Immediate resistance drop on detent lock!
          }
          const stepSign = Math.sign(diff) || sweep;
          ang += stepSign * delta;
          if (wrap360) ang = ((ang % 360) + 360) % 360;
          tickAccum += delta;
          if (tickAccum >= CRANK_TICK_DEG) {
            tickAccum -= CRANK_TICK_DEG;
            emit({ kind: 'crankTick', pos: m.capPos, pitch: 0.9 + 0.25 * clamp((ang - lo) / Math.max(1, hi - lo), 0, 1) });
          }
        } else {
          // Manual ping-pong mode (when autoLatch disabled)
          if (wrap360) {
            ang = (ang + delta) % 360;
          } else {
            ang += sweep * delta;
            if (ang <= lo || ang >= hi) {
              ang = clamp(ang, lo, hi);
              sweep = (sweep * -1) as 1 | -1;
              emit({ kind: 'latch', pos: m.capPos });
            }
          }
          tickAccum += delta;
          if (tickAccum >= CRANK_TICK_DEG) {
            tickAccum -= CRANK_TICK_DEG;
            emit({ kind: 'crankTick', pos: m.capPos });
          }
        }
        return activeLoad;
      }
      if (!m.on) {
        // Settle gently onto nearest detent
        const tgt = sorted[nearestIdx()];
        let diff = tgt - ang;
        if (wrap360) diff = ((tgt - ang + 540) % 360) - 180;
        const stepAmt = clamp(diff, -60 * dt, 60 * dt);
        ang += stepAmt;
        if (wrap360) ang = ((ang % 360) + 360) % 360;
      }
      return 0;
    },
  };
}

// ---- 1. Turntable / Hub ----

export interface TurntableHandle {
  m: SimMachine;
  road: SimRoad;
  ang: () => number;
  at: (deg: number) => boolean;
  setAng: (deg: number) => void;
  driveTo: (deg: number | null) => void;
  groupId: string;
}

export function createTurntable(opts: {
  id: string;
  key: FaceKey;
  name: string;
  pivot: Vec3;
  len: number;
  base?: number;
  open: number;
  detents?: number[];
  startAng?: number;
  edgeText?: string;
}): TurntableHandle {
  const base = opts.base ?? 0;
  const detents = opts.detents ?? [0, opts.open];
  const start = opts.startAng ?? 0;
  const pivotW = V(opts.pivot[0], opts.pivot[1], opts.pivot[2]);
  const stepper = makeDetentStepper(detents, start, 34, false);
  const groupId = `g_${opts.id}`;
  const getMat = (): Mat4 => matFromPosRotY(pivotW, -(base + stepper.ang) * DEG);

  const road = new SimRoad(L3([0, 0, 0], [opts.len, 0, 0], UP_SKETCH), {
    id: `${opts.id}_road`,
    turntable: true,
    transform: getMat,
    groupId,
    edgeText: opts.edgeText,
  });

  const lo = Math.min(...detents), hi = Math.max(...detents);
  const m: SimMachine = {
    id: opts.id,
    kind: 'turntable',
    mode: 'autoLatch',
    key: opts.key,
    name: opts.name,
    on: false,
    value: start,
    progress: (start - lo) / Math.max(1, hi - lo),
    ready: true,
    status: `${Math.round(start)}°`,
    load: 0,
    capPos: [pivotW[0], pivotW[1] + 0.08, pivotW[2]],
    capNormal: [0, 1, 0],
    size: 0.55,
    transform: getMat,
    press(dirHint) { stepper.onPress(m, dirHint ?? 0, true, pendingEmit); },
    tick(dt, drive, _bike, tun, emit) {
      pendingEmit = emit;
      const ld = stepper.step(m, dt, drive, tun, emit, 0.58);
      m.value = stepper.ang;
      m.progress = clamp((stepper.ang - lo) / Math.max(1, hi - lo), 0, 1);
      m.ready = stepper.atAnyDetent();
      m.status = m.on ? 'Turning' : `${Math.round(stepper.ang)}°`;
      m.load = ld;
      return ld;
    },
    extra: () => ({ base, ang: stepper.ang, len: opts.len }),
  };
  let pendingEmit: EmitFn = () => {};

  return {
    m,
    road,
    ang: () => stepper.ang,
    at: (d) => stepper.at(d),
    setAng: (d) => { stepper.ang = d; m.value = d; },
    driveTo: (d) => stepper.driveTo(m, d),
    groupId,
  };
}

// ---- 2. Crossover Disc ----

export const CROSS_MAP = [
  { W: 'N', N: 'W', E: 'S', S: 'E' },
  { N: 'E', E: 'N', S: 'W', W: 'S' },
] as const;

export const COMPASS_DIRS = { E: [1, 0], N: [0, 1], W: [-1, 0], S: [0, -1] } as const;

export interface CrossDiscHandle {
  m: SimMachine;
  roads: [SimRoad, SimRoad];
  centerW: Vec3;
  R: number;
  state: () => 0 | 1 | -1;
  driveToState: (want: 0 | 1 | null) => void;
  groupId: string;
}

export function createCrossDisc(opts: {
  id: string;
  key: FaceKey;
  name: string;
  center: Vec3;
  R?: number;
  base?: number;
}): CrossDiscHandle {
  const R = opts.R ?? 2, base = opts.base ?? 0;
  const centerW = V(opts.center[0], opts.center[1], opts.center[2]);
  const stepper = makeDetentStepper([0, 90], 0, 34, false);
  const groupId = `g_${opts.id}`;
  const getMat = (): Mat4 => matFromPosRotY(centerW, -(base + stepper.ang) * DEG);

  const c1 = new SimRoad(turtle(-R, 0, 0, 0).arc(R, 90).pts, { id: `${opts.id}_c1`, transform: getMat, groupId });
  const c2 = new SimRoad(turtle(R, 0, 180, 0).arc(R, 90).pts, { id: `${opts.id}_c2`, transform: getMat, groupId });
  let pendingEmit: EmitFn = () => {};

  const state = (): 0 | 1 | -1 => (stepper.ang < 0.5 ? 0 : stepper.ang > 89.5 ? 1 : -1);

  const m: SimMachine = {
    id: opts.id,
    kind: 'crossDisc',
    mode: 'autoLatch',
    key: opts.key,
    name: opts.name,
    on: false,
    value: 0,
    progress: 0,
    ready: true,
    status: 'W–N',
    load: 0,
    capPos: [centerW[0], centerW[1] + 0.08, centerW[2]],
    capNormal: [0, 1, 0],
    size: 0.6,
    transform: getMat,
    press(dirHint) { stepper.onPress(m, dirHint ?? 0, true, pendingEmit); },
    tick(dt, drive, _bike, tun, emit) {
      pendingEmit = emit;
      const ld = stepper.step(m, dt, drive, tun, emit, 0.62);
      m.value = stepper.ang;
      m.progress = clamp(stepper.ang / 90, 0, 1);
      const st = state();
      m.ready = st >= 0;
      m.status = st === 0 ? 'W–N / E–S' : st === 1 ? 'N–E / S–W' : 'Turning';
      m.load = ld;
      return ld;
    },
    extra: () => ({ base, ang: stepper.ang, R }),
  };

  return {
    m,
    roads: [c1, c2],
    centerW,
    R,
    state,
    driveToState: (w) => stepper.driveTo(m, w === null ? null : w * 90),
    groupId,
  };
}

// ---- 3. Peel Switch (Points) ----

export interface PeelSwitchHandle {
  m: SimMachine;
  leaf: SimRoad;
  ang: () => number;
  down: () => boolean;
  end: [number, number, number, number];
  atW: Vec3;
  driveDown: (wantDown: boolean) => void;
  groupId: string;
}

export function createPeelSwitch(opts: {
  id: string;
  key: FaceKey;
  name: string;
  line: SimRoad;
  s: number;
  dir: 1 | -1;
  side: 1 | -1;
  R?: number;
  text?: string;
}): PeelSwitchHandle {
  const R = opts.R ?? 3;
  const f = opts.line.at(opts.s);
  const h = Math.atan2(f.d[2], f.d[0]) / DEG + (opts.dir < 0 ? 180 : 0);
  const tp = turtle(f.p[0], f.p[2], h, f.p[1] + 0.006).arc(R, opts.side * 45);
  const P1: Vec3 = [tp.x, tp.y, tp.z];
  const P1W = V(P1[0], P1[1], P1[2]);
  const leafPts = tp.pts.map((q) => ({
    p: [q.p[0] - P1[0], q.p[1] - P1[1], q.p[2] - P1[2]] as Vec3,
    n: q.n,
  }));

  const ha = (h + opts.side * 45) * DEG;
  const axis = v3Norm(V(-Math.sin(ha), 0, Math.cos(ha)));
  const p0 = V(leafPts[0].p[0], leafPts[0].p[1], leafPts[0].p[2]);
  const tipY = (sg: number): number => {
    const q = quatFromAxisAngle(axis, sg);
    const m = matFromPosQuat([0, 0, 0], q);
    return m[1] * p0[0] + m[5] * p0[1] + m[9] * p0[2];
  };
  const swing = tipY(1) > tipY(-1) ? 1 : -1;
  const stepper = makeDetentStepper([0, 90], 90, 36, false);
  const groupId = `g_${opts.id}`;
  const getMat = (): Mat4 => matFromPosQuat(P1W, quatFromAxisAngle(axis, swing * (stepper.ang / 90) * 0.5));

  const leaf = new SimRoad(leafPts, { id: `${opts.id}_leaf`, transform: getMat, groupId, th: 0.18 });
  leaf.joins.push({ k: 0, to: opts.line, s: opts.s, dir: (opts.dir * -1) as 1 | -1 });
  opts.line.forks.push({ s: opts.s, dir: opts.dir, to: leaf, toK: 0, when: () => stepper.ang < 1, text: opts.text ?? '' });

  const hr = h * DEG;
  const C0: Vec3 = [f.p[0] - Math.sin(hr) * opts.side * 0.95, f.p[2] + Math.cos(hr) * opts.side * 0.95, f.p[1]];
  const capW = V(C0[0], C0[1], C0[2] + 0.14);
  let pendingEmit: EmitFn = () => {};

  const m: SimMachine = {
    id: opts.id,
    kind: 'peelSwitch',
    mode: 'autoLatch',
    key: opts.key,
    name: opts.name,
    on: false,
    value: 90,
    progress: 0,
    ready: false,
    status: 'Up',
    load: 0,
    capPos: capW,
    capNormal: [0, 1, 0],
    size: 0.5,
    transform: getMat,
    press(dirHint) { stepper.onPress(m, dirHint ?? 0, true, pendingEmit); },
    tick(dt, drive, _bike, tun, emit) {
      pendingEmit = emit;
      const ld = stepper.step(m, dt, drive, tun, emit, 0.52);
      m.value = stepper.ang;
      m.progress = clamp(1 - stepper.ang / 90, 0, 1);
      m.ready = stepper.ang < 1;
      m.status = stepper.ang < 1 ? 'Down' : stepper.ang > 89 ? 'Up' : 'Moving';
      m.load = ld;
      return ld;
    },
    extra: () => ({ ang: stepper.ang, C0x: C0[0], C0y: C0[1], C0z: C0[2] }),
  };

  return {
    m,
    leaf,
    ang: () => stepper.ang,
    down: () => stepper.ang < 1,
    end: [P1[0], P1[1], P1[2], h + opts.side * 45],
    atW: f.p,
    driveDown: (wantDown) => stepper.driveTo(m, wantDown ? 0 : 90),
    groupId,
  };
}

// ---- 4. Camera Crank ----

export interface CameraCrankHandle {
  m: SimMachine;
  ang: () => number;
  at: (deg: number) => boolean;
  driveTo: (deg: number | null) => void;
}

export function createCameraCrank(opts: {
  id: string;
  key: FaceKey;
  name?: string;
  at: Vec3;
  detents: number[];
}): CameraCrankHandle {
  const start = opts.detents[0];
  const stepper = makeDetentStepper(opts.detents, start, 36, false);
  const capW = V(opts.at[0], opts.at[1], opts.at[2] + 0.08);
  const lo = Math.min(...opts.detents), hi = Math.max(...opts.detents);
  let pendingEmit: EmitFn = () => {};

  const m: SimMachine = {
    id: opts.id,
    kind: 'camera',
    mode: 'autoLatch',
    key: opts.key,
    name: opts.name ?? 'Camera',
    on: false,
    value: start,
    progress: (start - lo) / Math.max(1, hi - lo),
    ready: true,
    status: start === 0 ? 'Front' : `${start}°`,
    load: 0,
    capPos: capW,
    capNormal: [0, 1, 0],
    size: 0.55,
    press(dirHint) { stepper.onPress(m, dirHint ?? 0, true, pendingEmit); },
    tick(dt, drive, _bike, tun, emit) {
      pendingEmit = emit;
      const ld = stepper.step(m, dt, drive, tun, emit, 0.45);
      m.value = stepper.ang;
      m.progress = clamp((stepper.ang - lo) / Math.max(1, hi - lo), 0, 1);
      m.ready = stepper.atAnyDetent();
      m.status = m.on ? 'Turning' : stepper.at(0) ? 'Front' : `${Math.round(stepper.ang)}°`;
      m.load = ld;
      return ld;
    },
    extra: () => ({ ang: stepper.ang }),
  };

  return {
    m,
    ang: () => stepper.ang,
    at: (d) => stepper.at(d),
    driveTo: (d) => stepper.driveTo(m, d),
  };
}

// ---- 5. Drawbridge (hinged road leaf, optionally also an occluder!) ----

export interface DrawbridgeHandle {
  m: SimMachine;
  road: SimRoad;
  ang: () => number;
  down: () => boolean;
  raised: () => boolean;
  occluder: OccluderBox;
  driveTo: (deg: number | null) => void;
  groupId: string;
}

export function createDrawbridge(opts: {
  id: string;
  key: FaceKey;
  name?: string;
  hinge: Vec3;
  at: Vec3;
  len?: number;
  w?: number;
  raised?: boolean;
  /** 'z' rotates in X-Y (standard drawbridge along -x); 'x' rotates in Y-Z (mobius along -y). */
  axis?: 'z' | 'x';
}): DrawbridgeHandle {
  const len = opts.len ?? 2.4, w = opts.w ?? 1.4, axis = opts.axis ?? 'z';
  const hingeW = V(opts.hinge[0], opts.hinge[1], opts.hinge[2]);
  const start = opts.raised ? 90 : 0;
  const stepper = makeDetentStepper([0, 90], start, 36, false);
  const groupId = `g_${opts.id}`;

  const getMat = (): Mat4 =>
    axis === 'z'
      ? matFromPosRotZ(hingeW, -(stepper.ang / 90) * (Math.PI / 2))
      : matFromPosRotX(hingeW, (stepper.ang / 90) * 1.1);

  const pts = axis === 'z'
    ? L3([0, 0, 0.006], [-len, 0, 0.006], UP_SKETCH)
    : L3([0, -len, 0], [0, 0, 0], UP_SKETCH);

  const road = new SimRoad(pts, { id: `${opts.id}_road`, transform: getMat, groupId, th: 0.14 });
  const occluder: OccluderBox = axis === 'z'
    ? { min: [-len, -0.33, -w / 2], max: [0, -0.03, w / 2], transform: getMat }
    : { min: [-w / 2, -0.18, -len], max: [w / 2, 0.02, 0], transform: getMat };

  const capW = V(opts.at[0], opts.at[1], opts.at[2] + 0.08);
  let pendingEmit: EmitFn = () => {};

  const m: SimMachine = {
    id: opts.id,
    kind: 'drawbridge',
    mode: 'autoLatch',
    key: opts.key,
    name: opts.name ?? 'Drawbridge',
    on: false,
    value: start,
    progress: 1 - start / 90,
    ready: start < 1,
    status: start < 1 ? 'Down' : 'Raised',
    load: 0,
    capPos: capW,
    capNormal: [0, 1, 0],
    size: 0.6,
    transform: getMat,
    press(dirHint) { stepper.onPress(m, dirHint ?? 0, true, pendingEmit); },
    tick(dt, drive, _bike, tun, emit) {
      pendingEmit = emit;
      const ld = stepper.step(m, dt, drive, tun, emit, 0.6);
      m.value = stepper.ang;
      m.progress = clamp(1 - stepper.ang / 90, 0, 1);
      m.ready = stepper.atAnyDetent();
      m.status = stepper.ang < 1 ? 'Down' : stepper.ang > 89 ? 'Raised' : 'Moving';
      m.load = ld;
      return ld;
    },
    extra: () => ({ ang: stepper.ang, len, w, axis }),
  };

  return {
    m,
    road,
    ang: () => stepper.ang,
    down: () => stepper.ang < 1,
    raised: () => stepper.ang > 89,
    occluder,
    driveTo: (d) => stepper.driveTo(m, d),
    groupId,
  };
}

// ---- 6. Spring See-Saw (FTP-relative effort + ERG cadence surge parity!) ----

export interface SeesawHandle {
  m: SimMachine;
  beam: SimRoad;
  c: () => number;
  tip: () => number;
  groupId: string;
}

export function createSeesaw(opts: {
  id: string;
  key: FaceKey;
  name?: string;
  /** Sketch position of the low/left beam end at rest. */
  P: Vec3;
  baseDeg: number;
  side: 1 | -1;
}): SeesawHandle {
  const a = Math.asin(1 / 2.5);
  const X = 2.5 * Math.cos(a);
  const outerW = V(opts.P[0], opts.P[1], opts.P[2]);
  const outerMat = matFromPosRotY(outerW, -opts.baseDeg * DEG);
  let c = 0;
  let tip = 0;
  let wasTipped = false;
  const groupId = `g_${opts.id}`;

  const getMat = (): Mat4 => {
    const k = clamp((c - 0.1) / 0.8, 0, 1);
    const sm = k * k * (3 - 2 * k);
    const pivotMat = matFromPosRotZ([X, 1, 0], a * (1 - 2 * sm));
    return matMul(outerMat, pivotMat);
  };

  const beam = new SimRoad(L3([-2.5, 0, 0], [2.5, 0, 0], UP_SKETCH), {
    id: `${opts.id}_beam`,
    transform: getMat,
    groupId,
    th: 0.35,
  });

  // Cap position in world space
  const capLocal = V(X, -0.85 * opts.side, 1.35);
  const capW: Vec3 = [
    outerMat[0] * capLocal[0] + outerMat[4] * capLocal[1] + outerMat[8] * capLocal[2] + outerMat[12],
    outerMat[1] * capLocal[0] + outerMat[5] * capLocal[1] + outerMat[9] * capLocal[2] + outerMat[13],
    outerMat[2] * capLocal[0] + outerMat[6] * capLocal[1] + outerMat[10] * capLocal[2] + outerMat[14],
  ];

  const m: SimMachine = {
    id: opts.id,
    kind: 'seesaw',
    mode: 'toggle',
    key: opts.key,
    name: opts.name ?? 'Spring',
    on: false,
    value: 0,
    progress: 0,
    ready: false,
    status: 'Resting',
    load: 0,
    capPos: capW,
    capNormal: [0, 1, 0],
    size: 0.6,
    transform: getMat,
    tick(dt, _drive, bike, tun, emit) {
      const holdFtp = lerp(tun.seesawHoldFtp, tun.seesawPeakFtp, c);
      // Real FTP-relative effort + ERG cadence-surge parity!
      let eff = bike.ftpFraction;
      if (bike.ergMode && bike.cadence >= tun.surgeRpm) {
        eff = Math.max(eff, tun.seesawPeakFtp + 0.16);
      }
      if (m.on && bike.cadence > 20) {
        c += (eff - holdFtp) * 1.15 * dt;
      } else {
        c -= 0.26 * dt;
      }
      c = clamp(c, 0, 1);
      const k = clamp((c - 0.1) / 0.8, 0, 1);
      tip = k * k * (3 - 2 * k);
      if (tip > 0.95 && !wasTipped) {
        wasTipped = true;
        emit({ kind: 'springTip', pos: capW });
      } else if (tip < 0.5) {
        wasTipped = false;
      }
      m.value = c;
      m.progress = tip;
      m.ready = tip > 0.95;
      m.status = tip > 0.95 ? 'Tipped' : m.on ? `${Math.round(c * 100)}%` : 'Resting';
      const ld = m.on && bike.cadence > 20 ? 0.25 + 1.15 * c : 0;
      m.load = ld;
      return ld;
    },
    extra: () => ({ c, tip, baseDeg: opts.baseDeg, side: opts.side }),
  };

  return { m, beam, c: () => c, tip: () => tip, groupId };
}

// ---- 7. Cadence Lift (buttonless or buttoned faucet lift) ----

export interface CadenceLiftHandle {
  m: SimMachine;
  z: () => number;
  moving: () => boolean;
  deck?: SimRoad;
  occluder?: OccluderBox;
  groupId: string;
}

export function createCadenceLift(opts: {
  id: string;
  key?: FaceKey;
  name?: string;
  /** Origin in sketch coords (for faucetLift) or [0,0,0] for custom-built lifts. */
  origin?: Vec3;
  headingDeg?: number;
  step: number;
  floors: number;
  /** Cadence for floor 0 and top floor (defaults 55 -> 100). */
  cadLo?: number;
  cadSpan?: number;
  rate?: number;
  snapBand?: number;
  /** If true, creates a built-in lollipop cul-de-sac deck road (like faucetLift). */
  withLollipopDeck?: boolean;
  capSketch?: Vec3;
  /** Optional local OBB (world coords before lift Y offset) for curtain lifts like c-curtain. */
  occluderLocal?: { min: Vec3; max: Vec3 };
}): CadenceLiftHandle {
  const origin = opts.origin ?? [0, 0, 0];
  const heading = opts.headingDeg ?? 0;
  const top = opts.floors * opts.step;
  const cadLo = opts.cadLo ?? 55;
  const cadSpan = opts.cadSpan ?? 45;
  const rate = opts.rate ?? 1.25;
  const snapBand = opts.snapBand ?? 0.42;
  const groupId = `g_${opts.id}`;

  let lvl = 0;
  let z = 0;
  let moving = false;
  let lastSnappedFloor = 0;

  const originW = V(origin[0], origin[1], origin[2]);
  const getMat = (): Mat4 => {
    const base = matFromPosRotY(originW, -heading * DEG);
    const liftM = matFromPosQuat([0, z, 0]);
    return matMul(base, liftM);
  };

  let deck: SimRoad | undefined;
  if (opts.withLollipopDeck) {
    deck = new SimRoad(lollipop(0, 0, 0, 0, 1.2, 1), {
      id: `${opts.id}_deck`,
      transform: getMat,
      groupId,
      w: 0.8,
      th: 0,
    });
  }

  const occluder: OccluderBox | undefined = opts.occluderLocal
    ? { min: opts.occluderLocal.min, max: opts.occluderLocal.max, transform: getMat }
    : undefined;

  const capW: Vec3 = opts.capSketch ? V(opts.capSketch[0], opts.capSketch[1], opts.capSketch[2]) : [originW[0], originW[1] + 1, originW[2]];
  const floorHeights = Array.from({ length: opts.floors + 1 }, (_, i) => i * opts.step);

  const m: SimMachine = {
    id: opts.id,
    kind: opts.key ? 'faucetLift' : 'cadenceLift',
    mode: opts.key ? 'toggle' : 'passive',
    key: opts.key,
    name: opts.name ?? 'Lift',
    on: false,
    value: 0,
    progress: 0,
    ready: true,
    status: 'Ground',
    load: 0,
    capPos: capW,
    capNormal: [0, 1, 0],
    size: 0.65,
    transform: getMat,
    tick(dt, drive, bike, _tun, emit) {
      const active = opts.key ? m.on && drive > 0 : bike.cadence > 10;
      const target = clamp((bike.cadence - cadLo) / cadSpan, 0, 1) * top;
      const prev = lvl;
      if (active) {
        lvl += clamp(target - lvl, -rate * dt, rate * dt);
      }
      moving = Math.abs(lvl - prev) > 1e-4;
      let snapped = lvl;
      let floorIdx = -1;
      for (let i = 0; i < floorHeights.length; i++) {
        if (Math.abs(lvl - floorHeights[i]) < snapBand) {
          snapped = floorHeights[i];
          floorIdx = i;
          break;
        }
      }
      z = snapped;
      if (floorIdx >= 0 && floorIdx !== lastSnappedFloor) {
        lastSnappedFloor = floorIdx;
        emit({ kind: 'latch', pos: capW, pitch: 0.85 + floorIdx * 0.14 });
      }
      m.value = z;
      m.progress = top > 0 ? clamp(z / top, 0, 1) : 0;
      m.ready = floorIdx >= 0;
      m.status = floorIdx === 0 ? 'Ground' : floorIdx > 0 ? `Floor ${floorIdx}` : 'Moving';
      const ld = active && (moving || !!opts.key) ? 0.25 + 0.12 * (z / Math.max(0.5, opts.step)) : 0;
      m.load = ld;
      return ld;
    },
    extra: () => ({ z, lvl, step: opts.step, floors: opts.floors, floorIdx: lastSnappedFloor }),
  };

  return { m, z: () => z, moving: () => moving, deck, occluder, groupId };
}

// ---- 8. Tide (passive effort-driven sea) ----

export interface TideHandle {
  m: SimMachine;
  z: () => number;
  frac: () => number;
  avgEffort: () => number;
  groupId: string;
}

export function createTide(opts: { id: string; hi?: number; tauS?: number; initialEffort?: number }): TideHandle {
  const HI = opts.hi ?? 1.6;
  const TAU_S = opts.tauS ?? 12; // Slightly snappier than 15s for better responsiveness
  let avg = opts.initialEffort ?? 100;
  let lvl = 0;
  let z = 0;
  let lastState: 'out' | 'mid' | 'in' = 'out';
  const groupId = `g_${opts.id}`;
  const getMat = (): Mat4 => matFromPosQuat([0, z, 0]);

  const m: SimMachine = {
    id: opts.id,
    kind: 'tide',
    mode: 'passive',
    name: 'Tide',
    on: false,
    value: 0,
    progress: 0,
    ready: false,
    status: 'Low tide',
    load: 0,
    capPos: [0, 0, 0],
    capNormal: [0, 1, 0],
    size: 0.5,
    transform: getMat,
    tick(dt, _drive, bike, tun, emit) {
      const e = bike.ftpFraction * tun.effortAtFtp;
      avg += (e - avg) * Math.min(1, dt / TAU_S);
      const want = clamp((avg - 100) / 40, 0, 1) * HI;
      lvl += clamp(want - lvl, -0.15 * dt, 0.15 * dt);
      let snapped = lvl;
      if (Math.abs(lvl) < 0.26) snapped = 0;
      else if (Math.abs(lvl - HI) < 0.26) snapped = HI;
      z = snapped;
      const curState = z === HI ? 'in' : z === 0 ? 'out' : 'mid';
      if (curState !== lastState && curState !== 'mid') {
        lastState = curState;
        emit({ kind: 'latch', pitch: curState === 'in' ? 1.25 : 0.85 });
      }
      m.value = z;
      m.progress = clamp(z / HI, 0, 1);
      m.ready = z === HI || z === 0;
      m.status = z === HI ? 'High tide' : z === 0 ? 'Low tide' : `${Math.round((z / HI) * 100)}%`;
      return 0;
    },
    extra: () => ({ z, hi: HI, avg }),
  };

  return { m, z: () => z, frac: () => clamp(z / HI, 0, 1), avgEffort: () => avg, groupId };
}

// ---- 9. Wind Sock (4-stop compass with signed headwind/tailwind!) ----

export interface WindSockHandle {
  m: SimMachine;
  ang: () => number;
  at: (deg: number) => boolean;
  steady: () => boolean;
  compassName: () => string;
  driveTo: (deg: number | null) => void;
}

export function createWindSock(opts: {
  id: string;
  key?: FaceKey;
  x: number;
  y: number;
  z?: number;
  a0: number;
  getWheelHeading: () => Vec3 | null;
}): WindSockHandle {
  const z = opts.z ?? 0;
  const stepper = makeDetentStepper([0, 90, 180, 270], opts.a0, 44, true);
  const capW = V(opts.x, opts.y, z + 0.08);
  let pendingEmit: EmitFn = () => {};
  const NAMES = ['East', 'North', 'West', 'South'] as const;

  const m: SimMachine = {
    id: opts.id,
    kind: 'windSock',
    mode: 'autoLatch',
    key: opts.key ?? 'y',
    name: 'Wind sock',
    on: false,
    value: opts.a0,
    progress: opts.a0 / 360,
    ready: true,
    status: NAMES[Math.round(opts.a0 / 90) % 4],
    load: 0,
    capPos: capW,
    capNormal: [0, 1, 0],
    size: 0.55,
    press(dirHint) { stepper.onPress(m, dirHint ?? 0, true, pendingEmit); },
    tick(dt, drive, _bike, tun, emit) {
      pendingEmit = emit;
      const crankLoad = stepper.step(m, dt, drive, tun, emit, 0.35);
      // Signed headwind (+) / tailwind (-) resistance!
      let windLoad = 0;
      const hd = opts.getWheelHeading();
      if (hd) {
        const rad = stepper.ang * DEG;
        const headOn = hd[0] * Math.cos(rad) + hd[2] * Math.sin(rad);
        windLoad = headOn > 0 ? 0.55 * headOn : 0.35 * headOn;
      }
      m.value = stepper.ang;
      m.progress = stepper.ang / 360;
      m.ready = stepper.atAnyDetent();
      m.status = m.on ? 'Turning' : `From ${NAMES[Math.round(stepper.ang / 90) % 4]}`;
      m.load = crankLoad + windLoad;
      return m.load;
    },
    extra: () => ({ ang: stepper.ang, steady: stepper.atAnyDetent() }),
  };

  return {
    m,
    ang: () => stepper.ang,
    at: (d) => stepper.at(d),
    steady: () => stepper.atAnyDetent(),
    compassName: () => NAMES[Math.round(stepper.ang / 90) % 4],
    driveTo: (d) => stepper.driveTo(m, d),
  };
}

// ---- 10. Conveyor Belt ----

export interface ConveyorHandle {
  m: SimMachine;
  shift: () => number;
  offset: () => number;
}

export function createConveyor(opts: {
  id: string;
  key?: FaceKey;
  x: number;
  y0: number;
  dy: number;
  from: SimRoad;
  lanes: SimRoad[];
  bands: [number, number];
}): ConveyorHandle {
  let off = 0;
  let lastCad = 80;
  const shift = (): number => (lastCad < opts.bands[0] ? 1 : lastCad < opts.bands[1] ? 2 : 3);
  const y1 = opts.y0 + opts.dy * opts.lanes.length;
  const ylo = Math.min(opts.y0, y1) - 0.7;
  const capW = V(opts.x + 1.2, ylo - 0.3, 0.08);

  const m: SimMachine = {
    id: opts.id,
    kind: 'conveyor',
    mode: 'toggle',
    key: opts.key ?? 'y',
    name: 'Conveyor',
    on: false,
    value: 1,
    progress: 0.5,
    ready: false,
    status: 'Off',
    load: 0,
    capPos: capW,
    capNormal: [0, 1, 0],
    size: 0.5,
    tick(_dt, drive, bike) {
      lastCad = bike.cadence;
      if (m.on && drive > 0) off += drive * 2.2;
      const sh = shift();
      m.value = sh;
      m.progress = sh / opts.lanes.length;
      m.ready = m.on;
      m.status = m.on ? `${sh} lane${sh > 1 ? 's' : ''}` : 'Off';
      m.load = m.on && drive > 0 ? 0.25 : 0;
      return m.load;
    },
    extra: () => ({ off, shift: shift(), lo: opts.bands[0], hi: opts.bands[1] }),
  };

  opts.lanes.forEach((lane, i) => {
    opts.from.forks.push({
      s: sAt(opts.from, [opts.x, opts.y0, 0]),
      dir: 1,
      to: lane,
      toS: () => sAt(lane, [opts.x + 0.3, opts.y0 + opts.dy * (i + 1), 0]),
      slide: 0.8,
      toDir: 1,
      when: () => m.on && shift() === i + 1,
      text: `Carried across ${i + 1} lane${i ? 's' : ''}`,
    });
  });

  return { m, shift, offset: () => off };
}

// ---- 11. Companion Block on a Rail ----

export interface CompanionHandle {
  m: SimMachine;
  t: () => number;
  held: () => boolean;
  atDist: (d: number) => boolean;
  occluder: OccluderBox;
  groupId: string;
}

export function createCompanion(opts: {
  id: string;
  key?: FaceKey;
  follow: SimRoad;
  a: Vec3;
  b: Vec3;
  getWheel: () => WheelState | null;
}): CompanionHandle {
  const len = Math.hypot(opts.b[0] - opts.a[0], opts.b[1] - opts.a[1]);
  const dir: [number, number] = [(opts.b[0] - opts.a[0]) / (len || 1), (opts.b[1] - opts.a[1]) / (len || 1)];
  const z = opts.a[2];
  let tVal = 0;
  const groupId = `g_${opts.id}`;
  const yaw = -Math.atan2(dir[1], dir[0]);

  const getMat = (): Mat4 => {
    const pos = V(opts.a[0] + dir[0] * tVal * len, opts.a[1] + dir[1] * tVal * len, z);
    return matFromPosRotY(pos, yaw);
  };

  const occluder: OccluderBox = {
    min: [-0.525, 0, -0.525],
    max: [0.525, 1.05, 0.525],
    transform: getMat,
  };

  const capW = V(opts.a[0] - 0.9 * dir[0], opts.a[1] - 0.9 * dir[1], 0.08);
  const m: SimMachine = {
    id: opts.id,
    kind: 'companion',
    mode: 'switch',
    key: opts.key ?? 'a',
    name: 'Companion',
    on: false,
    value: 0,
    progress: 0,
    ready: false,
    status: 'Following',
    load: 0,
    capPos: capW,
    capNormal: [0, 1, 0],
    size: 0.45,
    transform: getMat,
    tick() {
      const W = opts.getWheel();
      if (!m.on && W && W.road === opts.follow && W.mode === 'road') {
        const f = W.s / (opts.follow.L || 1);
        tVal = f < 0.5 ? f * 2 : 2 - f * 2;
      }
      m.value = tVal * len;
      m.progress = tVal;
      m.ready = m.on;
      m.status = m.on ? 'Held' : 'Following';
      return 0;
    },
    extra: () => ({ t: tVal, held: m.on }),
  };

  return {
    m,
    t: () => tVal,
    held: () => m.on,
    atDist: (x) => Math.abs(tVal * len - x) < 0.25,
    occluder,
    groupId,
  };
}

// ---- 12. Clutch Bridge (dynamic edgeText, catch glow, warning shudder, recoil!) ----

export interface ClutchBridgeHandle {
  m: SimMachine;
  len: () => number;
  spans: () => boolean;
  locked: () => boolean;
  span: number;
  max: number;
}

export function createClutchBridge(opts: {
  id: string;
  key?: FaceKey;
  from: SimRoad;
  to: SimRoad;
  btn?: [number, number];
  btnZ?: number;
  rate?: number;
  catchLen?: number;
}): ClutchBridgeHandle {
  const a = opts.from.end(1).p, b = opts.to.end(0).p;
  const span = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const catchLen = opts.catchLen ?? 0.65;
  const max = span + catchLen;
  const rate = opts.rate ?? 0.24;
  const d = v3Norm(v3Sub(b, a));
  let len = 0;
  let recoiling = false;
  let warned = false;
  let tickAccum = 0;

  const capW: Vec3 = opts.btn
    ? V(opts.btn[0], opts.btn[1], (opts.btnZ ?? 0) + 0.08)
    : [a[0] - d[0] * 0.9 + d[2] * 1.1, (opts.btnZ ?? a[1]) + 0.08, a[2] - d[2] * 0.9 + d[0] * 1.1];

  const spans = () => len >= span && len <= max;
  const locked = () => !m.on && !recoiling && len > 0.02;

  const m: SimMachine = {
    id: opts.id,
    kind: 'clutchBridge',
    mode: 'toggle',
    key: opts.key ?? 'z',
    name: 'Clutch',
    on: false,
    value: 0,
    progress: 0,
    ready: false,
    status: 'Retracted',
    load: 0,
    capPos: capW,
    capNormal: [0, 1, 0],
    size: 0.45,
    tick(dt, drive, _bike, _tun, emit) {
      if (recoiling) {
        len = Math.max(0, len - 8 * dt);
        if (len <= 0.01) { len = 0; recoiling = false; warned = false; }
      } else if (m.on && drive > 0) {
        const dl = drive * rate;
        len += dl;
        tickAccum += dl;
        if (tickAccum >= 0.28) {
          tickAccum -= 0.28;
          emit({ kind: 'crankTick', pos: capW, pitch: 0.85 + 0.45 * clamp(len / max, 0, 1) });
        }
        if (len >= span && !warned) {
          warned = true;
          emit({ kind: 'clutchWarn', pos: b });
        }
        if (len > max) {
          recoiling = true;
          m.on = false;
          emit({ kind: 'clutchSlip', pos: b, text: 'Clutch slipped! Rewinding bridge' });
        }
      }
      m.value = len;
      m.progress = clamp(len / span, 0, 1);
      m.ready = locked() && spans();
      m.status = recoiling ? 'Slipped!' : m.ready ? 'Locked!' : spans() ? 'Lock now!' : m.on ? 'Winding' : len > 0 ? 'Short' : 'Free';
      const ld = m.on && drive > 0 ? 0.35 + 0.25 * clamp(len / max, 0, 1) : 0;
      m.load = ld;
      return ld;
    },
    extra: () => ({ len, span, max, locked: locked(), spans: spans(), warn: m.on && len >= span, recoiling }),
  };

  opts.from.gaps.push({
    k: 1,
    to: opts.to,
    toK: 0,
    when: () => locked() && spans(),
    text: 'Bridge locked on the catch',
    kind: 'bridge',
  });
  // Dynamic edgeText — fixes the static build-time bug in studies2.ts:87!
  opts.from.edgeText = () => (len < span ? 'The bridge stopped short' : 'The bridge was not locked');

  return { m, len: () => len, spans, locked, span, max };
}

// ---- 13. Matching Portal Doors (momentary step button!) ----

export const DOOR_BANNERS = ['#FF6B4A', '#FFC93C', '#46D6C2'] as const;

export interface DoorsHandle {
  m?: SimMachine;
  idx: () => number;
  match: () => boolean;
  openFrac: () => number;
  stepBanner: () => void;
}

export function createDoors(opts: {
  id: string;
  road: SimRoad;
  at: [number, number];
  atZ?: number;
  to: SimRoad;
  toS?: number;
  want: number;
  banners?: readonly string[];
  fixed?: boolean;
  key?: FaceKey;
  btn?: [number, number];
  text?: string;
}): DoorsHandle {
  const banners = opts.banners ?? DOOR_BANNERS;
  let i = opts.fixed ? opts.want : 0;
  let open = opts.fixed ? 1 : 0;
  const match = () => i === opts.want;
  const capW = V(opts.at[0] + (opts.btn?.[0] ?? 0), opts.at[1] + (opts.btn?.[1] ?? 1.3), (opts.atZ ?? 0) + 0.08);
  let pendingEmit: EmitFn = () => {};

  const stepBanner = () => {
    if (opts.fixed) return;
    i = (i + 1) % banners.length;
    pendingEmit({ kind: match() ? 'doorMatch' : 'bannerStep', pos: capW });
  };

  let m: SimMachine | undefined;
  if (!opts.fixed) {
    m = {
      id: opts.id,
      kind: 'doors',
      mode: 'step',
      key: opts.key ?? 'a',
      name: 'Banner',
      on: false,
      value: i,
      progress: match() ? 1 : 0,
      ready: match(),
      status: match() ? 'Matched' : `Banner ${i + 1}/${banners.length}`,
      load: 0,
      capPos: capW,
      capNormal: [0, 1, 0],
      size: 0.45,
      press() { stepBanner(); },
      tick(dt, _drive, _bike, _tun, emit) {
        pendingEmit = emit;
        open += ((match() ? 1 : 0) - open) * Math.min(1, dt * 3.5);
        m!.value = i;
        m!.progress = open;
        m!.ready = match();
        m!.status = match() ? 'Matched!' : `Banner ${i + 1}/${banners.length}`;
        m!.on = false;
        return 0;
      },
      extra: () => ({ i, want: opts.want, open, match: match() }),
    };
  }

  opts.road.forks.push({
    s: sAt(opts.road, [opts.at[0], opts.at[1], opts.atZ ?? 0]),
    dir: 1,
    to: opts.to,
    toS: opts.toS ?? 0.05,
    toDir: 1,
    when: match,
    text: opts.text ?? 'Through the matching doorway',
  });

  return { m, idx: () => i, match, openFrac: () => open, stepBanner };
}

// ---- 14. Reflection Pool ----

export interface PoolHandle {
  m: SimMachine;
  wind: () => number;
  still: () => boolean;
  ruffled: () => boolean;
  calmRpm: number;
}

export function createPool(opts: { id: string; calm?: number }): PoolHandle {
  const calm = opts.calm ?? 74;
  let wind = 0;
  let lastState: 'still' | 'mid' | 'ruffled' = 'still';

  const m: SimMachine = {
    id: opts.id,
    kind: 'pool',
    mode: 'passive',
    name: 'Pool',
    on: false,
    value: 0,
    progress: 0,
    ready: true,
    status: 'Still',
    load: 0,
    capPos: [0, 0, 0],
    capNormal: [0, 1, 0],
    size: 0.4,
    tick(dt, _drive, bike, _tun, emit) {
      const target = clamp((bike.cadence - calm) / 10, 0, 1);
      wind += (target - wind) * Math.min(1, dt * 2.5);
      const cur = wind < 0.15 ? 'still' : wind > 0.8 ? 'ruffled' : 'mid';
      if (cur !== lastState && cur !== 'mid') {
        lastState = cur;
        emit({ kind: 'latch', pitch: cur === 'still' ? 1.15 : 0.78 });
      }
      m.value = wind;
      m.progress = wind;
      m.ready = cur !== 'mid';
      m.status = cur === 'still' ? 'Still' : cur === 'ruffled' ? 'Ruffled' : 'Stirring';
      return 0;
    },
    extra: () => ({ wind, calm, still: wind < 0.15, ruffled: wind > 0.8 }),
  };

  return { m, wind: () => wind, still: () => wind < 0.15, ruffled: () => wind > 0.8, calmRpm: calm };
}

// ---- 15. Gravity Seam (instant toggle switch) ----

export function createSeam(opts: { id: string; key?: FaceKey; at: Vec3; name?: string }): SimMachine {
  const capW = V(opts.at[0], opts.at[1], opts.at[2] + 0.08);
  let pendingEmit: EmitFn = () => {};
  const m: SimMachine = {
    id: opts.id,
    kind: 'seam',
    mode: 'switch',
    key: opts.key ?? 'b',
    name: opts.name ?? 'Seam',
    on: false,
    value: 0,
    progress: 0,
    ready: false,
    status: 'Dark',
    load: 0,
    capPos: capW,
    capNormal: [0, 1, 0],
    size: 0.45,
    press() {
      m.on = !m.on;
      pendingEmit({ kind: 'seamToggle', pos: capW, pitch: m.on ? 1.2 : 0.85 });
    },
    tick(_dt, _drive, _bike, _tun, emit) {
      pendingEmit = emit;
      m.value = m.on ? 1 : 0;
      m.progress = m.on ? 1 : 0;
      m.ready = m.on;
      m.status = m.on ? 'Lit' : 'Dark';
      return 0;
    },
  };
  return m;
}

// ---- 16. Wall Machines (for The Cube & wall puzzles) ----

function aimInWallQuat(F: WallFrame, deg: number): Quat {
  const a = deg * DEG;
  const d = v3Norm(V(F.u[0] * Math.cos(a), F.u[1] * Math.cos(a), Math.sin(a)));
  const n = v3Norm(V(F.n[0], F.n[1], F.n[2]));
  const u = v3Norm(V(F.u[0], F.u[1], F.u[2]));
  const q1 = quatFromAxisAngle(n, a);
  const m1 = matFromPosQuat([0, 0, 0], q1);
  const ru: Vec3 = [
    m1[0] * u[0] + m1[4] * u[1] + m1[8] * u[2],
    m1[1] * u[0] + m1[5] * u[1] + m1[9] * u[2],
    m1[2] * u[0] + m1[6] * u[1] + m1[10] * u[2],
  ];
  return v3Dot(ru, d) >= 0.99 ? q1 : quatFromAxisAngle(n, -a);
}

export interface WallArmHandle {
  m: SimMachine;
  road: SimRoad;
  ang: () => number;
  at: (deg: number) => boolean;
  driveTo: (deg: number | null) => void;
  armMat: () => Mat4;
  groupId: string;
}

export function createWallArm(opts: {
  id: string;
  F: WallFrame;
  parentMat: () => Mat4;
  pivot: [number, number];
  len: number;
  stops: [number, number];
  start?: number;
  key: FaceKey;
  name: string;
  at?: [number, number];
  off?: number;
  block?: number;
  /** True for hard-push beam (uses FTP-relative effort OR ERG surge!). */
  hardPush?: boolean;
  edgeText?: string;
}): WallArmHandle {
  const F = opts.F, off = opts.off ?? 0.008;
  const root = F.at(opts.pivot[0], opts.pivot[1], off);
  const rootW = V(root[0], root[1], root[2]);
  const start = opts.start ?? opts.stops[0];
  const stepper = makeDetentStepper(opts.stops, start, 34, false);
  const groupId = `g_${opts.id}`;

  const bs = opts.block;
  const BR = 0.08;
  const pts = bs
    ? ftur([0, 0, 0], F.u, F.n).fwd(opts.len).curl(BR, -90).fwd(bs / 2 - BR).pts
    : L3([0, 0, 0], [F.u[0] * opts.len, F.u[1] * opts.len, F.u[2] * opts.len], F.n);

  const armMat = (): Mat4 => matMul(opts.parentMat(), matFromPosQuat(rootW, aimInWallQuat(F, stepper.ang)));
  const road = new SimRoad(pts, { id: `${opts.id}_road`, transform: armMat, groupId, th: 0.12, edgeText: opts.edgeText });

  const bl = opts.at ? F.at(opts.at[0], opts.at[1], 0.06) : [root[0] + F.n[0] * 0.06, root[1] + F.n[1] * 0.06, root[2] + F.n[2] * 0.06] as Vec3;
  const blW = V(bl[0], bl[1], bl[2]);
  const nW = v3Norm(V(F.n[0], F.n[1], F.n[2]));
  let pendingEmit: EmitFn = () => {};

  const lo = Math.min(...opts.stops), hi = Math.max(...opts.stops);
  const m: SimMachine = {
    id: opts.id,
    kind: 'wallArm',
    mode: 'autoLatch',
    key: opts.key,
    name: opts.name,
    on: false,
    value: start,
    progress: (start - lo) / Math.max(1, hi - lo),
    ready: true,
    status: `${Math.round(start)}°`,
    load: 0,
    capPos: blW,
    capNormal: nW,
    size: 0.5,
    transform: armMat,
    press(dirHint) { stepper.onPress(m, dirHint ?? 0, true, pendingEmit); },
    tick(dt, drive, bike, tun, emit) {
      pendingEmit = emit;
      // Update world-space cap position when cube rotates/sinks
      const pm = opts.parentMat();
      m.capPos = [
        pm[0] * blW[0] + pm[4] * blW[1] + pm[8] * blW[2] + pm[12],
        pm[1] * blW[0] + pm[5] * blW[1] + pm[9] * blW[2] + pm[13],
        pm[2] * blW[0] + pm[6] * blW[1] + pm[10] * blW[2] + pm[14],
      ];
      m.capNormal = v3Norm([
        pm[0] * nW[0] + pm[4] * nW[1] + pm[8] * nW[2],
        pm[1] * nW[0] + pm[5] * nW[1] + pm[9] * nW[2],
        pm[2] * nW[0] + pm[6] * nW[1] + pm[10] * nW[2],
      ]);
      const canPush = !opts.hardPush
        || bike.ftpFraction >= tun.beamPushFtp
        || (bike.ergMode && bike.cadence >= tun.surgeRpm)
        || bike.cadence >= tun.surgeRpm;
      const effDrive = canPush ? drive : 0;
      const ld = stepper.step(m, dt, effDrive, tun, emit, opts.hardPush ? 0.95 : 0.45);
      m.value = stepper.ang;
      m.progress = clamp((stepper.ang - lo) / Math.max(1, hi - lo), 0, 1);
      m.ready = stepper.atAnyDetent();
      m.status = opts.hardPush && m.on && !canPush ? 'Push harder!' : m.on ? 'Moving' : `${Math.round(stepper.ang)}°`;
      m.load = m.on && drive > 0 ? (opts.hardPush ? (canPush ? 0.95 : 0.55) : ld) : 0;
      return m.load;
    },
    extra: () => {
      const uW = v3Norm(V(F.u[0], F.u[1], F.u[2]));
      return {
        ang: stepper.ang,
        len: opts.len,
        block: bs ?? 0,
        nx: nW[0], ny: nW[1], nz: nW[2],
        ux: uW[0], uy: uW[1], uz: uW[2],
      };
    },
  };

  return { m, road, ang: () => stepper.ang, at: (d) => stepper.at(d), driveTo: (d) => stepper.driveTo(m, d), armMat, groupId };
}

export interface AwningHandle {
  m: SimMachine;
  ang: () => number;
  out: () => boolean;
  occluder: OccluderBox;
  driveTo: (deg: number | null) => void;
  groupId: string;
}

export function createAwning(opts: {
  id: string;
  F: WallFrame;
  parentMat: () => Mat4;
  u0: number;
  u1: number;
  z: number;
  depth: number;
  key: FaceKey;
  name?: string;
  at?: [number, number];
}): AwningHandle {
  const F = opts.F;
  const hinge = F.at((opts.u0 + opts.u1) / 2, opts.z, 0.02);
  const hingeW = V(hinge[0], hinge[1], hinge[2]);
  const w = opts.u1 - opts.u0, d = opts.depth;
  const bx = v3Norm(V(F.u[0], F.u[1], F.u[2]));
  const by: Vec3 = [0, 1, 0];
  const bz = v3Norm(V(F.n[0], F.n[1], F.n[2]));
  const qFold = quatFromUnitVectors(bz, by);
  const stepper = makeDetentStepper([0, 90], 90, 36, false);
  const groupId = `g_${opts.id}`;

  // Basis transform aligning local X=u, Y=up, Z=n (right-handed)
  const cross = [by[1] * bz[2] - by[2] * bz[1], by[2] * bz[0] - by[0] * bz[2], by[0] * bz[1] - by[1] * bz[0]] as Vec3;
  const xBasis: Vec3 = v3Dot(cross, bx) < 0 ? [-bx[0], -bx[1], -bx[2]] : bx;
  const basisMat: Mat4 = [
    xBasis[0], xBasis[1], xBasis[2], 0,
    by[0], by[1], by[2], 0,
    bz[0], bz[1], bz[2], 0,
    0, 0, 0, 1,
  ];

  const getMat = (): Mat4 => {
    const q = quatSlerp(quatIdentity(), qFold, stepper.ang / 90);
    return matMul(opts.parentMat(), matFromPosQuat(hingeW, q));
  };
  const occluder: OccluderBox = {
    min: [-w / 2, -0.04, 0],
    max: [w / 2, 0.04, d],
    transform: () => matMul(getMat(), basisMat),
  };

  const bl = F.at(...(opts.at ?? [opts.u1 + 0.6, opts.z + 0.2]), 0.06);
  const blW = V(bl[0], bl[1], bl[2]);
  const nW = bz;
  let pendingEmit: EmitFn = () => {};

  const m: SimMachine = {
    id: opts.id,
    kind: 'awning',
    mode: 'autoLatch',
    key: opts.key,
    name: opts.name ?? 'Awning',
    on: false,
    value: 90,
    progress: 0,
    ready: false,
    status: 'Folded',
    load: 0,
    capPos: blW,
    capNormal: nW,
    size: 0.5,
    transform: () => matMul(getMat(), basisMat),
    press(dirHint) { stepper.onPress(m, dirHint ?? 0, true, pendingEmit); },
    tick(dt, drive, _bike, tun, emit) {
      pendingEmit = emit;
      const pm = opts.parentMat();
      m.capPos = [
        pm[0] * blW[0] + pm[4] * blW[1] + pm[8] * blW[2] + pm[12],
        pm[1] * blW[0] + pm[5] * blW[1] + pm[9] * blW[2] + pm[13],
        pm[2] * blW[0] + pm[6] * blW[1] + pm[10] * blW[2] + pm[14],
      ];
      m.capNormal = v3Norm([
        pm[0] * nW[0] + pm[4] * nW[1] + pm[8] * nW[2],
        pm[1] * nW[0] + pm[5] * nW[1] + pm[9] * nW[2],
        pm[2] * nW[0] + pm[6] * nW[1] + pm[10] * nW[2],
      ]);
      const ld = stepper.step(m, dt, drive, tun, emit, 0.42);
      m.value = stepper.ang;
      m.progress = clamp(1 - stepper.ang / 90, 0, 1);
      m.ready = stepper.ang < 0.5;
      m.status = stepper.ang < 0.5 ? 'Out' : stepper.ang > 89.5 ? 'Folded' : 'Moving';
      m.load = ld;
      return ld;
    },
    extra: () => ({ ang: stepper.ang, w, d }),
  };

  return { m, ang: () => stepper.ang, out: () => stepper.ang < 0.5, occluder, driveTo: (dg) => stepper.driveTo(m, dg), groupId };
}

export interface WallLiftHandle {
  m: SimMachine;
  loop: SimRoad;
  z: () => number;
  moving: () => boolean;
  groupId: string;
}

export function createWallLift(opts: {
  id: string;
  F: WallFrame;
  parentMat: () => Mat4;
  u: [number, number];
  h: number;
  lo: number;
  hi: number;
}): WallLiftHandle {
  let lvl = 0;
  let z = opts.lo;
  let moving = false;
  const groupId = `g_${opts.id}`;
  const getMat = (): Mat4 => matMul(opts.parentMat(), matFromPosQuat([0, z, 0]));
  const loop = new SimRoad(wallLoopPts(opts.F, opts.u[0], opts.u[1], 0, opts.h, 0.4, 0.02), {
    id: `${opts.id}_loop`,
    closed: true,
    transform: getMat,
    groupId,
  });

  const m: SimMachine = {
    id: opts.id,
    kind: 'wallLift',
    mode: 'passive',
    name: 'Wall lift',
    on: false,
    value: opts.lo,
    progress: 0,
    ready: true,
    status: 'Low',
    load: 0,
    capPos: [0, 0, 0],
    capNormal: [0, 1, 0],
    size: 0.4,
    transform: getMat,
    tick(dt, _drive, bike) {
      const target = clamp((bike.cadence - 55) / 30, 0, 1);
      const prev = lvl;
      lvl += clamp(target - lvl, -0.7 * dt, 0.7 * dt);
      moving = Math.abs(lvl - prev) > 1e-4;
      let zz = opts.lo + (opts.hi - opts.lo) * lvl;
      if (Math.abs(zz - opts.hi) < 0.06) zz = opts.hi;
      if (Math.abs(zz - opts.lo) < 0.06) zz = opts.lo;
      z = zz;
      m.value = z;
      m.progress = clamp(lvl, 0, 1);
      m.ready = z === opts.hi || z === opts.lo;
      m.status = z === opts.hi ? 'Top' : z === opts.lo ? 'Bottom' : 'Moving';
      return moving ? 0.15 : 0;
    },
    extra: () => {
      const uW = v3Norm(V(opts.F.u[0], opts.F.u[1], opts.F.u[2]));
      const nW = v3Norm(V(opts.F.n[0], opts.F.n[1], opts.F.n[2]));
      const cSk = opts.F.at((opts.u[0] + opts.u[1]) / 2, opts.h / 2, -0.01);
      const cW = V(cSk[0], cSk[1], cSk[2]);
      const r0Sk = opts.F.at(opts.u[0] - 0.35, (opts.lo + opts.hi + opts.h) / 2, 0.02);
      const r1Sk = opts.F.at(opts.u[1] + 0.35, (opts.lo + opts.hi + opts.h) / 2, 0.02);
      const r0W = V(r0Sk[0], r0Sk[1], r0Sk[2]);
      const r1W = V(r1Sk[0], r1Sk[1], r1Sk[2]);
      return {
        z, lo: opts.lo, hi: opts.hi, h: opts.h, w: opts.u[1] - opts.u[0],
        cx: cW[0], cy: cW[1], cz: cW[2],
        r0x: r0W[0], r0y: r0W[1], r0z: r0W[2],
        r1x: r1W[0], r1y: r1W[1], r1z: r1W[2],
        ux: uW[0], uy: uW[1], uz: uW[2],
        nx: nW[0], ny: nW[1], nz: nW[2],
      };
    },
  };

  return { m, loop, z: () => z, moving: () => moving, groupId };
}

// ---- 17. Hidden-Gap / Live-Gap Occlusion Helper ----

export function addLiveGap(
  A: SimRoad, kA: 0 | 1, B: SimRoad, kB: 0 | 1,
  getOccluders: () => readonly OccluderBox[],
  getViewDirD: () => Vec3,
  opts: { text?: string; edge?: string } = {},
): { hidden: () => boolean; a: () => Vec3; b: () => Vec3 } {
  const hidden = () => isGapHidden(A.end(kA).p, B.end(kB).p, getOccluders(), getViewDirD());
  const text = opts.text ?? 'Hidden behind cover, so the hole was not there';
  A.gaps.push({ k: kA, to: B, toK: kB, when: hidden, text, kind: 'hidden' });
  B.gaps.push({ k: kB, to: A, toK: kA, when: hidden, text, kind: 'hidden' });
  A.edgeText = B.edgeText = opts.edge ?? 'The hole was in plain sight';
  return { hidden, a: () => A.end(kA).p, b: () => B.end(kB).p };
}
