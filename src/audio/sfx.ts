// Tiny WebAudio synth for game sound effects. No assets; every sound is a short recipe.
// Renderers import this (browser-only). Safe to import in Node: nothing runs until play().
import { loadFlag, saveFlag } from '../debug/flag';

export type SfxName =
  | 'shoot' | 'shootHeavy' | 'zap' | 'flame' | 'hit' | 'crit' | 'kill' | 'explode' | 'hurt'
  | 'coin' | 'pickup' | 'equip' | 'unique' | 'levelup' | 'potion' | 'door' | 'bossStart' | 'bossDie'
  | 'stairs' | 'shrine' | 'reward' | 'select' | 'buy' | 'deny' | 'curse'
  | 'build' | 'horn' | 'foghorn' | 'bell' | 'thunder' | 'wreck' | 'splash' | 'chime' | 'surge' | 'lampOut' | 'gull'
  | 'upgrade' | 'unlock' | 'rescue' | 'roar' | 'screech' | 'whoosh' | 'plop' | 'croak'
  | 'rail' | 'railReady' | 'swap' | 'lens' | 'emp' | 'siren' | 'alarm' | 'overdrive'
  | 'uiMove' | 'uiSelect' | 'uiBack' | 'uiTick' | 'uiWake' | 'countTick'
  | 'count' | 'go' | 'gameOver' | 'milestone'
  | 'birdTrill' | 'birdWhistle' | 'birdChirp' | 'monkeyHoot' | 'songbird' | 'cow' | 'waveWash' | 'windGust' | 'hawk'
  | 'bubblePop' | 'whale' | 'rumble' | 'lavaBubble' | 'windHowl' | 'ufoWarble' | 'cricket' | 'chStatic'
  | 'festival' | 'cheer' | 'giggle' | 'baa' | 'puffin';

