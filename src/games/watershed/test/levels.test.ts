import { describe, expect, it } from 'vitest';
import { FREE_RIDE, LEVELS, LevelRun, levelPlan, levelsCleared, suggestedLevel, totalDrops, unlocked, WARMUP, type LevelMetrics } from '../sim/levels';
import { planMinutes } from '../sim/plan';
import { progressLine } from '../card';

const M = (o: Partial<LevelMetrics> = {}): LevelMetrics => ({
  deepestCut: 0, carved: 0, delta: 0, toSea: 0, flour: 0, planks: 0, harvests: 0, drownedS: 0, surgesHeld: 0, surgesLost: 0,
  floodS: 0, damHealth: 1, damBroken: false, damBrokenAt: 0, salmonHome: 0, salmonLost: 0, bandPct: 0, t: 0, ...o,
});

describe('watershed campaign levels', () => {
  it('eight levels in order, each a 20 to 35 minute ride that starts with the water cycle', () => {
    expect(LEVELS.map((l) => l.n)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(new Set(LEVELS.map((l) => l.id)).size).toBe(8);
    for (const l of LEVELS) {
      const p = levelPlan(l);
      expect(planMinutes(p)).toBeGreaterThanOrEqual(20);
      expect(planMinutes(p)).toBeLessThanOrEqual(35);
      expect(p.slice(0, 3).map((b) => b.phase)).toEqual(['evaporate', 'cloud', 'rain']);
      // one goal per ride: no free-ride jobs or random beavers inside a level
      expect(p.every((b) => !b.job && !b.beavers)).toBe(true);
      for (const b of p) { expect(b.ftpFrom).toBeLessThanOrEqual(1); expect(b.ftpTo).toBeGreaterThanOrEqual(0.4); expect(b.minutes).toBeGreaterThan(0); }
      // skipping the warm-up drops evaporation and cloud only
      expect(levelPlan(l, true)).toEqual(p.slice(2));
    }
    expect(WARMUP.length).toBe(3);
    expect(LEVELS.find((l) => l.id === 'millbrook-flood')!.blocks.filter((b) => b.surge).length).toBe(3);
    expect(LEVELS.find((l) => l.id === 'homecoming')!.blocks.some((b) => b.phase === 'salmon')).toBe(true);
  });

  it('unlocks in order: clearing a level opens the next; Free Ride is always open', () => {
    expect(LEVELS.filter((l) => unlocked(undefined, l)).map((l) => l.n)).toEqual([1]);
    expect(LEVELS.filter((l) => unlocked({ 'first-spring': 1 }, l)).map((l) => l.n)).toEqual([1, 2]);
    expect(LEVELS.filter((l) => unlocked({ 'first-spring': 3, 'grist-mill': 0 }, l)).map((l) => l.n)).toEqual([1, 2]);
    expect(suggestedLevel(undefined)).toBe('first-spring');
    expect(suggestedLevel({ 'first-spring': 2 })).toBe('grist-mill');
    // everything cleared: go back for missing drops, then Free Ride
    const all = Object.fromEntries(LEVELS.map((l) => [l.id, 3]));
    expect(suggestedLevel({ ...all, 'grist-mill': 2 })).toBe('grist-mill');
    expect(suggestedLevel(all)).toBe(FREE_RIDE.id);
    expect(totalDrops(all)).toBe(24); expect(levelsCleared({ 'first-spring': 1, 'grist-mill': 0 })).toBe(1);
  });

  it('a goal is done once reached; bonus drops only count with it', () => {
    const r = new LevelRun(LEVELS.find((l) => l.id === 'grist-mill')!);
    expect(r.update(M({ flour: 100, bandPct: 95 }), false)).toBe(null);
    expect(r.drops()).toBe(0);                                   // bonus met, goal not: nothing yet
    expect(r.view(M({ flour: 120 })).goal.progress).toBeCloseTo(0.5);
    expect(r.update(M({ flour: 240, bandPct: 95, t: 600 }), false)).toBe('done');
    expect(r.doneAt).toBe(600);
    expect(r.drops()).toBe(2);
    expect(r.update(M({ flour: 500, bandPct: 70 }), true)).toBe(null);   // stays done
    expect(r.drops()).toBe(2);                                   // 7 min of flour, but band fell under 80%
    expect(r.view(M()).goal.state).toBe('done');
  });

  it('unreached goals fail at the end; a lost surge fails the flood level at once', () => {
    const d = new LevelRun(LEVELS.find((l) => l.id === 'delta')!);
    expect(d.update(M({ delta: 100 }), false)).toBe(null);
    expect(d.update(M({ delta: 100 }), true)).toBe('failed');
    const v = new LevelRun(LEVELS.find((l) => l.id === 'millbrook-flood')!);
    expect(v.update(M({ surgesHeld: 1 }), false)).toBe(null);
    expect(v.update(M({ surgesHeld: 1, surgesLost: 1 }), false)).toBe('failed');
    const w = new LevelRun(LEVELS.find((l) => l.id === 'millbrook-flood')!);
    expect(w.update(M({ surgesHeld: 3, floodS: 0, bandPct: 90 }), false)).toBe('done');
    expect(w.drops()).toBe(3);
  });

  it('the dam level times its bonus from when the dam broke', () => {
    const def = LEVELS.find((l) => l.id === 'dam-buster')!;
    const fast = new LevelRun(def), slow = new LevelRun(def);
    fast.update(M({ damBroken: true, damHealth: 0.4, damBrokenAt: 200 }), true);
    slow.update(M({ damBroken: true, damHealth: 0.4, damBrokenAt: 300 }), true);
    expect(fast.drops()).toBe(2); expect(slow.drops()).toBe(1);
    const never = new LevelRun(def);
    expect(never.view(M({ damHealth: 0.8 })).goal.progress).toBeCloseTo(0.4);
    never.update(M({ damHealth: 0.8 }), true);
    expect(never.drops()).toBe(0);
  });

  it('the card line shows campaign progress', () => {
    expect(progressLine({ rides: 3, levels: { 'first-spring': 3, 'grist-mill': 1 } })).toContain('level 3/8, 4 💧');
    expect(progressLine({ rides: 1, bestScore: 10 })).toContain('best score 10');
  });
});
