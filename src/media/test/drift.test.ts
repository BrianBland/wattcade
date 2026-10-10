import { describe, expect, it } from 'vitest';
import { concatFixtures, driftReport, matchEvents, replayRolling, seamsOf, silence } from '../online/drift';
import { estimatedAnalysis, foldTempo, mergeWindow, MIN_ESTIMATE_S } from '../online/rolling';
import { renderScore } from '../synth/render';
import { makeScore } from '../synth/score';
import { scoreAnalysis } from '../synth/truth';
import { ANALYSIS_SR } from '../types';

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
