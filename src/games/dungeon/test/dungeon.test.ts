import { describe, expect, it } from 'vitest';
import { createGameSession, runHeadless, testProfile, NullInput } from '../../../core';
import { module } from '../index';
import { generateWorld, TILE } from '../sim/world';
import { scenarios } from '../scenarios';
import { makeRng } from '../../../core';

describe('world', () => {
  it('generates 8 connected rooms', () => {
    const w = generateWorld(makeRng(5));
    expect(w.rooms.length).toBe(8);
    expect(w.links.length).toBe(7);
    expect(w.tiles.includes(TILE.DOOR)).toBe(true);
    expect(w.tiles.includes(TILE.SWAMP)).toBe(true);
  });
});

describe('swamp resistance (core mixer)', () => {
  it('commanded grade rises while on swamp tiles', () => {
    const s = createGameSession({ game: module, profile: testProfile(), input: new NullInput(), fake: { script: 'z2' }, seed: 13, simOpts: { autopilot: true } });
    let sawBase = false, sawSwamp = false;
    for (let i = 0; i < 20 * 60 * 30 && !sawSwamp; i++) {
      s.step(1);
      const snap = s.sim.snapshot() as { hooks: { swamp: boolean } };
      const g = s.mixer.debug().lastCommand as { gradePct?: number } | null | undefined;
      const grade = g?.gradePct;
      if (grade !== undefined && !snap.hooks.swamp && i > 90) sawBase = sawBase || grade < 3.5;
      if (grade !== undefined && snap.hooks.swamp && i > 90) sawSwamp = sawSwamp || grade >= 4.5;
    }
    expect(sawBase).toBe(true);
    expect(sawSwamp).toBe(true);
  });
});

describe('scenarios via runHeadless', () => {
  for (const sc of scenarios) {
    it(sc.name, () => {
      const r = runHeadless({ game: module, script: sc.script, minutes: sc.minutes, seed: sc.seed, simOpts: sc.simOpts });
      const fails = sc.assert(r.summary, r.stats, { mixerCommands: r.mixerCommands, isOver: r.isOver, events: r.events });
      expect(fails, JSON.stringify(r.summary)).toEqual([]);
    });
  }
  it('is deterministic', () => {
    const o = { game: module, script: 'z2', minutes: 3, seed: 4, simOpts: { autopilot: true } };
    expect(runHeadless(o).summary).toEqual(runHeadless(o).summary);
  });
});
