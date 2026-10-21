import { describe, expect, it } from 'vitest';
import flamer from '../../../../public/td/towers/flamer/manifest.json';
import outpost from '../../../../public/td/outpost/manifest.json';
import { levelPosition, partPose, posedPoint } from '../render/puppetPose';

describe('machinery attachment poses', () => {
  it('keeps the flame origin and tier flare on each upgraded nozzle through aim and pulse', () => {
    const anchor = flamer.anchors.muzzle;
    for (const [level, y] of [[1, 64], [2, 64], [3, 51], [4, 51], [5, 44]]) {
      const tip = levelPosition(anchor.position, anchor.positionsByLevel, level);
      expect(tip).toEqual([112, y]);
      for (const animation of Object.values(flamer.animations)) {
        const e = animation.effect, offset = levelPosition(e.offset, e.offsetsByLevel, level);
        // The four flare frames share a local hot-tip registration at [12,14].
        expect([offset[0] + 12, offset[1] + 14]).toEqual(tip);
        for (const turn of [0, Math.PI / 2]) for (const aim of [-1.2, 0, 0.8]) for (const age of [0, 0.15, 0.3, 1]) {
          const angle = aim + turn, motion = { angle, age, revs: 0 };
          const muzzle = posedPoint(partPose(flamer.parts, anchor.parent, motion), tip);
          const flare = posedPoint(partPose(flamer.parts, e.parent, motion), [offset[0] + 12, offset[1] + 14]);
          const reach = 112 - y - 2.5 * Math.max(0, 1 - age / 0.3);
          expect(muzzle.x).toBeCloseTo(112 + Math.sin(angle) * reach);
          expect(muzzle.y).toBeCloseTo(112 - Math.cos(angle) * reach);
          expect(flare).toEqual(muzzle);
          const cable = flamer.anchors.cable;
          expect(posedPoint(partPose(flamer.parts, cable.parent, motion), cable.position)).toEqual({ x: 177, y: 112 });
        }
      }
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
