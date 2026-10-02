import { describe, expect, it } from 'vitest';
import type { Button, InputState } from '../../../contracts';
import { createGameSession, runHeadless, testProfile, type InputSource } from '../../../core';
import { module } from '../index';
import { scenarios } from '../scenarios';
import { equivalence, fmtJ, genCost, kardashev, DEFAULT_ECON } from '../sim/econ';
import type { HamsterSave, HamsterSnapshot } from '../sim/sim';

class Pad implements InputSource {
  private queue: Button[] = [];
  private s: InputState = { held: new Set(), pressed: new Set(), released: new Set(), paddleL: 0, paddleR: 0, paddleIdleS: 0, source: 'script' };
  press(b: Button) { this.queue.push(b); }
  beginTick() { this.s = { ...this.s, pressed: new Set(this.queue.splice(0, 1)) }; }
  state() { return this.s; }
}
function session(opts: { gameData?: unknown; simOpts?: Record<string, unknown>; script?: string } = {}) {
  const pad = new Pad();
  const profile = testProfile({ gameData: opts.gameData ? { hamster: opts.gameData } : {} });
  let saved: unknown;
  const s = createGameSession({ game: module, profile, input: pad, seed: 3, fake: { script: opts.script ?? 'z2' }, simOpts: opts.simOpts, onSave: (d) => { saved = d; } });
  return { s, pad, snap: () => s.sim.snapshot() as HamsterSnapshot, saved: () => saved as HamsterSave };
}
const secs = (n: number) => Math.round(n * 30);

describe('hamster econ', () => {
  it('formats and rates', () => {
    expect(fmtJ(0)).toBe('0 J');
    expect(fmtJ(1500)).toBe('1.50 kJ');
    expect(fmtJ(3.8e26)).toBe('380 YJ');
    expect(fmtJ(2e40)).toMatch(/e40 J$/);
    expect(kardashev(1e6)).toBeCloseTo(0);
    expect(kardashev(1e26)).toBeCloseTo(2);
    expect(equivalence(2000)).toBe('≈ 2.0 toasters');
    expect(genCost(DEFAULT_ECON, 0, 0, 10)).toBeCloseTo(400 * (1.15 ** 10 - 1) / 0.15);
  });
});

describe('hamster sim', () => {
  it('pedaling earns energy; A buys a hamster; hamsters need cadence', () => {
    const { s, pad, snap } = session();
    s.step(secs(10));
    expect(snap().bank).toBeGreaterThan(400);
    pad.press('a'); s.step(1);
    expect(snap().gens[0].owned).toBe(1);
    expect(snap().hamRate).toBeGreaterThan(0);
  });
  it('idle: hamsters refuse to run without you', () => {
    const { s, snap } = session({ script: 'idle', gameData: { v: 1, gens: [50], bank: 0 } });
    s.step(secs(30));
    expect(snap().rate).toBe(0);
    expect(snap().unionOn).toBe(false);
  });
  it('Mind-Numbing builds in steady Z2', () => {
    const { s, snap } = session();
    s.step(secs(240));
    expect(snap().mono).toBeGreaterThan(1.8);
  });
  it('saves and restores the empire', () => {
    const a = session({ simOpts: { preset: { gens: [5, 2] } } });
    a.s.step(secs(5)); a.s.sim.dispose?.();
    const save = a.saved();
    expect(save.gens.slice(0, 2)).toEqual([5, 2]);
    const b = session({ gameData: save });
    expect(b.snap().gens[0].owned).toBe(5);
    expect(b.snap().tabs.map((t) => t.id)).toContain('market');
  });
  it('black market: injecting seeds boosts output', () => {
    const { s, pad, snap } = session({ gameData: { v: 1, gens: [10, 5], bank: 1e6, unlocks: ['market', 'upgrades'] } });
    s.step(secs(5));
    const before = snap().rate;
    pad.press('right'); pad.press('right'); s.step(3);
    expect(snap().tab).toBe('market');
    pad.press('a'); s.step(secs(1));
    expect(snap().effects.some((e) => e.id === 'seeds')).toBe(true);
    expect(snap().rate).toBeGreaterThan(before * 1.3);
  });
  it('reincarnation needs a double press and grants seeds', () => {
    const { s, pad, snap } = session({ gameData: { v: 1, gens: [10], bank: 0, life: 8e27, unlocks: ['rebirth'] } });
    s.step(2);
    const idx = snap().tabs.findIndex((t) => t.id === 'rebirth');
    for (let i = 0; i < idx; i++) pad.press('right');
    s.step(idx + 1);
    pad.press('a'); s.step(2);
    expect(snap().armed).toBe(true);
    pad.press('a'); s.step(2);
    expect(snap().seeds).toBe(2);
    expect(snap().gens[0].owned).toBe(0);
  });
});

describe('hamster scenarios (runHeadless)', () => {
  for (const sc of scenarios) {
    it(sc.name, () => {
      const r = runHeadless({ game: module, script: sc.script, minutes: sc.minutes, seed: sc.seed, simOpts: sc.simOpts });
      expect(sc.assert(r.summary, r.stats, r), JSON.stringify(r.summary)).toEqual([]);
    });
  }
  it('is deterministic', () => {
    const a = runHeadless({ game: module, script: 'mash', minutes: 5, seed: 9, simOpts: { autopilot: true } }).summary;
    const b = runHeadless({ game: module, script: 'mash', minutes: 5, seed: 9, simOpts: { autopilot: true } }).summary;
    expect(a).toEqual(b);
  });
});
