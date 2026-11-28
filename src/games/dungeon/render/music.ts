// Studio-grade procedural WebAudio music synthesizer for Purgatour.
// Features: unity-gain mastering bus staging, Karplus-Strong physical-model plucks, true ADSR envelopes,
// biome-specific solo instruments (flute, fiddle, reed, oud, overdriven electric guitar & palm-muted chugs),
// 6-oscillator metallic cymbals, round-robin humanized drums, beat-quantized cue handoffs, Skill-Tree
// low-pass filter ducking, and musical combat stingers.
import { audioOut, sfxGraph } from '../../../audio/sfx';
import { DungeonAudioBus, type PluckKind } from './audioBus';
import { beatS, cueNotes, layerGain, mtof, type DungeonCue, type MusicWant, type ScoreNote } from './musicScore';

interface Playing {
  cue: DungeonCue;
  bus: GainNode;
  roomTap: GainNode;
  revTap: GainNode;
  dlyTap: GainNode;
  beat: number;
  nextAt: number;
  intensity: number;
}

export type MusicStinger = 'bossExposed' | 'bossPhase' | 'ambushStart';

const clampF = (ctx: BaseAudioContext, hz: number) => Math.max(24, Math.min(ctx.sampleRate * 0.44, hz));

/** Deterministic micro-variation hash in [-1, 1] for round-robin drum & pluck humanization. */
function hitVar(t0: number, salt: number): number {
  let x = (Math.floor(t0 * 1000) ^ (salt * 2654435761)) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b) >>> 0;
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35) >>> 0;
  return ((x ^ (x >>> 16)) / 0xffffffff) * 2 - 1;
}

/** True ADSR envelope: holds musical sustain instead of collapsing exponentially mid-note. */
function applyADSR(
  param: AudioParam,
  t0: number,
  dur: number,
  peak: number,
  atk: number,
  dec: number,
  susFrac: number,
  rel: number,
): number {
  const a = Math.max(0.003, Math.min(atk, dur * 0.45));
  const d = Math.max(0.01, Math.min(dec, Math.max(0.01, dur - a)));
  const sus = Math.max(0.0002, peak * susFrac);
  const noteOff = t0 + Math.max(a + 0.01, dur);
  const end = noteOff + Math.max(0.025, rel);
  param.setValueAtTime(0.0001, t0);
  param.linearRampToValueAtTime(peak, t0 + a);
  if (t0 + a + d < noteOff) {
    param.exponentialRampToValueAtTime(sus, t0 + a + d);
    param.setValueAtTime(sus, noteOff);
  } else {
    param.exponentialRampToValueAtTime(sus, noteOff);
  }
  param.exponentialRampToValueAtTime(0.0001, end);
  return end;
}

export class DungeonMusic {
  private rack: DungeonAudioBus | null = null;
  private ownsRack = false;
  private cur: Playing | null = null;
  private dying: Array<{ bus: GainNode; roomTap: GainNode; revTap: GainNode; dlyTap: GainNode }> = [];
  private timers: ReturnType<typeof setTimeout>[] = [];

  /** Share a DungeonAudioBus created by DungeonSound so music + SFX share one studio rack. */
  attachBus(rack: DungeonAudioBus | null): void {
    if (this.ownsRack && this.rack && this.rack !== rack) this.rack.dispose();
    this.rack = rack;
    this.ownsRack = false;
  }

  private ensureRack(): DungeonAudioBus | null {
    const a = audioOut(), sg = sfxGraph();
    if (!a || !sg) return null;
    if (this.rack && this.rack.ctx === a.ctx) return this.rack;
    if (this.ownsRack && this.rack) this.rack.dispose();
    this.rack = new DungeonAudioBus(a.ctx, a.out, sg.noise);
    this.ownsRack = true;
    return this.rack;
  }

  /** Briefly duck the music bus under major combat impacts. */
  duck(depth = 0.56, holdS = 0.28): void {
    this.rack?.duckMusic(depth, holdS);
  }

