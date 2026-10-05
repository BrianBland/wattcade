// Colour mixing and layer-dissolve maths shared by the warm-up renderer (pure, unit-tested).

export type RGB = [number, number, number];

/** Parses `#rgb`, `#rrggbb` (alpha digits ignored) and the `rgb(r,g,b)` strings mixColor returns. */
const hexCache = new Map<string, RGB>();
export function rgb(c: string): RGB {
  const m = /^rgb\((\d+),(\d+),(\d+)\)$/.exec(c);
  if (m) return [+m[1], +m[2], +m[3]];
  let v = hexCache.get(c);
  if (!v) {
    const h = c.length === 4 ? [...c.slice(1, 4)].map((x) => x + x).join('') : c.slice(1, 7);
    const n = parseInt(h, 16);
    v = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    hexCache.set(c, v);
  }
  return v;
}

export function mixColor(a: string, b: string, t: number): string {
  if (t <= 0) return a; if (t >= 1) return b;
  const x = rgb(a), y = rgb(b);
  return `rgb(${Math.round(x[0] + (y[0] - x[0]) * t)},${Math.round(x[1] + (y[1] - x[1]) * t)},${Math.round(x[2] + (y[2] - x[2]) * t)})`;
}

/** Weighted blend of any number of colours (weights need not sum to 1). */
export function blendColors(parts: ReadonlyArray<readonly [string, number]>): string {
  let acc = parts[0][0], total = parts[0][1];
  for (let i = 1; i < parts.length; i++) {
    const [c, w] = parts[i];
    if (w <= 0) continue;
    total += w; acc = mixColor(acc, c, w / total);
  }
  return acc;
}

/**
 * Alphas for drawing scene layers bottom-to-top in a fixed order so they dissolve into each other without
 * the background showing through: the bottom layer stays opaque until its weight drops below 1/2, the rest fade by weight.
 */
export function layerAlphas(weights: readonly number[]): number[] {
  return weights.map((w, i) => (i === 0 ? Math.min(1, 2 * w) : w));
}
