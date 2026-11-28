// Pure, deterministic 32-bar (128-beat) studio arrangements for Purgatour's 9 themes (no WebAudio imports).
// Features: A -> B -> C (Breakdown) -> D (Climax) song arcs, multi-pass evolution, biome-specific solo voices,
// diatonic chord-aware twin harmonies, dedicated Ambush overdrive layer (keeping Boss sacred!), distinct
// Headwind Wyrm & Grim Sweeper boss themes, Hero Archetype signature accents, and Skill-Tree filter ducking.
import type { ArchetypeId } from '../sim/archetypes';
import type { DungeonSnapshot } from '../sim/types';

export type DungeonCue =
  | 'camp'
  | 'keep'
  | 'catacombs'
  | 'crypt'
  | 'deep'
  | 'boss'
  | 'wyrm'
  | 'sweeper'
  | 'victory';

export type Instrument =
  | 'lute'
  | 'harp'
  | 'harpsi'
  | 'oud'
  | 'chug'
  | 'organ'
  | 'strings'
  | 'brass'
  | 'bass'
  | 'lead'
  | 'flute'
  | 'fiddle'
  | 'reed'
  | 'guitar'
  | 'bell'
  | 'kick'
  | 'snare'
  | 'rim'
  | 'hat'
  | 'openhat'
  | 'ride'
  | 'crash'
  | 'tom'
  | 'taiko'
  | 'shaker';

export interface ScoreNote {
  inst: Instrument;
  midi: number;          // MIDI pitch (unused for snare/rim/hat/openhat/ride/crash/shaker)
  dur: number;           // duration in beats
  vol: number;           // 0..1 relative velocity/gain
  at?: number;           // sub-beat offset in [0, 1)
  pan?: number;          // -1 (left) .. +1 (right)
  room?: number;         // 0..1 tight studio room send (punchy drums, plucks, chugs)
  reverb?: number;       // 0..1 wide cathedral hall send (strings, organ, brass, solos, bells)
  delay?: number;        // 0..1 stereo ping-pong delay send (solos, harp, bells only)
  bright?: number;       // 0.4..1.8 filter brightness / articulation
  slide?: number;        // optional attack pitch bend in semitones (e.g. -1 or -0.35 for oud/fiddle scoop)
  minIntensity?: number; // 0..1 dynamic layer threshold (fades in smoothly as combat heats up)
}

export interface ScoreContext {
  ambush?: boolean;
  archetype?: ArchetypeId;
  bossPhase?: number;
  exposed?: boolean;
  muffled?: boolean;
}

export interface MusicWant extends ScoreContext {
  cue: DungeonCue;
  gain: number;
  tempoScale: number;
  /** 0..1 dynamic intensity (exploration ~0.28, skirmish ~0.68, ambush/boss climax ~1.0). */
  intensity: number;
}

const ZONE_CUES: readonly DungeonCue[] = ['keep', 'crypt', 'catacombs', 'deep'];

/** Base BPM per theme (calibrated for energetic cycling grooves). */
export const CUE_BPM: Record<DungeonCue, number> = {
  camp: 92,
  keep: 122,
  crypt: 124,
  catacombs: 128,
  deep: 134,
  boss: 140,
  wyrm: 136,
  sweeper: 148,
  victory: 130,
};

export const PHRASE_BEATS = 128; // 32 bars in 4/4: A(0-7) -> B(8-15) -> C Breakdown(16-23) -> D Climax(24-31)

export const mtof = (midi: number): number => 440 * Math.pow(2, (midi - 69) / 12);
export const beatS = (cue: DungeonCue, tempoScale = 1): number =>
  60 / (CUE_BPM[cue] * Math.max(0.8, Math.min(1.2, tempoScale)));

/** Pick active soundtrack cue, mastering output gain, tempo scale, intensity, and adaptive flags. Pure. */
export function musicFor(s: DungeonSnapshot): MusicWant | null {
  if (!s.world) return null;
  const archetype: ArchetypeId = s.archetype?.id ?? 'rouleur';

  if (s.phase === 'camp') {
    if (s.camp?.lastRun?.won) {
      return { cue: 'victory', gain: 0.44, tempoScale: 1, intensity: 0.92, archetype };
    }
    return { cue: 'camp', gain: 0.4, tempoScale: 1, intensity: 0.65, archetype };
  }

  const zoneCue = ZONE_CUES[s.world.theme % ZONE_CUES.length] ?? 'keep';

  // Opening the Skill Tree mid-run keeps the active floor's music alive under a silky low-pass filter
  // (strips drums/lead, no jarring cut to Camp 92 BPM D Dorian!).
  if (s.skillTree?.offer) {
    return {
      cue: zoneCue,
      gain: 0.34,
      tempoScale: 0.96,
      intensity: 0.22,
      muffled: true,
      archetype,
    };
  }

  const fired = (s.player.firedUpLeft ?? 0) > 0;
  const heavyLoad = (s.terrain?.extraGrade ?? 0) >= 2 || !!s.player.bulletTime || !!s.player.mountainKing;
  const enemies = s.enemies?.length ?? 0;

  if (s.boss?.active) {
    const bName = (s.boss.name ?? '').toLowerCase();
    const cue: DungeonCue = bName.includes('sweeper') || s.run?.final
      ? 'sweeper'
      : bName.includes('wyrm')
        ? 'wyrm'
        : 'boss';
    const phaseScale = s.boss.phase >= 3 ? 1.06 : s.boss.phase === 2 ? 1.03 : 1;
    const exposed = s.boss.cycle === 'exposed';
    const bossInt = Math.min(1, 0.72 + (s.boss.phase - 1) * 0.14 + (exposed ? 0.14 : 0) + (fired ? 0.06 : 0));
    return {
      cue,
      gain: exposed ? 0.48 : 0.44,
      tempoScale: phaseScale,
      intensity: bossInt,
      bossPhase: s.boss.phase,
      exposed,
      archetype,
    };
  }

  if (s.stairsOpen && s.run?.final) {
    return { cue: 'victory', gain: 0.46, tempoScale: 1.02, intensity: 1.0, archetype };
  }

  // Dedicated Ambush overdrive inside the CURRENT biome's key & identity (keeps Boss themes sacred!)
  if (s.hooks.seg === 'ambush') {
    return {
      cue: zoneCue,
      gain: 0.45,
      tempoScale: 1.06,
      intensity: 0.96,
      ambush: true,
      archetype,
    };
  }

  const recover = s.hooks.seg === 'cooldown' || s.hooks.seg === 'recover';
  const tempoScale = s.hooks.seg === 'spinup' ? 1.06 : recover ? 0.95 : 1;
  const combatLoad = Math.min(0.46, enemies * 0.115);
  const hookBoost = s.hooks.seg === 'spinup' ? 0.2 : recover ? -0.1 : 0;
  const buffBoost = (fired ? 0.16 : 0) + (heavyLoad ? 0.08 : 0) + (s.player.rallied ? 0.1 : 0);
  const intensity = Math.max(0.24, Math.min(1, 0.28 + combatLoad + hookBoost + buffBoost));
  return {
    cue: zoneCue,
    gain: recover ? 0.36 : 0.42,
    tempoScale,
    intensity,
    muffled: recover && enemies === 0,
    archetype,
  };
}

/** Smooth velocity multiplier for notes gated by `minIntensity`. Pure. */
export function layerGain(minIntensity: number | undefined, intensity: number): number {
  if (minIntensity === undefined || minIntensity <= 0) return 1;
  if (intensity <= minIntensity - 0.12) return 0;
  if (intensity >= minIntensity + 0.1) return 1;
  return (intensity - (minIntensity - 0.12)) / 0.22;
}

// ---------- Musical Theory & Humanization Helpers ----------

/** Deterministic hash in [-1, 1] for micro-timing & velocity humanization (100% pure & repeatable). */
function detJitter(seed: number): number {
  let x = (seed ^ 0x9e3779b9) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b) >>> 0;
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35) >>> 0;
  return ((x ^ (x >>> 16)) / 0xffffffff) * 2 - 1;
}

/** Natural phrase velocity contour: gently swells toward bars 4/8/16/32 and breathes in C breakdowns. */
function phraseArc(bar: number): number {
  const in8 = bar % 8;
  const swell = 0.92 + (in8 / 7) * 0.14;
  if (bar >= 16 && bar < 24) return swell * 0.88; // C breakdown breathes
  if (bar >= 24) return swell * 1.05;             // D climax drives home
  return swell;
}

/** Scale-aware diatonic harmony: steps strictly within `scalePcs` so twin leads NEVER play out-of-key clashes. */
export function diatonicHarmony(midi: number, scalePcs: readonly number[], stepsDown = 2): number {
  const pc = ((midi % 12) + 12) % 12;
  let bestIdx = 0;
  let bestDist = 99;
  for (let i = 0; i < scalePcs.length; i++) {
    const d = Math.min(Math.abs(scalePcs[i] - pc), 12 - Math.abs(scalePcs[i] - pc));
    if (d < bestDist) { bestDist = d; bestIdx = i; }
  }
  const n = scalePcs.length;
  let idx = bestIdx - stepsDown;
  let octShift = 0;
  while (idx < 0) { idx += n; octShift -= 12; }
  while (idx >= n) { idx -= n; octShift += 12; }
  const targetPc = scalePcs[idx];
  const baseOct = midi - pc;
  let out = baseOct + targetPc + octShift;
  while (out >= midi) out -= 12;
  while (midi - out > 12) out += 12;
  return out;
}

function widePad(
  out: ScoreNote[],
  inst: 'strings' | 'organ',
  midis: readonly number[],
  dur: number,
  vol: number,
  opts: Partial<ScoreNote> = {},
): void {
  const n = midis.length;
  for (let i = 0; i < n; i++) {
    const spread = n > 1 ? ((i / (n - 1)) * 2 - 1) * 0.72 : 0;
    out.push({
      inst,
      midi: midis[i],
      dur,
      vol: vol / Math.sqrt(n),
      pan: spread,
      reverb: 0.72,
      room: 0.12,
      ...opts,
    });
  }
}

function harpGliss(
  out: ScoreNote[],
  midis: readonly number[],
  dur: number,
  vol: number,
  startAt = 0,
  stepAt = 0.065,
  opts: Partial<ScoreNote> = {},
): void {
  for (let i = 0; i < midis.length; i++) {
    const pan = Math.max(-0.78, Math.min(0.78, ((i / Math.max(1, midis.length - 1)) * 2 - 1) * 0.72));
    out.push({
      inst: 'harp',
      midi: midis[i],
      dur,
      vol: vol * (0.82 + 0.18 * (i / Math.max(1, midis.length - 1))),
      at: startAt + i * stepAt,
      pan,
      reverb: 0.56,
      delay: 0.36,
      room: 0.14,
      ...opts,
    });
  }
}

/** Add subtle Hero Archetype signature layer (Rouleur motorik pulse, Climber alpine strings, Sprinter punch chugs). */
function addArchetypeAccent(
  out: ScoreNote[],
  ctx: ScoreContext | undefined,
  bar: number,
  step: number,
  root: number,
  topNote: number,
  inBreakdown: boolean,
): void {
  const arch = ctx?.archetype;
  if (!arch || ctx?.muffled) return;
  if (arch === 'rouleur') {
    // Relentless motorik shaker/ride momentum on offbeats
    if (!inBreakdown) {
      out.push({ inst: 'shaker', midi: 0, dur: 0.07, vol: step % 2 ? 0.09 : 0.06, at: 0.5, pan: -0.44, room: 0.2, minIntensity: 0.42 });
    }
  } else if (arch === 'grimpeur') {
    // Soaring alpine cello/string counter-voice on climbs (B & D sections)
    if ((bar >= 8 && bar < 16) || bar >= 24) {
      if (step === 0) {
        out.push({ inst: 'strings', midi: topNote + 12, dur: 3.8, vol: 0.11, pan: 0.64, reverb: 0.78, bright: 1.15, minIntensity: 0.52 });
      }
    }
  } else if (arch === 'puncheur') {
    // Tight funky/aggressive offbeat palm-muted guitar chugs when pushing
    if (!inBreakdown && (step === 1 || step === 3)) {
      out.push({ inst: 'chug', midi: root + 12, dur: 0.24, vol: 0.16, at: 0.75, pan: 0.5, room: 0.28, bright: 1.15, minIntensity: 0.62 });
    }
  }
}

/** Add dedicated Ambush overdrive layer in the current biome's key (keeps Boss themes exclusive!). */
function addAmbushLayer(
  out: ScoreNote[],
  ctx: ScoreContext | undefined,
  bar: number,
  step: number,
  root: number,
  fifth: number,
): void {
  if (!ctx?.ambush) return;
  // Driving palm-muted guitar chug + double-time kick/hat + fierce brass stabs
  out.push({ inst: 'chug', midi: root + 12, dur: 0.26, vol: 0.26, pan: 0.48, room: 0.28, bright: 1.25 });
  out.push({ inst: 'chug', midi: root + 12, dur: 0.22, vol: 0.2, at: 0.5, pan: 0.48, room: 0.26, bright: 1.15 });
  if (step === 2 || step === 3) {
    out.push({ inst: 'chug', midi: fifth, dur: 0.18, vol: 0.19, at: 0.75, pan: 0.52, room: 0.28, bright: 1.25 });
  }
  if (step === 0 || step === 2) {
    out.push({ inst: 'kick', midi: 38, dur: 0.18, vol: 0.28, at: 0.5, room: 0.16 });
  }
  out.push({ inst: 'hat', midi: 0, dur: 0.05, vol: 0.11, at: 0.25, pan: 0.44, room: 0.12 });
  out.push({ inst: 'hat', midi: 0, dur: 0.05, vol: 0.12, at: 0.75, pan: 0.44, room: 0.12 });
  if (step === 0 && bar % 2 === 0) {
    out.push({ inst: 'brass', midi: root + 24, dur: 0.85, vol: 0.2, pan: -0.46, reverb: 0.5, bright: 1.28 });
  }
}

