import type { Insets } from '../../../contracts';
export interface Box { x: number; y: number; w: number; h: number }
/**
 * The 3D scene draws full-bleed; `field` is where the camera frames the play area (ship and formations), between the
 * floating top HUD and the bottom row, all above the shell HUD inset.
 */
export function layout(w: number, h: number, insets: Insets) {
  const safe = { x: insets.left, y: insets.top, w: Math.max(0, w - insets.left - insets.right), h: Math.max(0, h - insets.top - insets.bottom) };
  const header = Math.min(safe.h * 0.22, safe.w < 600 ? 96 : 84);
  const footer = Math.min(safe.h * 0.16, 70);
  return { safe, field: { x: safe.x, y: safe.y + header, w: safe.w, h: Math.max(0, safe.h - header - footer) }, header, footer };
}
