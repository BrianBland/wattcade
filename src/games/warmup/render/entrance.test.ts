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
