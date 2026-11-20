import { expect, it } from 'vitest';
import { chainPath, linkCount, swingConnects } from '../sim/chain';
import { WIDTH } from '../sim/track';
import { riderRig } from '../render/rider';

it('keeps the same link pitch from carry through release, mirrored at either glove', () => {
  const left = new Float32Array(3 * (linkCount + 1)),
    right = new Float32Array(left.length);
  chainPath(0, 1, right);
  const stowed = right.slice();
  for (let frame = 0; frame <= 60; frame++) {
    chainPath(frame / 60, -1, left);
    chainPath(frame / 60, 1, right);
    for (let j = 3; j < left.length; j += 3) {
      expect(
        Math.hypot(right[j] - right[j - 3], right[j + 1] - right[j - 2], right[j + 2] - right[j - 1]),
      ).toBeCloseTo(0.195, 5);
      expect(left[j]).toBeCloseTo(-right[j], 6);
      expect(left[j + 2]).toBe(right[j + 2]);
    }
  }
  expect(right).toEqual(stowed);
});

it('carries the end aft, sweeps it through broadside, and follows through ahead of the rider', () => {
  const path = new Float32Array(3 * (linkCount + 1)),
    rig = riderRig(),
    last = linkCount * 3;
  const tips = [0.25, 0.5, 0.71].map((t) => {
    const hand = rig.pose(0, 1, t, 0)[1];
    chainPath(t, 1, path);
    return { x: hand.x + path[last], z: hand.z + path[last + 2] };
  });
  expect(tips[0].z).toBeGreaterThan(1.5);
  expect(tips[1].x).toBeGreaterThan(3);
  expect(tips[2].z).toBeLessThan(-1.8);
  expect(swingConnects(-tips[1].z, tips[1].x / WIDTH, 1, 0.5)).toBe(true);
  expect(swingConnects(0, 0.55, 1, 0.15)).toBe(false);
  expect(swingConnects(0, 0.55, 1, 0.92)).toBe(false);
  rig.skeleton.dispose();
});
