import { describe, expect, it } from 'vitest';
import { createArsenalCollection } from '../sim/arsenal';
import { STANCE_ORDER, STANCES } from '../sim/stances';

describe('Full Arsenal collection', () => {
  it('requires epic+ pickups for all four unlocked stances and emits completion once', () => {
    const a = createArsenalCollection();
    for (const id of STANCE_ORDER) expect(a.collect(STANCES[id].starter, 2, true)).toBe(false);
    expect(a.collect('bolt', 3, true)).toBe(false);
    expect(a.collect('arrow', 4, true)).toBe(false); // another Ranger weapon is not another stance
    expect(a.collect('pellet', 4, true)).toBe(false);
    expect(a.collect('star', 5, true)).toBe(false);
    expect(a.collect('orb', 3, true)).toBe(true);
    expect(a.collect('orb', 5, true)).toBe(false);
  });
  it('keeps collection credit when later pickups have lower rarity', () => {
    const a = createArsenalCollection();
    a.collect('bolt', 3, true);
    a.collect('bolt', 0, true);
    a.collect('axe', 3, true);
    a.collect('knife', 3, true);
    expect(a.collect('orb', 3, true)).toBe(true);
  });
  it('cannot collect with Arcanist locked or combine pickups across dives', () => {
    const a = createArsenalCollection();
    for (const id of STANCE_ORDER) expect(a.collect(STANCES[id].starter, 5, false)).toBe(false);
    expect(a.collect('orb', 3, true)).toBe(false);
    a.collect('bolt', 3, true);
    a.collect('star', 3, true);
    a.reset();
    expect(a.collect('pellet', 3, true)).toBe(false);
    expect(a.collect('bolt', 3, true)).toBe(false);
    expect(a.collect('star', 3, true)).toBe(false);
    expect(a.collect('orb', 3, true)).toBe(true);
  });
});
