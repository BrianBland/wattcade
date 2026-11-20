import { describe, expect, it } from 'vitest';
import { relief } from '../render/terrainView';

describe('relief (baked terrain occlusion)', () => {
  it('darkens hollows, lifts crests, leaves flat ground alone', () => {
    const nx = 21, ny = 21, h = new Float32Array(nx * ny).fill(5), out = new Float32Array(nx * ny);
    h[10 * nx + 5] = 1;     // a pit
    h[10 * nx + 15] = 9;    // a spike
    relief(h, nx, ny, out);
    expect(out[10 * nx + 5]).toBeGreaterThan(0.2);
    expect(out[10 * nx + 15]).toBeLessThan(-0.2);
    expect(Math.abs(out[3 * nx + 10])).toBeLessThan(1e-6);
  });
});
