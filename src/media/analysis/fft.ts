/** In-place iterative radix-2 complex FFT with cached twiddles. `n` must be a power of two. */
export class FFT {
  readonly n: number;
  private rev: Uint32Array;
  private cos: Float64Array;
  private sin: Float64Array;
  private re: Float64Array;
  private im: Float64Array;

  constructor(n: number) {
    if (n < 2 || (n & (n - 1)) !== 0) throw new Error(`FFT size must be a power of two, got ${n}`);
    this.n = n;
    const bits = Math.log2(n);
    this.rev = new Uint32Array(n);
    for (let i = 0; i < n; i++) {
      let r = 0;
      for (let b = 0; b < bits; b++) r = (r << 1) | ((i >> b) & 1);
      this.rev[i] = r;
    }
    this.cos = new Float64Array(n / 2);
    this.sin = new Float64Array(n / 2);
    for (let i = 0; i < n / 2; i++) { this.cos[i] = Math.cos((2 * Math.PI * i) / n); this.sin[i] = -Math.sin((2 * Math.PI * i) / n); }
    this.re = new Float64Array(n);
    this.im = new Float64Array(n);
  }

  /** Complex transform of (re, im) in place. */
  transform(re: Float64Array, im: Float64Array): void {
    const n = this.n, rev = this.rev;
    for (let i = 0; i < n; i++) {
      const j = rev[i];
      if (j > i) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
    }
    for (let size = 2; size <= n; size <<= 1) {
      const half = size >> 1, step = n / size;
      for (let start = 0; start < n; start += size) {
        for (let k = 0; k < half; k++) {
          const wr = this.cos[k * step], wi = this.sin[k * step];
          const a = start + k, b = a + half;
          const xr = re[b] * wr - im[b] * wi, xi = re[b] * wi + im[b] * wr;
          re[b] = re[a] - xr; im[b] = im[a] - xi;
          re[a] += xr; im[a] += xi;
        }
      }
    }
  }

  /** Magnitude spectrum (n/2 + 1 bins) of a real frame. `frame.length` must equal n. */
  magnitudes(frame: ArrayLike<number>, out: Float32Array): Float32Array {
    const { re, im, n } = this;
    for (let i = 0; i < n; i++) { re[i] = frame[i]; im[i] = 0; }
    this.transform(re, im);
    for (let i = 0; i <= n / 2; i++) out[i] = Math.hypot(re[i], im[i]);
    return out;
  }
}

export function hann(n: number): Float32Array {
  const w = new Float32Array(n);
  for (let i = 0; i < n; i++) w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n);
  return w;
}
