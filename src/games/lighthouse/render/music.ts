// Adaptive island music: a gentle generative waltz-shanty (3/4, D major) that grows with the Steady Light streak.
// Layers: pad (always) -> bass (1 min steady) -> accordion (3 min) -> fiddle tune (5 min). Night swaps the accordion for a
// music box; festivals add tambourine and bells and pick up the tempo; storms turn minor with drums. All Web Audio, no assets.
import { audioOut } from '../../../audio/sfx';
import { ISLAND_MIX } from './audio';
import { mulberry } from './util';

export interface MusicState { t: number; streakS: number; night: number; storm: boolean; festival: boolean; paused: boolean }
type Layer = 'pad' | 'bass' | 'acc' | 'box' | 'fiddle' | 'tamb' | 'bells' | 'drum';

const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
// chords as [root midi, minor?]
const CALM: Array<[number, boolean]> = [[62, false], [67, false], [62, false], [69, false], [71, true], [67, false], [69, false], [62, false]];
const STORM: Array<[number, boolean]> = [[62, true], [70, false], [72, false], [62, true], [62, true], [70, false], [72, false], [69, false]];
const triad = (root: number, minor: boolean) => [root, root + (minor ? 3 : 4), root + 7];
const SCALE_CALM = [0, 2, 4, 7, 9]; // D major pentatonic
const SCALE_STORM = [0, 2, 3, 5, 7, 8, 10]; // D natural minor
const RHYTHMS = [[1, 1, 1], [2, 1], [1, 0.5, 0.5, 1], [0.5, 0.5, 1, 1], [1.5, 0.5, 1], [3]];

export class IslandMusic {
  private bus?: GainNode; private layers = new Map<Layer, GainNode>();
  private beat = 0; private nextAt = 0; private tune: number[][] = []; private tuneKey = '';
  private lastSimT = -1; private stillS = 0; private lastWall = 0;

  update(s: MusicState) {
    const a = audioOut(); if (!a) { this.lastSimT = s.t; return; }
    const c = a.ctx, now = c.currentTime;
    if (!this.bus) {
      this.bus = c.createGain(); this.bus.gain.value = 0; this.bus.connect(a.out);
      for (const l of ['pad', 'bass', 'acc', 'box', 'fiddle', 'tamb', 'bells', 'drum'] as Layer[]) { const g = c.createGain(); g.gain.value = 0; g.connect(this.bus); this.layers.set(l, g); }
      this.nextAt = now + 0.2; this.lastWall = now;
    }
    // fade out while the sim is paused (the renderer keeps drawing) or something else owns the speakers
    const wallDt = now - this.lastWall; this.lastWall = now;
    this.stillS = s.t === this.lastSimT ? this.stillS + wallDt : 0; this.lastSimT = s.t;
    const silent = a.ducked || s.paused || this.stillS > 0.6;
    const level = s.storm ? ISLAND_MIX.music.storm : s.festival ? ISLAND_MIX.music.festival : ISLAND_MIX.music.calm;
    this.bus.gain.setTargetAtTime(silent ? 0 : level, now, silent ? 0.25 : 1.5);
    // layer mix
    const st = s.streakS, calm = !s.storm, f = s.festival && calm, nightK = Math.min(1, s.night * 1.4);
    const mix: Record<Layer, number> = {
      pad: s.storm ? 0.7 : 1,
      bass: s.storm || f || st > 60 ? 0.85 : 0,
      acc: calm && (f || st > 180) ? 1 - nightK : 0,
      box: calm && (f || st > 180) ? nightK : 0,
      fiddle: calm && (f || st > 300) ? 1 - nightK * 0.4 : 0,
      tamb: f ? 0.75 : 0, bells: f ? 0.8 : 0,
      drum: s.storm ? 0.7 : 0,
    };
    for (const [l, g] of this.layers) g.gain.setTargetAtTime(mix[l], now, 2);
    if (silent) { this.nextAt = Math.max(this.nextAt, now + 0.1); return; }
    // schedule beats a little ahead
    const bpm = s.storm ? 96 : f ? 112 : 84, spb = 60 / bpm;
    if (this.nextAt < now - 0.5) this.nextAt = now + 0.05; // tab was asleep: don't burst
    while (this.nextAt < now + 0.3) { this.playBeat(c, this.nextAt, spb, s.storm, f); this.nextAt += spb; this.beat++; }
  }

