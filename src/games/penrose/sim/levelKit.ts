/**
 * Pure strict-TypeScript helpers shared by hand-built Penrose levels:
 * studyKit (arms, pockets, keys, homeGate), doorStation, and skyRoad visual helper.
 */

import { DEG, UP_SKETCH, V, type Vec3 } from './math';
import { filletPath, L3, sAt, SimRoad, turtle } from './road';
import { createTurntable, type TurntableHandle } from './machines';
import type { FaceKey, SimGate, SimKey, SimMachine, VisualProp } from './types';

export interface StudyKit {
  keys: SimKey[];
  gates: SimGate[];
  arm(id: string, a: Vec3, b: Vec3): SimRoad;
  pocket(id: string, x: number, y: number, hDeg: number, z?: number, hasKey?: boolean): { road: SimRoad; key?: SimKey };
  homeGate(id: string, r: SimRoad, sg: 1 | -1): SimRoad;
}

export function createStudyKit(roads: SimRoad[], visuals: VisualProp[]): StudyKit {
  const keys: SimKey[] = [];
  const gates: SimGate[] = [];

  const post = (x: number, y: number, z: number) =>
    visuals.push({ kind: 'cyl', x, y, r: 0.14, z0: Math.min(-2.4, z - 2.4), z1: z - 0.25, pal: 'deck', seg: 10 });
  const pier = (x: number, y: number, z: number) =>
    visuals.push({ kind: 'cyl', x, y, r: 0.5, z0: Math.min(-2.6, z - 2.6), z1: z - 0.3, pal: 'stone', seg: 20 });

  return {
    keys,
    gates,
    arm(id, a, b) {
      const r = new SimRoad(L3(a, b, UP_SKETCH), { id });
      roads.push(r);
      const n = Math.floor(Math.hypot(b[0] - a[0], b[1] - a[1]) / 3);
      for (let i = 1; i <= n; i++) {
        const f = i / (n + 1);
        post(a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2]);
      }
      return r;
    },
    pocket(id, x, y, hDeg, z = 0, hasKey = false) {
      const td = turtle(x, y, hDeg, z).fwd(0.3).teardrop(1.1).fwd(0.3);
      const road = new SimRoad(td.pts, { id });
      roads.push(road);
      const hr = hDeg * DEG;
      pier(x + 2.5 * Math.cos(hr), y + 2.5 * Math.sin(hr), z);
      let key: SimKey | undefined;
      if (hasKey) {
        const p = road.at((60 + 150) * DEG * 1.1 + 0.6).p;
        key = { id: `key_${id}`, pos: p, got: false, anim: 0 };
        keys.push(key);
      }
      return { road, key };
    },
    homeGate(id, r, sg) {
      const sG = r.L - 1.6;
      const f = r.at(sG);
      const h = Math.atan2(f.d[2], f.d[0]) / DEG + 180;
      const gt = new SimRoad(turtle(f.p[0], f.p[2], h, f.p[1]).arc(2.5, sg * 90).fwd(2.4).pts, { id, goal: true });
      roads.push(gt);
      const e = gt.localS[gt.localS.length - 1].p;
      visuals.push({ kind: 'cyl', x: e[0], y: e[2], r: 0.45, z0: Math.min(-2.6, e[1] - 2.4), z1: e[1] - 0.3, pal: 'stone', seg: 20 });
      r.forks.push({
        s: sG,
        dir: -1,
        to: gt,
        toK: 0,
        when: () => keys.every((k) => k.got),
        text: 'All keys collected — gate open',
      });
      const gq = gt.at(2);
      gates.push({ id: `gate_${id}`, pos: gq.p, dir: gq.d, open: false, angle: 0 });
      return gt;
    },
  };
}

export interface DoorStation {
  R1: SimRoad;
  R2: SimRoad;
  S1: SimRoad;
  S2: SimRoad;
  T1: TurntableHandle;
  T2: TurntableHandle;
  d1: [number, number];
  d2: [number, number];
  join: (x: number, y: number) => { to: SimRoad; s: number; dir: 1 };
}

export function createDoorStation(
  prefix: string,
  roads: SimRoad[],
  machines: SimMachine[],
  visuals: VisualProp[],
  ox: number,
  oy: number,
  keys: [FaceKey, FaceKey],
  oz = 0,
  stationIndex?: number,
): DoorStation {
  const P = (x: number, y: number): Vec3 => [x + ox, y + oy, oz];
  const R1 = new SimRoad(filletPath([P(7, 0), P(10, 0), P(10, 4), P(0, 4), P(0, 3)], 1), { id: `${prefix}_R1`, stationIndex });
  const R2 = new SimRoad(filletPath([P(0, 1), P(0, 0), P(4, 0)], 1), { id: `${prefix}_R2` });
  const S1 = new SimRoad(L3(P(4, -3), P(4, -4.7), UP_SKETCH), { id: `${prefix}_S1` });
  const S2 = new SimRoad(L3(P(-2, 3), P(-3.7, 3), UP_SKETCH), { id: `${prefix}_S2` });
  const T1 = createTurntable({ id: `${prefix}_T1`, key: keys[0], name: 'South turntable', pivot: P(4, 0), len: 3, open: -90 });
  const T2 = createTurntable({ id: `${prefix}_T2`, key: keys[1], name: 'West turntable', pivot: P(0, 3), len: 2, base: -90, open: -90 });

  roads.push(R1, R2, S1, S2, T1.road, T2.road);
  machines.push(T1.m, T2.m);
  visuals.push(
    { kind: 'turntableVisual', machineId: T1.m.id, pivot: P(4, 0), rad: 0.8, baseDeg: 0 },
    { kind: 'turntableVisual', machineId: T2.m.id, pivot: P(0, 3), rad: 0.8, baseDeg: -90 },
  );

  return {
    R1, R2, S1, S2, T1, T2,
    d1: [ox + 4, oy - 4],
    d2: [ox - 3, oy + 3],
    join: (x, y) => ({ to: R1, s: sAt(R1, P(x, y)), dir: 1 }),
  };
}

export const worldPoint = (x: number, y: number, z: number): Vec3 => V(x, y, z);
