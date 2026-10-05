import type { MediaOnset, MediaSection } from '../../contracts';
import { ANALYSIS_VERSION, CURVE_HZ, type SongAnalysis } from '../types';
import { findPhrases } from '../analysis/structure';
import { barS, beatS, scoreBars, scoreDuration, scoreNotes, type SynthScore } from './score';

const NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
const CAM_MAJOR = [8, 3, 10, 5, 12, 7, 2, 9, 4, 11, 6, 1];
const CAM_MINOR = [5, 12, 7, 2, 9, 4, 11, 6, 1, 8, 3, 10];
const r3 = (x: number) => Math.round(x * 1000) / 1000;

/** Section spans (seconds) of a score; the first starts at 0 and the last runs to the end of the file. */
export function scoreSections(s: SynthScore): MediaSection[] {
  const out: MediaSection[] = [];
  let bar = 0;
  const dur = scoreDuration(s);
  s.sections.forEach((sec, i) => {
    const t0 = i === 0 ? 0 : s.leadInS + bar * barS(s);
    bar += sec.bars;
    const t1 = i === s.sections.length - 1 ? dur : s.leadInS + bar * barS(s);
    out.push({ t0: r3(t0), t1: r3(t1), kind: sec.kind, energy: sec.energy });
  });
  return out;
}

/**
 * The exact analysis of a synth score, straight from the notes (no audio). Headless runs use this, and the
 * analysis tests compare the real pipeline against it.
 */
export function scoreAnalysis(s: SynthScore): SongAnalysis {
  const dur = scoreDuration(s), bt = beatS(s), bars = scoreBars(s);
  const beats: number[] = [], downbeats: number[] = [];
  for (let i = 0; i < bars * 4; i++) { const t = r3(s.leadInS + i * bt); beats.push(t); if (i % 4 === 0) downbeats.push(t); }
  const sections = scoreSections(s);
  const band: Record<string, 0 | 1 | 2> = { kick: 0, bass: 0, snare: 1, pad: 1, lead: 1, hat: 2, crash: 2, riser: 2 };
  const onsets: MediaOnset[] = scoreNotes(s).filter((n) => n.inst !== 'riser').map((n) => ({ t: r3(n.t), band: band[n.inst], s: r3(Math.min(1, n.vel)) }));
  // curves: section energy, builds ramp up to the next section, light per-beat pulse
  const N = Math.ceil(dur * CURVE_HZ);
  const intensity: number[] = [], low: number[] = [], mid: number[] = [], high: number[] = [];
  for (let i = 0; i < N; i++) {
    const t = i / CURVE_HZ;
    const k = Math.max(0, sections.findIndex((x) => t >= x.t0 && t < x.t1));
    const sec = s.sections[k] ?? s.sections[s.sections.length - 1], span = sections[k] ?? sections[sections.length - 1];
    let e = sec.energy;
    if (sec.kind === 'build' && s.sections[k + 1]) e += (s.sections[k + 1].energy - e) * 0.6 * ((t - span.t0) / (span.t1 - span.t0));
    intensity.push(r3(e));
    low.push(r3((sec.kick !== 'none' ? 0.6 : 0) + (sec.bass ? 0.4 : 0)));
    mid.push(r3((sec.snare !== 'none' ? 0.4 : 0) + (sec.pad ? 0.5 : 0) * sec.energy + 0.1));
    high.push(r3((sec.hats === '16th' ? 0.6 : sec.hats !== 'none' ? 0.35 : 0) + (sec.lead ? 0.3 : 0) + (sec.riser ? 0.3 * ((t - span.t0) / (span.t1 - span.t0)) : 0)));
  }
  // a tiny synthetic spectrogram so previews have something to draw
  const hz = 4, nb = 24, cols = Math.ceil(dur * hz), bytes = new Uint8Array(cols * nb);
  for (let c = 0; c < cols; c++) {
    const j = Math.min(N - 1, Math.floor((c / hz) * CURVE_HZ));
    for (let b = 0; b < nb; b++) {
      const v = b < 5 ? low[j] : b < 16 ? mid[j] : high[j];
      bytes[c * nb + b] = Math.round(255 * Math.min(1, v * (0.6 + 0.4 * intensity[j]) * (1 - b / 48)));
    }
  }
  let bin = ''; for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return {
    v: ANALYSIS_VERSION, durationS: r3(dur), bpm: s.bpm, beats, downbeats, phrases: findPhrases(downbeats, sections), onsets,
    intensity, bands: [low, mid, high], sections,
    key: { name: `${NAMES[s.keyPc]} ${s.minor ? 'minor' : 'major'}`, camelot: `${(s.minor ? CAM_MINOR : CAM_MAJOR)[s.keyPc]}${s.minor ? 'A' : 'B'}`, confidence: 1 },
    spec: { hz, bands: nb, data: btoa(bin) }, confidence: 'full',
  };
}