/** Shared live rock/dungeon drum kit with fills, crashes, rides, and humanization. */
function addKit(
  out: ScoreNote[],
  bar: number,
  step: number,
  pass: number,
  opts: {
    breakdown: boolean;
    climax: boolean;
    bSection: boolean;
    kickMidi: number;
    swing?: number;
    doubleKick?: boolean;
    tribal?: boolean;
  },
): void {
  const sw = opts.swing ?? 0;
  // Section downbeat crash cymbals (bars 0, 8, 16, 24)
  if (step === 0 && (bar === 0 || bar === 8 || bar === 24 || (bar === 16 && !opts.breakdown))) {
    out.push({
      inst: 'crash',
      midi: 0,
      dur: 2.2,
      vol: bar === 24 ? 0.26 : 0.21,
      pan: bar % 16 === 0 ? -0.58 : 0.58,
      room: 0.34,
      reverb: 0.36,
      minIntensity: 0.44,
    });
  }

  if (opts.breakdown) {
    // Half-time atmospheric breakdown groove (gives rider's ears a real rest before D climax!)
    if (step === 0) out.push({ inst: 'kick', midi: opts.kickMidi, dur: 0.25, vol: 0.32, room: 0.18, minIntensity: 0.36 });
    if (step === 2) out.push({ inst: 'rim', midi: 0, dur: 0.1, vol: 0.18, pan: -0.14, room: 0.36, minIntensity: 0.34 });
    if (step === 1 || step === 3) {
      out.push({ inst: 'shaker', midi: 0, dur: 0.08, vol: 0.08, at: 0.5 + sw, pan: -0.38, room: 0.2, minIntensity: 0.32 });
    }
    // Bar 23 build-up into D climax!
    if (bar === 23) {
      const rise = 0.55 + step * 0.13;
      out.push({ inst: 'taiko', midi: 42 + step * 2, dur: 0.26, vol: 0.24 * rise, pan: step % 2 ? 0.3 : -0.3, room: 0.35, reverb: 0.3, minIntensity: 0.38 });
      out.push({ inst: 'snare', midi: 0, dur: 0.14, vol: 0.2 * rise, at: 0.5, pan: 0.12, room: 0.32, minIntensity: 0.42 });
      if (step === 3) {
        out.push({ inst: 'snare', midi: 0, dur: 0.13, vol: 0.24, at: 0.25, pan: 0.1, room: 0.32, minIntensity: 0.42 });
        out.push({ inst: 'snare', midi: 0, dur: 0.15, vol: 0.28, at: 0.75, pan: -0.1, room: 0.34, minIntensity: 0.42 });
      }
    }
    return;
  }

  // Main driving groove
  if (step === 0) out.push({ inst: 'kick', midi: opts.kickMidi, dur: 0.22, vol: 0.38, room: 0.14, minIntensity: 0.32 });
  if (step === 2) out.push({ inst: 'kick', midi: opts.kickMidi, dur: 0.22, vol: 0.31, room: 0.14, minIntensity: 0.38 });
  if (step === 2 && (opts.climax || opts.bSection || opts.doubleKick)) {
    out.push({ inst: 'kick', midi: opts.kickMidi, dur: 0.18, vol: 0.26, at: 0.5 + sw * 0.5, room: 0.14, minIntensity: 0.52 });
  }
  if (opts.doubleKick && step === 0) {
    out.push({ inst: 'kick', midi: opts.kickMidi, dur: 0.17, vol: 0.25, at: 0.5, room: 0.12, minIntensity: 0.68 });
  }
  if (step === 1 || step === 3) {
    out.push({ inst: 'snare', midi: 0, dur: 0.17, vol: opts.climax ? 0.3 : 0.26, pan: 0.08, room: 0.36, reverb: 0.12, minIntensity: 0.44 });
  }
  // Ghost snare syncopation for human pocket
  if (step === 1 && !opts.tribal) {
    out.push({ inst: 'snare', midi: 0, dur: 0.09, vol: 0.09, at: 0.75 + sw * 0.5, pan: 0.1, room: 0.28, bright: 0.65, minIntensity: 0.58 });
  }

  // Ride cymbal opens up in B / D climax; crisp hats drive A
  if (opts.climax || (opts.bSection && pass % 2 === 1)) {
    out.push({ inst: 'ride', midi: 0, dur: 0.36, vol: step % 2 === 0 ? 0.16 : 0.11, pan: 0.52, room: 0.24, reverb: 0.16, minIntensity: 0.45 });
    out.push({ inst: 'ride', midi: 0, dur: 0.24, vol: 0.11, at: 0.5 + sw, pan: 0.54, room: 0.22, minIntensity: 0.52 });
  } else {
    out.push({ inst: 'hat', midi: 0, dur: 0.07, vol: step % 2 === 0 ? 0.14 : 0.09, pan: 0.42, room: 0.14, minIntensity: 0.4 });
    const isOpen = step === 3 && bar % 2 === 1;
    out.push({
      inst: isOpen ? 'openhat' : 'hat',
      midi: 0,
      dur: isOpen ? 0.26 : 0.07,
      vol: isOpen ? 0.15 : 0.12,
      at: 0.5 + sw,
      pan: 0.45,
      room: isOpen ? 0.26 : 0.14,
      minIntensity: 0.44,
    });
  }

  // Phrase-end tom / taiko fills (alternating patterns across passes so loops never feel canned)
  if (bar % 4 === 3 && step === 3) {
    const alt = (Math.floor(bar / 4) + pass) % 2 === 1;
    if (alt) {
      out.push({ inst: 'tom', midi: 52, dur: 0.22, vol: 0.26, at: 0.25, pan: -0.45, room: 0.36, minIntensity: 0.46 });
      out.push({ inst: 'tom', midi: 48, dur: 0.24, vol: 0.28, at: 0.5, pan: 0.05, room: 0.36, minIntensity: 0.46 });
      out.push({ inst: 'tom', midi: 43, dur: 0.32, vol: 0.32, at: 0.75, pan: 0.48, room: 0.4, minIntensity: 0.46 });
    } else {
      out.push({ inst: 'snare', midi: 0, dur: 0.12, vol: 0.21, at: 0.25, pan: 0.08, room: 0.34, minIntensity: 0.46 });
      out.push({ inst: 'taiko', midi: 45, dur: 0.26, vol: 0.28, at: 0.5, pan: -0.35, room: 0.36, reverb: 0.25, minIntensity: 0.46 });
      out.push({ inst: 'taiko', midi: 40, dur: 0.34, vol: 0.32, at: 0.75, pan: 0.38, room: 0.4, reverb: 0.28, minIntensity: 0.46 });
    }
  }
}

type MelEvent = [midi: number, dur: number, at?: number, slide?: number] | null;

// =========================================================================
// 1. CAMP (92 BPM, D Dorian, 32 bars) — Warm Fireside Tavern & Breathy Flute
// =========================================================================

const CAMP_BARS: ReadonlyArray<{ root: number; bass2: number; pad: number[]; arp: number[] }> = [
  // A (0-7): Dm9 - G13 - Cmaj9 - Am7 | Dm9 - G6 - Fmaj7 - Asus4
  { root: 50, bass2: 57, pad: [50, 57, 60, 64], arp: [50, 57, 62, 65, 69, 72] },
  { root: 43, bass2: 50, pad: [43, 55, 59, 64], arp: [43, 55, 59, 62, 67, 71] },
  { root: 48, bass2: 55, pad: [48, 55, 59, 62], arp: [48, 55, 60, 64, 67, 71] },
  { root: 45, bass2: 52, pad: [45, 52, 57, 60], arp: [45, 52, 57, 60, 64, 69] },
  { root: 50, bass2: 57, pad: [50, 57, 60, 64], arp: [50, 57, 62, 65, 69, 72] },
  { root: 43, bass2: 50, pad: [43, 55, 59, 62], arp: [43, 55, 59, 64, 67, 74] },
  { root: 41, bass2: 48, pad: [41, 53, 57, 60], arp: [41, 53, 57, 60, 64, 69] },
  { root: 45, bass2: 52, pad: [45, 52, 57, 62], arp: [45, 52, 57, 62, 64, 69] },
  // B (8-15): Bbmaj7 - C6 - Dm9 - C/E | Gm7 - Am7 - Bbmaj7 - A7sus4
  { root: 46, bass2: 53, pad: [46, 53, 57, 62], arp: [46, 53, 58, 62, 65, 69] },
  { root: 48, bass2: 55, pad: [48, 55, 57, 64], arp: [48, 55, 60, 64, 67, 72] },
  { root: 50, bass2: 57, pad: [50, 57, 62, 65], arp: [50, 57, 62, 65, 69, 74] },
  { root: 52, bass2: 55, pad: [52, 55, 60, 67], arp: [52, 55, 60, 64, 67, 72] },
  { root: 43, bass2: 50, pad: [43, 50, 55, 58], arp: [43, 50, 55, 58, 62, 67] },
  { root: 45, bass2: 52, pad: [45, 52, 57, 60], arp: [45, 52, 57, 60, 64, 69] },
  { root: 46, bass2: 53, pad: [46, 53, 57, 62], arp: [46, 53, 58, 62, 65, 69] },
  { root: 45, bass2: 52, pad: [45, 52, 57, 62], arp: [45, 52, 57, 61, 64, 69] },
  // C (16-23): Quiet Hearth Interlude (Fmaj7 - Em7 - Dm9 - Cmaj7 | Bbmaj7 - Am7 - Gm7 - Asus4)
  { root: 41, bass2: 48, pad: [48, 53, 57, 64], arp: [41, 53, 57, 60, 64, 69] },
  { root: 40, bass2: 47, pad: [47, 52, 55, 62], arp: [40, 52, 55, 59, 62, 67] },
  { root: 50, bass2: 57, pad: [50, 57, 60, 64], arp: [50, 57, 62, 65, 69, 72] },
  { root: 48, bass2: 55, pad: [48, 55, 59, 64], arp: [48, 55, 60, 64, 67, 71] },
  { root: 46, bass2: 53, pad: [46, 53, 57, 62], arp: [46, 53, 58, 62, 65, 69] },
  { root: 45, bass2: 52, pad: [45, 52, 57, 60], arp: [45, 52, 57, 60, 64, 69] },
  { root: 43, bass2: 50, pad: [43, 50, 55, 58], arp: [43, 50, 55, 58, 62, 67] },
  { root: 45, bass2: 52, pad: [45, 52, 57, 62], arp: [45, 52, 57, 62, 64, 69] },
  // D (24-31): Warm Swell & Resolution (Dm9 - G13 - Fmaj7 - C/E | Bbmaj7 - C6 - Dm9 - A7sus4)
  { root: 50, bass2: 57, pad: [50, 57, 60, 64], arp: [50, 57, 62, 65, 69, 74] },
  { root: 43, bass2: 50, pad: [43, 55, 59, 64], arp: [43, 55, 59, 64, 67, 74] },
  { root: 41, bass2: 48, pad: [48, 53, 57, 64], arp: [41, 53, 57, 60, 64, 72] },
  { root: 52, bass2: 55, pad: [52, 55, 60, 67], arp: [52, 55, 60, 64, 67, 72] },
  { root: 46, bass2: 53, pad: [46, 53, 57, 62], arp: [46, 53, 58, 62, 65, 69] },
  { root: 48, bass2: 55, pad: [48, 55, 60, 64], arp: [48, 55, 60, 64, 67, 72] },
  { root: 50, bass2: 57, pad: [50, 57, 62, 65], arp: [50, 57, 62, 65, 69, 74] },
  { root: 45, bass2: 52, pad: [45, 52, 57, 62], arp: [45, 52, 57, 61, 64, 69] },
];

const CAMP_FLUTE: ReadonlyArray<MelEvent> = [
  // Bars 0-3: acoustic lute & harp intro breathes cleanly
  null, null, null, null, null, null, null, null,
  null, null, null, null, null, null, null, null,
  // Bars 4-7: lyrical Dorian flute with rests
  [69, 1.4], null, [72, 0.5, 0.5], [74, 1.6],
  [71, 1.4], null, [69, 0.5, 0.5], [67, 1.5],
  [69, 1.3], null, [67, 0.6], [65, 1.1],
  [64, 2.4], null, null, null,
  // Bars 8-15: B section rises warmly
  [65, 1.4], null, [69, 0.5, 0.5], [70, 1.5],
  [72, 1.4], null, [74, 0.5, 0.5], [76, 1.6],
  [74, 1.8], null, [72, 0.6], [69, 1.2],
  [67, 2.2], null, null, null,
  [70, 1.4], null, [69, 0.5, 0.5], [67, 1.2],
  [69, 1.4], null, [67, 0.5, 0.5], [64, 1.2],
  [65, 1.5], null, [62, 0.6], [64, 1.2],
  [64, 2.5], null, null, null,
  // Bars 16-23: C interlude — sparse call-and-response with harp
  [72, 2.0], null, null, [69, 0.9],
  [67, 2.2], null, null, null,
  [65, 1.4], null, [67, 0.6], [69, 1.6],
  [64, 2.4], null, null, null,
  null, null, [70, 1.2], [69, 0.9],
  [67, 1.8], null, [64, 1.2], null,
  [62, 1.6], null, [65, 1.2], null,
  [64, 2.6], null, null, null,
  // Bars 24-31: D glowing reprise (octave lift)
  [74, 1.5], null, [76, 0.5, 0.5], [77, 1.6],
  [76, 1.4], null, [74, 0.5, 0.5], [71, 1.5],
  [72, 1.5], null, [69, 0.6], [67, 1.2],
  [69, 2.2], null, null, null,
  [70, 1.4], null, [72, 0.5, 0.5], [74, 1.4],
  [76, 1.6], null, [74, 0.6], [72, 1.2],
  [74, 2.2], null, [69, 1.0], null,
  [69, 2.8], null, null, null,
];

