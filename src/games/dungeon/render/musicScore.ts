// Pure, deterministic multi-section musical scores for Purgatour's 7 themes (no WebAudio imports; fully unit-tested).
// Each theme spans 64 beats (16 bars in 4/4: A -> A' -> B -> C/Turnaround) with dynamic intensity layering,
// syncopated 16th-note phrasing, stereo placement, and bar-4/8/12/16 percussion fills.
import type { DungeonSnapshot } from '../sim/types';

export type DungeonCue = 'camp' | 'keep' | 'catacombs' | 'crypt' | 'deep' | 'boss' | 'victory';

export type Instrument =
  | 'lute'
  | 'harp'
  | 'harpsi'
  | 'organ'
  | 'strings'
  | 'brass'
  | 'bass'
  | 'lead'
  | 'bell'
  | 'kick'
  | 'snare'
  | 'hat'
  | 'openhat'
  | 'taiko'
  | 'shaker';

export interface ScoreNote {
  inst: Instrument;
  midi: number;         // MIDI pitch (unused for snare/hat/openhat/shaker; pitch anchor for kick/taiko)
  dur: number;          // duration in beats
  vol: number;          // 0..1 relative velocity/gain
  at?: number;          // sub-beat offset in [0, 1) (e.g. 0.25, 0.5, 0.75)
  pan?: number;         // -1 (left) .. +1 (right)
  reverb?: number;      // 0..1 reverb send multiplier
  delay?: number;       // 0..1 stereo ping-pong delay send multiplier
  bright?: number;      // 0.4..1.8 filter brightness / articulation
  minIntensity?: number;// 0..1 dynamic layer threshold (fades in smoothly as combat heats up)
}

export interface MusicWant {
  cue: DungeonCue;
  gain: number;
  tempoScale: number;
  /** 0..1 dynamic intensity (exploration ~0.25, skirmish ~0.6, surge/boss climax ~1.0). */
  intensity: number;
}

const ZONE_CUES: readonly DungeonCue[] = ['keep', 'crypt', 'catacombs', 'deep'];

/** Base BPM per theme. */
export const CUE_BPM: Record<DungeonCue, number> = {
  camp: 92,
  keep: 120,
  catacombs: 126,
  crypt: 122,
  deep: 132,
  boss: 144,
  victory: 130,
};

export const PHRASE_BEATS = 64; // 16 bars in 4/4

export const mtof = (midi: number): number => 440 * Math.pow(2, (midi - 69) / 12);
export const beatS = (cue: DungeonCue, tempoScale = 1): number =>
  60 / (CUE_BPM[cue] * Math.max(0.75, Math.min(1.25, tempoScale)));

/** Pick the active soundtrack cue, gain, tempo scale, and dynamic combat intensity from a snapshot. Pure. */
export function musicFor(s: DungeonSnapshot): MusicWant | null {
  if (!s.world) return null;
  if (s.phase === 'camp') {
    if (s.camp?.lastRun?.won) return { cue: 'victory', gain: 0.34, tempoScale: 1, intensity: 0.9 };
    return { cue: 'camp', gain: 0.28, tempoScale: 1, intensity: 0.55 };
  }
  if (s.skillTree?.offer) return { cue: 'camp', gain: 0.24, tempoScale: 1.05, intensity: 0.4 };

  const fired = (s.player.firedUpLeft ?? 0) > 0;
  const rhythm = s.paceBias.bias === 1 || !!s.player.bulletTime || !!s.player.mountainKing;
  const enemies = s.enemies?.length ?? 0;

  if (s.boss?.active) {
    const phaseScale = s.boss.phase >= 3 ? 1.1 : s.boss.phase === 2 ? 1.05 : 1;
    const exposedBoost = s.boss.cycle === 'exposed' ? 0.05 : 0;
    const bossInt = Math.min(1, 0.72 + (s.boss.phase - 1) * 0.14 + (s.boss.cycle === 'exposed' ? 0.14 : 0) + (fired ? 0.08 : 0));
    return { cue: 'boss', gain: 0.34 + exposedBoost, tempoScale: phaseScale, intensity: bossInt };
  }
  if (s.hooks.seg === 'ambush') {
    return { cue: 'boss', gain: 0.3, tempoScale: 0.96, intensity: 0.85 };
  }
  if (s.stairsOpen && s.run?.final) {
    return { cue: 'victory', gain: 0.36, tempoScale: 1.04, intensity: 1.0 };
  }

  const zoneCue = ZONE_CUES[s.world.theme % ZONE_CUES.length] ?? 'keep';
  const tempoScale = s.hooks.seg === 'spinup' ? 1.08 : s.hooks.seg === 'cooldown' || s.hooks.seg === 'recover' ? 0.94 : 1;
  // Exploration in cleared rooms breathes quietly (~0.32); live fights swell cleanly to 0.75-1.0
  const combatLoad = Math.min(0.45, enemies * 0.11);
  const hookBoost = s.hooks.seg === 'spinup' ? 0.18 : s.hooks.seg === 'cooldown' || s.hooks.seg === 'recover' ? -0.1 : 0;
  const buffBoost = (fired ? 0.18 : 0) + (rhythm ? 0.08 : 0) + (s.player.rallied ? 0.1 : 0);
  const intensity = Math.max(0.25, Math.min(1, 0.32 + combatLoad + hookBoost + buffBoost));
  return { cue: zoneCue, gain: 0.3, tempoScale, intensity };
}

/** Smooth velocity multiplier for notes gated by `minIntensity`. Pure. */
export function layerGain(minIntensity: number | undefined, intensity: number): number {
  if (minIntensity === undefined || minIntensity <= 0) return 1;
  if (intensity <= minIntensity - 0.12) return 0;
  if (intensity >= minIntensity + 0.1) return 1;
  return (intensity - (minIntensity - 0.12)) / 0.22;
}

// ---------- Helpers ----------

function padChord(
  out: ScoreNote[],
  inst: 'strings' | 'organ',
  midis: readonly number[],
  dur: number,
  vol: number,
  opts: Partial<ScoreNote> = {},
): void {
  const n = midis.length;
  for (let i = 0; i < n; i++) {
    const spread = n > 1 ? ((i / (n - 1)) * 2 - 1) * 0.45 : 0;
    out.push({ inst, midi: midis[i], dur, vol: vol / Math.sqrt(n), pan: spread, reverb: 0.75, ...opts });
  }
}

function arpStrum(
  out: ScoreNote[],
  inst: 'harp' | 'lute' | 'harpsi',
  midis: readonly number[],
  dur: number,
  vol: number,
  startAt = 0,
  stepAt = 0.07,
  opts: Partial<ScoreNote> = {},
): void {
  for (let i = 0; i < midis.length; i++) {
    const pan = Math.max(-0.7, Math.min(0.7, (midis[i] - 66) / 22));
    out.push({ inst, midi: midis[i], dur, vol: vol * (0.85 + 0.15 * (i / Math.max(1, midis.length - 1))), at: startAt + i * stepAt, pan, reverb: 0.6, delay: 0.45, ...opts });
  }
}

