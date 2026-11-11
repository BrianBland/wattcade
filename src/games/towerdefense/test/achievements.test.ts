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

it('Surge Protector is one run of called efforts, and still reads the old surge tally', () => {
  expect(check('td_surges', { gameSummary: { bestRunCalls: 4, bestRunSurges: 9 } })).toBe(true);
  expect(check('td_surges', { gameSummary: { bestRunCalls: 7, callsWon: 20 } })).toBe(false);
  expect(check('td_surges', { gameSummary: { bestRunSurges: 8 } })).toBe(true);
});

it('ignition chains read burst ordinals, not the burst count', () => {
  expect(check('td_kindling', { events: [burst(2), burst(2)] })).toBe(false);
  expect(check('td_kindling', { events: [burst(3)] })).toBe(true);
  expect(check('td_bonfire', { events: [burst(3), burst(3)], gameSummary: { bestChain: 3 } })).toBe(false);
  expect(check('td_bonfire', { gameSummary: { bestChain: 4 } })).toBe(true);
});

it('Iron Lungs requires 12 calls, all three kinds, no failures or pending calls, and active time', () => {
  const events = Array.from({ length: 12 }, (_, t) => ({ t, type: 'effortWon', data: { kind: ['spin','grind','hold'][t % 3] } }));
  const r = { durationS: 1800, events, gameSummary: { callsStarted: 12 } };
  expect(check('td_iron_lungs', r)).toBe(true);
  expect(check('td_iron_lungs', { ...r, events: events.slice(1) })).toBe(false);
  expect(check('td_iron_lungs', { ...r, events: events.map(e => ({ ...e, data: { kind: 'hold' } })) })).toBe(false);
  expect(check('td_iron_lungs', { ...r, gameSummary: { callsStarted: 13 } })).toBe(false);
  expect(check('td_iron_lungs', { ...r, events: [...events, { t: 20, type: 'effortFailed' }] })).toBe(false);
  expect(check('td_iron_lungs', { ...r, durationS: 1799 })).toBe(false);
  expect(check('td_iron_lungs', { ...r, samples: [] })).toBe(false);
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
it('Triple Rail requires repeated full volleys and On Call is a longer lifetime goal', () => {
  const a = achievements.find(a => a.id === 'triple_rail')!;
  expect(a.goal).toBe(25);
  expect(a.count!.of({ gameId: 'towerdefense', events: [1,2,3,3].map(charges => ({ t: 0, type: 'railFired', data: { charges } })) } as unknown as SessionRecord, profile)).toBe(2);
  expect(achievements.find(a => a.id === 'td_on_call')!.goal).toBe(40);
});

it('a zone-2 half hour unlocks at most one Dynamo Defense achievement', () => {
  const summary = {
    wavesSurvived: 7, bossesKilled: 1, scrapEarned: 2500, callsWon: 2, callsMissed: 2, callsStarted: 4,
    bestRunCalls: 2, bestChain: 3, strongKills: 180, spotlessWaves: 1, bestRunSpotless: 1, spinsWon: 0,
  };
  const events: Ev[] = [
    burst(3),
    { t: 1, type: 'bossKilled', data: { wave: 4, phases: 3 } },
    { t: 2, type: 'towerUpgraded', data: { pad: 0, tower: 'tesla', level: 3 } },
    ...Array.from({ length: 4 }, () => ({ t: 3, type: 'effortWon' as const })),
    ...Array.from({ length: 2 }, () => ({ t: 4, type: 'effortFailed' as const })),
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
  const r = runHeadless({ game: module, script: 'hook-responsive', minutes: 35, seed: 11, simOpts: { autopilot: true, actionBot: true } });
  const bosses = r.events.filter(e => e.type === 'bossKilled');
  expect(bosses.length).toBeGreaterThan(0);
  expect(bosses.every(e => typeof e.data?.exposedSprinted === 'boolean')).toBe(true);
  expect(bosses.some(e => e.data?.exposedSprinted === true)).toBe(true);
  expect(achievements.find(a => a.id === 'td_exposed')!.count!.of({ gameId: 'towerdefense', events: r.events } as unknown as SessionRecord, profile)).toBeLessThan(5);
}, 30_000);
