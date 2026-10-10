import { describe, expect, it } from 'vitest';
import { analyzePcm } from '../analysis/analyze';
import { FFT } from '../analysis/fft';
import { label } from '../analysis/structure';
import { renderScore } from '../synth/render';
import { makeScore, type SynthStyle } from '../synth/score';
import { scoreAnalysis } from '../synth/truth';
import { ANALYSIS_SR } from '../types';

/** F-measure of estimated vs reference event times within ±tol. */
function fMeasure(est: number[], ref: number[], tol = 0.07): number {
  const used = new Set<number>(); let hit = 0;
  for (const t of est) {
    const j = ref.findIndex((r, i) => !used.has(i) && Math.abs(r - t) <= tol);
    if (j >= 0) { used.add(j); hit++; }
  }
  const p = hit / Math.max(1, est.length), r = hit / Math.max(1, ref.length);
  return p + r ? (2 * p * r) / (p + r) : 0;
}
const camelotNum = (c: string) => Number(c.slice(0, -1));

describe('FFT', () => {
  it('finds a sine at its bin', () => {
    const n = 1024, fft = new FFT(n), x = new Float32Array(n), out = new Float32Array(n / 2 + 1);
    for (let i = 0; i < n; i++) x[i] = Math.sin((2 * Math.PI * 37 * i) / n);
    fft.magnitudes(x, out);
    expect(out.indexOf(Math.max(...out))).toBe(37);
    expect(out[37]).toBeCloseTo(n / 2, 0);
  });
  it('rejects non power-of-two sizes', () => { expect(() => new FFT(1000)).toThrow(); });
});

describe('analysis vs synth ground truth', () => {
  const cases: Array<[SynthStyle, number]> = [['edm', 1], ['rock', 1], ['ambient', 2]];
  for (const [style, seed] of cases) {
    it(`${style} #${seed}: tempo, beats, bars, key, sections`, () => {
      const s = makeScore(style, seed), truth = scoreAnalysis(s);
      const a = analyzePcm(renderScore(s, ANALYSIS_SR), ANALYSIS_SR);
      expect(Math.abs(a.bpm - truth.bpm)).toBeLessThan(1);
      expect(fMeasure(a.beats, truth.beats)).toBeGreaterThan(0.95);
      expect(fMeasure(a.downbeats, truth.downbeats)).toBeGreaterThan(0.9);
      // same key, its relative, or a Camelot neighbour (all mix-compatible)
      const d = Math.abs(camelotNum(a.key.camelot) - camelotNum(truth.key.camelot)) % 12;
      expect(Math.min(d, 12 - d)).toBeLessThanOrEqual(1);
      // every true boundary has an estimated one within a bar, with the same label
      const bar = 240 / s.bpm;
      for (const ts of truth.sections.slice(1)) {
        const m = a.sections.find((x) => Math.abs(x.t0 - ts.t0) <= bar * 1.05);
        expect(m, `boundary ${ts.kind}@${ts.t0}`).toBeDefined();
        expect(m!.kind).toBe(ts.kind);
      }
      expect(a.sections.length).toBe(truth.sections.length);
      // curves cover the song and stay in range
      expect(a.intensity.length).toBe(Math.max(1, Math.round(a.durationS * 10)));
      expect(Math.max(...a.intensity)).toBeLessThanOrEqual(1);
      expect(Math.min(...a.intensity)).toBeGreaterThanOrEqual(0);
      // the low band sees the kicks and bass notes
      const kicks = [...new Set(truth.onsets.filter((o) => o.band === 0).map((o) => o.t))]; // kick + bass can share a time
      const lows = a.onsets.filter((o) => o.band === 0).map((o) => o.t);
      expect(fMeasure(lows, kicks, 0.05)).toBeGreaterThan(0.6);
      expect(atob(a.spec.data).length).toBe(Math.ceil(a.durationS * a.spec.hz) * a.spec.bands);
    }, 30_000); // renders and fully analyses a 2-3 min synth song: ~2.5 s locally, can pass 5 s on a busy CI runner
  }

  it('is deterministic', () => {
    const s = makeScore('edm', 4, { short: true }), pcm = renderScore(s, ANALYSIS_SR);
    expect(JSON.stringify(analyzePcm(pcm, ANALYSIS_SR))).toBe(JSON.stringify(analyzePcm(pcm, ANALYSIS_SR)));
  }, 30_000); // two full analyses of a short synth song: ~2 s locally

  it('copes with silence and very short clips', () => {
    const a = analyzePcm(new Float32Array(ANALYSIS_SR * 3), ANALYSIS_SR);
    expect(a.durationS).toBeCloseTo(3, 1);
    expect(a.sections.length).toBeGreaterThanOrEqual(1);
    expect(Number.isFinite(a.bpm)).toBe(true);
    const b = analyzePcm(new Float32Array(1000), ANALYSIS_SR);
    expect(b.sections.length).toBe(1);
  });
});

describe('section labels', () => {
  const curve = (levels: Array<[number, number]>) => levels.flatMap(([v, s]) => new Array(s * 10).fill(v));
  it('labels intro / build / drop / break / outro from energy', () => {
    // 10 s each: quiet, rising, loud, quiet, loud, fading
    const c = [...curve([[0.3, 10]]), ...Array.from({ length: 100 }, (_, i) => 0.4 + 0.4 * (i / 100)), ...curve([[0.95, 10], [0.15, 10], [0.95, 10], [0.35, 10]])];
    const spans = [0, 10, 20, 30, 40, 50].map((t0) => ({ t0, t1: t0 + 10 }));
    expect(label(spans, c, 10).map((s) => s.kind)).toEqual(['intro', 'build', 'drop', 'break', 'drop', 'outro']);
  });
  it('a chorus only a little louder than its verse is still the drop', () => {
    const c = curve([[0.4, 10], [0.76, 20], [0.91, 10], [0.2, 10], [0.93, 10], [0.1, 10]]);
    const spans = [[0, 10], [10, 30], [30, 40], [40, 50], [50, 60], [60, 70]].map(([t0, t1]) => ({ t0, t1 }));
    expect(label(spans, c, 10).map((s) => s.kind)).toEqual(['intro', 'verse', 'drop', 'break', 'drop', 'outro']);
  });
});
