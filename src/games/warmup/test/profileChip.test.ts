import { describe, expect, it } from 'vitest';
import { CHIP_GAP, CHIP_PAD, CHIP_W, profileChipPlan, type ChipLine } from '../render/profileChip';

/** Fixed advance, in CSS px per character. The known failing pair uses a real 11px measure instead. */
const advance = (px: number) => (text: string) => text.length * px;

function box(line: ChipLine, measure: (text: string) => number) {
  const w = Math.min(measure(line.text), line.maxWidth ?? Infinity);
  const x = line.align === 'right' ? line.x - w : line.x;
  return { x0: x, x1: x + w, y: line.y };
}

describe('profileChipPlan', () => {
  it('keeps a short pair on one line with the gap left of the right string', () => {
    const left = '0.00 mi · ▲0 ft', right = 'Desert in 800 ft';
    const measure = advance(5.5); // both fit 230 with an 8px gap (15*5.5 + 8 + 16*5.5 = 178.5 < 214)
    const plan = profileChipPlan(left, right, CHIP_W, CHIP_PAD, measure);
    expect(plan.lines).toBe(1);
    expect(plan.height).toBe(56);
    expect(plan.left.y).toBe(plan.right.y);
    const L = box(plan.left, measure), R = box(plan.right, measure);
    expect(L.x1 + CHIP_GAP).toBeLessThanOrEqual(R.x0);
    expect(L.x0).toBeGreaterThanOrEqual(CHIP_PAD);
    expect(R.x1).toBeLessThanOrEqual(CHIP_W - CHIP_PAD);
  });

  it('splits the known overlapping pair onto two baselines', () => {
    // 11px system-ui: "0.00 mi · ▲0 ft" ≈ 92, "Marsh Boardwalk in 3910 ft" ≈ 158, panel 230, pad 8.
    const left = '0.00 mi · ▲0 ft', right = 'Marsh Boardwalk in 3910 ft';
    const widths: Record<string, number> = { [left]: 92, [right]: 158 };
    const measure = (text: string) => widths[text] ?? text.length * 7;
    const plan = profileChipPlan(left, right, 230, 8, measure);
    expect(plan.lines).toBe(2);
    expect(plan.left.y).not.toBe(plan.right.y);
    expect(plan.height).toBeGreaterThan(56);
    const L = box(plan.left, measure), R = box(plan.right, measure);
    expect(L.x1).toBeLessThanOrEqual(230 - 8);
    expect(R.x1).toBeLessThanOrEqual(230 - 8);
    expect(L.x0).toBeGreaterThanOrEqual(8);
    expect(R.x0).toBeGreaterThanOrEqual(8);
  });

  it('never shares a baseline when both strings are long', () => {
    const left = '12.40 mi · ▲1840 ft';
    const rights = ['Marsh Boardwalk in 3910 ft', 'Autumn Woodland in 900 ft', 'Under the Sea in 1200 ft', 'Desert Canyon in 50 ft'];
    const measure = advance(7.4);
    for (const right of rights) {
      const plan = profileChipPlan(left, right, CHIP_W, CHIP_PAD, measure);
      expect(plan.lines).toBe(2);
      expect(plan.left.y).not.toBe(plan.right.y);
      const L = box(plan.left, measure), R = box(plan.right, measure);
      expect(L.x1).toBeLessThanOrEqual(CHIP_W - CHIP_PAD + 0.01);
      expect(R.x1).toBeLessThanOrEqual(CHIP_W - CHIP_PAD + 0.01);
    }
  });

  it('marks a string wider than the panel for clip', () => {
    const left = '0.00 mi · ▲0 ft';
    const right = 'Marsh Boardwalk in 99990 ft and then some more road';
    const measure = advance(8);
    const plan = profileChipPlan(left, right, CHIP_W, CHIP_PAD, measure);
    expect(plan.lines).toBe(2);
    expect(plan.right.maxWidth).toBe(CHIP_W - CHIP_PAD * 2);
    expect(plan.right.text.endsWith('…')).toBe(true);
    expect(measure(plan.right.text)).toBeLessThanOrEqual(CHIP_W - CHIP_PAD * 2);
    expect(plan.right.align).toBe('left');
  });
});
