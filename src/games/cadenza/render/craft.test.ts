import { describe, expect, it } from 'vitest';
import { CRAFT_KINDS, craftGeometry, SCALE } from './craft';
import { LW } from './path';

describe('craftGeometry', () => {
  for (const kind of CRAFT_KINDS) {
    it(`${kind}: narrower than one lane, fins and trail tips included`, () => {
      const g = craftGeometry(kind);
      g.hull.computeBoundingBox();
      const b = g.hull.boundingBox!;
      expect((b.max.x - b.min.x) * SCALE).toBeLessThan(LW * 0.75);
      expect(g.tipX * SCALE * 2).toBeLessThan(LW * 0.75);
    });
    it(`${kind}: every engine's nozzle lip faces the chase camera at the tail`, () => {
      const g = craftGeometry(kind);
      expect(g.engines.length).toBeGreaterThanOrEqual(2);
      for (const [, , r, z] of g.engines) { expect(r).toBeGreaterThan(0.08); expect(z).toBeGreaterThan(1); }
    });
  }
});
