// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { loadEstimateS, nextEstimateS, recordLoadS } from './loadTimes';

describe('game load estimates', () => {
  it('lean slow: a slower load counts in full, a faster one moves it a little', () => {
    expect(nextEstimateS(null, 2)).toBe(2);
    expect(nextEstimateS(2, 4)).toBe(4);
    expect(nextEstimateS(4, 1)).toBeCloseTo(3.1);
  });
  it('has no estimate for a game never loaded here, then remembers per game', () => {
    localStorage.clear();
    expect(loadEstimateS('x')).toBeNull();
    recordLoadS('x', 1.5);
    expect(loadEstimateS('x')).toBe(1.5);
    expect(loadEstimateS('y')).toBeNull();
  });
});
