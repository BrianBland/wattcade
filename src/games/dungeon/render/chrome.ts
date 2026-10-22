import { fillText, pixelFont } from './font';

// Stepped game frames and meters live at display resolution so small text remains sharp.
export function pixelPanel(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, border = '#80718f', fill = '#171320ee', unit = 2) {
  const q = Math.max(1, Math.round(unit));
  x = Math.round(x);
  y = Math.round(y);
  w = Math.max(1, Math.round(w));
  h = Math.max(1, Math.round(h));
  g.fillStyle = fill;
  g.fillRect(x + q, y, w - 2 * q, h);
  g.fillRect(x, y + q, w, h - 2 * q);
  g.fillStyle = border;
  g.fillRect(x + 2 * q, y, w - 4 * q, q);
  g.fillRect(x + 2 * q, y + h - q, w - 4 * q, q);
  g.fillRect(x, y + 2 * q, q, h - 4 * q);
  g.fillRect(x + w - q, y + 2 * q, q, h - 4 * q);
  for (const dx of [q, w - 2 * q]) for (const dy of [q, h - 2 * q]) g.fillRect(x + dx, y + dy, q, q);
  g.fillStyle = '#ffffff16';
  g.fillRect(x + 2 * q, y + q, w - 4 * q, q);
  if (w > 100 * q && h > 12 * q) {
    g.fillStyle = '#bcaccc';
    g.fillRect(x + 3 * q, y + 3 * q, q, q);
    g.fillRect(x + w - 4 * q, y + 3 * q, q, q);
  }
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
  g.fillStyle = '#ffffff28';
  g.fillRect(x, y, fill, Math.min(q, h));
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
