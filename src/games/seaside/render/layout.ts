// Foreground boxes for the placeholder renderer. Everything sits in the usable height above the shell HUD.
import type { HudOcclusion, Insets } from '../../../contracts';

export interface Box { x: number; y: number; w: number; h: number }
export interface SeasideLayout {
  /** Usable height (H − insets.bottom). */
  UH: number;
  /** Monologue bubble, top-left (storyboard). */
  bubble: Box;
  /** Scene title plate and progress bar. */
  plate: Box;
  /** Centred chapter card. */
  card: Box;
  /** Chapter-select menu rows. */
  menu: Box[];
  /** The placeholder scene box (grey). */
  stage: Box;
}

export function layout(W: number, H: number, insets: Insets, menuItems = 0): SeasideLayout {
  const top = Math.max(0, insets.top), left = Math.max(0, insets.left), right = Math.max(0, insets.right);
  const UH = Math.max(160, H - Math.max(0, insets.bottom));
  const pad = Math.max(12, Math.min(W, UH) * 0.03);
  const bw = Math.min(W - left - right - 2 * pad, Math.max(220, W * 0.42));
  const bh = Math.max(40, Math.min(72, UH * 0.09));
  const bubble = { x: left + pad, y: top + pad, w: bw, h: bh };
  const ph = Math.max(36, Math.min(56, UH * 0.07));
  const plate = { x: left + pad, y: UH - pad - ph, w: W - left - right - 2 * pad, h: ph };
  const cw = Math.min(W * 0.6, 520), ch = Math.min(UH * 0.22, 140);
  const card = { x: (W - cw) / 2, y: (UH - ch) / 2, w: cw, h: ch };
  const stageTop = bubble.y + bh + pad, stageBot = plate.y - pad;
  const stage = { x: left + pad * 2, y: stageTop, w: W - left - right - pad * 4, h: Math.max(0, stageBot - stageTop) };
  const rh = Math.max(44, Math.min(64, UH * 0.08)), rw = Math.min(W * 0.7, 560), gap = rh * 0.25;
  const total = menuItems * rh + Math.max(0, menuItems - 1) * gap;
  const y0 = Math.max(top + pad, (UH - total) / 2);
  const menu = Array.from({ length: menuItems }, (_, i) => ({ x: (W - rw) / 2, y: y0 + i * (rh + gap), w: rw, h: rh }));
  return { UH, bubble, plate, card, menu, stage };
}

export const inside = (b: Box, x: number, y: number) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;
export const overlaps = (a: Box, b: HudOcclusion) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
