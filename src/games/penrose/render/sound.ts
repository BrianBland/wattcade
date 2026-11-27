/**
 * Monument Valley-inspired procedural WebAudio soundscape for Penrose Pedals.
 * Routed exclusively through Wattcade's shared audio bus (`audioOut`, `sfxGraph`, `setAmbient`)
 * so global mute, iOS unlock, and external-media ducking work seamlessly.
 */

import { audioOut, setAmbient, sfxGraph, stopAmbient } from '../../../audio/sfx';
import type { SimEvent, ThemeId } from '../sim/types';

/** Per-theme modal pentatonic frequency tables (Hz) so every chapter has its own musical voice. */
const SCALES: Record<ThemeId, readonly number[]> = {
  // Dusk: F Lydian pentatonic (dreamy, open)
  dusk: [349.23, 392.0, 440.0, 523.25, 587.33, 698.46, 783.99, 880.0],
  // Garden: G Major pentatonic (warm, bright)
  garden: [392.0, 440.0, 493.88, 587.33, 659.25, 783.99, 880.0, 987.77],
  // Town: D Mixolydian sunlit bells
  town: [293.66, 329.63, 369.99, 440.0, 523.25, 587.33, 659.25, 739.99],
  // Prism: Eb Lydian shimmer
  prism: [311.13, 349.23, 392.0, 466.16, 523.25, 622.25, 698.46, 783.99],
  // Night: C Dorian lantern chimes
  night: [261.63, 293.66, 311.13, 392.0, 440.0, 523.25, 587.33, 622.25],
  // Brass: A clockwork fifths & chimes
  brass: [220.0, 277.18, 329.63, 440.0, 493.88, 554.37, 659.25, 880.0],
  // Cube: E Major 9th crystal resonance
  cube: [329.63, 369.99, 415.3, 493.88, 554.37, 659.25, 739.99, 830.61],
};

const AMBIENT_BED: Record<ThemeId, { vol: number; freq: number; q: number }> = {
  dusk: { vol: 0.018, freq: 420, q: 1.1 },
  garden: { vol: 0.02, freq: 620, q: 0.8 },
  town: { vol: 0.024, freq: 480, q: 0.65 },
  prism: { vol: 0.016, freq: 760, q: 1.4 },
  night: { vol: 0.015, freq: 310, q: 1.3 },
  brass: { vol: 0.02, freq: 240, q: 1.8 },
  cube: { vol: 0.018, freq: 540, q: 1.2 },
};

