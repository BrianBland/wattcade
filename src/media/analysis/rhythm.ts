import type { MediaOnset } from '../../contracts';
import { frameTime, type Frames } from './features';
import { median, percentile, smooth, std } from './util';

/** One band's flux envelope (frame rate). */
export function bandFlux(f: Frames, band: 0 | 1 | 2): Float32Array {
  const out = new Float32Array(f.count);
  for (let i = 0; i < f.count; i++) out[i] = f.flux[i * 3 + band];
  return out;
}

/**
 * Onset-strength envelope for tempo and beat tracking: per-band flux, each scaled by its spread
 * (so bands count equally), summed, minus a ~1 s local mean, half-wave rectified.
 */
export function onsetEnvelope(f: Frames): Float32Array {
  const w = [1.5, 1, 0.6];
  const env = new Float32Array(f.count);
  for (let b = 0 as 0 | 1 | 2; b < 3; b++) {
    const x = bandFlux(f, b), s = std(x) || 1;
    for (let i = 0; i < f.count; i++) env[i] += (w[b] * x[i]) / s;
  }
  const local = smooth(env, Math.round(f.rate));
  for (let i = 0; i < f.count; i++) env[i] = Math.max(0, env[i] - local[i]);
  return env;
}

function movingMedian(x: Float32Array, half: number): Float32Array {
  const out = new Float32Array(x.length), buf: number[] = [];
  for (let i = 0; i < x.length; i++) {
    buf.length = 0;
    for (let j = Math.max(0, i - half); j <= Math.min(x.length - 1, i + half); j++) buf.push(x[j]);
    buf.sort((a, b) => a - b);
    out[i] = buf[buf.length >> 1];
  }
  return out;
}

/** Peak-picked onsets per band: adaptive threshold (moving median + k·MAD), local maximum, minimum gap. */
export function detectOnsets(f: Frames, opts: { k?: number; minGapS?: number } = {}): MediaOnset[] {
  const k = opts.k ?? 1.5, gap = Math.max(1, Math.round((opts.minGapS ?? 0.07) * f.rate));
  const half = Math.round(0.5 * f.rate), loc = 3;
  const out: MediaOnset[] = [];
  for (let b = 0 as 0 | 1 | 2; b < 3; b++) {
    const x = bandFlux(f, b);
    const med = movingMedian(x, half);
    const m0 = median(x);
    const mad = median(Array.from(x, (v) => Math.abs(v - m0))) || std(x) * 0.5 || 1e-6;
    const peaks: Array<{ i: number; d: number }> = [];
    // absolute floor: a band that is nearly silent (e.g. no bass in an intro) shouldn't report its noise as hits
    const floor = 0.1 * percentile(x, 0.99);
    let last = -gap;
    for (let i = 1; i < f.count - 1; i++) {
      const thr = Math.max(floor, med[i] + k * mad);
      if (x[i] <= thr || i - last < gap) continue;
      let isMax = true;
      for (let j = Math.max(0, i - loc); j <= Math.min(f.count - 1, i + loc); j++) if (x[j] > x[i]) { isMax = false; break; }
      if (!isMax) continue;
      peaks.push({ i, d: x[i] - thr });
      last = i;
    }
    const top = percentile(peaks.map((p) => p.d), 0.95) || 1;
    for (const p of peaks) out.push({ t: frameTime(f, p.i), band: b, s: Math.min(1, Math.round((p.d / top) * 1000) / 1000) });
  }
  return out.sort((a, b) => a.t - b.t || a.band - b.band);
}

/** Autocorrelation of x for lags 0..maxLag. */
function autocorr(x: Float32Array, maxLag: number): Float64Array {
  const ac = new Float64Array(maxLag + 1);
  for (let l = 0; l <= maxLag; l++) { let s = 0; for (let i = l; i < x.length; i++) s += x[i] * x[i - l]; ac[l] = s; }
  return ac;
}
const acAt = (ac: Float64Array, lag: number) => {
  const a = Math.floor(lag), f = lag - a;
  return a + 1 < ac.length ? ac[a] * (1 - f) + ac[a + 1] * f : 0;
};

/**
 * Global tempo: a comb over the onset-envelope autocorrelation (lag, 2·lag, 3·lag, 4·lag) weighted by a
 * log-normal prior around 120 bpm (σ = 0.7 octave), scanned at 0.05 bpm.
 */
export function estimateTempo(env: Float32Array, rate: number, lo = 60, hi = 200): number {
  // coarse: comb of 4 multiples, prior picks the octave
  const span = Math.min(env.length - 1, Math.ceil(rate * 8) + 2);
  const ac = autocorr(env, span);
  const comb = (bpm: number, multiples: number) => {
    const L = (rate * 60) / bpm; let s = 0, n = 0;
    for (let m = 1; m <= multiples && m * L < span - 1; m++) { s += acAt(ac, m * L); n++; }
    return n ? s / n : 0;
  };
  let best = 120, bestS = -Infinity;
  for (let bpm = lo; bpm <= hi; bpm += 0.25) {
    const prior = Math.exp(-0.5 * (Math.log2(bpm / 120) / 0.7) ** 2);
    const s = comb(bpm, 4) * prior;
    if (s > bestS) { bestS = s; best = bpm; }
  }
  // fine: every multiple that fits in 8 s, ±3 % around the coarse pick (far multiples pin the period down)
  let fine = best, fineS = -Infinity;
  for (let bpm = best * 0.97; bpm <= best * 1.03; bpm += 0.02) {
    const s = comb(bpm, 64);
    if (s > fineS) { fineS = s; fine = bpm; }
  }
  return Math.round(fine * 100) / 100;
}

