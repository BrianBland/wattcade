// Screen layout for Dynamo Defense (CSS px). Pure, unit-tested: nothing foreground may land below UH = H - insetB.
export interface Box { x: number; y: number; w: number; h: number }
export interface TdLayout {
  /** usable height above the shell HUD */ UH: number;
  wide: boolean;
  /** the 100 x 100 play field: screen x = field.x + fx * field.s / 100 */
  field: { x: number; y: number; s: number };
  left: Box; right: Box;
  /** workshop panel (wide: replaces the right panel's lower half; narrow: over the top of the field) */
  workshop: Box;
  banner: { x: number; y: number; w: number };
  garage: Box;
  /** UI scale (1 = designed for a ~768 px tall surface) */ u: number;
}

export function layout(W: number, H: number, insetB: number): TdLayout {
  const UH = Math.max(220, H - Math.max(0, insetB));
  const u = Math.max(0.7, Math.min(1.5, Math.min(W, UH) / 640));
  const pad = Math.round(10 * u);
  const wide = W / UH >= 1.3;
  let field: TdLayout['field'], left: Box, right: Box, workshop: Box;
  if (wide) {
    const P = Math.round(Math.max(180, Math.min(300, W * 0.21)));
    const s = Math.max(100, Math.min(UH - 2 * pad, W - 2 * P - 4 * pad));
    field = { x: Math.round((W - s) / 2), y: Math.round(UH - pad - s), s };
    left = { x: pad, y: pad, w: P, h: UH - 2 * pad };
    right = { x: W - pad - P, y: pad, w: P, h: UH - 2 * pad };
    const wh = Math.round(Math.min(right.h * 0.62, 330 * u));
    workshop = { x: right.x, y: right.y + right.h - wh, w: P, h: wh };
  } else {
    const TB = Math.round(Math.max(96, Math.min(140, UH * 0.17)));
    left = { x: pad, y: pad, w: Math.round((W - 3 * pad) / 2), h: TB };
    right = { x: left.x + left.w + pad, y: pad, w: W - 3 * pad - left.w, h: TB };
    const top = pad + TB + pad;
    const s = Math.max(100, Math.min(W - 2 * pad, UH - top - pad));
    field = { x: Math.round((W - s) / 2), y: Math.round(top + (UH - top - pad - s) / 2), s };
    const ww = Math.min(W - 2 * pad, 420 * u), wh = Math.round(Math.min(s * 0.55, 260 * u));
    workshop = { x: Math.round((W - ww) / 2), y: field.y + pad, w: Math.round(ww), h: wh };
  }
  const gw = Math.min(W - 2 * pad, 620 * u), gh = UH - 2 * pad;
  return {
    UH, wide, field, left, right, workshop, u,
    banner: { x: field.x + field.s / 2, y: field.y + field.s * 0.3, w: field.s },
    garage: { x: Math.round((W - gw) / 2), y: pad, w: Math.round(gw), h: gh },
  };
}