function tone(
  freq: number,
  dur: number,
  vol: number,
  opts: { type?: OscillatorType; delay?: number; f1?: number; atk?: number } = {},
): void {
  const g = audioOut();
  if (!g) return;
  const { ctx, out } = g;
  const t0 = ctx.currentTime + (opts.delay ?? 0);
  const gain = ctx.createGain();
  const v = Math.max(0.0002, vol * (g.ducked ? 0.45 : 1));
  if (opts.atk) {
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(v, t0 + opts.atk);
  } else {
    gain.gain.setValueAtTime(v, t0);
  }
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  gain.connect(out);

  const osc = ctx.createOscillator();
  osc.type = opts.type ?? 'sine';
  osc.frequency.setValueAtTime(freq, t0);
  if (opts.f1) osc.frequency.exponentialRampToValueAtTime(opts.f1, t0 + dur);
  osc.connect(gain);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

function noiseBurst(freq: number, dur: number, vol: number, q = 1.5, delay = 0, f1?: number): void {
  const g = sfxGraph();
  if (!g) return;
  const { ctx, out, noise } = g;
  const t0 = ctx.currentTime + delay;
  const src = ctx.createBufferSource();
  src.buffer = noise;
  src.loop = true;
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(freq, t0);
  if (f1) filter.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
  filter.Q.value = q;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(Math.max(0.0002, vol), t0);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(filter);
  filter.connect(gain);
  gain.connect(out);
  src.start(t0);
  src.stop(t0 + dur + 0.02);
}

export class PenroseAudio {
  private lastTickAt = 0;
  private chimeStep = 0;

  setThemeAmbient(theme: ThemeId): void {
    const b = AMBIENT_BED[theme] ?? AMBIENT_BED.dusk;
    setAmbient('penrose-air', b.vol, b.freq, b.q);
  }

  handleEvent(e: SimEvent, theme: ThemeId): void {
    const scale = SCALES[theme] ?? SCALES.dusk;
    const p = e.pitch ?? 1;

    switch (e.kind) {
      case 'engage':
        tone(scale[1] * 0.5, 0.08, 0.08, { type: 'triangle', f1: scale[2] * 0.5 });
        noiseBurst(1600, 0.035, 0.05, 3);
        break;

      case 'disengage':
        tone(scale[2] * 0.5, 0.07, 0.06, { type: 'triangle', f1: scale[0] * 0.5 });
        break;

      case 'crankTick': {
        const now = typeof performance !== 'undefined' ? performance.now() : 0;
        if (now - this.lastTickAt < 75) break;
        this.lastTickAt = now;
        noiseBurst(1900 * p, 0.025, 0.035, 4.5);
        tone(170 * p, 0.03, 0.035, { type: 'triangle', f1: 120 * p });
        break;
      }

      case 'latch': {
        // Satisfying resonant stone/bell click home!
        const note = scale[this.chimeStep % 5] * p;
        this.chimeStep++;
        tone(110, 0.14, 0.12, { type: 'sine', f1: 68 });
        noiseBurst(1100, 0.04, 0.06, 2.2);
        tone(note, 0.42, 0.09, { type: 'sine', atk: 0.008 });
        tone(note * 2, 0.25, 0.035, { type: 'triangle', delay: 0.02 });
        break;
      }

      case 'perspJoin': {
        // Ethereal Escher optical shimmer (perfect fifth + octave harmonic)
        const n0 = scale[2], n1 = scale[4], n2 = scale[6];
        tone(n0, 0.55, 0.08, { type: 'sine', atk: 0.02 });
        tone(n1, 0.55, 0.07, { type: 'sine', delay: 0.045, atk: 0.02 });
        tone(n2, 0.65, 0.05, { type: 'triangle', delay: 0.09, atk: 0.02 });
        break;
      }

      case 'gapHidden':
        tone(scale[4], 0.35, 0.06, { type: 'sine', atk: 0.015 });
        tone(scale[7], 0.4, 0.04, { type: 'sine', delay: 0.05 });
        break;

      case 'key': {
        const idx = Math.min(scale.length - 2, Math.round((p - 0.9) / 0.16) + 2);
        tone(scale[Math.max(0, idx)], 0.35, 0.11, { type: 'triangle' });
        tone(scale[Math.min(scale.length - 1, idx + 2)], 0.45, 0.09, { type: 'sine', delay: 0.07 });
        break;
      }

      case 'gateOpen':
        [0, 2, 4, 6].forEach((k, i) => {
          tone(scale[k], 0.5, 0.09, { type: 'triangle', delay: i * 0.075 });
        });
        break;

      case 'bannerStep':
        tone(scale[3], 0.12, 0.07, { type: 'triangle', f1: scale[4] });
        break;

      case 'doorMatch':
        tone(scale[2], 0.45, 0.09, { type: 'sine' });
        tone(scale[5], 0.55, 0.09, { type: 'sine', delay: 0.06 });
        tone(scale[7], 0.65, 0.06, { type: 'triangle', delay: 0.12 });
        break;

      case 'portal':
        noiseBurst(700, 0.32, 0.07, 1.2, 0, 1800);
        tone(scale[3], 0.35, 0.07, { type: 'sine', f1: scale[6] });
        break;

      case 'seamToggle':
        tone(scale[p > 1 ? 4 : 1], 0.24, 0.09, { type: 'triangle', f1: scale[p > 1 ? 6 : 0] });
        break;

      case 'clutchWarn':
        tone(scale[5], 0.16, 0.09, { type: 'triangle' });
        tone(scale[6], 0.18, 0.08, { type: 'sine', delay: 0.05 });
        break;

      case 'clutchSlip':
        noiseBurst(1400, 0.25, 0.09, 1.5, 0, 350);
        tone(scale[4], 0.28, 0.1, { type: 'sawtooth', f1: scale[0] * 0.5 });
        break;

      case 'springTip':
        tone(scale[1], 0.2, 0.09, { type: 'triangle', f1: scale[4] });
        tone(scale[4], 0.45, 0.09, { type: 'sine', delay: 0.06 });
        break;

      case 'checkpoint':
        tone(scale[2], 0.28, 0.08, { type: 'sine' });
        tone(scale[4], 0.38, 0.08, { type: 'sine', delay: 0.08 });
        break;

      case 'fall':
        // Gentle marimba sigh (never harsh or punishing)
        tone(scale[3], 0.22, 0.09, { type: 'triangle', f1: scale[1] });
        tone(scale[1], 0.32, 0.08, { type: 'sine', delay: 0.1, f1: scale[0] * 0.75 });
        break;

      case 'win':
        // Monument Valley chord bloom
        [0, 2, 4, 5, 7].forEach((k, i) => {
          tone(scale[k], 0.85, 0.1 - i * 0.008, { type: i % 2 ? 'triangle' : 'sine', delay: i * 0.085, atk: 0.015 });
        });
        break;

      case 'chapterWin':
        [0, 2, 4, 5, 7].forEach((k, i) => {
          tone(scale[k], 1.2, 0.11, { type: 'sine', delay: 0.15 + i * 0.1, atk: 0.02 });
          tone(scale[k] * 1.5, 0.9, 0.04, { type: 'triangle', delay: 0.2 + i * 0.1, atk: 0.02 });
        });
        break;
    }
  }

  dispose(): void {
    stopAmbient();
  }
}
