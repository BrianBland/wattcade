// Pure layout math for the Watershed renderer (unit-tested): camera framing and HUD boxes above the shell HUD.

export interface Box { x: number; y: number; w: number; h: number }

export interface Layout {
  /** Usable height above the shell HUD. */
  UH: number;
  /** Pixels to shift the camera view down by (three.js setViewOffset y), so the valley centres in UH. */
  viewOffsetY: number;
  /** Screen y the camera target (valley centre) lands on. */
  focusY: number;
  block: Box;     // top-left: block name, hint, time left
  stats: Box;     // top-right: gorge / delta
  plan: Box;      // top-centre: the ride timeline
  meter: Box;     // water-style meter (heavy ↔ light) under the block card
  popup: Box;     // centred instruction popup (one or two lines)
}

export function layout(W: number, H: number, insetB: number): Layout {
  const b = Math.max(0, Math.min(insetB, H / 2));
  const UH = Math.max(120, H - b);
  const pad = 12, colW = Math.min(W - 2 * pad, 290);
  // left column: block card, then the ride timeline, then the water meter; stats top-right. The top-centre stays
  // clear: in the up-valley view that's where the spring and the head of the valley are.
  const block: Box = { x: pad, y: pad, w: colW, h: 96 };
  const plan: Box = { x: pad, y: block.y + block.h + 6, w: colW, h: 34 };
  const meter: Box = { x: pad, y: plan.y + plan.h + 6, w: colW, h: 44 };
  const narrow = W < 700;
  const stats: Box = narrow ? { x: pad, y: meter.y + meter.h + 6, w: colW, h: 70 } : { x: W - pad - 210, y: pad, w: 210, h: 96 };
  const pw = Math.min(W - 2 * pad, 600), ph = 92;
  const below = narrow ? stats.y + stats.h + 12 : pad;
  const popup: Box = { x: (W - pw) / 2, y: Math.min(Math.max(below, UH * 0.3), UH - ph - pad), w: pw, h: ph };
  return { UH, viewOffsetY: b / 2, focusY: UH / 2, block, stats, plan, meter, popup };
}
