import { describe, expect, it } from 'vitest';
import { mergeRideStates, mergeRideStatuses } from './group';

describe('mergeRideStates', () => {
  it('unions buttons and takes each paddle from the side that reports it', () => {
    const left = { buttons: new Set(['a'] as const), paddleL: -100, paddleR: 0 };
    const right = { buttons: new Set(['shiftUpR'] as const), paddleL: 0, paddleR: 50 };
    const m = mergeRideStates([left, right]);
    expect([...m.buttons].sort()).toEqual(['a', 'shiftUpR']);
    expect(m.paddleL).toBe(-100);
    expect(m.paddleR).toBe(50);
  });
  it('is empty with no controllers', () => {
    const m = mergeRideStates([]);
    expect(m.buttons.size).toBe(0);
    expect(m.paddleL).toBe(0);
  });
});

describe('mergeRideStatuses', () => {
  it('is connected if any is, reports lowest battery and any warning', () => {
    const s = mergeRideStatuses([
      { connected: false, firmware: '1.2.0', battery: 80 },
      { connected: true, firmware: '1.2.0', battery: 55, warning: 'w' },
    ]);
    expect(s).toEqual({ connected: true, firmware: '1.2.0', battery: 55, warning: 'w' });
  });
});