function campNotes(beat: number): ScoreNote[] {
  const b = beat % PHRASE_BEATS, bar = Math.floor(b / 4), step = b % 4, pass = Math.floor(beat / PHRASE_BEATS);
  const ch = CAMP_BARS[bar];
  const arc = phraseArc(bar);
  const sw = 0.042; // gentle fireside folk swing
  const out: ScoreNote[] = [];

  if (step === 0) {
    widePad(out, 'strings', ch.pad, 4.0, 0.17 * arc, { bright: bar >= 24 ? 0.95 : 0.78 });
    out.push({ inst: 'bass', midi: ch.root - 12, dur: 2.1, vol: 0.24 * arc, pan: 0, room: 0.14, bright: 0.7 });
  }
  if (step === 2) {
    out.push({ inst: 'bass', midi: ch.bass2 - 12, dur: 1.6, vol: 0.17 * arc, pan: 0, room: 0.14, bright: 0.65 });
  }

  // Fingerpicked Karplus-Strong lute Travis groove (crisp wooden body, tight room, no delay smear)
  const pat = [0, 2, 4, 3, 1, 4, 5, 2];
  const p1 = ch.arp[pat[step * 2]], p2 = ch.arp[pat[step * 2 + 1]];
  const j1 = detJitter(beat * 7 + 1) * 0.008;
  out.push({ inst: 'lute', midi: p1, dur: 1.2, vol: (step === 0 ? 0.27 : 0.2) * arc, at: Math.max(0, j1), pan: -0.44, room: 0.32, reverb: 0.18, bright: 1.05 });
  if (bar < 16 || bar >= 24 || step % 2 === 0) {
    out.push({ inst: 'lute', midi: p2, dur: 0.95, vol: 0.16 * arc, at: 0.5 + sw, pan: -0.34, room: 0.3, reverb: 0.18, bright: 0.96 });
  }

  // Cascading Celtic harp sparkles on alternating downbeats & C interlude
  if (step === 0 && (bar % 2 === 0 || (bar >= 16 && bar < 24))) {
    const oct = pass % 2 === 1 && bar >= 24 ? 12 : 0;
    harpGliss(out, [ch.arp[2], ch.arp[4], ch.arp[5], ch.arp[3] + 12].map((m) => m + oct), 1.9, 0.16 * arc, 0, 0.07);
  }
  if (step === 3 && bar % 4 === 3) {
    out.push({ inst: 'bell', midi: ch.arp[5] + 12, dur: 2.8, vol: 0.11, at: 0.5 + sw, pan: 0.56, reverb: 0.8, delay: 0.42 });
  }

  // Gentle tavern percussion (warm rim + shaker + soft hearth taiko)
  out.push({ inst: 'shaker', midi: 0, dur: 0.1, vol: (step % 2 === 0 ? 0.055 : 0.09) * arc, at: 0.5 + sw, pan: 0.46, room: 0.22 });
  if (step === 2 && bar >= 4 && (bar < 16 || bar >= 24)) {
    out.push({ inst: 'rim', midi: 0, dur: 0.08, vol: 0.13 * arc, pan: 0.28, room: 0.35 });
  }
  if (step === 0 && bar >= 4 && (bar < 16 || bar >= 24)) {
    out.push({ inst: 'taiko', midi: ch.root - 12, dur: 0.48, vol: 0.15 * arc, pan: -0.14, room: 0.32, reverb: 0.25 });
  }

  const m = CAMP_FLUTE[b];
  if (m) {
    out.push({
      inst: 'flute',
      midi: m[0],
      dur: m[1],
      vol: 0.23 * arc,
      at: m[2] ?? 0,
      pan: 0.2,
      reverb: 0.62,
      delay: 0.34,
      bright: 1.05,
      minIntensity: 0.28,
    });
  }
  return out;
}

// =========================================================================
// 2. KEEP (122 BPM, D Minor, 32 bars) — Heroic Hades/Dead Cells Folk-Rock
// =========================================================================

const D_MIN_PCS = [2, 4, 5, 7, 9, 10, 0]; // D E F G A Bb C

const KEEP_BARS: ReadonlyArray<{ root: number; chord: number[]; pad: number[] }> = [
  // A (0-7): Dm - Bb - C - Am | Dm - Bb - Gm - A7
  { root: 38, chord: [50, 57, 62, 65], pad: [50, 57, 62, 65] },
  { root: 34, chord: [46, 53, 58, 62], pad: [46, 53, 58, 62] },
  { root: 36, chord: [48, 55, 60, 64], pad: [48, 55, 60, 64] },
  { root: 33, chord: [45, 52, 57, 60], pad: [45, 52, 57, 60] },
  { root: 38, chord: [50, 57, 62, 65], pad: [50, 57, 62, 65] },
  { root: 34, chord: [46, 53, 58, 62], pad: [46, 53, 58, 62] },
  { root: 31, chord: [43, 50, 55, 58], pad: [43, 50, 55, 58] },
  { root: 33, chord: [45, 52, 57, 61], pad: [45, 52, 57, 61] },
  // B (8-15): Heroic Chorus — Bb - C - Dm - F | Gm - Dm/F - Bb - A7
  { root: 34, chord: [46, 53, 58, 62], pad: [53, 58, 62, 65] },
  { root: 36, chord: [48, 55, 60, 64], pad: [55, 60, 64, 67] },
  { root: 38, chord: [50, 57, 62, 65], pad: [57, 62, 65, 69] },
  { root: 41, chord: [53, 57, 60, 65], pad: [57, 60, 65, 69] },
  { root: 31, chord: [43, 50, 55, 58], pad: [50, 55, 58, 62] },
  { root: 41, chord: [50, 53, 57, 62], pad: [53, 57, 62, 65] },
  { root: 34, chord: [46, 53, 58, 62], pad: [50, 53, 58, 62] },
  { root: 33, chord: [45, 52, 57, 61], pad: [49, 52, 57, 61] },
  // C (16-23): Half-time Torchlit Breakdown — Dm - C/E - F - Gm | Bb - Am - Gm - A7
  { root: 38, chord: [50, 57, 62, 65], pad: [50, 57, 62, 65] },
  { root: 40, chord: [52, 55, 60, 64], pad: [52, 55, 60, 64] },
  { root: 41, chord: [53, 57, 60, 65], pad: [53, 57, 60, 65] },
  { root: 31, chord: [43, 50, 55, 58], pad: [50, 55, 58, 62] },
  { root: 34, chord: [46, 53, 58, 62], pad: [53, 58, 62, 65] },
  { root: 33, chord: [45, 52, 57, 60], pad: [52, 57, 60, 64] },
  { root: 31, chord: [43, 50, 55, 58], pad: [50, 55, 58, 62] },
  { root: 33, chord: [45, 52, 57, 61], pad: [49, 52, 57, 61] },
  // D (24-31): Climax Reprise — Dm - Bb - C - F | Gm - Bb - C - A7
  { root: 38, chord: [50, 57, 62, 65], pad: [57, 62, 65, 69] },
  { root: 34, chord: [46, 53, 58, 62], pad: [53, 58, 62, 65] },
  { root: 36, chord: [48, 55, 60, 64], pad: [55, 60, 64, 67] },
  { root: 41, chord: [53, 57, 60, 65], pad: [57, 60, 65, 69] },
  { root: 31, chord: [43, 50, 55, 58], pad: [50, 55, 58, 62] },
  { root: 34, chord: [46, 53, 58, 62], pad: [53, 58, 62, 65] },
  { root: 36, chord: [48, 55, 60, 64], pad: [55, 60, 64, 67] },
  { root: 33, chord: [45, 52, 57, 61], pad: [49, 52, 57, 61] },
];

const KEEP_FIDDLE: ReadonlyArray<MelEvent> = [
  // A (0-7): Punchy folk-rock hook with breathing rests
  [62, 0.75, 0, -0.3], [65, 0.45, 0.5], [67, 0.85], [69, 1.5],
  null, [70, 0.7], [69, 0.45, 0.5], [65, 1.4],
  [64, 0.8], [67, 0.45, 0.5], [69, 0.9], [67, 1.1],
  [64, 1.8], null, null, [60, 0.65, 0.25],
  [62, 0.75, 0, -0.3], [65, 0.45, 0.5], [69, 0.85], [74, 1.6],
  null, [72, 0.65], [70, 0.45, 0.5], [69, 1.3],
  [67, 0.8], [70, 0.45, 0.5], [69, 0.85], [67, 0.9],
  [64, 1.3], null, [61, 1.4], null,
  // B (8-15): Soaring heroic chorus
  [70, 1.5, 0, -0.25], null, [69, 0.45, 0.5], [70, 0.95],
  [72, 1.5], null, [74, 0.45, 0.5], [76, 1.0],
  [74, 2.0], null, [72, 0.55], [69, 1.1],
  [72, 1.6], null, null, [69, 0.75, 0.25],
  [67, 0.9], [69, 0.45, 0.5], [70, 1.0], [74, 1.4],
  [72, 1.1], null, [69, 0.85], [65, 1.1],
  [65, 1.3], null, [67, 0.9], [69, 0.9],
  [64, 1.4], null, [61, 1.3], null,
  // C (16-23): Call-and-response lyrical breakdown
  [62, 2.2], null, null, [65, 0.8],
  [64, 2.0], null, null, null,
  [65, 1.4], null, [67, 0.7], [69, 1.6],
  [70, 2.2], null, null, null,
  null, [74, 1.2], [72, 0.8], [70, 1.0],
  [69, 2.0], null, null, [65, 0.8],
  [67, 1.6], null, [69, 1.2], null,
  [64, 1.6], null, [61, 1.4], null,
  // D (24-31): Climax with octave fireworks!
  [74, 0.8, 0, -0.35], [77, 0.45, 0.5], [79, 0.9], [81, 1.5],
  null, [82, 0.75], [81, 0.45, 0.5], [77, 1.3],
  [76, 0.9], [79, 0.45, 0.5], [81, 0.95], [79, 1.1],
  [77, 1.8], null, [74, 0.9], null,
  [79, 0.9], [77, 0.45, 0.5], [74, 0.95], [70, 1.2],
  [74, 1.4], null, [77, 0.9], [79, 0.9],
  [81, 1.6], null, [79, 0.9], [76, 0.9],
  [76, 1.4], null, [73, 1.5], null,
];

function keepNotes(beat: number, ctx?: ScoreContext): ScoreNote[] {
  const b = beat % PHRASE_BEATS, bar = Math.floor(b / 4), step = b % 4, pass = Math.floor(beat / PHRASE_BEATS);
  const info = KEEP_BARS[bar];
  const arc = phraseArc(bar);
  const breakdown = bar >= 16 && bar < 24 && !ctx?.ambush;
  const climax = bar >= 24 || !!ctx?.ambush;
  const bSection = bar >= 8 && bar < 16;
  const out: ScoreNote[] = [];

  if (step === 0) {
    widePad(out, 'strings', info.pad, 4.0, (breakdown ? 0.2 : 0.16) * arc, { bright: climax ? 1.1 : 0.9 });
  }

  // Acoustic Karplus-Strong lute ostinato (tight room, left stereo anchor, zero delay mud)
  const ch = info.chord;
  out.push({ inst: 'lute', midi: ch[step % 4], dur: 0.72, vol: (step === 0 ? 0.28 : 0.21) * arc, pan: -0.46, room: 0.3, reverb: 0.12, bright: 1.15 });
  if (!breakdown || step % 2 === 0) {
    out.push({ inst: 'lute', midi: ch[(step + 2) % 4] + (step === 3 ? 12 : 0), dur: 0.52, vol: 0.16 * arc, at: 0.5, pan: -0.34, room: 0.28, reverb: 0.12, bright: 1.0 });
  }
  if (!breakdown && (step === 1 || step === 3)) {
    out.push({ inst: 'lute', midi: ch[1], dur: 0.3, vol: 0.1 * arc, at: 0.75, pan: -0.5, room: 0.24, bright: 0.9, minIntensity: 0.45 });
  }
  // Sparkling harp arpeggio in C breakdown
  if (breakdown && step === 0 && bar % 2 === 0) {
    harpGliss(out, [...ch, ch[0] + 12], 1.8, 0.16 * arc, 0, 0.06);
  }

  // Driving syncopated bass with smooth turnaround pickups
  out.push({ inst: 'bass', midi: info.root, dur: breakdown ? 1.8 : 0.58, vol: (step === 0 ? 0.34 : 0.24) * arc, pan: 0, room: 0.12, bright: climax ? 1.18 : 1.0 });
  if (!breakdown && (step === 0 || step === 2)) {
    out.push({ inst: 'bass', midi: info.root + 12, dur: 0.38, vol: 0.19 * arc, at: 0.5, pan: 0, room: 0.12, minIntensity: 0.38 });
  }
  if (!breakdown && step === 3) {
    const nextRoot = KEEP_BARS[(bar + 1) % 32].root;
    out.push({ inst: 'bass', midi: nextRoot + 12, dur: 0.28, vol: 0.18 * arc, at: 0.75, pan: 0, room: 0.12, minIntensity: 0.48 });
  }

  addKit(out, bar, step, pass, { breakdown, climax, bSection, kickMidi: 40 });

  // Heroic brass hits in B & D sections (wide right/left stereo)
  if ((bSection || climax) && step === 0) {
    out.push({ inst: 'brass', midi: info.root + 24, dur: 1.5, vol: 0.22 * arc, pan: 0.48, reverb: 0.56, bright: 1.15, minIntensity: 0.52 });
    out.push({ inst: 'brass', midi: info.root + 19, dur: 1.5, vol: 0.18 * arc, pan: -0.48, reverb: 0.56, bright: 1.05, minIntensity: 0.68 });
  }
  if (climax && step === 2 && bar % 2 === 0) {
    out.push({ inst: 'brass', midi: info.chord[2], dur: 0.85, vol: 0.18 * arc, at: 0.5, pan: 0.52, reverb: 0.5, minIntensity: 0.62 });
  }

  // Expressive bowed Fiddle solo (+ diatonic 3rd harmony in D climax!)
  const lm = KEEP_FIDDLE[b];
  if (lm) {
    out.push({
      inst: 'fiddle',
      midi: lm[0],
      dur: lm[1],
      vol: 0.24 * arc,
      at: lm[2] ?? 0,
      slide: lm[3],
      pan: 0.18,
      reverb: 0.5,
      delay: 0.34,
      bright: climax ? 1.22 : 1.08,
      minIntensity: breakdown ? 0.26 : 0.36,
    });
    if (climax && bar >= 24) {
      out.push({
        inst: 'fiddle',
        midi: diatonicHarmony(lm[0], D_MIN_PCS, 2),
        dur: lm[1],
        vol: 0.14 * arc,
        at: lm[2] ?? 0,
        pan: -0.36,
        reverb: 0.52,
        delay: 0.28,
        bright: 1.0,
        minIntensity: 0.66,
      });
    }
  }

  addArchetypeAccent(out, ctx, bar, step, info.root, info.chord[3], breakdown);
  addAmbushLayer(out, ctx, bar, step, info.root, info.root + 19);
  return out;
}

// =========================================================================
// 3. CRYPT (124 BPM, C Harmonic Minor, 32 bars) — Gothic Cathedral Baroque
// =========================================================================

