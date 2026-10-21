import { expect, it } from 'vitest';
import { runHeadless } from '../../../core';
import { module } from '../index';
import { scenarios } from '../scenarios';

/**
 * Register one vitest case per named Watershed scenario. The long rides are split across files
 * (scenarios.*.test.ts) so vitest runs them on separate workers in parallel.
 */
export function scenarioTests(names: string[], timeoutMs: number): void {
  for (const name of names) {
    const sc = scenarios.find((s) => s.name === name);
    if (!sc) throw new Error(`no watershed scenario '${name}'`);
    it(sc.name, () => {
      const r = runHeadless({ game: module, script: sc.script, minutes: sc.minutes, seed: sc.seed, simOpts: sc.simOpts });
      expect(sc.assert(r.summary, r.stats, r), JSON.stringify(r.summary)).toEqual([]);
    }, timeoutMs);
  }
}
