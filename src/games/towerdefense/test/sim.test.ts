import { describe, it, expect } from 'vitest';
import { scenarios } from '../scenarios';
import { makeStub, type ScriptName } from './stub';

describe('scenarios via local stub', () => {
  for (const sc of scenarios) {
    it(sc.name, () => {
      const m = makeStub(sc.script as ScriptName, sc.seed, sc.simOpts);
      const r = m.run(sc.minutes);
      console.log(sc.name, JSON.stringify(r.summary), r.isOver);
      expect(sc.assert(r.summary, r.stats, r)).toEqual([]);
    });
  }
});

describe('rail', () => {
  it('caps charges at 3 and hold-Z dumps with railFired{charges:3}', () => {
    const m = makeStub('intervals', 3);
    // no enemies close enough matter; just charge via hard riding
    for (let i = 0; i < 30 * 200 && (m.sim.snapshot() as any).railCharges < 3; i++) m.step();
    for (let i = 0; i < 30 * 60; i++) m.step(); // keep charging beyond cap
    expect((m.sim.snapshot() as any).railCharges).toBe(3);
    m.input.pressed.add('z'); m.input.held.add('z');
    for (let i = 0; i < 30; i++) { m.step(); m.input.pressed.clear(); }
    const ev = m.events.find(e => e.type === 'railFired');
    expect(ev?.data?.charges).toBe(3);
    expect((m.sim.snapshot() as any).railCharges).toBe(0);
  });
  it('tap Z fires one charge', () => {
    const m = makeStub('intervals', 3);
    for (let i = 0; i < 30 * 200 && (m.sim.snapshot() as any).railCharges < 2; i++) m.step();
    m.input.pressed.add('z'); m.input.held.add('z'); m.step();
    m.input.pressed.clear(); m.input.held.delete('z'); m.input.released.add('z'); m.step();
    expect(m.events.filter(e => e.type === 'railFired').map(e => e.data?.charges)).toEqual([1]);
  });
  it('each weapon sets the matching trainer mode', () => {
    const m = makeStub('sprints', 1);
    m.input.pressed.add('b'); m.step(); expect(m.effects.get('weapon')?.mode).toBe('resistance');
    m.input.pressed.add('y'); m.step(); expect(m.effects.get('weapon')?.mode).toBe('erg');
    m.input.pressed.add('a'); m.step(); expect(m.effects.get('weapon')?.mode).toBe('sim');
  });
});
