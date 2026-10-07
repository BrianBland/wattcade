import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import { ProfileStore, SessionStore, awardSession, defaultProfile, levelForXp, xpForLevel, ACHIEVEMENTS } from './index';
import type { SessionRecord } from '../contracts';

/** A plain Wednesday lunchtime (local): no calendar achievements. */
const NOON = new Date(2026, 4, 13, 12, 0).getTime();

function rec(over: Partial<SessionRecord> = {}, stats: Partial<SessionRecord['stats']> = {}): SessionRecord {
  return {
    id: 's' + Math.random(), profileId: 'x', gameId: 'dungeon', startedAt: NOON, durationS: 600,
    samples: Array.from({ length: 600 }, (_, t) => ({ t, power: 150, cadence: 85, hr: null, grade: null, mode: 'sim' as const })),
    events: [],
    stats: { avgPower: 150, maxPower: 300, kj: 90, avgHr: null, zoneSeconds: [0, 300, 0, 0, 0], sprints: 2, ...stats },
    gameSummary: {}, ...over,
  };
}

describe('levels', () => {
  it('curve', () => {
    expect(xpForLevel(1)).toBe(0);
    expect(xpForLevel(2)).toBe(100);
    expect(xpForLevel(3)).toBe(Math.floor(100 * 2 ** 1.6));
    expect(levelForXp(99)).toBe(1);
    expect(levelForXp(100)).toBe(2);
    for (let L = 1; L < 30; L++) expect(levelForXp(xpForLevel(L))).toBe(L);
  });
});

describe('awardSession', () => {
  it('xp formula + first_ride', () => {
    const p = defaultProfile();
    const r = awardSession(p, rec());
    // 90 kJ + 2*10 active + 5 z2 + 10 sprints = 125, + 25 first_ride
    expect(r.baseXp).toBe(125);
    expect(r.xpGained).toBe(150);
    expect(r.profile.xp).toBe(150);
    expect(r.levelUps).toEqual([2]);
    expect(r.newAchievements.map((a) => a.id)).toEqual(['first_ride']);
    expect(r.profile.lifetime).toMatchObject({ kj: 90, seconds: 600, sessions: 1, sprints: 2 });
    expect(r.profile.lastPlayed.dungeon).toBe(NOON);
    expect(p.xp).toBe(0); // input not mutated
    expect(awardSession(r.profile, rec()).newAchievements).toEqual([]);
  });
  it('event/summary achievements', () => {
    const p = defaultProfile();
    const r = awardSession(p, rec({
      events: [{ t: 1, type: 'bossDefeated' }, { t: 2, type: 'railFired', data: { charges: 3 } }],
    }, { sprints: 10, kj: 1000 }));
    const ids = r.newAchievements.map((a) => a.id);
    expect(ids).toEqual(expect.arrayContaining(['dungeon_clear', 'sprinter_10', 'kilojoule_1000']));
    expect(ids).not.toContain('triple_rail'); // a Dynamo Defense feat: not from a dungeon ride
    const td = awardSession(r.profile, rec({ gameId: 'towerdefense', events: [{ t: 2, type: 'railFired', data: { charges: 3 } }] }));
    expect(td.newAchievements.map((a) => a.id)).toContain('triple_rail');
  });
  it('keeper_20 and storms', () => {
    let p = defaultProfile();
    const lh = (storms: number, z2: number) => rec({
      gameId: 'lighthouse', events: Array.from({ length: storms }, (_, i) => ({ t: i, type: 'stormWeathered' })),
    }, { zoneSeconds: [0, z2, 0, 0, 0] });
    let r = awardSession(p, lh(2, 1200)); p = r.profile;
    expect(r.newAchievements.map((a) => a.id)).toContain('keeper_20');
    expect(p.achievements).not.toContain('storm_chaser');
    expect(p.counters!['lighthouse.storms']).toBe(2);
    r = awardSession(p, lh(1, 0));
    expect(r.newAchievements.map((a) => a.id)).toContain('storm_chaser');
  });
  it('triple_threat and balanced_week', () => {
    let p = defaultProfile();
    const day = 86400000;
    p = awardSession(p, rec({ gameId: 'dungeon', startedAt: 0 })).profile;
    p = awardSession(p, rec({ gameId: 'lighthouse', startedAt: 3 * day })).profile;
    const r = awardSession(p, rec({ gameId: 'towerdefense', startedAt: 5 * day }));
    const ids = r.newAchievements.map((a) => a.id);
    expect(ids).toContain('triple_threat'); expect(ids).toContain('balanced_week');
    let q = defaultProfile();
    q = awardSession(q, rec({ gameId: 'dungeon', startedAt: 0 })).profile;
    q = awardSession(q, rec({ gameId: 'lighthouse', startedAt: 3 * day })).profile;
    const r2 = awardSession(q, rec({ gameId: 'towerdefense', startedAt: 20 * day }));
    expect(r2.newAchievements.map((a) => a.id)).toContain('triple_threat');
    expect(r2.newAchievements.map((a) => a.id)).not.toContain('balanced_week');
  });
  it('unique ids, and every pre-existing id is still there', () => {
    expect(new Set(ACHIEVEMENTS.map((a) => a.id)).size).toBe(ACHIEVEMENTS.length);
    const kept = ['first_ride', 'triple_threat', 'balanced_week', 'keeper_20', 'storm_chaser', 'sprinter_10', 'triple_rail', 'dungeon_clear',
      'ws_cycle', 'ws_cloud', 'ws_canyon', 'ws_delta', 'ws_salmon', 'ws_clean_run', 'ws_maestro', 'ws_miller', 'ws_dry_feet', 'ws_dam_buster',
      'ws_breadbasket', 'ws_meteor', 'ws_act_of_nature', 'cz_first', 'cz_clean', 'cz_overdrive', 'cz_full_set', 'kilojoule_1000'];
    for (const id of kept) expect(ACHIEVEMENTS.map((a) => a.id)).toContain(id);
  });
});

describe('stores', () => {
  it('profile CRUD, last id, export/import', async () => {
    const s = new ProfileStore('t1');
    const a = await s.create('Ann'); const b = await s.create('Bob');
    expect((await s.list()).map((p) => p.name)).toEqual(['Ann', 'Bob']);
    await s.setLastProfileId(b.id);
    expect(await s.getLastProfileId()).toBe(b.id);
    await s.update({ ...a, ftp: 250 });
    expect((await s.get(a.id))!.ftp).toBe(250);
    const json = await s.exportJson();
    const s2 = new ProfileStore('t2');
    expect(await s2.importJson(json)).toBe(2);
    expect(await s2.getLastProfileId()).toBe(b.id);
    expect((await s2.get(a.id))!.ftp).toBe(250);
    await expect(s2.importJson('{"x":1}')).rejects.toThrow();
    await s.delete(b.id);
    expect(await s.getLastProfileId()).toBeUndefined();
    expect(await s.list()).toHaveLength(1);
  });
  it('session store keeps last 200', async () => {
    const s = new SessionStore('t3');
    for (let i = 0; i < 205; i++) await s.save(rec({ profileId: 'pp', startedAt: i, id: 'id' + i }));
    const l = await s.list('pp');
    expect(l).toHaveLength(200);
    expect(l[0].startedAt).toBe(204);
    expect(l[199].startedAt).toBe(5);
    expect(await s.list('other')).toEqual([]);
  });
});
