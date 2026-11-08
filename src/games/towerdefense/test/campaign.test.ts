import { describe, expect, it } from 'vitest';
import { createGameSession, runHeadless, testProfile, TimelineInput } from '../../../core';
import { module } from '../index';
import { CAMPAIGN, bossCount, campaignOpen, estimateMinutes, levelWaves, quickRide, starsFor } from '../sim/campaign';
import type { TdSave } from '../sim/sim';
import type { TdSnapshot } from '../sim/types';

describe('level wave lists', () => {
  it('fit their length: warm-up first, sets of 2–3 work waves, bosses closing the last sets', () => {
    for (const minutes of [15, 20, 25, 30, 40, 60]) for (const seed of [1, 2, 3]) {
      const bosses = bossCount(minutes, seed), waves = levelWaves(minutes, bosses);
      expect(Math.abs(estimateMinutes(waves) - minutes), `${minutes} min`).toBeLessThan(2.5);
      expect(waves[0]).toMatchObject({ role: 'easy', warmup: true });
      expect(waves.filter(w => w.role === 'boss')).toHaveLength(bosses);
      if (bosses) expect(waves[waves.length - 1].role).toBe('boss');
      expect(waves.slice(1).some(w => w.warmup)).toBe(false);
      for (const set of new Set(waves.filter(w => w.role === 'work').map(w => w.set))) {
        const n = waves.filter(w => w.role === 'work' && w.set === set).length;
        expect(n).toBeGreaterThanOrEqual(2); expect(n).toBeLessThanOrEqual(3);
      }
    }
    expect(bossCount(20, 1)).toBe(1); expect(bossCount(40, 1)).toBe(2); expect(bossCount(60, 1)).toBe(3);
  });

  it('the campaign is 5 levels per style, 15–40 min, unlocking in order; stars come from base HP', () => {
    expect(CAMPAIGN).toHaveLength(30);
    expect(CAMPAIGN.every(c => c.minutes >= 15 && c.minutes <= 40)).toBe(true);
    expect(new Set(CAMPAIGN.map(c => c.id)).size).toBe(30);
    expect(campaignOpen({})).toBe(0);
    expect(campaignOpen({ c1: 1, c2: 3 })).toBe(2);
    expect(quickRide(5, 30)).toEqual(quickRide(5, 30));
    expect([starsFor(0.2), starsFor(0.6), starsFor(0.95)]).toEqual([1, 2, 3]);
  });
});

describe('playing a level', () => {
  function play(simOpts: Record<string, unknown>, script = 'z2', gameData: Record<string, unknown> = {}) {
    const profile = testProfile({ gameData });
    let saved: TdSave | undefined;
    const s = createGameSession({ game: module, profile, input: new TimelineInput([]), fake: { script }, seed: 4,
      simOpts: { autopilot: true, ...simOpts }, onSave: (d) => { saved = d as TdSave; } });
    return { s, snap: () => s.sim.snapshot() as TdSnapshot, saved: () => saved! };
  }

  it('a 15-minute campaign level runs its fixed waves on its own map, then offers the next level', () => {
    const { s, snap, saved } = play({ play: { campaign: 0 } });
    s.step(1);
    const first = snap();
    expect(first.run).toMatchObject({ id: 'c1', minutes: 15 });
    expect(first.level.id).toMatch(/^gen-/);
    expect(first.set.warmup).toBe(true);
    const waves = first.run!.waves;
    let steps = 0;
    while (snap().phase === 'run' && steps++ < 30 * 60 * 30) s.step(10);
    const end = snap();
    expect(end.phase).toBe('garage');
    const events = s.finish().events;
    const cleared = events.find(e => e.type === 'levelCleared');
    expect(cleared?.data).toMatchObject({ id: 'c1', waves });
    expect(events.filter(e => e.type === 'waveCleared')).toHaveLength(waves);
    expect(end.garage!.rows.map(r => r.kind)).toEqual(['next', 'finish']);
    expect(end.garage!.rows[0].name).toContain(CAMPAIGN[1].name);
    expect(saved().campaign.c1).toBe(Number(cleared!.data!.stars));
    // the sim minutes land near the level's length
    expect(end.t / 60).toBeGreaterThan(10); expect(end.t / 60).toBeLessThan(22);
  }, 120_000);

  it('Next level starts the next map straight away, from a warm-up wave', () => {
    const { s, snap } = play({ play: { campaign: 0 } });
    let steps = 0;
    while (snap().phase === 'run' || steps === 0) { s.step(10); if (steps++ > 30 * 60 * 30) break; }
    const map = snap().level;
    s.sim.receive!({ type: 'garageRow', row: 0 }); s.step(1);
    expect(snap()).toMatchObject({ phase: 'run', wave: 1, run: { id: 'c2' }, set: { warmup: true } });
    expect(snap().level).not.toBe(map);
    expect(snap().towers).toHaveLength(0);
  }, 120_000);

  it('intensity scales work-wave trainer targets and alien HP; recovery stays put', () => {
    const grade = (intensity: string) => {
      const run = runHeadless({ game: module, script: 'z2', minutes: 8, seed: 4, simOpts: { autopilot: true, play: { campaign: 0 }, intensity } });
      const grades = run.mixerCommands.map(c => (c as { gradePct?: number }).gradePct).filter((g): g is number => typeof g === 'number');
      const { s } = play({ play: { campaign: 0 }, intensity });
      let hp = 0;
      for (let i = 0; i < 30 * 60 * 6; i += 30) { s.step(30); for (const e of (s.sim.snapshot() as TdSnapshot).enemies) if (e.kind === 'mini') hp = Math.max(hp, e.maxHp); }
      return { top: Math.max(...grades), hp };
    };
    const easy = grade('easy'), steady = grade('steady'), hard = grade('hard');
    expect(easy.top).toBeLessThan(steady.top); expect(hard.top).toBeGreaterThan(steady.top);
    expect(easy.hp).toBeLessThan(steady.hp); expect(hard.hp).toBeGreaterThan(steady.hp);
  }, 120_000);

  it('a new rider starts Campaign I; the select screen lists campaign, quick ride, intensity and endless', () => {
    const profile = testProfile();
    const s = createGameSession({ game: module, profile, input: new TimelineInput([]), fake: { script: 'z2' }, seed: 1 });
    s.step(1);
    expect((s.sim.snapshot() as TdSnapshot).run?.id).toBe('c1');
    s.sim.receive!({ type: 'bail' }); s.step(1);
    const g = (s.sim.snapshot() as TdSnapshot).garage!;
    expect(g.rows.slice(0, 4).map(r => r.kind)).toEqual(['campaign', 'quick', 'start', 'intensity']);
  });
});
