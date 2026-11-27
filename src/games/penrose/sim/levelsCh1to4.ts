/**
 * Pure strict-TypeScript hand-built levels for Chapters 1–4:
 * Ch 1 · First Turns: turntable, hub, cross, crosshub
 * Ch 2 · Cadence & Flow: m-lift, c-curtain, n-belt, c-under
 * Ch 3 · Effort & Tension: seesaw, n-clutch, s-seesaw
 * Ch 4 · Doors & Reflections: n-doors, d-peek, n-pool, n-pool2, w-doors, p-mirror
 */

import {
  behindSketch, DEG, makeIsoBasis, UP_SKETCH, V, v3Dist,
  type OccluderBox, type Vec3,
} from './math';
import { cutSamples, filletPath, ftur, L3, lollipopLen, loopPts, sAt, SimRoad, turtle } from './road';
import {
  addLiveGap, COMPASS_DIRS, createCadenceLift, createCameraCrank, createClutchBridge,
  createConveyor, createCrossDisc, createDoors, createPeelSwitch, createPool,
  createSeesaw, createTurntable, CROSS_MAP, DOOR_BANNERS,
} from './machines';
import { createDoorStation, createStudyKit } from './levelKit';
import type { BuiltSimLevel, SimLevelDef, SimMachine, VisualProp } from './types';

type Compass = 'W' | 'N' | 'E' | 'S';
const crossWant = (X: Compass, T: Compass, cur: 0 | 1 | -1): 0 | 1 | null => {
  if (X === T) return null;
  for (const s of [0, 1] as const) if (CROSS_MAP[s][X] === T) return s;
  return cur === 0 || cur === 1 ? cur : 0;
};

export interface HandLevelEntry {
  id: string;
  make: (chapter: string, chapterIndex: number) => SimLevelDef;
}

