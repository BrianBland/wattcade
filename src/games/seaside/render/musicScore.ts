// The five music cues (#197), pure: small generative scores in the Lighthouse manner (no files, nothing to credit).
// `cueNotes(cue, beat)` lists the notes that start on that beat; `render/music.ts` schedules them on Web Audio.
import { SAMPLE_TRACKS, sampleCredit } from '../../../media/library/samples';
import type { CueId } from './soundMix';

export type Instrument = 'pad' | 'pluck' | 'bass' | 'bell' | 'pulse' | 'choir' | 'lead';
export interface Note { inst: Instrument; midi: number; /** beats */ dur: number; vol: number; /** beats after the beat */ at?: number }
interface Cue { bpm: number; chords: Array<[number, boolean, number?]>; layers: Array<(c: Chord, beat: number, bar: number) => Note[]> }
interface Chord { root: number; tones: number[] }

const triad = (root: number, minor: boolean, add?: number) => [root, root + (minor ? 3 : 4), root + 7, ...(add !== undefined ? [root + add] : [])];
const pad = (vol: number, octave = 0) => (c: Chord, beat: number) => beat % 4 === 0 ? c.tones.map((m) => ({ inst: 'pad' as const, midi: m + octave, dur: 4.2, vol })) : [];
const bassOn = (beats: number[], vol: number) => (c: Chord, beat: number) => beats.includes(beat % 4) ? [{ inst: 'bass' as const, midi: c.root - 24, dur: 0.9, vol }] : [];
const arp = (pattern: number[], vol: number, octave = 12) => (c: Chord, beat: number): Note[] => [0, 0.5].map((half, i) => {
  const k = pattern[((beat % 4) * 2 + i) % pattern.length], t = c.tones;
  return { inst: 'pluck' as const, midi: t[k % t.length] + octave + 12 * Math.floor(k / t.length), dur: 0.9, vol, at: half };
});
const bell = (everyBars: number, vol: number) => (c: Chord, beat: number, bar: number) =>
  beat % 4 === 0 && bar % everyBars === 0 ? [{ inst: 'bell' as const, midi: c.tones[2] + 24, dur: 3, vol }] : [];
const tune = (notes: Array<number | null>, vol: number) => (_c: Chord, beat: number): Note[] => {
  const n = notes[beat % notes.length];
  return n === null ? [] : [{ inst: 'lead' as const, midi: n, dur: 1.8, vol }];
};

export const CUES: Record<CueId, Cue> = {
  // morning on the coast: an easy pluck over warm chords, D major
  title: { bpm: 76, chords: [[62, false], [69, false], [71, true], [67, false, 11]], layers: [pad(0.05), bassOn([0, 2], 0.09), arp([0, 1, 2, 4, 2, 1, 3, 1], 0.05)] },
  // the Big One: a low pulse under a minor pad, tightening
  bigOne: { bpm: 96, chords: [[62, true], [58, false], [60, false], [62, true]], layers: [pad(0.05, -12), (c) => [0, 0.5].map((at) => ({ inst: 'pulse' as const, midi: c.root - 24, dur: 0.4, vol: 0.1, at })), bell(2, 0.03)] },
  // the island rising out of the sea: open, bright, bells
  island: { bpm: 70, chords: [[69, false], [64, false], [66, true], [62, false, 14]], layers: [pad(0.05), bassOn([0], 0.08), bell(1, 0.045), arp([2, 3, 5, 3], 0.03, 12)] },
  // the Earth swelling out of the black: slow, wide, a choir
  earth: { bpm: 54, chords: [[60, false, 11], [62, false], [60, false, 11], [57, true, 10]], layers: [pad(0.05), (c, beat) => beat % 4 === 0 ? c.tones.slice(0, 3).map((m) => ({ inst: 'choir' as const, midi: m + 12, dur: 4.5, vol: 0.03 })) : [], bell(2, 0.04)] },
  // the final lift-off into the sunset: the title's key, a tune at last
  liftoff: { bpm: 66, chords: [[62, false], [67, false], [64, true], [69, false]], layers: [pad(0.05), bassOn([0], 0.08), arp([0, 2, 4, 2], 0.03, 12),
    tune([78, null, 76, 74, 76, null, 79, null, 81, null, 79, 76, 74, null, null, null], 0.05)] },
};

export const beatS = (cue: CueId) => 60 / CUES[cue].bpm;

/** The notes starting on `beat` (0, 1, 2… from the cue's start). */
export function cueNotes(cue: CueId, beat: number): Note[] {
  const c = CUES[cue], bar = Math.floor(beat / 4), [root, minor, add] = c.chords[bar % c.chords.length];
  const chord = { root, tones: triad(root, minor, add) };
  return c.layers.flatMap((l) => l(chord, beat, bar));
}

export const mtof = (m: number) => 440 * 2 ** ((m - 69) / 12);

/** CC tracks that replace generated cues (keys into the media library's `SAMPLE_TRACKS`). Empty: every cue is generated.
 *  A track set here downloads on first use (the generated cue plays until it's ready) and is credited under the end title;
 *  record its licence in `docs/seaside/AUDIO.md`. */
export const CUE_TRACKS: Partial<Record<CueId, string>> = {};

/** Credit lines for the tracks in use, in cue order (none while every cue is generated). */
export function musicCredits(tracks: Partial<Record<CueId, string>> = CUE_TRACKS): string[] {
  const keys = (Object.keys(CUES) as CueId[]).map((c) => tracks[c]).filter((k): k is string => !!k);
  return [...new Set(keys)].map((k) => SAMPLE_TRACKS.find((t) => t.key === k)).filter((t) => !!t).map((t) => sampleCredit(t).text);
}
