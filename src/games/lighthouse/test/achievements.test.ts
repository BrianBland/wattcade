import { expect, it } from 'vitest';
import type { SessionRecord } from '../../../contracts';
import { achievements } from '../achievements';
import { runHeadless, testProfile } from '../../../core';
import { module } from '../index';
import { ITEMS } from '../../../cosmetics/catalog';
import { awardSession } from '../../../progression';
const rec = (gameSummary = {}, events: SessionRecord['events'] = []) => ({ gameId: 'lighthouse', gameSummary, events }) as unknown as SessionRecord;
const a = achievements.find(a => a.id === 'lh_foundations')!;
it('rewards opening the hillside, including established islands, not repeated build transactions', () => {
  expect(a.check!(testProfile(), rec({ districtsOpen: 1, buildingsBuilt: 5 }), [])).toBe(false);
  expect(a.check!(testProfile(), rec({ districtsOpen: 2 }), [])).toBe(true);
  expect(a.check!(testProfile(), rec({}, [{ t: 0, type: 'districtUnlocked', data: { district: 'hillside' } }]), [])).toBe(true);
  expect(a.check!(testProfile(), { ...rec({ districtsOpen: 5 }), gameId: 'dungeon' }, [])).toBe(false);
  expect(ITEMS.filter(i => 'achievement' in i.source && i.source.achievement === a.id)).toHaveLength(1);
});
it('a fresh steady half hour gets one modest game reward without lowering the later goals', () => {
  const r = runHeadless({ game: module, script: 'z2', minutes: 35, seed: 11, simOpts: { autopilot: true } });
  const record = { ...rec(r.summary, r.events), durationS: 2100, stats: r.stats,
    samples: Array.from({ length: 2100 }, (_, t) => ({ t, power: 130, cadence: 90 })) } as unknown as SessionRecord;
  const result = awardSession(testProfile(), record, achievements);
  expect(result.newAchievements.map(a => a.id)).toEqual(['lh_foundations']);
  expect(awardSession(result.profile, record, achievements).newAchievements).toEqual([]);
}, 30_000);