  /** Fire a musical accent stinger directly into the live music rack (Boss Exposed, Phase Up, Ambush!). */
  triggerStinger(kind: MusicStinger): void {
    const rack = this.rack;
    const p = this.cur;
    if (!rack || !p) return;
    const t0 = rack.ctx.currentTime + 0.015;
    const spb = beatS(p.cue, 1);
    if (kind === 'bossExposed') {
      playScoreNote(rack, p.bus, p.roomTap, p.revTap, p.dlyTap, { inst: 'crash', midi: 0, dur: 2.2, vol: 0.3, pan: 0.4, room: 0.35, reverb: 0.45 }, t0, spb, 1);
      playScoreNote(rack, p.bus, p.roomTap, p.revTap, p.dlyTap, { inst: 'brass', midi: 69, dur: 0.9, vol: 0.26, pan: -0.35, reverb: 0.55, bright: 1.35 }, t0, spb, 1);
    } else if (kind === 'bossPhase') {
      playScoreNote(rack, p.bus, p.roomTap, p.revTap, p.dlyTap, { inst: 'taiko', midi: 40, dur: 0.65, vol: 0.36, pan: 0, room: 0.4, reverb: 0.45 }, t0, spb, 1);
      playScoreNote(rack, p.bus, p.roomTap, p.revTap, p.dlyTap, { inst: 'crash', midi: 0, dur: 2.4, vol: 0.28, pan: -0.35, room: 0.35, reverb: 0.45 }, t0 + 0.04, spb, 1);
    } else if (kind === 'ambushStart') {
      playScoreNote(rack, p.bus, p.roomTap, p.revTap, p.dlyTap, { inst: 'tom', midi: 50, dur: 0.24, vol: 0.28, pan: -0.35, room: 0.36 }, t0, spb, 1);
      playScoreNote(rack, p.bus, p.roomTap, p.revTap, p.dlyTap, { inst: 'tom', midi: 45, dur: 0.26, vol: 0.3, pan: 0.15, room: 0.36 }, t0 + 0.11, spb, 1);
      playScoreNote(rack, p.bus, p.roomTap, p.revTap, p.dlyTap, { inst: 'taiko', midi: 38, dur: 0.45, vol: 0.34, pan: 0.35, room: 0.4, reverb: 0.3 }, t0 + 0.22, spb, 1);
    }
  }

  update(want: MusicWant | null, running = true): void {
    const a = audioOut();
    const rack = this.ensureRack();
    if (!a || !rack) { this.stop(); return; }
    const c = a.ctx, now = c.currentTime;

    if (want && (!this.cur || this.cur.cue !== want.cue)) {
      // Quantize cue handoff to the old track's next beat boundary (clamped <= 0.38 s for snappiness)
      const handoffAt = this.cur && this.cur.nextAt > now + 0.03 && this.cur.nextAt - now < 0.38
        ? this.cur.nextAt
        : now + 0.06;
      this.release(handoffAt);
      // Unity-gain cue bus so EQ + saturator + glue compressor always run at optimal headroom!
      const bus = c.createGain(); bus.gain.setValueAtTime(0.0001, now); bus.connect(rack.musicIn);
      const roomTap = c.createGain(); roomTap.gain.setValueAtTime(0.0001, now); roomTap.connect(rack.musicRoomSend);
      const revTap = c.createGain(); revTap.gain.setValueAtTime(0.0001, now); revTap.connect(rack.musicRevSend);
      const dlyTap = c.createGain(); dlyTap.gain.setValueAtTime(0.0001, now); dlyTap.connect(rack.musicDlySend);
      for (const g of [bus, roomTap, revTap, dlyTap]) {
        g.gain.setTargetAtTime(1.0, handoffAt, 0.08);
      }
      this.cur = { cue: want.cue, bus, roomTap, revTap, dlyTap, beat: 0, nextAt: handoffAt, intensity: want.intensity };
    }

    const p = this.cur;
    if (!p) return;

    const level = want && running && !a.ducked ? want.gain : 0;
    rack.setMusicLevel(level, 0.24);

    if (!want) { this.release(now); return; }

    // Smoothly track dynamic combat intensity & dynamic low-pass tone (Skill Tree / Recover filter!)
    p.intensity += (want.intensity - p.intensity) * 0.14;
    const toneHz = want.muffled
      ? 780
      : want.exposed || want.ambush
        ? 19500
        : 11500 + p.intensity * 7500;
    rack.setMusicTone(toneHz, want.muffled ? 1.05 : 0.72, 0.2);

    if (!running || level <= 0.001) { p.nextAt = Math.max(p.nextAt, now + 0.1); return; }

    const spb = beatS(p.cue, want.tempoScale);
    rack.setTempo(spb);

    if (p.nextAt < now - 0.5) p.nextAt = now + 0.05; // prevent burst after tab sleep
    while (p.nextAt < now + 0.28) {
      for (const n of cueNotes(p.cue, p.beat, want)) {
        const lg = layerGain(n.minIntensity, p.intensity);
        if (lg <= 0.01) continue;
        // Subtle deterministic humanization timing jitter (kick/bass locked to grid; hats/plucks breathe +-5ms)
        const tight = n.inst === 'kick' || n.inst === 'bass' || n.inst === 'chug';
        const micro = tight ? 0 : hitVar(p.nextAt, p.beat * 17 + n.midi) * 0.0055;
        const noteAt = Math.max(now + 0.004, p.nextAt + (n.at ?? 0) * spb + micro);
        playScoreNote(rack, p.bus, p.roomTap, p.revTap, p.dlyTap, n, noteAt, spb, lg);
      }
      p.nextAt += spb;
      p.beat++;
    }
  }

