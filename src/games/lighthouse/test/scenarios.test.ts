import { describe, expect, it } from 'vitest';
import { runHeadless } from '../../../core';
import { module } from '../index';
import { scenarios } from '../scenarios';

describe('lighthouse scenarios (runHeadless)', () => {
  for (const sc of scenarios) {
    it(sc.name, () => {
      const r = runHeadless({ game: module, script: sc.script, minutes: sc.minutes, seed: sc.seed, simOpts: sc.simOpts });
      const fails = sc.assert(r.summary, r.stats, r);
      expect(fails, JSON.stringify(r.summary)).toEqual([]);
    });
  }
  it('every weathered storm emits stormWeathered; storm-ready 2nd weathered by 25 min (slack)', () => {
    const r = runHeadless({ game: module, script: 'storm-ready', minutes: 30, seed: 4 });
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
