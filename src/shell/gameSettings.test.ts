import { describe, expect, it } from 'vitest';
import { applyGameSetting, readGameSettings, type GameSetting } from './gameSettings';

describe('per-game pause settings seam', () => {
  it('reads nothing from sims without settings()', () => {
    expect(readGameSettings({})).toEqual([]);
    expect(readGameSettings(null)).toEqual([]);
  });
  it('reads, clamps, snaps and sends', () => {
    const got: unknown[] = [];
    const s: GameSetting = { key: 'k', label: 'K', value: 0.6, min: 0, max: 1, step: 0.05 };
    const sim = { settings: () => [s, { bad: true }], receive: (a: unknown) => got.push(a) };
    expect(readGameSettings(sim)).toEqual([s]);
    expect(applyGameSetting(sim, s, 0.63)).toBe(0.65);
    expect(applyGameSetting(sim, s, 9)).toBe(1);
    expect(got).toEqual([{ type: 'setting', key: 'k', value: 0.65 }, { type: 'setting', key: 'k', value: 1 }]);
  });
});
