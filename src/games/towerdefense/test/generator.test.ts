import { describe, expect, it } from 'vitest';
import { createGameSession, NullInput, testProfile } from '../../../core';
import { module } from '../index';
import { ROAD_STYLES, STYLE_FIT, generateLevel, lengthBand, minPads, padsFor, validateLevel } from '../sim/generator';
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
      expect(metrics.length).toBeGreaterThanOrEqual(lengthBand(style).min);
      expect(metrics.length).toBeLessThanOrEqual(lengthBand(style).max);
      expect(metrics.lanes).toBe(style === 'fork' || style === 'merge' ? 2 : 1);
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

  for (const style of ['fork', 'merge'] as const) it(`a ${style}'s routes share the road where they should, and walkers take both`, () => {
    const { level } = levels.find((l) => l.style === style)!, g = levelGeometry(level), [a, b] = g.lanes;
    expect(g.lanes.length).toBe(2);
    // a fork shares its start, a merge its end
    const near = (p: { x: number; y: number }, q: { x: number; y: number }) => Math.hypot(p.x - q.x, p.y - q.y) < 0.5;
    if (style === 'fork') { expect(near(a.at(10), b.at(10))).toBe(true); expect(near(a.at(a.length / 2), b.at(b.length / 2))).toBe(false); }
    else { expect(near(a.at(a.length - 20), b.at(b.length - 20))).toBe(true); expect(near(a.at(0), b.at(0))).toBe(false); }
    const s = createGameSession({ game: module, profile: testProfile(), input: new NullInput(), fake: { script: 'sprints' }, seed: 2,
      simOpts: { autopilot: true, level } });
    const seen = new Set<number>();
    for (let i = 0; i < 300 && (s.sim.snapshot() as TdSnapshot).wavesSurvived < 2; i++) {
      s.step(60);
      for (const e of (s.sim.snapshot() as TdSnapshot).enemies) if (!e.flying) {
        seen.add(e.lane ?? 0);
        expect(g.lanes[e.lane ?? 0].length).toBeGreaterThan(0);
        expect(g.distanceToRoad(e)).toBeLessThan(level.roadHalfWidth);
      }
    }
    expect([...seen].sort()).toEqual([0, 1]);
    expect((s.sim.snapshot() as TdSnapshot).wavesSurvived).toBeGreaterThanOrEqual(2);
  });

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
