import { describe, expect, it } from 'vitest';
import { daylight } from '../render/daylight';

describe('daylight', () => {
  it('is day at noon, night at midnight', () => {
    expect(daylight(12)).toEqual({ night: 0, glow: 0 });
    expect(daylight(0).night).toBe(1);
    expect(daylight(23.9).night).toBe(1);
  });
  it('fades through dusk with a sunset glow', () => {
    const d = daylight(19.5);
    expect(d.night).toBeGreaterThan(0.4); expect(d.night).toBeLessThan(0.6);
    expect(d.glow).toBeGreaterThan(0.7);
    expect(daylight(6.25).night).toBeCloseTo(0.5, 5);
  });
});
