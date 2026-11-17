import { describe, expect, it } from 'vitest';
import { traceFlow } from '../sim/flowLine';

describe('watershed flow line', () => {
  it('runs down a tilted plane to the sea and follows a valley into a notch', () => {
    const nx = 40, ny = 60, h = new Float32Array(nx * ny);
    // slope down the valley (+y) to the sea at y ≈ 50, with a ridge at y = 25 notched at x = 30
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const ridge = 6 * Math.exp(-((j - 25) ** 2) / 6) * (1 - Math.exp(-(((i - 30) / 3) ** 2)));
      h[j * nx + i] = 20 - j * 0.42 + ridge + 0.02 * Math.abs(i - 30);
    }
    const line = traceFlow(h, null, nx, ny, 10, 2);
    const last = line[line.length - 1];
    expect(last[1]).toBeGreaterThan(47);
    const atRidge = line.find(([, y]) => y >= 25)!;
    expect(Math.abs(atRidge[0] - 30)).toBeLessThan(3);   // it found the notch
  });
});