  private release(at: number): void {
    if (!this.cur) return;
    const item = { bus: this.cur.bus, roomTap: this.cur.roomTap, revTap: this.cur.revTap, dlyTap: this.cur.dlyTap };
    for (const g of [item.bus, item.roomTap, item.revTap, item.dlyTap]) {
      g.gain.cancelScheduledValues(at);
      g.gain.setTargetAtTime(0, at, 0.16); // brisk clean fade avoids polytonal clashes on transitions
    }
    this.dying.push(item);
    this.cur = null;
    const id = setTimeout(() => {
      for (const g of [item.bus, item.roomTap, item.revTap, item.dlyTap]) {
        try { g.disconnect(); } catch { /* already disconnected */ }
      }
      this.dying = this.dying.filter((d) => d !== item);
      this.timers = this.timers.filter((t) => t !== id);
    }, 1800);
    this.timers.push(id);
  }

  stop(): void {
    for (const t of this.timers) clearTimeout(t);
    this.timers = [];
    const all = [...this.dying, ...(this.cur ? [{ bus: this.cur.bus, roomTap: this.cur.roomTap, revTap: this.cur.revTap, dlyTap: this.cur.dlyTap }] : [])];
    for (const item of all) {
      for (const g of [item.bus, item.roomTap, item.revTap, item.dlyTap]) {
        try { g.disconnect(); } catch { /* already disconnected */ }
      }
    }
    this.dying = [];
    this.cur = null;
    if (this.ownsRack && this.rack) {
      this.rack.dispose();
      this.rack = null;
      this.ownsRack = false;
    }
  }
}

const METAL_RATIOS = [1.0, 1.483, 1.8, 2.546, 2.634, 3.902]; // Classic 6-oscillator TR-808 inharmonic cymbal cluster

/**
 * Synthesize one expressive score note onto `dryBus` (+ tight room, cathedral hall, and ping-pong delay sends).
 * Exported so offline DSP verification scripts render with the exact live synth & studio mastering rack.
 */
