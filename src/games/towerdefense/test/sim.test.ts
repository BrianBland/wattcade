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
});

function rigged() {
  const held = new Set<string>(), pressed = new Set<string>(), released = new Set<string>();
  const st = { held, pressed, released, paddleL: 0, paddleR: 0, paddleIdleS: 99, source: 'script' } as unknown as InputState;
  let skip = false;
  const input = { beginTick() { if (skip) skip = false; else { pressed.clear(); released.clear(); } }, state: () => st };
  const session = createGameSession({ game: module, profile: testProfile(), input, fake: { script: 'intervals' }, seed: 3 });
  const events: any[] = [];
  return { fresh: () => { skip = true; }, session, held, pressed, released, events, charges: () => (session.sim.snapshot() as any).railCharges as number };
}

describe('rail', () => {
  it('caps charges at 3 and hold-Z dumps with railFired{charges:3}', () => {
    const h = rigged();
    h.session.step(30 * 120);
    expect(h.charges()).toBe(3);
    h.pressed.add('z'); h.held.add('z'); h.fresh();
    h.session.step(30);
    const ev = h.session.recorder ? h.session.finish().events.find(e => e.type === 'railFired') : undefined;
    expect(ev?.data?.charges).toBe(3);
  });
  it('tap Z fires one charge', () => {
    const h = rigged();
    h.session.step(30 * 120);
    h.pressed.add('z'); h.held.add('z'); h.fresh(); h.session.step(1);
    h.held.delete('z'); h.released.add('z'); h.fresh(); h.session.step(1);
    const evs = h.session.finish().events.filter(e => e.type === 'railFired');
    expect(evs.map(e => e.data?.charges)).toEqual([1]);
  });
});