/** `atk`: fade-in seconds (swells); `vib`: frequency modulation (FM chirps, warbles) as LFO Hz and depth in Hz; noise `f1` sweeps its filter. */
interface Tone { type: OscillatorType | 'noise'; f0: number; f1?: number; dur: number; vol: number; delay?: number; q?: number; atk?: number; vib?: { hz: number; depth: number } }
const R: Record<SfxName, Tone[]> = {
  shoot: [{ type: 'square', f0: 880, f1: 440, dur: 0.06, vol: 0.12 }],
  shootHeavy: [{ type: 'sawtooth', f0: 300, f1: 90, dur: 0.12, vol: 0.16 }, { type: 'noise', f0: 1200, dur: 0.08, vol: 0.12 }],
  zap: [{ type: 'sawtooth', f0: 1800, f1: 300, dur: 0.09, vol: 0.1 }],
  flame: [{ type: 'noise', f0: 700, dur: 0.12, vol: 0.08 }],
  hit: [{ type: 'square', f0: 220, f1: 110, dur: 0.05, vol: 0.1 }],
  crit: [{ type: 'square', f0: 1320, f1: 660, dur: 0.07, vol: 0.12 }, { type: 'noise', f0: 3000, dur: 0.05, vol: 0.08 }],
  kill: [{ type: 'triangle', f0: 520, f1: 130, dur: 0.14, vol: 0.18 }, { type: 'noise', f0: 900, dur: 0.1, vol: 0.08 }],
  explode: [{ type: 'noise', f0: 400, dur: 0.35, vol: 0.3 }, { type: 'sine', f0: 120, f1: 40, dur: 0.3, vol: 0.3 }],
  hurt: [{ type: 'sawtooth', f0: 180, f1: 70, dur: 0.15, vol: 0.2 }],
  coin: [{ type: 'square', f0: 1568, dur: 0.05, vol: 0.07 }, { type: 'square', f0: 2093, dur: 0.08, vol: 0.07, delay: 0.05 }],
  pickup: [{ type: 'triangle', f0: 660, f1: 990, dur: 0.1, vol: 0.15 }],
  equip: [{ type: 'triangle', f0: 523, dur: 0.08, vol: 0.18 }, { type: 'triangle', f0: 784, dur: 0.12, vol: 0.18, delay: 0.08 }],
  unique: [523, 659, 784, 1047, 1319].map((f, i) => ({ type: 'triangle' as const, f0: f, dur: 0.25, vol: 0.2, delay: i * 0.09 })),
  levelup: [523, 659, 784, 1047].map((f, i) => ({ type: 'square' as const, f0: f, dur: 0.12, vol: 0.12, delay: i * 0.07 })),
  potion: [{ type: 'sine', f0: 400, f1: 900, dur: 0.25, vol: 0.18 }],
  door: [{ type: 'square', f0: 110, f1: 80, dur: 0.18, vol: 0.15 }, { type: 'noise', f0: 500, dur: 0.12, vol: 0.1 }],
  bossStart: [{ type: 'sawtooth', f0: 70, f1: 55, dur: 1.0, vol: 0.25 }, { type: 'sawtooth', f0: 104, f1: 82, dur: 1.0, vol: 0.18 }],
  bossDie: [{ type: 'noise', f0: 300, dur: 0.8, vol: 0.3 }, ...[392, 523, 659, 784].map((f, i) => ({ type: 'triangle' as const, f0: f, dur: 0.3, vol: 0.2, delay: 0.3 + i * 0.1 }))],
  stairs: [784, 659, 523, 392, 262].map((f, i) => ({ type: 'triangle' as const, f0: f, dur: 0.14, vol: 0.15, delay: i * 0.08 })),
  shrine: [{ type: 'sine', f0: 330, f1: 660, dur: 0.6, vol: 0.18 }, { type: 'sine', f0: 495, f1: 990, dur: 0.6, vol: 0.12 }],
  reward: [659, 784, 988, 1319].map((f, i) => ({ type: 'square' as const, f0: f, dur: 0.15, vol: 0.12, delay: i * 0.06 })),
  select: [{ type: 'square', f0: 660, dur: 0.04, vol: 0.08 }],
  buy: [{ type: 'square', f0: 784, dur: 0.06, vol: 0.12 }, { type: 'square', f0: 1175, dur: 0.1, vol: 0.12, delay: 0.06 }],
  deny: [{ type: 'square', f0: 140, dur: 0.12, vol: 0.12 }],
  build: [
    ...[0, 0.16, 0.32, 0.5].map((d) => ({ type: 'noise' as const, f0: 900, dur: 0.07, vol: 0.18, delay: d, q: 2 })),
    { type: 'triangle', f0: 523, dur: 0.15, vol: 0.12, delay: 0.62 }, { type: 'triangle', f0: 784, dur: 0.25, vol: 0.12, delay: 0.72 },
  ],
  horn: [{ type: 'sawtooth', f0: 147, dur: 0.9, vol: 0.12 }, { type: 'sawtooth', f0: 185, dur: 0.9, vol: 0.08 }, { type: 'sine', f0: 147, dur: 0.9, vol: 0.2 }],
  foghorn: [{ type: 'sawtooth', f0: 82, f1: 78, dur: 2.2, vol: 0.2 }, { type: 'sine', f0: 82, f1: 78, dur: 2.2, vol: 0.3 }, { type: 'sawtooth', f0: 123, f1: 117, dur: 2.2, vol: 0.08 }],
  bell: [{ type: 'sine', f0: 660, dur: 2.2, vol: 0.16 }, { type: 'sine', f0: 1584, dur: 1.2, vol: 0.06 }, { type: 'sine', f0: 990, dur: 1.6, vol: 0.05 }],
  thunder: [{ type: 'noise', f0: 160, dur: 2.2, vol: 0.5, q: 0.5 }, { type: 'noise', f0: 600, dur: 0.25, vol: 0.25, delay: 0.05 }, { type: 'sine', f0: 55, f1: 35, dur: 1.5, vol: 0.3 }],
  wreck: [{ type: 'sawtooth', f0: 90, f1: 60, dur: 0.8, vol: 0.15 }, { type: 'noise', f0: 350, dur: 0.6, vol: 0.25, delay: 0.1 }, { type: 'triangle', f0: 392, f1: 196, dur: 0.6, vol: 0.12, delay: 0.5 }],
  splash: [{ type: 'noise', f0: 1200, dur: 0.5, vol: 0.25, q: 0.4 }, { type: 'noise', f0: 500, dur: 0.6, vol: 0.15, delay: 0.15 }],
  chime: [784, 988, 1175].map((f, i) => ({ type: 'sine' as const, f0: f, dur: 0.6, vol: 0.1, delay: i * 0.1 })),
  surge: [{ type: 'sawtooth', f0: 220, f1: 880, dur: 0.6, vol: 0.12 }, { type: 'noise', f0: 2400, dur: 0.4, vol: 0.12, delay: 0.1 }],
  lampOut: [{ type: 'triangle', f0: 440, f1: 110, dur: 1.0, vol: 0.2 }, { type: 'noise', f0: 300, dur: 0.4, vol: 0.12 }],
  upgrade: [392, 523, 659, 784, 1047].map((f, i) => ({ type: 'triangle' as const, f0: f, dur: 0.22, vol: 0.14, delay: i * 0.08 })),
  unlock: [{ type: 'sine', f0: 262, dur: 1.2, vol: 0.15 }, { type: 'sine', f0: 330, dur: 1.2, vol: 0.12, delay: 0.15 }, { type: 'sine', f0: 392, dur: 1.2, vol: 0.12, delay: 0.3 }, { type: 'triangle', f0: 523, dur: 1.4, vol: 0.12, delay: 0.45 }],
  rescue: [{ type: 'square', f0: 880, dur: 0.15, vol: 0.08 }, { type: 'square', f0: 660, dur: 0.15, vol: 0.08, delay: 0.2 }, { type: 'square', f0: 880, dur: 0.15, vol: 0.08, delay: 0.4 }, { type: 'square', f0: 660, dur: 0.15, vol: 0.08, delay: 0.6 }],
  roar: [{ type: 'sawtooth', f0: 95, f1: 70, dur: 0.9, vol: 0.18 }, { type: 'sawtooth', f0: 142, f1: 100, dur: 0.8, vol: 0.1 }, { type: 'noise', f0: 260, dur: 0.8, vol: 0.2, q: 1.2 }],
  screech: [{ type: 'sawtooth', f0: 2400, f1: 1500, dur: 0.35, vol: 0.06 }, { type: 'triangle', f0: 2900, f1: 1800, dur: 0.4, vol: 0.06, delay: 0.05 }],
  whoosh: [{ type: 'noise', f0: 600, dur: 0.45, vol: 0.2, q: 0.6 }, { type: 'sine', f0: 300, f1: 700, dur: 0.35, vol: 0.08 }],
  croak: [{ type: 'square', f0: 160, f1: 120, dur: 0.07, vol: 0.06 }, { type: 'square', f0: 170, f1: 125, dur: 0.07, vol: 0.06, delay: 0.1 }, { type: 'noise', f0: 300, dur: 0.15, vol: 0.05, q: 2 }],
  plop: [{ type: 'sine', f0: 900, f1: 260, dur: 0.12, vol: 0.12 }, { type: 'noise', f0: 1400, dur: 0.12, vol: 0.06, delay: 0.03 }],
  gull: [{ type: 'triangle', f0: 1500, f1: 1100, dur: 0.18, vol: 0.05 }, { type: 'triangle', f0: 1600, f1: 1200, dur: 0.2, vol: 0.05, delay: 0.24 }],
  rail: [{ type: 'sawtooth', f0: 2400, f1: 120, dur: 0.45, vol: 0.16 }, { type: 'sine', f0: 90, f1: 40, dur: 0.5, vol: 0.3 }, { type: 'noise', f0: 3000, dur: 0.25, vol: 0.15 }],
  railReady: [{ type: 'sine', f0: 660, f1: 1320, dur: 0.18, vol: 0.1 }, { type: 'triangle', f0: 1320, dur: 0.2, vol: 0.08, delay: 0.15 }],
  swap: [{ type: 'square', f0: 330, f1: 220, dur: 0.06, vol: 0.08 }, { type: 'noise', f0: 1500, dur: 0.05, vol: 0.06, delay: 0.05 }, { type: 'square', f0: 440, f1: 660, dur: 0.08, vol: 0.08, delay: 0.1 }],
  lens: [{ type: 'sine', f0: 1800, f1: 900, dur: 0.22, vol: 0.08 }, { type: 'triangle', f0: 900, f1: 450, dur: 0.2, vol: 0.06 }],
  emp: [{ type: 'sine', f0: 60, f1: 30, dur: 1.2, vol: 0.4 }, { type: 'sawtooth', f0: 200, f1: 2000, dur: 0.4, vol: 0.1 }, { type: 'noise', f0: 800, dur: 1.0, vol: 0.25, q: 0.4 }],
  siren: [{ type: 'triangle', f0: 440, f1: 660, dur: 0.3, vol: 0.09 }, { type: 'triangle', f0: 660, f1: 440, dur: 0.3, vol: 0.09, delay: 0.3 }],
  alarm: [0, 0.18, 0.36].map((d) => ({ type: 'square' as const, f0: 880, f1: 660, dur: 0.12, vol: 0.07, delay: d })),
  overdrive: [{ type: 'sawtooth', f0: 110, f1: 440, dur: 0.5, vol: 0.14 }, { type: 'square', f0: 220, f1: 880, dur: 0.5, vol: 0.06 }],
  // menu UI: quiet and short so they never fight the ride
  uiMove: [{ type: 'triangle', f0: 1046, dur: 0.035, vol: 0.05 }],
  uiSelect: [{ type: 'triangle', f0: 784, dur: 0.05, vol: 0.09 }, { type: 'triangle', f0: 1175, dur: 0.08, vol: 0.09, delay: 0.045 }],
  uiBack: [{ type: 'triangle', f0: 784, dur: 0.05, vol: 0.08 }, { type: 'triangle', f0: 523, dur: 0.08, vol: 0.08, delay: 0.045 }],
  uiTick: [{ type: 'square', f0: 1568, dur: 0.02, vol: 0.035 }],
  uiWake: [{ type: 'sine', f0: 392, f1: 784, dur: 0.25, vol: 0.08 }],
  count: [{ type: 'square', f0: 660, dur: 0.12, vol: 0.12 }],
  go: [{ type: 'square', f0: 1320, dur: 0.35, vol: 0.14 }, { type: 'triangle', f0: 660, dur: 0.35, vol: 0.1 }],
  gameOver: [523, 415, 349, 262].map((f, i) => ({ type: 'triangle' as const, f0: f, dur: 0.3, vol: 0.14, delay: i * 0.16 })),
  milestone: [{ type: 'triangle', f0: 880, dur: 0.12, vol: 0.1 }, { type: 'triangle', f0: 1320, dur: 0.2, vol: 0.1, delay: 0.1 }],
  countTick: [{ type: 'square', f0: 2093, dur: 0.015, vol: 0.025 }],
  // scenery one-shots for the warm-up biomes: synthesised, very quiet (the menu UI sounds are 2-3x louder)
  birdTrill: [{ type: 'sine', f0: 3100, f1: 3500, dur: 0.5, vol: 0.03, vib: { hz: 28, depth: 700 } }],
  birdWhistle: [{ type: 'sine', f0: 1900, f1: 2700, dur: 0.22, vol: 0.035 }, { type: 'sine', f0: 2700, f1: 2100, dur: 0.3, vol: 0.035, delay: 0.26 }],
  birdChirp: [0, 0.11, 0.24].map((d, i) => ({ type: 'sine' as const, f0: 3600 - i * 200, f1: 4400 - i * 300, dur: 0.07, vol: 0.028, delay: d })),
  monkeyHoot: [{ type: 'triangle', f0: 380, f1: 520, dur: 0.22, vol: 0.05, vib: { hz: 14, depth: 40 } }, { type: 'triangle', f0: 520, f1: 330, dur: 0.35, vol: 0.05, delay: 0.25, vib: { hz: 14, depth: 40 } }, { type: 'triangle', f0: 400, f1: 560, dur: 0.18, vol: 0.04, delay: 0.7 }],
  songbird: [0, 0.14, 0.28, 0.5, 0.64].map((d, i) => ({ type: 'sine' as const, f0: 2400 + (i % 3) * 450, f1: 2900 + ((i * 2) % 3) * 400, dur: 0.1, vol: 0.026, delay: d, vib: { hz: 18, depth: 160 } })),
  cow: [{ type: 'sawtooth', f0: 150, f1: 105, dur: 1.1, vol: 0.03, atk: 0.2, vib: { hz: 5, depth: 8 } }, { type: 'noise', f0: 350, dur: 1.0, vol: 0.02, q: 2, atk: 0.2 }],
  waveWash: [{ type: 'noise', f0: 300, f1: 1100, dur: 2.6, vol: 0.05, q: 0.5, atk: 1.2 }],
  windGust: [{ type: 'noise', f0: 400, f1: 900, dur: 3.2, vol: 0.05, q: 0.7, atk: 1.4 }],
  hawk: [{ type: 'sawtooth', f0: 3000, f1: 1700, dur: 0.7, vol: 0.022, atk: 0.04, vib: { hz: 9, depth: 120 } }, { type: 'triangle', f0: 3300, f1: 1900, dur: 0.7, vol: 0.02, atk: 0.04 }],
  bubblePop: [{ type: 'sine', f0: 500, f1: 1400, dur: 0.07, vol: 0.05 }, { type: 'sine', f0: 700, f1: 1700, dur: 0.06, vol: 0.04, delay: 0.1 }],
  whale: [{ type: 'sine', f0: 90, f1: 150, dur: 3.2, vol: 0.09, atk: 1.0, vib: { hz: 2.2, depth: 12 } }, { type: 'sine', f0: 140, f1: 70, dur: 2.4, vol: 0.05, delay: 0.8, atk: 0.8 }],
  rumble: [{ type: 'noise', f0: 90, f1: 60, dur: 2.4, vol: 0.12, q: 0.8, atk: 0.9 }, { type: 'sine', f0: 48, f1: 38, dur: 2.2, vol: 0.1, atk: 0.8 }],
  lavaBubble: [{ type: 'sine', f0: 140, f1: 320, dur: 0.14, vol: 0.07 }, { type: 'noise', f0: 500, dur: 0.1, vol: 0.03, q: 2, delay: 0.1 }],
  windHowl: [{ type: 'noise', f0: 700, f1: 1300, dur: 3.6, vol: 0.05, q: 6, atk: 1.6 }, { type: 'sine', f0: 520, f1: 640, dur: 3.4, vol: 0.012, atk: 1.6, vib: { hz: 0.7, depth: 40 } }],
  ufoWarble: [{ type: 'sine', f0: 900, f1: 1300, dur: 1.4, vol: 0.03, atk: 0.3, vib: { hz: 7, depth: 220 } }, { type: 'sine', f0: 1350, f1: 800, dur: 1.2, vol: 0.02, delay: 0.5, atk: 0.2, vib: { hz: 9, depth: 160 } }],
  cricket: [0, 0.07, 0.14, 0.21, 0.28].map((d) => ({ type: 'square' as const, f0: 4300, dur: 0.035, vol: 0.008, delay: d })),
  // drive-in channel flip: a click then a burst of static
  chStatic: [{ type: 'square', f0: 220, f1: 90, dur: 0.04, vol: 0.07 }, { type: 'noise', f0: 3000, dur: 0.4, vol: 0.06, q: 0.3, delay: 0.02 }],
  // island village (Keeper's Light)
  festival: [523, 659, 784, 659, 784, 1047].map((f, i) => ({ type: 'triangle' as const, f0: f, dur: i === 5 ? 0.6 : 0.16, vol: 0.13, delay: [0, 0.14, 0.28, 0.5, 0.64, 0.8][i] })),
  cheer: [
    ...[0, 0.05, 0.12, 0.2].map((d, i) => ({ type: 'noise' as const, f0: 900 + i * 350, f1: 1400 + i * 300, dur: 0.9, vol: 0.05, q: 1.6, delay: d, atk: 0.12 })),
    { type: 'triangle', f0: 520, f1: 700, dur: 0.45, vol: 0.035, delay: 0.1, vib: { hz: 6, depth: 25 } }, { type: 'triangle', f0: 640, f1: 860, dur: 0.4, vol: 0.03, delay: 0.25, vib: { hz: 7, depth: 30 } },
  ],
  giggle: [0, 0.09, 0.18, 0.27, 0.36].map((d, i) => ({ type: 'sine' as const, f0: 1250 - i * 60, f1: 1050 - i * 60, dur: 0.07, vol: 0.03, delay: d })),
  baa: [{ type: 'sawtooth', f0: 330, f1: 300, dur: 0.6, vol: 0.022, atk: 0.04, vib: { hz: 9, depth: 18 } }, { type: 'sawtooth', f0: 660, f1: 600, dur: 0.55, vol: 0.008, atk: 0.04, vib: { hz: 9, depth: 30 } }],
  puffin: [{ type: 'sawtooth', f0: 140, f1: 110, dur: 0.5, vol: 0.03, atk: 0.05, vib: { hz: 24, depth: 20 } }, { type: 'sawtooth', f0: 150, f1: 120, dur: 0.4, vol: 0.025, delay: 0.55, vib: { hz: 22, depth: 18 } }],
  curse: [{ type: 'sawtooth', f0: 220, f1: 110, dur: 0.9, vol: 0.18 }, { type: 'sawtooth', f0: 233, f1: 116, dur: 0.9, vol: 0.18 }, { type: 'noise', f0: 300, dur: 0.6, vol: 0.12 }],
};