const C_HMIN_PCS = [0, 2, 3, 5, 7, 8, 11]; // C D Eb F G Ab B

const CRYPT_BARS: ReadonlyArray<{ root: number; triad: number[]; org: number[] }> = [
  // A (0-7): Cm - Ab - Fm - G7 | Cm - Bb - Ab - G7
  { root: 36, triad: [60, 63, 67, 72], org: [48, 55, 60, 63] },
  { root: 32, triad: [56, 60, 63, 68], org: [44, 51, 56, 60] },
  { root: 29, triad: [53, 56, 60, 65], org: [41, 48, 53, 56] },
  { root: 31, triad: [55, 59, 62, 67], org: [43, 50, 55, 59] },
  { root: 36, triad: [60, 63, 67, 72], org: [48, 55, 60, 63] },
  { root: 34, triad: [58, 62, 65, 70], org: [46, 53, 58, 62] },
  { root: 32, triad: [56, 60, 63, 68], org: [44, 51, 56, 60] },
  { root: 31, triad: [55, 59, 62, 65], org: [43, 50, 55, 59] },
  // B (8-15): Eb - Bb - Cm - G7 | Fm - Cm - Ab - G7
  { root: 39, triad: [63, 67, 70, 75], org: [51, 58, 63, 67] },
  { root: 34, triad: [58, 62, 65, 70], org: [46, 53, 58, 62] },
  { root: 36, triad: [60, 63, 67, 72], org: [48, 55, 60, 63] },
  { root: 31, triad: [55, 59, 62, 67], org: [43, 50, 55, 59] },
  { root: 29, triad: [53, 56, 60, 65], org: [41, 48, 53, 56] },
  { root: 36, triad: [60, 63, 67, 72], org: [48, 55, 60, 63] },
  { root: 32, triad: [56, 60, 63, 68], org: [44, 51, 56, 60] },
  { root: 31, triad: [55, 59, 62, 67], org: [43, 50, 55, 59] },
  // C (16-23): Cathedral Nave Breakdown — Cm - G/B - Ab - Fm | Db(Neapolitan) - Cm - Gsus4 - G7
  { root: 36, triad: [60, 63, 67, 72], org: [48, 55, 60, 63] },
  { root: 35, triad: [59, 62, 67, 71], org: [47, 55, 59, 62] },
  { root: 32, triad: [56, 60, 63, 68], org: [44, 51, 56, 60] },
  { root: 29, triad: [53, 56, 60, 65], org: [41, 48, 53, 56] },
  { root: 37, triad: [61, 65, 68, 73], org: [49, 56, 61, 65] },
  { root: 36, triad: [60, 63, 67, 72], org: [48, 55, 60, 63] },
  { root: 31, triad: [55, 60, 62, 67], org: [43, 50, 55, 60] },
  { root: 31, triad: [55, 59, 62, 67], org: [43, 50, 55, 59] },
  // D (24-31): Gothic Climax — Cm - Ab - Bb - G7 | Fm - Eb - Ab - G7
  { root: 36, triad: [60, 63, 67, 72], org: [48, 55, 60, 63] },
  { root: 32, triad: [56, 60, 63, 68], org: [44, 51, 56, 60] },
  { root: 34, triad: [58, 62, 65, 70], org: [46, 53, 58, 62] },
  { root: 31, triad: [55, 59, 62, 67], org: [43, 50, 55, 59] },
  { root: 29, triad: [53, 56, 60, 65], org: [41, 48, 53, 56] },
  { root: 39, triad: [63, 67, 70, 75], org: [51, 58, 63, 67] },
  { root: 32, triad: [56, 60, 63, 68], org: [44, 51, 56, 60] },
  { root: 31, triad: [55, 59, 62, 67], org: [43, 50, 55, 59] },
];

const CRYPT_REED: ReadonlyArray<MelEvent> = [
  // A (0-7): Baroque motif with rests
  [72, 1.4], null, [75, 0.8], [74, 0.9],
  [72, 1.5], null, [68, 0.85], [70, 0.9],
  [68, 0.9], [67, 0.8], [65, 1.4], null,
  [67, 0.85], [71, 0.85], [74, 1.6], null,
  [72, 0.8], [74, 0.8], [75, 1.5], null,
  [74, 0.9], [70, 0.85], [65, 1.4], null,
  [68, 0.85], [72, 0.85], [75, 0.9], [72, 0.9],
  [71, 1.8], null, [67, 1.2], null,
  // B (8-15): Sweeping gothic arch
  [75, 1.5], null, [79, 0.85], [77, 0.9],
  [74, 1.5], null, [77, 0.85], [74, 0.9],
  [72, 1.5], null, [75, 0.85], [72, 0.9],
  [71, 0.95], [74, 0.85], [79, 1.6], null,
  [77, 1.2], [75, 0.75], [72, 1.0], [68, 0.9],
  [72, 1.3], null, [74, 0.9], [72, 0.9],
  [72, 1.2], [68, 0.75], [67, 1.0], [63, 0.9],
  [67, 0.95], [71, 0.95], [74, 1.6], null,
  // C (16-23): Haunting pipe-reed dialogue
  [72, 2.2], null, null, [74, 0.8],
  [71, 2.2], null, null, null,
  [68, 1.5], null, [72, 0.9], [75, 1.3],
  [77, 2.2], null, null, null,
  [73, 1.6], null, [72, 0.9], [68, 1.0],
  [72, 2.0], null, null, null,
  [74, 1.6], null, [72, 0.9], [71, 1.0],
  [74, 1.8], null, [79, 1.4], null,
  // D (24-31): Cathedral climax
  [84, 1.4], null, [79, 0.85], [75, 0.9],
  [80, 1.4], null, [75, 0.85], [72, 0.9],
  [77, 1.4], null, [74, 0.85], [70, 0.9],
  [79, 1.5], null, [74, 0.9], [71, 0.9],
  [77, 1.2], [80, 0.8], [79, 1.0], [77, 0.9],
  [75, 1.4], null, [79, 0.9], [82, 0.9],
  [80, 1.5], null, [75, 0.9], [72, 0.9],
  [79, 1.2], [74, 0.8], [71, 1.5], null,
];

function cryptNotes(beat: number, ctx?: ScoreContext): ScoreNote[] {
  const b = beat % PHRASE_BEATS, bar = Math.floor(b / 4), step = b % 4, pass = Math.floor(beat / PHRASE_BEATS);
  const info = CRYPT_BARS[bar];
  const arc = phraseArc(bar);
  const breakdown = bar >= 16 && bar < 24 && !ctx?.ambush;
  const climax = bar >= 24 || !!ctx?.ambush;
  const bSection = bar >= 8 && bar < 16;
  const out: ScoreNote[] = [];

  if (step === 0) {
    widePad(out, 'organ', info.org, 3.9, (breakdown ? 0.17 : 0.15) * arc, { reverb: 0.78, bright: climax ? 1.12 : 0.94 });
  }

  // Karplus-Strong Baroque harpsichord arpeggio (crisp, bright, tight room — never muddied by delay!)
  const t = info.triad;
  const seq = [t[0], t[1], t[2], t[3], t[2], t[1], t[3], t[2]];
  out.push({ inst: 'harpsi', midi: seq[step * 2], dur: 0.45, vol: 0.2 * arc, pan: -0.48, room: 0.32, reverb: 0.2, bright: 1.15 });
  if (!breakdown || step % 2 === 0) {
    out.push({ inst: 'harpsi', midi: seq[step * 2 + 1], dur: 0.38, vol: 0.16 * arc, at: 0.5, pan: -0.34, room: 0.3, reverb: 0.2, bright: 1.05 });
  }
  if (!breakdown && (bSection || climax || step === 1 || step === 3)) {
    const oct = pass % 2 === 1 && climax ? 12 : 0;
    out.push({ inst: 'harpsi', midi: t[(step + 2) % 4] + oct, dur: 0.24, vol: 0.11 * arc, at: 0.25, pan: -0.54, room: 0.28, minIntensity: 0.5 });
    out.push({ inst: 'harpsi', midi: t[(step + 1) % 4] + oct, dur: 0.24, vol: 0.11 * arc, at: 0.75, pan: -0.26, room: 0.28, minIntensity: 0.62 });
  }

  if (breakdown && step === 0 && bar % 2 === 0) {
    harpGliss(out, t, 2.0, 0.16 * arc, 0, 0.065);
  }

  // Deep pulsing gothic bass
  out.push({ inst: 'bass', midi: info.root, dur: breakdown ? 1.9 : 0.62, vol: 0.3 * arc, pan: 0, room: 0.12 });
  if (!breakdown) {
    out.push({ inst: 'bass', midi: info.root + 7, dur: 0.38, vol: 0.18 * arc, at: 0.5, pan: 0, room: 0.12, minIntensity: 0.4 });
  }

  // Cathedral bells tolling on phrase anchors
  if (step === 0 && bar % 4 === 0) {
    out.push({ inst: 'bell', midi: info.root + 36, dur: 3.4, vol: 0.16 * arc, pan: 0.6, reverb: 0.86, delay: 0.4 });
  }

  addKit(out, bar, step, pass, { breakdown, climax, bSection, kickMidi: 36 });
  if (!breakdown && step === 2) {
    out.push({ inst: 'taiko', midi: info.root + 12, dur: 0.42, vol: 0.24 * arc, pan: -0.28, room: 0.38, reverb: 0.32, minIntensity: 0.42 });
  }

  // Baroque hollow reed solo (+ diatonic cathedral harmony in D climax)
  const lm = CRYPT_REED[b];
  if (lm) {
    out.push({
      inst: 'reed',
      midi: lm[0],
      dur: lm[1],
      vol: 0.23 * arc,
      at: lm[2] ?? 0,
      pan: 0.22,
      reverb: 0.6,
      delay: 0.36,
      bright: climax ? 1.18 : 1.04,
      minIntensity: breakdown ? 0.25 : 0.36,
    });
    if (climax && bar >= 24) {
      out.push({
        inst: 'fiddle',
        midi: diatonicHarmony(lm[0], C_HMIN_PCS, 2),
        dur: lm[1],
        vol: 0.14 * arc,
        pan: -0.34,
        reverb: 0.58,
        minIntensity: 0.68,
      });
    }
  }

  addArchetypeAccent(out, ctx, bar, step, info.root, info.triad[3], breakdown);
  addAmbushLayer(out, ctx, bar, step, info.root, info.root + 19);
  return out;
}

// =========================================================================
// 4. CATACOMBS (128 BPM, E Phrygian Dominant, 32 bars) — Oud & Tribal Pulse
// =========================================================================

const E_PHRYG_PCS = [4, 5, 8, 9, 11, 0, 2]; // E F G# A B C D

const CATA_BARS: ReadonlyArray<{ root: number; arp: number[]; pad: number[] }> = [
  // A (0-7): Em - F - G - F | E - F - Dm - E
  { root: 40, arp: [52, 55, 59, 64, 67], pad: [52, 59, 64] },
  { root: 41, arp: [53, 57, 60, 65, 69], pad: [53, 60, 65] },
  { root: 43, arp: [55, 59, 62, 67, 71], pad: [55, 62, 67] },
  { root: 41, arp: [53, 57, 60, 64, 69], pad: [53, 60, 64] },
  { root: 40, arp: [52, 56, 59, 64, 68], pad: [52, 56, 59, 64] },
  { root: 41, arp: [53, 57, 60, 65, 69], pad: [53, 60, 65] },
  { root: 38, arp: [50, 53, 57, 62, 65], pad: [50, 57, 62] },
  { root: 40, arp: [52, 56, 59, 64, 68], pad: [52, 56, 59, 64] },
  // B (8-15): Andalusian Cadence — Am - G - F - E | Dm - F - G - E
  { root: 33, arp: [57, 60, 64, 69, 72], pad: [45, 52, 57, 60] },
  { root: 31, arp: [55, 59, 62, 67, 71], pad: [43, 50, 55, 59] },
  { root: 29, arp: [53, 57, 60, 65, 69], pad: [41, 48, 53, 57] },
  { root: 28, arp: [52, 56, 59, 64, 68], pad: [40, 47, 52, 56] },
  { root: 38, arp: [50, 53, 57, 62, 65], pad: [50, 53, 57, 62] },
  { root: 41, arp: [53, 57, 60, 65, 69], pad: [53, 57, 60, 65] },
  { root: 43, arp: [55, 59, 62, 67, 71], pad: [55, 59, 62, 67] },
  { root: 40, arp: [52, 56, 59, 64, 68], pad: [52, 56, 59, 64] },
  // C (16-23): Hypnotic Bone-Labyrinth Breakdown — E pedal over E - F - Dm/E - E (x2)
  { root: 40, arp: [52, 56, 59, 64, 68], pad: [52, 59, 64] },
  { root: 40, arp: [53, 57, 60, 65, 69], pad: [52, 60, 65] },
  { root: 40, arp: [50, 53, 57, 62, 65], pad: [52, 57, 62] },
  { root: 40, arp: [52, 56, 59, 64, 68], pad: [52, 56, 59] },
  { root: 40, arp: [52, 56, 59, 64, 68], pad: [52, 59, 64] },
  { root: 41, arp: [53, 57, 60, 65, 69], pad: [53, 60, 65] },
  { root: 38, arp: [50, 53, 57, 62, 65], pad: [50, 57, 62] },
  { root: 40, arp: [52, 56, 59, 64, 68], pad: [52, 56, 59, 64] },
  // D (24-31): Fiery Flamenco-Metal Climax — Am - G - F - E | F - Dm - F - E
  { root: 33, arp: [57, 60, 64, 69, 72], pad: [52, 57, 60, 64] },
  { root: 31, arp: [55, 59, 62, 67, 71], pad: [50, 55, 59, 62] },
  { root: 29, arp: [53, 57, 60, 65, 69], pad: [53, 57, 60, 65] },
  { root: 28, arp: [52, 56, 59, 64, 68], pad: [52, 56, 59, 64] },
  { root: 41, arp: [53, 57, 60, 65, 69], pad: [53, 57, 60, 65] },
  { root: 38, arp: [50, 53, 57, 62, 65], pad: [50, 53, 57, 62] },
  { root: 41, arp: [53, 57, 60, 65, 69], pad: [53, 57, 60, 65] },
  { root: 40, arp: [52, 56, 59, 64, 68], pad: [52, 56, 59, 64] },
];

