import { describe, expect, it } from 'vitest';
import { fitUnit, glyphTable, hasGlyph, textCells, wrapCells } from '../render/pixelHud';
import { STORY } from '../sim/story';
import { ESCAPE_LINES, FISH, SPOTS } from '../sim/catalogue';
import { BELLY_LAYERS, GATE_LAYERS, PARTS } from '../sim/belly';

describe('the HUD pixel font', () => {
  it('has square glyphs: every row as wide as the first, 7 tall (8–9 with descenders)', () => {
    for (const [ch, g] of glyphTable()) {
      expect([7, 8, 9], ch).toContain(g.rows.length);
      for (const r of g.rows) expect(r.length, ch).toBe(g.w);
    }
  });

  it('draws every line the story says and every name the HUD shows', () => {
    const lines = [
      ...STORY.flatMap((s) => [s.title, ...s.monologue.map((m) => m.text)]),
      ...Object.values(ESCAPE_LINES).flat(), ...Object.values(FISH).map((f) => f.name), ...Object.values(SPOTS).flat().map((s) => s.name),
      ...PARTS.map((p) => `✓ ${p.name}`), ...BELLY_LAYERS.map((l) => l.name), ...GATE_LAYERS.map((l) => l.name),
      '◀ ▶ pick a spot · Ⓐ cast (3)', 'Twitching the lure…', 'Reel slow… spin faster to twitch', 'Ⓐ  STRIKE!', 'PULL!', 'It got away.',
      '2 in the bucket · $12.40', 'Nothing biting.', 'late strike: half price', '0.8 kg · 31 cm', 'Drill. Keep it turning.', 'pedal to begin',
      'Morning', 'Midday', 'Evening', 'Continue: Morning, Highway 1',
    ];
    const missing = new Set<string>();
    for (const l of lines) for (const ch of l) if (!hasGlyph(ch)) missing.add(ch);
    expect([...missing]).toEqual([]);
  });

  it('measures, fits and wraps in whole font pixels', () => {
    expect(textCells('I')).toBe(3);
    expect(textCells('II')).toBe(7); // one pixel between letters
    expect(fitUnit('PULL!', 300, 6)).toBe(6);
    expect(fitUnit('PULL!', 40, 6)).toBe(Math.floor(40 / textCells('PULL!')));
    const lines = wrapCells('It keeps turning left and right and left', 60);
    expect(lines.length).toBeGreaterThan(1);
    for (const l of lines) expect(textCells(l)).toBeLessThanOrEqual(60);
  });
});