// ---------- 1. CAMP (92 BPM, D Dorian, 16 bars) ----------
// Warm fireside tavern/camp: fingerpicked lute, cascading Celtic harp, lush breathing strings,
// soft shaker pulse, and a wistful whistled/flute-like solo melody entering in bars 5-16.

const CAMP_CHORDS: ReadonlyArray<{ root: number; pad: number[]; arp: number[] }> = [
  // A: Dm9 - G13 - Cmaj9 - Am7 (bars 0-3)
  { root: 50, pad: [50, 57, 60, 64], arp: [50, 57, 62, 65, 69, 72] },
  { root: 43, pad: [43, 55, 59, 64], arp: [43, 55, 59, 62, 67, 71] },
  { root: 48, pad: [48, 55, 59, 62], arp: [48, 55, 60, 64, 67, 71] },
  { root: 45, pad: [45, 52, 57, 60], arp: [45, 52, 57, 60, 64, 69] },
  // A': Dm9 - G6 - Fmaj7 - Asus4->A (bars 4-7)
  { root: 50, pad: [50, 57, 60, 64], arp: [50, 57, 62, 65, 69, 72] },
  { root: 43, pad: [43, 55, 59, 62], arp: [43, 55, 59, 64, 67, 74] },
  { root: 41, pad: [41, 53, 57, 60], arp: [41, 53, 57, 60, 64, 69] },
  { root: 45, pad: [45, 52, 57, 62], arp: [45, 52, 57, 62, 64, 69] },
  // B: Bbmaj7 - C6 - Dm9 - C/E (bars 8-11)
  { root: 46, pad: [46, 53, 57, 62], arp: [46, 53, 58, 62, 65, 69] },
  { root: 48, pad: [48, 55, 57, 64], arp: [48, 55, 60, 64, 67, 72] },
  { root: 50, pad: [50, 57, 62, 65], arp: [50, 57, 62, 65, 69, 74] },
  { root: 52, pad: [52, 55, 60, 67], arp: [52, 55, 60, 64, 67, 72] },
  // C: Gm7 - Am7 - Bbmaj7 - A7sus4 (bars 12-15)
  { root: 43, pad: [43, 50, 55, 58], arp: [43, 50, 55, 58, 62, 67] },
  { root: 45, pad: [45, 52, 57, 60], arp: [45, 52, 57, 60, 64, 69] },
  { root: 46, pad: [46, 53, 57, 62], arp: [46, 53, 58, 62, 65, 69] },
  { root: 45, pad: [45, 52, 57, 62], arp: [45, 52, 57, 61, 64, 69] },
];

// Melodic phrases for bars 4-15 (each entry: [midi, durBeats] or null)
const CAMP_MEL: ReadonlyArray<[number, number] | null> = [
  // Bars 0-3: open acoustic intro (let lute & harp breathe)
  null, null, null, null, null, null, null, null,
  null, null, null, null, null, null, null, null,
  // Bars 4-7: warm Dorian melody
  [69, 1.5], null, [72, 0.5], [74, 1.2], [71, 1.5], null, [69, 0.5], [67, 1.2],
  [69, 1.5], null, [67, 0.5], [65, 1.0], [64, 2.5], null, null, [62, 0.8],
  // Bars 8-11: B section lifts gently
  [65, 1.5], null, [69, 0.5], [70, 1.2], [72, 1.5], null, [74, 0.5], [76, 1.2],
  [74, 1.5], null, [72, 0.5], [69, 1.2], [67, 2.2], null, [69, 0.8], null,
  // Bars 12-15: reflective resolution back to D
  [70, 1.5], null, [69, 0.5], [67, 1.0], [69, 1.5], null, [67, 0.5], [64, 1.0],
  [65, 1.5], null, [62, 0.5], [64, 1.2], [64, 2.8], null, null, null,
];

function campNotes(beat: number): ScoreNote[] {
  const b = beat % PHRASE_BEATS, bar = Math.floor(b / 4), step = b % 4;
  const ch = CAMP_CHORDS[bar];
  const out: ScoreNote[] = [];

  if (step === 0) {
    padChord(out, 'strings', ch.pad, 4.1, 0.2, { bright: 0.75 });
    out.push({ inst: 'bass', midi: ch.root - 12, dur: 2.2, vol: 0.24, pan: 0, reverb: 0.25, bright: 0.65 });
  }
  if (step === 2) {
    out.push({ inst: 'bass', midi: ch.root - 5, dur: 1.6, vol: 0.16, pan: 0, reverb: 0.25, bright: 0.6 });
  }

  // Fingerpicked lute Travis pattern (syncopated 8ths)
  const pat = [0, 2, 4, 3, 1, 4, 5, 2];
  const p1 = ch.arp[pat[step * 2]], p2 = ch.arp[pat[step * 2 + 1]];
  out.push({ inst: 'lute', midi: p1, dur: 1.25, vol: step === 0 ? 0.22 : 0.16, pan: -0.28, reverb: 0.5, delay: 0.3 });
  out.push({ inst: 'lute', midi: p2, dur: 0.95, vol: 0.12, at: 0.5, pan: -0.2, reverb: 0.5, delay: 0.35 });

  // Harp sparkles on bar transitions and gentle offbeats
  if (step === 0 && bar % 2 === 0) {
    arpStrum(out, 'harp', [ch.arp[2], ch.arp[4], ch.arp[5], ch.arp[3] + 12], 1.8, 0.13, 0, 0.08);
  }
  if (step === 3 && bar % 4 === 3) {
    out.push({ inst: 'bell', midi: ch.arp[5] + 12, dur: 2.8, vol: 0.09, at: 0.5, pan: 0.42, reverb: 0.85, delay: 0.55 });
  }

  // Gentle hearth shaker groove
  out.push({ inst: 'shaker', midi: 0, dur: 0.14, vol: step % 2 === 0 ? 0.045 : 0.075, at: 0.5, pan: 0.32, reverb: 0.2 });
  if (step === 0 && bar >= 4) {
    out.push({ inst: 'taiko', midi: ch.root - 12, dur: 0.45, vol: 0.13, pan: -0.1, reverb: 0.5 });
  }

  const m = CAMP_MEL[b];
  if (m) {
    out.push({ inst: 'lead', midi: m[0], dur: m[1], vol: 0.18, pan: 0.16, reverb: 0.65, delay: 0.45, bright: 0.9, minIntensity: 0.3 });
  }
  return out;
}

// ---------- 2. KEEP (120 BPM, D Minor, 16 bars) ----------
// Heroic torchlit descent (Dead Cells / Hades vibe): palm-muted lute ostinato, syncopated octave bass,
// driving live-feeling drums with bar fills, soaring solo lead in A/A', heroic war-horn brass in B!

