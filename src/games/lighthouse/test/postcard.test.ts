import { describe, expect, it } from 'vitest';
import { popSchedule, postcardLines, type RideTally } from '../render/postcard';

const none: RideTally = { shipsDocked: 0, buildingsBuilt: 0, upgrades: 0, whales: 0, visitors: 0, festivals: 0, stormsWeathered: 0, bloomGained: 0, festivalsHeld: 0 };

describe('postcard', () => {
  it('leads with the special moments and keeps to four lines', () => {
    const l = postcardLines({ ...none, shipsDocked: 12, buildingsBuilt: 3, upgrades: 1, whales: 1, visitors: 1, festivals: 1, festivalsHeld: 2, stormsWeathered: 2, bloomGained: 0.06 });
    expect(l).toEqual(['🎉 The Midsummer Feast!', '✨ 1 special visitor', '🐋 A whale came by!', '⛵ 12 ships safely home']);
  });
  it('has something kind to say about a quiet ride, and gets plurals right', () => {
    expect(postcardLines(none)).toEqual(['🌊 A quiet day by the sea']);
    expect(postcardLines({ ...none, shipsDocked: 1, upgrades: 2 })).toEqual(['⛵ 1 ship safely home', '⬆️ 2 upgrades']);
  });
  it('spreads new buildings over the recap, at least 0.25 s apart', () => {
    expect(popSchedule(0)).toEqual([]);
    expect(popSchedule(1)).toEqual([1]);
    const many = popSchedule(30);
    expect(many[1] - many[0]).toBeCloseTo(0.25);
    const few = popSchedule(3);
    expect(few[2]).toBeLessThanOrEqual(6.5);
  });
});
