import { describe, expect, it } from 'vitest';
import { createGameSession, NullInput, testProfile } from '../../../core';
import { module } from '../index';
import type { TdSnapshot } from '../sim/types';

describe('balance comparisons', () => {
  it('keeps the easy-wave card and trainer at recovery through its lull, then ramps for the next work wave', () => {
    const modes = new Set<string>();
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const s = createGameSession({ game: module, profile: testProfile(), input: new NullInput(), seed,
        fake: { script: 'z2' }, simOpts: { autopilot: true, baseHp: 1000 } });
      for (const [key, value] of Object.entries({ waveMinS: 5, waveMaxS: 15, easyWaveS: 10, heavySpawnWindowS: 3, lullS: 12 })) {
        s.tuning.set(`towerdefense.${key}`, value);
      }
      const snap = () => s.sim.snapshot() as TdSnapshot;
      const effect = () => s.mixer.debug().activeEffects.find(e => e.id === 'weapon')!;
      const value = () => { const e = effect(); return e.gradePct ?? e.levelPct ?? e.ftpFraction; };
      for (let second = 0; second < 180 && snap().wave < 5; second++) s.step(30);
      expect(snap().wave).toBe(5);
      modes.add(snap().brood.mode);
      const recovery = { gatling: 0, flame: 10, rail: 0.5 }[snap().weapon];
      expect(snap().brood.setting).toBe({ gatling: 'sim 0% grade', flame: 'resistance 10%', rail: 'ERG 50% FTP' }[snap().weapon]);
      expect(snap().brood.cue).toContain('recover');
      s.step(30 * 9); // Last part of the incoming easy lull would normally ramp up.
      expect(snap().lull).toBeGreaterThan(0);
      expect(value()).toBeCloseTo(recovery);
      s.step(30 * 4);
      expect(snap().lull).toBe(0);
      expect(value()).toBeCloseTo(recovery);
      for (let second = 0; second < 60 && snap().wave < 6; second++) s.step(30);
      expect(snap().wave).toBe(6);
      s.step(30 * 9);
      const [low, high] = { gatling: [0, 1], flame: [10, 35], rail: [0.5, 0.95] }[snap().weapon];
      expect(value()).toBeGreaterThan(low); expect(value()).toBeLessThan(high);
    }
    expect([...modes].sort()).toEqual(['erg', 'resistance', 'sim']);
  });
  it('keeps broods and forecast packs identical when combat damage and ignition change', () => {
    const plan = (damage: number, ignition: number) => {
      const s = createGameSession({ game: module, profile: testProfile(), input: new NullInput(), seed: 17,
        fake: { script: 'z2' }, simOpts: { autopilot: true, baseHp: 1000 } });
      s.tuning.set('towerdefense.towerDamageMult', damage);
      s.tuning.set('towerdefense.ignitionChance', ignition);
      const out: unknown[] = [];
      let wave = 0;
      for (let second = 0; second < 16 * 60; second++) {
        s.step(30);
        const field = s.sim.snapshot() as TdSnapshot;
        if (field.wave !== wave) {
          wave = field.wave;
          out.push({ wave, brood: field.brood?.color, forecast: field.forecast });
        }
      }
      expect(s.sim.summary().runsFallen).toBe(0);
      return { out, damage: Number(s.sim.summary().towerDamage) };
    };
    const weak = plan(0.5, 0), strong = plan(2, 1);
    const common = Math.min(weak.out.length, strong.out.length);
    expect(common).toBeGreaterThanOrEqual(5);
    expect(strong.damage).not.toBe(weak.damage);
    expect(strong.out.slice(0, common)).toEqual(weak.out.slice(0, common));
  });
});
