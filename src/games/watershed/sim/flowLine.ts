// "Where would the water go from here?": a steepest-descent trace over the current ground + water surface. Pure; the
// renderer draws it from the rider's current marker to the sea so the river's route (and the saddle it will take) is
// readable before the water gets there.
import { SEA, sample } from './terrain';

/**
 * Trace downhill from (x, y) over s = max(h, SEA) + w·wk. Steps `step` cells along the (momentum-smoothed) downhill
 * direction; across flat water (a lake) it keeps its heading. Stops at the sea, the grid edge, or after `maxSteps`.
 */
export function traceFlow(h: Float32Array, w: Float32Array | null, nx: number, ny: number, x: number, y: number,
  opts: { step?: number; maxSteps?: number; wk?: number } = {}): Array<[number, number]> {
  const step = opts.step ?? 0.8, maxSteps = opts.maxSteps ?? 400, wk = opts.wk ?? 1;
  const s = (a: number, b: number) => Math.max(sample(h, nx, ny, a, b), SEA) + (w ? sample(w, nx, ny, a, b) * wk : 0);
  const out: Array<[number, number]> = [[x, y]];
  let dx = 0, dy = 1;   // downstream by default
  for (let k = 0; k < maxSteps; k++) {
    const e = 0.75;
    const gx = (s(x + e, y) - s(x - e, y)) / (2 * e), gy = (s(x, y + e) - s(x, y - e)) / (2 * e);
    const g = Math.hypot(gx, gy);
    if (g > 0.02) {
      // follow the slope, keeping a little momentum so the line doesn't zig-zag across a channel
      const nx_ = -gx / g, ny_ = -gy / g;
      dx = dx * 0.35 + nx_ * 0.65; dy = dy * 0.35 + ny_ * 0.65;
    } else dy += 0.15;   // flat (a lake): drift on, gently down the valley
    const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
    x = Math.min(nx - 1.5, Math.max(0.5, x + dx * step)); y += dy * step;
    if (y < 0.5) y = 0.5;
    out.push([x, y]);
    if (y >= ny - 1.5 || sample(h, nx, ny, x, y) < SEA - 0.5) break;
  }
  return out;
}
