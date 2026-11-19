type G = CanvasRenderingContext2D;
const ink = '#283351';
export function poly(g: G, fill: string, points: number[], stroke = false) {
  g.beginPath();
  g.moveTo(points[0], points[1]);
  for (let i = 2; i < points.length; i += 2) g.lineTo(points[i], points[i + 1]);
  g.closePath();
  g.fillStyle = fill;
  g.fill();
  if (stroke) {
    g.strokeStyle = ink;
    g.lineWidth = 2;
    g.lineJoin = 'round';
    g.stroke();
  }
}
function oval(g: G, x: number, y: number, w: number, h: number, color: string) {
  g.beginPath();
  g.ellipse(x, y, w, h, 0, 0, Math.PI * 2);
  g.fillStyle = color;
  g.fill();
}
export function skiff(
  g: G,
  x: number,
  y: number,
  size: number,
  color: string,
  bank: number,
  boost: boolean,
  pilot = -1,
) {
  g.save();
  g.translate(x, y);
  g.scale(size, size);
  g.rotate(bank);
  poly(
    g,
    color,
    [-63, -7, -48, -23, -25, -20, -13, -31, 13, -31, 25, -20, 48, -23, 63, -7, 32, 3, 0, 13, -32, 3],
    true,
  );
  for (const side of [-1, 1]) {
    g.save();
    g.scale(side, 1);
    poly(g, '#fff1cf', [14, -15, 50, -19, 54, -14, 20, -8]);
    poly(g, '#ff9758', [32, 0, 47, -2, 40, boost ? 33 : 14]);
    oval(g, 39, -5, 11, 12, ink);
    oval(g, 39, -7, 7, 8, '#ebc49c');
    oval(g, 39, -5, 5, 5, '#803e51');
    g.restore();
  }
  oval(g, 0, -9, 25, 18, ink);
  oval(g, 0, -13, 23, 16, color);
  if (pilot === 1) {
    oval(g, -9, -44, 5, 13, '#537d65');
    oval(g, 8, -42, 5, 12, '#78ad77');
  } else if (pilot === 2) {
    oval(g, -13, -40, 8, 8, '#73517f');
    oval(g, 13, -40, 8, 8, '#73517f');
  } else {
    poly(g, '#ffb065', [-17, -28, -19, -48, -7, -39, 7, -39, 19, -48, 17, -28, 10, -21, -10, -21], true);
  }
  oval(g, 0, -32, 17, 12, ['#c87755', '#75a17c', '#957ba8'][pilot] ?? '#b96544');
  poly(g, '#fff0c9', [-17, -30, -9, -28, 0, -24, 9, -28, 17, -30, 11, -21, 0, -17, -11, -21]);
  poly(g, '#148597', [-15, -21, 10, -19, 26, -24, 32, -22, 21, -15, -9, -15], true);
  poly(g, '#fff5cd', [-12, -7, 0, -3, 12, -7, 9, -1, 0, 3, -9, -1]);
  g.restore();
}
export function sky(g: G, w: number, h: number, t: number) {
  const grad = g.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, '#447ea9');
  grad.addColorStop(0.46, '#a6dfdc');
  grad.addColorStop(0.72, '#fff0c9');
  grad.addColorStop(1, '#96cad2');
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);
  oval(g, w * 0.74, h * 0.18, h * 0.087, h * 0.087, '#ffe7a1');
  for (let i = 0; i < 15; i++) {
    const x = ((((i * 0.329 * w - t * ((i % 3) + 1)) % (w * 1.2)) + w * 1.2) % (w * 1.2)) - 0.1 * w;
    const y = h * (0.12 + ((i * 17) % 31) / 100),
      r = w * (0.015 + (i % 4) * 0.009);
    oval(g, x, y, r * 1.7, r * 0.25, '#f7efd9');
    oval(g, x + r * 0.15, y - r * 0.19, r * 0.72, r * 0.36, '#fff7e2');
  }
}
export function isle(g: G, x: number, y: number, size: number, t: number) {
  g.save();
  g.translate(x, y);
  g.scale(size, size);
  poly(g, '#897999', [-59, 0, 65, 0, 42, 18, 21, 19, 9, 45, -4, 28, -28, 24, -36, 10]);
  poly(g, '#b897a5', [-48, 3, -17, 4, -3, 27, -27, 20]);
  oval(g, 2, 0, 62, 8, '#7caf94');
  for (const [tx, ty] of [
    [-42, -1],
    [-32, 0],
    [32, 0],
    [48, -1],
  ]) {
    poly(g, '#406f71', [tx - 4, ty, tx, ty - 14, tx + 5, ty]);
    poly(g, '#72a789', [tx, ty - 14, tx + 5, ty, tx, ty - 3]);
  }
  poly(g, '#ffe1ac', [-13, -2, -8, -43, 8, -43, 15, -2], true);
  poly(g, '#d87861', [-14, -40, 0, -54, 14, -40], true);
  g.fillStyle = '#92685d';
  g.fillRect(-3, -13, 6, 10);
  g.fillRect(-2, -30, 4, 5);
  g.translate(0, -37);
  g.rotate(t * 0.65);
  for (let i = 0; i < 4; i++) {
    poly(g, '#ffedc8', [0, 0, 2, -32, 10, -33, 7, -13], true);
    g.rotate(Math.PI / 2);
  }
  oval(g, 0, 0, 4, 4, ink);
  g.restore();
}
export function drawCard(g: G, w: number, h: number, t: number, color: string) {
  sky(g, w, h, t);
  isle(g, w * 0.78, h * 0.53, h * 0.008, t);
  poly(g, '#6b779a', [0, h, w * 0.38, h * 0.48, w * 0.54, h * 0.48, w, h]);
  poly(g, '#f6b485', [0, h, w * 0.38, h * 0.48, w * 0.4, h * 0.48, w * 0.12, h]);
  skiff(g, w * 0.46, h * 0.76, h * 0.009, color, -0.08, true);
}
