import type { MediaSection, SectionKind } from '../../contracts';
import { MEL_BANDS, type Frames } from './features';
import { bandFlux } from './rhythm';
import { mean, nearestIndex, normalise, percentile, resampleSeries, smooth, std } from './util';

export const frameOf = (f: Frames, t: number) => Math.max(0, Math.min(f.count - 1, Math.round((t * f.sr - f.n / 2) / f.hop)));

export function chromaMean(f: Frames, t0: number, t1: number): number[] {
  const a = frameOf(f, t0), b = Math.max(a + 1, frameOf(f, t1));
  const c = new Array(12).fill(0);
  for (let i = a; i < b; i++) for (let k = 0; k < 12; k++) c[k] += f.chroma[i * 12 + k];
  const nrm = Math.hypot(...c) || 1;
  return c.map((v) => v / nrm);
}
export const cosine = (a: number[], b: number[]) => { let s = 0, na = 0, nb = 0; for (let i = 0; i < a.length; i++) { s += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; } return s / (Math.sqrt(na * nb) || 1); };

/**
 * Which beat of four starts the bar: kicks land on 1 (and 3), and chords change on 1 (not 3),
 * so score each phase by low-band flux plus harmonic change at its beats.
 */
export function findDownbeats(f: Frames, beats: number[]): number[] {
  if (beats.length < 8) return beats.filter((_, i) => i % 4 === 0);
  const low = smooth(bandFlux(f, 0), 3);
  const lowAt = beats.map((t) => low[frameOf(f, t)]);
  const harm = beats.map((t, i) => {
    if (i < 2 || i + 2 >= beats.length) return 0;
    return 1 - cosine(chromaMean(f, beats[i - 2], t), chromaMean(f, t, beats[i + 2]));
  });
  const z = (xs: number[]) => { const m = mean(xs), s = std(xs) || 1; return xs.map((x) => (x - m) / s); };
  const zl = z(lowAt), zh = z(harm);
  let best = 0, bestS = -Infinity;
  for (let ph = 0; ph < 4; ph++) {
    let s = 0, n = 0;
    for (let i = ph; i < beats.length; i += 4) { s += zl[i] + 1.5 * zh[i]; n++; }
    if (n && s / n > bestS) { bestS = s / n; best = ph; }
  }
  return beats.filter((_, i) => i % 4 === best);
}

// Krumhansl–Kessler key profiles
const MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
const NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
// Camelot wheel numbers by pitch class (C = 0)
const CAM_MAJOR = [8, 3, 10, 5, 12, 7, 2, 9, 4, 11, 6, 1];
const CAM_MINOR = [5, 12, 7, 2, 9, 4, 11, 6, 1, 8, 3, 10];

function pearson(a: number[], b: number[]): number {
  const ma = mean(a), mb = mean(b); let s = 0, sa = 0, sb = 0;
  for (let i = 0; i < a.length; i++) { s += (a[i] - ma) * (b[i] - mb); sa += (a[i] - ma) ** 2; sb += (b[i] - mb) ** 2; }
  return s / (Math.sqrt(sa * sb) || 1);
}

/** Key from the loudness-weighted mean chroma, matched against the 24 rotated key profiles. */
export function detectKey(f: Frames): { name: string; camelot: string; confidence: number } {
  const c = new Array(12).fill(0);
  for (let i = 0; i < f.count; i++) {
    const w = 10 ** f.energy[i];
    let s = 0; for (let k = 0; k < 12; k++) s += f.chroma[i * 12 + k];
    if (s <= 0) continue;
    for (let k = 0; k < 12; k++) c[k] += (w * f.chroma[i * 12 + k]) / s;
  }
  const scores: Array<{ pc: number; minor: boolean; r: number }> = [];
  for (let pc = 0; pc < 12; pc++) {
    const rot = (p: number[]) => p.map((_, k) => p[(k - pc + 12) % 12]);
    scores.push({ pc, minor: false, r: pearson(c, rot(MAJOR)) }, { pc, minor: true, r: pearson(c, rot(MINOR)) });
  }
  scores.sort((a, b) => b.r - a.r);
  const top = scores[0];
  return {
    name: `${NAMES[top.pc]} ${top.minor ? 'minor' : 'major'}`,
    camelot: `${(top.minor ? CAM_MINOR : CAM_MAJOR)[top.pc]}${top.minor ? 'A' : 'B'}`,
    confidence: Math.round(Math.max(0, top.r - scores[1].r) * 1000) / 1000,
  };
}

