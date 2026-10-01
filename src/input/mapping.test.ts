import { describe, expect, it } from 'vitest';
import { applyDeadzone, applyExpo } from './mapping';

describe('applyExpo', () => {
  it('keeps 0 and ±1 fixed and softens partial deflection', () => {
    expect(applyExpo(0, 2)).toBe(0);
    expect(applyExpo(1, 2)).toBe(1);
    expect(applyExpo(-1, 2)).toBe(-1);
    expect(applyExpo(0.5, 2)).toBeCloseTo(0.25);
    expect(applyExpo(-0.5, 2)).toBeCloseTo(-0.25);
  });
  it('is linear at expo 1 and clamps expo below 1', () => {
    expect(applyExpo(0.4, 1)).toBeCloseTo(0.4);
    expect(applyExpo(0.4, 0.2)).toBeCloseTo(0.4);
  });
  it('composes with the deadzone', () => {
    expect(applyExpo(applyDeadzone(-100, 15), 2)).toBe(-1);
    expect(applyExpo(applyDeadzone(10, 15), 2)).toBe(0);
  });
});
