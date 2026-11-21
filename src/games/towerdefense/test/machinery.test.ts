import { describe, expect, it } from 'vitest';
import flamer from '../../../../public/td/towers/flamer/manifest.json';
import outpost from '../../../../public/td/outpost/manifest.json';
import { levelPosition, partPose, posedPoint } from '../render/puppetPose';

describe('machinery attachment poses', () => {
  it('keeps the flame origin and mouth flare on each tier duckbill burner through aim and recoil', () => {
    const anchor = flamer.anchors.muzzle;
    for (const [level, y] of [[1, 56], [2, 56], [3, 42], [4, 42], [5, 42]]) {
      const tip = levelPosition(anchor.position, anchor.positionsByLevel, level);
      expect(tip).toEqual([112, y]);
      for (const animation of Object.values(flamer.animations)) {
        const e = animation.effect, offset = levelPosition(e.offset, e.offsetsByLevel, level), first = levelPosition(e.offset, e.offsetsByLevel, 1);
        // Every tier's flare shares one local registration: the mouth's top edge sits at the muzzle.
        const local = [anchor.positionsByLevel['1'][0] - first[0], anchor.positionsByLevel['1'][1] - first[1]];
        expect([offset[0] + local[0], offset[1] + local[1]]).toEqual(tip);
        for (const turn of [0, Math.PI / 2]) for (const aim of [-1.2, 0, 0.8]) for (const age of [0, 0.15, 0.3, 1]) {
          const angle = aim + turn, motion = { angle, age, revs: 0 };
          const muzzle = posedPoint(partPose(flamer.parts, anchor.parent, motion), tip);
          const flare = posedPoint(partPose(flamer.parts, e.parent, motion), [offset[0] + local[0], offset[1] + local[1]]);
          const reach = 112 - y - 1.5 * Math.max(0, 1 - age / 0.3);
          expect(muzzle.x).toBeCloseTo(112 + Math.sin(angle) * reach);
          expect(muzzle.y).toBeCloseTo(112 - Math.cos(angle) * reach);
          expect(flare).toEqual(muzzle);
          const cable = flamer.anchors.cable;
          expect(posedPoint(partPose(flamer.parts, cable.parent, motion), cable.position)).toEqual({ x: 177, y: 112 });
        }
      }
    }
  });
  it('shows exactly one duckbill head and burner per level, each level glowing hotter than the last', async () => {
    const { levelGain } = await import('../render/machinery');
    let last = 0;
    for (let level = 1; level <= 5; level++) {
      const shown = flamer.parts.filter((p) => (p.minLevel ?? 1) <= level && level <= ((p as { maxLevel?: number }).maxLevel ?? 99)).map((p) => p.name);
      expect(shown.filter((n) => n.startsWith('head'))).toHaveLength(1);
      expect(shown.filter((n) => n.startsWith('nozzle'))).toHaveLength(1);
      const gain = levelGain(flamer.glowByLevel, level);
      expect(gain).toBeGreaterThan(last); last = gain;
    }
    expect(levelGain(undefined, 3)).toBe(1);
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

describe('tower shots leave the art and land on its attack flash', async () => {
  const { attackClock } = await import('../render/machinery');
  const towers = {
    tesla: (await import('../../../../public/td/towers/tesla/manifest.json')).default,
    prism: (await import('../../../../public/td/towers/prism/manifest.json')).default,
    flamer,
  };
  it('puts each tower muzzle on its emitter: Prism crystal centre, Tesla orb, above the pad centre', () => {
    expect(towers.prism.anchors.muzzle).toMatchObject({ parent: 'head', position: [112, 54] });
    expect(towers.tesla.anchors.muzzle).toMatchObject({ parent: 'head', position: [112, 44] });
    for (const m of Object.values(towers)) expect(m.anchors.muzzle.position[1]).toBeLessThan(m.anchors.range_center.position[1] - 40);
  });
  it('shows the attack strip at its brightest the instant the shot is drawn, then fades with it', () => {
    for (const m of Object.values(towers)) {
      const a = m.animations.attack, opacityAt = (ms: number) => {
        const k = a.effectOpacity; for (let i = 1; i < k.length; i++) if (ms <= k[i][0]) return k[i - 1][1] + (k[i][1] - k[i - 1][1]) * (ms - k[i - 1][0]) / (k[i][0] - k[i - 1][0]);
        return k[k.length - 1][1];
      };
      expect(opacityAt(attackClock(a, 0))).toBe(Math.max(...a.effectOpacity.map((k) => k[1])));
      expect(opacityAt(attackClock(a, 0.2))).toBeLessThan(opacityAt(attackClock(a, 0)));
    }
  });
});
