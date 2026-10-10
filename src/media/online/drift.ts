import { analyzePcm } from '../analysis/analyze';
import { CURVE_HZ, type SongAnalysis } from '../types';
import { CHUNK_S, CONTEXT_S, estimatedAnalysis, mergeWindow } from './rolling';

/**
 * Seam-drift measurement for rolling (windowed) analysis (#64). Pure, deterministic, no DOM.
 * Replays exactly what RollingQueue does (CHUNK_S windows with CONTEXT_S context, merged by mergeWindow)
 * on mono PCM, and scores the result against a reference beat/downbeat/phrase grid.
 */
export interface RollingReplay { merged: SongAnalysis; windows: Array<{ start: number; end: number; bpm: number }> }

export function replayRolling(pcm: Float32Array, sr: number, o: { chunkS?: number; contextS?: number } = {}): RollingReplay {
  const chunk = o.chunkS ?? CHUNK_S, context = o.contextS ?? CONTEXT_S, dur = pcm.length / sr;
  const merged = estimatedAnalysis(dur), windows: RollingReplay['windows'] = [];
  for (let start = 0; start < dur - 1e-6; start += chunk) {
    const end = Math.min(dur, start + chunk), b0 = Math.max(0, start - context), b1 = Math.min(dur, end + context);
    const a = analyzePcm(pcm.subarray(Math.round(b0 * sr), Math.round(b1 * sr)), sr);
    mergeWindow(merged, a, b0, start, end);
    windows.push({ start, end, bpm: a.bpm });
  }
  return { merged, windows };
}

/** Greedy one-to-one matching within ±tol; returns F-measure and signed offsets of matched estimates. */
export function matchEvents(est: readonly number[], ref: readonly number[], tol = 0.07): { f: number; hits: number; offsets: number[] } {
  const used = new Set<number>(), offsets: number[] = [];
  for (const t of est) {
    let best = -1;
    for (let i = 0; i < ref.length; i++) if (!used.has(i) && Math.abs(ref[i] - t) <= tol && (best < 0 || Math.abs(ref[i] - t) < Math.abs(ref[best] - t))) best = i;
    if (best >= 0) { used.add(best); offsets.push(t - ref[best]); }
  }
  const p = offsets.length / Math.max(1, est.length), r = offsets.length / Math.max(1, ref.length);
  return { f: p + r ? (2 * p * r) / (p + r) : 0, hits: offsets.length, offsets };
}

export interface SeamReport {
  seam: number;
  /** Beat F-measure within ±radius of the seam. */
  beatF: number;
  /** Inter-beat intervals touching the seam, as a ratio of the reference period (1 = seamless; ~0.5 duplicate, ~2 gap). */
  seamIbiRatio: number | null;
  /** Mean signed beat offset (s) just before vs just after the seam (phase jump). */
  phaseJumpS: number | null;
  /** Did the downbeat (bar) phase survive the seam? null when no downbeats near it. */
  barPhaseKept: boolean | null;
}
export interface DriftReport {
  beatF: number; downbeatF: number; phraseF: number;
  /** Beat F-measure away from seams vs near seams. */
  interiorBeatF: number; seamBeatF: number;
  /** Per-window BPM relative to the reference (1 = right; 0.5/2 = half/double-time). */
  windowBpmRatios: number[];
  seams: SeamReport[];
  /** Worst |seamIbiRatio - 1| across seams. */
  worstSeamIbiError: number;
}

/** Score a (merged) analysis against reference grids. `seams` are the window boundaries to inspect. */
export function driftReport(a: Pick<SongAnalysis, 'beats' | 'downbeats' | 'phrases'>, ref: { bpm: number; beats: number[]; downbeats: number[]; phrases: number[] },
  seams: number[], windowBpms: number[] = [], radius = 2, tol = 0.07): DriftReport {
  const period = 60 / ref.bpm, near = (t: number) => seams.some((s) => Math.abs(t - s) <= radius);
  const sel = (xs: readonly number[], f: (t: number) => boolean) => xs.filter(f);
  const seamReports = seams.map((seam): SeamReport => {
    const inR = (t: number) => Math.abs(t - seam) <= radius;
    const est = sel(a.beats, inR), rf = sel(ref.beats, inR);
    const i = a.beats.findIndex((t) => t >= seam);
    let ibi: number | null = null;
    if (i > 0) { const around = [a.beats[i] - a.beats[i - 1], ...(a.beats[i + 1] !== undefined ? [a.beats[i + 1] - a.beats[i]] : [])]; ibi = around.reduce((w, x) => (Math.abs(x / period - 1) > Math.abs(w / period - 1) ? x : w)) / period; }
    const off = (lo: number, hi: number) => { const m = matchEvents(sel(a.beats, (t) => t >= lo && t < hi), sel(ref.beats, (t) => t >= lo - tol && t < hi + tol), tol).offsets; return m.length ? m.reduce((x, y) => x + y, 0) / m.length : null; };
    const pre = off(seam - radius, seam), post = off(seam, seam + radius);
    const db = (lo: number, hi: number) => sel(a.downbeats, (t) => t >= lo && t < hi);
    const pre2 = db(seam - 4 * period * 2, seam), post2 = db(seam, seam + 4 * period * 2);
    const onBar = (t: number) => ref.downbeats.some((r) => Math.abs(r - t) <= tol * 2);
    const kept = pre2.length && post2.length ? pre2.every(onBar) === post2.every(onBar) && post2.every(onBar) : null;
    return { seam, beatF: matchEvents(est, rf, tol).f, seamIbiRatio: ibi, phaseJumpS: pre !== null && post !== null ? post - pre : null, barPhaseKept: kept };
  });
  return {
    beatF: matchEvents(a.beats, ref.beats, tol).f,
    downbeatF: matchEvents(a.downbeats, ref.downbeats, tol * 2).f,
    phraseF: matchEvents(a.phrases, ref.phrases, tol * 4).f,
    interiorBeatF: matchEvents(sel(a.beats, (t) => !near(t)), sel(ref.beats, (t) => !near(t)), tol).f,
    seamBeatF: matchEvents(sel(a.beats, near), sel(ref.beats, near), tol).f,
    windowBpmRatios: windowBpms.map((b) => Math.round((b / ref.bpm) * 1000) / 1000),
    seams: seamReports,
    worstSeamIbiError: Math.max(0, ...seamReports.map((s) => (s.seamIbiRatio === null ? 0 : Math.abs(s.seamIbiRatio - 1)))),
  };
}

/** Concatenate mono PCM fixtures (e.g. tempo change, inserted silence) and shift their reference grids. */
export function concatFixtures(parts: Array<{ pcm: Float32Array; ref?: { beats: number[]; downbeats: number[]; phrases: number[] } }>, sr: number) {
  const total = parts.reduce((n, p) => n + p.pcm.length, 0), pcm = new Float32Array(total);
  const ref = { beats: [] as number[], downbeats: [] as number[], phrases: [] as number[] };
  let off = 0;
  for (const p of parts) {
    pcm.set(p.pcm, off); const t0 = off / sr;
    if (p.ref) for (const k of ['beats', 'downbeats', 'phrases'] as const) ref[k].push(...p.ref[k].map((t) => t + t0));
    off += p.pcm.length;
  }
  return { pcm, ref, durationS: total / sr };
}
export const silence = (s: number, sr: number) => new Float32Array(Math.round(s * sr));
export const seamsOf = (durationS: number, chunkS = CHUNK_S) => Array.from({ length: Math.max(0, Math.ceil(durationS / chunkS - 1e-6) - 1) }, (_, i) => (i + 1) * chunkS);
export { CURVE_HZ };
