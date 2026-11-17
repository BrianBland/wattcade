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
  /** Wide screen: the HUD cards sit in one strip along the top and the overview turns sideways (camFit). */
  wide: boolean;
  /** NDC band (of the un-offset camera, −1 bottom … 1 top) the overview valley must fit in: below the top strip, above the shell HUD. */
  band: { yLo: number; yHi: number };
  /** The "reset view" chip shown while the player has moved the camera: right edge, under the stats card. */
  camChip: Box;
  /** Landmark buttons (fly the camera to a mill, the village, the dam): bottom-right, above the shell HUD. */
  look: Box;
}

export function layout(W: number, H: number, insetB: number): Layout {
  const b = Math.max(0, Math.min(insetB, H / 2));
  const UH = Math.max(120, H - b);
  const pad = 12, colW = Math.min(W - 2 * pad, 290);
  // Wide (landscape iPad): block · timeline/meter · stats in one strip across the top, so the sideways overview gets
  // the whole width below it. Otherwise a left column (block card, ride timeline, water meter) with stats top-right;
  // the top-centre stays clear: in the upright view that's where the spring and the head of the valley are.
  const wide = W >= 860 && W / UH >= 1.2;
  const block: Box = { x: pad, y: pad, w: colW, h: 96 };
  const plan: Box = wide ? { x: block.x + block.w + 8, y: pad, w: colW, h: 34 } : { x: pad, y: block.y + block.h + 6, w: colW, h: 34 };
  const meter: Box = { x: plan.x, y: plan.y + plan.h + 6, w: colW, h: 44 };
  const narrow = W < 700;
  const stats: Box = narrow ? { x: pad, y: meter.y + meter.h + 6, w: colW, h: 70 } : { x: W - pad - 210, y: pad, w: 210, h: 96 };
  const pw = Math.min(W - 2 * pad, 600), ph = 92;
  const below = narrow ? stats.y + stats.h + 12 : wide ? block.y + block.h + 12 : pad;
  const popup: Box = { x: (W - pw) / 2, y: Math.min(Math.max(below, UH * 0.3), UH - ph - pad), w: pw, h: ph };
  const camChip: Box = { x: W - pad - 120, y: Math.max(pad, Math.min(UH - 40 - pad, stats.y + stats.h + 8)), w: 120, h: 40 };
  const lookH = 5 * 34 + 2 * 6;
  const look: Box = { x: W - pad - 132, y: Math.max(camChip.y + camChip.h + 8, UH - pad - lookH), w: 132, h: lookH };
  // the overview's band: below the top strip when wide; otherwise up to the top (the column only covers sky/peaks)
  const off = b / 2, top = wide ? block.y + block.h + 4 : 0;
  const ndc = (row: number) => 1 - (2 * (row + off)) / H;
  return { UH, viewOffsetY: off, focusY: UH / 2, block, stats, plan, meter, popup, wide, band: { yLo: ndc(UH - 4), yHi: ndc(top) }, camChip, look };
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
