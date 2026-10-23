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

describe('SunShadow patches (route-anchored fine levels)', () => {
  // rolling ridges; sun from +x+z, low
  const hills = (x: number, z: number) => 6 * Math.sin(x / 9) * Math.cos(z / 13) + 3 * Math.sin((x + z) / 5);
  const sun = { x: 0.5, y: 0.35, z: 0.6 };
  const box = { x0: -200, x1: 200, z0: -200, z1: 200 };
  const whole = new SunShadow(sun, hills, [{ cell: 4, ...box }, { cell: 0.5, x0: -100, x1: 100, z0: -100, z1: 100 }]);
  const patched = new SunShadow(sun, hills, [{ cell: 4, ...box }], [{ cell: 0.5, size: 32, maxVoxel: 0.5, apron: 40 }]);
  it('matches one big fine level, including across patch seams', () => {
    let n = 0, off = 0;
    for (let x = -60; x <= 60; x += 1.7) for (let z = -60; z <= 60; z += 1.3) {
      const y = hills(x, z) + 0.05;
      n++; if (Math.abs(whole.vis(x, y, z, 0.25) - patched.vis(x, y, z, 0.25, 0.25)) > 0.5) off++;
    }
    expect(off / n).toBeLessThan(0.01);
  });
  it('builds patches lazily, only where asked, and coarse geometry uses the coarse level', () => {
    const p = new SunShadow(sun, hills, [{ cell: 4, ...box }], [{ cell: 0.5, size: 32, maxVoxel: 0.5 }]);
    expect(p.patchCount).toBe(0);
    p.vis(10, 0, 10, 0.25, 4);
    expect(p.patchCount).toBe(0);
    p.vis(10, 0, 10, 0.25, 0.25); p.vis(12, 0, 11, 0.25, 0.25);
    expect(p.patchCount).toBe(1);
  });
});