const CATA_OUD: ReadonlyArray<MelEvent> = [
  // A (0-7): Exotic Phrygian Oud with ornament slides
  [64, 0.7, 0, -0.4], [65, 0.6], [67, 1.0], [65, 0.7],
  [64, 1.5], null, [60, 0.75], [64, 0.9],
  [67, 0.8], [69, 0.7], [71, 1.3], null,
  [69, 0.8], [65, 0.8], [64, 1.6], null,
  [64, 0.75], [68, 0.9, 0, -0.5], [71, 1.1], [68, 0.75],
  [69, 1.2], [65, 0.75], [64, 1.1], null,
  [62, 0.85], [65, 0.85], [69, 1.3], null,
  [68, 1.7, 0, -0.4], null, [64, 1.2], null,
  // B (8-15): Andalusian soaring descent
  [76, 1.5], null, [74, 0.75], [72, 0.9],
  [71, 1.5], null, [69, 0.75], [67, 0.9],
  [69, 1.5], null, [67, 0.75], [65, 0.9],
  [64, 1.1], [68, 0.95, 0, -0.45], [71, 1.5], null,
  [74, 1.1], [72, 0.75], [69, 1.1], [65, 0.8],
  [69, 1.4], null, [72, 0.9], [69, 0.85],
  [71, 1.4], null, [74, 0.9], [71, 0.85],
  [68, 1.8, 0, -0.4], null, null, null,
  // C (16-23): Sparse hypnotic drone dialogue
  [64, 2.0, 0, -0.5], null, null, [65, 0.8],
  [68, 1.8, 0, -0.5], null, [65, 0.9], null,
  [62, 1.6], null, [65, 0.9], [64, 0.9],
  [64, 2.2], null, null, null,
  null, [71, 1.1], [68, 0.85, 0, -0.4], [65, 1.0],
  [69, 1.6], null, [65, 0.9], null,
  [62, 1.4], null, [65, 0.85], [68, 0.95],
  [71, 1.8], null, [76, 1.2], null,
  // D (24-31): Fiery climax
  [76, 0.9], [77, 0.6], [81, 1.2], [76, 0.8],
  [79, 0.9], [77, 0.6], [74, 1.2], [71, 0.8],
  [77, 0.9], [76, 0.6], [72, 1.2], [69, 0.8],
  [76, 1.2, 0, -0.45], [71, 0.8], [68, 1.4], null,
  [77, 1.2], null, [76, 0.8], [72, 0.9],
  [74, 1.2], null, [69, 0.8], [65, 0.9],
  [72, 1.0], [74, 0.8], [77, 1.3], null,
  [76, 1.2], [80, 0.9, 0, -0.5], [76, 1.6], null,
];

function catacombsNotes(beat: number, ctx?: ScoreContext): ScoreNote[] {
  const b = beat % PHRASE_BEATS, bar = Math.floor(b / 4), step = b % 4, pass = Math.floor(beat / PHRASE_BEATS);
  const info = CATA_BARS[bar];
  const arc = phraseArc(bar);
  const breakdown = bar >= 16 && bar < 24 && !ctx?.ambush;
  const climax = bar >= 24 || !!ctx?.ambush;
  const bSection = bar >= 8 && bar < 16;
  const sw = 0.032; // subtle Middle-Eastern/Spanish groove sway
  const out: ScoreNote[] = [];

  if (step === 0) {
    widePad(out, 'strings', info.pad, 4.0, (breakdown ? 0.19 : 0.15) * arc, { bright: climax ? 1.08 : 0.85 });
  }

  // Sinuous Karplus-Strong lute + harp sparkle
  const a = info.arp;
  out.push({ inst: 'lute', midi: a[step % a.length], dur: 0.56, vol: 0.24 * arc, pan: -0.48, room: 0.32, reverb: 0.14, bright: 1.2 });
  if (!breakdown || step % 2 === 0) {
    out.push({ inst: 'lute', midi: a[(step + 2) % a.length], dur: 0.42, vol: 0.17 * arc, at: 0.5 + sw, pan: -0.34, room: 0.3, reverb: 0.14, bright: 1.05 });
  }
  if (step === 1 || step === 3) {
    out.push({ inst: 'harp', midi: a[(step + 3) % a.length] + 12, dur: 1.2, vol: 0.14 * arc, at: 0.75, pan: 0.56, reverb: 0.62, delay: 0.38 });
  }

  // Rolling syncopated bass
  out.push({ inst: 'bass', midi: info.root, dur: breakdown ? 2.0 : 0.52, vol: 0.3 * arc, pan: 0, room: 0.12 });
  if (!breakdown && (step === 1 || step === 3)) {
    out.push({ inst: 'bass', midi: info.root + 12, dur: 0.34, vol: 0.17 * arc, at: 0.5 + sw, pan: 0, room: 0.12, minIntensity: 0.42 });
  }

  // Tribal percussion bed (shaker + taiko + crisp kit)
  out.push({ inst: 'shaker', midi: 0, dur: 0.075, vol: 0.095 * arc, pan: 0.44, room: 0.18 });
  out.push({ inst: 'shaker', midi: 0, dur: 0.085, vol: 0.11 * arc, at: 0.5 + sw, pan: -0.42, room: 0.18 });
  if (!breakdown) {
    out.push({ inst: 'shaker', midi: 0, dur: 0.06, vol: 0.065 * arc, at: 0.25, pan: -0.34, room: 0.15, minIntensity: 0.45 });
    out.push({ inst: 'shaker', midi: 0, dur: 0.06, vol: 0.075 * arc, at: 0.75, pan: 0.36, room: 0.15, minIntensity: 0.5 });
  }

  addKit(out, bar, step, pass, { breakdown, climax, bSection, kickMidi: 40, swing: sw, tribal: true });
  if (!breakdown && step === 1) {
    out.push({ inst: 'taiko', midi: 47, dur: 0.32, vol: 0.23 * arc, at: 0.5 + sw, pan: -0.36, room: 0.34, reverb: 0.24, minIntensity: 0.4 });
  }
  if (step === 0 && (bar === 0 || bar === 8 || bar === 16 || bar === 24)) {
    out.push({ inst: 'bell', midi: info.root + 24, dur: 3.2, vol: 0.15 * arc, pan: 0.62, reverb: 0.85, delay: 0.4 });
  }

  // Expressive Karplus-Strong Oud solo (+ bowed fiddle octave/harmony in D climax)
  const lm = CATA_OUD[b];
  if (lm) {
    out.push({
      inst: 'oud',
      midi: lm[0],
      dur: lm[1],
      vol: 0.29 * arc,
      at: lm[2] ?? 0,
      slide: lm[3],
      pan: 0.24,
      room: 0.3,
      reverb: 0.44,
      delay: 0.34,
      bright: 1.18,
      minIntensity: breakdown ? 0.25 : 0.36,
    });
    if (climax && bar >= 24) {
      out.push({
        inst: 'fiddle',
        midi: diatonicHarmony(lm[0], E_PHRYG_PCS, 2),
        dur: lm[1],
        vol: 0.15 * arc,
        pan: -0.38,
        reverb: 0.56,
        minIntensity: 0.66,
      });
    }
  }

  addArchetypeAccent(out, ctx, bar, step, info.root, info.arp[4], breakdown);
  addAmbushLayer(out, ctx, bar, step, info.root, info.root + 19);
  return out;
}

// =========================================================================
// 5. DEEP (134 BPM, B Minor, 32 bars) — Volcanic Forge Metal / Rock Anthem
// =========================================================================

const B_MIN_PCS = [11, 1, 2, 4, 6, 7, 9]; // B C# D E F# G A

const DEEP_BARS: ReadonlyArray<{ root: number; riff: number[]; org: number[] }> = [
  // A (0-7): Bm - G - Em - F#7 | Bm - A - G - F#7
  { root: 35, riff: [47, 50, 54, 50], org: [47, 54, 59, 62] },
  { root: 31, riff: [43, 47, 50, 47], org: [43, 50, 55, 59] },
  { root: 28, riff: [40, 43, 47, 52], org: [40, 47, 52, 55] },
  { root: 30, riff: [42, 46, 49, 54], org: [42, 49, 54, 58] },
  { root: 35, riff: [47, 50, 54, 57], org: [47, 54, 59, 62] },
  { root: 33, riff: [45, 49, 52, 57], org: [45, 52, 57, 61] },
  { root: 31, riff: [43, 47, 50, 55], org: [43, 50, 55, 59] },
  { root: 30, riff: [42, 46, 49, 54], org: [42, 49, 54, 58] },
  // B (8-15): Colossal Forge Anthem — D - A - G - F#7 | Em - Bm - G - F#7
  { root: 38, riff: [50, 54, 57, 62], org: [50, 57, 62, 66] },
  { root: 33, riff: [45, 49, 52, 57], org: [45, 52, 57, 61] },
  { root: 31, riff: [43, 47, 50, 55], org: [43, 50, 55, 59] },
  { root: 30, riff: [42, 46, 49, 54], org: [42, 49, 54, 58] },
  { root: 28, riff: [40, 43, 47, 52], org: [40, 47, 52, 55] },
  { root: 35, riff: [47, 50, 54, 59], org: [47, 54, 59, 62] },
  { root: 31, riff: [43, 47, 50, 55], org: [43, 50, 55, 59] },
  { root: 30, riff: [42, 46, 49, 54], org: [42, 49, 54, 58] },
  // C (16-23): Heavy Half-Time Anvil Breakdown — Bm - A/C# - D - Em | G - Em - C(Phrygian!) - F#7
  { root: 35, riff: [47, 50, 54, 50], org: [47, 54, 59, 62] },
  { root: 37, riff: [49, 52, 57, 52], org: [49, 52, 57, 61] },
  { root: 38, riff: [50, 54, 57, 54], org: [50, 54, 57, 62] },
  { root: 40, riff: [52, 55, 59, 55], org: [52, 55, 59, 64] },
  { root: 31, riff: [43, 47, 50, 55], org: [43, 50, 55, 59] },
  { root: 28, riff: [40, 43, 47, 52], org: [40, 47, 52, 55] },
  { root: 36, riff: [48, 52, 55, 60], org: [48, 52, 55, 60] },
  { root: 30, riff: [42, 46, 49, 54], org: [42, 49, 54, 58] },
  // D (24-31): Molten Twin-Guitar Climax — Bm - G - D - A | Em - G - A - F#7
  { root: 35, riff: [47, 50, 54, 59], org: [47, 54, 59, 62] },
  { root: 31, riff: [43, 47, 50, 55], org: [43, 50, 55, 59] },
  { root: 38, riff: [50, 54, 57, 62], org: [50, 57, 62, 66] },
  { root: 33, riff: [45, 49, 52, 57], org: [45, 52, 57, 61] },
  { root: 28, riff: [40, 43, 47, 52], org: [40, 47, 52, 55] },
  { root: 31, riff: [43, 47, 50, 55], org: [43, 50, 55, 59] },
  { root: 33, riff: [45, 49, 52, 57], org: [45, 52, 57, 61] },
  { root: 30, riff: [42, 46, 49, 54], org: [42, 49, 54, 58] },
];

const DEEP_GUITAR: ReadonlyArray<MelEvent> = [
  // Bars 0-3: heavy brass/chug intro — let the riff breathe!
  null, null, null, null, null, null, null, null,
  null, null, null, null, null, null, null, null,
  // Bars 4-7: overdriven lead guitar enters
  [71, 1.5, 0, -0.5], null, [74, 0.85], [73, 0.9],
  [69, 1.5], null, [73, 0.85], [71, 0.9],
  [67, 1.5], null, [71, 0.85], [69, 0.9],
  [66, 1.9], null, [70, 1.3], null,
  // B (8-15): Soaring anthem lead
  [74, 1.5, 0, -0.4], null, [78, 0.85], [76, 0.95],
  [73, 1.5], null, [76, 0.85], [73, 0.95],
  [71, 1.5], null, [74, 0.85], [71, 0.95],
  [70, 0.95], [73, 0.85], [78, 1.6], null,
  [76, 1.2], [74, 0.75], [71, 1.2], [67, 0.85],
  [71, 1.2], [74, 0.75], [78, 1.5], null,
  [79, 1.2], [78, 0.75], [74, 1.0], [71, 0.85],
  [70, 1.1], [73, 0.9], [78, 1.6], null,
  // C (16-23): Heavy slow-burn bends
  [71, 2.4, 0, -1.0], null, null, null,
  [73, 2.2], null, null, [76, 0.8],
  [74, 2.4], null, null, null,
  [76, 2.0], null, [79, 1.2], null,
  [78, 2.0, 0, -0.5], null, [74, 1.1], null,
  [76, 2.2], null, null, null,
  [79, 1.8], null, [76, 1.2], null,
  [78, 2.4], null, null, null,
  // D (24-31): Blazing twin-guitar finale
  [83, 1.4, 0, -0.5], null, [78, 0.85], [74, 0.9],
  [79, 1.4], null, [78, 0.85], [74, 0.9],
  [78, 1.4], null, [81, 0.85], [83, 0.95],
  [81, 1.6], null, [76, 0.9], [73, 0.9],
  [76, 1.1], [79, 0.8], [83, 1.2], [79, 0.8],
  [79, 1.1], [78, 0.8], [74, 1.2], [71, 0.8],
  [76, 1.3], null, [73, 0.9], [76, 0.9],
  [78, 1.3], [82, 0.9], [83, 1.7], null,
];