/** Overall energy curve at `hz`: 75 % loudness + 25 % onset activity, smoothed, normalised 0..1. */
export function intensityCurve(f: Frames, durationS: number, hz: number): number[] {
  const loud = smooth(Array.from(f.energy, (e) => 10 * e), Math.round(0.5 * f.rate));
  const act = new Float32Array(f.count);
  for (let i = 0; i < f.count; i++) act[i] = f.flux[i * 3] + f.flux[i * 3 + 1] + f.flux[i * 3 + 2];
  const actS = smooth(act, Math.round(2 * f.rate));
  const nl = normalise(loud, 0.02, 0.99), na = normalise(actS, 0.02, 0.99);
  const mix = new Float32Array(f.count);
  for (let i = 0; i < f.count; i++) mix[i] = 0.75 * nl[i] + 0.25 * na[i];
  return resampleSeries(normalise(mix, 0.01, 0.995), f.rate, hz, durationS, (f.n / 2) / f.sr).map((v) => Math.round(v * 1000) / 1000);
}

export function bandCurves(f: Frames, durationS: number, hz: number): [number[], number[], number[]] {
  const out = [0, 1, 2].map((b) => {
    const x = new Float32Array(f.count);
    for (let i = 0; i < f.count; i++) x[i] = f.bandEnergy[i * 3 + b];
    return resampleSeries(normalise(smooth(x, Math.round(0.3 * f.rate)), 0.05, 0.99), f.rate, hz, durationS, (f.n / 2) / f.sr).map((v) => Math.round(v * 1000) / 1000);
  });
  return out as [number[], number[], number[]];
}

/** DCT-II of a vector (MFCC from log mel). */
export function dct(x: number[], keep: number): number[] {
  const N = x.length, out: number[] = [];
  for (let k = 0; k < keep; k++) { let s = 0; for (let n = 0; n < N; n++) s += x[n] * Math.cos((Math.PI / N) * (n + 0.5) * k); out.push(s); }
  return out;
}

/** Sample a 10 Hz curve over [t0, t1). */
export function curveMean(curve: number[], hz: number, t0: number, t1: number): number {
  const a = Math.max(0, Math.floor(t0 * hz)), b = Math.min(curve.length, Math.max(a + 1, Math.ceil(t1 * hz)));
  let s = 0; for (let i = a; i < b; i++) s += curve[i];
  return b > a ? s / (b - a) : 0;
}

/**
 * Sections: bar-level timbre (MFCC-lite) + harmony (chroma) self-similarity → Foote novelty, plus an
 * energy-change novelty; peaks become boundaries (bar starts, ≥ 4 bars apart, prefer 4-bar grid).
 * Labelled from energy and trend.
 */
export function findSections(f: Frames, downbeats: number[], intensity: number[], hz: number, durationS: number): MediaSection[] {
  const bars = downbeats.length - 1;
  if (bars < 8) return label([{ t0: 0, t1: durationS }], intensity, hz);
  const feats: number[][] = [];
  for (let i = 0; i < bars; i++) {
    const a = frameOf(f, downbeats[i]), b = Math.max(a + 1, frameOf(f, downbeats[i + 1]));
    const mel = new Array(MEL_BANDS).fill(0);
    for (let j = a; j < b; j++) for (let m = 0; m < MEL_BANDS; m++) mel[m] += f.mel[j * MEL_BANDS + m] / (b - a);
    feats.push([...dct(mel, 13).slice(1), ...chromaMean(f, downbeats[i], downbeats[i + 1]).map((v) => v * 2)]);
  }
  return sectionsFromBarFeatures(feats, downbeats, intensity, hz, durationS);
}

/**
 * The boundary search behind findSections, from per-bar features (12 timbre + 12 chroma·2) only. Rolling analysis
 * calls it with bar features accumulated across windows (no audio kept). `feats` is z-normalised in place.
 */
