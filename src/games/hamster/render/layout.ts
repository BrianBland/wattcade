import type { Box } from './scenes';

/**
 * Scene / panel boxes for a canvas of W x H CSS px whose bottom `insetB` px sit under the shell HUD.
 * Everything foreground is laid out in the usable height UH = H - insetB; the renderer stretches the last
 * rows down over the HUD band so backgrounds stay full-bleed.
 */
export function layout(W: number, H: number, insetB: number): { scene: Box; panel: Box; wide: boolean; UH: number } {
  const UH = Math.max(120, H - Math.max(0, insetB));
  const wide = W / H > 1.05;
  const pw = wide ? Math.max(310, Math.min(470, W * 0.38)) : W, ph = wide ? UH : UH * 0.46;
  const scene: Box = wide ? { x: 0, y: 0, w: W - pw, h: UH } : { x: 0, y: 0, w: W, h: UH - ph };
  const panel: Box = wide ? { x: W - pw, y: 0, w: pw, h: UH } : { x: 0, y: UH - ph, w: W, h: ph };
  return { scene, panel, wide, UH };
}