function deepNotes(beat: number, ctx?: ScoreContext): ScoreNote[] {
  const b = beat % PHRASE_BEATS, bar = Math.floor(b / 4), step = b % 4, pass = Math.floor(beat / PHRASE_BEATS);
  const info = DEEP_BARS[bar];
  const arc = phraseArc(bar);
  const breakdown = bar >= 16 && bar < 24 && !ctx?.ambush;
  const climax = bar >= 24 || !!ctx?.ambush;
  const bSection = bar >= 8 && bar < 16;
  const out: ScoreNote[] = [];

  if (step === 0) {
    widePad(out, 'organ', info.org, 3.85, 0.16 * arc, { reverb: 0.7, bright: climax ? 1.1 : 0.92 });
  }

  // Relentless 8th-note bass + palm-muted electric chug
  out.push({ inst: 'bass', midi: info.root, dur: breakdown ? 1.8 : 0.46, vol: 0.34 * arc, pan: 0, room: 0.12, bright: 1.15 });
  if (!breakdown) {
    out.push({ inst: 'bass', midi: info.root, dur: 0.34, vol: 0.23 * arc, at: 0.5, pan: 0, room: 0.12, bright: 1.05, minIntensity: 0.35 });
    out.push({ inst: 'chug', midi: info.root + 12, dur: 0.3, vol: 0.23 * arc, pan: -0.48, room: 0.28, bright: 1.15, minIntensity: 0.4 });
    if (step === 0 || step === 2) {
      out.push({ inst: 'chug', midi: info.root + 12, dur: 0.24, vol: 0.19 * arc, at: 0.5, pan: 0.48, room: 0.28, bright: 1.1, minIntensity: 0.52 });
    }
  } else if (step === 0) {
    out.push({ inst: 'chug', midi: info.root + 12, dur: 0.45, vol: 0.25 * arc, pan: -0.44, room: 0.34, bright: 1.0 });
  }

  // Growling low brass war-horn riff
  if (!breakdown || step === 0 || step === 2) {
    out.push({ inst: 'brass', midi: info.riff[step], dur: breakdown ? 1.5 : 0.68, vol: (step === 0 ? 0.23 : 0.17) * arc, pan: -0.34, reverb: 0.54, bright: 1.08 });
  }
  if ((bSection || climax) && step === 0) {
    out.push({ inst: 'brass', midi: info.riff[0] + 12, dur: 1.5, vol: 0.19 * arc, pan: 0.46, reverb: 0.58, minIntensity: 0.55 });
  }

  addKit(out, bar, step, pass, { breakdown, climax, bSection, kickMidi: 35, doubleKick: climax });
  if (!breakdown && (step === 0 || step === 2)) {
    out.push({ inst: 'taiko', midi: info.root + 12, dur: 0.44, vol: 0.26 * arc, pan: step === 0 ? -0.36 : 0.36, room: 0.38, reverb: 0.3, minIntensity: 0.38 });
  }

  // Overdriven electric lead guitar (+ diatonic twin-guitar harmony in D!)
  const lm = DEEP_GUITAR[b];
  if (lm) {
    out.push({
      inst: 'guitar',
      midi: lm[0],
      dur: lm[1],
      vol: 0.23 * arc,
      at: lm[2] ?? 0,
      slide: lm[3],
      pan: 0.22,
      room: 0.24,
      reverb: 0.44,
      delay: 0.36,
      bright: 1.22,
      minIntensity: breakdown ? 0.3 : 0.42,
    });
    if (climax && bar >= 24) {
      out.push({
        inst: 'guitar',
        midi: diatonicHarmony(lm[0], B_MIN_PCS, 2),
        dur: lm[1],
        vol: 0.16 * arc,
        at: lm[2] ?? 0,
        pan: -0.4,
        room: 0.22,
        reverb: 0.44,
        delay: 0.26,
        bright: 1.08,
        minIntensity: 0.68,
      });
    }
  }

  addArchetypeAccent(out, ctx, bar, step, info.root, info.org[3], breakdown);
  addAmbushLayer(out, ctx, bar, step, info.root, info.root + 19);
  return out;
}

// =========================================================================
// 6. BOSS (140 BPM, A Minor, 32 bars) — Sacred Peloton-Sprint Boss Battle
// =========================================================================

const A_MIN_PCS = [9, 11, 0, 2, 4, 5, 7]; // A B C D E F G
const A_HMIN_PCS = [9, 11, 0, 2, 4, 5, 8]; // A B C D E F G# (used on E7 bars!)

const BOSS_BARS: ReadonlyArray<{ root: number; arp: number[]; brass: number; hmin?: boolean }> = [
  // A (0-7): Am - F - G - E7 | Am - F - Dm - E7
  { root: 33, arp: [57, 60, 64, 69], brass: 57 },
  { root: 29, arp: [53, 57, 60, 65], brass: 53 },
  { root: 31, arp: [55, 59, 62, 67], brass: 55 },
  { root: 28, arp: [52, 56, 59, 64], brass: 52, hmin: true },
  { root: 33, arp: [57, 60, 64, 69], brass: 57 },
  { root: 29, arp: [53, 57, 60, 65], brass: 53 },
  { root: 38, arp: [50, 53, 57, 62], brass: 50 },
  { root: 28, arp: [52, 56, 59, 64], brass: 52, hmin: true },
  // B (8-15): Adrenaline Climb — F - G - Am - C | Dm - Am - Bb(Neapolitan) - E7
  { root: 29, arp: [53, 57, 60, 65], brass: 60 },
  { root: 31, arp: [55, 59, 62, 67], brass: 62 },
  { root: 33, arp: [57, 60, 64, 69], brass: 64 },
  { root: 36, arp: [60, 64, 67, 72], brass: 67 },
  { root: 38, arp: [50, 53, 57, 62], brass: 62 },
  { root: 33, arp: [57, 60, 64, 69], brass: 60 },
  { root: 34, arp: [58, 62, 65, 70], brass: 58 },
  { root: 28, arp: [52, 56, 59, 64], brass: 59, hmin: true },
  // C (16-23): Dramatic Half-Time Standoff — Am - G/B - C - Dm | F - Dm - E7sus4 - E7
  { root: 33, arp: [57, 60, 64, 69], brass: 57 },
  { root: 35, arp: [55, 59, 62, 67], brass: 59 },
  { root: 36, arp: [60, 64, 67, 72], brass: 60 },
  { root: 38, arp: [50, 53, 57, 62], brass: 62 },
  { root: 29, arp: [53, 57, 60, 65], brass: 65 },
  { root: 38, arp: [50, 53, 57, 62], brass: 62 },
  { root: 28, arp: [52, 57, 59, 64], brass: 57 },
  { root: 28, arp: [52, 56, 59, 64], brass: 56, hmin: true },
  // D (24-31): All-Out Twin-Guitar Showdown — Am - F - G - Am | Dm - F - G - E7
  { root: 33, arp: [57, 60, 64, 69], brass: 64 },
  { root: 29, arp: [53, 57, 60, 65], brass: 65 },
  { root: 31, arp: [55, 59, 62, 67], brass: 67 },
  { root: 33, arp: [57, 60, 64, 69], brass: 69 },
  { root: 38, arp: [50, 53, 57, 62], brass: 65 },
  { root: 29, arp: [53, 57, 60, 65], brass: 64 },
  { root: 31, arp: [55, 59, 62, 67], brass: 62 },
  { root: 28, arp: [52, 56, 59, 64], brass: 64, hmin: true },
];

const BOSS_GUITAR: ReadonlyArray<MelEvent> = [
  // A (0-7): Catchy syncopated hook with genuine rhythmic space!
  [69, 0.75, 0, -0.4], [72, 0.45, 0.5], [76, 1.35], null,
  [65, 0.75], [69, 0.45, 0.5], [72, 1.2], [76, 0.85],
  [67, 0.75], [71, 0.45, 0.5], [74, 1.35], null,
  [68, 0.9], [71, 0.8], [76, 1.6], null,
  [69, 0.75, 0, -0.4], [72, 0.45, 0.5], [76, 0.9], [81, 1.35],
  null, [79, 0.7], [77, 0.45, 0.5], [76, 1.2],
  [74, 0.9], [77, 0.7], [76, 0.9], [74, 0.85],
  [76, 1.7], null, [71, 1.1], null,
  // B (8-15): Soaring sprint climb
  [77, 1.4], null, [76, 0.65], [72, 0.9],
  [74, 1.4], null, [76, 0.65], [79, 1.0],
  [76, 1.5], null, [81, 0.85], [79, 0.85],
  [76, 0.95], [79, 0.85], [84, 1.6], null,
  [81, 1.2], null, [77, 0.85], [74, 0.9],
  [76, 1.2], null, [72, 0.85], [69, 0.9],
  [74, 1.3], null, [70, 0.9], [69, 0.9],
  [71, 0.95], [76, 0.85], [80, 1.6], null,
  // C (16-23): Half-time dramatic standoff (sustained power bends)
  [76, 2.2, 0, -1.0], null, null, [72, 0.85],
  [74, 2.2], null, null, null,
  [76, 1.6], null, [79, 0.9], [81, 1.2],
  [77, 2.2], null, null, null,
  [81, 1.6], null, [77, 0.9], [76, 0.9],
  [74, 2.0], null, null, null,
  [76, 1.6], null, [79, 1.1], null,
  [80, 2.4, 0, -0.5], null, null, null,
  // D (24-31): All-out finale
  [81, 0.8, 0, -0.5], [84, 0.45, 0.5], [88, 1.35], null,
  [81, 0.8], [77, 0.45, 0.5], [76, 1.2], [72, 0.85],
  [74, 0.8], [79, 0.45, 0.5], [83, 1.35], null,
  [81, 1.6], null, [76, 1.1], null,
  [81, 0.95], [77, 0.75], [74, 0.95], [77, 0.8],
  [81, 1.1], [77, 0.75], [76, 1.1], null,
  [79, 1.1], [76, 0.75], [74, 1.0], [71, 0.85],
  [76, 1.1], [80, 0.9], [83, 1.7], null,
];

function bossNotes(beat: number, ctx?: ScoreContext): ScoreNote[] {
  const b = beat % PHRASE_BEATS, bar = Math.floor(b / 4), step = b % 4, pass = Math.floor(beat / PHRASE_BEATS);
  const info = BOSS_BARS[bar];
  const arc = phraseArc(bar);
  const breakdown = bar >= 16 && bar < 24 && !ctx?.exposed;
  const climax = bar >= 24 || !!ctx?.exposed || (ctx?.bossPhase ?? 1) >= 3;
  const bSection = bar >= 8 && bar < 16;
  const out: ScoreNote[] = [];

  if (step === 0) {
    widePad(out, 'organ', [info.root + 12, info.root + 19, info.arp[1], info.arp[2]], 3.8, 0.16 * arc, { reverb: 0.62, bright: 1.12 });
  }

  // Galloping bass + tight palm-muted guitar chug (L/R rock wall!)
  out.push({ inst: 'bass', midi: info.root, dur: breakdown ? 1.6 : 0.36, vol: 0.35 * arc, pan: 0, room: 0.12, bright: 1.25 });
  if (!breakdown) {
    out.push({ inst: 'bass', midi: info.root + 12, dur: 0.28, vol: 0.24 * arc, at: 0.5, pan: 0, room: 0.12, bright: 1.15 });
    out.push({ inst: 'bass', midi: info.root, dur: 0.2, vol: 0.2 * arc, at: 0.75, pan: 0, room: 0.12, bright: 1.12, minIntensity: 0.76 });
    out.push({ inst: 'chug', midi: info.root + 12, dur: 0.24, vol: 0.23 * arc, pan: 0.52, room: 0.26, bright: 1.25 });
    out.push({ inst: 'chug', midi: info.root + 12, dur: 0.2, vol: 0.18 * arc, at: 0.5, pan: 0.48, room: 0.24, bright: 1.18 });
  } else if (step === 0) {
    out.push({ inst: 'chug', midi: info.root + 12, dur: 0.4, vol: 0.24 * arc, pan: 0.46, room: 0.32 });
  }

  // Shredding Baroque Karplus-Strong harpsichord arpeggios (left channel, tight room, zero delay smear!)
  const a = info.arp;
  out.push({ inst: 'harpsi', midi: a[step % 4], dur: 0.32, vol: 0.17 * arc, pan: -0.52, room: 0.28, reverb: 0.14, bright: 1.22 });
  if (!breakdown) {
    out.push({ inst: 'harpsi', midi: a[(step + 1) % 4], dur: 0.22, vol: 0.13 * arc, at: 0.25, pan: -0.44, room: 0.26, minIntensity: 0.74 });
    out.push({ inst: 'harpsi', midi: a[(step + 2) % 4], dur: 0.26, vol: 0.16 * arc, at: 0.5, pan: -0.36, room: 0.26 });
    out.push({ inst: 'harpsi', midi: a[(step + 3) % 4], dur: 0.22, vol: 0.12 * arc, at: 0.75, pan: -0.48, room: 0.26, minIntensity: 0.82 });
  }

  // Aggressive brass stabs
  if (step === 0 || (!breakdown && step === 2 && bar % 2 === 1)) {
    out.push({ inst: 'brass', midi: info.brass, dur: breakdown ? 1.4 : 0.75, vol: 0.23 * arc, pan: 0.44, reverb: 0.48, bright: 1.22 });
    out.push({ inst: 'brass', midi: info.brass - 12, dur: breakdown ? 1.4 : 0.75, vol: 0.19 * arc, pan: -0.44, reverb: 0.48, bright: 1.1 });
  }

  addKit(out, bar, step, pass, { breakdown, climax, bSection, kickMidi: 38, doubleKick: true });

  // Soaring overdriven twin-guitar solo — 100% DIATONIC chord-aware harmony (fixes the parallel-4th bug!)
  const lm = BOSS_GUITAR[b];
  if (lm) {
    const scalePcs = info.hmin ? A_HMIN_PCS : info.root === 34 ? [10, 0, 2, 3, 5, 7, 9] : A_MIN_PCS;
    out.push({
      inst: 'guitar',
      midi: lm[0],
      dur: lm[1],
      vol: 0.25 * arc,
      at: lm[2] ?? 0,
      slide: lm[3],
      pan: 0.2,
      room: 0.22,
      reverb: 0.42,
      delay: 0.34,
      bright: 1.28,
    });
    const harmMidi = diatonicHarmony(lm[0], scalePcs, 2); // Clean diatonic 3rd below!
    out.push({
      inst: 'guitar',
      midi: harmMidi,
      dur: lm[1],
      vol: 0.17 * arc,
      at: lm[2] ?? 0,
      pan: -0.38,
      room: 0.2,
      reverb: 0.42,
      delay: 0.24,
      bright: 1.1,
      minIntensity: 0.82,
    });
  }

  addArchetypeAccent(out, ctx, bar, step, info.root, info.arp[3], breakdown);
  return out;
}

// =========================================================================
// 7. WYRM (136 BPM, E Dorian Storm, 32 bars) — Floor 6 Headwind Wyrm Boss!
// =========================================================================

const E_DOR_PCS = [4, 6, 7, 9, 11, 1, 2]; // E F# G A B C# D

