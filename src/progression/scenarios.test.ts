import { describe, expect, it } from 'vitest';
import type { SessionRecord } from '../contracts';
import { runHeadless } from '../core';
import { getGame } from '../games/registry';
import { awardSession, defaultProfile } from './index';

/**
 * Real headless rides must unlock the game achievements they obviously earn. This guards the summary keys and
 * event names the achievements read against renames in the sims.
 */
// Each (game, scenario) ride is deterministic, so run it once and share it between the unlock and counter checks.
const rides = new Map<string, Promise<{ ids: string[]; counters: Record<string, number> }>>();
function ride(gameId: string, scenarioName: string): Promise<{ ids: string[]; counters: Record<string, number> }> {
  const key = `${gameId}/${scenarioName}`;
  if (!rides.has(key)) rides.set(key, rideOnce(gameId, scenarioName));
  return rides.get(key)!;
}
async function rideOnce(gameId: string, scenarioName: string): Promise<{ ids: string[]; counters: Record<string, number> }> {
  const game = getGame(gameId)!;
  const { scenarios } = await import(`../games/${gameId}/scenarios.ts`) as { scenarios: Array<{ name: string; script: string; minutes: number; seed: number; seeds?: number[]; simOpts?: Record<string, unknown>; tuning?: Record<string, number | boolean | string>; media?: never }> };
  const sc = scenarios.find((s) => s.name === scenarioName)!;
  // multi-seed scenarios count as consecutive rides on one profile (tallies add up; robust to one unlucky seed)
  let profile = defaultProfile(); const ids: string[] = [];
  for (const [i, seed] of (sc.seeds ?? [sc.seed]).entries()) {
    const r = runHeadless({ game, script: sc.script, minutes: sc.minutes, seed, simOpts: sc.simOpts, tuning: sc.tuning, media: sc.media });
    const record: SessionRecord = {
      id: `h${i}`, profileId: 'x', gameId, startedAt: new Date(2026, 4, 13 + i, 12).getTime(), durationS: 60, samples: [],
      events: r.events, stats: r.stats, gameSummary: r.summary,
    };
    const res = awardSession(profile, record); profile = res.profile; ids.push(...res.newAchievements.map((a) => a.id));
  }
  return { ids, counters: profile.counters ?? {} };
}
const unlocked = async (gameId: string, scenarioName: string) => (await ride(gameId, scenarioName)).ids;
/** Lifetime tallies the ride moved (they unlock over many rides, so check the counter instead). */
async function counted(gameId: string, scenarioName: string, keys: string[]) {
  const { counters } = await ride(gameId, scenarioName);
  for (const k of keys) expect(counters[`${gameId}.${k}`] ?? 0, k).toBeGreaterThan(0);
}

// Each test runs a full headless ride (up to ~2.3 s locally), so give them room on slow CI runners.
const RIDE_TIMEOUT = 30_000;

describe('headless rides unlock game achievements', () => {
  it('dungeon hour', async () => {
    // lifetime tallies are robust for any seed; the floor-8 / 12-curse feats need a deep dive, checked below on a fixed summary
    await counted('dungeon', 'action-hour', ['bosses', 'kills', 'bestFloor']);
    await counted('dungeon', 'z2-hour', ['bosses', 'kills', 'bestFloor']);
  }, RIDE_TIMEOUT);
  it('a deep dungeon dive unlocks Delver and Curse Breaker', () => {
    const r = runHeadless({ game: getGame('dungeon')!, script: 'z2', minutes: 1, seed: 1 });
    const record: SessionRecord = {
      id: 'h', profileId: 'x', gameId: 'dungeon', startedAt: new Date(2026, 4, 13, 12).getTime(), durationS: 3600, samples: [], events: r.events, stats: r.stats,
      gameSummary: { 'Deepest floor': 8, 'Curses survived': 12, 'Bosses slain': 7, Deaths: 1 },
    };
    expect(awardSession(defaultProfile(), record).newAchievements.map((a) => a.id)).toEqual(expect.arrayContaining(['dg_floor5', 'dg_curses']));
  });
  it('dungeon sprints find uniques', async () => {
    await counted('dungeon', 'sprints-boss', ['uniques']);
  }, RIDE_TIMEOUT);
  it('lighthouse storms', async () => {
    await counted('lighthouse', 'storm-ready', ['storms', 'docked', 'windups']);
  }, RIDE_TIMEOUT);
  it('dynamo defense', async () => {
    // Deep fixture opts into combat actions and a reinforced base; survival is tested by the game's passive scenarios.
    expect(await unlocked('towerdefense', 'surge-ready-deep')).toEqual(expect.arrayContaining(['td_wave10', 'td_wave25']));
    await counted('towerdefense', 'surge-ready-deep', ['bosses', 'kills']);
  }, RIDE_TIMEOUT);
  it('sprocket squadron', async () => {
    expect(await unlocked('starfighter', 'z2-half-hour')).toContain('sf_maw');
    await counted('starfighter', 'z2-half-hour', ['bosses', 'kills']);
  }, RIDE_TIMEOUT);
  it('hamstergrid clinical trial', async () => {
    expect(await unlocked('hamster', 'clinical-trial')).toEqual(expect.arrayContaining(['hm_era3', 'hm_era4']));
    await counted('hamster', 'clinical-trial', ['trials']);
  }, RIDE_TIMEOUT);
  it('hamstergrid golden chaser', async () => {
    await counted('hamster', 'golden-chaser', ['goldens']);
  }, RIDE_TIMEOUT);
  it('hamstergrid strike breaker', async () => {
    await counted('hamster', 'strike-breaker', ['strikes']);
  }, RIDE_TIMEOUT);
  it('warm-up', async () => {
    expect(await unlocked('warmup', 'z2 rolls along')).toContain('wu_tourist');
  }, RIDE_TIMEOUT);
  it('cadenza', async () => {
    expect(await unlocked('cadenza', 'autopilot rides an automixed EDM set')).toEqual(expect.arrayContaining(['cz_first', 'cz_overdrive']));
    await counted('cadenza', 'autopilot rides an automixed EDM set', ['cleanZones', 'songs']);
  }, RIDE_TIMEOUT);
});
