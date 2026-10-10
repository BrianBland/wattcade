import { describe, expect, it } from 'vitest';
import { runHeadless } from '../../../core';
import { module } from '../index';
import { scenarios } from '../scenarios';

describe('gtpedal scenarios (runHeadless)', () => {
  for (const sc of scenarios) {
    it(sc.name, () => {
      const r = runHeadless({ game: module, script: sc.script, minutes: sc.minutes, seed: sc.seed, simOpts: { start: 'bike', ...sc.simOpts } });
      expect(sc.assert(r.summary, r.stats, r), JSON.stringify(r.summary)).toEqual([]);
    }, 30000); // 10 sim-minutes with ~85 NPCs: ~0.2 ms per tick, slower under a parallel full-suite run
  }
  it('is deterministic', () => {
    const a = runHeadless({ game: module, script: 'mash', minutes: 3, seed: 9, simOpts: { start: 'bike', autopilot: true } }).summary;
    const b = runHeadless({ game: module, script: 'mash', minutes: 3, seed: 9, simOpts: { start: 'bike', autopilot: true } }).summary;
    expect(a).toEqual(b);
  }, 30000);
});
