/** Small numeric helpers shared by the analysis stages (pure). */

export function percentile(xs: ArrayLike<number>, p: number): number {
  const a = Array.from(xs).filter(Number.isFinite).sort((x, y) => x - y);
  if (!a.length) return 0;
  const i = Math.min(a.length - 1, Math.max(0, (a.length - 1) * p));
  const lo = Math.floor(i), hi = Math.ceil(i);
  return a[lo] + (a[hi] - a[lo]) * (i - lo);
}

export const median = (xs: ArrayLike<number>) => percentile(xs, 0.5);

export function mean(xs: ArrayLike<number>): number {
  let s = 0; for (let i = 0; i < xs.length; i++) s += xs[i];
  return xs.length ? s / xs.length : 0;
}

export function std(xs: ArrayLike<number>): number {
  const m = mean(xs); let s = 0;
  for (let i = 0; i < xs.length; i++) s += (xs[i] - m) ** 2;
  return xs.length ? Math.sqrt(s / xs.length) : 0;
}

/** Centred moving average with window `w` samples (odd-ised). */
export function smooth(xs: ArrayLike<number>, w: number): Float32Array {
  const n = xs.length, h = Math.max(0, Math.floor(w / 2)), out = new Float32Array(n);
  const pre = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) pre[i + 1] = pre[i] + xs[i];
  for (let i = 0; i < n; i++) { const a = Math.max(0, i - h), b = Math.min(n, i + h + 1); out[i] = (pre[b] - pre[a]) / (b - a); }
  return out;
}

/** Map to 0..1 between the p-low and p-high percentiles, clamped. */
export function normalise(xs: ArrayLike<number>, pLo = 0.05, pHi = 0.98): Float32Array {
  const lo = percentile(xs, pLo), hi = percentile(xs, pHi), d = hi - lo || 1;
  const out = new Float32Array(xs.length);
  for (let i = 0; i < xs.length; i++) out[i] = Math.min(1, Math.max(0, (xs[i] - lo) / d));
  return out;
}

/** Linear-interpolated resample of a series at `rateIn` Hz to `rateOut` Hz over `durationS`. */
export function resampleSeries(xs: ArrayLike<number>, rateIn: number, rateOut: number, durationS: number, offsetS = 0): number[] {
  const n = Math.max(1, Math.round(durationS * rateOut)), out: number[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const x = ((i / rateOut) - offsetS) * rateIn;
    const a = Math.max(0, Math.min(xs.length - 1, Math.floor(x))), b = Math.min(xs.length - 1, a + 1), f = Math.min(1, Math.max(0, x - a));
    out[i] = xs.length ? xs[a] * (1 - f) + xs[b] * f : 0;
  }
  return out;
}

export const round = (x: number, d = 3) => { const k = 10 ** d; return Math.round(x * k) / k; };

/** Index of the nearest value in a sorted array. */
export function nearestIndex(sorted: ArrayLike<number>, x: number): number {
  let lo = 0, hi = sorted.length - 1;
  if (hi < 0) return -1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (sorted[m] <= x) lo = m; else hi = m; }
  return Math.abs(sorted[lo] - x) <= Math.abs(sorted[hi] - x) ? lo : hi;
}