export function sectionsFromBarFeatures(feats: number[][], downbeats: number[], intensity: number[], hz: number, durationS: number): MediaSection[] {
  const bars = feats.length;
  if (bars < 8) return label([{ t0: 0, t1: durationS }], intensity, hz);
  const energy: number[] = [];
  for (let i = 0; i < bars; i++) energy.push(curveMean(intensity, hz, downbeats[i], downbeats[i + 1]));
  // z-normalise each feature dimension across bars
  const D = feats[0].length;
  for (let d = 0; d < D; d++) {
    const col = feats.map((v) => v[d]), m = mean(col), s = std(col) || 1;
    for (const v of feats) v[d] = (v[d] - m) / s;
  }
  const S = feats.map((a) => feats.map((b) => cosine(a, b)));
  const K = 4;
  const foote = new Array(bars + 1).fill(0);
  for (let i = 1; i < bars; i++) {
    let s = 0;
    for (let u = -K; u < K; u++) for (let v = -K; v < K; v++) {
      const a = i + u, b = i + v;
      if (a < 0 || b < 0 || a >= bars || b >= bars) continue;
      const sign = (u < 0) === (v < 0) ? 1 : -1;
      const w = Math.exp(-0.5 * (((u + 0.5) / K) ** 2 + ((v + 0.5) / K) ** 2) * 2);
      s += sign * w * S[a][b];
    }
    foote[i] = Math.max(0, s);
  }
  const en = new Array(bars + 1).fill(0);
  for (let i = 1; i < bars; i++) {
    const prev = mean(energy.slice(Math.max(0, i - K), i)), next = mean(energy.slice(i, Math.min(bars, i + K)));
    en[i] = Math.abs(next - prev);
  }
  const nz = (xs: number[]) => { const hi = percentile(xs, 0.98) || 1; return xs.map((x) => Math.min(1, x / hi)); };
  const fN = nz(foote), eN = nz(en);
  const nov = fN.map((v, i) => 0.5 * v + 0.5 * eN[i]);
  // grid bonus: most boundaries fall on a 4-bar grid; find its phase from the strongest novelty
  const phaseScore = [0, 1, 2, 3].map((ph) => nov.reduce((s, v, i) => s + (i % 4 === ph ? v : 0), 0));
  const phase = phaseScore.indexOf(Math.max(...phaseScore));
  const scored = nov.map((v, i) => v * (i % 4 === phase ? 1 : 0.6));
  // peaks: local maxima that stand out from their surroundings (prominence), ≥ 8 bars apart, strongest first
  const cands = scored.map((v, i) => ({ i, v }))
    .filter(({ i, v }) => i >= 2 && i <= bars - 2 && v >= 0.12)
    .filter(({ i, v }) => scored.slice(Math.max(0, i - 2), i + 3).every((w) => w <= v))
    .filter(({ i, v }) => v - Math.min(...scored.slice(Math.max(0, i - 4), Math.min(scored.length, i + 5))) >= 0.08)
    .sort((a, b) => b.v - a.v);
  const chosen: number[] = [];
  for (const c of cands) if (chosen.every((j) => Math.abs(j - c.i) >= 8)) chosen.push(c.i);
  chosen.sort((a, b) => a - b);
  const cuts = [0, ...chosen.map((i) => downbeats[i]), durationS];
  const spans = cuts.slice(0, -1).map((t0, i) => ({ t0: i === 0 ? 0 : t0, t1: cuts[i + 1] }));
  return label(spans, intensity, hz);
}

/** Label spans from relative energy and trend. Exported for tests and metadata maps. */
export function label(spans: Array<{ t0: number; t1: number }>, intensity: number[], hz: number): MediaSection[] {
  const e = spans.map((s) => curveMean(intensity, hz, s.t0, s.t1));
  const lo = Math.min(...e), hi = Math.max(...e), span = hi - lo || 1;
  const rel = e.map((v) => (v - lo) / span);
  const slope = spans.map((s) => {
    const q = (s.t1 - s.t0) / 4;
    return curveMean(intensity, hz, s.t1 - q, s.t1) - curveMean(intensity, hz, s.t0, s.t0 + q);
  });
  const out: MediaSection[] = spans.map((s, i) => ({ t0: round3(s.t0), t1: round3(s.t1), kind: 'verse' as SectionKind, energy: round3(e[i]) }));
  const n = out.length;
  // drops are the top tier: near the loudest section and clearly above the song's typical level
  // (a chorus only a little louder than its verse still counts; a song that is loud throughout has few drops)
  const typical = [...e].sort((a, b) => a - b)[Math.floor(n / 2)];
  const isDrop = rel.map((r, i) => n > 1 && (r >= 0.85 || e[i] >= hi - 0.08) && (e[i] >= typical + 0.04 || r >= 0.97));
  for (let i = 0; i < n; i++) {
    let k: SectionKind = 'verse';
    if (isDrop[i]) k = 'drop';
    else if (i + 1 < n && isDrop[i + 1] && slope[i] > 0.08) k = 'build';
    else if (rel[i] <= 0.3 && i > 0 && i < n - 1) k = 'break';
    if (i === 0 && !isDrop[i]) k = 'intro';
    if (i === n - 1 && n > 1 && !isDrop[i]) k = 'outro';
    out[i].kind = k;
  }
  // one long loud stretch is one drop (and one verse is one verse): merge neighbours with the same label
  for (let i = out.length - 1; i > 0; i--) {
    const a = out[i - 1], b = out[i];
    if (a.kind !== b.kind) continue;
    const da = a.t1 - a.t0, db = b.t1 - b.t0;
    a.energy = round3((a.energy * da + b.energy * db) / (da + db)); a.t1 = b.t1;
    out.splice(i, 1);
  }
  return out;
}
const round3 = (x: number) => Math.round(x * 1000) / 1000;

