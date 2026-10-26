import { expect, it } from 'vitest';
import type { SessionRecord } from '../../../contracts';
import { achievements } from '../achievements';
import { awardSession, defaultProfile } from '../../../progression';
import { runHeadless } from '../../../core';
import { module } from '../index';
const rec = (gameSummary = {}, events: SessionRecord['events'] = []): SessionRecord => ({ gameId: 'starfighter', durationS: 120,
  samples: Array.from({ length: 120 }, (_, t) => ({ t, power: 130, cadence: 90 })), events, gameSummary, stats: { zoneSeconds: [], sprints: 0, kj: 15 } }) as unknown as SessionRecord;
const a = (id: string) => achievements.find(a => a.id === id)!;
it('depth counts defeated flagships, never entered or escaped sectors or old entry counters', () => {
  const p = { ...defaultProfile(), counters: { 'starfighter.bestSector': 30 } };
  const r = rec({ sector: 30 }, [{ t: 0, type: 'bossEscaped', data: { sector: 20 } }]);
  expect(awardSession(p, r, achievements).newAchievements).toEqual([]);
  for (const [id, goal] of [['sf_maw', 5], ['sf_deep', 10]] as const) {
    expect(a(id).goal).toBe(goal);
    expect(a(id).count!.of(rec({}, [{ t: 0, type: 'bossDefeated', data: { sector: goal } }]), p)).toBe(goal);
  }
});
it('requires three clean flights, not three awards within one flight', () => {
  let p = defaultProfile();
  const r = rec({ sectorsCleared: 9, deaths: 0 });
  p = awardSession(p, rec({ sectorsCleared: 9, deaths: 1 }), achievements).profile;
  for (let i = 0; i < 2; i++) { p = awardSession(p, r, achievements).profile; expect(p.achievements).not.toContain('sf_flawless'); }
  expect(awardSession(p, r, achievements).profile.achievements).toContain('sf_flawless');
  expect(a('sf_flawless').count!.of(rec({ sectorsCleared: 5, deaths: 0 }), p)).toBe(0);
});
it('raises combo and arsenal gates and keeps existing rewards', () => {
  const p = defaultProfile();
  for (const [id, key, threshold] of [['sf_combo', 'maxCombo', 1500], ['sf_goldens', 'gunLevel', 6]] as const) {
    expect(a(id).check!(p, rec({ [key]: threshold - 1 }), [])).toBe(false);
    expect(a(id).check!(p, rec({ [key]: threshold }), [])).toBe(true);
    expect(a(id).check!(p, { ...rec({ [key]: threshold }), gameId: 'dungeon' }, [])).toBe(false);
  }
  p.achievements = achievements.map(a => a.id);
  expect(awardSession(p, rec(), achievements).profile.achievements).toEqual(p.achievements);
});
it('a steady fresh half hour earns only the introduction, with actual defeated-sector events', () => {
  const r = runHeadless({ game: module, script: 'z2', minutes: 35, seed: 11, simOpts: { skipHangar: true }, media: { synth: { style: 'mixed', songs: 20, seed: 3, mix: 'automix' } } });
  expect(r.events.filter(e => e.type === 'bossDefeated').map(e => e.data?.sector)).toEqual([1,2,3,4,5,6,7,8,9]);
  expect(awardSession(defaultProfile(), rec(r.summary, r.events), achievements).newAchievements.map(a => a.id)).toEqual(['sf_maw']);
}, 30_000);
