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
/** Outlined pixel materials use a small set of solid tones, never an airbrushed ramp.
 * Lighting and staggered texture are clipped to the actual silhouette. */
function finish(g: G, color: string, x: number, y: number, w: number, h: number) {
  g.fillStyle = color; g.fill();
  if (w * h < 3 || Math.min(w, h) < .65) return;
  g.save(); g.clip();
  g.fillStyle = tone(color, .68);
  g.fillRect(x, y + h * .7, w, h * .3);
  g.fillRect(x + w * .48, y + h * .58, w * .52, h * .12);
  g.fillRect(x + w * .7, y + h * .48, w * .3, h * .1);
  g.fillStyle = tone(color, 1.22);
  g.fillRect(x, y, w * .78, h * .18);
  g.fillRect(x, y + h * .18, w * .52, h * .1);
  g.fillRect(x + w * .1, y + h * .28, w * .15, h * .08);
  // Sparse pixel clusters give fur, cloth and metal a shared illustrated finish.
  g.fillStyle = tone(color, 1.12);
  for (let row = 0; row < Math.ceil(h / .65); row++) {
    const v = y + row * .65;
    for (let col = 0; col < Math.ceil(w / .75); col++) {
      if ((col * 3 + row * 5) % 7 !== 0) continue;
      g.fillRect(x + col * .75 + (row % 2) * .25, v, .5, .25);
    }
  }
  g.restore();
  g.strokeStyle = /^#[\da-f]{8}$/i.test(color) ? OUTLINE + color.slice(7) : OUTLINE;
  g.lineWidth = .38; g.lineJoin = 'miter'; g.stroke();
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
    g.beginPath(); g.moveTo(points[0][0], points[0][1] - width * .18);
    for (const p of points.slice(1)) g.lineTo(p[0], p[1] - width * .18);
    g.strokeStyle = tone(color, 1.35); g.lineWidth = width * .22; g.stroke();
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