const KEEP_BARS: ReadonlyArray<{ root: number; chord: number[]; pad: number[] }> = [
  // A: Dm - Bb - C - Am (0-3)
  { root: 38, chord: [50, 57, 62, 65], pad: [50, 57, 62, 65] },
  { root: 34, chord: [46, 53, 58, 62], pad: [46, 53, 58, 62] },
  { root: 36, chord: [48, 55, 60, 64], pad: [48, 55, 60, 64] },
  { root: 33, chord: [45, 52, 57, 60], pad: [45, 52, 57, 60] },
  // A': Dm - Bb - Gm - A7 (4-7)
  { root: 38, chord: [50, 57, 62, 65], pad: [50, 57, 62, 65] },
  { root: 34, chord: [46, 53, 58, 62], pad: [46, 53, 58, 62] },
  { root: 31, chord: [43, 50, 55, 58], pad: [43, 50, 55, 58] },
  { root: 33, chord: [45, 52, 57, 61], pad: [45, 52, 57, 61] },
  // B: Bb - C - Dm - F (8-11) — heroic chorus lift!
  { root: 34, chord: [46, 53, 58, 62], pad: [53, 58, 62, 65] },
  { root: 36, chord: [48, 55, 60, 64], pad: [55, 60, 64, 67] },
  { root: 38, chord: [50, 57, 62, 65], pad: [57, 62, 65, 69] },
  { root: 41, chord: [53, 57, 60, 65], pad: [57, 60, 65, 69] },
  // C: Gm - Dm - Bb - A7 (12-15) — dramatic turnaround
  { root: 31, chord: [43, 50, 55, 58], pad: [50, 55, 58, 62] },
  { root: 38, chord: [50, 57, 62, 65], pad: [50, 57, 62, 65] },
  { root: 34, chord: [46, 53, 58, 62], pad: [46, 53, 58, 62] },
  { root: 33, chord: [45, 52, 57, 61], pad: [45, 52, 57, 61] },
];

const KEEP_LEAD: ReadonlyArray<[number, number, number?] | null> = [
  // A (bars 0-3): heroic minor motif [midi, dur, at?]
  [62, 0.9], [65, 0.45, 0.5], [67, 0.9], [69, 1.3],
  [70, 0.9], [69, 0.45, 0.5], [67, 0.8], [65, 1.2],
  [64, 0.9], [67, 0.45, 0.5], [69, 0.9], [67, 1.1],
  [64, 1.6], null, [62, 0.45], [60, 0.8],
  // A' (bars 4-7): climbs higher and resolves on leading tone C#
  [62, 0.9], [65, 0.45, 0.5], [69, 0.9], [74, 1.4],
  [72, 0.9], [70, 0.45, 0.5], [69, 0.9], [65, 1.0],
  [67, 0.9], [70, 0.45, 0.5], [69, 0.9], [67, 0.9],
  [64, 1.2], null, [61, 1.5], null,
  // B (bars 8-11): soaring chorus
  [70, 1.4], null, [69, 0.45], [70, 0.9],
  [72, 1.4], null, [74, 0.45], [76, 0.9],
  [74, 1.8], null, [72, 0.5], [69, 1.0],
  [72, 1.6], null, [69, 0.8], [65, 0.8],
  // C (bars 12-15): tension & heroic resolve
  [67, 0.9], [69, 0.45, 0.5], [70, 1.0], [74, 1.2],
  [72, 0.9], [69, 0.45, 0.5], [65, 1.0], [62, 1.0],
  [65, 1.2], null, [67, 0.9], [69, 0.9],
  [64, 1.2], [61, 0.8], [64, 0.8], null,
];

function keepNotes(beat: number): ScoreNote[] {
  const b = beat % PHRASE_BEATS, bar = Math.floor(b / 4), step = b % 4;
  const info = KEEP_BARS[bar];
  const out: ScoreNote[] = [];

  // Lush string foundation
  if (step === 0) padChord(out, 'strings', info.pad, 3.9, 0.2, { bright: bar >= 8 ? 1.05 : 0.85 });

  // Driving palm-muted lute 8th/16th ostinato (always present, defines Purgatour's sonic signature)
  const ch = info.chord;
  out.push({ inst: 'lute', midi: ch[step % 4], dur: 0.65, vol: step === 0 ? 0.22 : 0.16, pan: -0.32, reverb: 0.4, delay: 0.28, bright: 1.05 });
  out.push({ inst: 'lute', midi: ch[(step + 2) % 4] + (step === 3 ? 12 : 0), dur: 0.5, vol: 0.13, at: 0.5, pan: -0.22, reverb: 0.4, delay: 0.32, bright: 0.9 });
  if (step === 1 || step === 3) {
    out.push({ inst: 'lute', midi: ch[1], dur: 0.3, vol: 0.08, at: 0.75, pan: -0.35, reverb: 0.3, bright: 0.8, minIntensity: 0.45 });
  }

  // Syncopated octave bassline
  out.push({ inst: 'bass', midi: info.root, dur: 0.55, vol: step === 0 ? 0.32 : 0.24, pan: 0, reverb: 0.12 });
  if (step === 0 || step === 2) {
    out.push({ inst: 'bass', midi: info.root + 12, dur: 0.38, vol: 0.18, at: 0.5, pan: 0, reverb: 0.15, minIntensity: 0.38 });
  }
  if (step === 3) {
    const nextRoot = KEEP_BARS[(bar + 1) % 16].root;
    out.push({ inst: 'bass', midi: nextRoot + 12, dur: 0.28, vol: 0.16, at: 0.75, pan: 0, reverb: 0.12, minIntensity: 0.45 });
  }

  // Layered drums (lock in on combat intensity)
  if (step === 0) out.push({ inst: 'kick', midi: 42, dur: 0.22, vol: 0.34, minIntensity: 0.32 });
  if (step === 2) out.push({ inst: 'kick', midi: 42, dur: 0.22, vol: 0.28, minIntensity: 0.4 });
  if (step === 2) out.push({ inst: 'kick', midi: 42, dur: 0.18, vol: 0.22, at: 0.5, minIntensity: 0.6 });
  if (step === 1 || step === 3) out.push({ inst: 'snare', midi: 0, dur: 0.16, vol: 0.22, reverb: 0.28, minIntensity: 0.45 });
  if (step === 1) out.push({ inst: 'snare', midi: 0, dur: 0.1, vol: 0.09, at: 0.75, reverb: 0.2, minIntensity: 0.65 }); // ghost snare

  // Crisp hi-hat & shaker groove
  out.push({ inst: 'hat', midi: 0, dur: 0.08, vol: step % 2 === 0 ? 0.1 : 0.07, pan: 0.26, minIntensity: 0.4 });
  out.push({ inst: step === 3 && bar % 2 === 1 ? 'openhat' : 'hat', midi: 0, dur: step === 3 && bar % 2 === 1 ? 0.24 : 0.07, vol: 0.11, at: 0.5, pan: 0.28, minIntensity: 0.45 });
  out.push({ inst: 'shaker', midi: 0, dur: 0.07, vol: 0.05, at: 0.25, pan: 0.38, minIntensity: 0.55 });
  out.push({ inst: 'shaker', midi: 0, dur: 0.07, vol: 0.06, at: 0.75, pan: 0.38, minIntensity: 0.55 });

  // Bar 4/8/12/16 taiko/tom drum fills
  if (bar % 4 === 3 && step === 3) {
    out.push({ inst: 'taiko', midi: 48, dur: 0.28, vol: 0.24, at: 0.25, pan: -0.2, reverb: 0.45, minIntensity: 0.45 });
    out.push({ inst: 'taiko', midi: 45, dur: 0.28, vol: 0.26, at: 0.5, pan: 0.05, reverb: 0.45, minIntensity: 0.45 });
    out.push({ inst: 'taiko', midi: 41, dur: 0.35, vol: 0.3, at: 0.75, pan: 0.25, reverb: 0.5, minIntensity: 0.45 });
  }

  // Heroic brass hits in B/C sections & high intensity
  if (bar >= 8 && step === 0) {
    out.push({ inst: 'brass', midi: info.root + 12, dur: 1.5, vol: 0.22, pan: 0.34, reverb: 0.6, minIntensity: 0.55 });
    out.push({ inst: 'brass', midi: info.root + 19, dur: 1.5, vol: 0.17, pan: -0.34, reverb: 0.6, minIntensity: 0.72 });
  }
  if (bar >= 8 && step === 2 && bar % 2 === 0) {
    out.push({ inst: 'brass', midi: info.chord[2], dur: 0.9, vol: 0.16, at: 0.5, pan: 0.38, reverb: 0.55, minIntensity: 0.65 });
  }

  // Soaring solo lead melody
  const lm = KEEP_LEAD[b];
  if (lm) {
    out.push({ inst: 'lead', midi: lm[0], dur: lm[1], vol: 0.21, at: lm[2] ?? 0, pan: 0.18, reverb: 0.55, delay: 0.48, bright: 1.15, minIntensity: 0.36 });
  }
  return out;
}

