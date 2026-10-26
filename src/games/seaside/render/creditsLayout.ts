// Where each credit line sits at a moment of the roll (pure): the lines rise from the bottom of the space above the
// HUD and the last one ("Thanks for riding.") comes to rest in the middle of it. Nothing is laid out below `UH`.
import type { CreditLine } from '../credits';

export interface PlacedCredit { text: string; kind: CreditLine['kind']; y: number; px: number; alpha: number }

const sizes = (UH: number) => ({
  title: Math.max(26, Math.min(56, UH * 0.07)), head: Math.max(13, Math.min(20, UH * 0.026)),
  body: Math.max(16, Math.min(26, UH * 0.035)), gap: Math.max(16, Math.min(30, UH * 0.04)),
});

/** The credits at `t` seconds of a `durS`-second roll, between `top` and `UH` (the top of the HUD). `y` is each line's
 *  middle; lines are kept a line's height clear of both edges and fade in and out there. */
export function creditsLayout(lines: readonly CreditLine[], UH: number, top: number, t: number, durS: number): PlacedCredit[] {
  const S = sizes(UH), lh = (l: CreditLine) => (l.kind === 'gap' ? S.gap : S[l.kind] * 1.45);
  const total = lines.reduce((a, l) => a + lh(l), 0), lastH = lh(lines[lines.length - 1]);
  const k = Math.max(0, Math.min(1, t / durS)), mid = (top + UH) / 2;
  // the first line starts just under the band's bottom edge; the last ends centred in the band
  const start = UH + S.body, end = mid - (total - lastH / 2);
  let y = start + (end - start) * k;
  const out: PlacedCredit[] = [], edge = S.body * 1.5;
  for (const l of lines) {
    const h = lh(l), c = y + h / 2;
    y += h;
    if (l.kind === 'gap') continue;
    const px = S[l.kind], lo = top + px, hi = UH - px;
    if (c < lo || c > hi) continue;
    out.push({ text: l.text, kind: l.kind, y: c, px, alpha: Math.min(1, (c - lo) / edge, (hi - c) / edge) });
  }
  return out;
}
