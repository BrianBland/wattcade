import { describe, expect, it } from 'vitest';
import { SunShadow } from '../world/sunShadow';

describe('SunShadow', () => {
  // sun toward +z at 45°: a 10 m wall at z ∈ [0, 1] shades the ground for 10 m on its far side (z < 0)
  const wall = (_x: number, z: number) => (z >= 0 && z <= 1 ? 10 : 0);
  const sh = new SunShadow({ x: 0, y: 1, z: 1 }, wall, [{ cell: 0.25, x0: -20, x1: 20, z0: -30, z1: 10 }]);
  it('shades the ground behind a wall for height / tan(elevation)', () => {
    expect(sh.vis(0, 0, -5, 0.1)).toBe(0);
    expect(sh.vis(0, 0, -8.5, 0.1)).toBe(0);
    expect(sh.vis(0, 0, -11.5, 0.1)).toBe(1);
    expect(sh.vis(0, 0, 5, 0.1)).toBe(1); // sunward side is lit
  });
  it('lets taller things poke out of the shadow', () => {
    expect(sh.vis(0, 6, -5, 0.1)).toBe(1);
    expect(sh.vis(0, 4, -5, 0.1)).toBe(0);
  });
  it('seeds a fine level from a coarse one', () => {
    const two = new SunShadow({ x: 0, y: 1, z: 1 }, wall, [{ cell: 1, x0: -20, x1: 20, z0: -30, z1: 10 }, { cell: 0.25, x0: -5, x1: 5, z0: -12, z1: -2 }]);
    expect(two.vis(0, 0, -5, 0.1)).toBe(0);
    expect(two.vis(0, 0, -11.8, 0.1)).toBe(1);
  });
});
