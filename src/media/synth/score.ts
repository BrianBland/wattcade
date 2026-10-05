import type { SectionKind } from '../../contracts';
import { makeRng } from '../../core/rng';

/**
 * Procedural songs with known ground truth (tempo, beats, bars, sections, key). Used by fake mode,
 * headless scenarios and the analysis tests. `score` is pure data; `render.ts` turns it into PCM.
 */
export type SynthStyle = 'edm' | 'rock' | 'ambient';
export const SYNTH_STYLES: readonly SynthStyle[] = ['edm', 'rock', 'ambient'];

export type Inst = 'kick' | 'snare' | 'hat' | 'crash' | 'bass' | 'pad' | 'lead' | 'riser';
export interface Note { t: number; inst: Inst; f: number; dur: number; vel: number }

export interface SynthSection {
  kind: SectionKind; bars: number; energy: number;
  kick: 'four' | 'rock' | 'half' | 'none'; snare: 'backbeat' | 'roll' | 'none'; hats: 'off' | '8th' | '16th' | 'none';
  bass: boolean; pad: boolean; lead: boolean; riser: boolean;
}

export interface SynthScore {
  id: string; style: SynthStyle; seed: number; title: string; artist: string;
  bpm: number; keyPc: number; minor: boolean; leadInS: number;
  sections: SynthSection[];
}

const S = (kind: SectionKind, bars: number, energy: number, p: Partial<SynthSection>): SynthSection => ({
  kind, bars, energy, kick: 'none', snare: 'none', hats: 'none', bass: false, pad: false, lead: false, riser: false, ...p,
});

const WORDS_A = ['Neon', 'Velvet', 'Static', 'Solar', 'Midnight', 'Crystal', 'Paper', 'Iron', 'Electric', 'Silver', 'Hollow', 'Golden'];
const WORDS_B = ['Engines', 'Rivers', 'Signals', 'Horizons', 'Echoes', 'Lanterns', 'Circuits', 'Tides', 'Satellites', 'Gardens', 'Pulses', 'Skylines'];
const ARTISTS = ['The Synthetics', 'Fake Bike Band', 'Crank Collective', 'Watt Theory', 'Sine Sisters', 'DJ Cadence'];

export function makeScore(style: SynthStyle, seed: number, opts: { short?: boolean } = {}): SynthScore {
  const rng = makeRng(seed * 7 + SYNTH_STYLES.indexOf(style) + 1);
  const pick = <T,>(xs: readonly T[]) => xs[Math.floor(rng() * xs.length)];
  const k = opts.short ? 0.5 : 1;
  const b = (n: number) => Math.max(4, Math.round(n * k));
  let bpm: number, minor: boolean, sections: SynthSection[];
  if (style === 'edm') {
    bpm = 120 + Math.floor(rng() * 9); minor = true;
    sections = [
      S('intro', b(16), 0.35, { kick: 'four', hats: 'off', pad: true }),
      S('build', b(8), 0.55, { snare: 'roll', hats: '8th', pad: true, riser: true }),
      S('drop', b(16), 1, { kick: 'four', snare: 'backbeat', hats: '16th', bass: true, pad: true, lead: true }),
      S('break', b(16), 0.22, { pad: true }),
      S('build', b(8), 0.55, { snare: 'roll', hats: '8th', pad: true, riser: true }),
      S('drop', b(16), 1, { kick: 'four', snare: 'backbeat', hats: '16th', bass: true, pad: true, lead: true }),
      S('outro', b(16), 0.4, { kick: 'four', hats: 'off', pad: true }),
    ];
  } else if (style === 'rock') {
    bpm = 100 + Math.floor(rng() * 41); minor = false;
    sections = [
      S('intro', 4, 0.4, { kick: 'rock', snare: 'backbeat', hats: '8th', pad: true }),
      S('verse', b(16), 0.55, { kick: 'rock', snare: 'backbeat', hats: '8th', bass: true, pad: true }),
      S('drop', b(8), 0.92, { kick: 'rock', snare: 'backbeat', hats: '16th', bass: true, pad: true, lead: true }),
      S('verse', b(16), 0.55, { kick: 'rock', snare: 'backbeat', hats: '8th', bass: true, pad: true }),
      S('drop', b(8), 0.92, { kick: 'rock', snare: 'backbeat', hats: '16th', bass: true, pad: true, lead: true }),
      S('break', b(8), 0.3, { kick: 'half', hats: '8th', pad: true }),
      S('drop', b(16), 1, { kick: 'rock', snare: 'backbeat', hats: '16th', bass: true, pad: true, lead: true }),
      S('outro', 4, 0.4, { kick: 'half', pad: true }),
    ];
  } else {
    bpm = 84 + Math.floor(rng() * 13); minor = rng() < 0.5;
    sections = [
      S('intro', b(8), 0.25, { pad: true, hats: '8th' }),
      S('verse', b(16), 0.5, { kick: 'half', hats: '8th', bass: true, pad: true }),
      S('drop', b(16), 0.85, { kick: 'four', snare: 'backbeat', hats: '8th', bass: true, pad: true, lead: true }),
      S('outro', b(8), 0.3, { pad: true, hats: '8th' }),
    ];
  }
  return {
    id: `synth:${style}:${seed}${opts.short ? ':s' : ''}`, style, seed,
    title: `${pick(WORDS_A)} ${pick(WORDS_B)}`, artist: pick(ARTISTS),
    bpm, keyPc: Math.floor(rng() * 12), minor, leadInS: 0.25, sections,
  };
}

