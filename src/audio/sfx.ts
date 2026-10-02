// Tiny WebAudio synth for game sound effects. No assets; every sound is a short recipe.
// Renderers import this (browser-only). Safe to import in Node: nothing runs until play().
import { loadFlag, saveFlag } from '../debug/flag';

export type SfxName =
  | 'shoot' | 'shootHeavy' | 'zap' | 'flame' | 'hit' | 'crit' | 'kill' | 'explode' | 'hurt'
  | 'coin' | 'pickup' | 'equip' | 'unique' | 'levelup' | 'potion' | 'door' | 'bossStart' | 'bossDie'
  | 'stairs' | 'shrine' | 'reward' | 'select' | 'buy' | 'deny' | 'curse'
  | 'build' | 'horn' | 'foghorn' | 'bell' | 'thunder' | 'wreck' | 'splash' | 'chime' | 'surge' | 'lampOut' | 'gull'
  | 'upgrade' | 'unlock' | 'rescue'
  | 'uiMove' | 'uiSelect' | 'uiBack' | 'uiTick' | 'uiWake' | 'countTick';

interface Tone { type: OscillatorType | 'noise'; f0: number; f1?: number; dur: number; vol: number; delay?: number; q?: number }
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
  gull: [{ type: 'triangle', f0: 1500, f1: 1100, dur: 0.18, vol: 0.05 }, { type: 'triangle', f0: 1600, f1: 1200, dur: 0.2, vol: 0.05, delay: 0.24 }],
  // menu UI: quiet and short so they never fight the ride
  uiMove: [{ type: 'triangle', f0: 1046, dur: 0.035, vol: 0.05 }],
  uiSelect: [{ type: 'triangle', f0: 784, dur: 0.05, vol: 0.09 }, { type: 'triangle', f0: 1175, dur: 0.08, vol: 0.09, delay: 0.045 }],
  uiBack: [{ type: 'triangle', f0: 784, dur: 0.05, vol: 0.08 }, { type: 'triangle', f0: 523, dur: 0.08, vol: 0.08, delay: 0.045 }],
  uiTick: [{ type: 'square', f0: 1568, dur: 0.02, vol: 0.035 }],
  uiWake: [{ type: 'sine', f0: 392, f1: 784, dur: 0.25, vol: 0.08 }],
  countTick: [{ type: 'square', f0: 2093, dur: 0.015, vol: 0.025 }],
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
    g.gain.setValueAtTime(tn.vol * vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + tn.dur);
    g.connect(master);
    if (tn.type === 'noise') {
      const s = c.createBufferSource(); s.buffer = noise;
      const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = tn.f0 * p; f.Q.value = tn.q ?? 0.8;
      s.connect(f); f.connect(g); s.start(t0); s.stop(t0 + tn.dur);
    } else {
      const o = c.createOscillator(); o.type = tn.type;
      o.frequency.setValueAtTime(tn.f0 * p, t0);
      if (tn.f1) o.frequency.exponentialRampToValueAtTime(tn.f1 * p, t0 + tn.dur);
      o.connect(g); o.start(t0); o.stop(t0 + tn.dur + 0.02);
    }
  }
}

// ----- ambient beds (looping filtered noise; e.g. surf, wind, rain) -----
const beds = new Map<string, { gain: GainNode; filter: BiquadFilterNode; src: AudioBufferSourceNode }>();
/** Set a looping noise bed's level (0 = silent) and filter centre. Cheap to call every frame. */
export function setAmbient(id: string, vol: number, freq = 500, q = 0.7): void {
  const c = ctx(); if (!c || !master || !noise || c.state !== 'running') return;
  let b = beds.get(id);
  if (!b) {
    const src = c.createBufferSource(); src.buffer = noise; src.loop = true;
    const filter = c.createBiquadFilter(); filter.type = 'bandpass';
    const gain = c.createGain(); gain.gain.value = 0;
    src.connect(filter); filter.connect(gain); gain.connect(master); src.start();
    b = { gain, filter, src }; beds.set(id, b);
  }
  const now = c.currentTime;
  b.gain.gain.setTargetAtTime(enabled ? vol : 0, now, 0.3);
  b.filter.frequency.setTargetAtTime(freq, now, 0.3);
  b.filter.Q.value = q;
}
/** Stop and drop every ambient bed (call on unmount). */
export function stopAmbient(): void {
  for (const b of beds.values()) { try { b.src.stop(); } catch { /* already stopped */ } b.gain.disconnect(); }
  beds.clear();
}
