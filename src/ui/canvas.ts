/** Canvas 2D adapter. Draw in CSS-pixel coordinates; no DOM, Preact or game imports. */
import { UI, clamp01 } from './tokens';
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface WidgetState {
  focused?: boolean;
  selected?: boolean;
  pressed?: boolean;
  disabled?: boolean;
}
export const hitTest = (r: Rect, x: number, y: number, disabled = false) => !disabled && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
export function aboveHud(width: number, height: number, insets: {
  top: number;
  right: number;
  bottom: number;
  left: number;
}): Rect {
  return {
    x: insets.left,
    y: insets.top,
    w: Math.max(0, width - insets.left - insets.right),
    h: Math.max(0, height - insets.top - insets.bottom)
  };
}
/** Visual fill geometry is shared with tests and supports non-finite loading data. */
export function progressRect(r: Rect, value: number): Rect {
  return {
    ...r,
    w: Math.max(0, r.w) * clamp01(value)
  };
}
function text(g: CanvasRenderingContext2D, value: string, x: number, y: number, size: number, color: string, maxWidth: number, weight = 650) {
  if (maxWidth <= 0) return;
  g.font = `${weight} ${size}px ${UI.font.family}`;
  g.fillStyle = color;
  g.textAlign = 'left';
  g.textBaseline = 'middle';
  const ellipsis = '…';
  if (g.measureText(ellipsis).width > maxWidth) return;
  let result = value;
  if (g.measureText(result).width > maxWidth) {
    while (result.length && g.measureText(result + ellipsis).width > maxWidth) result = result.slice(0, -1);
    result += ellipsis;
  }
  g.fillText(result, x, y);
}
function focus(g: CanvasRenderingContext2D, r: Rect) {
  g.strokeStyle = UI.color.focus;
  g.lineWidth = UI.size.focus;
  g.strokeRect(r.x - 3, r.y - 3, r.w + 6, r.h + 6);
}
export function drawPanel(g: CanvasRenderingContext2D, r: Rect) {
  g.save();
  g.fillStyle = UI.color.surface;
  g.fillRect(r.x, r.y, r.w, r.h);
  g.restore();
}
export function drawButton(g: CanvasRenderingContext2D, r: Rect, label: string, state: WidgetState & {
  primary?: boolean;
} = {}) {
  g.save();
  g.globalAlpha = state.disabled ? .45 : 1;
  const depth = state.primary ? UI.size.buttonDepth : 0;
  const offset = state.pressed && !state.disabled ? depth : 0;
  if (state.primary && !offset) {
    g.fillStyle = UI.color.accentEdge;
    g.fillRect(r.x + depth, r.y + depth, r.w, r.h);
  }
  g.fillStyle = state.primary ? UI.color.accent : state.pressed ? UI.color.raised : UI.color.surface;
  g.fillRect(r.x + offset, r.y + offset, r.w, r.h);
  if (state.selected) {
    g.fillStyle = UI.color.accent;
    g.fillRect(r.x, r.y, 4, r.h);
  }
  text(g, label, r.x + 12 + offset, r.y + r.h / 2 + offset, UI.font.body, state.primary ? UI.color.onAccent : UI.color.text, Math.max(0, r.w - 24), state.primary ? 800 : 650);
  if (state.focused && !state.disabled) focus(g, r);
  g.restore();
}
export function drawProgress(g: CanvasRenderingContext2D, r: Rect, value: number, tone: 'accent' | 'gold' = 'accent') {
  g.save();
  g.fillStyle = UI.color.line;
  g.fillRect(r.x, r.y, r.w, r.h);
  const f = progressRect(r, value);
  g.fillStyle = UI.color[tone];
  g.fillRect(f.x, f.y, f.w, f.h);
  g.fillStyle = UI.color.background;
  for (let x = UI.size.progressStep - UI.size.progressGap; x < f.w; x += UI.size.progressStep) {
    g.fillRect(f.x + x, f.y, Math.min(UI.size.progressGap, f.w - x), f.h);
  }
  g.restore();
}
export function drawReadout(g: CanvasRenderingContext2D, r: Rect, label: string, value: string) {
  g.save();
  text(g, label, r.x, r.y + 8, UI.font.small, UI.color.muted, r.w, 500);
  text(g, value, r.x, r.y + 35, 24, UI.color.text, r.w, 750);
  g.restore();
}
export function drawListRow(g: CanvasRenderingContext2D, r: Rect, label: string, value: string, state: WidgetState = {}) {
  g.save();
  if (state.selected || state.pressed) {
    g.fillStyle = UI.color.raised;
    g.fillRect(r.x, r.y, r.w, r.h);
  }
  if (state.selected) {
    g.fillStyle = UI.color.accent;
    g.fillRect(r.x, r.y, 4, r.h);
  }
  g.globalAlpha = state.disabled ? .45 : 1;
  g.font = `650 ${UI.font.small}px ${UI.font.family}`;
  const right = Math.min(r.w * .4, g.measureText(value).width + 24);
  text(g, label, r.x + 12, r.y + r.h / 2, UI.font.body, UI.color.text, Math.max(0, r.w - right - 24));
  text(g, value, r.x + r.w - right, r.y + r.h / 2, UI.font.small, UI.color.muted, Math.max(0, right - 12));
  g.fillStyle = UI.color.line;
  g.fillRect(r.x, r.y + r.h - 1, r.w, 1);
  if (state.focused && !state.disabled) focus(g, r);
  g.restore();
}
export function drawTab(g: CanvasRenderingContext2D, r: Rect, label: string, state: WidgetState = {}) {
  g.save();
  g.globalAlpha = state.disabled ? .45 : 1;
  text(g, label, r.x + 12, r.y + r.h / 2, UI.font.small, state.selected ? UI.color.accent : UI.color.muted, Math.max(0, r.w - 24));
  if (state.selected) {
    g.fillStyle = UI.color.accent;
    g.fillRect(r.x, r.y + r.h - 2, r.w, 2);
  }
  if (state.focused && !state.disabled) focus(g, r);
  g.restore();
}
/** Caller decides when to show it (focus, hover, or tap), and keeps it inside aboveHud(). */
export function drawTooltip(g: CanvasRenderingContext2D, r: Rect, label: string) {
  drawPanel(g, r);
  g.save();
  text(g, label, r.x + 12, r.y + r.h / 2, UI.font.small, UI.color.text, Math.max(0, r.w - 24), 500);
  g.restore();
}
