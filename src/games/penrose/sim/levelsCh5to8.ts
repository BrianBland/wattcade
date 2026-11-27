/**
 * Pure strict-TypeScript hand-built levels for Chapters 5–8:
 * Ch 5 · Tide & Wind: m-tide, c-tide, m-wind, t-mast, w-vane
 * Ch 6 · Gravity & Architecture: g-wall, n-seam, w-seam, g-under, mobius, w-canopy
 * Ch 7 · Sight & Illusion: n-friend, c-bridge, p-turn, m-gyro, c-towers, s-behind
 * Ch 8 · Grand Composed: w-lanes, d-lanes
 */

import {
  behindSketch, clamp, DEG, dir2D, makeIsoBasis, matFromPosRotX, matFromPosRotY, UP_SKETCH, V,
  type Mat4, type OccluderBox, type Vec3,
} from './math';
import { cutSamples, ftur, L3, loopPts, sAt, SimRoad, stairPts, turtle } from './road';
import {
  addLiveGap, createCadenceLift, createCameraCrank, createClutchBridge, createCompanion,
  createConveyor, createDoors, createDrawbridge, createPool, createSeam, createTide,
  createTurntable, createWindSock,
} from './machines';
import { createDoorStation, createStudyKit } from './levelKit';
import type { BuiltSimLevel, SimLevelDef, SimMachine, VisualProp, WheelState } from './types';

