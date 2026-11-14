// Full Send's sound: continuous voices (rocket, wind, jet, re-entry), one-shots from `soundCues`, and a small generative
// music bed per layer (ground / sky / moon / sea / sprint). Thin glue on the shared graph (audio/sfx.ts, audio/voices.ts):
// nothing plays when sound is off.
import { audioOut, play, sfxGraph, type SfxName } from '../../../audio/sfx';
import { setVoice, stopVoices } from '../../../audio/voices';
import type { FullSendSnapshot } from '../sim/sim';
import { soundBeds, soundCues, type Cue } from './soundCues';

const STOCK: Partial<Record<Cue, [SfxName, number, number?]>> = {
  perfect: ['chime', 0.45, 1.2], clean: ['chime', 0.3, 0.9], crash: ['wreck', 0.55], launch: ['whoosh', 0.8, 0.6], moonShot: ['whoosh', 0.8, 0.45],
  arrive: ['reward', 0.4], edge: ['whoosh', 0.6, 1.4], reentry: ['rumble', 0.8], splash: ['splash', 0.9], breach: ['splash', 0.7, 1.3],
  ring: ['pickup', 0.5, 1.2], star: ['coin', 0.35, 1.4], smash: ['chitinCrunch', 0.45], roar: ['roar', 0.9], rumble: ['rumble', 0.8, 0.7],
  snap: ['screech', 0.4, 0.6], caught: ['hurt', 0.6], tick: ['count', 0.6], go: ['go', 0.7], medal: ['milestone', 0.6], miss: ['deny', 0.4],
  jetOn: ['ignite', 0.5], jetWeak: ['deny', 0.25, 0.8], fork: ['bell', 0.35], forkPick: ['uiTick', 0.5], menuMove: ['uiMove', 0.5], menuPick: ['uiSelect', 0.6],
  trick: ['whoosh', 0.35, 1.6],
};

type Layer = ReturnType<typeof soundBeds>['music'];
/** Per layer: beats per minute, a root (MIDI), a bass line and an arpeggio (scale degrees), waveforms and level. */
const SCORE: Record<Layer, { bpm: number; root: number; bass: number[]; arp: number[]; wave: OscillatorType; level: number; kick: boolean }> = {
  menu: { bpm: 96, root: 57, bass: [0, 0, 5, 7], arp: [0, 4, 7, 11, 7, 4], wave: 'triangle', level: 0.05, kick: false },
  ground: { bpm: 118, root: 52, bass: [0, 0, 8, 7, 5, 5, 3, 7], arp: [0, 7, 12, 7, 15, 12, 7, 3], wave: 'square', level: 0.035, kick: true },
  sprint: { bpm: 150, root: 52, bass: [0, 0, 0, 3, 5, 5, 7, 10], arp: [12, 15, 19, 15, 12, 10, 7, 10], wave: 'sawtooth', level: 0.04, kick: true },
  sky: { bpm: 100, root: 60, bass: [0, 5, 7, 5], arp: [0, 4, 7, 12, 16, 12, 7, 4], wave: 'triangle', level: 0.05, kick: false },
  moon: { bpm: 72, root: 50, bass: [0, 3, 7, 5], arp: [12, 19, 15, 22, 19, 15], wave: 'sine', level: 0.06, kick: false },
  sea: { bpm: 84, root: 48, bass: [0, 0, 5, 3], arp: [0, 3, 7, 10, 7, 3], wave: 'triangle', level: 0.045, kick: false },
  done: { bpm: 90, root: 55, bass: [0, 5, 7, 0], arp: [0, 4, 7, 12], wave: 'triangle', level: 0.04, kick: false },
};
const mtof = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

export class FullSendSound {
  private prev: FullSendSnapshot | null = null;
  private bus: GainNode | null = null; private layer: Layer | null = null; private step = 0; private nextAt = 0;

  private idle: ReturnType<typeof setTimeout> | null = null;

