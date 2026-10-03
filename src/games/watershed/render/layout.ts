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
  const pad = 12, narrow = W < 700;
  const block: Box = { x: pad, y: pad, w: narrow ? Math.min(W - 2 * pad, 300) : 300, h: 96 };
  const stats: Box = narrow ? { x: pad, y: block.y + block.h + 8, w: Math.min(W - 2 * pad, 300), h: 64 } : { x: W - pad - 220, y: pad, w: 220, h: 96 };
  const meter: Box = { x: pad, y: (narrow ? stats.y + stats.h : block.y + block.h) + 8, w: Math.min(W - 2 * pad, 300), h: 44 };
  const planX = narrow ? pad : block.x + block.w + pad, planW = narrow ? W - 2 * pad : Math.max(120, stats.x - pad - planX);
  const plan: Box = { x: planX, y: narrow ? meter.y + meter.h + 8 : pad, w: planW, h: 34 };
  const pw = Math.min(W - 2 * pad, 620), ph = 92;
  const below = Math.max(meter.y + meter.h, plan.y + plan.h) + 12;
  const popup: Box = { x: (W - pw) / 2, y: Math.min(Math.max(below, UH * 0.24), UH - ph - pad), w: pw, h: ph };
  return { UH, viewOffsetY: b / 2, focusY: UH / 2, block, stats, plan, meter, popup };
}