/**
 * Dynamic-programming beat tracker (after Ellis 2007): maximise onset strength at beats minus
 * `tightness`·log²(interval / period), so the grid can drift with the music. Returns beat times in seconds.
 */
export function trackBeats(env: Float32Array, rate: number, bpm: number, frameT: (i: number) => number, span?: [number, number], tightness = 100): number[] {
  const n = env.length;
  if (n < 4) return [];
  const p = (rate * 60) / bpm;
  const sd = std(env) || 1;
  // light gaussian smoothing (σ ≈ period/32) so slightly early/late hits still count
  const g = Math.max(1, Math.round(p / 32));
  const local = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0, w = 0;
    for (let j = -3 * g; j <= 3 * g; j++) { const k = i + j; if (k < 0 || k >= n) continue; const ww = Math.exp(-0.5 * (j / g) ** 2); s += env[k] * ww; w += ww; }
    local[i] = s / w / sd;
  }
  const score = new Float64Array(n), back = new Int32Array(n).fill(-1);
  const lo = Math.round(p / 2), hi = Math.round(2 * p);
  for (let t = 0; t < n; t++) {
    let best = -Infinity, arg = -1;
    for (let tau = t - hi; tau <= t - lo; tau++) {
      if (tau < 0) continue;
      const c = score[tau] - tightness * Math.log((t - tau) / p) ** 2;
      if (c > best) { best = c; arg = tau; }
    }
    score[t] = local[t] + (arg >= 0 && best > 0 ? best : 0);
    back[t] = arg >= 0 && best > 0 ? arg : -1;
  }
  // last beat: the last local maximum of the score within the final period that is reasonably strong
  const maxima: number[] = [];
  for (let t = 1; t < n - 1; t++) if (score[t] >= score[t - 1] && score[t] >= score[t + 1]) maxima.push(t);
  const thr = 0.5 * median(maxima.map((t) => score[t]));
  let end = n - 1;
  for (let i = maxima.length - 1; i >= 0; i--) if (score[maxima[i]] >= thr) { end = maxima[i]; break; }
  let lastWindowBest = end;
  for (let t = Math.max(0, end - Math.round(p)); t <= end; t++) if (score[t] > score[lastWindowBest]) lastWindowBest = t;
  const frames: number[] = [];
  for (let t = lastWindowBest; t >= 0; t = back[t]) { frames.push(t); if (back[t] < 0) break; }
  frames.reverse();
  // sub-frame refinement (parabolic peak of the local strength) and anchoring
  const strongThr = 0.3 * percentile(Array.from(frames, (t) => local[t]), 0.9);
  const beats = frames.map((t) => {
    let x = t;
    const a = local[t - 1] ?? local[t], b = local[t], c = local[t + 1] ?? local[t];
    const den = a - 2 * b + c;
    if (den < 0 && b >= a && b >= c) x = t + Math.max(-0.5, Math.min(0.5, (0.5 * (a - c)) / den));
    return { t: frameT(0) + (frameT(1) - frameT(0)) * x, strong: local[t] >= strongThr };
  });
  return regularizeGrid(beats, 60 / bpm, span ?? [frameT(0), frameT(n - 1)]);
}

/**
 * Keep the tracked grid where the music is clear; where it isn't (breakdowns, quiet intros), lay beats evenly
 * between the confident ones so the grid can't drift, and extend it to cover the audible part of the song.
 */
export function regularizeGrid(beats: Array<{ t: number; strong: boolean }>, period: number, span: [number, number]): number[] {
  const anchors = beats.filter((b) => b.strong).map((b) => b.t);
  if (anchors.length < 2) return beats.map((b) => round3(b.t));
  const out: number[] = [];
  // backwards from the first anchor to the start of sound
  const first = anchors[0];
  for (let k = Math.floor((first - span[0]) / period + 0.25); k >= 1; k--) out.push(first - k * period);
  for (let i = 0; i < anchors.length - 1; i++) {
    const a = anchors[i], b = anchors[i + 1], n = Math.max(1, Math.round((b - a) / period));
    for (let k = 0; k < n; k++) out.push(a + (k * (b - a)) / n);
  }
  const last = anchors[anchors.length - 1];
  for (let k = 0; last + k * period <= span[1] + period * 0.25; k++) out.push(last + k * period);
  return out.filter((t) => t >= 0).map(round3);
}
const round3 = (x: number) => Math.round(x * 1000) / 1000;
