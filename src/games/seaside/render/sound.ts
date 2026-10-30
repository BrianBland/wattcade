// Seaside's sound (#197): plays the mix from `soundMix.ts` (beds, voices, one-shots) and the music cues. Thin glue on the
// shared graph (`audio/sfx.ts`, `audio/voices.ts`): nothing plays when sound is off, and everything holds while paused.
import type { BikeState } from '../../../contracts';
import { play, setAmbient, sfxGraph, stopAmbient, type SfxName } from '../../../audio/sfx';
import { setVoice, stopVoices } from '../../../audio/voices';
import type { SeasideSnapshot } from '../sim/types';
import { SeasideMusic } from './music';
import { BEDS, bedsFor, musicFor, SoundTicker, voicesFor, type BedId, type Shot, type VoiceId } from './soundMix';

const BED_IDS = Object.keys(BEDS) as BedId[];
const VOICE_IDS: VoiceId[] = ['drill', 'fan', 'drag', 'tone', 'choir', 'radio'];
const WAVE: Record<VoiceId, OscillatorType | 'noise'> = { drill: 'sawtooth', fan: 'noise', drag: 'noise', tone: 'sine', choir: 'triangle', radio: 'square' };

/** Shared recipes reused as they are, with a level and pitch. */
const STOCK: Partial<Record<Shot, [SfxName, number, number?]>> = {
  gull: ['gull', 0.35], drip: ['plop', 0.25, 1.6], lavaBoom: ['rumble', 0.5], lavaBlurp: ['lavaBubble', 0.3], bubble: ['bubblePop', 0.3],
  flap: ['whoosh', 0.45, 0.7], cast: ['whoosh', 0.5, 1.2], lureIn: ['plop', 0.5], bite: ['plop', 0.8, 0.7], splash: ['splash', 0.6],
  catch: ['chime', 0.5], escape: ['splash', 0.35, 0.7], buy: ['buy', 0.6], boltOn: ['boltOn', 0.7], layer: ['clank', 0.5, 0.8],
  crack: ['chitinCrunchBig', 0.7, 0.6], birdCall: ['birdTrill', 0.25], paddle: ['waveWash', 0.25, 1.4],
};

export class SeasideSound {
  private ticker = new SoundTicker();
  private music = new SeasideMusic();
  private on = false;
  private seed = 0x5ea51de;

  update(s: SeasideSnapshot, bike: Readonly<BikeState> | null, dt: number, clock: number): void {
    const b = { cadence3s: bike?.cadence3s ?? 0, power3s: bike?.power3s ?? 0 }, running = dt > 0 || !!s.menu || !!s.shop;
    this.music.update(musicFor(s), running && !s.over);
    if (!sfxGraph()) { if (this.on) this.silence(); return; }
    this.on = true;
    const beds = running && !s.over ? bedsFor(s) : {}, swell = 0.75 + 0.25 * Math.sin(clock * 0.9) * Math.sin(clock * 0.37 + 1);
    for (const id of BED_IDS) {
      const k = beds[id] ?? 0, bed = BEDS[id];
      const freq = id === 'tyres' ? bed.freq + 60 * s.speed : id === 'wind' ? bed.freq + 30 * s.speed : bed.freq;
      setAmbient(`seaside.${id}`, k * bed.vol * (id === 'surf' || id === 'lap' ? swell : 1), freq, bed.q);
    }
    const voices = running && !s.over ? voicesFor(s, b, clock) : {};
    for (const id of VOICE_IDS) {
      const v = voices[id], wave = WAVE[id];
      setVoice(`seaside.${id}`, { wave, freq: v?.freq || 100, gain: v?.gain ?? 0, glide: 0.08,
        filter: { type: wave === 'noise' ? 'bandpass' : 'lowpass', freq: v?.filterHz ?? 2000, q: wave === 'noise' ? 1.2 : 0.7 } });
    }
    for (const shot of this.ticker.step(s, b, running ? dt : 0, () => this.rng())) this.shot(shot);
  }

  private rng(): number { this.seed = (this.seed * 1664525 + 1013904223) >>> 0; return this.seed / 2 ** 32; }

  private shot(name: Shot): void {
    const stock = STOCK[name];
    if (stock) { play(stock[0], { vol: stock[1], pitch: (stock[2] ?? 1) * (0.92 + 0.16 * this.rng()) }); return; }
    const g = sfxGraph(); if (!g) return;
    const c = g.ctx, t = c.currentTime;
    const tone = (wave: OscillatorType, f0: number, f1: number, dur: number, vol: number, at = 0) => {
      const o = c.createOscillator(), e = c.createGain(); o.type = wave;
      o.frequency.setValueAtTime(f0, t + at); o.frequency.exponentialRampToValueAtTime(f1, t + at + dur);
      e.gain.setValueAtTime(0.0001, t + at); e.gain.exponentialRampToValueAtTime(vol, t + at + 0.01); e.gain.exponentialRampToValueAtTime(0.0001, t + at + dur);
      o.connect(e); e.connect(g.out); o.start(t + at); o.stop(t + at + dur + 0.02);
    };
    const hiss = (freq: number, q: number, dur: number, vol: number, at = 0) => {
      const n = c.createBufferSource(), f = c.createBiquadFilter(), e = c.createGain(); n.buffer = g.noise;
      f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
      e.gain.setValueAtTime(0.0001, t + at); e.gain.exponentialRampToValueAtTime(vol, t + at + 0.005); e.gain.exponentialRampToValueAtTime(0.0001, t + at + dur);
      n.connect(f); f.connect(e); e.connect(g.out); n.start(t + at); n.stop(t + at + dur + 0.02);
    };
    switch (name) {
      case 'heartbeat': tone('sine', 62, 40, 0.16, 0.32); tone('sine', 55, 38, 0.14, 0.22, 0.24); break; // lub-dub, wet and low
      case 'plank': tone('triangle', 140 + 30 * this.rng(), 90, 0.07, 0.12); hiss(900, 2, 0.05, 0.05); break;
      case 'click': hiss(3200, 6, 0.018, 0.06); break;
      case 'groan': tone('sawtooth', 70 + 20 * this.rng(), 45, 1.6, 0.05); break;
      case 'gasp': hiss(1300, 0.8, 0.5, 0.12); break;
      case 'torch': hiss(2400, 4, 0.04, 0.05); break;
      case 'horn': tone('square', 415, 410, 0.22, 0.07); tone('square', 523, 518, 0.22, 0.05); break; // a car horn, far below
    }
  }

  private silence(): void { this.on = false; stopAmbient(); stopVoices('seaside.'); }

  dispose(): void { this.music.stop(); this.silence(); }
}
