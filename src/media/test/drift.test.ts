import { describe, expect, it } from 'vitest';
import { concatFixtures, driftReport, matchEvents, replayRolling, seamsOf, silence } from '../online/drift';
import { estimatedAnalysis, foldTempo, mergeWindow, MIN_ESTIMATE_S, retainedFeatureBytes, stitchSeam } from '../online/rolling';
import { beatIntensity, beatRuns } from '../analysis/structure';
import { renderScore } from '../synth/render';
import { makeScore } from '../synth/score';
import { scoreAnalysis } from '../synth/truth';
import { ANALYSIS_SR } from '../types';

// Rendering a full synth song costs ~0.4-0.7 s; several tests below reuse the same (style, seed), so render each once.
const rendered = new Map<string, { s: ReturnType<typeof makeScore>; truth: ReturnType<typeof scoreAnalysis>; pcm: Float32Array }>();
const song = (style: Parameters<typeof makeScore>[0], seed: number) => {
  const key = `${style}/${seed}`;
  if (!rendered.has(key)) { const s = makeScore(style, seed); rendered.set(key, { s, truth: scoreAnalysis(s), pcm: renderScore(s, ANALYSIS_SR) }); }
  return rendered.get(key)!;
};

const grid = (bpm: number, from: number, to: number) => { const out: number[] = []; for (let t = from; t < to; t += 60 / bpm) out.push(Math.round(t * 1000) / 1000); return out; };

describe('drift metrics', () => {
  it('matchEvents scores one-to-one within tolerance', () => {
    expect(matchEvents([1, 2, 3], [1, 2, 3]).f).toBe(1);
    expect(matchEvents([1, 1.01, 2], [1, 2]).hits).toBe(2);
    expect(matchEvents([1.2], [1]).f).toBe(0);
  });
  it('flags a duplicated beat and a phase jump at a seam, and passes a clean grid', () => {
    const ref = { bpm: 120, beats: grid(120, 0, 60), downbeats: grid(30, 0, 60), phrases: [] };
    const clean = driftReport({ beats: ref.beats, downbeats: ref.downbeats, phrases: [] }, ref, [30]);
    expect(clean.worstSeamIbiError).toBeLessThan(0.01); expect(clean.seams[0].barPhaseKept).toBe(true);
    const shifted = [...grid(120, 0, 30), ...grid(120, 30.04, 60), 29.75];
    const bad = driftReport({ beats: shifted.sort((a, b) => a - b), downbeats: ref.downbeats, phrases: [] }, ref, [30]);
    expect(bad.worstSeamIbiError).toBeGreaterThan(0.4);
    expect(bad.seams[0].phaseJumpS).toBeCloseTo(0.04, 2);
  });
  it('concatenates fixtures with shifted reference grids', () => {
    const c = concatFixtures([{ pcm: new Float32Array(10), ref: { beats: [0.1], downbeats: [], phrases: [] } }, { pcm: silence(1, 10) }, { pcm: new Float32Array(10), ref: { beats: [0.2], downbeats: [], phrases: [] } }], 10);
    expect(c.ref.beats).toEqual([0.1, 2.2]); expect(c.durationS).toBe(3);
    expect(seamsOf(65)).toEqual([30, 60]); expect(seamsOf(60)).toEqual([30]);
  });
});

describe('song-level tempo/key across windows', () => {
  it('folds half/double time onto the running estimate', () => {
    expect(foldTempo(58, 116)).toBeCloseTo(116); expect(foldTempo(240, 118)).toBeCloseTo(120); expect(foldTempo(100, 0)).toBe(100);
  });
  it('a short tail window no longer overwrites song BPM or key', () => {
    const t = estimatedAnalysis(61);
    const w = (bpm: number, camelot: string, confidence: number) => ({ ...estimatedAnalysis(34), bpm, key: { name: camelot, camelot, confidence } });
    mergeWindow(t, w(108, '8B', 0.8), 0, 0, 30);
    mergeWindow(t, w(216, '8B', 0.7), 28, 30, 60);   // double-time window folds back
    expect(t.bpm).toBeCloseTo(108, 0);
    mergeWindow(t, w(58.2, '3A', 0.9), 58, 60, 61);  // 1 s tail: ignored
    expect(t.bpm).toBeCloseTo(108, 0); expect(t.key.camelot).toBe('8B');
    expect(MIN_ESTIMATE_S).toBe(10);
    const only = estimatedAnalysis(5); mergeWindow(only, w(90, '1A', 0.5), 0, 0, 5); // a whole short song still gets an estimate
    expect(only.bpm).toBe(90); expect(only.key.camelot).toBe('1A');
  });
});

describe('rolling replay vs ground truth (short synth fixture)', () => {
  it('keeps beats and bar phase continuous across seams and the song BPM right', () => {
    const s = makeScore('rock', 1, { short: true }), truth = scoreAnalysis(s), pcm = renderScore(s, ANALYSIS_SR);
    const r = replayRolling(pcm, ANALYSIS_SR), dur = pcm.length / ANALYSIS_SR;
    const rep = driftReport(r.merged, truth, seamsOf(dur), r.windows.map((w) => w.bpm));
    expect(rep.beatF).toBeGreaterThan(0.95); expect(rep.seamBeatF).toBeGreaterThan(0.95);
    expect(rep.worstSeamIbiError).toBeLessThan(0.1);
    expect(rep.seams.every((x) => x.barPhaseKept !== false)).toBe(true);
    expect(Math.abs(r.merged.bpm - truth.bpm)).toBeLessThan(1);
  }, 60000);
});

