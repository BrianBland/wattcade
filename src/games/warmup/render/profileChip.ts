/**
 * Elevation-chip header layout. The panel is narrow; a long "next biome" string
 * collides with the distance string when both share the alphabetic baseline at y+9.
 * Pure: the renderer supplies measure() and draws the plan.
 */

export const CHIP_W = 230;
export const CHIP_PAD = 8;
/** Minimum gap between the two strings when they share a line. */
export const CHIP_GAP = 8;
/** Alphabetic baseline of the first line, matching the old y0+9 draw. */
export const CHIP_LINE1 = 9;
/** 11px system-ui line box; second baseline sits one box below the first. */
export const CHIP_LINE = 14;
/** One-line panel: 22px header (baseline 9 + descent) then the bars. */
export const CHIP_H = 56;
export const CHIP_HEADER = 22;

export interface ChipLine {
  text: string;
  /** Left edge in CSS px from the panel's left. */
  x: number;
  /** Alphabetic baseline in CSS px from the panel's top. */
  y: number;
  align: 'left' | 'right';
  /** CSS px; set when the string is wider than the panel minus pads. */
  maxWidth?: number;
}

export interface ChipPlan {
  lines: 1 | 2;
  /** Panel height in CSS px. One line keeps 56; two lines grow the header only. */
  height: number;
  left: ChipLine;
  right: ChipLine;
}

export function profileChipPlan(
  left: string,
  right: string,
  width = CHIP_W,
  pad = CHIP_PAD,
  measure: (text: string) => number,
  gap = CHIP_GAP,
): ChipPlan {
  const inner = Math.max(0, width - pad * 2);
  const lw = measure(left), rw = measure(right);
  const clip = (text: string, w: number, x: number, y: number, align: 'left' | 'right'): ChipLine =>
    w > inner ? { text: ellipsis(text, inner, measure), x, y, align, maxWidth: inner } : { text, x, y, align };

  if (lw + gap + rw <= inner) {
    return {
      lines: 1,
      height: CHIP_H,
      left: { text: left, x: pad, y: CHIP_LINE1, align: 'left' },
      right: { text: right, x: width - pad, y: CHIP_LINE1, align: 'right' },
    };
  }
  const y2 = CHIP_LINE1 + CHIP_LINE;
  const height = CHIP_H + (y2 - CHIP_LINE1);
  const rightAlign: 'left' | 'right' = rw <= inner ? 'right' : 'left';
  return {
    lines: 2,
    height,
    left: clip(left, lw, pad, CHIP_LINE1, 'left'),
    right: clip(right, rw, rightAlign === 'right' ? width - pad : pad, y2, rightAlign),
  };
}

/** Shorten until measure(text + ellipsis) fits maxW. Empty if even the ellipsis does not. */
function ellipsis(text: string, maxW: number, measure: (text: string) => number): string {
  const mark = '…';
  if (measure(text) <= maxW) return text;
  if (measure(mark) > maxW) return '';
  let lo = 0, hi = text.length;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (measure(text.slice(0, mid).trimEnd() + mark) <= maxW) lo = mid;
    else hi = mid - 1;
  }
  return (lo > 0 ? text.slice(0, lo).trimEnd() : '') + mark;
}
