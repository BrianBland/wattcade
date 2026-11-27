import { describe, expect, it } from 'vitest';
import { receiptRows, unitToFit } from '../render/shop';
import { hasGlyph, pixelChevron, textCells } from '../render/pixelHud';
import { ITEMS } from '../sim/economy';
import { FISH } from '../sim/catalogue';

describe("Lou's counter in pixel type", () => {
  it('draws every shop string in the HUD font', () => {
    const lines = [
      "LOU'S BAIT & TACKLE", 'THE PIER STAND', 'Cash $163.35 · On account $40.00', "LOU'S / RECEIPT", 'No fish on the scale.', 'NET -$12.00',
      '2 LINES · KEEP FOR THE ROAD', '+3 min fishing · try another turnout', 'Back on the road in 115s · rod packed automatically',
      'One more turnout', '+3 min', 'In your bag', 'Try for a little more.', '1 / 5 · ◀ ▶ browse', '◀', '▶', 'Ⓐ Fish', 'Ⓐ Packed', 'Ⓐ Pay later', 'Ⓐ Buy', 'Ⓑ Road',
      'Fresh catch. Fair weight.', 'Have a look around.', 'One more turnout. Take your time.', 'A little short for that.', 'Already in your bag.',
      'Pay me later. Leave the extras here.', 'Good choice. Keep the receipt.', 'That ought to cover it.',
      ...ITEMS.flatMap((i) => [i.name, i.note]), ...Object.values(FISH).map((f) => `${f.name} 2.10 kg (late)`),
    ];
    const missing = new Set<string>();
    for (const l of lines) for (const ch of l) if (!hasGlyph(ch)) missing.add(ch);
    expect([...missing]).toEqual([]);
  });

  it('puts label and amount on one receipt row when they fit, else the amount under the label', () => {
    const lines = [{ label: 'Surf perch 0.65 kg', amount: '+$3.90' }, { label: 'Rockfish 2.10 kg (late)', amount: '+$9.45' }];
    const wide = receiptRows(lines, 300);
    expect(wide).toEqual([{ left: 'Surf perch 0.65 kg', right: '+$3.90' }, { left: 'Rockfish 2.10 kg (late)', right: '+$9.45' }]);
    const narrow = receiptRows(lines, 120);
    for (const r of narrow) expect(textCells(r.left) + (r.left && r.right ? 4 : 0) + textCells(r.right)).toBeLessThanOrEqual(120);
    expect(narrow.filter((r) => r.right).map((r) => r.right)).toEqual(['+$3.90', '+$9.45']);
  });

  it('fits text in whole font pixels, never below 1', () => {
    expect(unitToFit('Surf Rod', 1000, 3)).toBe(3);
    expect(textCells('Surf Rod') * unitToFit('Surf Rod', 100, 3)).toBeLessThanOrEqual(100);
    expect(unitToFit('a very long line that cannot fit', 10, 3)).toBe(1);
  });
});

describe('the wings chevron', () => {
  it('stays inside its bounds and the screen edge it points at', () => {
    const rects: number[][] = [];
    const g = { fillStyle: '', fillRect: (x: number, y: number, w: number, h: number) => rects.push([x, y, w, h]) } as unknown as CanvasRenderingContext2D;
    for (const dir of [1, -1] as const) {
      rects.length = 0;
      const W = 1180, x = dir > 0 ? W - 24 : 24, b = pixelChevron(g, x, 400, 6, 4, dir, '#fff');
      expect(rects.length).toBe(13);
      for (const [rx, ry, rw, rh] of rects) {
        expect(rx).toBeGreaterThanOrEqual(b.x); expect(rx + rw).toBeLessThanOrEqual(b.x + b.w);
        expect(ry).toBeGreaterThanOrEqual(b.y); expect(ry + rh).toBeLessThanOrEqual(b.y + b.h);
        expect(rx).toBeGreaterThanOrEqual(0); expect(rx + rw).toBeLessThanOrEqual(W);
      }
    }
  });
});
