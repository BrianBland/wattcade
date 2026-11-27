import { describe, expect, it } from 'vitest';
import { campLayout } from '../render/campUi';
import { BIOME_BANNER_DUR_S, biomeBannerAlpha, biomeBannerSpec } from '../render/biomeBanner';

describe('Camp Archetype showcase layout (inset-safe)', () => {
  const cases: Array<[string, number, number, number, number]> = [
    ['phone 390x844', 390, 844, 100, 1],
    ['desktop 1280x800', 1280, 800, 100, 1],
    ['ipad 2048x1536@2x', 2048, 1536, 200, 2],
  ];

  for (const [label, W, H, inset, dpr] of cases) {
    it(`${label} keeps archetype cards, upgrades, and footer strictly inside viewport above HUD inset`, () => {
      const u = (Math.max(1, Math.min(W, H) / dpr / 600) * 0.75 + 0.25) * dpr;
      const UH = H - inset;
      for (const hasResult of [false, true]) {
        const L = campLayout(W, H, inset, u, hasResult);
        expect(L.archCards.length).toBe(3);
        for (const card of L.archCards) {
          expect(card.x).toBeGreaterThanOrEqual(0);
          expect(card.x + card.w).toBeLessThanOrEqual(W + 1);
          expect(card.y).toBeGreaterThanOrEqual(0);
          expect(card.y + card.h).toBeLessThanOrEqual(UH + 1);
        }
        expect(L.rowsArea.x).toBeGreaterThanOrEqual(0);
        expect(L.rowsArea.x + L.rowsArea.w).toBeLessThanOrEqual(W + 1);
        expect(L.hintY).toBeLessThanOrEqual(UH);
      }
    });
  }
});

describe('Biome Arrival Title Card (pure)', () => {
  it('builds stage titles and distinct accents for every Purgatour zone and the Final Stage', () => {
    const keep = biomeBannerSpec(1, 7, 'The Keep', 'Cat 4', false);
    expect(keep.title).toBe('STAGE 1/7 · THE KEEP');
    expect(keep.subtitle).toContain('Cat 4');

    const cata = biomeBannerSpec(3, 7, 'The Catacombs', 'Cat 3', false);
    expect(cata.title).toBe('STAGE 3/7 · THE CATACOMBS');
    expect(cata.color).not.toBe(keep.color);

    const final = biomeBannerSpec(7, 7, 'The Broom Wagon', 'World Tour', true);
    expect(final.title).toBe('FINAL STAGE · THE BROOM WAGON');
    expect(final.subtitle).toContain('Grim Sweeper');
  });

  it('fades in smoothly, holds at full opacity, and dissolves cleanly', () => {
    expect(biomeBannerAlpha(-0.1)).toBe(0);
    expect(biomeBannerAlpha(0.16)).toBeGreaterThan(0.4);
    expect(biomeBannerAlpha(0.16)).toBeLessThan(0.6);
    expect(biomeBannerAlpha(1.0)).toBe(1);
    expect(biomeBannerAlpha(BIOME_BANNER_DUR_S - 0.2)).toBeLessThan(0.4);
    expect(biomeBannerAlpha(BIOME_BANNER_DUR_S + 0.1)).toBe(0);
  });
});