export const CH5_TO_8_LEVELS: Record<string, (chapter: string, chapterIndex: number) => SimLevelDef> = {
  /* ===================== CHAPTER 5: TIDE & WIND ===================== */

  'm-tide': (chapter, chapterIndex) => ({
    id: 'm-tide', item: 'm-tide', name: 'The tide follows you', chapter, chapterIndex,
    theme: 'town', yaws: [0], cruise: [70, 92],
    hints: {
      nudge: 'No button: push hard (Z4) to bring the tide up to your quay and board the raft, then ease off (Z1–Z2) to float down to the lower quay.',
      explain: 'The sea tracks your rolling average effort. Ride hard to raise high tide and board the raft, then spin easy so the tide ebbs down to the goal quay.',
    },
    center: [1, 0, 0.4],
    pts: [[-7.1, -1.7, 0], [10.8, -1.7, 0], [-7.1, 1.9, 1.6], [10.8, -0.7, -2.4], [-3.8, 0.1, 3.4], [-11, -6, -1], [12, 6, -1]],
    pad: 0.6,
    build(): BuiltSimLevel {
      const HI = 1.6;
      const tide = createTide({ id: 'tide', hi: HI });
      const U = new SimRoad(loopPts(-6.6, -1.2, -1, 1.4, HI, 0.6), { id: 'U', closed: true });
      const armW = new SimRoad(L3([-1.6, -1.2, 0.006], [2.6, -1.2, 0.006], UP_SKETCH), { id: 'armW', transform: tide.m.transform, groupId: tide.groupId, palHex: '#E8C9A0' });
      const R0 = new SimRoad(loopPts(1.2, -1.2, 4, 1.5, 0, 0.8), { id: 'R0', closed: true, transform: tide.m.transform, groupId: tide.groupId, palHex: '#E8C9A0' });
      armW.joins.push({ k: 1, to: R0, s: sAt(R0, [2.6, -1.2, 0]) + 0.02, dir: 1 });
      const armE = new SimRoad(L3([3.2, -1.2, 0.006], [5.6, -1.2, 0.006], UP_SKETCH), { id: 'armE', transform: tide.m.transform, groupId: tide.groupId, palHex: '#E8C9A0' });
      U.forks.push({ s: sAt(U, [-1.6, -1.2, HI]), dir: 1, to: armW, toK: 0, when: () => tide.z() === HI, text: 'High tide — boarding the raft' });
      R0.forks.push({ s: sAt(R0, [3.2, -1.2, 0]), dir: 1, to: armE, toK: 0, when: () => tide.z() === 0, text: 'Low tide — raft meets the quay' });
      const low = new SimRoad(L3([5.6, -1.2, 0], [10.5, -1.2, 0], UP_SKETCH), { id: 'low', goal: true });
      const z = HI - 0.5;
      const visuals: VisualProp[] = [
        { kind: 'box', x0: -7.1, y0: -1.7, z0: z - 1.9, x1: -2, y1: -0.7, z1: z, pal: 'stone' },
        { kind: 'box', x0: -7.1, y0: 0.9, z0: z - 1.9, x1: -0.5, y1: 1.9, z1: z, pal: 'stone' },
        { kind: 'box', x0: -7.1, y0: -0.7, z0: z - 1.9, x1: -6.1, y1: 0.9, z1: z, pal: 'stone' },
        { kind: 'box', x0: -1.5, y0: -0.4, z0: z - 1.9, x1: -0.5, y1: 0.9, z1: z, pal: 'stone' },
        { kind: 'box', x0: -0.4, y0: -1.7, z0: -0.5, x1: 4.6, y1: 2, z1: -0.2, pal: '#B98552', groupId: tide.groupId },
        { kind: 'box', x0: 5.6, y0: -1.7, z0: -2.4, x1: 10.8, y1: -0.7, z1: -0.5, pal: 'deck' },
        { kind: 'sea', x0: -11, y0: -6, x1: 12, y1: 6, machineId: tide.m.id, gaugeX: -3.8, gaugeY: 0.1, hi: HI },
      ];
      return {
        roads: [U, armW, R0, armE, low], machines: [tide.m], keys: [], gates: [], occluders: [], visuals,
        spawn: () => ({ road: U, s: 1, dir: 1 }),
        tideLevel: () => tide.frac(),
        hudTarget(wheel) {
          const onRaft = wheel.road === armW || wheel.road === R0 || wheel.road === armE || wheel.road === low;
          return {
            zone: onRaft
              ? { min: 1, max: 2, label: 'Ebb tide', source: 'power' }
              : { min: 4, max: 5, label: 'Raise tide', source: 'power' },
          };
        },
        solve(wheel, out) {
          const on = wheel.road === armW || wheel.road === R0 || wheel.road === armE || wheel.road === low;
          out.cad = on ? 68 : 95;
          out.ftp = on ? 0.45 : 1.25;
        },
      };
    },
  }),

  'c-tide': (chapter, chapterIndex) => ({
    id: 'c-tide', item: 'c-tide', name: 'Low tide, high road', chapter, chapterIndex,
    theme: 'town', yaws: [0, 90], cruise: [70, 92],
    hints: {
      nudge: 'Push hard to board the raft at high tide, ease off for low tide, then turn the camera (Y) 90° so the raft meets the lighthouse road.',
      explain: 'Going down is the way up: ride hard to raise high tide and board, ease off to sink to low tide, then turn the camera (Y) a quarter turn to align with the high lighthouse.',
    },
    center: [1, 0, 0.4],
    pts: [[-7.1, -1.7, 0], [10.8, -1.7, 0], [-7.1, 1.9, 1.6], [10.8, -0.7, -2.4], [-3.8, 0.1, 3.4], [-11, -6, -1], [12, 6, -1], [14.5, -5.2, 4.5], [13.7, -5.7, -3]],
    pad: 0.6,
    build(): BuiltSimLevel {
      const HI = 1.6;
      const tide = createTide({ id: 'tide', hi: HI });
      const U = new SimRoad(loopPts(-6.6, -1.2, -1, 1.4, HI, 0.6), { id: 'U', closed: true });
      const armW = new SimRoad(L3([-1.6, -1.2, 0.006], [2.6, -1.2, 0.006], UP_SKETCH), { id: 'armW', transform: tide.m.transform, groupId: tide.groupId, palHex: '#E8C9A0' });
      const R0 = new SimRoad(loopPts(1.2, -1.2, 4, 1.5, 0, 0.8), { id: 'R0', closed: true, transform: tide.m.transform, groupId: tide.groupId, palHex: '#E8C9A0' });
      armW.joins.push({ k: 1, to: R0, s: sAt(R0, [2.6, -1.2, 0]) + 0.02, dir: 1 });
      const armE = new SimRoad(L3([3.2, -1.2, 0.006], [5.6, -1.2, 0.006], UP_SKETCH), { id: 'armE', transform: tide.m.transform, groupId: tide.groupId, palHex: '#E8C9A0' });
      U.forks.push({ s: sAt(U, [-1.6, -1.2, HI]), dir: 1, to: armW, toK: 0, when: () => tide.z() === HI, text: 'High tide — boarding' });
      R0.forks.push({ s: sAt(R0, [3.2, -1.2, 0]), dir: 1, to: armE, toK: 0, when: () => tide.z() === 0, text: 'Low tide — raft aligned' });
      const LH = behindSketch([5.6, -1.2, 0], 90, -4.5);
      const low = new SimRoad(L3(LH, [LH[0] + 4.4, LH[1], LH[2]], UP_SKETCH), { id: 'low', goal: true });
      const cam = createCameraCrank({ id: 'cam', key: 'y', name: 'Camera', at: [-4, 4, 0], detents: [0, 90] });
      const z = HI - 0.5;
      const visuals: VisualProp[] = [
        { kind: 'box', x0: -7.1, y0: -1.7, z0: z - 1.9, x1: -2, y1: -0.7, z1: z, pal: 'stone' },
        { kind: 'box', x0: -7.1, y0: 0.9, z0: z - 1.9, x1: -0.5, y1: 1.9, z1: z, pal: 'stone' },
        { kind: 'box', x0: -7.1, y0: -0.7, z0: z - 1.9, x1: -6.1, y1: 0.9, z1: z, pal: 'stone' },
        { kind: 'box', x0: -1.5, y0: -0.4, z0: z - 1.9, x1: -0.5, y1: 0.9, z1: z, pal: 'stone' },
        { kind: 'box', x0: -0.4, y0: -1.7, z0: -0.5, x1: 4.6, y1: 2, z1: -0.2, pal: '#B98552', groupId: tide.groupId },
        { kind: 'box', x0: LH[0] - 0.2, y0: LH[1] - 0.5, z0: LH[2] - 0.9, x1: LH[0] + 2.6, y1: LH[1] + 0.5, z1: LH[2] - 0.5, pal: 'deck' },
        { kind: 'lighthouse', x: LH[0] + 3.6, y: LH[1], z0: -3, z1: LH[2] - 0.52, r: 0.75 },
        { kind: 'sea', x0: -11, y0: -6, x1: 12, y1: 6, machineId: tide.m.id, gaugeX: -3.8, gaugeY: 0.1, hi: HI },
        { kind: 'cameraDial', machineId: cam.m.id, pos: [-4, 4, 0], detents: [0, 90] },
      ];
      return {
        roads: [U, armW, R0, armE, low], machines: [tide.m, cam.m], keys: [], gates: [], occluders: [], visuals,
        spawn: () => ({ road: U, s: 1, dir: 1 }),
        tideLevel: () => tide.frac(),
        hudTarget(wheel) {
          if (wheel.road === R0 && tide.z() === 0) return { focusMachine: cam.m.id, hintNudge: 'Turn the camera (Y) 90° to join the lighthouse road!' };
          const onRaft = wheel.road === armW || wheel.road === R0 || wheel.road === armE || wheel.road === low;
          return {
            zone: onRaft
              ? { min: 1, max: 2, label: 'Ebb tide', source: 'power' }
              : { min: 4, max: 5, label: 'Raise tide', source: 'power' },
          };
        },
        solve(wheel, out) {
          const on = wheel.road === armW || wheel.road === R0 || wheel.road === armE || wheel.road === low;
          out.cad = on ? 68 : 95;
          out.ftp = on ? 0.45 : 1.25;
          const want = (wheel.road === R0 && tide.z() === 0) || wheel.road === armE || wheel.road === low ? 90 : 0;
          cam.driveTo(want);
        },
      };
    },
  }),

  'm-wind': (chapter, chapterIndex) => ({
    id: 'm-wind', item: 'm-wind', name: 'Into the wind', chapter, chapterIndex,
    theme: 'prism', yaws: [0], cruise: [70, 92],
    hints: {
      nudge: 'Turn the wind sock (Y) until the wind blows from the north — the windmill spins and lowers the drawbridge.',
      explain: 'Y rotates the wind 90°. Riding into a headwind is heavier; riding with a tailwind is lighter. Face the wind north to power the windmill and lower the bridge.',
      focusMachine: 'wind',
    },
    center: [-1, 4.5, 0.2],
    pts: [[-6.5, -1.5, 0], [2, -1.5, 0], [2.6, 11.9, 0], [-6.5, 7.1, 0], [-0.8, 5.2, 4], [-4, 3.6, 1.7], [-6.5, -1.5, -2.4], [2.6, 11.9, -2.4]],
    pad: 1,
    build(): BuiltSimLevel {
      let curWheel: WheelState | null = null;
      let bridgeRotX = 1.1;
      const wind = createWindSock({
        id: 'wind', key: 'y', x: -4, y: 3.6, a0: 180,
        getWheelHeading: () => (curWheel?.mode === 'road' ? curWheel.heading : null),
      });
      const S = new SimRoad(loopPts(-6, -1, 1.5, 6.6, 0, 0.6), { id: 'S', closed: true });
      const brMat = (): Mat4 => matFromPosRotX(V(1.5, 8.2, 0), bridgeRotX);
      const bridge = new SimRoad(L3([0, -2.2, 0], [0, 0, 0], UP_SKETCH), { id: 'bridge', transform: brMat, groupId: 'g_mw_bridge', palHex: '#C98B5B' });
      S.forks.push({ s: sAt(S, [1.5, 6, 0]), dir: 1, to: bridge, toK: 0, when: () => bridgeRotX === 0, text: 'Drawbridge lowered — ride into the wind' });
      const home = new SimRoad(L3([1.5, 8.2, 0], [1.5, 11.8, 0], UP_SKETCH), { id: 'home', goal: true, landDir: 1 });
      const visuals: VisualProp[] = [
        { kind: 'loopSlab', x0: -6.5, y0: -1.5, x1: 2, y1: 7.1, z: -0.5, w: 1, pal: 'stone' },
        { kind: 'box', x0: 0.4, y0: 8.2, z0: -2.4, x1: 2.6, y1: 11.9, z1: -0.5, pal: 'stone' },
        { kind: 'box', x0: -1.3, y0: 4.1, z0: -2.4, x1: -0.3, y1: 5.1, z1: 2.6, pal: 'accent' },
        { kind: 'windmill', x: -0.8, y: 5.2, z: 2.2, machineId: wind.m.id },
        { kind: 'windSockVisual', machineId: wind.m.id, x: -4, y: 3.6, z: 0 },
      ];
      return {
        roads: [S, bridge, home], machines: [wind.m], keys: [], gates: [], occluders: [], visuals,
        spawn: () => ({ road: S, s: 1, dir: 1 }),
        onTick(dt, wheel) {
          curWheel = wheel;
          const north = wind.at(90);
          bridgeRotX += clamp((north ? 0 : 1.1) - bridgeRotX, -0.8 * dt, 0.8 * dt);
          if (Math.abs(bridgeRotX) < 0.01) bridgeRotX = 0;
        },
        hudTarget: () => ({ focusMachine: wind.m.id }),
        solve(_w, out) { out.cad = 80; wind.driveTo(90); },
      };
    },
  }),

  't-mast': (chapter, chapterIndex) => ({
    id: 't-mast', item: 't-mast', name: 'Spring tide', chapter, chapterIndex,
    theme: 'town', yaws: [0], cruise: [70, 92],
    hints: {
      nudge: 'Push hard to raise the tide and board the raft, then ease off: at low tide the raft mast aligns with the lighthouse wall.',
      explain: 'At high tide the raft meets your quay. Once aboard, ease off to let the tide ebb: the wheel climbs the mast and crosses straight up the distant lighthouse wall.',
    },
    center: [-1, -1, 1],
    pts: [[-7.1, -1.7, 0], [4.6, 2.2, 0], [-7.1, 1.9, 1.6], [-0.2, 1.5, 6.2], [-6, -3, 4.2], [4.6, -1.7, -1]],
    build(): BuiltSimLevel {
      const HI = 1.6;
      const tide = createTide({ id: 'tide', hi: HI });
      const U = new SimRoad(loopPts(-6.6, -1.2, -1, 1.4, HI, 0.6), { id: 'U', closed: true });
      const armW = new SimRoad(L3([-1.6, -1.2, 0.006], [2.6, -1.2, 0.006], UP_SKETCH), { id: 'armW', transform: tide.m.transform, groupId: tide.groupId, palHex: '#E8C9A0' });
      const R0 = new SimRoad(loopPts(1.2, -1.2, 4, 1.5, 0, 0.8), { id: 'R0', closed: true, transform: tide.m.transform, groupId: tide.groupId, palHex: '#E8C9A0' });
      armW.joins.push({ k: 1, to: R0, s: sAt(R0, [2.6, -1.2, 0]) + 0.02, dir: 1 });
      U.forks.push({ s: sAt(U, [-1.6, -1.2, HI]), dir: 1, to: armW, toK: 0, when: () => tide.z() === HI, text: 'High tide — boarding raft' });
      const mr = ftur([2, 1.5, 0.006], [-1, 0, 0], UP_SKETCH).fwd(1.4).curl(0.8, 90).fwd(4);
      const mast = new SimRoad(mr.pts, { id: 'mast', transform: tide.m.transform, groupId: tide.groupId, palHex: '#E8C9A0', edgeText: 'Wait for low tide so the mast aligns' });
      R0.forks.push({ s: sAt(R0, [2, 1.5, 0]), dir: 1, to: mast, toK: 0, when: () => tide.z() === 0, text: 'Low tide — climbing the mast' });
      const E = mr.st.p, S0 = behindSketch(E, 0, 4.5);
      const lh = ftur(S0, [0, 0, 1], [1, 0, 0]).fwd(2.6).curl(0.5, -90).fwd(1.8);
      const roofZ = lh.st.p[2];
      const home = new SimRoad(lh.pts, { id: 'home', goal: true, palHex: '#E8C9A0' });
      const z = HI - 0.5, mx = 0.6 - 0.8, mtop = mr.st.p[2];
      const visuals: VisualProp[] = [
        { kind: 'box', x0: -7.1, y0: -1.7, z0: z - 1.9, x1: -2, y1: -0.7, z1: z, pal: 'stone' },
        { kind: 'box', x0: -7.1, y0: 0.9, z0: z - 1.9, x1: -0.5, y1: 1.9, z1: z, pal: 'stone' },
        { kind: 'box', x0: -7.1, y0: -0.7, z0: z - 1.9, x1: -6.1, y1: 0.9, z1: z, pal: 'stone' },
        { kind: 'box', x0: -1.5, y0: -0.4, z0: z - 1.9, x1: -0.5, y1: 0.9, z1: z, pal: 'stone' },
        { kind: 'box', x0: -1.5, y0: -1.7, z0: -0.5, x1: 4.6, y1: 2.2, z1: -0.2, pal: '#B98552', groupId: tide.groupId },
        { kind: 'box', x0: mx - 1.1, y0: 0.9, z0: -0.2, x1: mx - 0.02, y1: 2.1, z1: mtop, pal: '#C98B5B', groupId: tide.groupId },
        { kind: 'lighthouse', x: S0[0] - 1.4, y: S0[1], z0: -3, z1: roofZ - 0.5, r: 1.38 },
        { kind: 'box', x0: S0[0] - 0.5, y0: S0[1] - 0.6, z0: -3, x1: S0[0] - 0.02, y1: S0[1] + 0.6, z1: roofZ - 0.5, pal: 'stone' },
        { kind: 'sea', x0: -11, y0: -7, x1: 12, y1: 6, machineId: tide.m.id, gaugeX: -3.8, gaugeY: 0.1, hi: HI },
      ];
      return {
        roads: [U, armW, R0, mast, home], machines: [tide.m], keys: [], gates: [], occluders: [], visuals,
        spawn: () => ({ road: U, s: 1, dir: 1 }),
        tideLevel: () => tide.frac(),
        hudTarget(wheel) {
          const on = wheel.road === R0 || wheel.road === mast || wheel.road === home;
          return { zone: on ? { min: 1, max: 2, label: 'Ebb tide', source: 'power' } : { min: 4, max: 5, label: 'Raise tide', source: 'power' } };
        },
        solve(wheel, out) {
          const on = wheel.road === R0 || wheel.road === mast || wheel.road === home;
          out.cad = on ? 68 : 95; out.ftp = on ? 0.45 : 1.25;
        },
      };
    },
  }),

  'w-vane': (chapter, chapterIndex) => ({
    id: 'w-vane', item: 'w-vane', name: 'Weathervane wall', chapter, chapterIndex,
    theme: 'prism', yaws: [0], cruise: [70, 92],
    hints: {
      nudge: 'Turn the wind sock (Y) until the wind blows from the south — the weathervane aligns along the wall to the roof.',
      explain: 'The weathervane always points downwind. Rotate the wind (Y) so it blows from the south; the vane bridges onto the north face with a tailwind behind you.',
      focusMachine: 'wind',
    },
    center: [0, 3, 1.5], pts: [[-2.8, -1.2, -3], [0, 7, 5.6], [4.2, 1.2, 1.4], [-2.8, 7, 5.6], [0, -1.2, -3]], pad: 1.4,
    build(): BuiltSimLevel {
      let curWheel: WheelState | null = null;
      const wl = ftur([0, 3, 1], [0, 1, 0], [1, 0, 0]).fwd(1.3).turn(0.7, 90).fwd(1.6).turn(0.7, 90).fwd(2.6).turn(0.7, 90).fwd(1.6).turn(0.7, 90).fwd(1.3);
      const WL = new SimRoad(wl.pts, { id: 'WL', closed: true, palHex: '#F2D49B' });
      const wind = createWindSock({
        id: 'wind', key: 'y', x: 4.2, y: 1.2, a0: 180,
        getWheelHeading: () => (curWheel?.mode === 'road' ? curWheel.heading : null),
      });
      const vaneMat = (): Mat4 => matFromPosRotX(V(0.03, 4.3, 1), (270 - wind.ang()) * DEG);
      const vnRoad = new SimRoad(L3([0, 0, 0], [0, 2.4, 0], [1, 0, 0]), {
        id: 'vane', transform: vaneMat, groupId: 'g_vane', edgeText: 'The vane pointed into mid-air',
      });
      WL.forks.push({ s: sAt(WL, [0, 4.3, 1]), dir: 1, to: vnRoad, toK: 0, when: () => wind.at(270), text: 'Vane aligned — climbing the corner' });
      const n1 = ftur([0, 6.7, 1], [0, 1, 0], [1, 0, 0]).curl(0.3, -90).fwd(0.6).turn(0.6, 90).fwd(3.2).curl(0.4, -90).fwd(1.6);
      const home = new SimRoad(n1.pts, { id: 'home', goal: true, palHex: '#F2D49B' });
      const roof = n1.st.p[2] - 0.5;
      const visuals: VisualProp[] = [
        { kind: 'box', x0: -2.8, y0: -1.2, z0: -3, x1: -0.02, y1: 6.68, z1: roof, pal: 'stone' },
        { kind: 'box', x0: -2.8, y0: 6.68, z0: -3, x1: -0.32, y1: 6.98, z1: roof, pal: 'stone' },
        { kind: 'windSockVisual', machineId: wind.m.id, x: 4.2, y: 1.2, z: 0 },
      ];
      return {
        roads: [WL, vnRoad, home], machines: [wind.m], keys: [], gates: [], occluders: [], visuals,
        spawn: () => ({ road: WL, s: 1, dir: 1 }),
        onTick(_dt, wheel) { curWheel = wheel; },
        hudTarget: () => ({ focusMachine: wind.m.id }),
        solve(_w, out) { out.cad = 80; wind.driveTo(270); },
      };
    },
  }),

  /* ===================== CHAPTER 6: GRAVITY & ARCHITECTURE ===================== */

  'g-wall': (chapter, chapterIndex) => ({
    id: 'g-wall', item: 'g-wall', name: 'Up the wall', chapter, chapterIndex,
    theme: 'night', yaws: [0, 90], cruise: [70, 92],
    hints: {
      nudge: 'Lower the drawbridge (A) to ride up the near tower, then turn the camera (Y) 90° so the wall road joins the far tower.',
      explain: 'Lower the drawbridge (A) and the wheel climbs the near wall. Turn the camera (Y) a quarter turn while climbing so the two tower walls connect on screen.',
    },
    center: [1, 3, 1], pts: [[7.5, -1.5, 0], [-1.6, 1.1, 5.5], [2.5, 2.5, -1.4], [-6, 8, 4]], pad: 0.9,
    build(): BuiltSimLevel {
      const G = new SimRoad(loopPts(3, -1, 7, 2, 0, 0.6), { id: 'G', closed: true });
      const br = createDrawbridge({ id: 'br', key: 'a', hinge: [3.6, 2, 0], len: 2.4, raised: true, at: [8.6, -2.2, 0] });
      G.forks.push({ s: sAt(G, [3.6, 2, 0]), dir: 1, to: br.road, toK: 0, when: () => br.down(), text: 'Bridge lowered — climbing wall' });
      const R = 0.8, top1 = 3.4;
      const s1 = ftur([1.2, 2, 0], [-1, 0, 0], UP_SKETCH).fwd(0.6).curl(R, 90).fwd(top1 - R);
      const S1 = new SimRoad(s1.pts, { id: 'S1', palHex: '#CFE3F7', edgeText: 'Turn the camera so the walls meet' });
      const fx = 0.6 - R;
      const E = s1.st.p, S0 = behindSketch(E, 90, 5);
      const s2 = ftur(S0, [0, 0, 1], [1, 0, 0]).fwd(2.6).curl(0.5, -90).fwd(2.2);
      const S2 = new SimRoad(s2.pts, { id: 'S2', palHex: '#CFE3F7' });
      const roofZ = S0[2] + 3.1;
      const home = new SimRoad(L3(s2.st.p, [s2.st.p[0] - 1.4, s2.st.p[1], roofZ], UP_SKETCH), { id: 'home', goal: true });
      const cam = createCameraCrank({ id: 'cam', key: 'y', name: 'Camera', at: [8.6, 3.4, 0], detents: [0, 90] });
      const visuals: VisualProp[] = [
        { kind: 'loopSlab', x0: 2.5, y0: -1.5, x1: 7.5, y1: 2.5, z: -0.5, w: 0.9, pal: 'stone' },
        { kind: 'box', x0: fx - 2.2, y0: 0.8, z0: -2.6, x1: fx - 0.02, y1: 3.2, z1: top1, pal: 'stone' },
        { kind: 'box', x0: S0[0] - 4.6, y0: S0[1] - 1.2, z0: S0[2] - 3.4, x1: S0[0] - 0.02, y1: S0[1] + 1.2, z1: roofZ - 0.5, pal: 'stone' },
        { kind: 'drawbridgeVisual', machineId: br.m.id, hinge: [3.6, 2, 0], len: 2.4, w: 1.4 },
        { kind: 'cameraDial', machineId: cam.m.id, pos: [8.6, 3.4, 0], detents: [0, 90] },
      ];
      return {
        roads: [G, br.road, S1, S2, home], machines: [br.m, cam.m], keys: [], gates: [], occluders: [], visuals,
        spawn: () => ({ road: G, s: 1, dir: 1 }),
        hudTarget(wheel) {
          const climbing = wheel.road === br.road || wheel.road === S1;
          return { focusMachine: climbing ? cam.m.id : br.m.id };
        },
        solve(wheel, out) {
          out.cad = 80;
          const up = wheel.road === br.road || wheel.road === S1 || wheel.road === S2 || wheel.road === home;
          br.driveTo(wheel.road === G ? 0 : null);
          cam.driveTo(up ? 90 : 0);
        },
      };
    },
  }),

  'n-seam': (chapter, chapterIndex) => ({
    id: 'n-seam', item: 'n-seam', name: 'Where down changes', chapter, chapterIndex,
    theme: 'garden', yaws: [0], cruise: [65, 95], scenery: false,
    hints: {
      nudge: 'Press B to light the gravity seam at the foot of the tower — down becomes the wall and you ride right up it.',
      explain: 'Unlit, the tower wall is just a wall. Light the seam (B) and gravity shifts onto the tower face so the wheel climbs around the corner to the goal.',
      focusMachine: 'seam',
    },
    center: [0, -1.5, 1.5], pts: [[-3, -3, 0], [5.6, -5.6, 0], [-0.2, 3, 0], [-3, -3, 3.8], [5.6, 0, 0]],
    build(): BuiltSimLevel {
      const ys = -2.4;
      const A = new SimRoad(loopPts(0.42, -5, 5, -0.6, 0, 0.8), { id: 'A', closed: true, palHex: '#F3E6C4' });
      const t = ftur([0.42, ys, 0.006], [-1, 0, 0], UP_SKETCH).curl(0.4, 90).fwd(1.4).turn(0.6, -90);
      t.fwd(-0.3 - t.st.p[1]).curl(0.32, -90).fwd(0.5).turn(0.6, -90).fwd(t.st.p[2] - 0.5 - 0.4 + 0.1).curl(0.4, 90).fwd(2.6);
      const W = new SimRoad(t.pts, { id: 'W', goal: true, th: 0.12, flatDeck: true, palHex: '#F4E5C6' });
      const sm = createSeam({ id: 'seam', key: 'b', at: [1.6, -5.9, 0] });
      A.forks.push({ s: sAt(A, [0.42, ys, 0]), dir: 1, to: W, toK: 0, when: () => sm.on, text: 'Seam lit — climbing the wall' });
      const visuals: VisualProp[] = [
        { kind: 'box', x0: -3, y0: -3, z0: -0.5, x1: -0.3, y1: 0, z1: 3.6, pal: 'stone' },
        { kind: 'box', x0: -3, y0: -3, z0: -0.5, x1: 0, y1: -0.3, z1: 3.6, pal: 'stone' },
        { kind: 'cyl', x: -0.3, y: -0.3, r: 0.3, z0: -0.5, z1: 3.6, pal: 'stone', seg: 16 },
        { kind: 'box', x0: -3.1, y0: -3.1, z0: 3.6, x1: 0.1, y1: 0.1, z1: 3.75, pal: 'idle' },
        { kind: 'loopSlab', x0: -0.2, y0: -5.6, x1: 5.6, y1: 0, z: -0.5, w: 1, pal: 'turf' },
        { kind: 'seamBar', machineId: sm.id, pos: [0.42, ys, 0.03], axis: 'y' },
      ];
      return {
        roads: [A, W], machines: [sm], keys: [], gates: [], occluders: [], visuals,
        spawn: () => ({ road: A, s: 1, dir: 1 }),
        hudTarget: () => ({ focusMachine: sm.id }),
        solve(_w, out) { out.cad = 80; sm.on = true; },
      };
    },
  }),

  'w-seam': (chapter, chapterIndex) => ({
    id: 'w-seam', item: 'w-seam', name: 'Wind across, climb over', chapter, chapterIndex,
    theme: 'garden', yaws: [0], cruise: [62, 95],
    terrain: { strip: true, anchors: [[-1.5, -1.5, 2.2], [-4.6, -2.4, 1.4]] },
    scenery: false,
    hints: {
      nudge: 'Lock the low bridge (Z) to reach the tower loop, then lock the roof bridge (Y) BEFORE lighting the seam (B) to climb over.',
      explain: 'Three beats: wind and lock the low clutch bridge (Z), then on the tower loop wind and lock the high roof bridge (Y) on its bollards before lighting the seam (B).',
    },
    center: [2, -2, 1.5],
    pts: [[-3, -3, 0], [15, -5, 0], [15, -0.4, 0], [-10, -2.4, 3.6], [-10, -2.4, -1.6], [-3, -3, 3.8], [-0.2, -5.6, 0], [-0.2, 0, 0]],
    build(): BuiltSimLevel {
      const H = 3.6, Rr = 0.38, ys = -2.4;
      const A = new SimRoad(loopPts(9.4, -4.4, 14.4, -1.0, 0, 0.8), { id: 'A', closed: true, palHex: '#F3E6C4', stationIndex: 0 });
      const X1 = new SimRoad(L3([9.4, -2.8, 0.006], [8.4, -2.8, 0.006], UP_SKETCH), { id: 'X1', palHex: '#F3E6C4' });
      const X2 = new SimRoad(L3([6.4, -2.8, 0.006], [5.5, -2.8, 0.006], UP_SKETCH), { id: 'X2', palHex: '#F3E6C4' });
      const T2 = new SimRoad(loopPts(0.42, -5, 5, -0.6, 0, 0.8), { id: 'T2', closed: true, palHex: '#F3E6C4', stationIndex: 1 });
      X2.joins.push({ k: 1, to: T2, s: sAt(T2, [5, -2.8, 0]), dir: 1 });
      const br = createClutchBridge({ id: 'br', key: 'z', from: X1, to: X2, btn: [11.9, -2.7] });
      A.forks.push({ s: sAt(A, [9.4, -2.8, 0]), dir: 1, to: X1, toK: 0, when: () => br.locked(), text: 'Low bridge locked' });
      const t = ftur([0.42, ys, 0.006], [-1, 0, 0], UP_SKETCH).curl(0.4, 90).fwd(H - 0.4 - 0.006 - 0.38).curl(0.4, -90);
      t.fwd(t.st.p[0] + 3);
      const W = new SimRoad(t.pts, { id: 'W', th: 0.12, flatDeck: true, palHex: '#F4E5C6' });
      const zr = t.st.p[2];
      const E = new SimRoad(L3([-6.4, ys, zr], [-9.6, ys, zr], UP_SKETCH), { id: 'E', goal: true });
      const br2 = createClutchBridge({ id: 'br2', key: 'y', from: W, to: E, btn: [3.9, -1.6] });
      const sm = createSeam({ id: 'seam', key: 'b', at: [2.7, -3.4, 0] });
      T2.forks.push({ s: sAt(T2, [0.42, ys, 0]), dir: 1, to: W, toK: 0, when: () => sm.on, text: 'Climbing the tower wall' });
      const visuals: VisualProp[] = [
        { kind: 'loopSlab', x0: 8.8, y0: -5.0, x1: 15.0, y1: -0.4, z: -0.5, w: 1, pal: 'turf' },
        { kind: 'loopSlab', x0: -0.2, y0: -5.6, x1: 6.4, y1: 0, z: -0.5, w: 1, pal: 'turf' },
        { kind: 'box', x0: -3, y0: -3, z0: -2.4, x1: 0, y1: 0, z1: H - Rr, pal: 'stone', keep: true },
        { kind: 'box', x0: -3, y0: -3, z0: H - Rr, x1: -Rr, y1: 0, z1: H, pal: 'stone', keep: true },
        { kind: 'cyl', x: -Rr, y: -1.5, r: Rr, z0: H - Rr - 1.5, z1: H - Rr + 1.5, pal: 'stone', seg: 24, rotX: Math.PI / 2 },
        { kind: 'cyl', x: 11.9, y: -2.7, r: 0.6, z0: -2.4, z1: -0.02, pal: 'stone', seg: 20 },
        { kind: 'cyl', x: 3.9, y: -1.6, r: 0.6, z0: -2.4, z1: -0.02, pal: 'stone', seg: 20 },
        { kind: 'cyl', x: 2.7, y: -3.4, r: 0.6, z0: -2.4, z1: -0.02, pal: 'stone', seg: 20 },
        { kind: 'clutchVisual', machineId: br.m.id, from: X1.end(1).p, to: X2.end(0).p, maxLen: br.max },
        { kind: 'clutchVisual', machineId: br2.m.id, from: W.end(1).p, to: E.end(0).p, maxLen: br2.max },
        { kind: 'seamBar', machineId: sm.id, pos: [0.42, ys, 0.03], axis: 'y' },
      ];
      return {
        roads: [A, X1, X2, T2, W, E], machines: [br.m, br2.m, sm], keys: [], gates: [], occluders: [], visuals,
        spawn: () => ({ road: A, s: 1, dir: 1 }),
        hudTarget(wheel) {
          if (wheel.road === A || wheel.road === X1) return { focusMachine: br.m.id };
          if (wheel.road === T2) return { focusMachine: br2.locked() && br2.spans() ? sm.id : br2.m.id };
          return {};
        },
        solve(wheel, out) {
          out.cad = 80;
          if (wheel.road === A || wheel.road === X1) {
            if (!br.m.on && !br.spans()) br.m.on = true;
            else if (br.m.on && br.len() > br.span + 0.3) br.m.on = false;
          }
          if (wheel.road === T2) {
            if (!br2.m.on && !br2.spans()) br2.m.on = true;
            else if (br2.m.on && br2.len() > br2.span + 0.3) br2.m.on = false;
            if (br2.locked() && br2.spans()) sm.on = true;
          }
        },
      };
    },
  }),

  'g-under': (chapter, chapterIndex) => ({
    id: 'g-under', item: 'g-under', name: 'Underneath', chapter, chapterIndex,
    theme: 'prism', yaws: [0, 90], cruise: [50, 92],
    hints: {
      nudge: 'Ease to ~55 rpm to ride onto the beam; once upside down underneath, spin ~85 rpm and turn the camera (Y) 90° to meet the hanging beam.',
      explain: 'Board the buttonless lift beam at 55 rpm. As the wheel rolls upside down under it, spin up to 85 rpm and turn the camera (Y) 90° to join the second hanging beam.',
    },
    center: [3, 1, 0], pts: [[-0.5, -0.5, 0], [12.3, 1.4, 3.6], [-0.5, 3.5, -1.4], [12, -0.6, -1.4], [11, -8, 5.7]], pad: 0.9,
    build(): BuiltSimLevel {
      const step = 2.4;
      const lift = createCadenceLift({ id: 'lift', step, floors: 1, cadLo: 55, cadSpan: 30, rate: 1.35, snapBand: 0.4 });
      const G = new SimRoad(loopPts(0, 0, 4, 3, 0, 0.6), { id: 'G', closed: true });
      const bt = ftur([3.4, 0, 0], [1, 0, 0], UP_SKETCH).fwd(8.5).curl(0.6, -180).fwd(3.6);
      const beam = new SimRoad(bt.pts, { id: 'beam', transform: lift.m.transform, groupId: lift.groupId, palHex: '#F2D49B', edgeText: 'Raise the beam and turn the camera' });
      G.forks.push({ s: sAt(G, [3.4, 0, 0]), dir: 1, to: beam, toK: 0, when: () => lift.z() === 0, text: 'Rolling onto the beam' });
      const E: Vec3 = [bt.st.p[0], bt.st.p[1], bt.st.p[2] + step];
      const H0 = behindSketch(E, 90, -4.5);
      const u2 = ftur(H0, [-1, 0, 0], [0, 0, -1]).fwd(0.8).turn(1, -90);
      const p1 = [...u2.st.p] as Vec3;
      u2.fwd(3.2);
      const p2 = [...u2.st.p] as Vec3;
      u2.curl(0.6, -180).fwd(1.2);
      const home = new SimRoad(u2.pts, { id: 'home', goal: true, palHex: '#F2D49B' });
      const cam = createCameraCrank({ id: 'cam', key: 'y', name: 'Camera', at: [-2.2, -1.6, 0], detents: [0, 90] });
      const visuals: VisualProp[] = [
        { kind: 'loopSlab', x0: -0.5, y0: -0.5, x1: 4.5, y1: 3.5, z: -0.5, w: 0.9, pal: 'stone' },
        { kind: 'box', x0: 4.6, y0: -0.45, z0: -0.72, x1: 11.9, y1: 0.45, z1: -0.48, pal: 'idle', roadLike: true, groupId: lift.groupId },
        { kind: 'box', x0: p1[0] - 0.45, y0: p2[1] - 0.6, z0: H0[2] + 0.48, x1: p1[0] + 0.45, y1: p1[1] + 0.2, z1: H0[2] + 0.72, pal: 'idle', roadLike: true },
        { kind: 'cyl', x: 12.3, y: 1.4, r: 0.18, z0: -4, z1: step + 1.2, pal: 'deck', seg: 12 },
        { kind: 'cameraDial', machineId: cam.m.id, pos: [-2.2, -1.6, 0], detents: [0, 90] },
      ];
      return {
        roads: [G, beam, home], machines: [lift.m, cam.m], keys: [], gates: [], occluders: [], visuals,
        spawn: () => ({ road: G, s: 1, dir: 1 }),
        hudTarget(wheel) {
          const under = wheel.road === beam && wheel.s > 6.5;
          if (wheel.road === G) return { cadence: { min: 45, max: 60, label: 'Lower beam' } };
          if (under) return { cadence: { min: 82, max: 96, label: 'Raise beam' }, focusMachine: cam.m.id };
          return { focusMachine: cam.m.id };
        },
        solve(wheel, out) {
          const on = wheel.road === beam, under = on && wheel.s > 7;
          out.cad = wheel.road === G ? 52 : under || wheel.road === home ? 88 : 52;
          cam.driveTo(on || wheel.road === home ? 90 : 0);
        },
      };
    },
  }),

  mobius: (chapter, chapterIndex) => ({
    id: 'mobius', item: 'mobius', name: 'Möbius', chapter, chapterIndex,
    theme: 'brass', yaws: [0], cruise: [78, 92],
    hints: {
      nudge: 'Lower the drawbridge (Y) — the wheel only catches it on a top-side lap, never while riding underneath!',
      explain: 'This strip has a single half-twist, so every second lap runs upside down underneath. Crank the drawbridge (Y) down and wait for a top-side lap to ride off to the goal tower.',
      focusMachine: 'hatch',
    },
    center: [1, 2, 0],
    pts: [[-5, -5, 2.4], [5, 5, 2.4], [-5, 5, 2.4], [5, -5, 2.4], [-5, 5, -3.6], [5, -5, -3.6], [0, 0, 4], [4.6, 9.4, 2.5], [4.6, 9.4, -3.6], [6.8, 3, 2.4]],
    pad: 1,
    build(): BuiltSimLevel {
      const Z = 2.4, half = 0.06, a = 4, rc = 1.8, sl = 2 * (a - rc), tw = sl;
      const sm = (u: number) => u * u * (3 - 2 * u);
      const tt = turtle(a, -(a - rc), 90, Z);
      for (let k = 0; k < 4; k++) tt.fwd(sl).arc(rc, 90);
      const C = tt.pts, cum = [0];
      for (let i = 1; i < C.length; i++) cum.push(cum[i - 1] + Math.hypot(C[i].p[0] - C[i - 1].p[0], C[i].p[1] - C[i - 1].p[1]));
      const seg = sl + (rc * Math.PI) / 2;
      const psiAt = (s: number) => {
        const t2 = seg + sl / 2, t4 = 3 * seg + sl / 2;
        const q = (c: number, sv: number) => sm(clamp((sv - c + tw / 2) / tw, 0, 1));
        return (Math.PI / 2) * (q(t2, s) + q(t4, s));
      };
      const frame = (i: number, extra: number): Vec3 => {
        const A = C[Math.max(0, i - 1)].p, B = C[Math.min(C.length - 1, i + 1)].p;
        const dx = B[0] - A[0], dy = B[1] - A[1], l = Math.hypot(dx, dy) || 1;
        const d: [number, number] = [dx / l, dy / l];
        const psi = psiAt(cum[i]) + extra, s0: [number, number] = [d[1], -d[0]];
        return [Math.sin(psi) * s0[0], Math.sin(psi) * s0[1], Math.cos(psi)];
      };
      const lap = (extra: number) => C.map((q, i) => {
        const n = frame(i, extra);
        return { p: [q.p[0] + half * n[0], q.p[1] + half * n[1], q.p[2] + half * n[2]] as Vec3, n };
      });
      const l1 = lap(0), l2 = lap(Math.PI);
      const ring = new SimRoad(l1.concat(l2.slice(1)), { id: 'ring', closed: true, w: 1.15, th: 2 * half });
      const top = Z + half - 0.004;
      const Hn: Vec3 = [a, a - rc + 2.4, top];
      const hatch = createDrawbridge({ id: 'hatch', key: 'y', name: 'Drawbridge', hinge: Hn, len: 2.4, w: 1.15, raised: true, axis: 'x', at: [a + 2.4, Hn[1] - 1.2, top - 0.2] });
      const exit = new SimRoad(L3(Hn, [a, Hn[1] + 4.2, top], UP_SKETCH), { id: 'exit', goal: true, w: 1.15, th: 0.3 });
      ring.forks.push({ s: sl, dir: 1, to: hatch.road, toK: 0, when: () => hatch.down(), text: 'On top — crossing the drawbridge' });
      const visuals: VisualProp[] = [
        { kind: 'cyl', x: 0, y: 0, r: 1.1, z0: -3.4, z1: Z + 0.4, pal: 'stone', seg: 28 },
        { kind: 'cyl', x: a, y: Hn[1] + 3.7, r: 0.55, z0: -3.4, z1: top - 0.31, pal: 'stone', seg: 18 },
        { kind: 'cyl', x: a + 2.4, y: Hn[1] - 1.2, r: 0.14, z0: -3.4, z1: top - 0.1, pal: 'mechDark', seg: 12 },
        { kind: 'drawbridgeVisual', machineId: hatch.m.id, hinge: Hn, len: 2.4, w: 1.15, axis: 'x' },
      ];
      return {
        roads: [ring, hatch.road, exit], machines: [hatch.m], keys: [], gates: [], occluders: [], visuals,
        spawn: () => ({ road: ring, s: seg + 0.6, dir: 1 }),
        hudTarget: () => ({ focusMachine: hatch.m.id }),
        solve(_w, out) { out.cad = 84; hatch.driveTo(0); },
      };
    },
  }),

  'w-canopy': (chapter, chapterIndex) => ({
    id: 'w-canopy', item: 'w-canopy', name: 'Under the canopy', chapter, chapterIndex,
    theme: 'brass', yaws: [0, 90], cruise: [70, 92],
    hints: {
      nudge: 'Turn the wind (A) to blow from the west so the hanging vane aligns, then turn the camera (Y) 90° to join the second canopy.',
      explain: 'Turn the wind sock (A) until the wind blows from the west, aligning the underside vane. Then turn the camera (Y) a quarter turn so the vane meets the hanging goal canopy.',
    },
    center: [3, -1, 3], pts: [[-0.6, -3.6, 3], [4.6, 0.6, 4], [6, -5.2, 0], [-0.6, 0.6, 6], [4.6, -3.6, 6]], pad: 0.9,
    build(): BuiltSimLevel {
      let curWheel: WheelState | null = null;
      const zc = 3;
      const ul = ftur([2, 0, zc], [1, 0, 0], [0, 0, -1]).fwd(1.3).turn(0.7, 90).fwd(1.6).turn(0.7, 90).fwd(2.6).turn(0.7, 90).fwd(1.6).turn(0.7, 90).fwd(1.3);
      const UL = new SimRoad(ul.pts, { id: 'UL', closed: true, palHex: '#F6C8E0' });
      const wind = createWindSock({
        id: 'wind', key: 'a', x: 6, y: -5.2, a0: 90,
        getWheelHeading: () => (curWheel?.mode === 'road' ? curWheel.heading : null),
      });
      const vaneMat = (): Mat4 => matFromPosRotY(V(3.3, 0, zc - 0.02), Math.PI - wind.ang() * DEG);
      const vnRoad = new SimRoad(L3([0, 0, 0], [2.4, 0, 0], [0, 0, -1]), {
        id: 'vane', transform: vaneMat, groupId: 'g_vane', edgeText: 'Turn the camera so the vane meets the canopy',
      });
      UL.forks.push({ s: sAt(UL, [3.3, 0, zc]), dir: 1, to: vnRoad, toK: 0, when: () => wind.at(180), text: 'Vane aligned — riding out' });
      const E: Vec3 = [5.7, 0, zc - 0.02], H0 = behindSketch(E, 90, -4);
      const u2 = ftur(H0, [1, 0, 0], [0, 0, -1]).fwd(2.6);
      const p2 = [...u2.st.p] as Vec3;
      u2.curl(0.6, -180).fwd(1.6);
      const home = new SimRoad(u2.pts, { id: 'home', goal: true, palHex: '#F6C8E0' });
      const cam = createCameraCrank({ id: 'cam', key: 'y', name: 'Camera', at: [-2.5, -5, 0], detents: [0, 90] });
      const visuals: VisualProp[] = [
        { kind: 'box', x0: H0[0] - 0.2, y0: H0[1] - 0.6, z0: H0[2] + 0.48, x1: p2[0] + 0.1, y1: H0[1] + 0.6, z1: H0[2] + 0.72, pal: 'idle', roadLike: true },
        { kind: 'windSockVisual', machineId: wind.m.id, x: 6, y: -5.2, z: 0 },
        { kind: 'cameraDial', machineId: cam.m.id, pos: [-2.5, -5, 0], detents: [0, 90] },
      ];
      return {
        roads: [UL, vnRoad, home], machines: [wind.m, cam.m], keys: [], gates: [], occluders: [], visuals,
        spawn: () => ({ road: UL, s: 1, dir: 1 }),
        onTick(_dt, wheel) { curWheel = wheel; },
        hudTarget: () => ({ focusMachine: wind.at(180) ? cam.m.id : wind.m.id }),
        solve(_w, out) { out.cad = 80; wind.driveTo(180); cam.driveTo(wind.at(180) ? 90 : 0); },
      };
    },
  }),

  /* ===================== CHAPTER 7: SIGHT & ILLUSION ===================== */

  'n-friend': (chapter, chapterIndex) => ({
    id: 'n-friend', item: 'n-friend', name: 'A friend on the rail', chapter, chapterIndex,
    theme: 'garden', yaws: [0], cruise: [65, 95], scenery: false,
    hints: {
      nudge: 'Watch your rail companion ride past the ring — press A when it reaches the ring to hide the hole!',
      explain: 'The little block paces your loop along the rail. Press A to hold it on the marker ring right in front of the hole, hiding the gap so you roll across.',
      focusMachine: 'fr',
    },
    center: [0, -1.5, 0.5], pts: [[-7.6, -4, 0], [-7.6, 0.6, 0], [8.4, -2.3, 0], [7.6, -0.3, 2.4]],
    build(): BuiltSimLevel {
      let curWheel: WheelState | null = null;
      const A = new SimRoad(loopPts(-7, -3.4, -1, 0, 0, 0.8), { id: 'A', closed: true, palHex: '#F3E6C4' });
      const X1 = new SimRoad(L3([-1, -1.7, 0.006], [3.1, -1.7, 0.006], UP_SKETCH), { id: 'X1', palHex: '#F3E6C4' });
      const X2 = new SimRoad(L3([3.5, -1.7, 0.006], [8, -1.7, 0.006], UP_SKETCH), { id: 'X2', goal: true });
      const fr = createCompanion({ id: 'fr', key: 'a', follow: A, a: [0.6, -0.3, 1.4], b: [7.6, -0.3, 1.4], getWheel: () => curWheel });
      const getViewD = () => makeIsoBasis([0, 0, 0], 0, 0).D;
      const hole = addLiveGap(X1, 1, X2, 0, () => [fr.occluder], getViewD, { text: 'Behind your friend — hole vanished' });
      A.forks.push({ s: sAt(A, [-1, -1.7, 0]), dir: 1, to: X1, toK: 0, when: () => hole.hidden(), text: 'Road ahead looks whole' });
      const visuals: VisualProp[] = [
        { kind: 'loopSlab', x0: -7.6, y0: -4, x1: -0.4, y1: 0.6, z: -0.5, w: 1, pal: 'turf' },
        { kind: 'box', x0: -0.4, y0: -2.3, z0: -0.5, x1: 3.1, y1: -1.1, z1: -0.02, pal: 'stone' },
        { kind: 'box', x0: 3.5, y0: -2.3, z0: -0.5, x1: 8.4, y1: -1.1, z1: -0.02, pal: 'stone' },
        { kind: 'companionVisual', machineId: fr.m.id, a: [0.6, -0.3, 1.4], b: [7.6, -0.3, 1.4], markDist: 4.4 },
      ];
      return {
        roads: [A, X1, X2], machines: [fr.m], keys: [], gates: [], occluders: [fr.occluder], visuals,
        spawn: () => ({ road: A, s: 1, dir: 1 }),
        onTick(_dt, wheel) { curWheel = wheel; },
        hiddenGaps: () => [{ a: hole.a(), b: hole.b(), hidden: hole.hidden() }],
        hudTarget: () => ({ focusMachine: fr.m.id }),
        solve(_w, out) { out.cad = 80; if (!fr.held() && fr.atDist(4.4)) fr.m.on = true; },
      };
    },
  }),

  'c-bridge': (chapter, chapterIndex) => ({
    id: 'c-bridge', item: 'c-bridge', name: 'Bridge or curtain', chapter, chapterIndex,
    theme: 'town', yaws: [0], cruise: [72, 92],
    hints: {
      nudge: 'Raise the drawbridge (Y) to hide the hole in the low road and climb up, then lower it to cross home.',
      explain: 'One drawbridge does two jobs: raised, its leaf stands in front of the low road hole so you can ride up to the upper loop; lowered, it carries you home.',
      focusMachine: 'br',
    },
    center: [2, -1, -1], pts: [[-0.5, 5.9, -4.2], [6.9, -6.7, -2.4], [3, 1.6, 2.6], [-1, 6, 0]],
    build(): BuiltSimLevel {
      const zl = -1.8, hx = 3, lw = 1.6, tR = 3, rx = hx - tR;
      const K = new SimRoad(loopPts(2.4, -3, 6.4, 1.6, 0, 0.6), { id: 'K', closed: true, stationIndex: 1 });
      const G = new SimRoad(loopPts(rx, 2.6, rx + 2.6, 5.4, zl, 0.6), { id: 'G', closed: true, palHex: '#EEDFC4', stationIndex: 0 });
      const yH = 1.6 - tR + 0.6;
      const t = turtle(rx, 3.2, -90, zl).fwd(7.7).arc(1.1, 90).gr(-zl / (3.3 - rx - 1.1)).fwd(3.3 - rx - 1.1).gr(0).arc(1.1, 90).fwd(1);
      const sH = 3.2 - yH;
      const [R1s, R2s] = cutSamples(t.pts, sH, sH + 1.2);
      const R1 = new SimRoad(R1s, { id: 'R1', palHex: '#EEDFC4' }), R2 = new SimRoad(R2s, { id: 'R2', palHex: '#EEDFC4' });
      R2.joins.push({ k: 1, to: K, s: sAt(K, [4.4, -3, 0]) + 0.02, dir: 1 });
      const br = createDrawbridge({ id: 'br', key: 'y', name: 'Drawbridge', hinge: [hx, 1.6, 0], len: 2.4, w: lw, raised: false, at: [8.8, -2, 0] });
      const home = new SimRoad(turtle(hx - 2.4, 1.6, 180, 0).fwd(0.4).arc(1, -90).fwd(3.2).pts, { id: 'home', goal: true });
      const getViewD = () => makeIsoBasis([0, 0, 0], 0, 0).D;
      const hole = addLiveGap(R1, 1, R2, 0, () => [br.occluder], getViewD, { text: 'Behind the raised bridge — hole vanished' });
      G.forks.push({ s: sAt(G, [rx, 3.2, zl]), dir: 1, to: R1, toK: 0, when: () => hole.hidden(), text: 'Road ahead looks whole' });
      K.forks.push({ s: sAt(K, [hx, 1.6, 0]), dir: 1, to: br.road, toK: 0, when: () => br.down(), text: 'Bridge lowered — heading home' });
      const visuals: VisualProp[] = [
        { kind: 'loopSlab', x0: 1.9, y0: -3.5, x1: 6.9, y1: 2.1, z: -0.5, w: 0.9, pal: 'deck' },
        { kind: 'loopSlab', x0: rx - 0.5, y0: 2.1, x1: rx + 3.1, y1: 5.9, z: zl - 0.5, w: 0.9, pal: 'stone' },
        { kind: 'drawbridgeVisual', machineId: br.m.id, hinge: [hx, 1.6, 0], len: 2.4, w: lw },
      ];
      return {
        roads: [G, R1, R2, K, br.road, home], machines: [br.m], keys: [], gates: [], occluders: [br.occluder], visuals,
        spawn: () => ({ road: G, s: 1, dir: 1 }),
        hiddenGaps: () => [{ a: hole.a(), b: hole.b(), hidden: hole.hidden() }],
        hudTarget: () => ({ focusMachine: br.m.id }),
        solve(wheel, out) {
          out.cad = 80;
          const up = wheel.road === G || wheel.road === R1;
          br.driveTo(up ? 90 : wheel.road === K ? 0 : null);
        },
      };
    },
  }),

  'p-turn': (chapter, chapterIndex) => ({
    id: 'p-turn', item: 'p-turn', name: 'Two views of one turntable', chapter, chapterIndex,
    theme: 'dusk', yaws: [0, -90], cruise: [78, 92], terrain: { strip: true },
    hints: {
      nudge: 'Two turntable stops (Y) × two camera views (A) = four destinations. Collect all 3 keys, then take North in the turned view.',
      explain: 'Only swing the turntable (Y) or turn the camera (A) while the wheel is on the terrace or west cul-de-sac — never while out on a far road.',
    },
    center: [-1, -1, 1], pts: [[-9.6, -11.5, -2.4], [5, 8, -2.4], [-9.6, 8, 5], [5, -11.5, 5]],
    build(): BuiltSimLevel {
      const roads: SimRoad[] = [], visuals: VisualProp[] = [];
      const kit = createStudyKit(roads, visuals);
      const line = new SimRoad(L3([-6, 0, 4], [0, 0, 4], UP_SKETCH), { id: 'line' }); roads.push(line);
      const west = kit.pocket('west', -6, 0, 180, 4);
      const tt = createTurntable({ id: 'tt', key: 'y', name: 'Turntable', pivot: [0, 0, 4], len: 3, base: 0, open: 90, detents: [-90, 90], startAng: -90 });
      roads.push(tt.road);
      visuals.push(
        { kind: 'cyl', x: 0, y: 0, r: 0.3, z0: -2.4, z1: 3.1, pal: 'stone', seg: 20 },
        { kind: 'turntableVisual', machineId: tt.m.id, pivot: [0, 0, 4], rad: 0.8, baseDeg: 0 },
      );
      const T1: Vec3 = [0, -3, 4], T2: Vec3 = [0, 3, 4];
      const far: Record<string, { r: SimRoad; pk: ReturnType<typeof kit.pocket> }> = {};
      for (const [nm, tip, yaw, k, hd, len, key] of [
        ['S0', T1, 0, 3, -90, 2, true],
        ['Sm', T1, -90, 3, -90, 2, true],
        ['N0', T2, 0, 2, 90, 2, true],
        ['Nm', T2, -90, 2, 90, 3.2, false],
      ] as const) {
        const a = behindSketch(tip, yaw, k), dv = dir2D(hd);
        const b: Vec3 = [a[0] + len * dv[0], a[1] + len * dv[1], a[2]];
        const r = kit.arm(`arm_${nm}`, a, b);
        const pk = kit.pocket(`pk_${nm}`, b[0], b[1], hd, b[2], key);
        far[nm] = { r, pk };
      }
      kit.homeGate('home', far.Nm.r, 1);
      const cam = createCameraCrank({ id: 'cam', key: 'a', name: 'Camera', at: [-7.5, -4.5, 2], detents: [0, -90] });
      visuals.push({ kind: 'cameraDial', machineId: cam.m.id, pos: [-7.5, -4.5, 2], detents: [0, -90] });
      return {
        roads, machines: [tt.m, cam.m], keys: kit.keys, gates: kit.gates, occluders: [], visuals,
        spawn: () => ({ road: line, s: 1, dir: 1 }),
        solve(wheel, out) {
          out.cad = 85;
          const want: [number, number] = !far.S0.pk.key!.got ? [-90, 0] : !far.N0.pk.key!.got ? [90, 0] : !far.Sm.pk.key!.got ? [-90, -90] : [90, -90];
          const home = wheel.road === west.road || (wheel.road === line && wheel.dir < 0);
          tt.driveTo(home ? want[0] : null);
          cam.driveTo(home ? want[1] : null);
        },
      };
    },
  }),

  'm-gyro': (chapter, chapterIndex) => ({
    id: 'm-gyro', item: 'm-gyro', name: 'Endless stairs', chapter, chapterIndex,
    theme: 'dusk', yaws: [0, 90], cruise: [70, 92],
    hints: {
      nudge: 'Turn the camera (Y) 90° to break open the first endless staircase onto the second, then turn back to reach home.',
      explain: 'Each staircase loops endlessly from one camera angle. Turn the camera (Y) to split the first staircase onto the landing, then turn back once on the second staircase.',
      focusMachine: 'cam',
    },
    center: [3, -2, 0], pts: [[-3, -7, 0]],
    build(): BuiltSimLevel {
      const YB = 90;
      const s0 = stairPts([0, 0, 0], 0, 2, 5, 4, 1.6, -1);
      const r0 = new SimRoad(s0.samples, { id: 's0', seam: 0, edgeText: 'The stairs did not meet at this angle' });
      const X0 = behindSketch(s0.end, YB, 5), X1: Vec3 = [X0[0] + 4, X0[1], X0[2]];
      const land = new SimRoad(L3(X0, X1, UP_SKETCH), { id: 'land', palHex: '#F4C3A8' });
      const s1 = stairPts(X1, YB, 2, 4, 4, 1.6, 1);
      const r1 = new SimRoad(s1.samples, { id: 's1', palHex: '#F4C3A8', seam: YB, edgeText: 'The stairs did not meet at this angle' });
      const H = behindSketch(s1.end, 0, -5);
      const home = new SimRoad(L3(H, [H[0] + 4, H[1], H[2]], UP_SKETCH), { id: 'home', goal: true });
      const cam = createCameraCrank({ id: 'cam', key: 'y', name: 'Camera', at: [-2.5, -6.5, 0], detents: [0, YB] });
      const visuals: VisualProp[] = [{ kind: 'cameraDial', machineId: cam.m.id, pos: [-2.5, -6.5, 0], detents: [0, YB] }];
      return {
        roads: [r0, land, r1, home], machines: [cam.m], keys: [], gates: [], occluders: [], visuals,
        spawn: () => ({ road: r0, s: 1, dir: 1 }),
        hudTarget: () => ({ focusMachine: cam.m.id }),
        solve(wheel, out) {
          out.cad = 80;
          const want = wheel.road === r0 || wheel.road === land ? 90 : wheel.road === r1 ? 0 : null;
          cam.driveTo(want);
        },
      };
    },
  }),

  'c-towers': (chapter, chapterIndex) => ({
    id: 'c-towers', item: 'c-towers', name: 'Turn past the tower', chapter, chapterIndex,
    theme: 'dusk', yaws: [0, 90], cruise: [72, 92],
    hints: {
      nudge: 'Wait until the wheel passes each tower before turning the camera (Y) — turning early exposes the hole behind it!',
      explain: 'Each endless staircase has a hole hidden behind a tower from its closed angle. Wait until you pass the tower on each flight, then turn Y to open the exit.',
      focusMachine: 'cam',
    },
    center: [3, -2, 0], pts: [[-4, -3, 0], [10, 6, 4]],
    build(): BuiltSimLevel {
      const YB = 90;
      const S0 = stairPts([0, 0, 0], 0, 2, 5, 4, 1.6, -1);
      const X0 = behindSketch(S0.end, YB, 5), X1: Vec3 = [X0[0] + 4, X0[1], X0[2]];
      const S1 = stairPts(X1, YB, 2, 4, 4, 1.6, 1);
      const H = behindSketch(S1.end, 0, -5);
      const [s0a, s0b] = cutSamples(S0.samples, 2.6, 3.8);
      const [s1a, s1b] = cutSamples(S1.samples, 1.8, 3.0);
      const r0a = new SimRoad(s0a, { id: 's0a', edgeText: 'The hole was in plain sight' });
      const r0b = new SimRoad(s0b, { id: 's0b', seam: 0, edgeText: 'The stairs did not meet at this angle' });
      const land = new SimRoad(L3(X0, X1, UP_SKETCH), { id: 'land', palHex: '#F4C3A8' });
      const r1a = new SimRoad(s1a, { id: 's1a', palHex: '#F4C3A8', edgeText: 'The hole was in plain sight' });
      const r1b = new SimRoad(s1b, { id: 's1b', palHex: '#F4C3A8', seam: YB, edgeText: 'The stairs did not meet at this angle' });
      const home = new SimRoad(L3(H, [H[0] + 4, H[1], H[2]], UP_SKETCH), { id: 'home', goal: true });
      const cam = createCameraCrank({ id: 'cam', key: 'y', name: 'Camera', at: [-4, -3, 0], detents: [0, YB] });
      const getViewD = () => makeIsoBasis([0, 0, 0], cam.ang() * DEG, 0).D;
      // Baked tower boxes in Three/world coords [x0, y0, z0, x1, y1, z1]
      const b0: [number, number, number, number, number, number] = [3.452, -0.833, 0.266, 4.652, 1.767, 1.466];
      const b1: [number, number, number, number, number, number] = [3.653, -3.885, 5.534, 4.853, -1.285, 6.734];
      const occ0: OccluderBox = { min: [b0[0], b0[1], b0[2]], max: [b0[3], b0[4], b0[5]] };
      const occ1: OccluderBox = { min: [b1[0], b1[1], b1[2]], max: [b1[3], b1[4], b1[5]] };
      const h0 = addLiveGap(r0a, 1, r0b, 0, () => [occ0], getViewD, { text: 'Behind tower 1 — hole vanished', edge: 'The hole was in plain sight' });
      const h1 = addLiveGap(r1a, 1, r1b, 0, () => [occ1], getViewD, { text: 'Behind tower 2 — hole vanished', edge: 'The hole was in plain sight' });
      const visuals: VisualProp[] = [
        // Convert world [x0, y0(up), z0(depth)] -> sketch [x0, z0, y0]
        { kind: 'box', x0: b0[0], y0: b0[2], z0: b0[1], x1: b0[3], y1: b0[5], z1: b0[4], pal: 'stone', keep: true },
        { kind: 'box', x0: b1[0], y0: b1[2], z0: b1[1], x1: b1[3], y1: b1[5], z1: b1[4], pal: '#F4C3A8', keep: true },
        { kind: 'cameraDial', machineId: cam.m.id, pos: [-4, -3, 0], detents: [0, YB] },
      ];
      return {
        roads: [r0a, r0b, land, r1a, r1b, home], machines: [cam.m], keys: [], gates: [], occluders: [occ0, occ1], visuals,
        spawn: () => ({ road: r0a, s: 0.3, dir: 1 }),
        hiddenGaps: () => [{ a: h0.a(), b: h0.b(), hidden: h0.hidden() }, { a: h1.a(), b: h1.b(), hidden: h1.hidden() }],
        hudTarget: () => ({ focusMachine: cam.m.id }),
        solve(wheel, out) {
          out.cad = 80;
          const want = wheel.road === r0b || wheel.road === land || wheel.road === r1a ? 90 : wheel.road === r1b || wheel.road === r0a ? 0 : null;
          cam.driveTo(want);
        },
      };
    },
  }),

  's-behind': (chapter, chapterIndex) => ({
    id: 's-behind', item: 's-behind', name: 'Round the back', chapter, chapterIndex,
    theme: 'garden', yaws: [0, 90], cruise: [65, 92], terrain: { strip: true }, scenery: false,
    hints: {
      nudge: 'Turn the camera (A) 90° and light the seam (B) to hide the back hole as you climb over; on the far loop, turn A back to hide the home hole.',
      explain: 'The tower hides one hole from each camera angle. Turn A 90° + light B to cross behind the tower into the holding loop, then turn A back to 0° to hide the final gap.',
    },
    center: [-1.5, 0, 1.2],
    pts: [[-10.1, 3.4, 0], [-10.1, 8.0, 0], [-3.8, 8.0, 0], [-8, -6.2, 0], [3.55, -6.2, 0], [5.6, 2.6, 0], [5.6, -3.2, 0], [-3, -3, 3.6], [0, 0, 3.6], [-3, 0, 3.6], [0, -3, 3.6]],
    pad: 1.0,
    build(): BuiltSimLevel {
      const H = 3.6, ys = -0.6;
      const A = new SimRoad(loopPts(0.42, -2.6, 5, 2.0, 0, 0.8), { id: 'A', closed: true, palHex: '#F3E6C4', stationIndex: 0 });
      const t = ftur([0.42, ys, 0.006], [-1, 0, 0], UP_SKETCH)
        .curl(0.4, 90).fwd(H - 0.4 - 0.006 - 0.38).curl(0.4, -90).fwd(2.24).curl(0.4, -90).fwd(H - 0.4 - 0.006 - 0.38).curl(0.4, 90).turn(1, -90).fwd(1.2);
      const W = new SimRoad(t.pts, { id: 'W', th: 0.12, flatDeck: true, palHex: '#F4E5C6' });
      const we = t.pts[t.pts.length - 1].p, xw = we[0], y1 = we[1];
      const yC = 4.0;
      const Rb = new SimRoad(L3([xw, y1 + 0.6, 0.006], [xw, yC + 0.8, 0.006], UP_SKETCH), { id: 'Rb', palHex: '#F3E6C4' });
      const C = new SimRoad(loopPts(xw - 5, yC, xw, yC + 3.4, 0, 0.8), { id: 'C', closed: true, palHex: '#F3E6C4', stationIndex: 1 });
      Rb.joins.push({ k: 1, to: C, s: sAt(C, [xw, yC + 0.8, 0]), dir: 1 });
      const xe = xw - 3, ye = -5.6, hx = -3.9;
      const e = ftur([xe - 1, yC, 0.006], [1, 0, 0], UP_SKETCH).turn(1, -90).fwd(yC - 1 - (ye + 1)).turn(1, 90).fwd(hx - (xe + 1));
      const E1 = new SimRoad(e.pts, { id: 'E1', palHex: '#F3E6C4' });
      const E2 = new SimRoad(L3([hx + 0.6, ye, 0.006], [3, ye, 0.006], UP_SKETCH), { id: 'E2', goal: true });
      const sm = createSeam({ id: 'seam', key: 'b', at: [2.7, -1.3, 0] });
      const cam = createCameraCrank({ id: 'cam', key: 'a', name: 'Camera', at: [2.7, 0.6, 0], detents: [0, 90] });
      const getViewD = () => makeIsoBasis([0, 0, 0], cam.ang() * DEG, 0).D;
      const towerOcc: OccluderBox = { min: V(-3, -3, -0.5), max: V(0, 0, H) };
      const h1 = addLiveGap(W, 1, Rb, 0, () => [towerOcc], getViewD, { text: 'Behind the tower — first hole vanished' });
      const h2 = addLiveGap(E1, 1, E2, 0, () => [towerOcc], getViewD, { text: 'Behind the tower — home hole vanished' });
      A.forks.push({ s: sAt(A, [0.42, ys, 0]), dir: 1, to: W, toK: 0, when: () => sm.on && h1.hidden(), text: 'Seam lit — climbing over the tower' });
      C.forks.push({ s: sAt(C, [xe - 1, yC, 0]), dir: 1, to: E1, toK: 0, when: () => h2.hidden(), text: 'Tower hides the home hole' });
      const visuals: VisualProp[] = [
        { kind: 'box', x0: -3, y0: -3, z0: -0.5, x1: 0, y1: 0, z1: H, pal: 'stone', keep: true },
        { kind: 'loopSlab', x0: -0.2, y0: -3.2, x1: 5.6, y1: 2.6, z: -0.5, w: 1, pal: 'turf' },
        { kind: 'loopSlab', x0: xw - 5.6, y0: yC - 0.6, x1: xw + 0.6, y1: yC + 4.0, z: -0.5, w: 1, pal: 'turf' },
        { kind: 'cyl', x: 2.7, y: -1.3, r: 0.6, z0: -2.4, z1: -0.02, pal: 'stone', seg: 20 },
        { kind: 'seamBar', machineId: sm.id, pos: [0.42, ys, 0.03], axis: 'y' },
        { kind: 'cameraDial', machineId: cam.m.id, pos: [2.7, 0.6, 0], detents: [0, 90] },
      ];
      return {
        roads: [A, W, Rb, C, E1, E2], machines: [sm, cam.m], keys: [], gates: [], occluders: [towerOcc], visuals,
        spawn: () => ({ road: A, s: 1, dir: 1 }),
        hiddenGaps: () => [{ a: h1.a(), b: h1.b(), hidden: h1.hidden() }, { a: h2.a(), b: h2.b(), hidden: h2.hidden() }],
        hudTarget(wheel) {
          if (wheel.road === A) return { focusMachine: cam.at(90) ? sm.id : cam.m.id };
          if (wheel.road === C) return { focusMachine: cam.m.id };
          return {};
        },
        solve(wheel, out) {
          out.cad = 80;
          if (wheel.road === A) sm.on = true;
          cam.driveTo(wheel.road === A || wheel.road === W ? 90 : 0);
        },
      };
    },
  }),

  /* ===================== CHAPTER 8: GRAND COMPOSED ===================== */

  'w-lanes': (chapter, chapterIndex) => ({
    id: 'w-lanes', item: 'w-lanes', name: 'Lanes to the water', chapter, chapterIndex,
    theme: 'garden', yaws: [0], cruise: [62, 95], terrain: { strip: true }, scenery: false,
    hints: {
      nudge: 'Start the belt (Y) at 72–86 rpm to land on lane 2, then ease under 74 rpm on the pool loop so the reflected road forms.',
      explain: 'Two beats: hold 72–86 rpm on the conveyor (Y) to jump 2 lanes onto the pool loop, then spin gently (<74 rpm) so the still water makes the reflected road real.',
    },
    center: [2, -2, 1], pts: [[-7.6, -0.6, 0], [-7.6, 3.2, 0], [12, -6, 0], [7.6, 3.8, 0], [1, -6.2, 6], [2.8, -8.6, 6]],
    build(): BuiltSimLevel {
      const dy = -1.7, wz = -0.04, h = 6;
      const H = new SimRoad(loopPts(-7, 0, 1, 2.6, 0, 0.8), { id: 'H', closed: true, palHex: '#F3E6C4', stationIndex: 0 });
      const l1 = new SimRoad(L3([-3, dy, 0.006], [2.6, dy, 0.006], UP_SKETCH), { id: 'l1', palHex: '#F3E6C4', edgeText: 'One lane was not enough' });
      const l3 = new SimRoad(L3([-3, 3 * dy, 0.006], [2.0, 3 * dy, 0.006], UP_SKETCH), { id: 'l3', palHex: '#F3E6C4', edgeText: 'Three lanes was too far' });
      const t2 = ftur([-3, 2 * dy, 0.006], [1, 0, 0], UP_SKETCH).fwd(5.2).turn(1, -90).turn(1, 90).fwd(0.2);
      const l2 = new SimRoad(t2.pts, { id: 'l2', palHex: '#F3E6C4' });
      const belt = createConveyor({ id: 'belt', key: 'y', x: -1, y0: 0, dy, from: H, lanes: [l1, l2, l3], bands: [72, 86] });
      const S2 = new SimRoad(loopPts(3.4, -5.4, 11.4, -2.6, 0, 0.8), { id: 'S2', closed: true, palHex: '#F3E6C4', stationIndex: 1 });
      l2.joins.push({ k: 1, to: S2, s: sAt(S2, [4.4, -5.4, 0]), dir: 1 });
      const wt = ftur([8.0, -2.6, 0.006], [-1, 0, 0], UP_SKETCH).turn(1, -90).fwd(1.4);
      const W = new SimRoad(wt.pts, { id: 'W', noDeck: true, noLane: true, isReflection: true });
      const G = new SimRoad(L3([7.0, -0.2, 0.006], [7.0, 3.4, 0.006], UP_SKETCH), { id: 'G', goal: true });
      const pool = createPool({ id: 'pool', calm: 74 });
      S2.forks.push({ s: sAt(S2, [8.0, -2.6, 0]), dir: 1, to: W, toK: 0, when: () => pool.still(), text: 'Still pool formed the road home' });
      const sky = ftur([8.8, -2.6, 0.006], [-1, 0, 0], UP_SKETCH).fwd(0.8).turn(1, -90).fwd(1.4).pts.map((q) => q.p);
      const visuals: VisualProp[] = [
        { kind: 'loopSlab', x0: -7.6, y0: -0.6, x1: 1.6, y1: 3.2, z: -0.5, w: 1, pal: 'turf' },
        { kind: 'conveyorVisual', machineId: belt.m.id, x: -1, y0: 0, dy, laneCount: 3 },
        { kind: 'pool', machineId: pool.m.id, pool: [5.4, -3.5, 8.6, -0.2], wz, skyRoadPts: sky, skyRoadH: h },
      ];
      return {
        roads: [H, l1, l2, l3, S2, W, G], machines: [belt.m, pool.m], keys: [], gates: [], occluders: [], visuals,
        anchors: [[8.8 - h, -2.6 - h, 1.1], [sky[sky.length - 1][0] - h, sky[sky.length - 1][1] - h, 1.1]],
        spawn: () => ({ road: H, s: 1, dir: 1 }),
        hudTarget(wheel) {
          if (wheel.road === S2 || wheel.road === W || wheel.road === G) return { cadence: { min: 52, max: 73, label: 'Still water' } };
          return { cadence: { min: 72, max: 86, label: '2 lanes' }, focusMachine: belt.m.id };
        },
        solve(wheel, out) {
          belt.m.on = true;
          out.cad = wheel.road === S2 || wheel.road === W || wheel.road === G ? 64 : 80;
        },
      };
    },
  }),

  'd-lanes': (chapter, chapterIndex) => ({
    id: 'd-lanes', item: 'd-lanes', name: 'Three lanes, three doors', chapter, chapterIndex,
    theme: 'garden', yaws: [0, 90], cruise: [62, 95], terrain: true, scenery: false,
    hints: {
      nudge: 'Take lane 2 on the conveyor (Y, 72–86 rpm) through the middle door, then turn the camera (Z) 90° and swing the west turntable (B) past the tower.',
      explain: 'Peek through the three conveyor doors first: lane 2 reaches the upper island. There, turn the camera (Z) 90° so the tower hides the west gap, and swing turntable B out to it.',
    },
    center: [-6, -4, 1],
    pts: [[-25, -19.6, -1.6], [-25, -7, -1.6], [-9.2, 10, -1.6], [11.8, 10, -1.6], [11.8, -6.8, -1.6], [-0.8, -19.6, -1.6], [-18.2, -11.4, 4.8], [-1.8, 8.6, 2.4], [-10, -10, -6], [-25, -9, 3], [-23.6, -9, 1.5]],
    pad: 0.9,
    build(): BuiltSimLevel {
      const roads: SimRoad[] = [], machines: SimMachine[] = [], visuals: VisualProp[] = [];
      const zA = 0, zL = 0.9, zB = 1.5, zb = -1.6;
      const H = new SimRoad(loopPts(0, 0, 8, 2.6, zA, 0.8), { id: 'H', closed: true, palHex: '#F3E6C4', stationIndex: 0 });
      roads.push(H);
      const lanes = [4.6, 6.6, 8.6].map((y, i) => {
        const r = new SimRoad(L3([5.9, y, zA], [-2.5, y, zA], UP_SKETCH), { id: `lane_${i}`, palHex: '#F3E6C4' });
        roads.push(r);
        return r;
      });
      const belt = createConveyor({ id: 'belt', key: 'y', x: 5, y0: 2.6, dy: 2.0, from: H, lanes, bands: [72, 86] });
      machines.push(belt.m);
      visuals.push({ kind: 'conveyorVisual', machineId: belt.m.id, x: 5, y0: 2.6, dy: 2.0, laneCount: 3 });

      const bluff = new SimRoad(L3([-5, 3.2, zL], [-9.2, 3.2, zL], UP_SKETCH), { id: 'bluff', edgeText: 'The road ran off the edge of the world' });
      const Bs = createDoorStation('B', roads, machines, visuals, -14, -12, ['a', 'b'], zB, 1);
      const inB = new SimRoad(L3([-2, -8, zB], [-5, -8, zB], UP_SKETCH), { id: 'inB' });
      inB.joins.push({ k: 1, ...Bs.join(9, 4) });
      const back = new SimRoad(L3([10.6, 2.6, zA], [7.2, 2.6, zA], UP_SKETCH), { id: 'back' });
      back.joins.push({ k: 1, to: H, s: sAt(H, [7.2, 2.6, 0]), dir: 1 });
      roads.push(bluff, inB, back);
      visuals.push({ kind: 'cliff', x: -9.2, y: 3.2, z: zL, zBase: zb - 3.2, ang: Math.PI / 2, edgeOfWorld: true });

      const white = ['#F4F1EA'];
      const pair = (id: string, road: SimRoad, y: number, to: SimRoad, far: [number, number], z: number) => {
        createDoors({ id, road, at: [-1.8, y], atZ: zA, to, fixed: true, want: 0, banners: white, text: 'Through the doorway' });
        visuals.push({ kind: 'doorPair', machineId: id, near: [-1.8, y, zA], nearAng: 0, far: [far[0], far[1], z], farAng: 0, banners: white, want: 0, fixed: true });
      };
      pair('dp0', lanes[0], 4.6, bluff, [-5, 3.2], zL);
      pair('dp1', lanes[1], 6.6, inB, [-2, -8], zB);
      pair('dp2', lanes[2], 8.6, back, [10.6, 2.6], zA);

      const tz = zB - 0.5, ttop = 4.0;
      visuals.push(
        { kind: 'box', x0: -19, y0: -12.4, z0: tz, x1: -17.4, y1: -10.4, z1: ttop, pal: 'stone', keep: true },
        { kind: 'roof', x0: -19.2, y0: -12.6, x1: -17.2, y1: -10.2, z: ttop, h: 0.8, pal: 'roof' },
      );
      const twOcc: OccluderBox = { min: V(-19, -12.4, tz), max: V(-17.4, -10.4, ttop + 0.8) };
      const cam = createCameraCrank({ id: 'cam', key: 'z', name: 'Camera', at: [-8, -10, zB], detents: [0, 90] });
      machines.push(cam.m);
      visuals.push({ kind: 'cameraDial', machineId: cam.m.id, pos: [-8, -10, zB], detents: [0, 90] });
      const getViewD = () => makeIsoBasis([0, 0, 0], cam.ang() * DEG, 0).D;

      const w1 = ftur([-10, -16.7, zB], [0, -1, 0], UP_SKETCH).turn(1, -90).fwd(9).turn(1, -90).fwd(2.1);
      const W1 = new SimRoad(w1.pts, { id: 'W1' });
      Bs.S1.joins.push({ k: 1, to: W1, s: 0, dir: 1 });
      const W1b = new SimRoad(ftur([-21, -14.0, zB], [0, 1, 0], UP_SKETCH).fwd(1.4).turn(1, 90).fwd(3.0).pts, { id: 'W1b', edgeText: 'Dead end off the cliff' });
      const e1 = W1b.end(1).p;
      visuals.push({ kind: 'cliff', x: e1[0], y: e1[2], z: zB, zBase: zb - 3.2, ang: Math.PI / 2, edgeOfWorld: true });
      const h1 = addLiveGap(W1, 1, W1b, 0, () => [twOcc], getViewD, { text: 'Behind the tower' });

      const W2 = new SimRoad(L3([-17.7, -9, zB], [-19.7, -9, zB], UP_SKETCH), { id: 'W2' });
      Bs.S2.joins.push({ k: 1, to: W2, s: 0, dir: 1 });
      const E2 = new SimRoad(L3([-20.3, -9, zB], [-23.6, -9, zB], UP_SKETCH), { id: 'E2', goal: true });
      const h2 = addLiveGap(W2, 1, E2, 0, () => [twOcc], getViewD, { text: 'Tower hides the hole to home' });
      roads.push(W1, W1b, W2, E2);

      const bRoads = [Bs.R1, Bs.R2, Bs.T1.road, Bs.T2.road];
      return {
        roads, machines, keys: [], gates: [], occluders: [twOcc], visuals,
        spawn: () => ({ road: H, s: 1, dir: 1 }),
        hiddenGaps: () => [{ a: h1.a(), b: h1.b(), hidden: h1.hidden() }, { a: h2.a(), b: h2.b(), hidden: h2.hidden() }],
        hudTarget(wheel) {
          if (wheel.road === H) return { cadence: { min: 72, max: 86, label: 'Lane 2' }, focusMachine: belt.m.id };
          if (bRoads.includes(wheel.road)) return { focusMachine: cam.at(90) ? Bs.T2.m.id : cam.m.id };
          return {};
        },
        solve(wheel, out) {
          out.cad = 80;
          if (wheel.road === H) belt.m.on = true;
          const onB = bRoads.includes(wheel.road);
          const farB = wheel.road === Bs.R2 || wheel.road === Bs.T1.road || (wheel.road === Bs.R1 && wheel.s < 6);
          Bs.T2.driveTo(onB && farB ? -90 : null);
          cam.driveTo(onB || wheel.road === Bs.S2 || wheel.road === W2 ? 90 : 0);
        },
      };
    },
  }),
};
