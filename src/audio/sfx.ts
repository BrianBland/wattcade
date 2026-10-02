// Tiny WebAudio synth for game sound effects. No assets; every sound is a short recipe.
// Renderers import this (browser-only). Safe to import in Node: nothing runs until play().
import { loadFlag, saveFlag } from '../debug/flag';

export type SfxName =
  | 'shoot' | 'shootHeavy' | 'zap' | 'flame' | 'hit' | 'crit' | 'kill' | 'explode' | 'hurt'
  | 'coin' | 'pickup' | 'equip' | 'unique' | 'levelup' | 'potion' | 'door' | 'bossStart' | 'bossDie'
  | 'stairs' | 'shrine' | 'reward' | 'select' | 'buy' | 'deny' | 'curse';

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
