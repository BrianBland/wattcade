import { describe, it, expect } from 'vitest';
import { NullInput, createGameSession, testProfile } from '../../../core';
import { module } from '../index';
import type { Fx, TdSnapshot } from '../sim/types';
import { CARD_S, MAX_GLINTS, cardAlpha, glintAt, landedValue, planGlints, sweepEnd, sweepHead } from '../render/salvage';

describe('salvage sweep presentation', () => {
  it('spreads salvage over capped glints that start on the husks', () => {
    const g = planGlints([{ x: 10, y: 20 }, { x: 30, y: 40 }], 50, 200, { x: 50, y: 40 });
    expect(g).toHaveLength(MAX_GLINTS);
    expect(g.reduce((s, x) => s + x.value, 0)).toBeCloseTo(200);
    expect(g[0].from).toEqual({ x: 10, y: 20 });
    expect(planGlints([], 0, 0, { x: 5, y: 5 })[0].from).toEqual({ x: 5, y: 5 });
  });
  it('glints rise, arc into the outpost and land; the card counts up to the full salvage', () => {
    const to = { x: 50, y: 87 }, g = planGlints([{ x: 20, y: 30 }], 10, 100, to);
    expect(glintAt(g[3], to, 0)).toBeNull(); // staggered
    expect(glintAt(g[0], to, 0.15)!.lift).toBeGreaterThan(0);
    const end = sweepEnd(g);
    expect(glintAt(g[0], to, end)!.landed).toBe(true);
    expect(landedValue(g, to, 0.1)).toBe(0);
    expect(landedValue(g, to, end)).toBeCloseTo(100);
    const mid = landedValue(g, to, end - 0.2);
    expect(mid).toBeGreaterThan(0); expect(mid).toBeLessThan(100);
    expect(end).toBeLessThan(CARD_S); // the stream finishes while the card is up
  });
  it('the trench sweep and the card time out, and a skip fades the card quickly', () => {
    expect(sweepHead(0.45)).toBeCloseTo(0.5); expect(sweepHead(2)).toBeNull();
    expect(cardAlpha(1)).toBe(1); expect(cardAlpha(CARD_S)).toBe(0);
    expect(cardAlpha(1.3, 1)).toBe(0);
  });
});

describe('sim wave tally', () => {
  it('each clear emits one tally with the wave kills and salvage; Spotless waves pay a bonus and emit an event', () => {
    const s = createGameSession({ game: module, profile: testProfile(), input: new NullInput(), fake: { script: 'sprints' }, seed: 1, simOpts: { autopilot: true, skipGarage: true } });
    const events: string[] = [];
    const emit = s.ctx.emit; s.ctx.emit = (e) => { events.push(e.type); emit(e); };
    const tallies: Array<Extract<Fx, { kind: 'waveTally' }>> = [], seen = new Set<number>();
    for (let i = 0; i < 30 * 60 * 6; i++) {
      s.step(1);
      for (const f of (s.sim.snapshot() as TdSnapshot).fx) if (f.kind === 'waveTally' && !seen.has(f.id)) { seen.add(f.id); tallies.push(f); }
    }
    expect(tallies.length).toBeGreaterThan(2);
    expect(new Set(tallies.map((t) => t.wave)).size).toBe(tallies.length);
    for (const t of tallies) {
      expect(t.kills).toBeGreaterThan(0); expect(t.salvage).toBeGreaterThan(0);
      expect(t.spotlessBonus > 0).toBe(t.spotless);
    }
    expect(events.filter((e) => e === 'waveSpotless').length).toBe(tallies.filter((t) => t.spotless).length);
  });
});
