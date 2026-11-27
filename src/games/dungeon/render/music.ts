// Procedural WebAudio music engine for Purgatour, modeled on SeasideMusic and routed through audioOut().
// Respects the global sound toggle and ambient ducker (automatically silences when external media plays).
import { audioOut, sfxGraph } from '../../../audio/sfx';
import { beatS, cueNotes, mtof, type DungeonCue, type MusicWant, type ScoreNote } from './musicScore';

interface Playing {
  cue: DungeonCue;
  bus: GainNode;
  beat: number;
  nextAt: number;
}

export class DungeonMusic {
  private cur: Playing | null = null;
  private dying: GainNode[] = [];

  update(want: MusicWant | null, running = true): void {
    const a = audioOut(), sg = sfxGraph();
    if (!a || !sg) { this.stop(); return; }
    const c = a.ctx, now = c.currentTime;
    if (want && (!this.cur || this.cur.cue !== want.cue)) {
      this.release(now);
      const bus = c.createGain();
      bus.gain.value = 0.0001;
      bus.connect(a.out);
      this.cur = { cue: want.cue, bus, beat: 0, nextAt: now + 0.08 };
    }
    const p = this.cur;
    if (!p) return;
    const level = want && running && !a.ducked ? want.gain : 0;
    p.bus.gain.setTargetAtTime(level, now, 0.35);
    if (!want) { this.release(now); return; }
    if (!running || level <= 0.001) { p.nextAt = Math.max(p.nextAt, now + 0.1); return; }
    const spb = beatS(p.cue, want.tempoScale);
    if (p.nextAt < now - 0.5) p.nextAt = now + 0.05; // prevent burst after tab sleep
    while (p.nextAt < now + 0.25) {
      for (const n of cueNotes(p.cue, p.beat)) playNote(c, p.bus, sg.noise, n, p.nextAt + (n.at ?? 0) * spb, spb);
      p.nextAt += spb;
      p.beat++;
    }
  }

  private release(now: number): void {
    if (!this.cur) return;
    const g = this.cur.bus;
    g.gain.cancelScheduledValues(now);
    g.gain.setTargetAtTime(0, now, 0.45);
    this.dying.push(g);
    this.cur = null;
    setTimeout(() => {
      try { g.disconnect(); } catch { /* already disconnected */ }
      this.dying = this.dying.filter((d) => d !== g);
    }, 2500);
  }

  stop(): void {
    for (const g of [...this.dying, ...(this.cur ? [this.cur.bus] : [])]) {
      try { g.disconnect(); } catch { /* already disconnected */ }
    }
    this.dying = [];
    this.cur = null;
  }
}

function playNote(c: AudioContext, bus: AudioNode, noise: AudioBuffer, n: ScoreNote, t0: number, spb: number): void {
  const dur = Math.max(0.05, n.dur * spb);
  const g = c.createGain();
  g.connect(bus);

  if (n.inst === 'kick') {
    const o = c.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(125, t0);
    o.frequency.exponentialRampToValueAtTime(38, t0 + 0.11);
    g.gain.setValueAtTime(n.vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); o.start(t0); o.stop(t0 + dur + 0.02);
    return;
  }
  if (n.inst === 'snare' || n.inst === 'hat') {
    const s = c.createBufferSource(); s.buffer = noise; s.loop = true;
    const f = c.createBiquadFilter();
    f.type = n.inst === 'hat' ? 'highpass' : 'bandpass';
    f.frequency.value = n.inst === 'hat' ? 6200 : 1800;
    f.Q.value = n.inst === 'hat' ? 0.7 : 1.1;
    g.gain.setValueAtTime(n.vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    s.connect(f); f.connect(g); s.start(t0); s.stop(t0 + dur + 0.02);
    return;
  }

  const f = mtof(n.midi);
  const atk = n.inst === 'pad' ? Math.min(0.45, dur * 0.3) : n.inst === 'brass' ? 0.025 : 0.008;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, n.vol), t0 + atk);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + Math.max(atk + 0.04, dur));

  const voices: Array<[OscillatorType, number, number, number?]> =
    n.inst === 'bass' ? [['triangle', 1, 0, 420], ['sine', 0.5, 0, 260]] :
    n.inst === 'pad' ? [['sine', 1, -5, 1100], ['triangle', 1, 5, 1100]] :
    n.inst === 'bell' ? [['sine', 1, 0], ['sine', 2.75, 0]] :
    n.inst === 'brass' ? [['sawtooth', 1, -4, 1500], ['sawtooth', 1, 4, 1500]] :
    n.inst === 'lead' ? [['square', 1, 0, 2200], ['triangle', 2, 0, 2200]] :
    [['triangle', 1, 0, 2400]]; // pluck

  const end = t0 + dur + 0.04;
  for (const [wave, mul, detune, lp] of voices) {
    const o = c.createOscillator();
    o.type = wave;
    o.frequency.value = f * mul;
    o.detune.value = detune;
    if (lp) {
      const filt = c.createBiquadFilter();
      filt.type = 'lowpass';
      filt.frequency.value = lp;
      o.connect(filt); filt.connect(g);
    } else {
      o.connect(g);
    }
    o.start(t0); o.stop(end);
  }
}
