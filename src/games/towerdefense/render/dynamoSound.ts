// The dynamo you hear: continuous synth layers driven by the rider's cadence and power and by the wave's weapon.
// `dynamoMix` is pure (unit-tested); `DynamoSound` feeds it to src/audio/voices every frame.
import { duckVoices, setVoice, stopVoices, type VoiceSpec } from '../../../audio/voices';
import type { Weapon } from '../sim/defs';

export interface DynamoIn {
  active: boolean; cadence: number; ftpFraction: number; crankRevs: number; overdrive: boolean;
  weapon: Weapon; /** Gatling shots in the last ~0.2 s (0 = idle) */ gatlingFiring: number;
  flaming: boolean; flamePower: number;
  railCharging: boolean; railProgress: number; railFull: boolean;
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const frac = (x: number) => x - Math.floor(x);
export const PREFIX = 'td-';

/** Flywheel hum pitch: 40 Hz at rest, ~90 Hz at 90 rpm, one octave up in Overdrive. */
export const humHz = (cadence: number, overdrive: boolean) => (40 + clamp(cadence, 0, 140) * 0.55) * (overdrive ? 2 : 1);
/** A soft swell on each pedal stroke (two per crank rev): 1 right after the stroke, decaying to 0. */
export const strokePulse = (crankRevs: number) => Math.exp(-frac(crankRevs * 2) * 6);
/** Load growl: silent below 55% FTP, full by 130%. */
export const growl = (ftpFraction: number) => clamp((ftpFraction - 0.55) / 0.75, 0, 1);
/** Gatling spin-up whine follows cadence: ~1.1 kHz at 90 rpm. */
export const gatlingHz = (cadence: number) => 300 + clamp(cadence, 0, 140) * 9;
/** Flame roar: brighter and louder with watts (flamePower is power relative to the weapon's nominal). */
export const flameRoar = (power: number) => { const p = clamp(power, 0, 1.5); return { gain: 0.05 + 0.08 * Math.min(1, p), freq: 380 + 950 * (p / 1.5) }; };
/** Rail capacitor whine rises as the next charge fills. */
export const railHz = (progress: number) => 280 + 1500 * clamp(progress, 0, 1);

export function dynamoMix(i: DynamoIn): Record<string, VoiceSpec> {
  const on = i.active ? 1 : 0, spin = clamp(i.cadence / 90, 0, 1.4), g = growl(i.ftpFraction), od = i.overdrive ? 1 : 0;
  const hz = humHz(i.cadence, false), pulse = strokePulse(i.crankRevs) * clamp(i.cadence / 40, 0, 1);
  const out: Record<string, VoiceSpec> = {
    hum: { wave: 'sawtooth', freq: hz, gain: on * (0.012 + 0.016 * spin) * (1 + 0.45 * pulse), filter: { type: 'lowpass', freq: 220 + 380 * g + 300 * od, q: 1.2 }, glide: 0.05 },
    humOd: { wave: 'square', freq: hz * 2, gain: on * od * 0.012 * (1 + 0.5 * pulse), filter: { type: 'lowpass', freq: 900, q: 0.8 }, glide: 0.08 },
    growl: { wave: 'noise', freq: 0, gain: on * g * 0.3, filter: { type: 'bandpass', freq: 110 + 220 * g, q: 1.6 }, glide: 0.12 },
    sub: { wave: 'sine', freq: 38 + 10 * g, gain: on * g * 0.08, glide: 0.12 },
  };
  const gat = i.weapon === 'gatling' && i.active, firing = clamp(i.gatlingFiring / 3, 0, 1);
  out.gatling = { wave: 'triangle', freq: gatlingHz(i.cadence), gain: gat ? (0.006 + 0.012 * firing) * clamp(spin, 0.2, 1.2) : 0, filter: { type: 'bandpass', freq: gatlingHz(i.cadence) * 1.5, q: 2 }, glide: 0.06 };
  const roar = flameRoar(i.flamePower), fl = i.flaming && i.active;
  out.flame = { wave: 'noise', freq: 0, gain: fl ? roar.gain : 0, filter: { type: 'bandpass', freq: roar.freq, q: 0.6 }, glide: 0.08 };
  out.flameLow = { wave: 'noise', freq: 0, gain: fl ? roar.gain * 0.6 : 0, filter: { type: 'lowpass', freq: 260, q: 0.7 }, glide: 0.1 };
  const rail = i.active && i.railCharging && !i.railFull;
  out.rail = { wave: 'sine', freq: railHz(i.railProgress), gain: rail ? 0.008 + 0.01 * (i.weapon === 'rail' ? 1 : 0.4) : 0, filter: { type: 'highpass', freq: 200 }, glide: 0.1 };
  return out;
}

/** One-shot cues loud enough to duck the dynamo under. */
const DUCKERS = new Set(['explode', 'rail', 'bossStart', 'bossDie', 'emp', 'baseHitHeavy', 'baseFell']);

export class DynamoSound {
  private lastSimT = -1; private stillS = 0;
  /** Call every rendered frame. `simT` stalls while paused: after 0.25 s the layers fade out. */
  update(i: DynamoIn, simT: number, realDt: number) {
    this.stillS = simT === this.lastSimT ? this.stillS + realDt : 0;
    this.lastSimT = simT;
    const mix = dynamoMix({ ...i, active: i.active && this.stillS < 0.25 });
    for (const [id, v] of Object.entries(mix)) setVoice(PREFIX + id, v);
  }
  cue(name: string) { if (DUCKERS.has(name)) duckVoices(0.45, 0.3); }
  stop() { stopVoices(PREFIX); }
}
