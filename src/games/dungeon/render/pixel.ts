// All world art is drawn at this resolution, then enlarged by an INTEGER device-pixel scale.
export const TILE_PX = 16;
/** Area keeps actor size stable on rotation; the short-axis limit leaves room to see approaching enemies. */
export function pixelViewport(width: number, height: number, zoomSteps = 0) {
  const short = Math.min(width, height);
  const baseScale = Math.max(1, Math.min(Math.round(Math.sqrt(width * height) / (16 * TILE_PX)), Math.floor(short / (8 * TILE_PX))));
  const minScale = Math.max(1, Math.round(baseScale * 0.65));
  const maxScale = Math.max(baseScale, Math.min(Math.round(baseScale * 1.5), Math.floor(short / (6 * TILE_PX))));
  const scale = Math.max(minScale, Math.min(maxScale, baseScale + Math.round(zoomSteps)));
  return {
    scale, baseScale, minScale, maxScale,
    width: Math.ceil(width / scale),
    height: Math.ceil(height / scale)
  };
}
export interface ZoomState { steps: number; held: number }
/** Either signed paddle axis steps zoom. Opposing inputs cancel; hysteresis rejects analog jitter. */
export function paddleZoom(state: ZoomState, width: number, height: number, left: number, right: number): ZoomState {
  const value = Math.max(-1, Math.min(1, left + right)), sign = Math.sign(value);
  const held = Math.abs(value) >= 0.6 || sign === state.held && Math.abs(value) >= 0.2 ? sign : 0;
  if (!held || held === state.held) return { steps: state.steps, held };
  const current = pixelViewport(width, height, state.steps);
  const steps = current.scale - current.baseScale + held;
  const view = pixelViewport(width, height, steps);
  return { steps: view.scale - view.baseScale, held };
}
/** Pinch distance is relative to the gesture's starting scale, so limits do not accumulate hidden zoom. */
export function pinchZoom(width: number, height: number, startScale: number, ratio: number): number {
  const view = pixelViewport(width, height);
  const scale = Number.isFinite(ratio) && ratio >= 0 ? Math.round(startScale * ratio) : startScale;
  return Math.max(view.minScale, Math.min(view.maxScale, scale)) - view.baseScale;
}
export type PixelPoint = readonly [number, number];
/** Center narrow masks before rotating, so shots do not orbit around their collision point. */
export function squareRows(rows: readonly string[], minSize = 0): string[] {
  const width = Math.max(...rows.map(r => r.length)), size = Math.max(minSize, rows.length, width);
  const top = Math.floor((size - rows.length) / 2), left = Math.floor((size - width) / 2);
  return Array.from({ length: size }, (_, y) => '.'.repeat(left) + (rows[y - top] ?? '').padEnd(width, '.')).map(r => r.padEnd(size, '.'));
}
/** Bresenham: connected integer pixels, including for arbitrary simulation aim angles. */
export function linePixels(ax: number, ay: number, bx: number, by: number): PixelPoint[] {
  let x = Math.round(ax),
    y = Math.round(ay);
  const ex = Math.round(bx),
    ey = Math.round(by);
  const dx = Math.abs(ex - x),
    dy = -Math.abs(ey - y),
    sx = x < ex ? 1 : -1,
    sy = y < ey ? 1 : -1;
  let err = dx + dy;
  const pts: PixelPoint[] = [];
  for (;;) {
    pts.push([x, y]);
    if (x === ex && y === ey) return pts;
    const e = err * 2;
    if (e >= dy) {
      err += dy;
      x += sx;
    }
    if (e <= dx) {
      err += dx;
      y += sy;
    }
  }
}
export function pixelLine(g: CanvasRenderingContext2D, ax: number, ay: number, bx: number, by: number, color: string, width = 1) {
  g.fillStyle = color;
  const w = Math.max(1, Math.round(width)),
    o = Math.floor(w / 2);
  for (const [x, y] of linePixels(ax, ay, bx, by)) g.fillRect(x - o, y - o, w, w);
}
export function pixelDisc(g: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, squash = 1) {
  x = Math.round(x);
  y = Math.round(y);
  r = Math.max(1, Math.round(r));
  g.fillStyle = color;
  for (let yy = -Math.ceil(r * squash); yy <= r * squash; yy++) {
    const w = Math.floor(Math.sqrt(Math.max(0, r * r - (yy / squash) ** 2)));
    g.fillRect(x - w, y + yy, w * 2 + 1, 1);
  }
}
export function pixelRing(g: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, dashed = false, squash = 1, progress = 1) {
  x = Math.round(x);
  y = Math.round(y);
  r = Math.max(1, Math.round(r));
  g.fillStyle = color;
  for (let yy = -Math.ceil(r * squash); yy <= r * squash; yy++) for (let xx = -r; xx <= r; xx++) {
    const d = Math.hypot(xx, yy / squash),
      a = (Math.atan2(yy / squash, xx) + Math.PI * 2.5) % (Math.PI * 2);
    if (d >= r - 0.8 && d < r + 0.2 && a <= progress * Math.PI * 2 && (!dashed || Math.floor(a / (Math.PI / 8)) % 2 === 0)) g.fillRect(x + xx, y + yy, 1, 1);
  }
}
export function pixelTarget(g: CanvasRenderingContext2D, x: number, y: number, r: number, color: string) {
  x = Math.round(x);
  y = Math.round(y);
  r = Math.round(r);
  const n = Math.max(2, Math.round(r / 3));
  g.fillStyle = color;
  for (const dx of [-1, 1]) for (const dy of [-1, 1]) {
    g.fillRect(x + dx * r - (dx > 0 ? n - 1 : 0), y + dy * r, n, 1);
    g.fillRect(x + dx * r, y + dy * r - (dy > 0 ? n - 1 : 0), 1, n);
  }
}
/** Inverse nearest-neighbour sampling of an ASCII mask. No canvas rotation/antialiasing. */
export function rotateRows(rows: readonly string[], angle: number): string[] {
  const n = rows.length;
  const quarter = Math.round(angle / (Math.PI / 2));
  if (rows.every(r => r.length === n) && Math.abs(angle - quarter * Math.PI / 2) < 1e-9) {
    let result = [...rows];
    for (let i = 0, turns = ((quarter % 4) + 4) % 4; i < turns; i++) {
      result = Array.from({ length: n }, (_, y) => Array.from({ length: n }, (_, x) => result[n - 1 - x][y]).join(''));
    }
    return result;
  }
  let size = Math.ceil(Math.hypot(n, rows[0].length));
  // Matching parity keeps the source and destination pivots on the same half-pixel lattice.
  if (size % 2 !== n % 2) size++;
  const out: string[] = [];
  const ca = Math.cos(angle),
    sa = Math.sin(angle),
    half = (size - 1) / 2,
    ox = (rows[0].length - 1) / 2,
    oy = (n - 1) / 2;
  for (let y = 0; y < size; y++) {
    let row = '';
    for (let x = 0; x < size; x++) {
      const dx = x - half,
        dy = y - half,
        xx = Math.floor(dx * ca + dy * sa + ox + 0.5 + 1e-9),
        yy = Math.floor(-dx * sa + dy * ca + oy + 0.5 + 1e-9);
      row += rows[yy]?.[xx] ?? '.';
    }
    out.push(row);
  }
  return out;
}
