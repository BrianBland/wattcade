import { describe, expect, it } from 'vitest';
import { runHeadless } from '../../../core';
import { module } from '../index';
import { scenarios } from '../scenarios';

// Runs are deterministic: share one run per (script, minutes, seed, opts) between the scenario check and the event check below.
const runs = new Map<string, ReturnType<typeof runHeadless>>();
const run = (script: string, minutes: number, seed: number, simOpts?: Record<string, unknown>) => {
  const key = JSON.stringify([script, minutes, seed, simOpts ?? null]);
  if (!runs.has(key)) runs.set(key, runHeadless({ game: module, script, minutes, seed, simOpts }));
  return runs.get(key)!;
};

describe('lighthouse scenarios (runHeadless)', () => {
  for (const sc of scenarios) {
    it(sc.name, () => {
      const r = run(sc.script, sc.minutes, sc.seed, sc.simOpts);
      const fails = sc.assert(r.summary, r.stats, r);
      expect(fails, JSON.stringify(r.summary)).toEqual([]);
    });
  }
  it('every weathered storm emits stormWeathered; storm-ready 2nd weathered by 25 min (slack)', () => {
    const r = run('storm-ready', 30, 4); // same ride as the 'storm-ready' scenario
    const ev = r.events.filter((e) => e.type === 'stormWeathered').length;
    expect(ev).toBe(Number(r.summary.stormsWeathered));
    const w = r.events.filter((e) => e.type === 'stormWeathered');
    expect(w.length).toBeGreaterThanOrEqual(2);
    expect(w[1].t).toBeLessThan(25 * 60);
  });
  it('is deterministic', () => {
    const a = runHeadless({ game: module, script: 'mash', minutes: 5, seed: 9 }).summary;
    const b = runHeadless({ game: module, script: 'mash', minutes: 5, seed: 9 }).summary;
    expect(a).toEqual(b);
  });
});