/** Phrase starts: each section start, then every 8 bars inside it. */
export function findPhrases(downbeats: number[], sections: MediaSection[]): number[] {
  const out = new Set<number>();
  for (const s of sections) {
    let i = nearestIndex(downbeats, s.t0);
    if (i < 0) { out.add(s.t0); continue; }
    if (s.t0 === 0 && downbeats[i] > 0.5) out.add(0);
    for (; i < downbeats.length && downbeats[i] < s.t1 - 0.01; i += 8) out.add(downbeats[i]);
  }
  return [...out].sort((a, b) => a - b);
}

/** Coarse mel spectrogram (bytes, base64) for the picker's preview strip. */
export function previewSpectrogram(f: Frames, durationS: number, hz = 4, bands = 24): { hz: number; bands: number; data: string } {
  const cols = Math.max(1, Math.ceil(durationS * hz));
  const lo = percentile(f.mel, 0.05), hi = percentile(f.mel, 0.995), d = hi - lo || 1;
  const bytes = new Uint8Array(cols * bands);
  for (let c = 0; c < cols; c++) {
    const a = frameOf(f, c / hz), b = Math.max(a + 1, frameOf(f, (c + 1) / hz));
    for (let k = 0; k < bands; k++) {
      const m0 = Math.floor((k * MEL_BANDS) / bands), m1 = Math.max(m0 + 1, Math.floor(((k + 1) * MEL_BANDS) / bands));
      let s = 0, n = 0;
      for (let i = a; i < b && i < f.count; i++) for (let m = m0; m < m1; m++) { s += f.mel[i * MEL_BANDS + m]; n++; }
      bytes[c * bands + k] = Math.round(255 * Math.min(1, Math.max(0, (s / (n || 1) - lo) / d)));
    }
  }
  let bin = ''; for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return { hz, bands, data: btoa(bin) };
}

/** Compact per-beat features: all rolling structure analysis needs once the audio is gone (26 floats per beat). */
export const BEAT_FEATURE_DIMS = { timbre: 12, chroma: 12 } as const;
export interface BeatFeature { t: number; /** low-band flux at the beat */ low: number; /** peak log10 energy over the beat */ energy: number; timbre: Float32Array; chroma: Float32Array }

/** Per-beat features from frames: timbre (MFCC-lite over the beat), unnormalised chroma sum, low-band flux at the beat. */
export function beatFeatures(f: Frames, beats: number[]): BeatFeature[] {
  const low = smooth(bandFlux(f, 0), 3);
  return beats.map((t, i) => {
    const t1 = beats[i + 1] ?? t + (i > 0 ? t - beats[i - 1] : 0.5);
    const a = frameOf(f, t), b = Math.max(a + 1, frameOf(f, t1));
    const mel = new Array(MEL_BANDS).fill(0), chroma = new Float32Array(12); let energy = -Infinity;
    for (let j = a; j < b; j++) { energy = Math.max(energy, f.energy[j]); for (let m = 0; m < MEL_BANDS; m++) mel[m] += f.mel[j * MEL_BANDS + m] / (b - a); for (let k = 0; k < 12; k++) chroma[k] += f.chroma[j * 12 + k]; }
    return { t, low: low[a], energy, timbre: Float32Array.from(dct(mel, 13).slice(1)), chroma };
  });
}

