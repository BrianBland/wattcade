import { describe, expect, it } from 'vitest';
import { DEFAULT_ZONE_REFILL, completeCooldown, readyFrac, refillRate, startCooldown, tickCooldown } from './cooldown';

describe('effort-scaled cooldowns', () => {
  it('zone 1 is base rate, and every zone above refills faster', () => {
    expect(refillRate(1)).toBe(1);
    for (let z = 2; z <= 5; z++) expect(refillRate(z)).toBeGreaterThan(refillRate(z - 1));
    expect(refillRate(7)).toBe(DEFAULT_ZONE_REFILL[5]); // power zones 6-7 count as 5
  });
  it('ticks at the given rate, completes on demand, and reports fill', () => {
    const c = startCooldown(30);
    expect(readyFrac(c)).toBe(0);
    tickCooldown(c, 10, refillRate(4));
    expect(readyFrac(c)).toBeCloseTo((10 * DEFAULT_ZONE_REFILL[4]) / 30, 6);
    expect(completeCooldown(c)).toBe(true);
    expect(readyFrac(c)).toBe(1);
    expect(completeCooldown(c)).toBe(false);
  });
});