export const CH1_TO_4_LEVELS: Record<string, (chapter: string, chapterIndex: number) => SimLevelDef> = {
  /* ===================== CHAPTER 1: FIRST TURNS ===================== */

  turntable: (chapter, chapterIndex) => ({
    id: 'turntable', item: 'turntable', name: 'The turntable switch', chapter, chapterIndex,
    theme: 'dusk', yaws: [0],
    hints: {
      nudge: 'Press Y while the wheel is away from the turntable, and pedal until it clicks open to the pier.',
      explain: 'The wheel laps the loop safely. Engage the turntable (Y) while the wheel is on the far side: it swings 90° and latches onto the pier, whose end lines up on screen with the goal road far below.',
      focusMachine: 'tt1',
    },
    center: [3.5, -1.5, 0.4],
    pts: [[-1.2, -0.6, 0], [10.2, 4.6, 0], [-3.4, -1.6, 5.4], [0, -12.5, -3], [3, -5.2, 0], [10.2, 4.6, -3], [0, -12.5, -6.4], [-3.4, 0.2, -3]],
    build(): BuiltSimLevel {
      const loop = new SimRoad(filletPath([[6, 0, 0], [9, 0, 0], [9, 4, 0], [0, 4, 0], [0, 0, 0], [3, 0, 0]], 1), { id: 'loop' });
      const pier = new SimRoad(L3([3, -3, 0], [3, -5, 0], UP_SKETCH), { id: 'pier' });
      const low = new SimRoad(L3([0, -8, -3], [0, -12.5, -3], UP_SKETCH), { id: 'low', goal: true });
      const tt = createTurntable({ id: 'tt1', key: 'y', name: 'Turntable', pivot: [3, 0, 0], len: 3, open: -90 });
      const visuals: VisualProp[] = [
        { kind: 'box', x0: -1.2, y0: -0.6, z0: -2.4, x1: 10.2, y1: 4.6, z1: -0.5, pal: 'stone' },
        { kind: 'box', x0: -0.6, y0: 0, z0: -3, x1: 9.6, y1: 4, z1: -2.4, pal: 'idle' },
        { kind: 'box', x0: 2.5, y0: -5, z0: -3.4, x1: 3.5, y1: -3.6, z1: -0.5, pal: 'deck' },
        { kind: 'box', x0: -0.5, y0: -12.5, z0: -6.4, x1: 0.5, y1: -11.5, z1: -3.5, pal: 'deck' },
        { kind: 'box', x0: -0.5, y0: -9.2, z0: -5.6, x1: 0.5, y1: -8.4, z1: -3.5, pal: 'deck' },
        { kind: 'box', x0: -3.4, y0: -1.6, z0: -3, x1: -1.6, y1: 0.2, z1: 4.4, pal: 'stone' },
        { kind: 'dome', x: -2.5, y: -0.7, z: 4.4, r: 0.85, pal: 'mech' },
        { kind: 'turntableVisual', machineId: tt.m.id, pivot: [3, 0, 0], rad: 0.8, baseDeg: 0 },
      ];
      return {
        roads: [loop, pier, low, tt.road],
        machines: [tt.m],
        keys: [], gates: [], occluders: [], visuals,
        spawn: () => ({ road: loop, s: 7.5, dir: 1 }),
        solve(wheel, out) {
          out.cad = 80;
          const far = wheel.road === loop && wheel.s > 2 && wheel.s < loop.L - 3.5;
          tt.driveTo(far ? -90 : null);
        },
      };
    },
  }),

  hub: (chapter, chapterIndex) => ({
    id: 'hub', item: 'hub', name: 'Three-way hub', chapter, chapterIndex,
    theme: 'dusk', yaws: [0], cruise: [78, 92],
    hints: {
      nudge: 'Collect all 3 keys using the 3-stop hub (A) and north points (Y), then swing the hub south to the goal gate.',
      explain: 'The hub (A) swings between north, east, and south cul-de-sacs. Lower the north points (Y) for a third key. Once you hold all three keys, send the wheel south to open the gate home.',
    },
    center: [0, -1, 0], pts: [[-10, -10, -2.4], [9, 5, -2.4], [-9.5, -9.5, 3.6]],
    build(): BuiltSimLevel {
      const roads: SimRoad[] = [], visuals: VisualProp[] = [];
      const kit = createStudyKit(roads, visuals);
      const line = new SimRoad(L3([-7, 0, 0], [3, 0, 0], UP_SKETCH), { id: 'line' });
      roads.push(line);
      for (const x of [-5.5, -2.5, 0.5]) visuals.push({ kind: 'cyl', x, y: 0, r: 0.14, z0: -2.4, z1: -0.25, pal: 'deck', seg: 10 });
      kit.pocket('w', -7, 0, 180);
      const pts = createPeelSwitch({ id: 'pts', line, s: 7.5, dir: -1, side: -1, key: 'y', name: 'North points', text: 'Peeled off north' });
      roads.push(pts.leaf);
      const st = turtle(pts.end[0], pts.end[1], pts.end[3], 0).arc(1.5, -45).fwd(2.4);
      const spur = new SimRoad(st.pts, { id: 'spur' }); roads.push(spur);
      const sp1 = kit.pocket('sp1', st.x, st.y, 90, 0, true);
      const hub = createTurntable({ id: 'hub', key: 'a', name: 'Hub', pivot: [3, 0, 0], len: 3, base: 0, open: 90, detents: [-90, 0, 90] });
      roads.push(hub.road);
      visuals.push({ kind: 'turntableVisual', machineId: hub.m.id, pivot: [3, 0, 0], rad: 0.8, baseDeg: 0 });
      const pE = kit.pocket('pE', 6, 0, 0, 0, true);
      const pN = kit.pocket('pN', 3, 3, 90, 0, true);
      const sArm = new SimRoad(L3([3, -3, 0], [3, -7.5, 0], UP_SKETCH), { id: 'sArm' }); roads.push(sArm);
      const pS = kit.pocket('pS', 3, -7.5, 270);
      const home = kit.homeGate('home', sArm, 1);
      visuals.push(
        { kind: 'box', x0: -10.4, y0: -10.4, z0: -2.4, x1: -8.6, y1: -8.6, z1: 1.6, pal: 'stone' },
        { kind: 'dome', x: -9.5, y: -9.5, z: 1.6, r: 0.85, pal: 'mech' },
      );
      const hubRoads = [hub.road, pE.road, pN.road, sArm, pS.road, home];
      const spurRoads = [pts.leaf, spur, sp1.road];
      const hubPivotW = V(3, 0, 0);
      return {
        roads, machines: [pts.m, hub.m], keys: kit.keys, gates: kit.gates, occluders: [], visuals,
        spawn: () => ({ road: line, s: 3, dir: 1 }),
        solve(wheel, out) {
          out.cad = 85;
          const tgt = !pE.key!.got ? { hub: 0 } : !sp1.key!.got ? { pts: true } : !pN.key!.got ? { hub: 90 } : { hub: -90 };
          const onHub = hubRoads.includes(wheel.road);
          const far = v3Dist(wheel.pos, hubPivotW) > 6 || (wheel.road === line && wheel.dir < 0);
          hub.driveTo(tgt.hub !== undefined && !onHub && (far || hub.m.on) ? tgt.hub : null);
          const onSp = spurRoads.includes(wheel.road);
          const near = v3Dist(wheel.pos, pts.atW) < 2.5;
          if (!onSp && !near) pts.driveDown(!!tgt.pts); else pts.m.on = false;
        },
      };
    },
  }),

  cross: (chapter, chapterIndex) => ({
    id: 'cross', item: 'cross', name: 'The crossover', chapter, chapterIndex,
    theme: 'dusk', yaws: [0], cruise: [78, 92],
    hints: {
      nudge: 'Turn the crossover disc (Y) while the wheel is out in a cul-de-sac to route north, east, then south.',
      explain: 'One disc, two curves, four roads. Y turns the disc 90° between (W–N / E–S) and (N–E / S–W). Gather the north and east keys, then route onto the south road.',
      focusMachine: 'disc',
    },
    center: [0, 0, 0], pts: [[-9, -9, -2.4], [9, 9, -2.4], [-9.5, -8.5, 3.6]],
    build(): BuiltSimLevel {
      const roads: SimRoad[] = [], visuals: VisualProp[] = [];
      const kit = createStudyKit(roads, visuals);
      const D = createCrossDisc({ id: 'disc', center: [0, 0, 0], R: 2, key: 'y', name: 'Crossover' });
      roads.push(...D.roads);
      visuals.push({ kind: 'crossDiscVisual', machineId: D.m.id, center: [0, 0, 0], rad: 2, baseDeg: 0 });
      const len: Record<Compass, number> = { W: 6, N: 4.5, E: 4.5, S: 5.5 };
      const arms = {} as Record<Compass, SimRoad>;
      const pockets = {} as Record<Compass, ReturnType<typeof kit.pocket>>;
      for (const k of ['W', 'N', 'E', 'S'] as Compass[]) {
        const [dx, dy] = COMPASS_DIRS[k];
        const a: Vec3 = [2 * dx, 2 * dy, 0], b: Vec3 = [(2 + len[k]) * dx, (2 + len[k]) * dy, 0];
        arms[k] = kit.arm(`arm_${k}`, a, b);
        pockets[k] = kit.pocket(`pk_${k}`, b[0], b[1], Math.atan2(dy, dx) / DEG, 0, k === 'N' || k === 'E');
      }
      const home = kit.homeGate('home', arms.S, 1);
      visuals.push(
        { kind: 'box', x0: -10.4, y0: -9.4, z0: -2.4, x1: -8.6, y1: -7.6, z1: 1.6, pal: 'stone' },
        { kind: 'dome', x: -9.5, y: -8.5, z: 1.6, r: 0.85, pal: 'mech' },
      );
      return {
        roads, machines: [D.m], keys: kit.keys, gates: kit.gates, occluders: [], visuals,
        spawn: () => ({ road: arms.W, s: 4.5, dir: -1 }),
        solve(wheel, out) {
          out.cad = 85;
          const T: Compass = !pockets.N.key!.got ? 'N' : !pockets.E.key!.got ? 'E' : 'S';
          let X: Compass | null = null;
          for (const k of ['W', 'N', 'E', 'S'] as Compass[]) {
            if (wheel.road === arms[k] || wheel.road === pockets[k].road || (k === 'S' && wheel.road === home)) X = k;
          }
          if (!X) { D.driveToState(null); return; }
          const want = crossWant(X, T, D.state());
          const d = v3Dist(wheel.pos, D.centerW) - D.R;
          const inward = wheel.road === arms[X] && wheel.dir < 0;
          const safe = wheel.road === pockets[X].road || !inward || d > 4.5 || (D.m.on && d > 1.2);
          D.driveToState(want !== null && safe ? want : null);
        },
      };
    },
  }),

  crosshub: (chapter, chapterIndex) => ({
    id: 'crosshub', item: 'crosshub', name: 'Crossover to hub', chapter, chapterIndex,
    theme: 'dusk', yaws: [0], cruise: [78, 92],
    hints: {
      nudge: 'Route north for the first key (Y), then east into the hub (A) for two more keys before heading south.',
      explain: 'Y turns the crossover disc; A swings the east hub between north, east, and south pockets. Turn each machine while the wheel is safely away from it.',
    },
    center: [0, 0, 0], pts: [[-9, -9, -2.4], [11, 8, -2.4], [-9.5, -9.5, 3.6]],
    build(): BuiltSimLevel {
      const roads: SimRoad[] = [], visuals: VisualProp[] = [];
      const kit = createStudyKit(roads, visuals);
      const D = createCrossDisc({ id: 'disc', center: [0, 0, 0], R: 2, key: 'y', name: 'Crossover' });
      roads.push(...D.roads);
      visuals.push({ kind: 'crossDiscVisual', machineId: D.m.id, center: [0, 0, 0], rad: 2, baseDeg: 0 });
      const len = { W: 6, N: 4.5, S: 5.5 };
      const arms = {} as Record<Compass, SimRoad>;
      const pockets = {} as Record<'W' | 'N' | 'S', ReturnType<typeof kit.pocket>>;
      for (const k of ['W', 'N', 'S'] as const) {
        const [dx, dy] = COMPASS_DIRS[k];
        const a: Vec3 = [2 * dx, 2 * dy, 0], b: Vec3 = [(2 + len[k]) * dx, (2 + len[k]) * dy, 0];
        arms[k] = kit.arm(`arm_${k}`, a, b);
        pockets[k] = kit.pocket(`pk_${k}`, b[0], b[1], Math.atan2(dy, dx) / DEG, 0, k === 'N');
      }
      arms.E = kit.arm('arm_E', [2, 0, 0], [5.5, 0, 0]);
      const hub = createTurntable({ id: 'hub', key: 'a', name: 'Hub', pivot: [5.5, 0, 0], len: 3, base: 0, open: 90, detents: [-90, 0, 90] });
      roads.push(hub.road);
      visuals.push({ kind: 'turntableVisual', machineId: hub.m.id, pivot: [5.5, 0, 0], rad: 0.8, baseDeg: 0 });
      const pE = kit.pocket('pE', 8.5, 0, 0);
      const pN = kit.pocket('pN', 5.5, 3, 90, 0, true);
      const pS = kit.pocket('pS', 5.5, -3, 270, 0, true);
      const home = kit.homeGate('home', arms.S, 1);
      const hubRoads = [hub.road, pE.road, pN.road, pS.road];
      const hubPivotW = V(5.5, 0, 0);
      visuals.push(
        { kind: 'box', x0: -10.4, y0: -10.4, z0: -2.4, x1: -8.6, y1: -8.6, z1: 1.6, pal: 'stone' },
        { kind: 'dome', x: -9.5, y: -9.5, z: 1.6, r: 0.85, pal: 'mech' },
      );
      return {
        roads, machines: [D.m, hub.m], keys: kit.keys, gates: kit.gates, occluders: [], visuals,
        spawn: () => ({ road: arms.W, s: 4.5, dir: -1 }),
        solve(wheel, out) {
          out.cad = 85;
          const goal = !pockets.N.key!.got ? { port: 'N' as Compass } : !pN.key!.got ? { port: 'E' as Compass, hub: 90 } : !pS.key!.got ? { port: 'E' as Compass, hub: -90 } : { port: 'S' as Compass };
          let X: Compass | null = null;
          for (const q of ['W', 'N', 'S'] as const) if (wheel.road === arms[q] || wheel.road === pockets[q].road || (q === 'S' && wheel.road === home)) X = q;
          if (wheel.road === arms.E || hubRoads.includes(wheel.road)) X = 'E';
          const onHub = hubRoads.includes(wheel.road);
          const hubFar = v3Dist(wheel.pos, hubPivotW) > 5.5;
          hub.driveTo(goal.hub !== undefined && !onHub && wheel.road !== arms.E && (hubFar || hub.m.on) ? goal.hub : null);
          if (!X) { D.driveToState(null); return; }
          const want = crossWant(X, goal.port, D.state());
          const d = v3Dist(wheel.pos, D.centerW) - D.R;
          const inward = wheel.road === arms[X] && wheel.dir < 0;
          const parked = X === 'E' ? onHub : wheel.road === pockets[X].road;
          const safe = parked || (!inward && X !== 'E') || (X === 'E' && wheel.road === arms.E && wheel.dir > 0) || d > 4.5 || (D.m.on && d > 1.2);
          D.driveToState(want !== null && safe ? want : null);
        },
      };
    },
  }),

  /* ===================== CHAPTER 2: CADENCE & FLOW ===================== */

  'm-lift': (chapter, chapterIndex) => ({
    id: 'm-lift', item: 'm-lift', name: 'Cadence picks the floor', chapter, chapterIndex,
    theme: 'garden', yaws: [0], cruise: [50, 92],
    hints: {
      nudge: 'No button: ease around 55 rpm to bring the lift to the ground, ride on, then spin ~85 rpm to reach the second floor.',
      explain: 'Your cadence fills the lift column continuously: ~55 rpm = ground, ~70 rpm = 1st floor, ~85 rpm = 2nd floor. Lower it to board, then spin up while lapping the deck.',
    },
    center: [2, 0, 1.6],
    pts: [[-6.1, -1.5, 0], [10.4, -1.5, 0], [10.4, -0.5, 3.6], [4.3, 2.3, 6], [-0.5, -1.7, 6], [-6.1, 2.1, -2.4], [10.4, -0.5, -2.6], [4.3, 2.3, -2.6]],
    build(): BuiltSimLevel {
      const step = 1.8;
      const lift = createCadenceLift({ id: 'lift', step, floors: 3, cadLo: 55, cadSpan: 45, rate: 1.35, snapBand: 0.5 });
      const G = new SimRoad(loopPts(-5.6, -1, -0.9, 1.6, 0, 0.6), { id: 'G', closed: true, palHex: '#E9D7AE' });
      const armW = new SimRoad(L3([-1.5, -1, 0.006], [1.8, -1, 0.006], UP_SKETCH), { id: 'armW', transform: lift.m.transform, groupId: lift.groupId, palHex: '#F3E6C4' });
      const D = new SimRoad(loopPts(0.4, -1, 3.6, 1.6, 0, 0.8), { id: 'D', closed: true, transform: lift.m.transform, groupId: lift.groupId, palHex: '#F3E6C4' });
      armW.joins.push({ k: 1, to: D, s: sAt(D, [2, -1, 0]) + 0.02, dir: 1 });
      const armE = new SimRoad(L3([2.8, -1, 0.006], [5, -1, 0.006], UP_SKETCH), { id: 'armE', transform: lift.m.transform, groupId: lift.groupId, palHex: '#F3E6C4' });
      G.forks.push({ s: sAt(G, [-1.5, -1, 0]), dir: 1, to: armW, toK: 0, when: () => lift.z() === 0, text: 'Deck on the ground — boarding' });
      D.forks.push({ s: sAt(D, [2.8, -1, 0]), dir: 1, to: armE, toK: 0, when: () => lift.z() === 2 * step, text: 'Second floor — rolling home' });
      const f2 = new SimRoad(L3([5, -1, 2 * step], [10, -1, 2 * step], UP_SKETCH), { id: 'f2', goal: true });
      const visuals: VisualProp[] = [
        { kind: 'loopSlab', x0: -6.1, y0: -1.5, x1: -0.4, y1: 2.1, z: -0.5, w: 0.9, pal: 'turf' },
        { kind: 'box', x0: -0.3, y0: -1.5, z0: -0.3, x1: 4.1, y1: 2.1, z1: -0.03, pal: 'idle', groupId: lift.groupId },
        { kind: 'box', x0: 5, y0: -1.5, z0: -2.4, x1: 6, y1: -0.5, z1: 2 * step - 0.5, pal: 'stone' },
        { kind: 'box', x0: 9.2, y0: -1.5, z0: -2.4, x1: 10.4, y1: -0.5, z1: 2 * step - 0.5, pal: 'stone' },
        { kind: 'box', x0: -0.5, y0: -1.7, z0: -2.6, x1: 4.3, y1: 2.3, z1: -2.2, pal: 'stone' },
        { kind: 'liftColumn', machineId: lift.m.id, x: 2, y: 0.3, zBase: -2.2, step, floors: 3 },
        { kind: 'tree', x: -7, y: -1.4, z: -0.5, s: 1 },
        { kind: 'tree', x: -7.2, y: 2.4, z: -0.5, s: 0.8 },
      ];
      return {
        roads: [G, armW, D, armE, f2], machines: [lift.m], keys: [], gates: [], occluders: [], visuals,
        spawn: () => ({ road: G, s: 1, dir: 1 }),
        hudTarget(wheel) {
          const onDeck = wheel.road === armW || wheel.road === D || wheel.road === armE || wheel.road === f2;
          return {
            cadence: onDeck ? { min: 80, max: 94, label: '2nd floor' } : { min: 45, max: 60, label: 'Ground floor' },
          };
        },
        solve(wheel, out) {
          const onDeck = wheel.road === armW || wheel.road === D || wheel.road === armE || wheel.road === f2;
          out.cad = onDeck ? 85 : 52;
        },
      };
    },
  }),

  'c-curtain': (chapter, chapterIndex) => ({
    id: 'c-curtain', item: 'c-curtain', name: 'Hold the curtain', chapter, chapterIndex,
    theme: 'garden', yaws: [0], cruise: [65, 90],
    hints: {
      nudge: 'Hold ~70 rpm so the floating garden hides the first hole; once across, spin ~85 rpm to hide the second.',
      explain: 'A hole you cannot see is not there. Your cadence moves the garden platform (70 rpm = 1st floor hides hole 1, 85 rpm = 2nd floor hides hole 2).',
    },
    center: [0, 3, 1], pts: [[-10.5, 2.3, -2.4], [13, 3.5, 0], [2.4, 9, 5.5], [-2.4, 4.2, 5.5]],
    build(): BuiltSimLevel {
      const lift = createCadenceLift({
        id: 'curt', step: 2.4, floors: 2, cadLo: 55, cadSpan: 30, rate: 2.0, snapBand: 0.4,
        occluderLocal: { min: V(-2.4, 4.2, -0.75), max: V(2.4, 9, 0) },
      });
      const G = new SimRoad(loopPts(7.5, 0, 12.5, 3, 0, 0.6), { id: 'G', closed: true, palHex: '#E9D7AE' });
      const R = L3([8.2, 3, 0], [-10, 3, 0], UP_SKETCH);
      const sH1 = 8.2 - -0.4, sH2 = 8.2 - -5.2;
      const [R1s, rest] = cutSamples(R, sH1, sH1 + 1.2);
      const [R2s, R3s] = cutSamples(rest, sH2 - sH1 - 1.2, sH2 - sH1);
      const R1 = new SimRoad(R1s, { id: 'R1' }), R2 = new SimRoad(R2s, { id: 'R2' }), R3 = new SimRoad(R3s, { id: 'R3', goal: true });
      const getViewD = () => makeIsoBasis([0, 0, 0], 0, 0).D;
      const h1 = addLiveGap(R1, 1, R2, 0, () => [lift.occluder!], getViewD, { text: 'Behind the deck — first hole vanished' });
      const h2 = addLiveGap(R2, 1, R3, 0, () => [lift.occluder!], getViewD, { text: 'Behind the deck — second hole vanished' });
      G.forks.push({ s: sAt(G, [8.2, 3, 0]), dir: 1, to: R1, toK: 0, when: () => h1.hidden(), text: 'Road ahead looks whole' });
      const visuals: VisualProp[] = [
        { kind: 'loopSlab', x0: 7, y0: -0.5, x1: 13, y1: 3.5, z: -0.5, w: 0.9, pal: 'turf' },
        { kind: 'box', x0: -10.5, y0: 2.3, z0: -2.4, x1: -8.6, y1: 3.7, z1: -0.5, pal: 'stone' },
        { kind: 'liftColumn', machineId: lift.m.id, x: 0, y: 6.6, zBase: -3, step: 2.4, floors: 2, deckBox: [-2.4, 4.2, 2.4, 9], trees: [[-1.7, 8.3], [1.7, 8.3], [-1.7, 4.9]] },
      ];
      return {
        roads: [G, R1, R2, R3], machines: [lift.m], keys: [], gates: [], occluders: [lift.occluder!], visuals,
        spawn: () => ({ road: G, s: 1, dir: 1 }),
        hiddenGaps: () => [{ a: h1.a(), b: h1.b(), hidden: h1.hidden() }, { a: h2.a(), b: h2.b(), hidden: h2.hidden() }],
        hudTarget(wheel) {
          const first = wheel.road === G || wheel.road === R1;
          return { cadence: first ? { min: 66, max: 76, label: 'Hide hole 1' } : { min: 82, max: 96, label: 'Hide hole 2' } };
        },
        solve(wheel, out) { out.cad = wheel.road === G || wheel.road === R1 ? 70 : 85; },
      };
    },
  }),

  'n-belt': (chapter, chapterIndex) => ({
    id: 'n-belt', item: 'n-belt', name: 'Lane change', chapter, chapterIndex,
    theme: 'garden', yaws: [0], cruise: [65, 95], scenery: false,
    hints: {
      nudge: 'Start the conveyor (Y) and hold 72–86 rpm so it shifts you two lanes onto the road home.',
      explain: 'The conveyor runs at your cadence: under 72 rpm shifts 1 lane, 72–86 rpm shifts 2 lanes, and over 86 rpm shifts 3 lanes. Only lane 2 reaches the goal.',
      focusMachine: 'belt',
    },
    center: [0, -2, 0], pts: [[-7.6, -0.6, 0], [1.6, 3.2, 0], [7.4, -3.9, 0], [-3.4, -5.7, 0]],
    build(): BuiltSimLevel {
      const dy = -1.7;
      const H = new SimRoad(loopPts(-7, 0, 1, 2.6, 0, 0.8), { id: 'H', closed: true, palHex: '#F3E6C4' });
      const l1 = new SimRoad(L3([-3, dy, 0.006], [4.2, dy, 0.006], UP_SKETCH), { id: 'l1', palHex: '#F3E6C4', edgeText: 'One lane was not enough' });
      const l2 = new SimRoad(L3([-3, 2 * dy, 0.006], [7, 2 * dy, 0.006], UP_SKETCH), { id: 'l2', goal: true });
      const l3 = new SimRoad(L3([-3, 3 * dy, 0.006], [3.2, 3 * dy, 0.006], UP_SKETCH), { id: 'l3', palHex: '#F3E6C4', edgeText: 'Three lanes was too far' });
      const belt = createConveyor({ id: 'belt', key: 'y', x: -1, y0: 0, dy, from: H, lanes: [l1, l2, l3], bands: [72, 86] });
      const visuals: VisualProp[] = [
        { kind: 'loopSlab', x0: -7.6, y0: -0.6, x1: 1.6, y1: 3.2, z: -0.5, w: 1, pal: 'turf' },
        { kind: 'box', x0: -3.4, y0: dy - 0.55, z0: -0.5, x1: 4.4, y1: dy + 0.55, z1: -0.02, pal: 'stone' },
        { kind: 'box', x0: -3.4, y0: 2 * dy - 0.55, z0: -0.5, x1: 7.4, y1: 2 * dy + 0.55, z1: -0.02, pal: 'stone' },
        { kind: 'box', x0: -3.4, y0: 3 * dy - 0.55, z0: -0.5, x1: 3.4, y1: 3 * dy + 0.55, z1: -0.02, pal: 'stone' },
        { kind: 'conveyorVisual', machineId: belt.m.id, x: -1, y0: 0, dy, laneCount: 3 },
      ];
      return {
        roads: [H, l1, l2, l3], machines: [belt.m], keys: [], gates: [], occluders: [], visuals,
        spawn: () => ({ road: H, s: 1, dir: 1 }),
        hudTarget: () => ({ cadence: { min: 72, max: 86, label: '2 lanes' }, focusMachine: belt.m.id }),
        solve(_w, out) { out.cad = 80; belt.m.on = true; },
      };
    },
  }),

  'c-under': (chapter, chapterIndex) => ({
    id: 'c-under', item: 'c-under', name: 'Up and under', chapter, chapterIndex,
    theme: 'garden', yaws: [-90, 0], cruise: [50, 92],
    hints: {
      nudge: 'Ease to ~55 rpm to board the lift, spin ~85 rpm to drop into the underpass loop, then turn the camera (Y) to align home.',
      explain: 'Board the buttonless lift at 55 rpm, raise it to the 2nd floor at 85 rpm to drop onto the low road under the meadow, then turn the camera (Y) to join the goal.',
    },
    center: [8, 2, -1], pts: [[22, 2.3, 6.5], [2.5, -1.7, -2.6], [2.7, -1.5, 6], [7.1, 2.1, 6], [2.7, 2.1, 6], [7.1, 5, 4]],
    build(): BuiltSimLevel {
      const step = 1.8, gx = 3.5;
      const lift = createCadenceLift({ id: 'lift', step, floors: 3, cadLo: 55, cadSpan: 45, rate: 1.35, snapBand: 0.5 });
      const G = new SimRoad(loopPts(12.5 + gx, -1, 17.5 + gx, 1.6, 0, 0.6), { id: 'G', closed: true, palHex: '#E9D7AE', stationIndex: 0 });
      const armW = new SimRoad(L3([12.1 + gx, 1.6, 0.006], [6.2, 1.6, 0.006], UP_SKETCH), { id: 'armW', transform: lift.m.transform, groupId: lift.groupId, palHex: '#F3E6C4' });
      const D = new SimRoad(loopPts(3.4, -1, 6.6, 1.6, 0, 0.8), { id: 'D', closed: true, transform: lift.m.transform, groupId: lift.groupId, palHex: '#F3E6C4' });
      armW.joins.push({ k: 1, to: D, s: sAt(D, [6.2, 1.6, 0]) + 0.02, dir: 1 });
      const armN = new SimRoad(L3([6.6, 0.6, 0.006], [6.6, 3, 0.006], UP_SKETCH), { id: 'armN', transform: lift.m.transform, groupId: lift.groupId, palHex: '#F3E6C4' });
      G.forks.push({ s: sAt(G, [12.1 + gx, 1.6, 0]), dir: 1, to: armW, toK: 0, when: () => lift.z() === 0, text: 'Deck lowered — boarding' });
      D.forks.push({ s: sAt(D, [6.6, 0.6, 0]), dir: 1, to: armN, toK: 0, when: () => lift.z() === 2 * step, text: 'Second floor — high road' });
      const hz = 2 * step, E: Vec3 = [6.6, 5, hz];
      const U = new SimRoad(L3([6.6, 3, hz], E, UP_SKETCH), { id: 'U', palHex: '#D9C7F0' });
      const X0 = behindSketch(E, -90, 9);
      const X = new SimRoad(L3(X0, [X0[0], 4.6, X0[2]], UP_SKETCH), { id: 'X', palHex: '#B7D3A0' });
      const Q = new SimRoad(loopPts(X0[0] - 3.4, 4.2, X0[0], 7.6, X0[2], 0.7), { id: 'Q', closed: true, palHex: '#B7D3A0', stationIndex: 1 });
      X.joins.push({ k: 1, to: Q, s: sAt(Q, [X0[0], 4.6, X0[2]]) + 0.02, dir: 1 });
      const exitP: Vec3 = [X0[0] - 2.6, 7.6, X0[2]];
      const H0 = behindSketch(exitP, 0, -4);
      const home = new SimRoad(L3(H0, [H0[0] - 4, H0[1], H0[2]], UP_SKETCH), { id: 'home', goal: true });
      const cam = createCameraCrank({ id: 'cam', key: 'y', name: 'Camera', at: [10, -4, 0], detents: [-90, 0] });
      Q.forks.push({ s: sAt(Q, exitP), dir: 1, to: home, toK: 0, when: () => cam.at(0), text: 'Joined by perspective' });
      const visuals: VisualProp[] = [
        { kind: 'loopSlab', x0: 12 + gx, y0: -1.5, x1: 18 + gx, y1: 2.1, z: -0.5, w: 0.9, pal: 'turf' },
        { kind: 'loopSlab', x0: X0[0] - 3.9, y0: 3.7, x1: X0[0] + 0.5, y1: 8.1, z: X0[2] - 0.5, w: 0.9, pal: 'turf' },
        { kind: 'box', x0: 2.7, y0: -1.5, z0: -0.3, x1: 7.1, y1: 2.1, z1: -0.03, pal: 'idle', groupId: lift.groupId },
        { kind: 'box', x0: 7.1, y0: 1.15, z0: -0.3, x1: 11.6 + gx, y1: 2.05, z1: -0.03, pal: 'idle', groupId: lift.groupId },
        { kind: 'cyl', x: 6.6, y: 3.55, r: 0.32, z0: hz - 3.4, z1: hz - 0.5, pal: 'stone', seg: 16 },
        { kind: 'box', x0: H0[0] - 4.1, y0: H0[1] - 0.5, z0: H0[2] - 2.4, x1: H0[0] - 3.1, y1: H0[1] + 0.5, z1: H0[2] - 0.5, pal: 'stone' },
        { kind: 'liftColumn', machineId: lift.m.id, x: 5, y: 0.3, zBase: -2.2, step, floors: 3 },
        { kind: 'cameraDial', machineId: cam.m.id, pos: [10, -4, 0], detents: [-90, 0] },
      ];
      return {
        roads: [G, armW, D, armN, U, X, Q, home], machines: [lift.m, cam.m], keys: [], gates: [], occluders: [], visuals,
        spawn: () => ({ road: G, s: 1, dir: 1 }),
        hudTarget(wheel) {
          if (wheel.road === Q) return { focusMachine: cam.m.id, hintNudge: 'Turn the camera (Y) to line up the road home.' };
          const onDeck = wheel.road === armW || wheel.road === D || wheel.road === armN;
          return { cadence: onDeck ? { min: 80, max: 94, label: '2nd floor' } : { min: 45, max: 60, label: 'Ground floor' } };
        },
        solve(wheel, out) {
          const onDeck = wheel.road === armW || wheel.road === D || wheel.road === armN;
          out.cad = onDeck ? 85 : wheel.road === G ? 52 : 80;
          cam.driveTo(wheel.road === Q ? 0 : -90);
        },
      };
    },
  }),

  /* ===================== CHAPTER 3: EFFORT & TENSION ===================== */

  seesaw: (chapter, chapterIndex) => ({
    id: 'seesaw', item: 'seesaw', name: 'Spring see-saw', chapter, chapterIndex,
    theme: 'prism', yaws: [0],
    hints: {
      nudge: 'Let the wheel climb onto the spiral, then clutch the spring (Y) and push hard (Z4+) until you cross to the upper road.',
      explain: 'At rest the see-saw leads up to the spiral. While spiraling down, clutch the spring (Y) and push hard to tip the beam the other way. Keep pushing until the wheel reaches the upper road.',
      focusMachine: 'ss',
    },
    center: [-1.5, -0.6, 0.4],
    pts: [[-7.8, -0.6, 0], [7.5, 1.2, 0], [-10.6, -2.6, 0], [0, 1, 2.6], [6.3, 0, 2.6], [-7.8, 0.6, -3], [6, 0, -3.2], [-10.6, -1.4, -2.4]],
    pad: 1.1,
    build(): BuiltSimLevel {
      const a = Math.asin(1 / 2.5), X = 2.5 * Math.cos(a);
      const ss = createSeesaw({ id: 'ss', key: 'y', name: 'Spring', P: [-X, 0, 0], baseDeg: 0, side: -1 });
      const start = new SimRoad(L3([-7.5, 0, 0], [-X, 0, 0], UP_SKETCH), { id: 'start' });
      const t = turtle(X, 0, 0, 2);
      t.grade = -2 / lollipopLen(1, 1.2);
      const spiral = new SimRoad(t.fwd(1).teardrop(1.2).fwd(1).pts, { id: 'spiral' });
      const upper = new SimRoad(L3([-X, 0, 2], [-4.6, 0, 2], UP_SKETCH), { id: 'upper' });
      const goal = new SimRoad(L3([-6.6, -2, 0], [-10.5, -2, 0], UP_SKETCH), { id: 'goal', goal: true });
      const cx = X + 1 + 1.2 * 1.732;
      const visuals: VisualProp[] = [
        { kind: 'seesawVisual', machineId: ss.m.id, pivot: [-X, 0, 0], baseDeg: 0, side: -1 },
        { kind: 'box', x0: -7.8, y0: -0.6, z0: -3, x1: -6.4, y1: 0.6, z1: -0.5, pal: 'stone' },
        { kind: 'cyl', x: cx, y: 0, r: 0.5, z0: -3.2, z1: 1.2, pal: 'accent', seg: 6 },
        { kind: 'box', x0: -4.4, y0: -1.05, z0: -3, x1: -3.8, y1: -0.65, z1: 1.25, pal: 'accent' },
        { kind: 'box', x0: -4.4, y0: 0.65, z0: -3, x1: -3.8, y1: 1.05, z1: 1.25, pal: 'accent' },
        { kind: 'box', x0: -4.4, y0: -1.05, z0: 1.25, x1: -3.8, y1: 1.05, z1: 1.55, pal: 'accent' },
        { kind: 'box', x0: -10.6, y0: -2.6, z0: -2.4, x1: -8.6, y1: -1.4, z1: -0.5, pal: 'deck' },
      ];
      return {
        roads: [start, ss.beam, spiral, upper, goal], machines: [ss.m], keys: [], gates: [], occluders: [], visuals,
        spawn: () => ({ road: start, s: 0.6, dir: 1 }),
        hudTarget(wheel) {
          const push = wheel.road === spiral || (wheel.road === ss.beam && ss.tip() > 0.3);
          return push ? { zone: { min: 4, max: 5, label: 'Wind spring', source: 'power' }, focusMachine: ss.m.id } : {};
        },
        solve(wheel, out) {
          const push = wheel.road === spiral || (wheel.road === ss.beam && ss.tip() > 0.5);
          ss.m.on = push;
          out.cad = push ? 92 : 74;
          out.ftp = push ? 1.25 : 0.72;
        },
      };
    },
  }),

  'n-clutch': (chapter, chapterIndex) => ({
    id: 'n-clutch', item: 'n-clutch', name: 'Wind the bridge out', chapter, chapterIndex,
    theme: 'garden', yaws: [0], cruise: [65, 95], scenery: false,
    hints: {
      nudge: 'Press Z to wind the bridge across the gap, then press Z again to lock its tip between the red bollards.',
      explain: 'While the clutch (Z) is engaged, pedaling extends the bridge. Press Z again to lock it on the red catch. Wind past the catch and the clutch slips back in.',
      focusMachine: 'br',
    },
    center: [0, -1.5, 0], pts: [[-7.6, -4, 0], [-7.6, 0.6, 0], [8.4, -2.3, 0], [-0.4, -2.3, 0]],
    build(): BuiltSimLevel {
      const A = new SimRoad(loopPts(-7, -3.4, -1, 0, 0, 0.8), { id: 'A', closed: true, palHex: '#F3E6C4' });
      const X1 = new SimRoad(L3([-1, -1.7, 0.006], [1.6, -1.7, 0.006], UP_SKETCH), { id: 'X1', palHex: '#F3E6C4' });
      const X2 = new SimRoad(L3([4.1, -1.7, 0.006], [8, -1.7, 0.006], UP_SKETCH), { id: 'X2', goal: true });
      const br = createClutchBridge({ id: 'br', key: 'z', from: X1, to: X2 });
      A.forks.push({ s: sAt(A, [-1, -1.7, 0]), dir: 1, to: X1, toK: 0, when: () => br.locked(), text: 'Bridge locked — rolling across' });
      const visuals: VisualProp[] = [
        { kind: 'loopSlab', x0: -7.6, y0: -4, x1: -0.4, y1: 0.6, z: -0.5, w: 1, pal: 'turf' },
        { kind: 'box', x0: -0.4, y0: -2.3, z0: -0.5, x1: 1.6, y1: -1.1, z1: -0.02, pal: 'stone' },
        { kind: 'box', x0: 4.1, y0: -2.3, z0: -0.5, x1: 8.4, y1: -1.1, z1: -0.02, pal: 'stone' },
        { kind: 'clutchVisual', machineId: br.m.id, from: X1.end(1).p, to: X2.end(0).p, maxLen: br.max },
      ];
      return {
        roads: [A, X1, X2], machines: [br.m], keys: [], gates: [], occluders: [], visuals,
        spawn: () => ({ road: A, s: 1, dir: 1 }),
        hudTarget: () => ({ focusMachine: br.m.id }),
        solve(_w, out) {
          out.cad = 80;
          if (!br.m.on && !br.spans()) br.m.on = true;
          else if (br.m.on && br.len() > br.span + 0.3) br.m.on = false;
        },
      };
    },
  }),

  's-seesaw': (chapter, chapterIndex) => ({
    id: 's-seesaw', item: 's-seesaw', name: 'Push it over', chapter, chapterIndex,
    theme: 'prism', yaws: [0, -90], cruise: [65, 95], terrain: true, scenery: false,
    hints: {
      nudge: 'Ride up the resting see-saw, then push hard with Y to tip it back across; on the far loop, turn the camera (A) to meet home.',
      explain: 'At rest the beam carries you up to the high loop. Clutch Y and push hard (Z4+) to tip it over and cross to the far loop, then turn the camera (A) 90° to align the road home.',
    },
    center: [0, -4, 1],
    pts: [[-12.6, -4, 0], [-12.6, 1.5, 0], [14.1, -2.6, 2], [14.1, 4.6, 2], [11, -2, -2], [0.5, -16, 0], [-5.2, -9.1, 2], [1.4, -10.5, 2], [0, 0, -2]],
    build(): BuiltSimLevel {
      const a = Math.asin(1 / 2.5), X2 = 5 * Math.cos(a);
      const ss = createSeesaw({ id: 'ss', key: 'y', name: 'Spring', P: [0, 0, 0], baseDeg: 0, side: 1 });
      const A = new SimRoad(loopPts(-12, -3.4, -6, 0.9, 0, 0.8), { id: 'A', closed: true, stationIndex: 0 });
      const a1 = new SimRoad(L3([-6, 0, 0], [0, 0, 0], UP_SKETCH), { id: 'a1' });
      const b1 = new SimRoad(L3([X2, 0, 2], [8.5, 0, 2], UP_SKETCH), { id: 'b1' });
      const U = new SimRoad(loopPts(8.5, -2, 13.5, 2, 2, 0.8), { id: 'U', closed: true, stationIndex: 1 });
      b1.joins.push({ k: 1, to: U, s: sAt(U, [8.5, 0, 2]), dir: -1 });
      const t = turtle(X2 + 5.9, 2, 90, 2);
      t.gr(-2 / (5.9 + (3 * Math.PI) / 2)).fwd(1).arc(1, 90).fwd(2.9).arc(1, 90).fwd(2).arc(1, -90);
      const ramp = new SimRoad(t.pts, { id: 'ramp' });
      U.forks.push({ s: sAt(U, [X2 + 5.9, 2, 2]), dir: -1, to: ramp, toK: 0, when: () => ss.tip() > 0.95, text: 'Beam tipped — ramp open' });
      const c1 = new SimRoad(turtle(0, 0, 180, 2).fwd(0.6).arc(1, 90).fwd(3.5).pts, { id: 'c1' });
      const C = new SimRoad(loopPts(-4.6, -8.5, 1.4, -4.5, 2, 0.8), { id: 'C', closed: true, stationIndex: 2 });
      c1.joins.push({ k: 1, to: C, s: sAt(C, [-1.6, -4.5, 2]), dir: 1 });
      const c2 = new SimRoad(L3([-1.5, -8.5, 2], [-1.5, -10.5, 2], UP_SKETCH), { id: 'c2', edgeText: 'From here the road stops in mid-air' });
      const home = new SimRoad(L3([0.5, -12.5, 0], [0.5, -16, 0], UP_SKETCH), { id: 'home', goal: true });
      const cam = createCameraCrank({ id: 'cam', key: 'a', name: 'Camera', at: [-9, -1.2, 0], detents: [0, -90] });
      A.forks.push({ s: sAt(A, [-6, 0, 0]), dir: 1, to: a1, toK: 0, when: () => ss.tip() < 0.05, text: 'Climbing the beam' });
      C.forks.push({ s: sAt(C, [-1.5, -8.5, 2]), dir: 1, to: c2, toK: 0, when: () => cam.at(-90), text: 'Aligned with the lane below' });
      const visuals: VisualProp[] = [
        { kind: 'seesawVisual', machineId: ss.m.id, pivot: [0, 0, 0], baseDeg: 0, side: 1 },
        { kind: 'cameraDial', machineId: cam.m.id, pos: [-9, -1.2, 0], detents: [0, -90] },
      ];
      return {
        roads: [A, a1, ss.beam, b1, U, ramp, c1, C, c2, home],
        machines: [ss.m, cam.m], keys: [], gates: [], occluders: [], visuals,
        terrainIgnoreRoadIds: new Set(['ramp']),
        spawn: () => ({ road: A, s: 1, dir: 1 }),
        hudTarget(wheel) {
          if (wheel.road === U || wheel.road === ramp) return { zone: { min: 4, max: 5, label: 'Tip beam', source: 'power' }, focusMachine: ss.m.id };
          if (wheel.road === C) return { focusMachine: cam.m.id, hintNudge: 'Turn the camera (A) 90° so the road home meets the lane below.' };
          return {};
        },
        solve(wheel, out) {
          const push = wheel.road === U || wheel.road === ramp || (wheel.road === ss.beam && ss.tip() > 0.5);
          ss.m.on = push;
          out.cad = push ? 92 : 74;
          out.ftp = push ? 1.25 : 0.72;
          cam.driveTo(wheel.road === C || wheel.road === c2 || wheel.road === home ? -90 : 0);
        },
      };
    },
  }),

  /* ===================== CHAPTER 4: DOORS & REFLECTIONS ===================== */

  'n-doors': (chapter, chapterIndex) => ({
    id: 'n-doors', item: 'n-doors', name: 'Two doors, one door', chapter, chapterIndex,
    theme: 'garden', yaws: [0], cruise: [65, 95], scenery: false,
    hints: {
      nudge: 'Press A to cycle the doorway banner until it matches the teal banner on the far island.',
      explain: 'Two doorways with matching banners become one portal: ride into one and emerge from its twin.',
      focusMachine: 'doors',
    },
    center: [0, -2.5, 0.5], pts: [[-7.6, -4, 0], [-7.6, 0.6, 0], [7.4, -5.6, 0], [-4, 0, 2], [2, -5, 2.8]],
    build(): BuiltSimLevel {
      const A = new SimRoad(loopPts(-7, -3.4, -1, 0, 0, 0.8), { id: 'A', closed: true, palHex: '#F3E6C4' });
      const X2 = new SimRoad(L3([2.0, -5, 0.806], [7, -5, 0.806], UP_SKETCH), { id: 'X2', goal: true });
      const doors = createDoors({ id: 'doors', road: A, at: [-4, 0], to: X2, want: 2, key: 'a', btn: [0, 1.3] });
      const visuals: VisualProp[] = [
        { kind: 'loopSlab', x0: -7.6, y0: -4, x1: -0.4, y1: 0.6, z: -0.5, w: 1, pal: 'turf' },
        { kind: 'box', x0: 2.0, y0: -5.6, z0: -1.2, x1: 7.4, y1: -3.0, z1: 0.78, pal: 'stone' },
        { kind: 'doorPair', machineId: doors.m!.id, near: [-4, 0, 0], nearAng: 0, far: [2, -5, 0.8], farAng: Math.PI, banners: [...DOOR_BANNERS], want: 2 },
      ];
      let cd = 0;
      return {
        roads: [A, X2], machines: [doors.m!], keys: [], gates: [], occluders: [], visuals,
        spawn: () => ({ road: A, s: 1, dir: 1 }),
        hudTarget: () => ({ focusMachine: doors.m!.id }),
        solve(_w, out) { out.cad = 80; if (!doors.match() && --cd <= 0) { doors.stepBanner(); cd = 15; } },
      };
    },
  }),

  'd-peek': (chapter, chapterIndex) => ({
    id: 'd-peek', item: 'd-peek', name: 'Look before you ride', chapter, chapterIndex,
    theme: 'garden', yaws: [0], cruise: [65, 92], terrain: true, scenery: false,
    hints: {
      nudge: 'Look inside each open doorway before swinging its turntable: west (A) on loop 1 leads on, south (B) on loop 2 leads home.',
      explain: 'Every white doorway is live — peek through to see where it emerges. Swing the west turntable (A) to reach the upper loop, then swing its south turntable (B) to reach the goal.',
    },
    center: [11, -6, 0],
    pts: [[-5.6, 6.4, -1.6], [-5.6, -6.4, -1.6], [3.6, -18.4, -1.6], [30.4, -18.4, -1.6], [30.4, -5.4, -1.6], [16.4, 6.4, -1.6], [8, -6, -5], [6, -17, 5.2], [0, -12.6, 3.6], [0, -12.6, -5], [28, -8, 4]],
    pad: 0.5,
    build(): BuiltSimLevel {
      const roads: SimRoad[] = [], machines: SimMachine[] = [], visuals: VisualProp[] = [];
      const zA = 0, zB = 1.5, zL = 1.1, zH = 2.6, zb = -1.6;
      const A = createDoorStation('A', roads, machines, visuals, 0, 0, ['y', 'a'], zA, 0);
      const B = createDoorStation('B', roads, machines, visuals, 15, -12, ['b', 'z'], zB, 1);
      const inB = new SimRoad(L3([28, -8, zB], [24, -8, zB], UP_SKETCH), { id: 'inB' });
      inB.joins.push({ k: 1, ...B.join(24, -8) });
      const inA = new SimRoad(L3([14, 4, zA], [9, 4, zA], UP_SKETCH), { id: 'inA' });
      inA.joins.push({ k: 1, ...A.join(9, 4) });
      const lost = new SimRoad(L3([0, -9.0, zL], [0, -12.6, zL], UP_SKETCH), { id: 'lost', edgeText: 'The bridge was gone' });
      const home = new SimRoad(L3([6, -14.2, zH], [6, -17.0, zH], UP_SKETCH), { id: 'home', goal: true });
      roads.push(inB, inA, lost, home);
      visuals.push({ kind: 'cliff', x: 0, y: -12.6, z: zL, zBase: zb - 3.2, edgeOfWorld: true });
      const white = ['#F4F1EA'];
      const pair = (id: string, road: SimRoad, at: [number, number], ang: number, to: SimRoad, far: [number, number], atZ: number, z: number) => {
        createDoors({ id, road, at, atZ, to, fixed: true, want: 0, banners: white, text: 'Through the doorway' });
        visuals.push({ kind: 'doorPair', machineId: id, near: [at[0], at[1], atZ], nearAng: ang, far: [far[0], far[1], z], farAng: ang, banners: white, want: 0, fixed: true });
      };
      pair('dp1', A.S2, A.d2, 0, inB, [28, -8], zA, zB);
      pair('dp2', A.S1, A.d1, -Math.PI / 2, lost, [0, -9.0], zA, zL);
      pair('dp3', B.S1, B.d1, -Math.PI / 2, home, [6, -14.2], zB, zH);
      pair('dp4', B.S2, B.d2, 0, inA, [14, 4], zB, zA);
      const aRoads = [A.R1, A.R2, A.T1.road, A.T2.road];
      const bRoads = [B.R1, B.R2, B.T1.road, B.T2.road];
      return {
        roads, machines, keys: [], gates: [], occluders: [], visuals,
        spawn: () => ({ road: A.R1, s: 1, dir: 1 }),
        solve(wheel, out) {
          out.cad = 80;
          const onA = aRoads.includes(wheel.road);
          const farA = wheel.road === A.R2 || wheel.road === A.T1.road || (wheel.road === A.R1 && wheel.s < 6);
          A.T2.driveTo(onA && farA ? -90 : null);
          const onB = bRoads.includes(wheel.road);
          const farB = wheel.road === B.R1 || wheel.road === B.T2.road || (wheel.road === B.R2 && wheel.s < 0.5);
          B.T1.driveTo(onB && farB ? -90 : null);
        },
      };
    },
  }),

  'n-pool': (chapter, chapterIndex) => ({
    id: 'n-pool', item: 'n-pool', name: 'What the pool says', chapter, chapterIndex,
    theme: 'garden', yaws: [0], cruise: [60, 95], terrain: { strip: true }, scenery: false,
    hints: {
      nudge: 'Ease under 74 rpm so the water goes still — the reflected sky road becomes real and carries you home.',
      explain: 'What still water reflects is real. Pedal calmly (under 74 rpm) so the reflection of the overhead road solidifies into a bridge to the pier.',
    },
    center: [1.5, -1, 1], pts: [[-1.6, -3.6, 0], [7.6, 0.6, 0], [2, 5.8, 0], [-2.8, -1.6, 5], [-1, -4.8, 5]],
    build(): BuiltSimLevel {
      const wz = -0.04, h = 4.8;
      const A = new SimRoad(loopPts(-1, -3, 7, 0, 0, 0.8), { id: 'A', closed: true, palHex: '#F3E6C4' });
      const pool = createPool({ id: 'pool', calm: 74 });
      const wt = ftur([3.0, 0, 0.006], [-1, 0, 0], UP_SKETCH).turn(1, -90).fwd(1.4);
      const W = new SimRoad(wt.pts, { id: 'W', noDeck: true, noLane: true, isReflection: true });
      const G = new SimRoad(L3([2.0, 2.4, 0.006], [2.0, 5.4, 0.006], UP_SKETCH), { id: 'G', goal: true });
      A.forks.push({ s: sAt(A, [3.0, 0, 0]), dir: 1, to: W, toK: 0, when: () => pool.still(), text: 'Still water formed a road' });
      const sky = ftur([3.8, 0, 0.006], [-1, 0, 0], UP_SKETCH).fwd(0.8).turn(1, -90).fwd(2.2);
      const skyPts = sky.pts.map((q) => q.p);
      const visuals: VisualProp[] = [
        { kind: 'box', x0: -1.6, y0: -3.6, z0: -0.5, x1: 0.2, y1: 0.6, z1: -0.02, pal: 'turf' },
        { kind: 'box', x0: 3.8, y0: -3.6, z0: -0.5, x1: 7.6, y1: 0.6, z1: -0.02, pal: 'turf' },
        { kind: 'box', x0: 0.2, y0: -3.6, z0: -0.5, x1: 3.8, y1: -1.1, z1: -0.02, pal: 'turf' },
        { kind: 'box', x0: 1.4, y0: 2.4, z0: -0.5, x1: 2.6, y1: 5.8, z1: -0.02, pal: 'stone' },
        { kind: 'pool', machineId: pool.m.id, pool: [0.4, -0.9, 3.6, 2.4], wz, skyRoadPts: skyPts, skyRoadH: h },
      ];
      return {
        roads: [A, W, G], machines: [pool.m], keys: [], gates: [], occluders: [], visuals,
        anchors: [[3.8 - h, -h, 1.1], [skyPts[skyPts.length - 1][0] - h, skyPts[skyPts.length - 1][1] - h, 1.1]],
        spawn: () => ({ road: A, s: 1, dir: 1 }),
        hudTarget: () => ({ cadence: { min: 52, max: 73, label: 'Still water' } }),
        solve(_w, out) { out.cad = 65; },
      };
    },
  }),

  'n-pool2': (chapter, chapterIndex) => ({
    id: 'n-pool2', item: 'n-pool2', name: 'Break the mirror', chapter, chapterIndex,
    theme: 'garden', yaws: [0], cruise: [60, 95], scenery: false,
    hints: {
      nudge: 'Spin above 86 rpm to ruffle the water and shatter the reflected portcullis blocking the road home.',
      explain: 'Still water makes the overhead portcullis real across the road. Pedal briskly (>86 rpm) so wind ruffles the pool and breaks the gate.',
    },
    center: [1, -1.5, 1], pts: [[-7.6, -4, 0], [-7.6, 0.6, 0], [9.4, -2.3, 0], [-1, -6.5, 5], [5.8, 1, 0]],
    build(): BuiltSimLevel {
      const wz = -0.04;
      const A = new SimRoad(loopPts(-7, -3.4, -1, 0, 0, 0.8), { id: 'A', closed: true, palHex: '#F3E6C4' });
      const X = new SimRoad(L3([-1, -1.7, 0.006], [9, -1.7, 0.006], UP_SKETCH), { id: 'X', goal: true, palHex: '#F3E6C4' });
      const pool = createPool({ id: 'pool', calm: 78 });
      A.forks.push({ s: sAt(A, [-1, -1.7, 0]), dir: 1, to: X, toK: 0, when: () => pool.ruffled(), text: 'Ruffled water broke the gate' });
      const visuals: VisualProp[] = [
        { kind: 'loopSlab', x0: -7.6, y0: -4, x1: -0.4, y1: 0.6, z: -0.5, w: 1, pal: 'turf' },
        { kind: 'box', x0: -0.4, y0: -2.3, z0: -0.5, x1: 1.2, y1: -1.1, z1: -0.02, pal: 'stone' },
        { kind: 'box', x0: 5.8, y0: -2.3, z0: -0.5, x1: 9.4, y1: -1.1, z1: -0.02, pal: 'stone' },
        { kind: 'pool', machineId: pool.m.id, pool: [1.2, -3.2, 5.8, 1.0], wz, gate: { pos: [3.5, -1.7, 0], axis: 'x', h0: 3.2, h1: 4.2 } },
      ];
      return {
        roads: [A, X], machines: [pool.m], keys: [], gates: [], occluders: [], visuals,
        spawn: () => ({ road: A, s: 1, dir: 1 }),
        hudTarget: () => ({ cadence: { min: 86, label: 'Ruffle pool' } }),
        solve(_w, out) { out.cad = 92; },
      };
    },
  }),

  'w-doors': (chapter, chapterIndex) => ({
    id: 'w-doors', item: 'w-doors', name: 'Through the door, past the gate', chapter, chapterIndex,
    theme: 'garden', yaws: [0], cruise: [62, 95], terrain: { strip: true }, scenery: false,
    hints: {
      nudge: 'Match the doorway banner (A) to teleport across, then spin above 86 rpm to shatter the pool gate.',
      explain: 'Press A until the banners match to ride through the portal onto the far loop. Then spin above 86 rpm to ruffle the pool and clear the reflected portcullis.',
    },
    center: [0, -1.5, 1], pts: [[-7.6, -4, 0], [-7.6, 0.6, 0], [8.9, -5.5, 0], [4, 4.3, 0], [-4, 0, 2.4], [-3.5, -5.3, 7.5]],
    build(): BuiltSimLevel {
      const wz = -0.04, off = 6.5, h1 = off + 2 * wz, h0 = h1 - 1.0;
      const A = new SimRoad(loopPts(-7, -3.4, -1, 0, 0, 0.8), { id: 'A', closed: true, palHex: '#F3E6C4', stationIndex: 0 });
      const X2 = new SimRoad(L3([2.0, -5, 0.006], [3.4, -5, 0.006], UP_SKETCH), { id: 'X2', palHex: '#F3E6C4' });
      const S2 = new SimRoad(loopPts(2.4, -5, 8.4, -2.0, 0, 0.8), { id: 'S2', closed: true, palHex: '#F3E6C4', stationIndex: 1 });
      X2.joins.push({ k: 1, to: S2, s: sAt(S2, [3.4, -5, 0]), dir: 1 });
      const doors = createDoors({ id: 'doors', road: A, at: [-4, 0], to: X2, want: 1, key: 'a', btn: [0, 1.3] });
      const E = new SimRoad(ftur([5.0, -2.0, 0.006], [-1, 0, 0], UP_SKETCH).turn(1, -90).fwd(5).pts, { id: 'E', goal: true, palHex: '#F3E6C4' });
      const pool = createPool({ id: 'pool', calm: 78 });
      S2.forks.push({ s: sAt(S2, [5.0, -2.0, 0]), dir: 1, to: E, toK: 0, when: () => pool.ruffled(), text: 'Gate shattered — rolling home' });
      const visuals: VisualProp[] = [
        { kind: 'loopSlab', x0: -7.6, y0: -4, x1: -0.4, y1: 0.6, z: -0.5, w: 1, pal: 'turf' },
        { kind: 'box', x0: 2.0, y0: -5.5, z0: -0.5, x1: 2.8, y1: -1.4, z1: -0.02, pal: 'stone' },
        { kind: 'box', x0: 5.2, y0: -5.5, z0: -0.5, x1: 8.9, y1: -1.4, z1: -0.02, pal: 'stone' },
        { kind: 'box', x0: 2.8, y0: -5.5, z0: -0.5, x1: 5.2, y1: -1.7, z1: -0.02, pal: 'stone' },
        { kind: 'box', x0: 3.45, y0: 2.6, z0: -0.5, x1: 4.55, y1: 4.3, z1: -0.02, pal: 'stone' },
        { kind: 'doorPair', machineId: doors.m!.id, near: [-4, 0, 0], nearAng: 0, far: [2.0, -5, 0], farAng: Math.PI, banners: [...DOOR_BANNERS], want: 1 },
        { kind: 'pool', machineId: pool.m.id, pool: [3.0, -1.5, 5.0, 2.6], wz, gate: { pos: [4.0, 1.2, 0], axis: 'y', h0, h1 } },
      ];
      let cd = 0;
      return {
        roads: [A, X2, S2, E], machines: [doors.m!, pool.m], keys: [], gates: [], occluders: [], visuals,
        anchors: [[3.0 - off, 1.2 - off, 1.1], [5.0 - off, 1.2 - off, 1.1]],
        spawn: () => ({ road: A, s: 1, dir: 1 }),
        hudTarget(wheel) {
          if (wheel.road === S2 || wheel.road === E) return { cadence: { min: 86, label: 'Break gate' } };
          return { focusMachine: doors.m!.id };
        },
        solve(wheel, out) {
          out.cad = wheel.road === S2 || wheel.road === E ? 92 : 80;
          if (!doors.match() && --cd <= 0) { doors.stepBanner(); cd = 15; }
        },
      };
    },
  }),

  'p-mirror': (chapter, chapterIndex) => ({
    id: 'p-mirror', item: 'p-mirror', name: 'Break it, then still it', chapter, chapterIndex,
    theme: 'garden', yaws: [0], cruise: [62, 95],
    terrain: { anchors: [[-2.68, -7.18, 1.1], [-2.68, -4.78, 1.1], [0.7, -6.7, 1.1], [2.5, -8.6, 1.1]] },
    scenery: false,
    hints: {
      nudge: 'Spin above 86 rpm on the first loop to break the gate, then ease under 76 rpm on the far loop so the pool reveals the road home.',
      explain: 'One pool, two reflections: sprint (>86 rpm) to shatter the portcullis and cross over, then spin gently (<76 rpm) so the overhead road materializes on the still water.',
    },
    center: [1.5, -2, 1],
    pts: [[-7.6, -4, 0], [-7.6, 0.6, 0], [10.6, -2.3, 0], [10.6, 3.2, 0], [7, -7.6, 0], [3.4, 3.2, 0], [-2.7, -6.8, 4.8], [0.7, -6.7, 5], [2.5, -8.6, 5]],
    build(): BuiltSimLevel {
      const wz = -0.04, h = 5, yr = -1.7;
      const A = new SimRoad(loopPts(-7, -3.4, -1, 0, 0, 0.8), { id: 'A', closed: true, palHex: '#F3E6C4', stationIndex: 0 });
      const C = new SimRoad(loopPts(4, yr, 10, 2.6, 0, 0.8), { id: 'C', closed: true, palHex: '#F3E6C4', stationIndex: 1 });
      const X = new SimRoad(L3([-1, yr, 0.006], [5, yr, 0.006], UP_SKETCH), { id: 'X', palHex: '#F3E6C4' });
      X.joins.push({ k: 1, to: C, s: sAt(C, [5, yr, 0]), dir: 1 });
      const wt = ftur([6.5, yr, 0.006], [1, 0, 0], UP_SKETCH).turn(1, -90).fwd(0.9);
      const W = new SimRoad(wt.pts, { id: 'W', noDeck: true, noLane: true, isReflection: true });
      const we = wt.pts[wt.pts.length - 1].p;
      const G = new SimRoad(L3([we[0], we[1], 0.006], [we[0], -7.6, 0.006], UP_SKETCH), { id: 'G', goal: true });
      const pool = createPool({ id: 'pool', calm: 78 });
      A.forks.push({ s: sAt(A, [-1, yr, 0]), dir: 1, to: X, toK: 0, when: () => pool.ruffled(), text: 'Gate broken — crossing pool' });
      C.forks.push({ s: sAt(C, [6.5, yr, 0]), dir: 1, to: W, toK: 0, when: () => pool.still(), text: 'Still water formed the road home' });
      const sky = ftur([5.7, yr, 0.006], [1, 0, 0], UP_SKETCH).fwd(0.8).turn(1, -90).fwd(0.9).pts.map((q) => q.p);
      const visuals: VisualProp[] = [
        { kind: 'pool', machineId: pool.m.id, pool: [0.2, -3.6, 9.3, 1.8], wz, skyRoadPts: sky, skyRoadH: h, gate: { pos: [1.6, -1.7, 0], axis: 'x', h0: 3.2, h1: 4.2 } },
      ];
      return {
        roads: [A, X, C, W, G], machines: [pool.m], keys: [], gates: [], occluders: [], visuals,
        spawn: () => ({ road: A, s: 1, dir: 1 }),
        hudTarget(wheel) {
          return wheel.road === A
            ? { cadence: { min: 86, label: 'Break gate' } }
            : { cadence: { min: 52, max: 76, label: 'Still water' } };
        },
        solve(wheel, out) { out.cad = wheel.road === A ? 92 : 64; },
      };
    },
  }),
};
