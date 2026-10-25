import { describe, expect, it } from 'vitest';
import { runHeadless } from '../../../core';
import { module } from '../index';
import { scenarios } from '../scenarios';

describe('seaside scenarios', () => {
  for (const sc of scenarios) {
    it(sc.name, () => {
      const r = runHeadless({ game: module, script: sc.script, minutes: sc.minutes, seed: sc.seed, simOpts: sc.simOpts });
      expect(sc.assert(r.summary, r.stats, r), JSON.stringify(r.summary)).toEqual([]);
      if (r.events.some((e) => e.type === 'scene' && e.data?.id === 'bigOne')) {
        expect(r.events.find((e) => e.type === 'bigOneReady')?.data).toEqual({ rod: 'deep', ready: true });
        expect(r.summary['Big One rod']).toBe('deep');
      }
    }, 60_000);
  }
});