// ---------- 3. CRYPT (122 BPM, C Harmonic Minor, 16 bars) ----------
// Gothic Castlevania cathedral: cavernous pipe organ chords, cascading 16th-note Baroque harpsichord,
// ominous taiko & cathedral bells, haunting chromatic lead!

const CRYPT_BARS: ReadonlyArray<{ root: number; triad: number[]; org: number[] }> = [
  // A: Cm - Ab - Fm - G7 (0-3)
  { root: 36, triad: [60, 63, 67, 72], org: [48, 55, 60, 63] },
  { root: 32, triad: [56, 60, 63, 68], org: [44, 51, 56, 60] },
  { root: 29, triad: [53, 56, 60, 65], org: [41, 48, 53, 56] },
  { root: 31, triad: [55, 59, 62, 67], org: [43, 50, 55, 59] },
  // A': Cm - Bb - Ab - G7 (4-7)
  { root: 36, triad: [60, 63, 67, 72], org: [48, 55, 60, 63] },
  { root: 34, triad: [58, 62, 65, 70], org: [46, 53, 58, 62] },
  { root: 32, triad: [56, 60, 63, 68], org: [44, 51, 56, 60] },
  { root: 31, triad: [55, 59, 62, 65], org: [43, 50, 55, 59] },
  // B: Eb - Bb - Cm - G7 (8-11) — Baroque dramatic surge
  { root: 39, triad: [63, 67, 70, 75], org: [51, 58, 63, 67] },
  { root: 34, triad: [58, 62, 65, 70], org: [46, 53, 58, 62] },
  { root: 36, triad: [60, 63, 67, 72], org: [48, 55, 60, 63] },
  { root: 31, triad: [55, 59, 62, 67], org: [43, 50, 55, 59] },
  // C: Fm - Cm - Ab - G7 (12-15)
  { root: 29, triad: [53, 56, 60, 65], org: [41, 48, 53, 56] },
  { root: 36, triad: [60, 63, 67, 72], org: [48, 55, 60, 63] },
  { root: 32, triad: [56, 60, 63, 68], org: [44, 51, 56, 60] },
  { root: 31, triad: [55, 59, 62, 67], org: [43, 50, 55, 59] },
];

const CRYPT_LEAD: ReadonlyArray<[number, number] | null> = [
  // Bars 0-3
  [72, 1.4], null, [75, 0.9], [74, 0.9],
  [72, 1.4], null, [68, 0.9], [70, 0.9],
  [68, 0.9], [67, 0.9], [65, 1.2], null,
  [67, 0.9], [71, 0.9], [74, 1.4], null,
  // Bars 4-7
  [72, 0.9], [74, 0.9], [75, 1.4], null,
  [74, 0.9], [70, 0.9], [65, 1.2], null,
  [68, 0.9], [72, 0.9], [75, 0.9], [72, 0.9],
  [71, 1.6], null, [67, 1.2], null,
  // Bars 8-11 (B section: sweeping gothic arch)
  [75, 1.4], null, [79, 0.9], [77, 0.9],
  [74, 1.4], null, [77, 0.9], [74, 0.9],
  [72, 1.4], null, [75, 0.9], [72, 0.9],
  [71, 1.0], [74, 0.9], [79, 1.4], null,
  // Bars 12-15
  [77, 1.2], [75, 0.8], [72, 1.0], [68, 0.9],
  [72, 1.2], [75, 0.8], [74, 1.0], [72, 0.9],
  [72, 1.2], [68, 0.8], [67, 1.0], [63, 0.9],
  [67, 1.0], [71, 1.0], [74, 1.5], null,
];

function cryptNotes(beat: number): ScoreNote[] {
  const b = beat % PHRASE_BEATS, bar = Math.floor(b / 4), step = b % 4;
  const info = CRYPT_BARS[bar];
  const out: ScoreNote[] = [];

  // Cavernous Gothic Pipe Organ chord on bar downbeat
  if (step === 0) {
    padChord(out, 'organ', info.org, 3.85, 0.24, { reverb: 0.85, bright: 0.95 });
  }
  // Baroque 16th-note cascading harpsichord ostinato!
  const t = info.triad;
  const seq = [t[0], t[1], t[2], t[3], t[2], t[1], t[3], t[2]];
  out.push({ inst: 'harpsi', midi: seq[step * 2], dur: 0.42, vol: 0.14, pan: -0.38, reverb: 0.55, delay: 0.4 });
  out.push({ inst: 'harpsi', midi: seq[step * 2 + 1], dur: 0.36, vol: 0.11, at: 0.5, pan: -0.26, reverb: 0.55, delay: 0.4 });
  if (bar >= 8 || step === 1 || step === 3) {
    out.push({ inst: 'harpsi', midi: t[(step + 2) % 4] + 12, dur: 0.25, vol: 0.08, at: 0.25, pan: -0.44, reverb: 0.5, minIntensity: 0.5 });
    out.push({ inst: 'harpsi', midi: t[(step + 1) % 4] + 12, dur: 0.25, vol: 0.08, at: 0.75, pan: -0.2, reverb: 0.5, minIntensity: 0.6 });
  }

  // Deep pulsing bass
  out.push({ inst: 'bass', midi: info.root, dur: 0.65, vol: 0.3, pan: 0, reverb: 0.18 });
  out.push({ inst: 'bass', midi: info.root + 7, dur: 0.4, vol: 0.18, at: 0.5, pan: 0, reverb: 0.18, minIntensity: 0.4 });

  // Cathedral bells tolling on phrase anchors
  if (step === 0 && bar % 4 === 0) {
    out.push({ inst: 'bell', midi: info.root + 36, dur: 3.6, vol: 0.17, pan: 0.45, reverb: 0.92, delay: 0.55 });
  }

  // Heavy Gothic war-drums + crisp hats
  if (step === 0) out.push({ inst: 'kick', midi: 38, dur: 0.24, vol: 0.32, minIntensity: 0.35 });
  if (step === 2) out.push({ inst: 'taiko', midi: info.root + 12, dur: 0.42, vol: 0.25, pan: -0.15, reverb: 0.6, minIntensity: 0.4 });
  if (step === 1 || step === 3) out.push({ inst: 'snare', midi: 0, dur: 0.17, vol: 0.2, reverb: 0.4, minIntensity: 0.48 });
  out.push({ inst: 'hat', midi: 0, dur: 0.08, vol: step % 2 ? 0.1 : 0.06, at: 0.5, pan: 0.3, minIntensity: 0.42 });

  if (bar % 4 === 3 && step === 3) {
    out.push({ inst: 'taiko', midi: 43, dur: 0.35, vol: 0.26, at: 0.5, pan: 0.2, reverb: 0.65, minIntensity: 0.45 });
    out.push({ inst: 'bell', midi: 79, dur: 2.2, vol: 0.12, at: 0.5, pan: -0.45, reverb: 0.9, minIntensity: 0.5 });
  }

  const lm = CRYPT_LEAD[b];
  if (lm) {
    out.push({ inst: 'lead', midi: lm[0], dur: lm[1], vol: 0.2, pan: 0.22, reverb: 0.68, delay: 0.52, bright: 1.05, minIntensity: 0.36 });
  }
  return out;
}