  private playBeat(c: AudioContext, t0: number, spb: number, storm: boolean, fest: boolean) {
    const prog = storm ? STORM : CALM;
    const bar = Math.floor(this.beat / 3), b = this.beat % 3, [root, minor] = prog[bar % 8];
    const ch = triad(root, minor);
    if (b === 0) {
      this.note(c, 'pad', ch.map((m) => m - 12), t0, spb * 3.1, 0.035, 'sine', 0.6);
      this.note(c, 'bass', [root - 24], t0, spb * 1.6, 0.11, 'triangle', 0.01);
      if (storm) this.drum(c, t0, 0.22);
      this.melodyBar(c, t0, spb, bar, storm, fest);
    } else {
      this.note(c, 'acc', ch, t0, spb * 0.5, 0.022, 'sawtooth', 0.01, 1400);
      this.note(c, 'box', [ch[b] + 12], t0, spb * 1.2, 0.03, 'sine', 0.003);
      if (b === 2) this.note(c, 'bass', [root - 17], t0, spb * 0.9, 0.07, 'triangle', 0.01);
      if (storm && b === 2) this.drum(c, t0, 0.12);
    }
    if (fest) this.tamb(c, t0, b === 0 ? 0.05 : 0.03);
  }

  /** An 8-bar tune per (mode, phrase pair): it repeats so it can be hummed, then changes. */
  private melodyBar(c: AudioContext, t0: number, spb: number, bar: number, storm: boolean, fest: boolean) {
    const key = `${storm}|${Math.floor(bar / 16)}`;
    if (key !== this.tuneKey) { this.tuneKey = key; this.tune = this.makeTune(storm, Math.floor(bar / 16)); }
    const notes = this.tune[bar % 8];
    let at = t0;
    const rhythm = RHYTHMS[(bar * 7 + (storm ? 3 : 0)) % RHYTHMS.length];
    rhythm.forEach((d, i) => {
      const m = notes[i % notes.length];
      this.note(c, 'fiddle', [m], at, spb * d * 0.95, 0.045, 'triangle', 0.02, 0, 5.5);
      if (fest) this.note(c, 'bells', [m + 12], at, spb * d * 1.6, 0.02, 'sine', 0.002);
      at += spb * d;
    });
  }
  private makeTune(storm: boolean, seed: number): number[][] {
    const r = mulberry(seed * 977 + (storm ? 13 : 1)), prog = storm ? STORM : CALM, scale = storm ? SCALE_STORM : SCALE_CALM;
    const pitches: number[] = [];
    for (let o = 0; o < 2; o++) for (const s of scale) pitches.push(74 + s + o * 12 - 12);
    let idx = Math.floor(pitches.length / 2);
    return prog.map(([root, minor], bar) => {
      const tones = triad(root + 12, minor);
      // land on a chord tone on the downbeat, then step around it
      const near = pitches.map((p, i) => [i, tones.some((tn) => (p - tn) % 12 === 0) ? Math.abs(i - idx) : 99] as const).sort((x, y) => x[1] - y[1])[0][0];
      idx = near;
      const out = [pitches[idx]];
      for (let k = 0; k < 3; k++) { idx = Math.max(0, Math.min(pitches.length - 1, idx + (r() < 0.5 ? -1 : 1) * (r() < 0.75 ? 1 : 2))); out.push(pitches[idx]); }
      if (bar === 7) out[0] = tones[0]; // resolve home at the end of the phrase
      return out;
    });
  }

  private note(c: AudioContext, layer: Layer, ms: number[], t0: number, dur: number, vol: number, type: OscillatorType, atk: number, lp = 0, vib = 0) {
    const dest = this.layers.get(layer)!;
    if (dest.gain.value < 0.001 && layer !== 'pad') return; // silent layer: skip the nodes
    for (const m of ms) {
      const o = c.createOscillator(), g = c.createGain();
      o.type = type; o.frequency.value = mtof(m);
      g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + Math.max(0.005, atk));
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      let head: AudioNode = o;
      if (lp) { const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp; o.connect(f); head = f; }
      if (vib) { const l = c.createOscillator(), lg = c.createGain(); l.frequency.value = vib; lg.gain.value = mtof(m) * 0.006; l.connect(lg); lg.connect(o.frequency); l.start(t0); l.stop(t0 + dur + 0.05); }
      head.connect(g); g.connect(dest); o.start(t0); o.stop(t0 + dur + 0.05);
    }
  }
  private noiseBuf?: AudioBuffer;
  private noise(c: AudioContext) {
    if (!this.noiseBuf) { this.noiseBuf = c.createBuffer(1, c.sampleRate * 0.3, c.sampleRate); const d = this.noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
    return this.noiseBuf;
  }
  private tamb(c: AudioContext, t0: number, vol: number) {
    const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = this.noise(c); f.type = 'highpass'; f.frequency.value = 6000;
    g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.12);
    s.connect(f); f.connect(g); g.connect(this.layers.get('tamb')!); s.start(t0); s.stop(t0 + 0.15);
  }
  private drum(c: AudioContext, t0: number, vol: number) {
    const o = c.createOscillator(), g = c.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(95, t0); o.frequency.exponentialRampToValueAtTime(45, t0 + 0.35);
    g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.4);
    o.connect(g); g.connect(this.layers.get('drum')!); o.start(t0); o.stop(t0 + 0.45);
  }

  dispose() { try { this.bus?.disconnect(); } catch { /* gone */ } this.bus = undefined; this.layers.clear(); }
}