const WYRM_BARS: ReadonlyArray<{ root: number; arp: number[]; pad: number[] }> = [
  // A (0-7): Em - D - C - Bm | Em - A(Dorian!) - C - B7
  { root: 40, arp: [52, 59, 64, 67, 71], pad: [52, 59, 64, 67] },
  { root: 38, arp: [50, 57, 62, 66, 69], pad: [50, 57, 62, 66] },
  { root: 36, arp: [48, 55, 60, 64, 67], pad: [48, 55, 60, 64] },
  { root: 35, arp: [47, 54, 59, 62, 66], pad: [47, 54, 59, 62] },
  { root: 40, arp: [52, 59, 64, 67, 71], pad: [52, 59, 64, 67] },
  { root: 33, arp: [52, 57, 61, 64, 69], pad: [49, 52, 57, 61] },
  { root: 36, arp: [48, 55, 60, 64, 67], pad: [48, 55, 60, 64] },
  { root: 35, arp: [47, 54, 59, 63, 66], pad: [47, 54, 59, 63] },
  // B (8-15): Gale Surge — C - D - Em - G | Am - Em - C - B7
  { root: 36, arp: [55, 60, 64, 67, 72], pad: [55, 60, 64, 67] },
  { root: 38, arp: [57, 62, 66, 69, 74], pad: [57, 62, 66, 69] },
  { root: 40, arp: [59, 64, 67, 71, 76], pad: [59, 64, 67, 71] },
  { root: 43, arp: [55, 59, 62, 67, 71], pad: [55, 59, 62, 67] },
  { root: 33, arp: [52, 57, 60, 64, 69], pad: [52, 57, 60, 64] },
  { root: 40, arp: [52, 59, 64, 67, 71], pad: [52, 59, 64, 67] },
  { root: 36, arp: [48, 55, 60, 64, 67], pad: [48, 55, 60, 64] },
  { root: 35, arp: [47, 54, 59, 63, 66], pad: [47, 54, 59, 63] },
  // C (16-23): Eye of the Storm Breakdown — Em - G/D - Cmaj7 - B7 (x2)
  { root: 40, arp: [52, 59, 64, 67, 71], pad: [52, 59, 64, 67] },
  { root: 38, arp: [55, 59, 62, 67, 71], pad: [50, 55, 59, 62] },
  { root: 36, arp: [48, 55, 59, 64, 67], pad: [48, 55, 59, 64] },
  { root: 35, arp: [47, 54, 59, 63, 66], pad: [47, 54, 59, 63] },
  { root: 40, arp: [52, 59, 64, 67, 71], pad: [52, 59, 64, 67] },
  { root: 33, arp: [52, 57, 61, 64, 69], pad: [49, 52, 57, 61] },
  { root: 36, arp: [48, 55, 60, 64, 67], pad: [48, 55, 60, 64] },
  { root: 35, arp: [47, 54, 59, 63, 66], pad: [47, 54, 59, 63] },
  // D (24-31): Tempest Climax — Em - C - D - G | Am - C - D - B7
  { root: 40, arp: [52, 59, 64, 67, 71], pad: [59, 64, 67, 71] },
  { root: 36, arp: [55, 60, 64, 67, 72], pad: [55, 60, 64, 67] },
  { root: 38, arp: [57, 62, 66, 69, 74], pad: [57, 62, 66, 69] },
  { root: 43, arp: [55, 59, 62, 67, 71], pad: [55, 59, 62, 67] },
  { root: 33, arp: [52, 57, 60, 64, 69], pad: [52, 57, 60, 64] },
  { root: 36, arp: [55, 60, 64, 67, 72], pad: [55, 60, 64, 67] },
  { root: 38, arp: [57, 62, 66, 69, 74], pad: [57, 62, 66, 69] },
  { root: 35, arp: [47, 54, 59, 63, 66], pad: [51, 54, 59, 63] },
];

const WYRM_LEAD: ReadonlyArray<MelEvent> = [
  // A (0-7): Swirling tempest fiddle/guitar motif
  [76, 0.85, 0, -0.35], [79, 0.45, 0.5], [83, 1.3], null,
  [81, 0.85], [78, 0.45, 0.5], [74, 1.3], null,
  [72, 0.85], [76, 0.45, 0.5], [79, 1.1], [76, 0.85],
  [74, 1.4], null, [71, 1.2], null,
  [76, 0.85], [79, 0.45, 0.5], [83, 0.9], [86, 1.3],
  [85, 1.4], null, [81, 0.9], [76, 0.9],
  [79, 1.3], null, [76, 0.85], [72, 0.9],
  [75, 1.6], null, [71, 1.2], null,
  // B (8-15): Gale lift
  [79, 1.4], null, [76, 0.7], [79, 0.9],
  [81, 1.4], null, [78, 0.7], [81, 0.9],
  [83, 1.8], null, [81, 0.75], [79, 0.95],
  [79, 1.6], null, [74, 1.1], null,
  [81, 1.3], null, [79, 0.75], [76, 0.9],
  [79, 1.3], null, [76, 0.75], [71, 0.9],
  [76, 1.3], null, [72, 0.85], [76, 0.9],
  [75, 1.7], null, [78, 1.2], null,
  // C (16-23): Eye of the Storm — haunting bowed fiddle solo
  [76, 2.2, 0, -0.4], null, null, [79, 0.85],
  [78, 2.2], null, null, null,
  [79, 1.6], null, [76, 0.9], [74, 0.9],
  [75, 2.2], null, null, null,
  [76, 1.8], null, [83, 1.2], null,
  [85, 2.0], null, [81, 1.1], null,
  [79, 1.8], null, [76, 1.2], null,
  [78, 2.4], null, null, null,
  // D (24-31): Tempest Climax
  [88, 1.3, 0, -0.5], null, [86, 0.75], [83, 0.9],
  [84, 1.3], null, [83, 0.75], [79, 0.9],
  [81, 1.3], null, [83, 0.75], [86, 0.9],
  [83, 1.6], null, [79, 1.1], null,
  [84, 1.2], [81, 0.75], [79, 1.0], [76, 0.85],
  [79, 1.2], [84, 0.75], [83, 1.2], null,
  [86, 1.3], null, [83, 0.85], [81, 0.9],
  [83, 1.2], [78, 0.85], [75, 1.6], null,
];

function wyrmNotes(beat: number, ctx?: ScoreContext): ScoreNote[] {
  const b = beat % PHRASE_BEATS, bar = Math.floor(b / 4), step = b % 4, pass = Math.floor(beat / PHRASE_BEATS);
  const info = WYRM_BARS[bar];
  const arc = phraseArc(bar);
  const breakdown = bar >= 16 && bar < 24 && !ctx?.exposed;
  const climax = bar >= 24 || !!ctx?.exposed || (ctx?.bossPhase ?? 1) >= 3;
  const bSection = bar >= 8 && bar < 16;
  const out: ScoreNote[] = [];

  if (step === 0) {
    widePad(out, 'strings', info.pad, 4.0, 0.22 * arc, { bright: climax ? 1.2 : 1.0 });
  }

  // Swirling storm harp & lute ostinato (coiling wind texture!)
  const a = info.arp;
  out.push({ inst: 'harp', midi: a[step % a.length], dur: 0.75, vol: 0.16 * arc, pan: -0.56, reverb: 0.54, delay: 0.25 });
  if (!breakdown) {
    out.push({ inst: 'harp', midi: a[(step + 2) % a.length] + 12, dur: 0.65, vol: 0.13 * arc, at: 0.5, pan: 0.58, reverb: 0.56, delay: 0.28 });
    out.push({ inst: 'chug', midi: info.root + 12, dur: 0.24, vol: 0.2 * arc, pan: -0.42, room: 0.26, bright: 1.15 });
  }

  // Galloping wind-runner bass + taiko
  out.push({ inst: 'bass', midi: info.root, dur: breakdown ? 1.8 : 0.42, vol: 0.34 * arc, pan: 0, room: 0.12, bright: 1.18 });
  if (!breakdown) {
    out.push({ inst: 'bass', midi: info.root + 12, dur: 0.28, vol: 0.22 * arc, at: 0.5, pan: 0, room: 0.12 });
    if (step === 0 || step === 2) {
      out.push({ inst: 'taiko', midi: info.root + 12, dur: 0.38, vol: 0.26 * arc, pan: step === 0 ? -0.44 : 0.44, room: 0.34, reverb: 0.28 });
    }
  }

  addKit(out, bar, step, pass, { breakdown, climax, bSection, kickMidi: 40, doubleKick: climax });

  // Dueling fiddle (A/C) + electric guitar (B/D) storm solo!
  const lm = WYRM_LEAD[b];
  if (lm) {
    const useGuitar = bSection || climax;
    out.push({
      inst: useGuitar ? 'guitar' : 'fiddle',
      midi: lm[0],
      dur: lm[1],
      vol: 0.25 * arc,
      at: lm[2] ?? 0,
      slide: lm[3],
      pan: 0.2,
      room: 0.22,
      reverb: 0.48,
      delay: 0.36,
      bright: 1.24,
    });
    if (climax) {
      const pcs = info.root === 35 ? [4, 6, 7, 9, 11, 0, 3] : E_DOR_PCS;
      out.push({
        inst: 'fiddle',
        midi: diatonicHarmony(lm[0], pcs, 2),
        dur: lm[1],
        vol: 0.17 * arc,
        at: lm[2] ?? 0,
        pan: -0.4,
        reverb: 0.52,
        minIntensity: 0.78,
      });
    }
  }

  addArchetypeAccent(out, ctx, bar, step, info.root, info.arp[4], breakdown);
  return out;
}

// =========================================================================
// 8. SWEEPER (148 BPM, D Minor Finale, 32 bars) — Final Floor Grim Sweeper!
// =========================================================================

const D_HMIN_PCS = [2, 4, 5, 7, 9, 10, 1]; // D E F G A Bb C#

const SWEEPER_BARS: ReadonlyArray<{ root: number; arp: number[]; org: number[]; hmin?: boolean }> = [
  // A (0-7): Dm - Bb - Gm - A7 | Dm - C - Bb - A7
  { root: 38, arp: [50, 57, 62, 65], org: [50, 57, 62, 65] },
  { root: 34, arp: [46, 53, 58, 62], org: [46, 53, 58, 62] },
  { root: 31, arp: [43, 50, 55, 58], org: [43, 50, 55, 58] },
  { root: 33, arp: [45, 52, 57, 61], org: [45, 52, 57, 61], hmin: true },
  { root: 38, arp: [50, 57, 62, 65], org: [50, 57, 62, 65] },
  { root: 36, arp: [48, 55, 60, 64], org: [48, 55, 60, 64] },
  { root: 34, arp: [46, 53, 58, 62], org: [46, 53, 58, 62] },
  { root: 33, arp: [45, 52, 57, 61], org: [45, 52, 57, 61], hmin: true },
  // B (8-15): Broom Wagon Sprint — Bb - C - Dm - F | Gm - Eb(Phrygian!) - Bb - A7
  { root: 34, arp: [53, 58, 62, 65], org: [53, 58, 62, 65] },
  { root: 36, arp: [55, 60, 64, 67], org: [55, 60, 64, 67] },
  { root: 38, arp: [57, 62, 65, 69], org: [57, 62, 65, 69] },
  { root: 41, arp: [57, 60, 65, 69], org: [57, 60, 65, 69] },
  { root: 31, arp: [50, 55, 58, 62], org: [50, 55, 58, 62] },
  { root: 39, arp: [51, 55, 58, 63], org: [51, 55, 58, 63] },
  { root: 34, arp: [53, 58, 62, 65], org: [53, 58, 62, 65] },
  { root: 33, arp: [52, 57, 61, 64], org: [52, 57, 61, 64], hmin: true },
  // C (16-23): Organ Cathedral Standoff — Dm - A/C# - Bb - Gm | Eb - Dm - Asus4 - A7
  { root: 38, arp: [50, 57, 62, 65], org: [50, 57, 62, 65] },
  { root: 37, arp: [49, 52, 57, 61], org: [49, 52, 57, 61], hmin: true },
  { root: 34, arp: [46, 53, 58, 62], org: [46, 53, 58, 62] },
  { root: 31, arp: [43, 50, 55, 58], org: [43, 50, 55, 58] },
  { root: 39, arp: [51, 55, 58, 63], org: [51, 55, 58, 63] },
  { root: 38, arp: [50, 57, 62, 65], org: [50, 57, 62, 65] },
  { root: 33, arp: [45, 52, 57, 62], org: [45, 52, 57, 62] },
  { root: 33, arp: [45, 52, 57, 61], org: [45, 52, 57, 61], hmin: true },
  // D (24-31): Final 1 km All-Out Sprint — Dm - Bb - C - Dm | Gm - Bb - C - A7
  { root: 38, arp: [57, 62, 65, 69], org: [57, 62, 65, 69] },
  { root: 34, arp: [53, 58, 62, 65], org: [53, 58, 62, 65] },
  { root: 36, arp: [55, 60, 64, 67], org: [55, 60, 64, 67] },
  { root: 38, arp: [57, 62, 65, 69], org: [57, 62, 65, 69] },
  { root: 31, arp: [50, 55, 58, 62], org: [50, 55, 58, 62] },
  { root: 34, arp: [53, 58, 62, 65], org: [53, 58, 62, 65] },
  { root: 36, arp: [55, 60, 64, 67], org: [55, 60, 64, 67] },
  { root: 33, arp: [52, 57, 61, 64], org: [52, 57, 61, 64], hmin: true },
];

