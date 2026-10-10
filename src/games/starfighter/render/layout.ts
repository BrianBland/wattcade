import type { Insets } from '../../../contracts';
export interface Box { x: number; y: number; w: number; h: number }
export function layout(w: number, h: number, insets: Insets) {
  const safe = { x: insets.left, y: insets.top, w: Math.max(0, w - insets.left - insets.right), h: Math.max(0, h - insets.top - insets.bottom) };
  const header = Math.min(safe.h * 0.28, safe.w < 600 ? 132 : 104);
  const footer = Math.min(safe.h * 0.15, 56);
  return { safe, field: { x: safe.x, y: safe.y + header, w: safe.w, h: Math.max(0, safe.h - header - footer) }, header, footer };
}
