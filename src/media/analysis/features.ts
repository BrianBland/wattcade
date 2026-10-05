import { FFT, hann } from './fft';

export const FRAME_N = 2048;
export const HOP = 512;
export const MEL_BANDS = 40;
/** Band edges in Hz: low < 150 ≤ mid < 2000 ≤ high. */
export const BAND_EDGES = [150, 2000] as const;

/** Per-frame features from one STFT pass. Frame i is centred at (i·hop + n/2) / sr seconds. */
export interface Frames {
  sr: number; hop: number; n: number; count: number;
  /** Frames per second. */
  rate: number;
  /** Loudness proxy (log energy, all bins). */
  energy: Float32Array;
  /** Log energy per band, frame-major: [i*3 + b]. */
  bandEnergy: Float32Array;
  /** Half-wave-rectified log-spectral flux per band, frame-major: [i*3 + b]. */
  flux: Float32Array;
  /** Log mel energies, frame-major: [i*MEL_BANDS + m]. */
  mel: Float32Array;
  /** Chroma (12 pitch classes, unnormalised), frame-major: [i*12 + pc]. */
  chroma: Float32Array;
}

export const frameTime = (f: Pick<Frames, 'hop' | 'n' | 'sr'>, i: number) => (i * f.hop + f.n / 2) / f.sr;

const hzToMel = (hz: number) => 2595 * Math.log10(1 + hz / 700);
const melToHz = (m: number) => 700 * (10 ** (m / 2595) - 1);

interface Tri { lo: number; w: Float32Array }
function melBank(sr: number, n: number, bands: number, fMin = 30, fMax = Math.min(8000, sr / 2)): Tri[] {
  const bins = n / 2 + 1, binHz = sr / n;
  const m0 = hzToMel(fMin), m1 = hzToMel(fMax);
  const pts = Array.from({ length: bands + 2 }, (_, i) => melToHz(m0 + ((m1 - m0) * i) / (bands + 1)));
  const out: Tri[] = [];
  for (let b = 0; b < bands; b++) {
    const [a, c, d] = [pts[b], pts[b + 1], pts[b + 2]];
    const lo = Math.max(0, Math.floor(a / binHz)), hi = Math.min(bins - 1, Math.ceil(d / binHz));
    const w = new Float32Array(hi - lo + 1);
    for (let k = lo; k <= hi; k++) {
      const f = k * binHz;
      w[k - lo] = f <= c ? Math.max(0, (f - a) / Math.max(1e-9, c - a)) : Math.max(0, (d - f) / Math.max(1e-9, d - c));
    }
    out.push({ lo, w });
  }
  return out;
}

/** One pass over mono PCM. Memory stays small: no full spectrogram is kept. */
export function computeFrames(pcm: Float32Array, sr: number, n = FRAME_N, hop = HOP): Frames {
  const count = Math.max(1, Math.floor(Math.max(0, pcm.length - n) / hop) + 1);
  const bins = n / 2 + 1, binHz = sr / n;
  const fft = new FFT(n), win = hann(n);
  const frame = new Float32Array(n), mag = new Float32Array(bins);
  const logPrev = new Float32Array(bins), logCur = new Float32Array(bins);
  const bandOf = new Uint8Array(bins);
  const pcOf = new Int8Array(bins);
  for (let k = 0; k < bins; k++) {
    const f = k * binHz;
    bandOf[k] = f < BAND_EDGES[0] ? 0 : f < BAND_EDGES[1] ? 1 : 2;
    pcOf[k] = f >= 130 && f <= 4000 ? ((Math.round(12 * Math.log2(f / 440)) % 12) + 12 + 9) % 12 : -1; // 0 = C
  }
  const bank = melBank(sr, n, MEL_BANDS);
  const norm = 4 / n; // hann window sum = n/2, ×2 for one-sided
  const out: Frames = {
    sr, hop, n, count, rate: sr / hop,
    energy: new Float32Array(count), bandEnergy: new Float32Array(count * 3), flux: new Float32Array(count * 3),
    mel: new Float32Array(count * MEL_BANDS), chroma: new Float32Array(count * 12),
  };
  const be = [0, 0, 0], fl = [0, 0, 0];
  for (let i = 0; i < count; i++) {
    const off = i * hop;
    for (let j = 0; j < n; j++) frame[j] = (pcm[off + j] ?? 0) * win[j];
    fft.magnitudes(frame, mag);
    let e = 0; be[0] = be[1] = be[2] = 0; fl[0] = fl[1] = fl[2] = 0;
    for (let k = 1; k < bins; k++) {
      const m = mag[k] * norm, p = m * m;
      e += p; be[bandOf[k]] += p;
      const lm = Math.log1p(100 * m);
      logCur[k] = lm;
      const d = lm - logPrev[k];
      if (d > 0 && i > 0) fl[bandOf[k]] += d;
      // chroma from spectral peaks only, so drums and noise (broadband) don't colour the pitch classes
      if (pcOf[k] >= 0 && mag[k] > mag[k - 1] && mag[k] >= mag[k + 1]) out.chroma[i * 12 + pcOf[k]] += m;
    }
    out.energy[i] = Math.log10(e + 1e-10);
    for (let b = 0; b < 3; b++) { out.bandEnergy[i * 3 + b] = Math.log10(be[b] + 1e-10); out.flux[i * 3 + b] = fl[b]; }
    for (let m = 0; m < MEL_BANDS; m++) {
      const t = bank[m]; let s = 0;
      for (let j = 0; j < t.w.length; j++) { const v = mag[t.lo + j] * norm; s += v * v * t.w[j]; }
      out.mel[i * MEL_BANDS + m] = Math.log10(s + 1e-10);
    }
    logPrev.set(logCur);
  }
  return out;
}
