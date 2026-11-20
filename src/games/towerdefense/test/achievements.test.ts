import { expect, it } from 'vitest';
import type { GameEvent, SessionRecord } from '../../../contracts';
import { testProfile } from '../../../core';
import { awardSession, defaultProfile } from '../../../progression';
import { achievements } from '../achievements';

type Ev = { t: number } & GameEvent;
const profile = testProfile();
const check = (id: string, record: Partial<SessionRecord>) => {
  const a = achievements.find((x) => x.id === id)!;
  const full = { gameId: 'towerdefense', events: [], gameSummary: {}, durationS: 0, samples: Array.from({ length: record.durationS ?? 0 }, (_, t) => ({ t, power: 130, cadence: 90 })), ...record } as unknown as SessionRecord;
  return a.check ? a.check(profile, full, []) : false;
};
const burst = (ordinal: number): Ev => ({ t: 0, type: 'burst', data: { ordinal, chain: 1 } });

it('level achievements read the campaign save at ride end and the cleared-level events', () => {
  const lv = (stars: number, data: Record<string, number | string> = {}): Ev => ({ t: 0, type: 'levelCleared', data: { stars, chain: 1, intensity: 'steady', ...data } });
  expect(check('td_hard', { events: [lv(2, { intensity: 'hard' })] })).toBe(true);
  expect(check('td_hard', { events: [lv(2), { t: 0, type: 'levelFailed', data: { intensity: 'hard' } }] })).toBe(false);
  expect(check('td_double_shift', { events: [lv(1), lv(3, { chain: 2 })] })).toBe(true);
  expect(check('td_double_shift', { events: [lv(1), lv(3)] })).toBe(false);
});

it('the call achievements are retired; their successors read weapon switches, tier V boss kills, tier IV+ time and long clears', () => {
  for (const id of ['td_surges', 'td_spin', 'td_on_call', 'td_iron_lungs']) expect(achievements.some((a) => a.id === id)).toBe(false);
  const switches = achievements.find((a) => a.id === 'td_quick_change')!;
  expect(switches.goal).toBe(200);
  expect(switches.count!.of({ gameId: 'towerdefense', events: [], gameSummary: { weaponSwitches: 12 } } as unknown as SessionRecord, profile)).toBe(12);
  expect(check('td_top_gear', { events: [{ t: 0, type: 'bossKilled', data: { topGear: false } }] })).toBe(false);
  expect(check('td_top_gear', { events: [{ t: 0, type: 'bossKilled', data: { topGear: true } }] })).toBe(true);
  expect(achievements.find((a) => a.id === 'td_redline')!.count!.of({ gameId: 'towerdefense', events: [], gameSummary: { highTierSeconds: 600 } } as unknown as SessionRecord, profile)).toBe(10);
  const cleared: Ev = { t: 0, type: 'levelCleared', data: { stars: 2, chain: 1, intensity: 'steady' } };
  expect(check('td_long_haul', { durationS: 1800, events: [cleared] })).toBe(true);
  expect(check('td_long_haul', { durationS: 1799, events: [cleared] })).toBe(false);
  expect(check('td_long_haul', { durationS: 1800 })).toBe(false);
});

it('ignition chains read burst ordinals, not the burst count', () => {
  expect(check('td_kindling', { events: [burst(2), burst(2)] })).toBe(false);
  expect(check('td_kindling', { events: [burst(3)] })).toBe(true);
  expect(check('td_bonfire', { events: [burst(3), burst(3)], gameSummary: { bestChain: 3 } })).toBe(false);
  expect(check('td_bonfire', { gameSummary: { bestChain: 4 } })).toBe(true);
});

it('Exposed! counts each defeated, exposed-sprinted boss once, not mere sprint events', () => {
  const a = achievements.find(a => a.id === 'td_exposed')!;
  const record = { gameId: 'towerdefense', gameSummary: { exposedSprinted: 1 }, events: [
    { t: 0, type: 'overdrive' }, { t: 1, type: 'bossExposed' },
    { t: 2, type: 'bossKilled', data: { exposedSprinted: false } },
    { t: 3, type: 'bossKilled', data: { exposedSprinted: true } },
  ] } as unknown as SessionRecord;
  expect(a.goal).toBe(5);
  expect(a.count!.of(record, profile)).toBe(1);
  expect(a.count!.of({ ...record, gameId: 'dungeon' }, profile)).toBe(0);
});
it('Triple Rail counts Railgun pulses that hit 3 or more', () => {
  const a = achievements.find(a => a.id === 'triple_rail')!;
  expect(a.goal).toBe(25);
  expect(a.count!.of({ gameId: 'towerdefense', events: [1,2,3,5].map(hits => ({ t: 0, type: 'railFired', data: { charges: 1, hits } })) } as unknown as SessionRecord, profile)).toBe(2);
});

it('a zone-2 half hour unlocks at most one Dynamo Defense achievement', () => {
  const summary = {
    wavesSurvived: 7, bossesKilled: 1, scrapEarned: 2500, weaponSwitches: 14, highTierSeconds: 0,
    bestChain: 3, strongKills: 180, spotlessWaves: 1, bestRunSpotless: 1,
  };
  const events: Ev[] = [
    burst(3),
    { t: 1, type: 'bossKilled', data: { wave: 4, phases: 3 } },
    { t: 2, type: 'towerUpgraded', data: { pad: 0, tower: 'tesla', level: 3 } },
  ];
  const record = {
    id: 'z2', profileId: 'x', gameId: 'towerdefense', startedAt: Date.now(), durationS: 30 * 60,
    samples: Array.from({ length: 1800 }, (_, t) => ({ t, power: 130, cadence: 85, hr: null, grade: 0, mode: 'sim' as const })),
    events, stats: { avgPower: 130, kj: 200, sprints: 0, maxPower: 160, avgHr: null, zoneSeconds: [0, 1800, 0, 0, 0] }, gameSummary: summary,
  } as unknown as SessionRecord;
  const ids = awardSession(defaultProfile(), record).newAchievements.map((a) => a.id).filter((id) => achievements.some((a) => a.id === id));
  expect(ids).toEqual(['td_kindling']);
});

it('real boss victories record exposed sprints per boss, without awarding five victories at once', async () => {
  const { runHeadless } = await import('../../../core');
  const { module } = await import('../index');
  const r = runHeadless({ game: module, script: 'hook-responsive', minutes: 35, seed: 11, simOpts: { autopilot: true } });
  const bosses = r.events.filter(e => e.type === 'bossKilled');
  expect(bosses.length).toBeGreaterThan(0);
  expect(bosses.every(e => typeof e.data?.exposedSprinted === 'boolean')).toBe(true);
  expect(bosses.some(e => e.data?.exposedSprinted === true)).toBe(true);
  expect(achievements.find(a => a.id === 'td_exposed')!.count!.of({ gameId: 'towerdefense', events: r.events } as unknown as SessionRecord, profile)).toBeLessThan(5);
}, 30_000);
