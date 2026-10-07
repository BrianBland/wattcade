import { describe, expect, it } from 'vitest';
import type { SessionRecord } from '../contracts';
import { runHeadless } from '../core';
import { getGame } from '../games/registry';
import { awardSession, defaultProfile } from './index';

/**
 * Real headless rides must unlock the game achievements they obviously earn. This guards the summary keys and
 * event names the achievements read against renames in the sims.
 */
async function unlocked(gameId: string, scenarioName: string): Promise<string[]> {
  const game = getGame(gameId)!;
  const { scenarios } = await import(`../games/${gameId}/scenarios.ts`) as { scenarios: Array<{ name: string; script: string; minutes: number; seed: number; simOpts?: Record<string, unknown>; media?: never }> };
  const sc = scenarios.find((s) => s.name === scenarioName)!;
  const r = runHeadless({ game, script: sc.script, minutes: sc.minutes, seed: sc.seed, simOpts: sc.simOpts, media: sc.media });
  const record: SessionRecord = {
    id: 'h', profileId: 'x', gameId, startedAt: new Date(2026, 4, 13, 12).getTime(), durationS: 60, samples: [],
    events: r.events, stats: r.stats, gameSummary: r.summary,
  };
  return awardSession(defaultProfile(), record).newAchievements.map((a) => a.id);
}

describe('headless rides unlock game achievements', () => {
  it('dungeon hour', async () => {
    expect(await unlocked('dungeon', 'z2-hour')).toEqual(expect.arrayContaining(['dungeon_clear', 'dg_floor5', 'dg_floor10', 'dg_elites', 'dg_deathless', 'dg_curses']));
  });
  it('dungeon sprints find uniques', async () => {
    expect(await unlocked('dungeon', 'sprints-boss')).toContain('dg_unique');
  });
  it('lighthouse storms', async () => {
    expect(await unlocked('lighthouse', 'storm-ready')).toEqual(expect.arrayContaining(['keeper_20', 'storm_chaser', 'lh_storm_season']));
  });
  it('dynamo defense', async () => {
    expect(await unlocked('towerdefense', 'surge-ready')).toEqual(expect.arrayContaining(['td_wave10', 'td_wave25', 'td_boss', 'td_surges']));
  });
  it('sprocket squadron', async () => {
    expect(await unlocked('starfighter', 'z2-half-hour')).toEqual(expect.arrayContaining(['sf_boss', 'sf_maw', 'sf_combo', 'sf_goldens']));
    expect(await unlocked('starfighter', 'intervals')).toContain('sf_flawless');
  });
  it('hamstergrid', async () => {
    expect(await unlocked('hamster', 'clinical-trial')).toEqual(expect.arrayContaining(['hm_era3', 'hm_era4', 'hm_trial']));
    expect(await unlocked('hamster', 'golden-chaser')).toContain('hm_golden');
    expect(await unlocked('hamster', 'strike-breaker')).toContain('hm_strike');
  });
  it('warm-up', async () => {
    expect(await unlocked('warmup', 'z2 rolls along')).toContain('wu_tourist');
  });
  it('cadenza', async () => {
    expect(await unlocked('cadenza', 'autopilot rides an automixed EDM set')).toEqual(expect.arrayContaining(['cz_first', 'cz_overdrive', 'cz_chain', 'cz_sharp']));
  });
}, 120_000);
