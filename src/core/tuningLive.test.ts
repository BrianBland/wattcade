import { describe, expect, it } from 'vitest';
import { TuningRegistry } from './tuning';

describe('TuningRegistry.applyDefaults (live updates)', () => {
  it('moves untouched tunables to new defaults, keeps rider overrides, and defers unregistered ones', () => {
    const r = new TuningRegistry({ storage: null });
    const t = r.scoped('td');
    const dmg = t.num('damage', 30, 0, 60), rate = t.num('rate', 2, 0, 10);
    r.set('td.rate', 5); // rider override
    const changed = r.applyDefaults('td', { damage: { d: 40 }, rate: { d: 3 }, later: { d: 7, min: 0, max: 100 } });
    expect(changed).toEqual(['td.damage']);
    expect(dmg()).toBe(40);
    expect(rate()).toBe(5);
    expect(r.list('td').find((e) => e.name === 'rate')!.def).toBe(3);
    expect(t.num('later', 1, 0, 10)()).toBe(7); // takes the pending default (and its range)
  });

  it('widens a range when the new default needs it, and rolls back', () => {
    const r = new TuningRegistry({ storage: null });
    const v = r.scoped('g').num('k', 5, 0, 10);
    r.applyDefaults('g', { k: { d: 20, min: 0, max: 30 } });
    expect(v()).toBe(20);
    r.applyDefaults('g', { k: { d: 5, min: 0, max: 10 } });
    expect(v()).toBe(5);
  });
});
