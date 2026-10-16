// Continuous synth voices whose pitch, level and filter follow live values (e.g. a dynamo hum on cadence).
// Each voice is one source -> filter -> gain, routed through a shared voice bus with a soft limiter, and can be ducked
// under big one-shots. Call setVoice() every frame; values glide (setTargetAtTime), so there are no clicks.
// Safe to import in Node: nothing runs until setVoice() finds a running AudioContext.
import { sfxGraph } from './sfx';

export interface VoiceSpec {
  wave: OscillatorType | 'noise';
  /** oscillator Hz (ignored for noise) */ freq: number;
  /** linear gain; 0 fades the voice out (it stays allocated until stopVoices) */ gain: number;
  filter?: { type: BiquadFilterType; freq: number; q?: number };
  /** glide time constant in seconds (default 0.04) */ glide?: number;
}
interface Voice { src: OscillatorNode | AudioBufferSourceNode; filter: BiquadFilterNode; gain: GainNode; noise: boolean }

const voices = new Map<string, Voice>();
let bus: { ctx: AudioContext; in: GainNode; duck: GainNode } | null = null;

function ensureBus() {
  const g = sfxGraph(); if (!g) return null;
  if (bus && bus.ctx === g.ctx) return bus;
  const lim = g.ctx.createDynamicsCompressor();
  lim.threshold.value = -14; lim.knee.value = 10; lim.ratio.value = 6; lim.attack.value = 0.005; lim.release.value = 0.2;
  const duck = g.ctx.createGain(), input = g.ctx.createGain();
  input.connect(lim); lim.connect(duck); duck.connect(g.out);
  bus = { ctx: g.ctx, in: input, duck };
  return bus;
}

/** Creates or updates a voice. Returns false when audio isn't available (muted, locked, or Node). */
export function setVoice(id: string, v: VoiceSpec): boolean {
  const b = ensureBus(), g = sfxGraph();
  if (!b || !g) { if (voices.size) stopVoices(); return false; }
  const c = b.ctx, now = c.currentTime, tc = v.glide ?? 0.04, noise = v.wave === 'noise';
  let vo = voices.get(id);
  if (vo && vo.noise !== noise) { kill(vo); voices.delete(id); vo = undefined; }
  if (!vo) {
    let src: OscillatorNode | AudioBufferSourceNode;
    if (noise) { const s = c.createBufferSource(); s.buffer = g.noise; s.loop = true; src = s; }
    else { const o = c.createOscillator(); o.type = v.wave as OscillatorType; o.frequency.value = v.freq; src = o; }
    const filter = c.createBiquadFilter(); filter.type = v.filter?.type ?? 'allpass';
    if (v.filter) { filter.frequency.value = v.filter.freq; filter.Q.value = v.filter.q ?? 0.7; }
    const gain = c.createGain(); gain.gain.value = 0;
    src.connect(filter); filter.connect(gain); gain.connect(b.in); src.start();
    vo = { src, filter, gain, noise };
    voices.set(id, vo);
  }
  if (!noise) {
    const o = vo.src as OscillatorNode;
    if (o.type !== v.wave) o.type = v.wave as OscillatorType;
    o.frequency.setTargetAtTime(Math.max(1, v.freq), now, tc);
  }
  if (v.filter) {
    if (vo.filter.type !== v.filter.type) vo.filter.type = v.filter.type;
    vo.filter.frequency.setTargetAtTime(Math.max(10, v.filter.freq), now, tc);
    vo.filter.Q.setTargetAtTime(v.filter.q ?? 0.7, now, tc);
  }
  vo.gain.gain.setTargetAtTime(Math.max(0, v.gain), now, tc);
  return true;
}

/** Briefly lowers every voice (e.g. under an explosion): to `depth` (0..1) of normal, recovering over `holdS`. */
export function duckVoices(depth: number, holdS = 0.25): void {
  const b = bus; if (!b) return;
  const now = b.ctx.currentTime, g = b.duck.gain;
  g.cancelScheduledValues(now); g.setValueAtTime(g.value, now);
  g.linearRampToValueAtTime(Math.max(0, Math.min(1, depth)), now + 0.02);
  g.setTargetAtTime(1, now + 0.02 + holdS * 0.4, holdS * 0.5);
}

/** Fades out and frees every voice whose id starts with `prefix` (all voices when omitted). */
export function stopVoices(prefix = ''): void {
  for (const [id, vo] of voices) if (id.startsWith(prefix)) { kill(vo); voices.delete(id); }
}

function kill(vo: Voice) {
  try {
    const c = vo.gain.context, now = c.currentTime;
    vo.gain.gain.cancelScheduledValues(now); vo.gain.gain.setTargetAtTime(0, now, 0.03);
    vo.src.stop(now + 0.15);
    setTimeout(() => { try { vo.gain.disconnect(); } catch { /* gone */ } }, 300);
  } catch { /* context closed */ }
}

/** Number of live voices (for tests and the debug overlay). */
export const voiceCount = (): number => voices.size;
