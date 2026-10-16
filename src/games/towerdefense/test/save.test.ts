import { describe, expect, it } from 'vitest';
import { readSave } from '../sim/save';

describe('Dynamo Defense save migrations', () => {
  it('migrates v2 without losing progress and drops retired core fields', () => {
    const raw = {
      v: 2, bank: 4321, bestWave: 24, upgrades: { plating: 3, headstart: 4 }, runs: 9, autoInvest: true,
      cores: 2, coresMax: 3,
      totals: { waves: 88, kills: 901, bosses: 12, towers: 31, surges: 17, coresLost: 8 },
    };
    const before = structuredClone(raw);
    const migrated = readSave(raw);
    expect(migrated).toEqual({
      v: 3, bank: 4321, bestWave: 24, upgrades: { plating: 3, headstart: 4 }, runs: 9, autoInvest: true,
      totals: { waves: 88, kills: 901, bosses: 12, towers: 31, surges: 17, runsFallen: 0, runsBailed: 0 },
    });
    migrated.upgrades.plating = 4;
    expect(raw).toEqual(before);
  });

  it('keeps v3 outcome totals and is idempotent', () => {
    const saved = readSave({ totals: { runsFallen: 5, runsBailed: 7 } });
    expect(readSave(saved)).toEqual(saved);
  });

  it('loads a legacy best-wave-only save and a new rider', () => {
    expect(readSave({ bestWave: 9 })).toMatchObject({ v: 3, bestWave: 9, bank: 0, runs: 0 });
    expect(readSave(undefined).totals).toEqual({ waves: 0, kills: 0, bosses: 0, towers: 0, surges: 0, runsFallen: 0, runsBailed: 0 });
  });

  it('refuses newer versions without downgrading or mutating their payload', () => {
    const raw = { v: 4, bank: 900, newMechanic: { level: 12 } };
    const before = structuredClone(raw);
    expect(() => readSave(raw)).toThrow('newer version');
    expect(raw).toEqual(before);
  });

  it.each([
    [], 'bad', 42, { v: '3' }, { v: 0 }, { v: 3.5 },
    { bank: 'oops' }, { bank: NaN }, { bank: Infinity }, { bank: -1 }, { bank: 1.5 },
    { runs: -5 }, { bestWave: Number.MAX_SAFE_INTEGER + 1 }, { autoInvest: 'yes' },
    { upgrades: [] }, { upgrades: null }, { totals: null }, { upgrades: { plating: 10000 } }, { upgrades: { capacity: 3 } },
    { upgrades: { plating: 1.2 } }, { upgrades: { unknown: 1 } }, { totals: { kills: -1 } },
  ])('rejects invalid save data %j', (raw) => {
    expect(() => readSave(raw)).toThrow();
  });

  it('keeps additive metadata in supported versions', () => {
    expect(readSave({ v: 3, annotation: 'backup', totals: { custom: 9 } })).toMatchObject({ annotation: 'backup', totals: { custom: 9 } });
  });
});