describe('feature-accumulated rolling structure (#64 PR 2)', () => {
  const bf = (t: number) => ({ t, low: 0, energy: 0, loud: 0, act: 0, timbre: new Float32Array(12), chroma: new Float32Array(12) });
  it('stitchSeam drops a duplicate and fills one missing beat at a seam', () => {
    expect(stitchSeam([0, 0.5, 1.0, 1.1, 1.5].map(bf), 1.05, 0.5).map((b) => b.t)).toEqual([0, 0.5, 1.0, 1.5]);
    expect(stitchSeam([0, 0.5, 1.5, 2.0].map(bf), 1.2, 0.5).map((b) => b.t)).toEqual([0, 0.5, 1.0, 1.5, 2.0]);
    expect(stitchSeam([0, 0.5, 1.0].map(bf), 0.7, 0.5).map((b) => b.t)).toEqual([0, 0.5, 1.0]);
  });
  it('beatRuns splits at silence gaps and sustained tempo changes', () => {
    const a = grid(120, 0, 10), b = grid(120, 22, 30), c = grid(90, 30.5, 40);
    expect(beatRuns([...a, ...b]).length).toBe(2);
    expect(beatRuns([...a, ...c]).length).toBe(2);
    expect(beatRuns(grid(120, 0, 20))).toEqual([[0, 40]]);
  });
  const SONGS = [['edm', 1], ['rock', 1], ['ambient', 2], ['rock', 2]] as const;
  it.each(SONGS)('%s #%i: streamed phrase accuracy >= 0.85 with bar phase and BPM intact; features stay small', (style, seed) => {
    const { truth, pcm } = song(style, seed), dur = pcm.length / ANALYSIS_SR;
    const r = replayRolling(pcm, ANALYSIS_SR), rep = driftReport(r.merged, truth, seamsOf(dur));
    expect(rep.phraseF).toBeGreaterThanOrEqual(0.85);
    expect(rep.downbeatF).toBeGreaterThan(0.95);
    expect(rep.seamBeatF).toBeGreaterThan(0.95);
    expect(Math.abs(r.merged.bpm - truth.bpm)).toBeLessThan(1);
    expect(retainedFeatureBytes(r.merged)).toBeLessThan(64 * 1024);           // vs ~12 MB per decoded 34 s stereo window
    expect(r.merged.confidence).toBe('metadata');
  }, 120000);
  // Full-length songs: the short variants have 4-bar builds, below findSections' 8-bar minimum section length
  // (whole-file scores 0.40 on that fixture; song-global energy scores 0.76 there, per-window energy happened to score 0.97).
  it('silence between songs restarts the bar count (phrase accuracy >= 0.85)', () => {
    const mk = (seed: number) => { const { truth, pcm } = song('edm', seed); return { pcm, ref: truth }; };
    const a = mk(1), b = mk(3), c = concatFixtures([a, { pcm: silence(12, ANALYSIS_SR) }, b], ANALYSIS_SR);
    const r = replayRolling(c.pcm, ANALYSIS_SR), rep = driftReport(r.merged, { bpm: a.ref.bpm, ...c.ref }, seamsOf(c.durationS));
    expect(rep.downbeatF).toBeGreaterThan(0.95);
    expect(rep.phraseF).toBeGreaterThanOrEqual(0.85);
  }, 120000);
});

describe('song-global energy for streamed structure', () => {
  it('beatIntensity normalises over the whole song, not per window', () => {
    const beat = (t: number, loud: number) => ({ t, low: 0, energy: 0, loud, act: loud, timbre: new Float32Array(12), chroma: new Float32Array(12) });
    const bf = [...grid(120, 0, 30).map((t) => beat(t, -20)), ...grid(120, 30, 60).map((t) => beat(t, -5))];
    const c = beatIntensity(bf, 10, 62);
    expect(c).toHaveLength(620);
    expect(c[100]).toBeLessThan(0.2); expect(c[500]).toBeGreaterThan(0.8);   // quiet half stays quiet relative to the loud half
    expect(c[615]).toBe(0);                                                    // after the last beat (+2 periods): silent
  });
  it('tempo change inside one stream (121 -> 90 bpm): phrase accuracy >= 0.85', () => {
    const mk = (style: 'edm' | 'ambient', seed: number) => { const { truth, pcm } = song(style, seed); return { pcm, ref: truth }; };
    const a = mk('edm', 1), b = mk('ambient', 1), c = concatFixtures([a, b], ANALYSIS_SR);
    const r = replayRolling(c.pcm, ANALYSIS_SR), rep = driftReport(r.merged, { bpm: a.ref.bpm, ...c.ref }, seamsOf(c.durationS));
    expect(rep.phraseF).toBeGreaterThanOrEqual(0.85);
    expect(rep.downbeatF).toBeGreaterThan(0.9);
  }, 180000);
});
