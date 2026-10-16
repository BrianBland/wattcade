import { describe, it, expect } from 'vitest';
import { blendColors, layerAlphas, mixColor, rgb } from '../render/blend';
import { makeMesa, mesaSlot, mesaThemeAt, DESERT_MESA } from '../render/remastered/mesa';
import { hop, makeWeed, weedAt, weedGone } from '../render/tumbleweed';
import { SOUNDSCAPE, Soundscape, speedFactor } from '../render/soundscape';
import { makeRng } from '../../../core/rng';
import { BIOMES } from '../sim/terrain';

describe('blend', () => {
  it('parses hex and mixColor output, so mixes can nest', () => {
    expect(rgb('#ff8000')).toEqual([255, 128, 0]); expect(rgb('#f80')).toEqual([255, 136, 0]); expect(rgb('rgb(1,2,3)')).toEqual([1, 2, 3]);
    expect(mixColor(mixColor('#000000', '#ffffff', 0.5), '#ffffff', 0.5)).toBe('rgb(192,192,192)');
  });
  it('weighted blend', () => {
    expect(blendColors([['#000000', 1], ['#ffffff', 1]])).toBe('rgb(128,128,128)');
    expect(blendColors([['#000000', 1]])).toBe('#000000');
  });
  it('dissolve alphas: bottom layer opaque until it is under half, others by weight', () => {
    expect(layerAlphas([1])).toEqual([1]);
    expect(layerAlphas([0.8, 0.2])).toEqual([1, 0.2]);
    expect(layerAlphas([0.25, 0.75])).toEqual([0.5, 0.75]);
  });
});

describe('mesas', () => {
  it('are deterministic per seed and have flat caps, cliffs and talus', () => {
    expect(makeMesa(12, 1)).toEqual(makeMesa(12, 1));
    for (let seed = 0; seed < 40; seed++) {
      const m = makeMesa(seed, seed % 3);
      expect(m.left[0][1]).toBe(0);
      expect(m.left[m.left.length - 1][1]).toBe(m.h);
      expect(m.talusH).toBeGreaterThan(0); expect(m.talusH).toBeLessThan(m.h);
      const hs = m.left.map((p) => p[1]);
      expect([...hs].sort((a, b) => a - b)).toEqual(hs);                // outline only climbs
      expect(m.left[0][0]).toBeLessThan(-m.halfW);                      // talus flares out past the cliff
      expect(m.strata.every((f) => f > 0 && f < 1)).toBe(true);
    }
  });
  it('slots are stable and leave gaps', () => {
    expect(mesaSlot(7, 1, 120)).toEqual(mesaSlot(7, 1, 120));
    const empty = Array.from({ length: 200 }, (_, k) => mesaSlot(k, 0, 150)).filter((s) => !s).length;
    expect(empty).toBeGreaterThan(10); expect(empty).toBeLessThan(80);
  });
  it('farther rows are hazier (closer to the haze colour)', () => {
    const d = (c: string) => { const a = rgb(c), h = rgb(DESERT_MESA.haze); return Math.abs(a[0] - h[0]) + Math.abs(a[1] - h[1]) + Math.abs(a[2] - h[2]); };
    expect(d(mesaThemeAt(DESERT_MESA, 0).rock)).toBeLessThan(d(mesaThemeAt(DESERT_MESA, 1).rock));
    expect(d(mesaThemeAt(DESERT_MESA, 1).rock)).toBeLessThan(d(mesaThemeAt(DESERT_MESA, 2).rock));
  });
});

describe('tumbleweeds', () => {
  it('are deterministic from the seed', () => {
    const a = makeWeed(makeRng(5), 'road', 3, 200, 50), b = makeWeed(makeRng(5), 'road', 3, 200, 50);
    expect(a).toEqual(b);
    expect(weedAt(a, 7.3)).toEqual(weedAt(b, 7.3));
  });
  it('bounce stays between the ground and the apex', () => {
    for (let t = 0; t < 10; t += 0.013) { const h = hop(t, 6, 1.1, 0.3); expect(h).toBeGreaterThanOrEqual(0); expect(h).toBeLessThanOrEqual(6 + 1e-9); }
  });
  it('roll leftwards and spin in proportion to ground speed and distance', () => {
    const w = makeWeed(makeRng(9), 'near', 0, 300, 0);
    const p1 = weedAt(w, 1), p2 = weedAt(w, 2);
    expect(p2.u).toBeLessThan(p1.u);
    expect(p1.spin).toBeCloseTo(-w.speed / w.r, 9);
    expect(p2.spin / p1.spin).toBeCloseTo(2, 9);
    const fast = { ...w, speed: w.speed * 2 };
    expect(weedAt(fast, 1).spin).toBeCloseTo(p1.spin * 2, 9);
  });
  it('lanes size differently and weeds eventually leave', () => {
    const r = (lane: 'far' | 'near') => makeWeed(makeRng(1), lane, 0, 100, 0).r;
    expect(r('far')).toBeLessThan(r('near'));
    expect(weedGone(-50, 3, 5)).toBe(true); expect(weedGone(100, 3, 5)).toBe(false); expect(weedGone(100, 3, 61)).toBe(true);
  });
});

describe('soundscape', () => {
  it('every biome has voices, all quiet', () => {
    for (const b of [...BIOMES, 'driveIn'] as const) { expect(SOUNDSCAPE[b].length).toBeGreaterThan(0); for (const v of SOUNDSCAPE[b]) { expect(v.vol).toBeLessThanOrEqual(1); expect(v.every[0]).toBeLessThanOrEqual(v.every[1]); } }
  });
  const run = (weights: Array<['jungle' | 'desert', number]>, speed: number, ducked = false, seed = 1) => {
    const s = new Soundscape(makeRng(seed)); const out: string[] = [];
    for (let t = 0; t < 600; t += 0.5) for (const sh of s.tick(t, weights, speed, ducked)) out.push(sh.sfx);
    return out;
  };
  it('plays the biome\'s sounds at intervals within range, deterministically', () => {
    const a = run([['jungle', 1]], 1), b = run([['jungle', 1]], 1);
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThan(20);
    expect(new Set(a)).toEqual(new Set(['birdTrill', 'birdWhistle', 'monkeyHoot']));
  });
  it('is silent when stopped or ducked, and crossfades by weight', () => {
    expect(run([['jungle', 1]], 0)).toEqual([]);
    expect(run([['jungle', 1]], 1, true)).toEqual([]);
    const mixed = run([['jungle', 0.5], ['desert', 0.5]], 1), all = run([['jungle', 1]], 1);
    expect(mixed.some((x) => x === 'hawk' || x === 'windGust')).toBe(true);
    expect(mixed.filter((x) => x === 'birdTrill').length).toBeLessThan(all.filter((x) => x === 'birdTrill').length);
  });
  it('speed factor ramps 0..1', () => { expect(speedFactor(0)).toBe(0); expect(speedFactor(3)).toBe(0.5); expect(speedFactor(30)).toBe(1); });
});