export function playScoreNote(
  rack: DungeonAudioBus,
  dryBus: AudioNode,
  roomBus: AudioNode,
  revBus: AudioNode,
  dlyBus: AudioNode,
  n: ScoreNote,
  t0: number,
  spb: number,
  intensityMult = 1,
): void {
  const c = rack.ctx;
  const vol = Math.max(0.0002, n.vol * intensityMult);
  const dur = Math.max(0.04, n.dur * spb);
  const bright = n.bright ?? 1;
  const vRand = hitVar(t0, n.midi + n.inst.charCodeAt(0) * 13);

  const route = (src: AudioNode, roomAmt = n.room ?? 0, revAmt = n.reverb ?? 0, dlyAmt = n.delay ?? 0): void => {
    const out = n.pan ? rack.panner(n.pan) : src;
    if (out !== src) src.connect(out);
    out.connect(dryBus);
    if (roomAmt > 0.01) {
      const rg = c.createGain(); rg.gain.value = roomAmt;
      out.connect(rg); rg.connect(roomBus);
    }
    if (revAmt > 0.01) {
      const hg = c.createGain(); hg.gain.value = revAmt;
      out.connect(hg); hg.connect(revBus);
    }
    if (dlyAmt > 0.01) {
      const dg = c.createGain(); dg.gain.value = dlyAmt;
      out.connect(dg); dg.connect(dlyBus);
    }
  };

  // ---------- Studio Percussion Kit (Round-Robin Humanized) ----------

  if (n.inst === 'kick') {
    const sum = c.createGain();
    const base = Math.max(42, Math.min(56, mtof(n.midi || 38) * 0.58)) * (1 + vRand * 0.015);
    const sub = c.createOscillator(); sub.type = 'sine';
    sub.frequency.setValueAtTime(base * 3.4, t0);
    sub.frequency.exponentialRampToValueAtTime(base, t0 + 0.062);
    const g = c.createGain();
    g.gain.setValueAtTime(vol * 0.72, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + Math.max(0.15, dur));
    sub.connect(g); g.connect(sum); sub.start(t0); sub.stop(t0 + Math.max(0.18, dur) + 0.03);

    // Punchy beater transient (cuts cleanly on small speakers & over trainer noise)
    const clk = c.createBufferSource(); clk.buffer = rack.whiteNoise;
    const cf = c.createBiquadFilter(); cf.type = 'bandpass'; cf.frequency.value = 2850 * (1 + vRand * 0.06); cf.Q.value = 1.3;
    const cg = c.createGain();
    cg.gain.setValueAtTime(vol * 0.42, t0);
    cg.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.015);
    clk.connect(cf); cf.connect(cg); cg.connect(sum); clk.start(t0); clk.stop(t0 + 0.022);
    route(sum, n.room ?? 0.14, 0, 0);
    return;
  }

  if (n.inst === 'snare') {
    const sum = c.createGain();
    const velBright = (0.75 + Math.min(0.55, vol * 1.4)) * bright;
    // Woody shell crack
    const shell = c.createOscillator(); shell.type = 'triangle';
    const shF = 208 * (1 + vRand * 0.028);
    shell.frequency.setValueAtTime(shF * 1.35, t0);
    shell.frequency.exponentialRampToValueAtTime(shF * 0.68, t0 + 0.065);
    const sg = c.createGain();
    sg.gain.setValueAtTime(vol * 0.62, t0);
    sg.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.1);
    shell.connect(sg); sg.connect(sum); shell.start(t0); shell.stop(t0 + 0.12);
    // Velocity-sensitive snare wire sizzle
    const wire = c.createBufferSource(); wire.buffer = rack.whiteNoise; wire.loop = true;
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = clampF(c, 3100 * velBright * (1 + vRand * 0.05)); bp.Q.value = 0.85;
    const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1200;
    const wg = c.createGain();
    const d = Math.max(0.09, dur);
    wg.gain.setValueAtTime(vol * 0.92, t0);
    wg.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
    wire.connect(bp); bp.connect(hp); hp.connect(wg); wg.connect(sum);
    wire.start(t0, Math.abs(vRand) * 0.4); wire.stop(t0 + d + 0.02);
    route(sum, n.room ?? 0.34, n.reverb ?? 0.1, 0);
    return;
  }

  if (n.inst === 'rim') {
    const sum = c.createGain();
    const body = c.createOscillator(); body.type = 'triangle';
    const rf = 430 * (1 + vRand * 0.03);
    body.frequency.setValueAtTime(rf * 1.2, t0);
    body.frequency.exponentialRampToValueAtTime(rf, t0 + 0.025);
    const bg = c.createGain();
    bg.gain.setValueAtTime(vol * 0.72, t0);
    bg.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.055);
    body.connect(bg); bg.connect(sum); body.start(t0); body.stop(t0 + 0.065);

    const clk = c.createBufferSource(); clk.buffer = rack.whiteNoise;
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2900 * (1 + vRand * 0.05); bp.Q.value = 2.6;
    const cg = c.createGain();
    cg.gain.setValueAtTime(vol * 0.45, t0);
    cg.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.022);
    clk.connect(bp); bp.connect(cg); cg.connect(sum); clk.start(t0); clk.stop(t0 + 0.03);
    route(sum, n.room ?? 0.35, 0.08, 0);
    return;
  }

  if (n.inst === 'hat' || n.inst === 'openhat' || n.inst === 'ride' || n.inst === 'crash') {
    const isCrash = n.inst === 'crash';
    const isRide = n.inst === 'ride';
    const isOpen = n.inst === 'openhat';
    const d = isCrash ? Math.max(0.85, dur) : isRide ? Math.max(0.28, dur) : isOpen ? Math.max(0.2, dur) : Math.min(0.06, dur);
    const sum = c.createGain();

    // 6-oscillator inharmonic metallic cluster through bright bandpass
    const baseHz = (isCrash ? 1480 : isRide ? 2150 : 1920) * (1 + vRand * 0.025);
    const bp = c.createBiquadFilter(); bp.type = 'bandpass';
    bp.frequency.value = clampF(c, isCrash ? 6400 : isRide ? 5600 : 8800);
    bp.Q.value = isRide ? 1.8 : 1.05;
    const mg = c.createGain();
    mg.gain.setValueAtTime(0.0001, t0);
    mg.gain.linearRampToValueAtTime(vol * (isRide ? 0.36 : 0.24), t0 + 0.003);
    mg.gain.exponentialRampToValueAtTime(0.0001, t0 + d * 0.85);
    for (const r of METAL_RATIOS) {
      const fM = baseHz * r;
      if (fM > c.sampleRate * 0.42) continue;
      const o = c.createOscillator(); o.type = 'square'; o.frequency.value = fM;
      o.connect(bp); o.start(t0); o.stop(t0 + d + 0.02);
    }
    bp.connect(mg); mg.connect(sum);

    // Silky high-passed air wash
    const ns = c.createBufferSource(); ns.buffer = rack.whiteNoise; ns.loop = true;
    const hp = c.createBiquadFilter(); hp.type = 'highpass';
    hp.frequency.value = isCrash ? 4200 : isRide ? 5400 : isOpen ? 6800 : 8400;
    const ng = c.createGain();
    ng.gain.setValueAtTime(vol * (isCrash ? 0.85 : isRide ? 0.55 : 0.78), t0);
    ng.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
    ns.connect(hp); hp.connect(ng); ng.connect(sum);
    ns.start(t0, Math.abs(vRand) * 0.5); ns.stop(t0 + d + 0.03);

    // Ride bell ping accent
    if (isRide) {
      const bell = c.createOscillator(); bell.type = 'sine'; bell.frequency.value = 3420 * (1 + vRand * 0.015);
      const bg = c.createGain();
      bg.gain.setValueAtTime(vol * 0.22, t0);
      bg.gain.exponentialRampToValueAtTime(0.0001, t0 + Math.min(0.24, d));
      bell.connect(bg); bg.connect(sum); bell.start(t0); bell.stop(t0 + Math.min(0.26, d));
    }

    route(sum, n.room ?? (isCrash ? 0.34 : 0.16), n.reverb ?? (isCrash ? 0.36 : 0.08), 0);
    return;
  }

  if (n.inst === 'tom' || n.inst === 'taiko') {
    const isTaiko = n.inst === 'taiko';
    const f = clampF(c, mtof(n.midi || (isTaiko ? 42 : 48)) * (1 + vRand * 0.02));
    const d = Math.max(isTaiko ? 0.3 : 0.2, dur);
    const sum = c.createGain();
    const o = c.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(f * (isTaiko ? 1.5 : 1.75), t0);
    o.frequency.exponentialRampToValueAtTime(f * 0.92, t0 + (isTaiko ? 0.13 : 0.08));
    const og = c.createGain();
    og.gain.setValueAtTime(0.0001, t0);
    og.gain.linearRampToValueAtTime(vol * 0.95, t0 + 0.005);
    og.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
    o.connect(og); og.connect(sum); o.start(t0); o.stop(t0 + d + 0.03);

    const sk = c.createBufferSource(); sk.buffer = rack.pinkNoise;
    const sf = c.createBiquadFilter(); sf.type = 'bandpass'; sf.frequency.value = clampF(c, f * 4.2); sf.Q.value = 1.3;
    const sg = c.createGain();
    sg.gain.setValueAtTime(vol * 0.52, t0);
    sg.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.06);
    sk.connect(sf); sf.connect(sg); sg.connect(sum); sk.start(t0); sk.stop(t0 + 0.075);
    route(sum, n.room ?? 0.36, n.reverb ?? (isTaiko ? 0.32 : 0.14), 0);
    return;
  }

  if (n.inst === 'shaker') {
    const d = Math.max(0.05, dur);
    const ns = c.createBufferSource(); ns.buffer = rack.pinkNoise; ns.loop = true;
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 6200 * (1 + vRand * 0.07); bp.Q.value = 1.4;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(vol * 0.85, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
    ns.connect(bp); bp.connect(g); ns.start(t0, Math.abs(vRand) * 0.5); ns.stop(t0 + d + 0.02);
    route(g, n.room ?? 0.2, 0, 0);
    return;
  }

  // ---------- Karplus-Strong Physical-Model Plucked Strings ----------

  const f = clampF(c, mtof(n.midi));

  if (n.inst === 'lute' || n.inst === 'harp' || n.inst === 'harpsi' || n.inst === 'oud') {
    const kind: PluckKind = n.inst;
    const { buffer, playbackRate } = rack.pluckSample(kind, f);
    const src = c.createBufferSource();
    src.buffer = buffer;
    if (n.slide) {
      const startRate = playbackRate * Math.pow(2, n.slide / 12);
      src.playbackRate.setValueAtTime(startRate, t0);
      src.playbackRate.exponentialRampToValueAtTime(playbackRate, t0 + Math.min(0.065, dur * 0.28));
    } else {
      src.playbackRate.value = playbackRate * (1 + vRand * 0.0025);
    }
    const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = kind === 'harpsi' ? 220 : 140;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass';
    const cut = kind === 'harpsi' ? 9600 : kind === 'harp' ? 8400 : 6800;
    lp.frequency.value = clampF(c, cut * bright);
    const g = c.createGain();
    const rel = kind === 'harp' ? 0.38 : 0.16;
    const end = applyADSR(g.gain, t0, dur, vol * 1.42, 0.003, dur * 0.65, kind === 'harp' ? 0.5 : 0.42, rel);
    src.connect(hp); hp.connect(lp); lp.connect(g);
    src.start(t0); src.stop(Math.min(end + 0.03, t0 + buffer.duration / playbackRate + 0.02));
    route(g, n.room ?? 0.3, n.reverb ?? (kind === 'harp' ? 0.58 : 0.18), n.delay ?? (kind === 'harp' ? 0.35 : 0));
    return;
  }

  if (n.inst === 'chug') {
    // Palm-muted electric power-chord chug (root + 5th Karplus plucks -> tube overdrive -> guitar cab!)
    const sum = c.createGain();
    const drive = c.createWaveShaper(); drive.curve = rack.crunchCurve;
    const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 160;
    const cab = c.createBiquadFilter(); cab.type = 'lowpass'; cab.Q.value = 1.4;
    cab.frequency.setValueAtTime(clampF(c, 3800 * bright), t0);
    cab.frequency.exponentialRampToValueAtTime(clampF(c, 1350 * bright), t0 + Math.min(0.14, dur));
    const g = c.createGain();
    const end = applyADSR(g.gain, t0, dur, vol * 0.96, 0.004, 0.09, 0.38, 0.05);

    for (const [ratio, lvl] of [[1, 0.8], [1.498, 0.62]] as const) {
      const { buffer, playbackRate } = rack.pluckSample('chug', f * ratio);
      const src = c.createBufferSource(); src.buffer = buffer; src.playbackRate.value = playbackRate;
      const sg = c.createGain(); sg.gain.value = lvl;
      src.connect(sg); sg.connect(drive);
      src.start(t0); src.stop(end + 0.03);
    }
    drive.connect(hp); hp.connect(cab); cab.connect(g); g.connect(sum);
    route(sum, n.room ?? 0.28, 0.06, 0);
    return;
  }

  // ---------- Sustained Orchestral & Synth Voices (True ADSR!) ----------

  if (n.inst === 'organ') {
    const sum = c.createGain();
    const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 150;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass';
    lp.frequency.value = clampF(c, 4200 * bright);
    const g = c.createGain();
    const end = applyADSR(g.gain, t0, dur, vol * 0.86, 0.045, 0.12, 0.88, 0.24);
    for (const det of [-6, 6]) {
      const o = c.createOscillator();
      o.setPeriodicWave(rack.wave('organ'));
      o.frequency.value = f; o.detune.value = det;
      o.connect(hp); o.start(t0); o.stop(end + 0.03);
    }
    hp.connect(lp); lp.connect(g); g.connect(sum);
    route(sum, n.room ?? 0.12, n.reverb ?? 0.72, 0);
    return;
  }

  if (n.inst === 'strings') {
    // True sustained lush orchestral pad (high-passed at 170 Hz so strings stay airy and never fight bass!)
    const sum = c.createGain();
    const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 170;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 0.7;
    const atk = Math.min(0.42, dur * 0.25);
    lp.frequency.setValueAtTime(clampF(c, 720 * bright), t0);
    lp.frequency.exponentialRampToValueAtTime(clampF(c, 3200 * bright), t0 + atk * 1.2);
    lp.frequency.exponentialRampToValueAtTime(clampF(c, 2100 * bright), t0 + dur);
    const g = c.createGain();
    const end = applyADSR(g.gain, t0, dur, vol * 0.92, atk, 0.25, 0.84, 0.34);
    for (const [wave, det] of [['sawtooth', -10], ['triangle', 0], ['sawtooth', 10]] as const) {
      const o = c.createOscillator(); o.type = wave;
      o.frequency.value = f; o.detune.value = det;
      o.connect(hp); o.start(t0); o.stop(end + 0.04);
    }
    hp.connect(lp); lp.connect(g); g.connect(sum);
    route(sum, n.room ?? 0.1, n.reverb ?? 0.74, 0);
    return;
  }

  if (n.inst === 'brass') {
    const sum = c.createGain();
    const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 130;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 1.4;
    const atk = Math.min(0.065, dur * 0.18);
    lp.frequency.setValueAtTime(clampF(c, 520 * bright), t0);
    lp.frequency.exponentialRampToValueAtTime(clampF(c, 4200 * bright), t0 + atk * 1.3);
    lp.frequency.exponentialRampToValueAtTime(clampF(c, 2200 * bright), t0 + Math.max(atk * 1.5, dur * 0.85));
    const g = c.createGain();
    const end = applyADSR(g.gain, t0, dur, vol * 0.94, atk, 0.14, 0.76, 0.18);
    for (const det of [-6, 6]) {
      const o = c.createOscillator();
      o.setPeriodicWave(rack.wave('brass'));
      o.frequency.setValueAtTime(f * 0.986, t0);
      o.frequency.exponentialRampToValueAtTime(f, t0 + 0.036);
      o.detune.value = det;
      o.connect(hp); o.start(t0); o.stop(end + 0.03);
    }
    const sub = c.createOscillator(); sub.type = 'triangle'; sub.frequency.value = f * 0.5;
    const sg = c.createGain(); sg.gain.value = 0.14;
    sub.connect(sg); sg.connect(hp); sub.start(t0); sub.stop(end + 0.03);
    hp.connect(lp); lp.connect(g); g.connect(sum);
    route(sum, n.room ?? 0.16, n.reverb ?? 0.54, n.delay ?? 0.1);
    return;
  }

  if (n.inst === 'bass') {
    const sum = c.createGain();
    // Controlled sub-sine anchor (tight so it never eats 70% of headroom or turns the stereo field mono!)
    const sub = c.createOscillator(); sub.type = 'sine'; sub.frequency.value = f;
    const subG = c.createGain();
    const end = applyADSR(subG.gain, t0, dur, vol * 0.34, 0.008, 0.1, 0.55, 0.05);
    sub.connect(subG); subG.connect(sum);

    // Articulate harmonic mid-bass layer (audible on iPad/laptop speakers & over trainer fans!)
    const saw = c.createOscillator(); saw.type = 'sawtooth'; saw.frequency.value = f;
    const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 95;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 1.8;
    lp.frequency.setValueAtTime(clampF(c, 2200 * bright), t0);
    lp.frequency.exponentialRampToValueAtTime(clampF(c, 620 * bright), t0 + Math.min(0.14, dur * 0.65));
    const sawG = c.createGain();
    applyADSR(sawG.gain, t0, dur, vol * 0.56, 0.006, 0.12, 0.52, 0.05);
    saw.connect(hp); hp.connect(lp); lp.connect(sawG); sawG.connect(sum);
    sub.start(t0); sub.stop(end + 0.03); saw.start(t0); saw.stop(end + 0.03);
    route(sum, n.room ?? 0.12, 0, 0);
    return;
  }

  if (n.inst === 'bell') {
    const sum = c.createGain();
    const partials: Array<[number, number, number]> = [
      [1.0, 0.72, 1.0],
      [2.0, 0.36, 0.68],
      [2.756, 0.24, 0.44],
      [4.07, 0.14, 0.25],
    ];
    for (const [ratio, amp, decayScale] of partials) {
      const pf = f * ratio;
      if (pf > c.sampleRate * 0.44) continue;
      const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = pf;
      const pg = c.createGain();
      const pd = Math.max(0.08, (dur + 0.35) * decayScale);
      pg.gain.setValueAtTime(0.0001, t0);
      pg.gain.linearRampToValueAtTime(vol * amp, t0 + 0.004);
      pg.gain.exponentialRampToValueAtTime(0.0001, t0 + pd);
      o.connect(pg); pg.connect(sum); o.start(t0); o.stop(t0 + pd + 0.04);
    }
    route(sum, 0.1, n.reverb ?? 0.82, n.delay ?? 0.4);
    return;
  }

  // ---------- Biome-Specific Expressive Solo Instruments (True ADSR + Vibrato + Formants) ----------

  if (n.inst === 'flute') {
    const sum = c.createGain();
    const o = c.createOscillator(); o.setPeriodicWave(rack.wave('flute'));
    o.frequency.setValueAtTime(f * 0.992, t0);
    o.frequency.exponentialRampToValueAtTime(f, t0 + 0.045);
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = clampF(c, 3600 * bright);
    const g = c.createGain();
    const end = applyADSR(g.gain, t0, dur, vol * 0.9, 0.06, 0.12, 0.84, 0.18);
    if (dur > 0.28) {
      const lfo = c.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 5.1;
      const lg = c.createGain();
      lg.gain.setValueAtTime(0, t0); lg.gain.linearRampToValueAtTime(0, t0 + 0.14);
      lg.gain.linearRampToValueAtTime(f * 0.007, t0 + Math.min(dur, 0.38));
      lfo.connect(lg); lg.connect(o.frequency); lfo.start(t0); lfo.stop(end + 0.02);
    }
    // Airy wooden breath chiff at attack
    const br = c.createBufferSource(); br.buffer = rack.pinkNoise;
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = clampF(c, f * 2.1); bp.Q.value = 3.2;
    const bg = c.createGain();
    bg.gain.setValueAtTime(0.0001, t0); bg.gain.linearRampToValueAtTime(vol * 0.18, t0 + 0.03);
    bg.gain.exponentialRampToValueAtTime(0.0001, t0 + Math.min(0.22, dur * 0.6));
    br.connect(bp); bp.connect(bg); bg.connect(sum); br.start(t0); br.stop(t0 + 0.25);

    o.connect(lp); lp.connect(g); g.connect(sum); o.start(t0); o.stop(end + 0.03);
    route(sum, 0.12, n.reverb ?? 0.62, n.delay ?? 0.32);
    return;
  }

  if (n.inst === 'fiddle') {
    const sum = c.createGain();
    const o = c.createOscillator(); o.setPeriodicWave(rack.wave('fiddle'));
    const fStart = n.slide ? f * Math.pow(2, n.slide / 12) : f * 0.994;
    o.frequency.setValueAtTime(fStart, t0);
    o.frequency.exponentialRampToValueAtTime(f, t0 + (n.slide ? 0.065 : 0.03));

    // Violin wooden body + rosin presence formants
    const body = c.createBiquadFilter(); body.type = 'peaking'; body.frequency.value = 480; body.Q.value = 1.4; body.gain.value = 3.5;
    const sheen = c.createBiquadFilter(); sheen.type = 'peaking'; sheen.frequency.value = 2700; sheen.Q.value = 1.2; sheen.gain.value = 3.2;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = clampF(c, 5600 * bright);
    const g = c.createGain();
    const end = applyADSR(g.gain, t0, dur, vol * 0.88, 0.038, 0.12, 0.82, 0.16);

    if (dur > 0.26) {
      const lfo = c.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 5.8;
      const lg = c.createGain();
      lg.gain.setValueAtTime(0, t0); lg.gain.linearRampToValueAtTime(0, t0 + 0.1);
      lg.gain.linearRampToValueAtTime(f * 0.0085, t0 + Math.min(dur, 0.3));
      lfo.connect(lg); lg.connect(o.frequency); lfo.start(t0); lfo.stop(end + 0.02);
    }
    o.connect(body); body.connect(sheen); sheen.connect(lp); lp.connect(g); g.connect(sum);
    o.start(t0); o.stop(end + 0.03);
    route(sum, n.room ?? 0.18, n.reverb ?? 0.52, n.delay ?? 0.34);
    return;
  }

  if (n.inst === 'reed') {
    const sum = c.createGain();
    const o = c.createOscillator(); o.setPeriodicWave(rack.wave('reed')); o.frequency.value = f;
    const nasal = c.createBiquadFilter(); nasal.type = 'peaking'; nasal.frequency.value = 1250; nasal.Q.value = 2.0; nasal.gain.value = 4.5;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = clampF(c, 4400 * bright);
    const g = c.createGain();
    const end = applyADSR(g.gain, t0, dur, vol * 0.84, 0.032, 0.12, 0.85, 0.16);
    if (dur > 0.28) {
      const lfo = c.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 5.2;
      const lg = c.createGain();
      lg.gain.setValueAtTime(0, t0); lg.gain.linearRampToValueAtTime(0, t0 + 0.12);
      lg.gain.linearRampToValueAtTime(f * 0.006, t0 + Math.min(dur, 0.32));
      lfo.connect(lg); lg.connect(o.frequency); lfo.start(t0); lfo.stop(end + 0.02);
    }
    o.connect(nasal); nasal.connect(lp); lp.connect(g); g.connect(sum);
    o.start(t0); o.stop(end + 0.03);
    route(sum, 0.12, n.reverb ?? 0.62, n.delay ?? 0.35);
    return;
  }

  if (n.inst === 'guitar') {
    // Overdriven rock/metal lead guitar: dual detuned waves -> tube amp overdrive -> cabinet sim -> rock vibrato!
    const sum = c.createGain();
    const pre = c.createGain(); pre.gain.value = 0.72;
    const amp = c.createWaveShaper(); amp.curve = rack.ampCurve;
    const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 160;
    const cabMid = c.createBiquadFilter(); cabMid.type = 'peaking'; cabMid.frequency.value = 1950; cabMid.Q.value = 1.1; cabMid.gain.value = 3.8;
    const cabLp = c.createBiquadFilter(); cabLp.type = 'lowpass'; cabLp.Q.value = 1.1; cabLp.frequency.value = clampF(c, 4500 * bright);
    const g = c.createGain();
    const end = applyADSR(g.gain, t0, dur, vol * 0.76, 0.012, 0.14, 0.78, 0.18);

    const fStart = n.slide ? f * Math.pow(2, n.slide / 12) : f;
    let lfo: OscillatorNode | null = null;
    let lg: GainNode | null = null;
    if (dur > 0.25) {
      lfo = c.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 5.6;
      lg = c.createGain();
      lg.gain.setValueAtTime(0, t0); lg.gain.linearRampToValueAtTime(0, t0 + 0.1);
      lg.gain.linearRampToValueAtTime(f * 0.01, t0 + Math.min(dur, 0.32));
      lfo.connect(lg); lfo.start(t0); lfo.stop(end + 0.02);
    }

    for (const det of [-5, 5]) {
      const o = c.createOscillator(); o.setPeriodicWave(rack.wave('guitar'));
      o.detune.value = det;
      if (n.slide) {
        o.frequency.setValueAtTime(fStart, t0);
        o.frequency.exponentialRampToValueAtTime(f, t0 + Math.min(0.11, dur * 0.35));
      } else {
        o.frequency.value = f;
      }
      if (lg) lg.connect(o.frequency);
      o.connect(pre); o.start(t0); o.stop(end + 0.03);
    }

    pre.connect(amp); amp.connect(hp); hp.connect(cabMid); cabMid.connect(cabLp); cabLp.connect(g); g.connect(sum);
    route(sum, n.room ?? 0.22, n.reverb ?? 0.42, n.delay ?? 0.34);
    return;
  }

  // Default: expressive 'lead' with true ADSR & vibrato
  const sum = c.createGain();
  const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 1.2;
  lp.frequency.setValueAtTime(clampF(c, Math.min(5400, f * 5.8 * bright)), t0);
  lp.frequency.exponentialRampToValueAtTime(clampF(c, Math.min(3600, f * 3.4 * bright)), t0 + Math.max(0.1, dur * 0.7));
  const g = c.createGain();
  const end = applyADSR(g.gain, t0, dur, vol * 0.85, 0.03, 0.14, 0.78, 0.16);
  const o = c.createOscillator(); o.setPeriodicWave(rack.wave('lead')); o.frequency.value = f;
  if (dur > 0.28) {
    const lfo = c.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 5.4;
    const lfoG = c.createGain();
    lfoG.gain.setValueAtTime(0, t0); lfoG.gain.linearRampToValueAtTime(0, t0 + 0.11);
    lfoG.gain.linearRampToValueAtTime(f * 0.0075, t0 + Math.min(dur, 0.34));
    lfo.connect(lfoG); lfoG.connect(o.frequency); lfo.start(t0); lfo.stop(end + 0.02);
  }
  o.connect(lp); lp.connect(g); g.connect(sum); o.start(t0); o.stop(end + 0.03);
  route(sum, n.room ?? 0.16, n.reverb ?? 0.54, n.delay ?? 0.38);
}
