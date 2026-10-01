import { describe, it, expect } from 'vitest';
import { createGameSession, runHeadless, testProfile } from '../../../core';
import type { InputState } from '../../../contracts';
import { module } from '../index';
import { scenarios } from '../scenarios';

describe('scenarios via runHeadless', () => {
  for (const sc of scenarios) {
    it(sc.name, () => {
      const r = runHeadless({ game: module, script: sc.script, minutes: sc.minutes, seed: sc.seed, simOpts: sc.simOpts });
      expect(sc.assert(r.summary, r.stats, r)).toEqual([]);
    });
  }
  it('idle scores < 10% of sprints', () => {
    const a = runHeadless({ game: module, script: 'sprints', minutes: 15, seed: 1, simOpts: { autopilot: true } });
    const b = runHeadless({ game: module, script: 'idle', minutes: 5, seed: 1, simOpts: { autopilot: true } });
    expect(b.isOver || Number(b.summary.score) < 0.1 * Number(a.summary.score)).toBe(true);
  });
});

function rigged(simOpts?: Record<string, unknown>) {
  const held = new Set<string>(), pressed = new Set<string>(), released = new Set<string>();
  const st = { held, pressed, released, paddleL: 0, paddleR: 0, paddleIdleS: 99, source: 'script' } as unknown as InputState;
  const input = { beginTick() { pressed.clear(); released.clear(); }, state: () => st };
  const session = createGameSession({ game: module, profile: testProfile(), input, fake: { script: 'sprints' }, seed: 3, simOpts });
  return { session, held, snap: () => session.sim.snapshot() as any };
}

describe('guns', () => {
  for (const [btn, side] of [['shiftUpL', 'L'], ['left', 'L'], ['shiftDnR', 'R'], ['y', 'R']] as const) {
    it(`${btn} fires only the ${side} gun`, () => {
      const h = rigged();
      h.session.step(30 * 5);
      h.held.add(btn);
      const sides = new Set<string>();
      for (let i = 0; i < 90; i++) { h.session.step(1); for (const b of h.snap().bullets) sides.add(b.side); }
      expect([...sides]).toEqual([side]);
    });
  }
  it('idle triggers fire nothing', () => {
    const h = rigged();
    let n = 0;
    for (let i = 0; i < 150; i++) { h.session.step(1); n += h.snap().bullets.length; }
    expect(n).toBe(0);
  });
});

describe('hud', () => {
  it('exposes zone target and no gears', () => {
    const h = rigged({ autopilot: true });
    const hud = h.session.sim.hud!();
    expect(hud.gears).toBe(false);
    expect(hud.targetZone).toMatchObject({ min: 2, max: 2 });
    h.session.step(30 * 155);
    expect(h.session.sim.hud!().targetZone).toMatchObject({ min: 4, max: 4 });
  });
});

describe('determinism', () => {
  it('same seed -> identical summary', () => {
    const run = () => runHeadless({ game: module, script: 'sprints', minutes: 6, seed: 7, simOpts: { autopilot: true } }).summary;
    expect(run()).toEqual(run());
  });
});