  update(s: FullSendSnapshot, running: boolean): void {
    // no frames for a moment (paused, tab hidden, ride over): go quiet rather than drone
    if (this.idle) clearTimeout(this.idle);
    this.idle = setTimeout(() => { stopVoices('fullsend.'); if (this.bus) this.bus.gain.value = 0; }, 300);
    const cues = soundCues(this.prev, s);
    this.prev = s;
    if (!sfxGraph()) { stopVoices('fullsend.'); return; }
    const b = soundBeds(s), on = running ? 1 : 0, muff = b.muffled ? 0.35 : 1;
    setVoice('fullsend.rocket', { wave: 'sawtooth', freq: b.rocketHz, gain: 0.05 * b.rocket * on, glide: 0.12, filter: { type: 'lowpass', freq: (300 + 900 * b.rocket) * muff, q: 1.5 } });
    setVoice('fullsend.roar', { wave: 'noise', freq: 0, gain: 0.06 * b.rocket * on, glide: 0.12, filter: { type: 'bandpass', freq: (180 + 400 * b.rocket) * muff, q: 0.8 } });
    setVoice('fullsend.wind', { wave: 'noise', freq: 0, gain: 0.05 * b.wind * on, glide: 0.2, filter: { type: 'bandpass', freq: b.windHz * muff, q: 0.6 } });
    setVoice('fullsend.jet', { wave: 'noise', freq: 0, gain: 0.08 * b.jet * on, glide: 0.06, filter: { type: 'highpass', freq: 1400, q: 0.7 } });
    setVoice('fullsend.reentry', { wave: 'noise', freq: 0, gain: 0.12 * b.reentry * on, glide: 0.1, filter: { type: 'lowpass', freq: 500, q: 1 } });
    if (running) for (const c of cues) {
      const st = STOCK[c];
      if (st) play(st[0], { vol: st[1], pitch: (st[2] ?? 1) * (b.muffled ? 0.8 : 1), minGapS: c === 'smash' ? 0.05 : c === 'star' ? 0.06 : undefined });
      else if (c === 'land' || c === 'landHard') this.thud(c === 'landHard' ? 0.35 : 0.15);
    }
    this.music(b.music, running);
  }

  private thud(vol: number) {
    const g = sfxGraph(); if (!g) return;
    const c = g.ctx, t = c.currentTime, o = c.createOscillator(), e = c.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.18);
    e.gain.setValueAtTime(vol, t); e.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
    o.connect(e); e.connect(g.out); o.start(t); o.stop(t + 0.22);
  }

  private music(layer: Layer, running: boolean) {
    const a = audioOut(); if (!a) { this.stopMusic(); return; }
    const c = a.ctx, now = c.currentTime;
    if (!this.bus) { this.bus = c.createGain(); this.bus.gain.value = 0; this.bus.connect(a.out); this.nextAt = now + 0.1; }
    if (layer !== this.layer) { this.layer = layer; this.step = 0; }
    const sc = SCORE[layer];
    this.bus.gain.setTargetAtTime(running && !a.ducked ? 1 : 0, now, 0.5);
    if (!running || a.ducked) { this.nextAt = Math.max(this.nextAt, now + 0.1); return; }
    if (this.nextAt < now - 0.5) this.nextAt = now + 0.05; // the tab slept: don't burst
    const spb = 60 / sc.bpm / 2; // eighth notes
    while (this.nextAt < now + 0.3) {
      const i = this.step, t = this.nextAt;
      if (i % 2 === 0) this.note(c, sc.wave === 'sine' ? 'sine' : 'triangle', mtof(sc.root - 12 + sc.bass[(i / 2) % sc.bass.length]), t, spb * 1.8, sc.level * 1.4);
      this.note(c, sc.wave, mtof(sc.root + 12 + sc.arp[i % sc.arp.length]), t, spb * 0.9, sc.level * 0.6);
      if (sc.kick && i % 4 === 0) this.kick(c, t);
      this.step++; this.nextAt += spb;
    }
  }
  private note(c: AudioContext, wave: OscillatorType, f: number, t: number, dur: number, vol: number) {
    if (!this.bus) return;
    const o = c.createOscillator(), e = c.createGain(); o.type = wave; o.frequency.value = f;
    e.gain.setValueAtTime(0.0001, t); e.gain.exponentialRampToValueAtTime(vol, t + 0.01); e.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(e); e.connect(this.bus); o.start(t); o.stop(t + dur + 0.02);
  }
  private kick(c: AudioContext, t: number) {
    if (!this.bus) return;
    const o = c.createOscillator(), e = c.createGain(); o.type = 'sine';
    o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    e.gain.setValueAtTime(0.12, t); e.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
    o.connect(e); e.connect(this.bus); o.start(t); o.stop(t + 0.16);
  }
  private stopMusic() { if (this.bus) { try { this.bus.disconnect(); } catch { /* gone */ } this.bus = null; } this.layer = null; }

  dispose(): void { if (this.idle) clearTimeout(this.idle); stopVoices('fullsend.'); this.stopMusic(); }
}
