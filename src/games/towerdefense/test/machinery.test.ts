import { describe, expect, it } from 'vitest';
import mortar from '../../../../public/td/towers/mortar/manifest.json';
import outpost from '../../../../public/td/outpost/manifest.json';
import { partPose, posedPoint } from '../render/puppetPose';

describe('machinery attachment poses', () => {
  it('keeps the muzzle on the recoiling barrel in both field orientations', () => {
    for (const turn of [0, Math.PI / 2]) for (const aim of [-1.2, 0, 0.8]) for (const age of [0, 0.15, 0.3, 1]) {
      const angle = turn + aim, anchor = mortar.anchors.muzzle;
      const p = posedPoint(partPose(mortar.parts, anchor.parent, { angle, age, revs: 0 }), anchor.position);
      const reach = 66 - 8 * Math.max(0, 1 - age / 0.3);
      expect(p.x).toBeCloseTo(112 + Math.sin(angle) * reach);
      expect(p.y).toBeCloseTo(112 - Math.cos(angle) * reach);
      // A nozzle effect strip inherits precisely the barrel's motion, too.
      const flare = posedPoint(partPose(mortar.parts, 'barrel', { angle, age, revs: 0 }), [112, 46]);
      expect(flare).toEqual(p);
    }
  });
  it('keeps sockets and the cab fixed while the flywheel spins and weapon aims', () => {
    for (const angle of [0, 1.4, Math.PI]) for (const revs of [0, 0.25, 2.1]) {
      for (const name of ['cable_1', 'cable_4', 'range_center'] as const) {
        const a = outpost.anchors[name];
        expect(posedPoint(partPose(outpost.parts, a.parent, { angle, revs, age: 0 }), a.position)).toEqual({ x: a.position[0], y: a.position[1] });
      }
      const p = posedPoint(partPose(outpost.parts, 'cab', { angle, revs, age: 0 }), [338, 366]);
      expect(p).toEqual({ x: 338, y: 366 });
    }
  });
  it('aims each outpost muzzle with its selected head and independent of crank rotation', () => {
    for (const name of ['muzzle_gatling', 'muzzle_flamer', 'muzzle_rail'] as const) {
      const a = outpost.anchors[name], p = posedPoint(partPose(outpost.parts, a.parent, { angle: Math.PI / 2, revs: 0.25, age: 99 }), a.position);
      expect(p.x).toBeCloseTo(260 + (260 - a.position[1]));
      expect(p.y).toBeCloseTo(260);
    }
  });
});