// ---------- 4. CATACOMBS (126 BPM, E Phrygian Dominant, 16 bars) ----------
// Mysterious bone-labyrinth: exotic Spanish/Phrygian lute & harp riffs, rattling tribal percussion,
// eerie harmonic bells, hypnotic swelling strings!

const CATA_BARS: ReadonlyArray<{ root: number; arp: number[]; pad: number[] }> = [
  // A: Em - F - G - F (0-3)
  { root: 40, arp: [52, 55, 59, 64, 67], pad: [52, 59, 64] },
  { root: 41, arp: [53, 57, 60, 65, 69], pad: [53, 60, 65] },
  { root: 43, arp: [55, 59, 62, 67, 71], pad: [55, 62, 67] },
  { root: 41, arp: [53, 57, 60, 64, 69], pad: [53, 60, 64] },
  // A': Em - F - Dm - E (Phrygian Dominant G#!) (4-7)
  { root: 40, arp: [52, 56, 59, 64, 68], pad: [52, 59, 64] },
  { root: 41, arp: [53, 57, 60, 65, 69], pad: [53, 60, 65] },
  { root: 38, arp: [50, 53, 57, 62, 65], pad: [50, 57, 62] },
  { root: 40, arp: [52, 56, 59, 64, 68], pad: [52, 56, 59, 64] },
  // B: Am - G - F - E (8-11) — Andalusian cadence!
  { root: 33, arp: [57, 60, 64, 69, 72], pad: [45, 52, 57, 60] },
  { root: 31, arp: [55, 59, 62, 67, 71], pad: [43, 50, 55, 59] },
  { root: 29, arp: [53, 57, 60, 65, 69], pad: [41, 48, 53, 57] },
  { root: 28, arp: [52, 56, 59, 64, 68], pad: [40, 47, 52, 56] },
  // C: F - Dm - Em - E (12-15)
  { root: 41, arp: [53, 57, 60, 65, 69], pad: [53, 57, 60] },
  { root: 38, arp: [50, 53, 57, 62, 65], pad: [50, 53, 57] },
  { root: 40, arp: [52, 55, 59, 64, 67], pad: [52, 55, 59] },
  { root: 40, arp: [52, 56, 59, 64, 68], pad: [52, 56, 59] },
];

const CATA_LEAD: ReadonlyArray<[number, number] | null> = [
  // Bars 0-3: hypnotic Phrygian theme (E - F - G - F - E)
  [64, 0.8], [65, 0.8], [67, 1.0], [65, 0.8],
  [64, 1.4], null, [60, 0.9], [64, 0.9],
  [67, 0.9], [69, 0.8], [71, 1.2], null,
  [69, 0.9], [65, 0.9], [64, 1.5], null,
  // Bars 4-7: exotic G# lift!
  [64, 0.8], [68, 0.9], [71, 1.1], [68, 0.8],
  [69, 1.2], [65, 0.8], [64, 1.0], [60, 0.8],
  [62, 0.9], [65, 0.9], [69, 1.2], null,
  [68, 1.6], null, [64, 1.2], null,
  // Bars 8-11: Andalusian descent
  [76, 1.4], null, [74, 0.8], [72, 0.9],
  [71, 1.4], null, [69, 0.8], [67, 0.9],
  [69, 1.4], null, [67, 0.8], [65, 0.9],
  [64, 1.2], [68, 1.0], [71, 1.4], null,
  // Bars 12-15
  [72, 1.0], [69, 0.8], [65, 1.0], [64, 0.8],
  [65, 1.0], [62, 0.8], [60, 1.0], [59, 0.8],
  [64, 1.2], null, [65, 0.9], [64, 0.9],
  [68, 1.8], null, null, null,
];

function catacombsNotes(beat: number): ScoreNote[] {
  const b = beat % PHRASE_BEATS, bar = Math.floor(b / 4), step = b % 4;
  const info = CATA_BARS[bar];
  const out: ScoreNote[] = [];

  if (step === 0) padChord(out, 'strings', info.pad, 3.9, 0.19, { bright: 0.78 });

  // Sinuous Phrygian lute arpeggio + harp counter-sparkle
  const a = info.arp;
  out.push({ inst: 'lute', midi: a[step % a.length], dur: 0.55, vol: 0.2, pan: -0.34, reverb: 0.55, delay: 0.42, bright: 1.2 });
  out.push({ inst: 'lute', midi: a[(step + 2) % a.length], dur: 0.42, vol: 0.14, at: 0.5, pan: -0.22, reverb: 0.55, delay: 0.42, bright: 1.0 });
  if (step === 1 || step === 3) {
    out.push({ inst: 'harp', midi: a[(step + 3) % a.length] + 12, dur: 1.1, vol: 0.1, at: 0.75, pan: 0.4, reverb: 0.72, delay: 0.55 });
  }

  // Rolling syncopated bass
  out.push({ inst: 'bass', midi: info.root, dur: 0.48, vol: 0.28, pan: 0, reverb: 0.15 });
  if (step === 1 || step === 3) {
    out.push({ inst: 'bass', midi: info.root + 12, dur: 0.32, vol: 0.16, at: 0.5, pan: 0, reverb: 0.15, minIntensity: 0.4 });
  }

  // Tribal rattling bone-corridor percussion (shaker + taiko + rim-like crisp snare)
  out.push({ inst: 'shaker', midi: 0, dur: 0.08, vol: 0.08, pan: 0.34 });
  out.push({ inst: 'shaker', midi: 0, dur: 0.06, vol: 0.05, at: 0.25, pan: -0.28, minIntensity: 0.4 });
  out.push({ inst: 'shaker', midi: 0, dur: 0.09, vol: 0.1, at: 0.5, pan: 0.36 });
  out.push({ inst: 'shaker', midi: 0, dur: 0.06, vol: 0.06, at: 0.75, pan: -0.3, minIntensity: 0.45 });

  if (step === 0) out.push({ inst: 'kick', midi: 40, dur: 0.22, vol: 0.3, minIntensity: 0.35 });
  if (step === 1) out.push({ inst: 'taiko', midi: 47, dur: 0.32, vol: 0.2, at: 0.5, pan: -0.22, reverb: 0.55, minIntensity: 0.4 });
  if (step === 2) out.push({ inst: 'snare', midi: 0, dur: 0.14, vol: 0.18, reverb: 0.35, minIntensity: 0.45 });
  if (step === 3 && bar % 2 === 1) {
    out.push({ inst: 'taiko', midi: 45, dur: 0.3, vol: 0.22, at: 0.25, pan: 0.15, reverb: 0.55, minIntensity: 0.5 });
    out.push({ inst: 'taiko', midi: 40, dur: 0.35, vol: 0.26, at: 0.75, pan: -0.15, reverb: 0.55, minIntensity: 0.5 });
  }

  if (step === 0 && (bar === 0 || bar === 8 || bar === 12)) {
    out.push({ inst: 'bell', midi: info.root + 24, dur: 3.2, vol: 0.15, pan: 0.46, reverb: 0.9, delay: 0.5 });
  }

  const lm = CATA_LEAD[b];
  if (lm) {
    out.push({ inst: 'lead', midi: lm[0], dur: lm[1], vol: 0.2, pan: 0.2, reverb: 0.65, delay: 0.55, bright: 1.15, minIntensity: 0.36 });
  }
  return out;
}

