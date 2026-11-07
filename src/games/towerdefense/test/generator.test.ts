import { describe, expect, it } from 'vitest';
import { createGameSession, NullInput, testProfile } from '../../../core';
import { module } from '../index';
import { LENGTH_BAND, MIN_PADS, ROAD_STYLES, generateLevel, validateLevel } from '../sim/generator';
import { levelGeometry } from '../sim/level';
import { layout, fieldClearsHud } from '../render/layout';
import { cableRoutes } from '../render/cables';
import type { TdSnapshot } from '../sim/types';

const SEEDS = [1, 2, 3];
const levels = ROAD_STYLES.flatMap((style) => SEEDS.map((seed) => ({ seed, ...generateLevel(seed, { style }) })));

describe('level generator', () => {
  it('is deterministic: the same seed and style give the same level', () => {
    expect(generateLevel(7, { style: 'lasso' }).level).toEqual(generateLevel(7, { style: 'lasso' }).level);
    expect(generateLevel(7).level).toEqual(generateLevel(7).level);
    expect(generateLevel(7).level).not.toEqual(generateLevel(8).level);
  });

  for (const { style, seed, level, metrics } of levels) {
    it(`${style} ${seed}: valid, well covered, HUD-safe in both orientations, cabled`, () => {
      expect(validateLevel(level)).toEqual([]);
      expect(level.roadStyle).toBe(style);
      expect(level.pads.length).toBeGreaterThanOrEqual(MIN_PADS);
      expect(metrics.length).toBeGreaterThanOrEqual(LENGTH_BAND.min);
      expect(metrics.length).toBeLessThanOrEqual(LENGTH_BAND.max);
      expect(metrics.flame).toBeGreaterThanOrEqual(0.85);
      expect(metrics.gap).toBeLessThanOrEqual(25);
      expect(level.bridges?.length ?? 0).toBe(style === 'lasso' || style === 'ring' ? 1 : 0);
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
