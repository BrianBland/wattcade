import { describe, expect, it } from 'vitest';
import { endingStep, MAX_RECAP_S, MIN_END_S } from './ending';

describe('endingStep', () => {
  it('no recap: holds the final frame briefly, then rides out', () => {
    expect(endingStep(0.1, 0, false).leave).toBe(false);
    expect(endingStep(MIN_END_S, 0, false).leave).toBe(true);
  });
  it('A skips, but not straight away', () => {
    expect(endingStep(0.5, 10, true).leave).toBe(false);
    expect(endingStep(1, 10, true).leave).toBe(true);
  });
  it('waits out a recap, capped', () => {
    expect(endingStep(9, 10, false).leave).toBe(false);
    expect(endingStep(10, 10, false).leave).toBe(true);
    expect(endingStep(MAX_RECAP_S, 99, false).leave).toBe(true);
  });
});
