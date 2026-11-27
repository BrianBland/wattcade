// Pure procedural dungeon music scores for Purgatour: 7 themes (camp, 4 dungeon zones, boss, victory).
// Zero browser dependencies so scores and cue selection are fully unit-tested in Node.
import type { DungeonSnapshot } from '../sim/types';

export type DungeonCue = 'camp' | 'keep' | 'catacombs' | 'crypt' | 'deep' | 'boss' | 'victory';
export type DungeonInst = 'bass' | 'pluck' | 'lead' | 'pad' | 'bell' | 'brass' | 'kick' | 'snare' | 'hat';

export interface ScoreNote {
  inst: DungeonInst;
  midi: number;     // ignored for noise-only drums (snare/hat)
  dur: number;      // beats
  vol: number;      // 0..1 relative gain
  at?: number;      // sub-beat offset in [0, 1)
}

export interface MusicWant {
  cue: DungeonCue;
  gain: number;
  tempoScale: number;
}

const ZONE_CUES: readonly DungeonCue[] = ['keep', 'crypt', 'catacombs', 'deep'];

/** Base BPM per theme. */
export const CUE_BPM: Record<DungeonCue, number> = {
  camp: 92,
  keep: 118,
  catacombs: 122,
  crypt: 124,
  deep: 130,
  boss: 142,
  victory: 132,
};

export const mtof = (midi: number): number => 440 * Math.pow(2, (midi - 69) / 12);
export const beatS = (cue: DungeonCue, tempoScale = 1): number => 60 / (CUE_BPM[cue] * Math.max(0.75, Math.min(1.25, tempoScale)));

/** Pick the active soundtrack cue, gain, and tempo scale from a snapshot. Pure. */
export function musicFor(s: DungeonSnapshot): MusicWant | null {
  if (!s.world) return null;
  if (s.phase === 'camp') {
    if (s.camp?.lastRun?.won) return { cue: 'victory', gain: 0.24, tempoScale: 1 };
    return { cue: 'camp', gain: 0.18, tempoScale: 1 };
  }
  if (s.perks?.offer) return { cue: 'camp', gain: 0.16, tempoScale: 1.06 };
  if (s.boss?.active) {
    const phaseScale = s.boss.phase >= 3 ? 1.1 : s.boss.phase === 2 ? 1.05 : 1;
    const exposedBoost = s.boss.cycle === 'exposed' ? 0.04 : 0;
    return { cue: 'boss', gain: 0.26 + exposedBoost, tempoScale: phaseScale };
  }
  if (s.hooks.seg === 'ambush') return { cue: 'boss', gain: 0.22, tempoScale: 0.96 };
  if (s.stairsOpen && s.run?.final) return { cue: 'victory', gain: 0.26, tempoScale: 1.04 };
  const zoneCue = ZONE_CUES[s.world.theme % ZONE_CUES.length] ?? 'keep';
  const tempoScale = s.hooks.seg === 'spinup' ? 1.08 : s.hooks.seg === 'cooldown' || s.hooks.seg === 'recover' ? 0.94 : 1;
  return { cue: zoneCue, gain: 0.2, tempoScale };
}

// ---------- Score patterns (16-beat = 4-bar phrases in 4/4, cycling seamlessly) ----------

function campNotes(beat: number): ScoreNote[] {
  // Warm hearth lute/harp arpeggio in D Dorian (Dm7 - G7 - Cmaj7 - Am7)
  const b = beat % 16, bar = Math.floor(b / 4), step = b % 4;
  const roots = [50, 43, 48, 45];
  const chords = [[62, 65, 69, 72], [59, 62, 67, 71], [60, 64, 67, 71], [57, 60, 64, 69]];
  const out: ScoreNote[] = [];
  if (step === 0) out.push({ inst: 'pad', midi: roots[bar], dur: 3.8, vol: 0.18 });
  const c = chords[bar];
  out.push({ inst: 'pluck', midi: c[step], dur: 0.9, vol: 0.14 });
  out.push({ inst: 'pluck', midi: c[(step + 2) % 4], dur: 0.7, vol: 0.09, at: 0.5 });
  if (b === 6 || b === 14) out.push({ inst: 'bell', midi: c[3] + 12, dur: 1.5, vol: 0.07, at: 0.5 });
  return out;
}

