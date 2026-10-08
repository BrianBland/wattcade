import { describe, expect, it } from 'vitest';
import type { SessionRecord } from '../contracts';
import { runHeadless } from '../core';
import { getGame } from '../games/registry';
import { awardSession, defaultProfile } from './index';

/**
 * Real headless rides must unlock the game achievements they obviously earn. This guards the summary keys and
 * event names the achievements read against renames in the sims.
 */
async function ride(gameId: string, scenarioName: string): Promise<{ ids: string[]; counters: Record<string, number> }> {
  const game = getGame(gameId)!;
  const { scenarios } = await import(`../games/${gameId}/scenarios.ts`) as { scenarios: Array<{ name: string; script: string; minutes: number; seed: number; simOpts?: Record<string, unknown>; media?: never }> };
  const sc = scenarios.find((s) => s.name === scenarioName)!;
  const r = runHeadless({ game, script: sc.script, minutes: sc.minutes, seed: sc.seed, simOpts: sc.simOpts, media: sc.media });
  const record: SessionRecord = {
    id: 'h', profileId: 'x', gameId, startedAt: new Date(2026, 4, 13, 12).getTime(), durationS: 60, samples: [],
    events: r.events, stats: r.stats, gameSummary: r.summary,
  };
  const res = awardSession(defaultProfile(), record);
  return { ids: res.newAchievements.map((a) => a.id), counters: res.profile.counters ?? {} };
}
const unlocked = async (gameId: string, scenarioName: string) => (await ride(gameId, scenarioName)).ids;
/** Lifetime tallies the ride moved (they unlock over many rides, so check the counter instead). */
async function counted(gameId: string, scenarioName: string, keys: string[]) {
  const { counters } = await ride(gameId, scenarioName);
  for (const k of keys) expect(counters[`${gameId}.${k}`] ?? 0, k).toBeGreaterThan(0);
}

describe('headless rides unlock game achievements', () => {
  it('dungeon hour', async () => {
    expect(await unlocked('dungeon', 'z2-hour')).toEqual(expect.arrayContaining(['dg_floor5', 'dg_curses']));
    await counted('dungeon', 'z2-hour', ['bosses', 'kills', 'bestFloor']);
  });
  it('dungeon sprints find uniques', async () => {
    await counted('dungeon', 'sprints-boss', ['uniques']);
  });
  it('lighthouse storms', async () => {
    await counted('lighthouse', 'storm-ready', ['storms', 'docked', 'windups']);
  });
  it('dynamo defense', async () => {
    expect(await unlocked('towerdefense', 'surge-ready')).toEqual(expect.arrayContaining(['td_wave10', 'td_wave25']));
    await counted('towerdefense', 'surge-ready', ['bosses', 'kills']);
  });
  it('sprocket squadron', async () => {
    expect(await unlocked('starfighter', 'z2-half-hour')).toContain('sf_maw');
    await counted('starfighter', 'z2-half-hour', ['bosses', 'kills']);
  });
  it('hamstergrid', async () => {
    expect(await unlocked('hamster', 'clinical-trial')).toEqual(expect.arrayContaining(['hm_era3', 'hm_era4']));
    await counted('hamster', 'clinical-trial', ['trials']);
    await counted('hamster', 'golden-chaser', ['goldens']);
    await counted('hamster', 'strike-breaker', ['strikes']);
  });
  it('warm-up', async () => {
    expect(await unlocked('warmup', 'z2 rolls along')).toContain('wu_tourist');
  });
  it('cadenza', async () => {
    expect(await unlocked('cadenza', 'autopilot rides an automixed EDM set')).toEqual(expect.arrayContaining(['cz_first', 'cz_overdrive']));
    await counted('cadenza', 'autopilot rides an automixed EDM set', ['cleanZones', 'songs']);
  });
}, 120_000);
