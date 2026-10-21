import { describe, it, expect } from 'vitest';
import { NullInput, createGameSession, testProfile } from '../../../core';
import { module } from '../index';
import type { Fx, TdSnapshot } from '../sim/types';
import { FLINCH_S, PAYOFF_STYLE, cableHeat, flinchAt, mixHex, shimmerBands, stepBlend } from '../render/overdrive';

describe('overdrive visuals', () => {
  it('blends in fast and out slowly', () => {
    let b = 0;
    for (let i = 0; i < 30; i++) b = stepBlend(b, true, 1 / 60);
    expect(b).toBeGreaterThan(0.9);
    let c = 1;
    for (let i = 0; i < 30; i++) c = stepBlend(c, false, 1 / 60);
    expect(c).toBeGreaterThan(0.3);
    expect(c).toBeLessThan(1);
  });
  it('cables go from dark to white-hot, pulses grow and speed up', () => {
    const cold = cableHeat(0), hot = cableHeat(1);
    expect(cold.core).toBe('#2b393d');
    expect(cold.glow).toBeNull();
    expect(hot.glow).not.toBeNull();
    expect(hot.pulseSize).toBeGreaterThan(cold.pulseSize);
    expect(hot.pulseSpeed).toBeGreaterThan(cold.pulseSpeed);
    expect(mixHex('#000000', '#ffffff', 0.5)).toBe('#808080');
  });
  it('heat shimmer stays at the edges and above the HUD line, and vanishes when cold', () => {
    expect(shimmerBands(1, 1366, 900, 0)).toEqual([]);
    const bands = shimmerBands(3.7, 1366, 900, 1);
    expect(bands.length).toBeGreaterThan(0);
    for (const b of bands) {
      expect(b.y).toBeLessThan(900);
      const edge = b.x <= 0 || b.x + b.w >= 1366 - 1 || b.y === 0;
      expect(edge).toBe(true);
    }
  });
  it('a flinch rises fast and is gone after its window', () => {
    expect(flinchAt(-1)).toBe(0);
    expect(flinchAt(0.04)).toBeGreaterThan(0.6);
    expect(flinchAt(FLINCH_S + 0.01)).toBe(0);
    expect(Object.keys(PAYOFF_STYLE).sort()).toEqual(['grind', 'hold', 'spin']);
  });
});

describe('called-effort payoff fx', () => {
  it('each resolved call emits one payoff fx; wins also freeze briefly (≤ 0.1 s)', () => {
    const s = createGameSession({ game: module, profile: testProfile(), input: new NullInput(), fake: { script: 'hook-responsive' }, seed: 2, simOpts: { autopilot: true, skipGarage: true } });
    const seen = new Set<number>(), payoffs: Array<Extract<Fx, { kind: 'payoff' }>> = [], stops: number[] = [];
    for (let i = 0; i < 30 * 60 * 12; i++) {
      s.step(1);
      for (const f of (s.sim.snapshot() as TdSnapshot).fx) {
        if (seen.has(f.id)) continue; seen.add(f.id);
        if (f.kind === 'payoff') payoffs.push(f);
        if (f.kind === 'hitStop') stops.push(f.seconds);
      }
    }
    expect(payoffs.length).toBeGreaterThan(0);
    expect(payoffs.some((p) => p.won)).toBe(true);
    for (const x of stops) expect(x).toBeLessThanOrEqual(0.1);
  });
});
