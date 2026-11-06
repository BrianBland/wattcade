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

/**
 * The rain cloud's altitude (world units) over grid cell (x, y). It clears the HIGHEST ground anywhere under its
 * footprint, not just the cell under its centre: when the rain carves a gorge beneath it, the cloud must not sink
 * into its own gorge (and below the ridges around it), or the raindrops would start underground. The clearance grows
 * with the cloud so its drawn underside (≈ 0.55 · radius below centre) stays above the terrain.
 */
export function cloudAltitude(heightAt: (x: number, y: number) => number, x: number, y: number, radius: number, sea: number): number {
  let top = Math.max(sea, heightAt(x, y));
  const R = Math.max(2, radius);
  for (let r = R / 2; r <= R + 1e-6; r += R / 2) {
    const n = Math.max(8, Math.ceil(r * 1.5));
    for (let k = 0; k < n; k++) { const a = (k / n) * Math.PI * 2; top = Math.max(top, heightAt(x + Math.cos(a) * r, y + Math.sin(a) * r)); }
  }
  return top + Math.max(9 + radius * 0.35, 3 + radius * 0.65);
}