// ---------- 5. DEEP (132 BPM, B Minor, 16 bars) ----------
// Volcanic forge & abyss: thunderous war taikos, growling low brass ostinato, driving 8th-note bass,
// molten pipe organ chords, blazing metallic lead in B section!

const DEEP_BARS: ReadonlyArray<{ root: number; riff: number[]; org: number[] }> = [
  // A: Bm - G - Em - F#7 (0-3)
  { root: 35, riff: [47, 50, 54, 50], org: [47, 54, 59, 62] },
  { root: 31, riff: [43, 47, 50, 47], org: [43, 50, 55, 59] },
  { root: 28, riff: [40, 43, 47, 52], org: [40, 47, 52, 55] },
  { root: 30, riff: [42, 46, 49, 54], org: [42, 49, 54, 58] },
  // A': Bm - A - G - F#7 (4-7)
  { root: 35, riff: [47, 50, 54, 57], org: [47, 54, 59, 62] },
  { root: 33, riff: [45, 49, 52, 57], org: [45, 52, 57, 61] },
  { root: 31, riff: [43, 47, 50, 55], org: [43, 50, 55, 59] },
  { root: 30, riff: [42, 46, 49, 54], org: [42, 49, 54, 58] },
  // B: D - A - G - F#7 (8-11) — colossal heroic forge anthem!
  { root: 38, riff: [50, 54, 57, 62], org: [50, 57, 62, 66] },
  { root: 33, riff: [45, 49, 52, 57], org: [45, 52, 57, 61] },
  { root: 31, riff: [43, 47, 50, 55], org: [43, 50, 55, 59] },
  { root: 30, riff: [42, 46, 49, 54], org: [42, 49, 54, 58] },
  // C: Em - Bm - G - F#7 (12-15)
  { root: 28, riff: [40, 43, 47, 52], org: [40, 47, 52, 55] },
  { root: 35, riff: [47, 50, 54, 59], org: [47, 54, 59, 62] },
  { root: 31, riff: [43, 47, 50, 55], org: [43, 50, 55, 59] },
  { root: 30, riff: [42, 46, 49, 54], org: [42, 49, 54, 58] },
];

const DEEP_LEAD: ReadonlyArray<[number, number] | null> = [
  // Bars 0-7: heavy brass leads A/A'; subtle high lead accents on bar 4-7
  null, null, null, null, null, null, null, null,
  null, null, null, null, null, null, null, null,
  [71, 1.4], null, [74, 0.9], [73, 0.9],
  [69, 1.4], null, [73, 0.9], [71, 0.9],
  [67, 1.4], null, [71, 0.9], [69, 0.9],
  [66, 1.8], null, [70, 1.2], null,
  // Bars 8-15: blazing heroic lead!
  [74, 1.4], null, [78, 0.9], [76, 0.9],
  [73, 1.4], null, [76, 0.9], [73, 0.9],
  [71, 1.4], null, [74, 0.9], [71, 0.9],
  [70, 1.0], [73, 0.9], [78, 1.4], null,
  [76, 1.2], [74, 0.8], [71, 1.2], [67, 0.8],
  [71, 1.2], [74, 0.8], [78, 1.4], null,
  [79, 1.2], [78, 0.8], [74, 1.0], [71, 0.8],
  [70, 1.2], [73, 1.0], [78, 1.5], null,
];

function deepNotes(beat: number): ScoreNote[] {
  const b = beat % PHRASE_BEATS, bar = Math.floor(b / 4), step = b % 4;
  const info = DEEP_BARS[bar];
  const out: ScoreNote[] = [];

  if (step === 0) {
    padChord(out, 'organ', info.org, 3.8, 0.22, { reverb: 0.75, bright: 0.9 });
  }

  // Relentless 8th-note molten bass
  out.push({ inst: 'bass', midi: info.root, dur: 0.45, vol: 0.34, pan: 0, reverb: 0.12, bright: 1.15 });
  out.push({ inst: 'bass', midi: info.root, dur: 0.34, vol: 0.24, at: 0.5, pan: 0, reverb: 0.12, bright: 1.0, minIntensity: 0.35 });

  // Growling low brass war-horn riff
  out.push({ inst: 'brass', midi: info.riff[step], dur: 0.65, vol: step === 0 ? 0.24 : 0.18, pan: -0.26, reverb: 0.58, bright: 1.05 });
  if (bar >= 8 && step === 0) {
    out.push({ inst: 'brass', midi: info.riff[0] + 12, dur: 1.5, vol: 0.2, pan: 0.3, reverb: 0.6, minIntensity: 0.55 });
  }

  // Thunderous war drums (taiko + double kick + snare)
  out.push({ inst: 'kick', midi: 35, dur: 0.22, vol: step === 0 || step === 2 ? 0.36 : 0.22, minIntensity: 0.3 });
  if (step === 0 || step === 2) {
    out.push({ inst: 'taiko', midi: info.root + 12, dur: 0.45, vol: 0.28, pan: step === 0 ? -0.24 : 0.24, reverb: 0.65, minIntensity: 0.35 });
  }
  if (step === 1 || step === 3) {
    out.push({ inst: 'snare', midi: 0, dur: 0.17, vol: 0.24, reverb: 0.38, minIntensity: 0.45 });
  }
  out.push({ inst: 'hat', midi: 0, dur: 0.08, vol: 0.09, at: 0.5, pan: 0.3, minIntensity: 0.45 });

  // Volcanic taiko thunder fills on bars 4/8/12/16
  if (bar % 4 === 3 && step >= 2) {
    out.push({ inst: 'taiko', midi: 47 - step * 2, dur: 0.3, vol: 0.26, at: 0.5, pan: step === 2 ? -0.3 : 0.3, reverb: 0.65, minIntensity: 0.45 });
    if (step === 3) {
      out.push({ inst: 'taiko', midi: 38, dur: 0.38, vol: 0.32, at: 0.75, pan: 0, reverb: 0.7, minIntensity: 0.45 });
    }
  }

  const lm = DEEP_LEAD[b];
  if (lm) {
    out.push({ inst: 'lead', midi: lm[0], dur: lm[1], vol: 0.22, pan: 0.22, reverb: 0.6, delay: 0.5, bright: 1.25, minIntensity: 0.42 });
  }
  return out;
}

