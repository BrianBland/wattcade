import { ANALYSIS_VERSION, CURVE_HZ, type SongAnalysis } from '../types';
import { computeFrames, frameTime, type Frames } from './features';
import { detectOnsets, estimateTempo, onsetEnvelope, trackBeats } from './rhythm';
import { foldTempo } from './tempo';
import { beatFeatures, bandCurves, detectKey, type BeatFeature, findDownbeats, findPhrases, findSections, intensityCurve, previewSpectrogram } from './structure';

export interface AnalyzeOpts {
  /** Called with 0..1 between stages. */
  progress?: (p: number, stage: string) => void;
  /** Rolling windows: song tempo so far. The window's own estimate is folded onto its octave (no half/double flips). */
  tempoHint?: number;
  /** Rolling windows: receive compact per-beat features (the audio itself is not kept). */
  onBeatFeatures?: (b: BeatFeature[]) => void;
}

/** Full analysis of mono PCM (any rate; ANALYSIS_SR recommended). Pure and deterministic. */
export function analyzePcm(pcm: Float32Array, sr: number, opts: AnalyzeOpts = {}): SongAnalysis {
  const say = opts.progress ?? (() => {});
  const durationS = pcm.length / sr;
  say(0, 'spectrum');
  const f = computeFrames(pcm, sr);
  say(0.55, 'rhythm');
  const env = onsetEnvelope(f);
  const bpm = opts.tempoHint ? foldTempo(estimateTempo(env, f.rate), opts.tempoHint) : estimateTempo(env, f.rate);
  const beats = trackBeats(env, f.rate, bpm, (i) => frameTime(f, i), audibleSpan(f));
  if (opts.onBeatFeatures) opts.onBeatFeatures(beatFeatures(f, beats));
  const onsets = detectOnsets(f);
  say(0.75, 'structure');
  const downbeats = findDownbeats(f, beats);
  const intensity = intensityCurve(f, durationS, CURVE_HZ);
  const bands = bandCurves(f, durationS, CURVE_HZ);
  const sections = findSections(f, downbeats, intensity, CURVE_HZ, durationS);
  const phrases = findPhrases(downbeats, sections);
  const key = detectKey(f);
  const spec = previewSpectrogram(f, durationS);
  say(1, 'done');
  // tempo as games see it: the grid's average interval
  const gridBpm = beats.length > 8 ? (60 * (beats.length - 1)) / (beats[beats.length - 1] - beats[0]) : bpm;
  return {
    v: ANALYSIS_VERSION, durationS: Math.round(durationS * 1000) / 1000, bpm: Math.round(gridBpm * 100) / 100,
    beats, downbeats, phrases, onsets, intensity, bands, sections, key, spec, confidence: 'full',
  };
}

/** First and last moments that are within 50 dB of the loudest frame. */
export function audibleSpan(f: Frames): [number, number] {
  let max = -Infinity; for (let i = 0; i < f.count; i++) max = Math.max(max, f.energy[i]);
  const floor = max - 5; // energy is log10(power): 5 = 50 dB
  let a = 0, b = f.count - 1;
  while (a < b && f.energy[a] < floor) a++;
  while (b > a && f.energy[b] < floor) b--;
  return [frameTime(f, a), frameTime(f, b)];
}
