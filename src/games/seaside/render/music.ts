// Plays the generative cues from `musicScore.ts` on the shared audio graph (#197). One cue at a time: a new cue
// cross-fades in over the old one. Respects the sound toggle and the ambient ducker (`audioOut()` is null when off).
import { audioOut } from '../../../audio/sfx';
import { SAMPLE_TRACKS, sampleUrl } from '../../../media/library/samples';
import { beatS, CUE_TRACKS, cueNotes, mtof, type Instrument, type Note } from './musicScore';
import type { CueId } from './soundMix';

interface Playing { cue: CueId; bus: GainNode; beat: number; nextAt: number; track: AudioBufferSourceNode | null }

export class SeasideMusic {
  private cur: Playing | null = null;
  private dying: GainNode[] = [];
  /** CC tracks standing in for cues (`CUE_TRACKS`): fetched and decoded once, on first use. */
  private tracks = new Map<string, AudioBuffer | 'loading' | 'failed'>();

  /** `want` from `musicFor`; `running` is false while the story is paused (the music fades and holds). */
  update(want: { cue: CueId; gain: number } | null, running: boolean): void {
    const a = audioOut();
    if (!a) { this.stop(); return; }
    const c = a.ctx, now = c.currentTime;
    if (want && (!this.cur || this.cur.cue !== want.cue)) {
      this.release(now);
      const bus = c.createGain(); bus.gain.value = 0; bus.connect(a.out);
      this.cur = { cue: want.cue, bus, beat: 0, nextAt: now + 0.1, track: this.startTrack(c, bus, want.cue) };
    }
    const p = this.cur; if (!p) return;
    const level = want && running && !a.ducked ? want.gain : 0;
    p.bus.gain.setTargetAtTime(level, now, 0.4);
    if (!want) { this.release(now); return; }
    if (p.track || !running || level <= 0.001) { p.nextAt = Math.max(p.nextAt, now + 0.1); return; }
    const spb = beatS(p.cue);
    if (p.nextAt < now - 0.5) p.nextAt = now + 0.05; // the tab slept: don't burst
    while (p.nextAt < now + 0.3) { for (const n of cueNotes(p.cue, p.beat)) playNote(c, p.bus, n, p.nextAt + (n.at ?? 0) * spb, spb); p.nextAt += spb; p.beat++; }
  }

  /** The cue's CC track if it's decoded (it loops under the cue's fades); else starts loading it and returns null, so the
   *  generated cue plays this time. */
  private startTrack(c: AudioContext, bus: GainNode, cue: CueId): AudioBufferSourceNode | null {
    const key = CUE_TRACKS[cue], sample = key ? SAMPLE_TRACKS.find((t) => t.key === key) : undefined;
    if (!key || !sample) return null;
    const got = this.tracks.get(key);
    if (got instanceof AudioBuffer) { const src = c.createBufferSource(); src.buffer = got; src.loop = true; src.connect(bus); src.start(); return src; }
    if (!got) {
      this.tracks.set(key, 'loading');
      fetch(sampleUrl(sample)).then((r) => r.arrayBuffer()).then((b) => c.decodeAudioData(b))
        .then((buf) => { this.tracks.set(key, buf); }, () => { this.tracks.set(key, 'failed'); });
    }
    return null;
  }

  private release(now: number): void {
    if (!this.cur) return;
    const g = this.cur.bus, src = this.cur.track; g.gain.cancelScheduledValues(now); g.gain.setTargetAtTime(0, now, 0.8);
    try { src?.stop(now + 5); } catch { /* already stopped */ }
    this.dying.push(g); this.cur = null;
    setTimeout(() => { try { g.disconnect(); } catch { /* gone */ } this.dying = this.dying.filter((d) => d !== g); }, 6000);
  }

  stop(): void {
    try { this.cur?.track?.stop(); } catch { /* already stopped */ }
    for (const g of [...this.dying, ...(this.cur ? [this.cur.bus] : [])]) { try { g.disconnect(); } catch { /* gone */ } }
    this.dying = []; this.cur = null;
  }
}

const ENV: Record<Instrument, { atk: number; osc: Array<[OscillatorType, number, number]>; lp?: number }> = {
  pad: { atk: 1.2, osc: [['sine', 1, -6], ['triangle', 1, 7]], lp: 1200 },
  pluck: { atk: 0.01, osc: [['triangle', 1, 0]] },
  bass: { atk: 0.02, osc: [['sine', 1, 0], ['triangle', 2, 0]], lp: 500 },
  bell: { atk: 0.005, osc: [['sine', 1, 0], ['sine', 2.76, 0]] },
  pulse: { atk: 0.01, osc: [['sawtooth', 1, 0]], lp: 380 },
  choir: { atk: 1.8, osc: [['sine', 1, -9], ['sine', 1, 9], ['triangle', 2, 0]], lp: 1600 },
  lead: { atk: 0.06, osc: [['triangle', 1, 0], ['sine', 2, 0]], lp: 2400 },
};

/** One note on `bus` at `t0` (also used offline by `scripts/seaside-sound-review.ts`). */
export function playNote(c: BaseAudioContext, bus: AudioNode, n: Note, t0: number, spb: number): void {
  const dur = n.dur * spb, f = mtof(n.midi), g = c.createGain();
  const shape = ENV[n.inst];
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(n.vol, t0 + shape.atk);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + Math.max(shape.atk + 0.05, dur));
  g.connect(bus);
  const end = t0 + dur + 0.05;
  for (const [wave, mul, detune] of shape.osc) {
    const o = c.createOscillator(); o.type = wave; o.frequency.value = f * mul; o.detune.value = detune;
    if (shape.lp) { const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = shape.lp; o.connect(lp); lp.connect(g); } else o.connect(g);
    o.start(t0); o.stop(end);
  }
}