// ---------- 6. BOSS (144 BPM, A Minor, 16 bars) ----------
// High-octane peloton-sprint boss battle: relentless galloping bass, shredding harpsichord arps,
// dramatic brass stabs, twin-harmony lead & organ power chords, syncopated double-kick & snare fills!

const BOSS_BARS: ReadonlyArray<{ root: number; arp: number[]; brass: number }> = [
  // A: Am - F - G - E7 (0-3)
  { root: 33, arp: [57, 60, 64, 69], brass: 57 },
  { root: 29, arp: [53, 57, 60, 65], brass: 53 },
  { root: 31, arp: [55, 59, 62, 67], brass: 55 },
  { root: 28, arp: [52, 56, 59, 64], brass: 52 },
  // A': Am - F - Dm - E7 (4-7)
  { root: 33, arp: [57, 60, 64, 69], brass: 57 },
  { root: 29, arp: [53, 57, 60, 65], brass: 53 },
  { root: 38, arp: [50, 53, 57, 62], brass: 50 },
  { root: 28, arp: [52, 56, 59, 64], brass: 52 },
  // B: F - G - Am - C (8-11) — adrenaline sprint climb!
  { root: 29, arp: [53, 57, 60, 65], brass: 60 },
  { root: 31, arp: [55, 59, 62, 67], brass: 62 },
  { root: 33, arp: [57, 60, 64, 69], brass: 64 },
  { root: 36, arp: [60, 64, 67, 72], brass: 67 },
  // C: Dm - Am - Bb(Neapolitan!) - E7 (12-15) — dramatic showdown
  { root: 38, arp: [50, 53, 57, 62], brass: 62 },
  { root: 33, arp: [57, 60, 64, 69], brass: 60 },
  { root: 34, arp: [58, 62, 65, 70], brass: 58 },
  { root: 28, arp: [52, 56, 59, 64], brass: 59 },
];

const BOSS_LEAD: ReadonlyArray<[number, number, number?] | null> = [
  // A (bars 0-3)
  [69, 0.7], [72, 0.45, 0.5], [76, 0.9], [72, 0.8],
  [65, 0.7], [69, 0.45, 0.5], [72, 0.9], [76, 0.8],
  [67, 0.7], [71, 0.45, 0.5], [74, 0.9], [71, 0.8],
  [68, 0.9], [71, 0.7], [76, 1.2], null,
  // A' (bars 4-7)
  [69, 0.7], [72, 0.45, 0.5], [76, 0.9], [81, 1.1],
  [79, 0.7], [77, 0.45, 0.5], [76, 0.9], [72, 0.8],
  [74, 0.9], [77, 0.7], [76, 0.9], [74, 0.8],
  [76, 1.4], null, [71, 0.9], [68, 0.8],
  // B (bars 8-11): soaring peloton sprint
  [77, 1.2], [76, 0.6], [74, 0.8], [72, 0.8],
  [74, 1.2], [76, 0.6], [79, 0.9], [74, 0.8],
  [76, 1.4], null, [81, 0.9], [79, 0.8],
  [76, 1.0], [79, 0.9], [84, 1.4], null,
  // C (bars 12-15): Neapolitan tension -> E7 explosion
  [81, 0.9], [77, 0.8], [74, 0.9], [77, 0.8],
  [76, 0.9], [72, 0.8], [69, 0.9], [72, 0.8],
  [74, 1.0], [70, 0.8], [69, 0.9], [70, 0.8],
  [71, 0.9], [76, 0.9], [80, 1.4], null,
];

function bossNotes(beat: number): ScoreNote[] {
  const b = beat % PHRASE_BEATS, bar = Math.floor(b / 4), step = b % 4;
  const info = BOSS_BARS[bar];
  const out: ScoreNote[] = [];

  // Power organ chord on bar downbeat
  if (step === 0) {
    padChord(out, 'organ', [info.root + 12, info.root + 19, info.arp[1], info.arp[2]], 3.6, 0.22, { reverb: 0.65, bright: 1.1 });
  }

  // Galloping iron-maiden-style bass (1, &, 16th-pickup)
  out.push({ inst: 'bass', midi: info.root, dur: 0.36, vol: 0.35, pan: 0, reverb: 0.1, bright: 1.25 });
  out.push({ inst: 'bass', midi: info.root + 12, dur: 0.28, vol: 0.24, at: 0.5, pan: 0, reverb: 0.1, bright: 1.15 });
  out.push({ inst: 'bass', midi: info.root, dur: 0.2, vol: 0.2, at: 0.75, pan: 0, reverb: 0.1, bright: 1.1, minIntensity: 0.78 });

  // Shredding 16th-note Baroque harpsichord arpeggios
  const a = info.arp;
  out.push({ inst: 'harpsi', midi: a[step % 4], dur: 0.32, vol: 0.14, pan: -0.4, reverb: 0.4, delay: 0.32, bright: 1.2 });
  out.push({ inst: 'harpsi', midi: a[(step + 1) % 4], dur: 0.24, vol: 0.11, at: 0.25, pan: -0.32, reverb: 0.4, minIntensity: 0.75 });
  out.push({ inst: 'harpsi', midi: a[(step + 2) % 4], dur: 0.28, vol: 0.13, at: 0.5, pan: -0.24, reverb: 0.4, delay: 0.32 });
  out.push({ inst: 'harpsi', midi: a[(step + 3) % 4], dur: 0.24, vol: 0.1, at: 0.75, pan: -0.36, reverb: 0.4, minIntensity: 0.82 });

  // Aggressive brass stabs
  if (step === 0 || (step === 2 && bar % 2 === 1)) {
    out.push({ inst: 'brass', midi: info.brass, dur: 0.75, vol: 0.24, pan: 0.35, reverb: 0.5, bright: 1.2 });
    out.push({ inst: 'brass', midi: info.brass - 12, dur: 0.75, vol: 0.2, pan: -0.35, reverb: 0.5, bright: 1.1 });
  }

  // Relentless double-kick + snare + crashy hats + boss fills
  out.push({ inst: 'kick', midi: 38, dur: 0.18, vol: 0.36 });
  if (step === 0 || step === 2) {
    out.push({ inst: 'kick', midi: 38, dur: 0.15, vol: 0.26, at: 0.5, minIntensity: 0.78 });
  }
  if (step === 1 || step === 3) {
    out.push({ inst: 'snare', midi: 0, dur: 0.16, vol: 0.27, reverb: 0.32 });
  }
  out.push({ inst: 'hat', midi: 0, dur: 0.06, vol: 0.1, pan: 0.28 });
  out.push({ inst: step === 3 ? 'openhat' : 'hat', midi: 0, dur: step === 3 ? 0.22 : 0.06, vol: 0.12, at: 0.5, pan: 0.32 });

  if (bar % 4 === 3 && step === 3) {
    out.push({ inst: 'snare', midi: 0, dur: 0.12, vol: 0.22, at: 0.25, reverb: 0.32 });
    out.push({ inst: 'taiko', midi: 45, dur: 0.25, vol: 0.28, at: 0.5, pan: -0.25, reverb: 0.55 });
    out.push({ inst: 'taiko', midi: 40, dur: 0.3, vol: 0.32, at: 0.75, pan: 0.25, reverb: 0.55 });
  }

  // Soaring twin-harmony solo lead (adds 3rd/5th harmony layer in Phase 2/3 & Exposed!)
  const lm = BOSS_LEAD[b];
  if (lm) {
    out.push({ inst: 'lead', midi: lm[0], dur: lm[1], vol: 0.23, at: lm[2] ?? 0, pan: 0.22, reverb: 0.55, delay: 0.45, bright: 1.3 });
    out.push({ inst: 'lead', midi: lm[0] - 5, dur: lm[1], vol: 0.13, at: lm[2] ?? 0, pan: -0.24, reverb: 0.55, delay: 0.4, bright: 1.05, minIntensity: 0.86 });
  }
  return out;
}