export const beatS = (s: SynthScore) => 60 / s.bpm;
export const barS = (s: SynthScore) => 240 / s.bpm;
export const scoreBars = (s: SynthScore) => s.sections.reduce((n, x) => n + x.bars, 0);
/** Song length: lead-in, all bars, plus a 2 s tail. */
export const scoreDuration = (s: SynthScore) => s.leadInS + scoreBars(s) * barS(s) + 2;

const midiHz = (m: number) => 440 * 2 ** ((m - 69) / 12);
/** Chord roots (scale degrees in semitones) per bar: minor i–VI–III–VII, major I–V–vi–IV. */
function progression(minor: boolean): Array<{ root: number; third: number }> {
  return minor
    ? [{ root: 0, third: 3 }, { root: 8, third: 4 }, { root: 3, third: 4 }, { root: 10, third: 4 }]
    : [{ root: 0, third: 4 }, { root: 7, third: 4 }, { root: 9, third: 3 }, { root: 5, third: 4 }];
}

/** Every note in the song, in time order. Deterministic for a score. */
export function scoreNotes(s: SynthScore): Note[] {
  const notes: Note[] = [];
  const bt = beatS(s), prog = progression(s.minor);
  let bar = 0;
  for (const sec of s.sections) {
    for (let j = 0; j < sec.bars; j++, bar++) {
      const t0 = s.leadInS + bar * 4 * bt;
      const ch = prog[bar % 4];
      const rootM = 36 + ((s.keyPc + ch.root) % 12);
      const progress = j / sec.bars;
      if (sec.kick === 'four') for (let q = 0; q < 4; q++) notes.push({ t: t0 + q * bt, inst: 'kick', f: 0, dur: 0.3, vel: 1 });
      if (sec.kick === 'rock') for (const q of [0, 2, 2.5]) notes.push({ t: t0 + q * bt, inst: 'kick', f: 0, dur: 0.3, vel: q === 0 ? 1 : 0.85 });
      if (sec.kick === 'half') notes.push({ t: t0, inst: 'kick', f: 0, dur: 0.3, vel: 0.9 });
      if (sec.snare === 'backbeat') for (const q of [1, 3]) notes.push({ t: t0 + q * bt, inst: 'snare', f: 0, dur: 0.2, vel: 0.9 });
      if (sec.snare === 'roll') {
        const per = progress < 0.5 ? 1 : progress < 0.75 ? 2 : 4;
        for (let q = 0; q < 4 * per; q++) notes.push({ t: t0 + (q * bt) / per, inst: 'snare', f: 0, dur: 0.12, vel: 0.5 + 0.4 * progress });
      }
      const hatStep = sec.hats === '16th' ? 0.25 : sec.hats === '8th' ? 0.5 : sec.hats === 'off' ? 1 : 0;
      const offbeatHats = s.style === 'edm';
      if (hatStep) for (let q = sec.hats === 'off' ? 0.5 : 0; q < 4; q += hatStep) notes.push({ t: t0 + q * bt, inst: 'hat', f: 0, dur: 0.05, vel: (q % 1 === 0.5) === offbeatHats ? 0.6 : 0.4 });
      if (j === 0 && sec.kind === 'drop') notes.push({ t: t0, inst: 'crash', f: 0, dur: 1.5, vel: 0.7 });
      // EDM: off-beat bass; rock/ambient: root on the beat (rock adds the 8ths between)
      if (sec.bass) {
        const steps = s.style === 'edm' ? [0.5, 1.5, 2.5, 3.5] : s.style === 'rock' ? [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5] : [0, 2];
        for (const q of steps) notes.push({ t: t0 + q * bt, inst: 'bass', f: midiHz(rootM), dur: bt * 0.45, vel: q % 1 === 0 ? 0.9 : 0.6 });
      }
      if (sec.pad) for (const iv of [0, ch.third, 7]) notes.push({ t: t0, inst: 'pad', f: midiHz(rootM + 24 + iv), dur: 4 * bt, vel: 0.5 });
      if (sec.lead) {
        const arp = [0, ch.third, 7, 12];
        for (let q = 0; q < 16; q++) notes.push({ t: t0 + (q * bt) / 4, inst: 'lead', f: midiHz(rootM + 48 + arp[q % 4]), dur: bt / 5, vel: 0.5 });
      }
      if (sec.riser && j === 0) notes.push({ t: t0, inst: 'riser', f: 0, dur: sec.bars * 4 * bt, vel: 0.6 });
    }
  }
  return notes.sort((a, b) => a.t - b.t);
}
