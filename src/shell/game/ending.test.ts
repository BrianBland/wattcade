import { describe, expect, it } from 'vitest';
import { endingStep, MAX_RECAP_S } from './ending';

describe('endingStep', () => {
  it('no recap: banner at once, A or the timer leaves', () => {
    expect(endingStep(0.1, 0, false, 4)).toEqual({ show: 'banner', holdS: 0, leave: false });
    expect(endingStep(0.5, 0, true, 4).leave).toBe(false); // too soon to accept A
    expect(endingStep(1, 0, true, 4).leave).toBe(true);
    expect(endingStep(4, 0, false, 4).leave).toBe(true);
  });
  it('a recap holds the banner; A skips to it; the timer counts from the banner', () => {
    expect(endingStep(3, 10, false, 4).show).toBe('recap');
    const skip = endingStep(3, 10, true, 4);
    expect(skip).toEqual({ show: 'banner', holdS: 3, leave: false });
    expect(endingStep(12, 10, false, 4)).toEqual({ show: 'banner', holdS: 10, leave: false });
    expect(endingStep(14, 10, false, 4).leave).toBe(true);
  });
  it('caps the recap', () => {
    expect(endingStep(MAX_RECAP_S + 0.1, 99, false, 4).show).toBe('banner');
  });
});
