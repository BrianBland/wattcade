import { describe, expect, it } from 'vitest';
import { FIXED_DT } from '../../../contracts';
import { makeRibbon } from '../render/blooms';
import { createHazeUniforms, LevelDisposer, tone } from '../render/themes';
import { getLevelDef, LEVEL_CATALOG } from '../sim/catalog';
import { SimWorld } from '../sim/world';
import type { BikeInput, SimTunables } from '../sim/types';

const TUN: SimTunables = {
  gradeBase: 1, gradePerLoad: 4.5, gradeSlopeMax: 3, gradeWindHead: 2.5, gradeWindTail: 1.5,
  effortAtFtp: 160, seesawHoldFtp: 0.68, seesawPeakFtp: 1.02, beamPushFtp: 0.96, surgeRpm: 86,
  wheelSpeedBase: 1.85, wheelSpeedMin: 0.78, wheelSpeedMax: 1.3, autoLatch: true,
};

describe('penrose art, alignment & occlusion geometry', () => {
  it('exports roadless Cube awning transform matching its OBB occluder and unit wall bases for wall machines', () => {
    const cubeIdx = LEVEL_CATALOG.findIndex((e) => e.id === 'x-cube');
    const def = getLevelDef(cubeIdx);
    const built = def.build();
    const world = new SimWorld(def, built, { onWon: () => {}, onFell: () => {} });
    const bike: BikeInput = { cadence: 80, ftpFraction: 0.75, sprinting: false, gearScale: 1, ergMode: false, nudge: 0 };
    world.step(FIXED_DT, bike, 0, TUN);

    const transforms = world.roadTransforms();
    // Awning has no SimRoad, yet MUST appear in roadTransforms so its 3D mesh hinges on Wall 2!
    expect(transforms['g_cube_aw']).toBeDefined();
    const awOcc = built.occluders[0];
    expect(awOcc.transform).toBeDefined();
    expect(transforms['g_cube_aw']).toEqual(awOcc.transform!());

    // Every wallArm & wallLift exposes unit wall normal & tangent vectors for exact 3D alignment
    const snaps = world.machineSnapshots();
    for (const m of snaps) {
      if (m.kind === 'wallArm' || m.kind === 'wallLift') {
        const ex = m.extra!;
        const nLen = Math.hypot(Number(ex.nx), Number(ex.ny), Number(ex.nz));
        const uLen = Math.hypot(Number(ex.ux), Number(ex.uy), Number(ex.uz));
        expect(nLen).toBeCloseTo(1, 4);
        expect(uLen).toBeCloseTo(1, 4);
      }
    }
  });

  it('makeRibbon omits end-caps cleanly for optical perspective joins and closes loop seams', () => {
    const def = getLevelDef(0); // turntable (has open roads and a closed loop)
    const built = def.build();
    const openRoad = built.roads.find((r) => !r.closed && r.localS.length > 2)!;
    const cubeDef = getLevelDef(LEVEL_CATALOG.findIndex((e) => e.id === 'x-cube'));
    const closedRoad = cubeDef.build().roads.find((r) => r.closed && r.localS.length > 2)!;

    const D = new LevelDisposer(createHazeUniforms());
    const mat = D.tri(tone('#ECE6F6'));

    const capped = makeRibbon(openRoad, 0.96, 0.24, mat, D, { cull: true, open: [false, false] });
    const uncapped = makeRibbon(openRoad, 0.96, 0.24, mat, D, { cull: true, open: [true, true] });
    const cappedVerts = capped.geometry.attributes.position.count;
    const uncappedVerts = uncapped.geometry.attributes.position.count;
    // Removing 2 end-caps removes exactly 2 quads = 12 vertices
    expect(cappedVerts - uncappedVerts).toBe(12);

    const loopMesh = makeRibbon(closedRoad, 0.96, 0.24, mat, D, { cull: true });
    expect(loopMesh.geometry.attributes.position.count).toBeGreaterThan(24);
    D.dispose();
  });
});
