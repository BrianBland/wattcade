import { describe, expect, it } from 'vitest';
import type { Profile, SessionRecord } from '../contracts';
import { migrateProfile, migrateSessionRecord, migrateTuning } from './renames';
import { TuningRegistry } from './tuning';
import { testProfile } from './testProfile';

class Mem { m = new Map<string, string>(); getItem(k: string) { return this.m.get(k) ?? null; } setItem(k: string, v: string) { this.m.set(k, v); } removeItem(k: string) { this.m.delete(k); } }

describe('renamed games keep riders\' progress (wattsurf → cadenza)', () => {
  it('moves the save and last-played time', () => {
    const p: Profile = { ...testProfile(), gameData: { wattsurf: { plays: 3, bestScore: 999 }, dungeon: { x: 1 } }, lastPlayed: { wattsurf: 50, dungeon: 7 } };
    const m = migrateProfile(p);
    expect(m.gameData).toEqual({ cadenza: { plays: 3, bestScore: 999 }, dungeon: { x: 1 } });
    expect(m.lastPlayed).toEqual({ cadenza: 50, dungeon: 7 });
    expect(migrateProfile(m)).toBe(m); // idempotent, no copy when nothing to do
  });
  it('never overwrites a save already under the new id', () => {
    const m = migrateProfile({ ...testProfile(), gameData: { wattsurf: { old: true }, cadenza: { fresh: true } }, lastPlayed: {} });
    expect(m.gameData).toEqual({ cadenza: { fresh: true } });
  });
  it('renames wsurf_* achievements to cz_*', () => {
    const m = migrateProfile({ ...testProfile(), achievements: ['first_ride', 'wsurf_first', 'wsurf_full_set', 'cz_first'] });
    expect(m.achievements).toEqual(['first_ride', 'cz_first', 'cz_full_set']);
    expect(migrateProfile(m)).toBe(m);
  });
  it('relabels ride history', () => {
    const r = { gameId: 'wattsurf' } as SessionRecord;
    expect(migrateSessionRecord(r).gameId).toBe('cadenza');
    const d = { gameId: 'dungeon' } as SessionRecord;
    expect(migrateSessionRecord(d)).toBe(d);
  });
  it('moves tuning overrides, re-keyed, when the registry first reads the namespace', () => {
    const s = new Mem();
    s.setItem('wattcade.tuning.p1.wattsurf', JSON.stringify({ 'wattsurf.hillScale': 0.5 }));
    const reg = new TuningRegistry({ profileId: 'p1', storage: s });
    expect(reg.scoped('cadenza').num('hillScale', 1, 0, 2, 0.05)()).toBe(0.5);
    expect(s.getItem('wattcade.tuning.p1.wattsurf')).toBeNull();
    expect(JSON.parse(s.getItem('wattcade.tuning.p1.cadenza')!)).toEqual({ 'cadenza.hillScale': 0.5 });
    migrateTuning(s, 'wattcade.tuning.p1.', 'cadenza'); // nothing left to do
    expect(JSON.parse(s.getItem('wattcade.tuning.p1.cadenza')!)).toEqual({ 'cadenza.hillScale': 0.5 });
  });
});
