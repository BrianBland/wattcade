import { describe, expect, it } from 'vitest';
import { module } from '../index';
import { scenarios } from '../scenarios';
import { stubRun } from './stubContext';

describe('lighthouse scenarios (stub context)', () => {
  for (const sc of scenarios) {
    it(sc.name, () => {
      const r = stubRun(module, sc.script, sc.minutes, sc.seed, sc.simOpts);
      const fails = sc.assert(r.summary, {} as any, { mixerCommands: [], isOver: r.isOver, events: r.events });
      expect(fails, JSON.stringify(r.summary)).toEqual([]);
    });
  }
  it('storm adds grade, persists town', () => {
    const r = stubRun(module, 'storm-ready', 30, 4, { autopilot: true });
    expect(r.maxGrade).toBeGreaterThanOrEqual(3);
    expect((r.saved as any).buildings.some(Boolean)).toBe(true);
  });
  it('is deterministic', () => {
    const a = stubRun(module, 'mash', 5, 9).summary, b = stubRun(module, 'mash', 5, 9).summary;
    expect(a).toEqual(b);
  });
});
