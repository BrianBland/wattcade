import { describe, expect, it } from 'vitest';
import { createGameSession, NullInput, testProfile } from '../../../core';
import { module } from '../index';
import { LENGTH_BAND, ROAD_STYLES, STYLE_FIT, generateLevel, minPads, padsFor, validateLevel } from '../sim/generator';
import { levelGeometry } from '../sim/level';
import { layout, fieldClearsHud } from '../render/layout';
import { cableRoutes } from '../render/cables';
import type { TdSnapshot } from '../sim/types';

const SEEDS = [1, 2, 3];
// each style at a lean, the default and a crowded pad count (clamped to what the style holds)
const PADS = [6, 12, 16];
const levels = ROAD_STYLES.flatMap((style) => SEEDS.map((seed, i) => ({ seed, asked: padsFor(style, PADS[i]), ...generateLevel(seed, { style, pads: PADS[i] }) })));

describe('level generator', () => {
  it('is deterministic: the same seed and style give the same level', () => {
    // a short search keeps this quick on a busy runner; determinism does not depend on the iteration count
    const gen = (seed: number, style?: 'lasso') => generateLevel(seed, { style, iterations: 1500 }).level;
    expect(gen(7, 'lasso')).toEqual(gen(7, 'lasso'));
    expect(gen(7)).toEqual(gen(7));
    expect(gen(7)).not.toEqual(gen(8));
  }, 20000);

  it('pad counts follow the ask, clamped to what each style holds', () => {
    expect(padsFor('zigzag', 6)).toBe(6);
    expect(padsFor('zigzag', 30)).toBe(16);
    expect(padsFor('switchback', 6)).toBe(10);
    expect(padsFor('crossover', 16)).toBe(14);
    expect(minPads(12)).toBe(10);
    expect(minPads(6)).toBe(4);
  });

  for (const { style, seed, asked, level, metrics } of levels) {
    it(`${style} ${seed} (${asked} pads): valid, well covered, HUD-safe in both orientations, cabled`, () => {
      expect(validateLevel(level)).toEqual([]);
      expect(level.roadStyle).toBe(style);
      expect(level.pads.length).toBeGreaterThanOrEqual(minPads(asked));
      expect(level.pads.length).toBeLessThanOrEqual(asked);
      expect(metrics.length).toBeGreaterThanOrEqual(LENGTH_BAND.min);
      expect(metrics.length).toBeLessThanOrEqual(LENGTH_BAND.max);
      // within a little of the style's bar (a seed may settle for its best-covered try)
      const bar = STYLE_FIT[style], ease = asked < 8 ? 0.92 : 1;
      expect(metrics.flame).toBeGreaterThanOrEqual(bar.flame * ease - 0.06);
      expect(metrics.gap).toBeLessThanOrEqual(bar.gap / ease + 4);
      expect(level.bridges?.length ?? 0).toBe(style === 'crossover' ? 2 : style === 'lasso' || style === 'ring' ? 1 : 0);
      for (const [W, H] of [[820, 1180], [1180, 820], [390, 844], [844, 390]]) {
        const L = layout(W, H, { top: 0, bottom: 110, left: 0, right: 0 }, false, level);
        expect(fieldClearsHud(L.field, [{ x: 0, y: H - 110, w: W, h: 110 }], level), `${W}×${H}`).toBe(true);
      }
      expect(cableRoutes(level).map((r) => r.pad)).toEqual(level.pads.map((_, i) => i));
    });
  }

  it('a generated level plays: the sim walks its road and builds on its pads', () => {
    const { level } = levels.find((l) => l.style === 'ring')!, g = levelGeometry(level);
    const s = createGameSession({ game: module, profile: testProfile(), input: new NullInput(), fake: { script: 'sprints' }, seed: 2,
      simOpts: { autopilot: true, level } });
    let walkers = 0;
    for (let i = 0; i < 600 && (s.sim.snapshot() as TdSnapshot).wavesSurvived < 3; i++) {
      s.step(60);
      for (const e of (s.sim.snapshot() as TdSnapshot).enemies) if (!e.flying) { walkers++; expect(g.distanceToRoad(e)).toBeLessThan(level.roadHalfWidth); }
    }
    const end = s.sim.snapshot() as TdSnapshot;
    expect(end.wavesSurvived).toBeGreaterThanOrEqual(3);
    expect(walkers).toBeGreaterThan(100);
    expect(end.towers.every((t) => t.pad < level.pads.length)).toBe(true);
  });
});
