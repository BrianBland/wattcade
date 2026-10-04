import { describe, expect, it } from 'vitest';
import { followerAction, ownerRate } from '../player/engine';

const base = { err: 0, audible: true, sinceSeekS: 10, sinceRateS: 10, planned: 1, current: 1 };

describe('deck correction (rate-limited so browsers do not glitch)', () => {
  it('leaves a deck alone when it is in step', () => {
    expect(followerAction({ ...base, err: 0.01 })).toEqual({});
  });
  it('nudges a little, never more than 2 %, and not more than once a second', () => {
    expect(followerAction({ ...base, err: 0.04 })).toEqual({ rate: 0.98 });
    expect(followerAction({ ...base, err: -0.3 }).rate).toBeCloseTo(1.02, 6);
    expect(followerAction({ ...base, err: 0.04, sinceRateS: 0.5 })).toEqual({});
  });
  it('goes back to the planned rate once in step', () => {
    expect(followerAction({ ...base, err: 0.005, current: 1.02, planned: 1 })).toEqual({ rate: 1 });
  });
  it('seeks only when far off — much further for a deck you can hear — and not while settling', () => {
    expect(followerAction({ ...base, err: 0.3 }).seek).toBeUndefined();
    expect(followerAction({ ...base, err: 0.6 }).seek).toBe(true);
    expect(followerAction({ ...base, err: 0.1, audible: false }).seek).toBe(true);
    expect(followerAction({ ...base, err: 2, sinceSeekS: 0.2 })).toEqual({});
  });
  it('the master deck only follows planned tempo ramps, in coarse steps', () => {
    expect(ownerRate(1, 1, 10)).toBeNull();
    expect(ownerRate(1.0004, 1, 10)).toBeNull();
    expect(ownerRate(1.05, 1, 10)).toBe(1.05);
    expect(ownerRate(1.05, 1, 0.2)).toBeNull();
  });
});
