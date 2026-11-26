import { fillText, pixelFont } from './font';

// Stepped game frames and meters live at display resolution so small text remains sharp.
/** Mix two #rrggbb colours (alpha suffixes ignored). */
export function mixHex(a: string, b: string, k: number): string {
  const p = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const x = p(a), y = p(b);
  return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * k).toString(16).padStart(2, '0')).join('');
}
/** A bevelled pixel frame: dark outline with clipped corners, a coloured rim lit top-left and shaded
 *  bottom-right, then the fill with a soft inner bevel. Everything stays inside (x, y, w, h). */
export function pixelPanel(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, border = '#80718f', fill = '#171320ee', unit = 2) {
  const q = Math.max(1, Math.round(unit));
  x = Math.round(x); y = Math.round(y); w = Math.max(4 * q, Math.round(w)); h = Math.max(4 * q, Math.round(h));
  const lit = mixHex(border, '#ffffff', 0.35), dim = mixHex(border, '#000000', 0.45);
  g.fillStyle = '#0b0910';
  g.fillRect(x + q, y, w - 2 * q, h); g.fillRect(x, y + q, w, h - 2 * q);
  g.fillStyle = border; g.fillRect(x + q, y + q, w - 2 * q, h - 2 * q);
  g.fillStyle = lit; g.fillRect(x + 2 * q, y + q, w - 4 * q, q); g.fillRect(x + q, y + 2 * q, q, h - 4 * q);
  g.fillStyle = dim; g.fillRect(x + 2 * q, y + h - 2 * q, w - 4 * q, q); g.fillRect(x + w - 2 * q, y + 2 * q, q, h - 4 * q);
  g.fillStyle = '#0b0910'; g.fillRect(x + 2 * q, y + 2 * q, w - 4 * q, h - 4 * q);   // keep the fill's alpha over a solid base
  g.fillStyle = fill; g.fillRect(x + 2 * q, y + 2 * q, w - 4 * q, h - 4 * q);
  g.fillStyle = '#ffffff12'; g.fillRect(x + 2 * q, y + 2 * q, w - 4 * q, q);
  g.fillStyle = '#00000038'; g.fillRect(x + 2 * q, y + h - 3 * q, w - 4 * q, q);
}
/** A recessed socket for an icon: dark well, shadowed top edge, faint lit lip at the bottom. */
export function pixelSocket(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, unit = 2, tint = '#0d0a14') {
  const q = Math.max(1, Math.round(unit));
  x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
  g.fillStyle = tint; g.fillRect(x, y, w, h);
  g.fillStyle = '#00000080'; g.fillRect(x, y, w, q); g.fillRect(x, y, q, h);
  g.fillStyle = '#ffffff14'; g.fillRect(x + q, y + h - q, w - q, q);
}
/** A small cut gem (rarity marker): 3x3 units with a glint. */
export function pixelGem(g: CanvasRenderingContext2D, x: number, y: number, color: string, unit = 2) {
  const q = Math.max(1, Math.round(unit)); x = Math.round(x); y = Math.round(y);
  g.fillStyle = '#0b0910'; g.fillRect(x - q, y - 2 * q, 3 * q, 5 * q); g.fillRect(x - 2 * q, y - q, 5 * q, 3 * q);
  g.fillStyle = mixHex(color, '#000000', 0.35); g.fillRect(x - q, y - q, 3 * q, 3 * q);
  g.fillStyle = color; g.fillRect(x - q, y - q, 2 * q, 2 * q);
  g.fillStyle = mixHex(color, '#ffffff', 0.7); g.fillRect(x - q, y - q, q, q);
}
export function pixelMeter(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, fraction: number, color: string, unit = 2) {
  const q = Math.max(1, Math.round(unit)),
    fill = Math.max(0, Math.min(w, Math.round(w * Math.max(0, Math.min(1, fraction)))));
  x = Math.round(x);
  y = Math.round(y);
  w = Math.round(w);
  h = Math.round(h);
  g.fillStyle = '#211b2e';
  g.fillRect(x, y, w, h);
  g.fillStyle = color;
  g.fillRect(x, y, fill, h);
  g.fillStyle = '#ffffff30';
  g.fillRect(x, y, fill, Math.min(q, h));
  g.fillStyle = '#00000030';
  if (h > 3 * q) g.fillRect(x, y + h - q, fill, q);
  g.fillStyle = '#0d0b1838';
  for (let xx = q * 8; xx < w; xx += q * 8) g.fillRect(x + xx, y, q, h);
}
export function pixelText(g: CanvasRenderingContext2D, text: string, x: number, y: number, scale: number, color: string, center = false) {
  g.save();
  g.font = pixelFont(Math.max(1, Math.round(scale)) * 10);
  g.textAlign = center ? 'center' : 'left';
  g.textBaseline = 'top';
  g.fillStyle = color;
  fillText(g, text.toUpperCase(), x, y);
  g.restore();
}