const KEY = 'wattcade.sound';
let ac: AudioContext | null = null, master: GainNode | null = null, noise: AudioBuffer | null = null;
let enabled = loadFlag(KEY, true);
const lastPlayed = new Map<SfxName, number>();

function ctx(): AudioContext | null {
  if (ac) return ac;
  const AC = (globalThis as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext
    ?? (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  ac = new AC();
  master = ac.createGain(); master.gain.value = 0.6; master.connect(ac.destination);
  noise = ac.createBuffer(1, ac.sampleRate * 0.5, ac.sampleRate);
  const d = noise.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return ac;
}

/** The shared audio graph for game-made music (null until audio is unlocked, or when sound is off). Respects the ambient ducker. */
export function audioOut(): { ctx: AudioContext; out: AudioNode; ducked: boolean } | null {
  const c = ctx(); if (!c || !master || !enabled || c.state !== 'running') return null;
  return { ctx: c, out: master, ducked: duckers.size > 0 };
}

/** Call from any user gesture (iOS needs it before audio can start). */
export function unlockAudio(): void { const c = ctx(); if (c && c.state !== 'running') void c.resume(); }
export function soundEnabled(): boolean { return enabled; }
export function setSoundEnabled(v: boolean): void { enabled = v; saveFlag(KEY, v); }

/** Play a named effect. `minGapS` rate-limits spammy sounds (e.g. per-shot). */
export function play(name: SfxName, opts: { vol?: number; minGapS?: number; pitch?: number } = {}): void {
  if (!enabled) return;
  const c = ctx(); if (!c || !master || c.state !== 'running') return;
  const now = c.currentTime;
  if (opts.minGapS && now - (lastPlayed.get(name) ?? -1) < opts.minGapS) return;
  lastPlayed.set(name, now);
  const vol = opts.vol ?? 1, p = opts.pitch ?? 1;
  for (const tn of R[name]) {
    const t0 = now + (tn.delay ?? 0), g = c.createGain();
    if (tn.atk) { g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(tn.vol * vol, t0 + tn.atk); }
    else g.gain.setValueAtTime(tn.vol * vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + tn.dur);
    g.connect(master);
    if (tn.type === 'noise') {
      const s = c.createBufferSource(); s.buffer = noise;
      const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.setValueAtTime(tn.f0 * p, t0); f.Q.value = tn.q ?? 0.8;
      if (tn.f1) f.frequency.exponentialRampToValueAtTime(tn.f1 * p, t0 + tn.dur);
      s.connect(f); f.connect(g); s.start(t0); s.stop(t0 + tn.dur);
    } else {
      const o = c.createOscillator(); o.type = tn.type;
      o.frequency.setValueAtTime(tn.f0 * p, t0);
      if (tn.f1) o.frequency.exponentialRampToValueAtTime(tn.f1 * p, t0 + tn.dur);
      if (tn.vib) {
        const l = c.createOscillator(), lg = c.createGain(); l.frequency.value = tn.vib.hz; lg.gain.value = tn.vib.depth * p;
        l.connect(lg); lg.connect(o.frequency); l.start(t0); l.stop(t0 + tn.dur + 0.02);
      }
      o.connect(g); o.start(t0); o.stop(t0 + tn.dur + 0.02);
    }
  }
}

// ----- ambient beds (looping filtered noise; e.g. surf, wind, rain) -----
const beds = new Map<string, { gain: GainNode; filter: BiquadFilterNode; src: AudioBufferSourceNode; vol: number }>();
const duckers = new Set<string>();
/** True while something (music, the Drive-In) holds the ambient ducker: scenery one-shots stay quiet too. */
export function ambientDucked(): boolean { return duckers.size > 0; }
/** Silence every ambient bed while music plays (`on`), keyed so several owners can hold it (picker, player…). */
export function duckAmbient(owner: string, on: boolean): void {
  if (on) duckers.add(owner); else duckers.delete(owner);
  const c = ac; if (!c) return;
  for (const b of beds.values()) { b.gain.gain.cancelScheduledValues(c.currentTime); b.gain.gain.setTargetAtTime(enabled && !duckers.size ? b.vol : 0, c.currentTime, 0.3); }
}
/** Set a looping noise bed's level (0 = silent) and filter centre. Cheap to call every frame. */
export function setAmbient(id: string, vol: number, freq = 500, q = 0.7): void {
  const c = ctx(); if (!c || !master || !noise || c.state !== 'running') return;
  let b = beds.get(id);
  if (!b) {
    const src = c.createBufferSource(); src.buffer = noise; src.loop = true;
    const filter = c.createBiquadFilter(); filter.type = 'bandpass';
    const gain = c.createGain(); gain.gain.value = 0;
    src.connect(filter); filter.connect(gain); gain.connect(master); src.start();
    b = { gain, filter, src, vol }; beds.set(id, b);
  }
  b.vol = vol;
  const now = c.currentTime;
  b.gain.gain.cancelScheduledValues(now);
  b.gain.gain.setTargetAtTime(enabled && !duckers.size ? vol : 0, now, 0.3);
  b.filter.frequency.setTargetAtTime(freq, now, 0.3);
  b.filter.Q.value = q;
}
/** Stop and drop every ambient bed (call on unmount). */
export function stopAmbient(): void {
  for (const b of beds.values()) { try { b.src.stop(); } catch { /* already stopped */ } b.gain.disconnect(); }
  beds.clear();
}
