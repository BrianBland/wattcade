/**
 * Pure strict-TypeScript implementation of "The Cube" (`x-cube`):
 * 6 puzzles wrapped round a two-storey rotating tower with per-wall checkpoints,
 * live wall-specific HUD targets, FTP/ERG parity on the wall-4 hard-push beam,
 * and OBB occlusion for the awning and sail bridge.
 */

import {
  clamp, DEG, makeIsoBasis, matFromPosRotY, matMul, UP_SKETCH, V, v3Dot, v3Norm,
  type Mat4, type OccluderBox, type Vec3,
} from './math';
import { ftur, L3, sAt, samplePolylineLen, SimRoad, wallFrame, wallLoopPts, type FrameTurtle, type WallFrame } from './road';
import { addLiveGap, createAwning, createWallArm, createWallLift } from './machines';
import type { BuiltSimLevel, SimLevelDef, SimMachine, VisualProp } from './types';

export const CUBE_H = 3;
export const CUBE_Z = 12;
export const CUBE_CR = 0.6;
export const CUBE_STOREY = 6.2;
const EDGE_U = CUBE_H + 0.02 - CUBE_CR;

const WALLS: ReadonlyArray<{ n: Vec3; u: Vec3 }> = [
  { n: [1, 0, 0], u: [0, -1, 0] },
  { n: [0, -1, 0], u: [-1, 0, 0] },
  { n: [-1, 0, 0], u: [0, 1, 0] },
  { n: [0, 1, 0], u: [1, 0, 0] },
];

const addV = (a: Vec3, b: Vec3, k = 1): Vec3 => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
const tuck = (pts: ReadonlyArray<{ p: Vec3; n: Vec3 }>) =>
  pts.map((q) => ({ p: [q.p[0] - q.n[0] * 0.012, q.p[1] - q.n[1] * 0.012, q.p[2] - q.n[2] * 0.012] as Vec3, n: q.n }));

function roundEdge(t: FrameTurtle, F: readonly WallFrame[], k: number, uTo: number): number {
  const uc = v3Dot(t.st.p, F[k].u);
  t.fwd(EDGE_U - uc);
  const sEdge = samplePolylineLen(t.pts) + CUBE_CR * Math.PI / 4;
  t.curl(CUBE_CR, -90);
  t.fwd(uTo + EDGE_U);
  return sEdge;
}

function cornerPts(F: readonly WallFrame[], k: number, u: number, z: number, uTo: number) {
  const t = ftur(F[k].at(u, z, 0.02), F[k].u, F[k].n);
  const sEdge = roundEdge(t, F, k, uTo);
  return { pts: t.pts, sEdge };
}

const WALL_NUDGES = [
  'Wall 1: Swing the wall turntable (Y) level so the loop leads round the corner.',
  'Wall 2: Swing the awning out (A) to hide the hole in the road ahead.',
  'Wall 3: Spin up (~85 rpm) to lift the deck to your loop, ride on, then ease off (~55 rpm) to descend.',
  'Wall 4: Clutch the beam (B) and push hard (Z4+ or surge) to stand it up to the second storey.',
  'Wall 5 (Upstairs): Stand the sail bridge (Y) up to climb to the top loop, then lay it flat so its sail hides the hole on the way down.',
  'Wall 6 (Finale): Stand the tall arm (A) up — from here its tip meets the road on the roof.',
];

export function makeCubeLevelDef(chapter: string, chapterIndex: number): SimLevelDef {
  return {
    id: 'x-cube',
    item: 'x-cube',
    name: 'The Cube',
    chapter,
    chapterIndex,
    theme: 'cube',
    yaws: [0],
    cruise: [70, 92],
    hints: {
      nudge: WALL_NUDGES[0],
      explain: WALL_NUDGES.join(' '),
    },
    center: [0, 0, 3.4],
    pts: [[3, -3, 0], [3, 3, 0], [-3, 3, 0], [-3, -3, 0], [3, -3, 8.4], [-3, 3, 6.2], [3, 3, 8.4], [0, 0, -3]],
    pad: 0.9,
    scenery: false,
    ambient: true,
    build: () => buildCubeLevel(),
  };
}

