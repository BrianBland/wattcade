import { describe, expect, it } from 'vitest';
import { fine, upsample2 } from '../render/upsample';

describe('upsample2', () => {
  it('keeps coarse samples and reproduces linear ramps exactly', () => {
    const nx = 5, ny = 4, src = new Float32Array(nx * ny);
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) src[j * nx + i] = 2 * i + 3 * j;
    const out = new Float32Array(fine(nx) * fine(ny)), tmp = new Float32Array(fine(nx) * ny);
    upsample2(src, nx, ny, out, tmp, true);
    for (let J = 0; J < fine(ny); J++) for (let I = 0; I < fine(nx); I++) {
      const x = I / 2, y = J / 2, interior = x >= 1 && x <= nx - 2 && y >= 1 && y <= ny - 2;
      if (I % 2 === 0 && J % 2 === 0) expect(out[J * fine(nx) + I]).toBe(src[y * nx + x]);
      if (interior) expect(out[J * fine(nx) + I]).toBeCloseTo(2 * x + 3 * y, 5);
    }
  });
  it('handles interleaved channels (linear)', () => {
    const src = new Float32Array([0, 10, 2, 20, 4, 40, 6, 60]); // 2×2 grid, 2 channels
    const out = new Float32Array(3 * 3 * 2), tmp = new Float32Array(3 * 2 * 2);
    upsample2(src, 2, 2, out, tmp, false, 2);
    expect(out[(1 * 3 + 1) * 2]).toBeCloseTo(3);      // centre, channel 0: mean of 0,2,4,6
    expect(out[(1 * 3 + 1) * 2 + 1]).toBeCloseTo(32.5); // channel 1: mean of 10,20,40,60
  });
});
