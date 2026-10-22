import { describe, expect, it } from 'vitest';
import { GLYPHS, fitPixelText, pixelTextWidth, textLayout } from '../render/font';

describe('dungeon bitmap typography', () => {
  it('covers mixed-case loot, numeric stats and HUD symbols without system fallback', () => {
    const chars = Array.from({ length: 95 }, (_, i) => String.fromCharCode(32 + i)).join('') + '☠✓●◀▶·×–—…★⏱’“”';
    for (const char of chars) {
      expect(GLYPHS[char], char).toBeDefined();
      const rows = GLYPHS[char].split('/');
      expect(rows.length, char).toBeLessThanOrEqual(9);
      expect(rows.every(row => row.length === rows[0].length && /^[01]+$/.test(row)), char).toBe(true);
    }
    expect(GLYPHS.a).not.toBe(GLYPHS.A);
    expect(new Set('0123456789'.split('').map(char => pixelTextWidth(char))).size).toBe(1);
    for (const char of 'gjpqy') expect(GLYPHS[char].split('/').slice(7).join('')).toContain('1');
  });

  it('fits long item names and prompts at every width without squashing glyphs or crossing the available edge', () => {
    for (const label of ['Ancient Scattergun of Thunder', '☠ Blood Debt: enemies hit harder · 32s', 'EXPOSED ×2 — Sprint and Strike!']) {
      for (const scale of [1, 2, 3, 4]) for (let width = 0; width <= 440; width++) {
        const fitted = fitPixelText(label, scale, width);
        expect(pixelTextWidth(fitted, scale)).toBeLessThanOrEqual(width);
        if (pixelTextWidth(label, scale) <= width) expect(fitted).toBe(label);
        else if (fitted) expect(fitted.endsWith('…')).toBe(true);
      }
    }
    expect(fitPixelText('A', 1, pixelTextWidth('A'))).toBe('A');
  });

  it('snaps aligned labels to display pixels and keeps their cap height above the baseline at each DPR', () => {
    for (const dpr of [1, 1.25, 1.5, 2]) {
      for (const align of ['left', 'center', 'right'] as const) {
        const x = 195 * dpr, y = 80 * dpr;
        const line = textLayout('Lv12 · steel ✓', 10 * dpr, x, y, align, 'alphabetic', 140 * dpr);
        expect(Number.isInteger(line.scale)).toBe(true);
        expect(Number.isInteger(line.x)).toBe(true);
        expect(Number.isInteger(line.y)).toBe(true);
        expect(line.width).toBeLessThanOrEqual(140 * dpr);
        expect(Math.abs(line.y + 7 * line.scale - y)).toBeLessThanOrEqual(0.5);
        const anchor = align === 'left' ? line.x : align === 'right' ? line.x + line.width : line.x + line.width / 2;
        expect(Math.abs(anchor - x)).toBeLessThanOrEqual(0.5);
      }
    }
  });
});