/** Downbeats, sections and phrases from accumulated beat features (whole song so far), same scoring as the full-file path. */
export function structureFromBeats(bf: readonly BeatFeature[], intensity: number[], hz: number, durationS: number): { downbeats: number[]; sections: MediaSection[]; phrases: number[] } {
  const beats = bf.map((b) => b.t);
  if (beats.length < 8) { const downbeats = beats.filter((_, i) => i % 4 === 0), sections = label([{ t0: 0, t1: durationS }], intensity, hz); return { downbeats, sections, phrases: findPhrases(downbeats, sections) }; }
  const sumChroma = (i0: number, i1: number) => { const c = new Array(12).fill(0); for (let i = Math.max(0, i0); i < Math.min(bf.length, i1); i++) for (let k = 0; k < 12; k++) c[k] += bf[i].chroma[k]; const n = Math.hypot(...c) || 1; return c.map((v) => v / n); };
  const harm = bf.map((_, i) => (i < 2 || i + 2 >= bf.length ? 0 : 1 - cosine(sumChroma(i - 2, i), sumChroma(i, i + 2))));
  const z = (xs: number[]) => { const m = mean(xs), sd = std(xs) || 1; return xs.map((x) => (x - m) / sd); };
  const zl = z(bf.map((b) => b.low)), zh = z(harm);
  // Bar phase per beat run: a silence gap or a tempo change restarts the count (one global phase broke multi-song streams).
  const idx: number[] = [];
  const loud = Math.max(...bf.map((b) => b.energy)), silent = bf.map((b) => b.energy < loud - 4); // 40 dB below the loudest beat
  const audible: Array<[number, number]> = [];
  for (let i = 0; i < bf.length; i++) { if (silent[i]) continue; let j = i; while (j < bf.length && !silent[j]) j++; audible.push([i, j]); i = j; }
  const runs = audible.flatMap(([a, b]) => beatRuns(beats.slice(a, b)).map(([x, y]) => [a + x, a + y] as [number, number]));
  for (const [r0, r1] of runs) {
    let phase = 0, bestS = -Infinity;
    for (let ph = 0; ph < 4; ph++) { let s = 0, n = 0; for (let i = r0 + ph; i < r1; i += 4) { s += zl[i] + 1.5 * zh[i]; n++; } if (n && s / n > bestS) { bestS = s / n; phase = ph; } }
    for (let i = r0 + phase; i < r1; i += 4) idx.push(i);
  }
  const downbeats = idx.map((i) => beats[i]);
  const feats: number[][] = [];
  for (let k = 0; k + 1 < idx.length; k++) {
    const timbre = new Array(12).fill(0); const n = idx[k + 1] - idx[k];
    for (let i = idx[k]; i < idx[k + 1]; i++) for (let d = 0; d < 12; d++) timbre[d] += bf[i].timbre[d] / n;
    feats.push([...timbre, ...sumChroma(idx[k], idx[k + 1]).map((v) => v * 2)]);
  }
  const sections = sectionsFromBarFeatures(feats, downbeats, intensity, hz, durationS);
  return { downbeats, sections, phrases: findPhrases(downbeats, sections) };
}

/** Split a beat list into runs [start, end) at silence gaps (> 2.5 periods) and sustained tempo changes (> 8 % for 4 beats). */
export function beatRuns(beats: readonly number[]): Array<[number, number]> {
  const runs: Array<[number, number]> = []; let r0 = 0;
  const ibi = (i: number) => beats[i + 1] - beats[i];
  for (let i = 1; i < beats.length - 1; i++) {
    const prev = beats.slice(Math.max(r0, i - 8), i + 1), p = prev.length > 1 ? (prev[prev.length - 1] - prev[0]) / (prev.length - 1) : ibi(i - 1);
    const gap = ibi(i) > 2.5 * p;
    let change = false;
    if (!gap && i - r0 >= 8 && i + 4 < beats.length) { change = true; for (let k = i; k < i + 4; k++) if (Math.abs(ibi(k) / p - 1) <= 0.08) { change = false; break; } }
    if (gap || change) { runs.push([r0, i + 1]); r0 = i + 1; }
  }
  runs.push([r0, beats.length]);
  return runs.filter(([a, b]) => b > a);
}