function keepNotes(beat: number): ScoreNote[] {
  // Heroic torchlit dungeon march in D minor (Dm - Bb - C - A)
  const b = beat % 16, bar = Math.floor(b / 4), step = b % 4;
  const bass = [38, 34, 36, 33];
  const mel = [62, 0, 65, 67, 69, 0, 67, 65, 64, 0, 67, 64, 62, 64, 61, 0];
  const out: ScoreNote[] = [
    { inst: 'bass', midi: bass[bar], dur: 0.45, vol: 0.26 },
    { inst: 'bass', midi: bass[bar] + 12, dur: 0.35, vol: 0.15, at: 0.5 },
    { inst: 'hat', midi: 0, dur: 0.1, vol: step % 2 ? 0.08 : 0.05, at: 0.5 },
  ];
  if (step === 0 || step === 2) out.push({ inst: 'kick', midi: 42, dur: 0.18, vol: 0.25 });
  if (step === 1 || step === 3) out.push({ inst: 'snare', midi: 0, dur: 0.12, vol: 0.12 });
  if (mel[b]) out.push({ inst: 'pluck', midi: mel[b], dur: 0.85, vol: 0.18 });
  if (step === 0) out.push({ inst: 'pad', midi: bass[bar] + 12, dur: 3.6, vol: 0.11 });
  return out;
}

function catacombsNotes(beat: number): ScoreNote[] {
  // Eerie rattling ostinato in E Phrygian (Em - F - G - F)
  const b = beat % 16, bar = Math.floor(b / 4), step = b % 4;
  const roots = [40, 41, 43, 41];
  const arp = [[52, 55, 59, 64], [53, 57, 60, 65], [55, 59, 62, 67], [53, 57, 60, 64]];
  const out: ScoreNote[] = [
    { inst: 'bass', midi: roots[bar], dur: 0.4, vol: 0.24 },
    { inst: 'pluck', midi: arp[bar][step], dur: 0.45, vol: 0.15 },
    { inst: 'pluck', midi: arp[bar][(step + 1) % 4], dur: 0.35, vol: 0.1, at: 0.5 },
    { inst: 'hat', midi: 0, dur: 0.08, vol: 0.07 },
  ];
  if (step === 0) out.push({ inst: 'kick', midi: 40, dur: 0.2, vol: 0.24 });
  if (step === 2) out.push({ inst: 'snare', midi: 0, dur: 0.1, vol: 0.1 });
  if (b === 0 || b === 8 || b === 12) out.push({ inst: 'bell', midi: roots[bar] + 24, dur: 1.8, vol: 0.11 });
  return out;
}

function cryptNotes(beat: number): ScoreNote[] {
  // Gothic organ & driving pulse in C minor (Cm - Ab - Fm - G)
  const b = beat % 16, bar = Math.floor(b / 4), step = b % 4;
  const roots = [36, 32, 29, 31];
  const lead = [72, 0, 75, 74, 72, 0, 68, 70, 68, 67, 65, 0, 67, 71, 74, 0];
  const out: ScoreNote[] = [
    { inst: 'bass', midi: roots[bar], dur: 0.5, vol: 0.26 },
    { inst: 'bass', midi: roots[bar] + 7, dur: 0.35, vol: 0.14, at: 0.5 },
  ];
  if (step === 0) out.push({ inst: 'pad', midi: roots[bar] + 24, dur: 3.7, vol: 0.15 });
  if (step === 0 || step === 2) out.push({ inst: 'kick', midi: 38, dur: 0.2, vol: 0.25 });
  if (step === 1 || step === 3) out.push({ inst: 'hat', midi: 0, dur: 0.1, vol: 0.08 });
  if (lead[b]) out.push({ inst: 'lead', midi: lead[b], dur: 0.9, vol: 0.15 });
  return out;
}

