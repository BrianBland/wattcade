import type { G, P } from './prims';

const surfaces = new WeakMap<G, { canvas: HTMLCanvasElement; g: G }>();
const COLS = 6, ROWS = 4;

/** Pixelate the composited scene, including the bike and background, at the hips.
 * Work in rider space so camera zoom, reflection, bike tilt and clipping all apply.
 * drawImage sampling avoids a scene pixel readback (and works with tainted canvases).
 */
export function drawCensor(g: G, hip: P, t: number) {
  if (typeof document === 'undefined') return;
  const inverse = g.getTransform().inverse();
  if (![inverse.a, inverse.b, inverse.c, inverse.d, inverse.e, inverse.f].every(Number.isFinite)) return;
  let surface = surfaces.get(g);
  if (!surface) {
    const canvas = document.createElement('canvas');
    canvas.width = COLS; canvas.height = ROWS;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    surface = { canvas, g: ctx }; surfaces.set(g, surface);
  }
  const x = hip[0] - 3.5, y = hip[1] - 1, w = 8.4, h = 5.6;
  const s = surface.g, sx = COLS / w, sy = ROWS / h;
  s.setTransform(1, 0, 0, 1, 0, 0); s.clearRect(0, 0, COLS, ROWS);
  // Inverse destination transform maps the already-painted scene into this tiny grid.
  s.setTransform(sx * inverse.a, sy * inverse.b, sx * inverse.c, sy * inverse.d,
    sx * (inverse.e - x), sy * (inverse.f - y));
  s.imageSmoothingEnabled = true; s.imageSmoothingQuality = 'high';
  s.drawImage(g.canvas, 0, 0);
  s.save(); s.setTransform(1, 0, 0, 1, 0, 0);
  s.globalCompositeOperation = 'source-atop'; s.globalAlpha = .035;
  for (let row = 0; row < ROWS; row++) for (let col = 0; col < COLS; col++) {
    s.fillStyle = (row * 19 + col * 11 + Math.floor(t * 6) * 13) % 7 < 3 ? '#fff' : '#000';
    s.fillRect(col, row, 1, 1);
  }
  s.restore();
  g.save();
  // Samples already contain the caller's alpha. Replace them rather than doubling it.
  g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; g.imageSmoothingEnabled = false;
  g.filter = 'none'; g.shadowColor = 'transparent';
  g.clearRect(x, y, w, h); g.drawImage(surface.canvas, x, y, w, h);
  g.restore();
}