const SWEEPER_LEAD: ReadonlyArray<MelEvent> = [
  // A (0-7)
  [74, 0.75, 0, -0.4], [77, 0.45, 0.5], [81, 1.3], null,
  [74, 0.75], [77, 0.45, 0.5], [82, 1.3], null,
  [79, 0.75], [77, 0.45, 0.5], [74, 1.1], [70, 0.85],
  [73, 1.0], [76, 0.85], [81, 1.5], null,
  [74, 0.75], [77, 0.45, 0.5], [81, 0.9], [86, 1.35],
  [84, 1.3], null, [81, 0.85], [79, 0.9],
  [77, 1.2], [74, 0.75], [70, 1.1], null,
  [73, 1.5], null, [76, 1.2], null,
  // B (8-15)
  [82, 1.4], null, [81, 0.7], [77, 0.9],
  [79, 1.4], null, [81, 0.7], [84, 0.95],
  [86, 1.8], null, [84, 0.75], [81, 0.9],
  [84, 1.6], null, [81, 1.0], null,
  [79, 1.2], [82, 0.75], [81, 1.0], [79, 0.85],
  [79, 1.4], null, [75, 0.9], [74, 0.9],
  [77, 1.3], null, [74, 0.85], [70, 0.9],
  [76, 1.2], [81, 0.85], [85, 1.6], null,
  // C (16-23)
  [81, 2.2, 0, -0.5], null, null, [77, 0.85],
  [76, 2.2], null, null, null,
  [77, 1.6], null, [74, 0.9], [70, 0.95],
  [79, 2.2], null, null, null,
  [75, 1.6], null, [79, 0.9], [82, 1.1],
  [81, 2.0], null, null, null,
  [82, 1.6], null, [81, 1.1], null,
  [85, 2.4, 0, -0.5], null, null, null,
  // D (24-31)
  [86, 0.8, 0, -0.5], [81, 0.45, 0.5], [86, 1.3], null,
  [82, 0.8], [77, 0.45, 0.5], [82, 1.3], null,
  [84, 0.8], [79, 0.45, 0.5], [84, 1.3], null,
  [86, 1.6], null, [81, 1.1], null,
  [82, 1.0], [79, 0.75], [77, 1.0], [74, 0.85],
  [77, 1.0], [82, 0.75], [81, 1.1], null,
  [84, 1.2], [81, 0.75], [79, 1.0], [76, 0.85],
  [81, 1.0], [85, 0.9], [86, 1.8], null,
];

function sweeperNotes(beat: number, ctx?: ScoreContext): ScoreNote[] {
  const b = beat % PHRASE_BEATS, bar = Math.floor(b / 4), step = b % 4, pass = Math.floor(beat / PHRASE_BEATS);
  const info = SWEEPER_BARS[bar];
  const arc = phraseArc(bar);
  const breakdown = bar >= 16 && bar < 24 && !ctx?.exposed;
  const climax = bar >= 24 || !!ctx?.exposed || (ctx?.bossPhase ?? 1) >= 2;
  const bSection = bar >= 8 && bar < 16;
  const out: ScoreNote[] = [];

  if (step === 0) {
    widePad(out, 'organ', info.org, 3.8, 0.18 * arc, { reverb: 0.7, bright: 1.18 });
    if (bar % 4 === 0) {
      out.push({ inst: 'bell', midi: info.root + 36, dur: 3.0, vol: 0.16 * arc, pan: -0.62, reverb: 0.82, delay: 0.35 });
    }
  }

  // Relentless final-floor bass + twin palm-muted chugs
  out.push({ inst: 'bass', midi: info.root, dur: breakdown ? 1.6 : 0.34, vol: 0.36 * arc, pan: 0, room: 0.12, bright: 1.28 });
  if (!breakdown) {
    out.push({ inst: 'bass', midi: info.root + 12, dur: 0.25, vol: 0.24 * arc, at: 0.5, pan: 0, room: 0.12, bright: 1.2 });
    out.push({ inst: 'chug', midi: info.root + 12, dur: 0.22, vol: 0.24 * arc, pan: -0.54, room: 0.26, bright: 1.28 });
    out.push({ inst: 'chug', midi: info.root + 12, dur: 0.2, vol: 0.22 * arc, at: 0.5, pan: 0.54, room: 0.26, bright: 1.24 });
    if (step === 1 || step === 3) {
      out.push({ inst: 'harpsi', midi: info.arp[step % 4] + 12, dur: 0.24, vol: 0.14 * arc, at: 0.25, pan: -0.44, room: 0.26 });
    }
  }

  if (step === 0 || (!breakdown && step === 2)) {
    out.push({ inst: 'brass', midi: info.org[2], dur: 0.75, vol: 0.22 * arc, pan: 0.46, reverb: 0.5, bright: 1.22 });
  }

  addKit(out, bar, step, pass, { breakdown, climax, bSection, kickMidi: 36, doubleKick: true });

  const lm = SWEEPER_LEAD[b];
  if (lm) {
    const pcs = info.hmin ? D_HMIN_PCS : info.root === 39 ? [3, 5, 7, 8, 10, 0, 2] : D_MIN_PCS;
    out.push({
      inst: 'guitar',
      midi: lm[0],
      dur: lm[1],
      vol: 0.26 * arc,
      at: lm[2] ?? 0,
      slide: lm[3],
      pan: 0.22,
      room: 0.22,
      reverb: 0.42,
      delay: 0.32,
      bright: 1.32,
    });
    out.push({
      inst: 'guitar',
      midi: diatonicHarmony(lm[0], pcs, 2),
      dur: lm[1],
      vol: 0.18 * arc,
      at: lm[2] ?? 0,
      pan: -0.4,
      room: 0.2,
      reverb: 0.42,
      delay: 0.22,
      bright: 1.12,
      minIntensity: 0.72,
    });
  }

  addArchetypeAccent(out, ctx, bar, step, info.root, info.org[3], breakdown);
  return out;
}

// =========================================================================
// 9. VICTORY (130 BPM, D Major, 32 bars) — Grand Tour Finish Line Fanfare
// =========================================================================

const D_MAJ_PCS = [2, 4, 6, 7, 9, 11, 1]; // D E F# G A B C#

const VIC_BARS: ReadonlyArray<{ root: number; chord: number[]; pad: number[] }> = [
  // A (0-7): D - A/C# - Bm - G | D - G - Em7 - A7
  { root: 38, chord: [62, 66, 69, 74], pad: [50, 57, 62, 66] },
  { root: 37, chord: [61, 64, 69, 73], pad: [49, 57, 61, 64] },
  { root: 35, chord: [59, 62, 66, 71], pad: [47, 54, 59, 62] },
  { root: 43, chord: [55, 59, 62, 67], pad: [43, 50, 55, 59] },
  { root: 38, chord: [62, 66, 69, 74], pad: [50, 57, 62, 66] },
  { root: 43, chord: [55, 59, 62, 67], pad: [43, 50, 55, 59] },
  { root: 40, chord: [52, 55, 59, 64], pad: [40, 47, 52, 55] },
  { root: 45, chord: [57, 61, 64, 69], pad: [45, 52, 57, 61] },
  // B (8-15): G - A - F#m - Bm | Em - G - A - D
  { root: 43, chord: [55, 59, 62, 67], pad: [43, 50, 55, 59] },
  { root: 45, chord: [57, 61, 64, 69], pad: [45, 52, 57, 61] },
  { root: 42, chord: [54, 57, 61, 66], pad: [42, 49, 54, 57] },
  { root: 35, chord: [59, 62, 66, 71], pad: [47, 54, 59, 62] },
  { root: 40, chord: [52, 55, 59, 64], pad: [40, 47, 52, 55] },
  { root: 43, chord: [55, 59, 62, 67], pad: [43, 50, 55, 59] },
  { root: 45, chord: [57, 61, 64, 69], pad: [45, 52, 57, 61] },
  { root: 38, chord: [62, 66, 69, 74], pad: [50, 57, 62, 66] },
  // C (16-23): Podium Reflection — Bm - G - D - A | Em - F#m - G - A
  { root: 35, chord: [59, 62, 66, 71], pad: [47, 54, 59, 62] },
  { root: 43, chord: [55, 59, 62, 67], pad: [43, 50, 55, 59] },
  { root: 38, chord: [62, 66, 69, 74], pad: [50, 57, 62, 66] },
  { root: 45, chord: [57, 61, 64, 69], pad: [45, 52, 57, 61] },
  { root: 40, chord: [52, 55, 59, 64], pad: [40, 47, 52, 55] },
  { root: 42, chord: [54, 57, 61, 66], pad: [42, 49, 54, 57] },
  { root: 43, chord: [55, 59, 62, 67], pad: [43, 50, 55, 59] },
  { root: 45, chord: [57, 61, 64, 69], pad: [45, 52, 57, 61] },
  // D (24-31): Champagne Finale — D - A/C# - Bm - G | Em - G - A - D
  { root: 38, chord: [62, 66, 69, 74], pad: [50, 57, 62, 66] },
  { root: 37, chord: [61, 64, 69, 73], pad: [49, 57, 61, 64] },
  { root: 35, chord: [59, 62, 66, 71], pad: [47, 54, 59, 62] },
  { root: 43, chord: [55, 59, 62, 67], pad: [43, 50, 55, 59] },
  { root: 40, chord: [52, 55, 59, 64], pad: [40, 47, 52, 55] },
  { root: 43, chord: [55, 59, 62, 67], pad: [43, 50, 55, 59] },
  { root: 45, chord: [57, 61, 64, 69], pad: [45, 52, 57, 61] },
  { root: 38, chord: [62, 66, 69, 74], pad: [50, 57, 62, 66] },
];

const VIC_MEL: ReadonlyArray<MelEvent> = [
  // A (0-7)
  [62, 0.9], [66, 0.85], [69, 1.0], [74, 1.3],
  [73, 1.5], null, [69, 0.9], [64, 0.9],
  [66, 0.9], [69, 0.85], [71, 1.3], null,
  [74, 1.2], [71, 0.8], [67, 1.5], null,
  [69, 0.9], [74, 0.85], [78, 1.2], [74, 0.85],
  [79, 1.5], null, [74, 0.9], [71, 0.9],
  [76, 1.2], [74, 0.8], [71, 1.0], [67, 0.85],
  [69, 1.2], [73, 0.9], [76, 1.6], null,
  // B (8-15)
  [79, 1.5], null, [78, 0.9], [74, 0.9],
  [76, 1.5], null, [73, 0.9], [69, 0.9],
  [73, 1.0], [76, 0.85], [78, 1.5], null,
  [74, 1.2], [71, 0.9], [74, 1.5], null,
  [76, 1.2], [74, 0.8], [71, 1.0], [76, 0.85],
  [79, 1.5], null, [78, 0.9], [74, 0.9],
  [76, 1.2], [79, 0.9], [81, 1.5], null,
  [86, 2.6], null, null, null,
  // C (16-23): Warm flute reflection
  [71, 2.0], null, [74, 1.1], null,
  [74, 2.0], null, [71, 1.1], null,
  [74, 1.6], null, [78, 1.2], null,
  [76, 2.2], null, null, null,
  [76, 1.6], null, [79, 1.1], null,
  [78, 1.6], null, [81, 1.1], null,
  [79, 1.6], null, [83, 1.1], null,
  [81, 2.4], null, null, null,
  // D (24-31): Full triumphant fanfare
  [74, 0.9], [78, 0.85], [81, 1.0], [86, 1.4],
  [85, 1.5], null, [81, 0.9], [76, 0.9],
  [78, 0.9], [81, 0.85], [83, 1.3], null,
  [86, 1.2], [83, 0.85], [79, 1.5], null,
  [76, 1.1], [79, 0.85], [83, 1.2], [79, 0.85],
  [79, 1.4], null, [83, 0.9], [86, 0.9],
  [81, 1.2], [85, 0.9], [88, 1.5], null,
  [86, 2.8], null, null, null,
];

function victoryNotes(beat: number): ScoreNote[] {
  const b = beat % PHRASE_BEATS, bar = Math.floor(b / 4), step = b % 4, pass = Math.floor(beat / PHRASE_BEATS);
  const info = VIC_BARS[bar];
  const arc = phraseArc(bar);
  const breakdown = bar >= 16 && bar < 24;
  const climax = bar >= 24;
  const bSection = bar >= 8 && bar < 16;
  const out: ScoreNote[] = [];

  if (step === 0) {
    widePad(out, 'strings', info.pad, 4.0, 0.21 * arc, { bright: 1.15 });
    if (!breakdown) {
      out.push({ inst: 'brass', midi: info.chord[0], dur: 1.8, vol: 0.2 * arc, pan: -0.44, reverb: 0.62, bright: 1.18 });
      out.push({ inst: 'brass', midi: info.chord[2], dur: 1.8, vol: 0.18 * arc, pan: 0.44, reverb: 0.62, bright: 1.18 });
    }
    harpGliss(out, [...info.chord, info.chord[0] + 12], 1.8, 0.16 * arc, 0, 0.055);
  }

  out.push({ inst: 'bass', midi: info.root, dur: breakdown ? 1.8 : 0.65, vol: 0.28 * arc, pan: 0, room: 0.12 });
  if (!breakdown && (step === 1 || step === 3)) {
    out.push({ inst: 'lute', midi: info.chord[step % 4], dur: 0.6, vol: 0.18 * arc, at: 0.5, pan: -0.36, room: 0.28, reverb: 0.15 });
  }

  addKit(out, bar, step, pass, { breakdown, climax, bSection, kickMidi: 42 });

  const vm = VIC_MEL[b];
  if (vm) {
    out.push({
      inst: breakdown ? 'flute' : 'fiddle',
      midi: vm[0],
      dur: vm[1],
      vol: 0.23 * arc,
      pan: 0.18,
      reverb: 0.54,
      delay: 0.34,
      bright: 1.2,
    });
    if (!breakdown) {
      out.push({ inst: 'bell', midi: vm[0], dur: vm[1] * 1.4, vol: 0.11 * arc, pan: -0.42, reverb: 0.78, delay: 0.4 });
    }
    if (climax) {
      out.push({
        inst: 'fiddle',
        midi: diatonicHarmony(vm[0], D_MAJ_PCS, 2),
        dur: vm[1],
        vol: 0.15 * arc,
        pan: -0.36,
        reverb: 0.54,
      });
    }
  }
  return out;
}

/** Notes starting on `beat` (integer >= 0) for `cue` with optional adaptive context. Pure. */
export function cueNotes(cue: DungeonCue, beat: number, ctx?: ScoreContext): ScoreNote[] {
  switch (cue) {
    case 'camp': return campNotes(beat);
    case 'keep': return keepNotes(beat, ctx);
    case 'crypt': return cryptNotes(beat, ctx);
    case 'catacombs': return catacombsNotes(beat, ctx);
    case 'deep': return deepNotes(beat, ctx);
    case 'boss': return bossNotes(beat, ctx);
    case 'wyrm': return wyrmNotes(beat, ctx);
    case 'sweeper': return sweeperNotes(beat, ctx);
    case 'victory': return victoryNotes(beat);
  }
}
