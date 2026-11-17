import { describe, expect, it } from 'vitest';
import { ENTRANCE, entranceOpen } from './entrance';

describe('entranceOpen', () => {
  it('grows open ahead of the rider, then shuts once ridden through', () => {
    const e = { kind: 'enter' as const, x: 100 };
    expect(entranceOpen(e, 80, 0)).toBe(0);
    expect(entranceOpen(e, 80, ENTRANCE.growS / 2)).toBeCloseTo(0.5);
    expect(entranceOpen(e, 80, 5)).toBe(1);
    expect(entranceOpen(e, 103, 5)).toBeCloseTo(0.5);
    expect(entranceOpen(e, 120, 5)).toBe(0);
  });
  it('an exit portal is open at once, shuts as you ride off, and shuts anyway if you stay put', () => {
    const e = { kind: 'exit' as const, x: 50 };
    expect(entranceOpen(e, 50, 0)).toBe(1);
    expect(entranceOpen(e, 53, 0.5)).toBeCloseTo(0.5);
    expect(entranceOpen(e, 50, ENTRANCE.exitHoldS + ENTRANCE.exitShutS / 2)).toBeCloseTo(0.5);
    expect(entranceOpen(e, 50, ENTRANCE.exitHoldS + ENTRANCE.exitShutS + 1)).toBe(0);
  });
});

describe('ovalHalf (pixel portal outline)', () => {
  it('is widest at the middle row, a point at the ends, and off the oval beyond', async () => {
    const { ovalHalf } = await import('./portal');
    expect(ovalHalf(18, 32, 0)).toBe(18);
    expect(ovalHalf(18, 32, 32)).toBe(0);
    expect(ovalHalf(18, 32, 33)).toBe(-1);
    for (let dy = 0; dy < 32; dy++) expect(ovalHalf(18, 32, dy)).toBeGreaterThanOrEqual(ovalHalf(18, 32, dy + 1));
  });
});