function buildCubeLevel(): BuiltSimLevel {
  const h = CUBE_H, H = CUBE_Z;
  const F = WALLS.map((w) => wallFrame([w.n[0] * h, w.n[1] * h, 0], w.n, w.u));

  const turn = { k: 0, from: 0, to: 0, t: 1 };
  let cubeRotY = 0;
  let up = false;
  let sink = 0;

  const cubeMat = (): Mat4 => matFromPosRotY([0, -sink, 0], cubeRotY);
  const roads: SimRoad[] = [];
  const machines: SimMachine[] = [];
  const visuals: VisualProp[] = [{ kind: 'cubeVisual', h, H, cr: CUBE_CR, storey: CUBE_STOREY }];

  const addRoad = (id: string, pts: ReadonlyArray<{ p: Vec3; n: Vec3 }>, o: { closed?: boolean; goal?: boolean; edgeText?: string; groupId?: string } = {}) => {
    const r = new SimRoad(o.closed || o.goal ? pts : tuck(pts), {
      id, closed: o.closed, goal: o.goal, edgeText: o.edgeText,
      transform: cubeMat, groupId: o.groupId ?? 'cube_body', th: 0.14,
    });
    roads.push(r);
    return r;
  };

  const getViewD = () => makeIsoBasis([0, 0, 0], 0, 0).D;

  /* ---- Lower Storey ---- */
  // Wall 0: wall turntable
  const L0 = addRoad('cube_L0', wallLoopPts(F[0], -2.2, 0.6, 1.0, 2.8, 0.45, 0.02), { closed: true });
  const disc = createWallArm({
    id: 'cube_disc', F: F[0], parentMat: cubeMat, pivot: [0.6, 1.9], len: 1.2,
    stops: [0, 90], start: 90, at: [1.6, 3.4], key: 'y', name: 'Wall turntable',
    edgeText: 'The arm pointed up into the air',
  });
  roads.push(disc.road); machines.push(disc.m);
  L0.forks.push({ s: sAt(L0, F[0].at(0.6, 1.9, 0.02)), dir: 1, to: disc.road, toK: 0, when: () => disc.at(0), text: 'Arm level — heading round the corner' });
  const c0 = cornerPts(F, 0, 1.8, 1.9, -1.2);
  const E0 = addRoad('cube_E0', c0.pts);

  // Wall 1: awning hiding hole
  const L1 = addRoad('cube_L1', wallLoopPts(F[1], -1.8, 0.4, 1.9, 3.5, 0.45, 0.02), { closed: true });
  E0.joins.push({ k: 1, to: L1, s: sAt(L1, F[1].at(-1.2, 1.9, 0.02)) + 0.02, dir: 1 });
  const x1 = ftur(F[1].at(0.4, 2.4, 0.02), UP_SKETCH, F[1].n).fwd(1.6).turn(0.5, 90).fwd(0.6);
  const X1 = addRoad('cube_X1', x1.pts);
  const c1 = cornerPts(F, 1, 2.0, 4.5, -0.9);
  const E1 = addRoad('cube_E1', c1.pts);
  const aw = createAwning({ id: 'cube_aw', F: F[1], parentMat: cubeMat, u0: 0.5, u1: 2.4, z: 4.95, depth: 1.0, key: 'a', name: 'Awning', at: [-1.0, 4.6] });
  machines.push(aw.m);
  const hole1 = addLiveGap(X1, 1, E1, 0, () => [aw.occluder], getViewD, { text: 'Behind the awning — hole vanished' });
  L1.forks.push({ s: sAt(L1, F[1].at(0.4, 2.4, 0.02)), dir: 1, to: X1, toK: 0, when: () => hole1.hidden(), text: 'Road ahead looks whole' });

  // Wall 2: cadence wall lift
  const L2 = addRoad('cube_L2', wallLoopPts(F[2], -1.8, -0.2, 4.5, 5.6, 0.4, 0.02), { closed: true });
  E1.joins.push({ k: 1, to: L2, s: sAt(L2, F[2].at(-0.9, 4.5, 0.02)) + 0.02, dir: 1 });
  const lift = createWallLift({ id: 'cube_lift', F: F[2], parentMat: cubeMat, u: [0.5, 1.9], h: 1.0, lo: 3.38, hi: 4.5 });
  roads.push(lift.loop); machines.push(lift.m);
  const C2 = addRoad('cube_C2', L3(F[2].at(-0.9, 4.5, 0.02), F[2].at(1.2, 4.5, 0.02), F[2].n), { edgeText: 'The lift deck was not aligned' });
  L2.forks.push({ s: sAt(L2, F[2].at(-0.9, 4.5, 0.02)), dir: 1, to: C2, toK: 0, when: () => lift.z() === 4.5 && !lift.moving(), text: 'Deck aligned with loop' });
  C2.forks.push({ s: C2.L - 0.06, dir: 1, to: lift.loop, toK: 0, when: () => lift.z() === 4.5, text: 'Onto the lift deck' });
  const c2 = cornerPts(F, 2, 1.6, 3.38, -1.65);
  const E2 = addRoad('cube_E2', c2.pts);
  lift.loop.forks.push({ s: sAt(lift.loop, F[2].at(1.6, 0, 0.02)), dir: 1, to: E2, toK: 0, when: () => lift.z() === 3.38, text: 'Deck lowered to exit' });

  // Wall 3: hard-push beam up to second storey
  const L3w = addRoad('cube_L3', wallLoopPts(F[3], -2.2, 0.4, 1.58, 3.38, 0.5, 0.02, true), { closed: true });
  E2.joins.push({ k: 1, to: L3w, s: sAt(L3w, F[3].at(-1.65, 3.38, 0.02)) + 0.02, dir: 1 });
  const beam = createWallArm({
    id: 'cube_beam', F: F[3], parentMat: cubeMat, pivot: [-1.2, 3.38], len: 4.8,
    stops: [75, 105], start: 105, at: [1.5, 1.1], key: 'b', name: 'Beam (push hard)',
    hardPush: true, edgeText: 'The beam leaned away',
  });
  roads.push(beam.road); machines.push(beam.m);
  L3w.forks.push({ s: sAt(L3w, F[3].at(-1.2, 3.38, 0.02)), dir: 1, to: beam.road, toK: 0, when: () => beam.at(75), text: 'Climbing to the second storey' });

  /* ---- Upper Storey ---- */
  const a75 = 75 * DEG;
  const tip3 = F[3].at(-1.2 + 4.8 * Math.cos(a75), 3.38 + 4.8 * Math.sin(a75), 0.02);
  const t3 = ftur(tip3, addV([F[3].u[0] * Math.cos(a75), F[3].u[1] * Math.cos(a75), F[3].u[2] * Math.cos(a75)], UP_SKETCH, Math.sin(a75)), F[3].n).turn(0.6, 75);
  const zA = t3.st.p[2];
  const s3 = roundEdge(t3, F, 3, -1.55);
  const U3 = addRoad('cube_U3', t3.pts, { groupId: 'cube_upper' });

  // Wall 4 (upstairs wall 0): sail bridge (climb up, then lay flat to hide hole)
  const A0 = addRoad('cube_A0', wallLoopPts(F[0], -2.2, -0.9, zA, zA + 1.2, 0.35, 0.02), { closed: true, groupId: 'cube_upper' });
  U3.joins.push({ k: 1, to: A0, s: sAt(A0, F[0].at(-1.55, zA, 0.02)) + 0.02, dir: 1 });
  const pz = zA + 0.85;
  const sail = createWallArm({
    id: 'cube_sail', F: F[0], parentMat: cubeMat, pivot: [-0.9, pz], len: 1.7,
    stops: [0, 90], start: 0, at: [-1.55, zA + 0.6], key: 'y', name: 'Sail bridge',
    edgeText: 'The bridge dropped beneath the wheel',
  });
  roads.push(sail.road); machines.push(sail.m);
  A0.forks.push({ s: sAt(A0, F[0].at(-0.9, pz, 0.02)), dir: 1, to: sail.road, toK: 0, when: () => sail.at(90), text: 'Riding up the sail bridge' });

  // Sail plate OBB attached to sail arm
  const bxS = v3Norm(V(F[0].u[0], F[0].u[1], F[0].u[2]));
  const byS: Vec3 = [0, 1, 0];
  const bzS = v3Norm(V(F[0].n[0], F[0].n[1], F[0].n[2]));
  const crossS: Vec3 = [byS[1] * bzS[2] - byS[2] * bzS[1], byS[2] * bzS[0] - byS[0] * bzS[2], byS[0] * bzS[1] - byS[1] * bzS[0]];
  const xBS: Vec3 = v3Dot(crossS, bxS) < 0 ? [-bxS[0], -bxS[1], -bxS[2]] : bxS;
  const scLocal = V(F[0].u[0] * 0.85 + F[0].n[0] * 0.475, F[0].u[1] * 0.85 + F[0].n[1] * 0.475, -0.3 + F[0].n[2] * 0.475);
  const sailPlateMat: Mat4 = [
    xBS[0], xBS[1], xBS[2], 0,
    byS[0], byS[1], byS[2], 0,
    bzS[0], bzS[1], bzS[2], 0,
    scLocal[0], scLocal[1], scLocal[2], 1,
  ];
  const sailOcc: OccluderBox = {
    min: [-0.65, -0.03, -0.475],
    max: [0.65, 0.03, 0.475],
    transform: () => matMul(sail.armMat(), sailPlateMat),
  };

  const tq = ftur(F[0].at(-0.9, pz + 1.7, 0.02), UP_SKETCH, F[0].n).turn(0.3, 90).fwd(1.1);
  const T0 = addRoad('cube_T0', tq.pts, { groupId: 'cube_upper' });
  const qt = pz + 2.0;
  const Q0 = addRoad('cube_Q0', wallLoopPts(F[0], 0.2, 1.9, qt - 1.2, qt, 0.35, 0.02, true), { closed: true, groupId: 'cube_upper' });
  T0.joins.push({ k: 1, to: Q0, s: sAt(Q0, F[0].at(0.6, qt, 0.02)) + 0.02, dir: 1 });

  const xz = qt - 0.6, hz = pz - 1.0;
  const xa = ftur(F[0].at(1.9, xz, 0.02), [0, 0, -1], F[0].n).fwd(xz - hz - 0.3).turn(0.3, 90).fwd(0.5);
  const Xa = addRoad('cube_Xa', xa.pts, { groupId: 'cube_upper' });
  const xb = ftur(F[0].at(0.7, hz, 0.02), [-F[0].u[0], -F[0].u[1], -F[0].u[2]], F[0].n).fwd(0.35).turn(0.3, -90).fwd(0.3).turn(0.3, -90);
  const s4 = roundEdge(xb, F, 0, -1.55);
  const Xb = addRoad('cube_Xb', xb.pts, { groupId: 'cube_upper' });
  const zB = xb.st.p[2];
  const hole4 = addLiveGap(Xa, 1, Xb, 0, () => [sailOcc], getViewD, { text: 'Under the sail — hole vanished', edge: 'The hole was in plain sight' });
  Q0.forks.push({ s: sAt(Q0, F[0].at(1.9, xz, 0.02)), dir: 1, to: Xa, toK: 0, when: () => hole4.hidden(), text: 'Way down looks whole' });

  // Wall 5 (upstairs wall 1): tall arm meeting roof road
  const F1l = addRoad('cube_F1', wallLoopPts(F[1], -2.2, -0.7, zB, zB + 3.2, 0.45, 0.02), { closed: true, groupId: 'cube_upper' });
  Xb.joins.push({ k: 1, to: F1l, s: sAt(F1l, F[1].at(-1.55, zB, 0.02)) + 0.02, dir: 1 });
  const apz = zB + 3.2 - 0.45, alen = H + 1.0 - apz, BS = 0.8;
  const arm = createWallArm({
    id: 'cube_arm', F: F[1], parentMat: cubeMat, pivot: [-0.7, apz], len: alen, block: BS,
    stops: [0, 90], start: 0, at: [-1.45, zB + 0.9], key: 'a', name: 'Tall arm',
    edgeText: 'The arm led nowhere from here',
  });
  roads.push(arm.road); machines.push(arm.m);
  F1l.forks.push({ s: sAt(F1l, F[1].at(-0.7, apz, 0.02)), dir: 1, to: arm.road, toK: 0, when: () => arm.at(90), text: 'Climbing the tall arm to the roof' });

  // Roof road
  const KF = 5, sk = (KF * Math.PI) / 2, zt = apz + alen + 0.08;
  const pA = addV(F[1].at(-0.7, zt, 0.008), F[1].n, -BS / 2);
  const kOff = zt - (H + 0.16);
  const rotZ = (p: Vec3, a: number): Vec3 => [p[0] * Math.cos(a) - p[1] * Math.sin(a), p[0] * Math.sin(a) + p[1] * Math.cos(a), p[2]];
  const back = rotZ([1, 1, 1], -sk);
  const r0: Vec3 = [pA[0] - kOff * back[0], pA[1] - kOff * back[1], pA[2] - kOff * back[2]];
  const d0: Vec3 = [-F[1].n[0], -F[1].n[1], -F[1].n[2]];
  const left = d0[0] * -r0[1] - d0[1] * -r0[0] > 0;
  const rt = ftur(r0, d0, UP_SKETCH).fwd(0.8).turn(0.7, left ? 90 : -90).fwd(0.9);
  addRoad('cube_home', rt.pts, { goal: true, groupId: 'cube_upper' });

  // Machine liveness per active wall
  const machinesAt: SimMachine[][] = [[disc.m], [aw.m], [], [beam.m], [sail.m], [arm.m]];
  machinesAt.forEach((ms, k) => {
    for (const m of ms) m.live = () => turn.k === k && turn.t >= 1;
  });

  const edges: Array<[SimRoad, number]> = [[E0, c0.sEdge], [E1, c1.sEdge], [E2, c2.sEdge], [U3, s3], [Xb, s4]];

  return {
    roads,
    machines,
    keys: [],
    gates: [],
    occluders: [aw.occluder, sailOcc],
    visuals,
    spawn: () => ({ road: L0, s: 1, dir: 1 }),
    checkpoint() {
      const r = [null, L1, L2, L3w, A0, F1l][turn.k];
      if (turn.k === 3) up = false;
      return r ? { road: r, s: 0.5, dir: 1 } : null;
    },
    hiddenGaps: () => [
      { a: hole1.a(), b: hole1.b(), hidden: hole1.hidden() },
      { a: hole4.a(), b: hole4.b(), hidden: hole4.hidden() },
    ],
    cameraState: () => ({ yawDeg: 0, rollDeg: 0, cubeRotY, cubeSink: sink, wallIndex: turn.k }),
    onTick(dt, wheel, _bike, emit) {
      if (wheel.mode === 'road') {
        edges.forEach(([E, sE], i) => {
          if (wheel.road === E && wheel.s > sE - 0.4 && turn.k === i) {
            turn.k = i + 1;
            turn.from = cubeRotY;
            turn.to = -(i + 1) * (Math.PI / 2);
            turn.t = 0;
            emit({ kind: 'checkpoint', text: `Wall ${turn.k + 1} of 6` });
          }
        });
        if (wheel.road === beam.road || wheel.road === U3) up = true;
      }
      if (turn.t < 1) {
        turn.t = Math.min(1, turn.t + dt / 1.6);
        const e = turn.t < 0.5 ? 4 * turn.t ** 3 : 1 - Math.pow(-2 * turn.t + 2, 3) / 2;
        cubeRotY = turn.from + (turn.to - turn.from) * e;
      }
      const targetSink = up ? CUBE_STOREY : 0;
      if (sink !== targetSink) {
        sink += clamp(targetSink - sink, -dt * 2.2, dt * 2.2);
      }
    },
    hudTarget(wheel) {
      const k = turn.k;
      if (k === 2) {
        const onDeck = wheel.road === lift.loop;
        return {
          cadence: onDeck ? { min: 45, max: 60, label: 'Lower deck' } : { min: 82, max: 98, label: 'Raise deck' },
          hintNudge: WALL_NUDGES[2],
        };
      }
      if (k === 3 && !up) {
        return {
          zone: { min: 4, max: 5, label: 'Stand beam', source: 'power' },
          focusMachine: beam.m.id,
          hintNudge: WALL_NUDGES[3],
        };
      }
      const focus = [disc.m.id, aw.m.id, undefined, beam.m.id, sail.m.id, arm.m.id][k];
      return { focusMachine: focus, hintNudge: WALL_NUDGES[k] };
    },
    solve(wheel, out) {
      const k = turn.k;
      out.cad = 80; out.ftp = 0.8; out.gearScale = 1.0;
      disc.driveTo(k === 0 ? 0 : null);
      aw.driveTo(k === 1 ? 0 : null);
      if (k === 2) out.cad = wheel.road === lift.loop ? 50 : 90;
      beam.driveTo(k === 3 && !up ? 75 : null);
      if (k === 3 && !up) { out.cad = 95; out.ftp = 1.25; }
      const across = wheel.road === T0 || wheel.road === Q0 || wheel.road === Xa;
      sail.driveTo(k === 4 ? (across ? 0 : 90) : null);
      arm.driveTo(k === 5 ? 90 : null);
    },
  };
}
