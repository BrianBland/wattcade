import { describe, expect, it } from 'vitest';
import { readSave } from '../sim/save';

describe('Dynamo Defense saves', () => {
  it('reads a v2 save without losing progress', () => {
    const raw = {
      v: 2, bank: 4321, bestWave: 24, upgrades: { plating: 3, headstart: 4 }, runs: 9, autoInvest: true, autoCrew: false,
      totals: { waves: 88, kills: 901, bosses: 12, towers: 31, surges: 17 },
    };
    const before = structuredClone(raw);
    const read = readSave(raw);
    expect(read).toEqual(raw);
    read.upgrades.plating = 4;
    expect(raw).toEqual(before);
  });

  it('loads a legacy best-wave-only save and a new rider', () => {
    expect(readSave({ bestWave: 9 })).toMatchObject({ v: 2, bestWave: 9, bank: 0, runs: 0, autoCrew: true });
    expect(readSave(undefined).totals).toEqual({ waves: 0, kills: 0, bosses: 0, towers: 0, surges: 0 });
  });

  it('refuses a newer version without rewriting it', () => {
    const raw = { v: 3, bank: 900, runsFallen: 2 };
    const before = structuredClone(raw);
    expect(() => readSave(raw)).toThrow('newer version');
    expect(raw).toEqual(before);
  });

  it.each([
    [], 'bad', { v: '2' }, { v: 0 }, { bank: 'oops' }, { bank: -1 }, { bank: 1.5 },
    { upgrades: { unknown: 1 } }, { totals: { kills: -1 } },
  ])('rejects invalid save data %j', (raw) => {
    expect(() => readSave(raw)).toThrow();
  });
});
