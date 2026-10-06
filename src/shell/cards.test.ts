import { describe, expect, it } from 'vitest';
import { games } from '../games/registry';

/** A 2D context that accepts every call and property (enough to run the card art in Node). */
function stubCtx(): CanvasRenderingContext2D {
  const grad = { addColorStop() {} };
  const target: Record<string, unknown> = { createLinearGradient: () => grad, createRadialGradient: () => grad, measureText: () => ({ width: 10 }) };
  return new Proxy(target, { get: (o, k: string) => (k in o ? o[k] : () => {}), set: (o, k: string, v) => { o[k] = v; return true; } }) as unknown as CanvasRenderingContext2D;
}

const SAVES: Record<string, unknown> = {
  dungeon: { bestFloor: 7, bank: 1234, runs: 12 },
  lighthouse: { buildings: ['cottage', null, 'pier'], shipsDockedTotal: 40, stormsWeatheredTotal: 2 },
  towerdefense: { bestWave: 9 },
  starfighter: { best: 12345.6 },
  hamster: { life: 5e6, rebirths: 2 },
  watershed: { rides: 3, bestCarved: 1400, bestDelta: 900 },
  cadenza: { plays: 2, bestScore: 123456 },
};

describe('arcade card hooks', () => {
  for (const g of games) {
    it(`${g.id}: progress line and art`, () => {
      expect(g.progressLine?.(undefined) ?? null).toBeNull();
      const line = g.progressLine?.(SAVES[g.id]);
      expect(typeof line).toBe('string');
      expect((line as string).length).toBeGreaterThan(3);
      const ctx = stubCtx();
      for (const t of [0, 1.3, 47.9]) expect(() => g.drawCard?.(ctx, 460, 200, t, '#ff2bd6')).not.toThrow();
    });
  }
  it('formats the specific lines', () => {
    const by = Object.fromEntries(games.map((g) => [g.id, g.progressLine?.(SAVES[g.id])]));
    expect(by.dungeon).toContain('Best floor 7');
    expect(by.towerdefense).toBe('Best: wave 9');
    expect(by.lighthouse).toBe('2 buildings · 40 ships home · 2 storms');
  });
});