// ---------- 7. VICTORY (130 BPM, D Major, 16 bars) ----------
// Triumphant Grand Tour finish line fanfare: glorious brass chords, sparkling harp glissandos,
// joyful tubular bells, uplifting major melody, celebratory percussion!

const VIC_BARS: ReadonlyArray<{ root: number; chord: number[]; pad: number[] }> = [
  // A: D - A/C# - Bm - G (0-3)
  { root: 38, chord: [62, 66, 69, 74], pad: [50, 57, 62, 66] },
  { root: 37, chord: [61, 64, 69, 73], pad: [49, 57, 61, 64] },
  { root: 35, chord: [59, 62, 66, 71], pad: [47, 54, 59, 62] },
  { root: 43, chord: [55, 59, 62, 67], pad: [43, 50, 55, 59] },
  // A': D - G - Em7 - A7 (4-7)
  { root: 38, chord: [62, 66, 69, 74], pad: [50, 57, 62, 66] },
  { root: 43, chord: [55, 59, 62, 67], pad: [43, 50, 55, 59] },
  { root: 40, chord: [52, 55, 59, 64], pad: [40, 47, 52, 55] },
  { root: 45, chord: [57, 61, 64, 69], pad: [45, 52, 57, 61] },
  // B: G - A - F#m - Bm (8-11)
  { root: 43, chord: [55, 59, 62, 67], pad: [43, 50, 55, 59] },
  { root: 45, chord: [57, 61, 64, 69], pad: [45, 52, 57, 61] },
  { root: 42, chord: [54, 57, 61, 66], pad: [42, 49, 54, 57] },
  { root: 35, chord: [59, 62, 66, 71], pad: [47, 54, 59, 62] },
  // C: Em - G - A - D (12-15)
  { root: 40, chord: [52, 55, 59, 64], pad: [40, 47, 52, 55] },
  { root: 43, chord: [55, 59, 62, 67], pad: [43, 50, 55, 59] },
  { root: 45, chord: [57, 61, 64, 69], pad: [45, 52, 57, 61] },
  { root: 38, chord: [62, 66, 69, 74], pad: [50, 57, 62, 66] },
];

const VIC_MEL: ReadonlyArray<[number, number] | null> = [
  // Bars 0-3
  [62, 0.9], [66, 0.9], [69, 1.0], [74, 1.2],
  [73, 1.4], null, [69, 0.9], [64, 0.9],
  [66, 0.9], [69, 0.9], [71, 1.2], null,
  [74, 1.2], [71, 0.8], [67, 1.4], null,
  // Bars 4-7
  [69, 0.9], [74, 0.9], [78, 1.2], [74, 0.8],
  [79, 1.4], null, [74, 0.9], [71, 0.9],
  [76, 1.2], [74, 0.8], [71, 1.0], [67, 0.8],
  [69, 1.2], [73, 0.9], [76, 1.5], null,
  // Bars 8-11
  [79, 1.4], null, [78, 0.9], [74, 0.9],
  [76, 1.4], null, [73, 0.9], [69, 0.9],
  [73, 1.0], [76, 0.9], [78, 1.4], null,
  [74, 1.2], [71, 0.9], [74, 1.4], null,
  // Bars 12-15
  [76, 1.2], [74, 0.8], [71, 1.0], [76, 0.8],
  [79, 1.4], null, [78, 0.9], [74, 0.9],
  [76, 1.2], [79, 0.9], [81, 1.4], null,
  [86, 2.5], null, null, null,
];

function victoryNotes(beat: number): ScoreNote[] {
  const b = beat % PHRASE_BEATS, bar = Math.floor(b / 4), step = b % 4;
  const info = VIC_BARS[bar];
  const out: ScoreNote[] = [];

  if (step === 0) {
    padChord(out, 'strings', info.pad, 3.9, 0.24, { bright: 1.1 });
    out.push({ inst: 'brass', midi: info.chord[0], dur: 1.8, vol: 0.2, pan: -0.32, reverb: 0.65, bright: 1.15 });
    out.push({ inst: 'brass', midi: info.chord[2], dur: 1.8, vol: 0.18, pan: 0.32, reverb: 0.65, bright: 1.15 });
    arpStrum(out, 'harp', [...info.chord, info.chord[0] + 12], 1.7, 0.14, 0, 0.06);
  }

  out.push({ inst: 'bass', midi: info.root, dur: 0.65, vol: 0.28, pan: 0, reverb: 0.15 });
  if (step === 1 || step === 3) {
    out.push({ inst: 'lute', midi: info.chord[step % 4], dur: 0.6, vol: 0.15, at: 0.5, pan: -0.25, reverb: 0.45, delay: 0.3 });
  }

  if (step === 0 || step === 2) out.push({ inst: 'kick', midi: 42, dur: 0.2, vol: 0.28 });
  if (step === 1 || step === 3) out.push({ inst: 'snare', midi: 0, dur: 0.15, vol: 0.18, reverb: 0.35 });
  out.push({ inst: 'shaker', midi: 0, dur: 0.08, vol: 0.07, at: 0.5, pan: 0.34 });

  if (bar % 4 === 3 && step === 3) {
    out.push({ inst: 'taiko', midi: 50, dur: 0.3, vol: 0.22, at: 0.5, reverb: 0.5 });
    out.push({ inst: 'taiko', midi: 45, dur: 0.35, vol: 0.26, at: 0.75, reverb: 0.5 });
  }

  const vm = VIC_MEL[b];
  if (vm) {
    out.push({ inst: 'lead', midi: vm[0], dur: vm[1], vol: 0.21, pan: 0.15, reverb: 0.6, delay: 0.42, bright: 1.2 });
    out.push({ inst: 'bell', midi: vm[0], dur: vm[1] * 1.4, vol: 0.12, pan: -0.18, reverb: 0.8, delay: 0.48 });
  }
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
