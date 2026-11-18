import { describe, expect, it } from 'vitest';
import { canObserve, levelFor, observeK, priorK, type FireballLevelTuning } from './fireballLevel';

const T: FireballLevelTuning = { cueRpm: 75, alpha: 1.5, minPct: 2, maxPct: 60, tauS: 20 };

/** A trainer whose brake costs `ftpPerPct` at the cue cadence, scaling with rpm^1.5. */
const trainer = (ftpPerPct: number) => (level: number, rpm: number) => ftpPerPct * level * Math.pow(rpm / 75, 1.5);

describe('Fireball resistance level', () => {
  it('the prior puts the reference level at the reference demand', () => {
    expect(levelFor(0.85, priorK(18, 0.85), T)).toBeCloseTo(18);
    expect(levelFor(0.5, priorK(18, 0.85), T)).toBeLessThan(18);
  });

  it('a strong brake (35% = 0.85 FTP at 45 rpm) learns a level that hits the demand at the cue cadence', () => {
    const k0 = priorK(35, 0.85);
    const ride = trainer(0.85 / (35 * Math.pow(45 / 75, 1.5)));
    let k = k0;
    for (let i = 0; i < 120; i++) k = observeK(k, k0, 35, 45, ride(35, 45), 1, T);
    const lvl = levelFor(0.85, k, T);
    expect(lvl).toBeLessThan(20);
    expect(ride(lvl, 75)).toBeGreaterThan(0.8);
    expect(ride(lvl, 75)).toBeLessThan(0.9);
  });

  it('converges from either side while the rider follows the commanded level', () => {
    for (const truth of [0.02, 0.05, 0.1]) {
      const k0 = priorK(18, 0.85), ride = trainer(truth);
      let k = k0;
      for (let i = 0; i < 300; i++) { const lvl = levelFor(0.85, k, T); k = observeK(k, k0, lvl, 80, ride(lvl, 80), 1, T); }
      expect(ride(levelFor(0.85, k, T), 75)).toBeCloseTo(0.85, 2);
    }
  });

  it('one odd sample barely moves it, and k stays within 4x of the prior', () => {
    const k0 = priorK(18, 0.85);
    expect(observeK(k0, k0, 18, 75, 3, 0.1, T) / k0).toBeLessThan(1.1);
    let k = k0;
    for (let i = 0; i < 1000; i++) k = observeK(k, k0, 18, 75, 100, 1, T);
    expect(k).toBeCloseTo(k0 * 4);
  });

  it('ignores coasting, unsettled levels and no power', () => {
    expect(canObserve(18, 75, 0.8, 5)).toBe(true);
    expect(canObserve(18, 20, 0.8, 5)).toBe(false);
    expect(canObserve(18, 75, 0.8, 1)).toBe(false);
    expect(canObserve(18, 75, 0, 5)).toBe(false);
    expect(canObserve(0, 75, 0.8, 5)).toBe(false);
  });
});
