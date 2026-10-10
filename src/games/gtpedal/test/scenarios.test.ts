import { describe, expect, it } from 'vitest';
import { runHeadless } from '../../../core';
import { module } from '../index';
import { scenarios } from '../scenarios';

describe('gtpedal scenarios (runHeadless)', () => {
  for (const sc of scenarios) {
    it(sc.name, () => {
      const r = runHeadless({ game: module, script: sc.script, minutes: sc.minutes, seed: sc.seed, simOpts: sc.simOpts });
      expect(sc.assert(r.summary, r.stats, r), JSON.stringify(r.summary)).toEqual([]);
    });
  }
  it('is deterministic', () => {
    const a = runHeadless({ game: module, script: 'mash', minutes: 3, seed: 9, simOpts: { autopilot: true } }).summary;
    const b = runHeadless({ game: module, script: 'mash', minutes: 3, seed: 9, simOpts: { autopilot: true } }).summary;
    expect(a).toEqual(b);
  });
});
