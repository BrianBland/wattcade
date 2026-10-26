import { expect, it } from 'vitest';
import type { SessionRecord } from '../../../contracts';
import { achievements } from '../achievements';
import { BIOMES } from '../sim/terrain';
import { awardSession, defaultProfile } from '../../../progression';
const rec = (biomes: readonly string[], active = 600, gameId = 'warmup') => ({ gameId, durationS: 2100, gameSummary: {},
  samples: Array.from({ length: active }, (_, t) => ({ t, cadence: 90, power: 130 })),
  events: biomes.map(biome => ({ t: 1, type: 'biomeReached', data: { biome } })), stats: { zoneSeconds: [], kj: 10, sprints: 0 } }) as unknown as SessionRecord;
it('does not credit short, inactive or other-game rides, or old one-visit counters', () => {
  let p = { ...defaultProfile(), counters: { 'warmup.biomes': 4095 } };
  for (const r of [rec(BIOMES, 599), rec(BIOMES, 0), rec(BIOMES, 600, 'dungeon')]) p = awardSession(p, r, achievements).profile as typeof p;
  expect(p.achievements).toEqual([]);
  expect(p.counters['warmup.biomes']).toBe(4095);
});
it('requires each biome on three rides and saturates without leaking credit to its neighbours', () => {
  let p = defaultProfile();
  for (let i = 0; i < 8; i++) p = awardSession(p, rec(['moon','moon']), achievements).profile;
  const globe = achievements.find(a => a.id === 'wu_globetrotter')!;
  expect(globe.value!(p)).toBe(1);
  for (let i = 0; i < 2; i++) p = awardSession(p, rec(BIOMES), achievements).profile;
  expect(p.achievements).not.toContain('wu_globetrotter');
  p = awardSession(p, rec(BIOMES), achievements).profile;
  expect(globe.value!(p)).toBe(BIOMES.length);
  expect(p.achievements).toContain('wu_globetrotter');
  const old = { ...p, achievements: ['wu_moon', 'wu_globetrotter'] };
  expect(awardSession(old, rec([]), achievements).profile.achievements).toEqual(old.achievements);
});