function deepNotes(beat: number): ScoreNote[] {
  // Volcanic low brass + heavy percussion in B minor (Bm - G - Em - F#)
  const b = beat % 16, bar = Math.floor(b / 4), step = b % 4;
  const roots = [35, 31, 28, 30];
  const riff = [59, 62, 66, 62, 55, 59, 62, 59, 52, 55, 59, 64, 54, 58, 61, 66];
  const out: ScoreNote[] = [
    { inst: 'bass', midi: roots[bar], dur: 0.42, vol: 0.28 },
    { inst: 'bass', midi: roots[bar], dur: 0.3, vol: 0.2, at: 0.5 },
    { inst: 'brass', midi: riff[b], dur: 0.55, vol: 0.15 },
    { inst: 'kick', midi: 36, dur: 0.2, vol: step === 0 || step === 2 ? 0.28 : 0.16 },
  ];
  if (step === 1 || step === 3) out.push({ inst: 'snare', midi: 0, dur: 0.14, vol: 0.15 });
  if (step === 0) out.push({ inst: 'pad', midi: roots[bar] + 12, dur: 3.6, vol: 0.13 });
  return out;
}

function bossNotes(beat: number): ScoreNote[] {
  // High-octane cycling sprint boss theme in A minor (Am - F - G - E7)
  const b = beat % 16, bar = Math.floor(b / 4), step = b % 4;
  const roots = [33, 29, 31, 28];
  const lead = [69, 72, 76, 72, 65, 69, 72, 76, 67, 71, 74, 71, 68, 71, 76, 79];
  const out: ScoreNote[] = [
    { inst: 'bass', midi: roots[bar], dur: 0.35, vol: 0.3 },
    { inst: 'bass', midi: roots[bar] + 12, dur: 0.3, vol: 0.22, at: 0.5 },
    { inst: 'kick', midi: 38, dur: 0.16, vol: 0.28 },
    { inst: 'hat', midi: 0, dur: 0.08, vol: 0.1, at: 0.5 },
    { inst: 'brass', midi: lead[b] - 12, dur: 0.45, vol: 0.14 },
    { inst: 'lead', midi: lead[b], dur: 0.45, vol: 0.17 },
  ];
  if (step === 1 || step === 3) out.push({ inst: 'snare', midi: 0, dur: 0.14, vol: 0.18 });
  if (b % 8 === 7) out.push({ inst: 'snare', midi: 0, dur: 0.12, vol: 0.14, at: 0.5 });
  return out;
}

function victoryNotes(beat: number): ScoreNote[] {
  // Triumphant major-key stage finish fanfare in D Major (D - G - A - D)
  const b = beat % 16, bar = Math.floor(b / 4), step = b % 4;
  const roots = [38, 43, 45, 38];
  const fanfare = [62, 66, 69, 74, 71, 74, 79, 74, 73, 76, 81, 76, 74, 78, 81, 86];
  const out: ScoreNote[] = [
    { inst: 'bass', midi: roots[bar], dur: 0.6, vol: 0.24 },
    { inst: 'pluck', midi: fanfare[b] - 12, dur: 0.5, vol: 0.14, at: 0.5 },
    { inst: 'bell', midi: fanfare[b], dur: 0.85, vol: 0.15 },
  ];
  if (step === 0) out.push({ inst: 'pad', midi: roots[bar] + 12, dur: 3.6, vol: 0.14 });
  if (step === 0 || step === 2) out.push({ inst: 'kick', midi: 42, dur: 0.18, vol: 0.22 });
  if (step === 1 || step === 3) out.push({ inst: 'snare', midi: 0, dur: 0.12, vol: 0.12 });
  return out;
}

/** Notes starting on `beat` (integer >= 0) for `cue`. Pure. */
export function cueNotes(cue: DungeonCue, beat: number): ScoreNote[] {
  switch (cue) {
    case 'camp': return campNotes(beat);
    case 'keep': return keepNotes(beat);
    case 'catacombs': return catacombsNotes(beat);
    case 'crypt': return cryptNotes(beat);
    case 'deep': return deepNotes(beat);
    case 'boss': return bossNotes(beat);
    case 'victory': return victoryNotes(beat);
  }
}
