import { shade as baseShade, TAU, type G, type P } from '../prims';
export { TAU, SKIN, joint, type G, type P } from '../prims';

export function shade(color: string, value: number): string {
  const hsl = /^hsl\(([-\d.]+)[ ,]+([\d.]+)%[ ,]+([\d.]+)%\)$/.exec(color);
  if (!hsl) return baseShade(color, value);
  const light = Number(hsl[3]);
  const result = Math.max(0, Math.min(100, value <= 1 ? light * value : light + (100 - light) * (value - 1)));
  return `hsl(${hsl[1]} ${hsl[2]}% ${result}%)`;
}

const OUTLINE = '#172334';
function tone(color: string, value: number): string {
  const short = /^#([\da-f]{3})$/i.exec(color);
  if (short) color = '#' + [...short[1]].map(c => c + c).join('');
  return shade(color, value) + (/^#[\da-f]{8}$/i.test(color) ? color.slice(7) : '');
}
/** Small details stay flat and legible. Larger surfaces get a lit face and a shaded edge. */
function finish(g: G, color: string, x: number, y: number, w: number, h: number) {
  if (w * h < 3 || Math.min(w, h) < .65) { g.fillStyle = color; g.fill(); return; }
  const light = g.createLinearGradient(x, y, x + w * .55, y + h);
  light.addColorStop(0, tone(color, 1.3)); light.addColorStop(.38, color); light.addColorStop(1, tone(color, .64));
  g.fillStyle = light; g.fill();
  g.strokeStyle = /^#[\da-f]{8}$/i.test(color) ? OUTLINE + color.slice(7) : OUTLINE;
  g.lineWidth = .24; g.lineJoin = 'round'; g.stroke();
}
export function poly(g: G, color: string, ...points: P[]) {
  g.save(); g.beginPath(); g.moveTo(...points[0]);
  for (const p of points.slice(1)) g.lineTo(...p);
  g.closePath();
  const xs = points.map(p => p[0]), ys = points.map(p => p[1]);
  finish(g, color, Math.min(...xs), Math.min(...ys), Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
  g.restore();
}
export function rect(g: G, color: string, x: number, y: number, w: number, h: number) {
  g.save(); g.beginPath(); g.rect(x, y, w, h); finish(g, color, x, y, w, h); g.restore();
}
export function circle(g: G, color: string, x: number, y: number, radius: number) {
  g.save(); g.beginPath(); g.arc(x, y, radius, 0, TAU);
  finish(g, color, x - radius, y - radius, radius * 2, radius * 2); g.restore();
}
export function oval(g: G, color: string, x: number, y: number, rx: number, ry: number, rotation = 0, half = false) {
  g.save(); g.translate(x, y); g.rotate(rotation); g.beginPath();
  g.ellipse(0, 0, rx, ry, 0, half ? Math.PI : 0, TAU); if (half) g.closePath();
  finish(g, color, -rx, -ry, rx * 2, ry * (half ? 1 : 2)); g.restore();
}
export function line(g: G, color: string, width: number, ...points: P[]) {
  g.save(); g.lineCap = 'round'; g.lineJoin = 'round'; g.beginPath(); g.moveTo(...points[0]);
  for (const p of points.slice(1)) g.lineTo(...p);
  if (width >= .75) { g.strokeStyle = OUTLINE; g.lineWidth = width + .22; g.stroke(); }
  g.strokeStyle = color; g.lineWidth = width; g.stroke();
  if (width >= 1.1) {
    g.translate(0, -width * .18); g.strokeStyle = tone(color, 1.35); g.lineWidth = width * .22; g.stroke();
  }
  g.restore();
}
export function ring(g: G, color: string, width: number, x: number, y: number, radius: number) {
  g.save(); g.strokeStyle = color; g.lineWidth = width; g.beginPath(); g.arc(x, y, radius, 0, TAU); g.stroke(); g.restore();
}
export function quad(g: G, color: string, width: number, a: P, control: P, b: P) {
  g.save(); g.lineCap = 'round'; g.beginPath(); g.moveTo(...a); g.quadraticCurveTo(...control, ...b);
  if (width >= .75) { g.strokeStyle = OUTLINE; g.lineWidth = width + .22; g.stroke(); }
  g.strokeStyle = color; g.lineWidth = width; g.stroke(); g.restore();
}
