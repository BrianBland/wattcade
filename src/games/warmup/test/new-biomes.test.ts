import { describe, expect, it } from 'vitest';
import { BIOMES, biomeAt, biomeWeights } from '../sim/terrain';
import { LOOKS } from '../render/biomes';
import { GATEWAYS } from '../render/gateway';
import { frogPose } from '../render/biomesNew';
import { Soundscape } from '../render/soundscape';
import { makeRng } from '../../../core/rng';

describe('new destinations', () => {
  it('retains old numeric indices and lifetime achievement bit positions', () => {
    expect(BIOMES.slice(0, 8)).toEqual(['countryside', 'seaside', 'underwater', 'jungle', 'desert', 'volcano', 'snow', 'moon']);
    for (const id of BIOMES) { expect(LOOKS[id]).toBeDefined(); expect(GATEWAYS[id]).toBeDefined(); }
  });
  it('blends continuously into and out of all added destinations', () => {
    for (const seg of [8, 9, 10, 11, 12]) {
      const boundary = seg * 1200;
      const weights = (d: number) => new Map(biomeWeights(biomeAt(d, 1200, 0)));
      const a = weights(boundary - 0.01), b = weights(boundary + 0.01);
      for (const id of BIOMES) expect(Math.abs((a.get(id) ?? 0) - (b.get(id) ?? 0))).toBeLessThan(0.0001);
    }
  });
  it('frogs land before rippling and never teleport between successive hops', () => {
    for (const seed of [0, 0.23, 0.7]) for (let t = 0; t < 25; t += 0.005) {
      const a = frogPose(t, seed), b = frogPose(t + 0.005, seed);
      expect(a.lift).toBeGreaterThanOrEqual(0); expect(a.lift).toBeLessThanOrEqual(7);
      expect(Math.abs(a.x - b.x)).toBeLessThan(0.07);
      if (a.ripple !== null) expect(a.lift).toBe(0);
    }
  });
  it('new scenes have quiet voices, honor ducking and go silent when parked', () => {
    for (const id of ['autumn', 'marsh', 'market', 'sky'] as const) {
      for (const mode of ['moving', 'parked', 'ducked']) {
        const sounds = new Soundscape(makeRng(3)), heard: string[] = [];
        for (let t = 0; t < 180; t += 0.5) for (const shot of sounds.tick(t, [[id, 1]], mode === 'parked' ? 0 : 1, mode === 'ducked')) heard.push(shot.sfx);
        expect(heard.length > 0).toBe(mode === 'moving');
        if (id === 'marsh' && mode === 'moving') expect(heard).toContain('croak');
        if (id === 'sky' && mode === 'moving') expect(heard).toContain('whale');
      }
    }
  });
});
