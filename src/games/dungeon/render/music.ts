// Studio-grade procedural WebAudio music synthesizer for Purgatour.
// Routes exclusively through audioOut() -> DungeonAudioBus (stereo stone-hall reverb, tempo-synced
// ping-pong delay, warm saturator, glue compressor) and automatically respects mute & external-media ducking.
import { audioOut, sfxGraph } from '../../../audio/sfx';
import { DungeonAudioBus } from './audioBus';
import { beatS, cueNotes, layerGain, mtof, type DungeonCue, type MusicWant, type ScoreNote } from './musicScore';

interface Playing {
  cue: DungeonCue;
  bus: GainNode;
  revTap: GainNode;
  dlyTap: GainNode;
  beat: number;
  nextAt: number;
  intensity: number;
}

const clampF = (ctx: BaseAudioContext, hz: number) => Math.max(24, Math.min(ctx.sampleRate * 0.44, hz));

export class DungeonMusic {
  private rack: DungeonAudioBus | null = null;
  private ownsRack = false;
  private cur: Playing | null = null;
  private dying: Array<{ bus: GainNode; revTap: GainNode; dlyTap: GainNode }> = [];
  private timers: ReturnType<typeof setTimeout>[] = [];

  /** Optional: share a DungeonAudioBus created by DungeonSound so music + SFX share one reverb/master rack. */
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

  update(want: MusicWant | null, running = true): void {
    const a = audioOut();
    const rack = this.ensureRack();
    if (!a || !rack) { this.stop(); return; }
    const c = a.ctx, now = c.currentTime;

    if (want && (!this.cur || this.cur.cue !== want.cue)) {
      this.release(now);
      const bus = c.createGain(); bus.gain.value = 0.0001; bus.connect(rack.musicIn);
      const revTap = c.createGain(); revTap.gain.value = 0.0001; revTap.connect(rack.musicRevSend);
      const dlyTap = c.createGain(); dlyTap.gain.value = 0.0001; dlyTap.connect(rack.musicDlySend);
      this.cur = { cue: want.cue, bus, revTap, dlyTap, beat: 0, nextAt: now + 0.08, intensity: want.intensity };
    }

    const p = this.cur;
    if (!p) return;

    const level = want && running && !a.ducked ? want.gain : 0;
    p.bus.gain.setTargetAtTime(level, now, 0.32);
    p.revTap.gain.setTargetAtTime(level, now, 0.32);
    p.dlyTap.gain.setTargetAtTime(level, now, 0.32);

    if (!want) { this.release(now); return; }
    // Smoothly track dynamic combat intensity without abrupt jumps
    p.intensity += (want.intensity - p.intensity) * 0.14;

    if (!running || level <= 0.001) { p.nextAt = Math.max(p.nextAt, now + 0.1); return; }

    const spb = beatS(p.cue, want.tempoScale);
    rack.setTempo(spb);

    if (p.nextAt < now - 0.5) p.nextAt = now + 0.05; // prevent burst after tab sleep
    while (p.nextAt < now + 0.28) {
      for (const n of cueNotes(p.cue, p.beat)) {
        const lg = layerGain(n.minIntensity, p.intensity);
        if (lg <= 0.01) continue;
        playScoreNote(rack, p.bus, p.revTap, p.dlyTap, n, p.nextAt + (n.at ?? 0) * spb, spb, lg);
      }
      p.nextAt += spb;
      p.beat++;
    }
  }

  private release(now: number): void {
    if (!this.cur) return;
    const item = { bus: this.cur.bus, revTap: this.cur.revTap, dlyTap: this.cur.dlyTap };
    for (const g of [item.bus, item.revTap, item.dlyTap]) {
      g.gain.cancelScheduledValues(now);
      g.gain.setTargetAtTime(0, now, 0.42);
    }
    this.dying.push(item);
    this.cur = null;
    const id = setTimeout(() => {
      for (const g of [item.bus, item.revTap, item.dlyTap]) {
        try { g.disconnect(); } catch { /* already disconnected */ }
      }
      this.dying = this.dying.filter((d) => d !== item);
      this.timers = this.timers.filter((t) => t !== id);
    }, 2600);
    this.timers.push(id);
  }

  stop(): void {
    for (const t of this.timers) clearTimeout(t);
    this.timers = [];
    const all = [...this.dying, ...(this.cur ? [{ bus: this.cur.bus, revTap: this.cur.revTap, dlyTap: this.cur.dlyTap }] : [])];
    for (const item of all) {
      for (const g of [item.bus, item.revTap, item.dlyTap]) {
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

/**
 * Synthesize one expressive score note onto `dryBus` (+ optional reverb/delay sends).
 * Exported so offline verification scripts can render with the exact live synth & DSP bus.
 */
export function playScoreNote(
  rack: DungeonAudioBus,
  dryBus: AudioNode,
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

  // Route helper: connects a voice's output through stereo panner to dry + reverb/delay sends
  const route = (src: AudioNode, revAmt = n.reverb ?? 0.35, dlyAmt = n.delay ?? 0): void => {
    const out = n.pan ? rack.panner(n.pan) : src;
    if (out !== src) src.connect(out);
    out.connect(dryBus);
    if (revAmt > 0.01) {
      const rg = c.createGain(); rg.gain.value = revAmt;
      out.connect(rg); rg.connect(revBus);
    }
    if (dlyAmt > 0.01) {
      const dg = c.createGain(); dg.gain.value = dlyAmt;
      out.connect(dg); dg.connect(dlyBus);
    }
  };

  // ---------- Percussion ----------

  if (n.inst === 'kick') {
    const g = c.createGain();
    g.gain.setValueAtTime(vol * 1.1, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + Math.max(0.16, dur));
    // Sub pitch drop
    const sub = c.createOscillator(); sub.type = 'sine';
    const base = Math.max(36, Math.min(54, mtof(n.midi || 38) * 0.52));
    sub.frequency.setValueAtTime(base * 3.4, t0);
    sub.frequency.exponentialRampToValueAtTime(base, t0 + 0.085);
    sub.connect(g); sub.start(t0); sub.stop(t0 + Math.max(0.18, dur) + 0.03);
    // Warm body punch
    const body = c.createOscillator(); body.type = 'triangle';
    const bg = c.createGain();
    body.frequency.setValueAtTime(115, t0);
    body.frequency.exponentialRampToValueAtTime(48, t0 + 0.055);
    bg.gain.setValueAtTime(vol * 0.4, t0);
    bg.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.07);
    body.connect(bg); bg.connect(dryBus); body.start(t0); body.stop(t0 + 0.08);
    // Crisp beater click
    const clk = c.createBufferSource(); clk.buffer = rack.whiteNoise;
    const cf = c.createBiquadFilter(); cf.type = 'bandpass'; cf.frequency.value = 1850; cf.Q.value = 1.4;
    const cg = c.createGain();
    cg.gain.setValueAtTime(vol * 0.35, t0);
    cg.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.015);
    clk.connect(cf); cf.connect(cg); cg.connect(dryBus); clk.start(t0); clk.stop(t0 + 0.02);
    route(g, 0.08, 0);
    return;
  }

  if (n.inst === 'snare') {
    const sum = c.createGain();
    // 1. Pitched shell resonance
    const shell = c.createOscillator(); shell.type = 'triangle';
    shell.frequency.setValueAtTime(215, t0);
    shell.frequency.exponentialRampToValueAtTime(128, t0 + 0.075);
    const sg = c.createGain();
    sg.gain.setValueAtTime(vol * 0.65, t0);
    sg.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.11);
    shell.connect(sg); sg.connect(sum); shell.start(t0); shell.stop(t0 + 0.13);
    // 2. Snare wire crack (bandpass + bright highpass air)
    const wire = c.createBufferSource(); wire.buffer = rack.whiteNoise; wire.loop = true;
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2400; bp.Q.value = 0.9;
    const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1400;
    const wg = c.createGain();
    wg.gain.setValueAtTime(vol * 0.95, t0);
    wg.gain.exponentialRampToValueAtTime(0.0001, t0 + Math.max(0.11, dur));
    wire.connect(bp); bp.connect(hp); hp.connect(wg); wg.connect(sum);
    wire.start(t0); wire.stop(t0 + Math.max(0.13, dur) + 0.02);
    route(sum, n.reverb ?? 0.32, 0);
    return;
  }

  if (n.inst === 'hat' || n.inst === 'openhat') {
    const open = n.inst === 'openhat';
    const d = open ? Math.max(0.18, dur) : Math.min(0.065, dur);
    const sum = c.createGain();
    // Crisp air shimmer
    const ns = c.createBufferSource(); ns.buffer = rack.whiteNoise; ns.loop = true;
    const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = open ? 6800 : 8200; hp.Q.value = 0.8;
    const ng = c.createGain();
    ng.gain.setValueAtTime(vol * 0.72, t0);
    ng.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
    ns.connect(hp); hp.connect(ng); ng.connect(sum); ns.start(t0); ns.stop(t0 + d + 0.02);
    // Metallic cymbal partials (inharmonic square pair through bandpass)
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 9600; bp.Q.value = 1.6;
    const mg = c.createGain();
    mg.gain.setValueAtTime(vol * 0.22, t0);
    mg.gain.exponentialRampToValueAtTime(0.0001, t0 + d * 0.85);
    for (const hz of [3140, 4712]) {
      const o = c.createOscillator(); o.type = 'square'; o.frequency.value = hz;
      o.connect(bp); o.start(t0); o.stop(t0 + d + 0.02);
    }
    bp.connect(mg); mg.connect(sum);
    route(sum, open ? 0.25 : 0.08, 0);
    return;
  }

  if (n.inst === 'taiko') {
    const f = clampF(c, mtof(n.midi || 42));
    const d = Math.max(0.28, dur);
    const sum = c.createGain();
    const o = c.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(f * 1.55, t0);
    o.frequency.exponentialRampToValueAtTime(f * 0.92, t0 + 0.14);
    const og = c.createGain();
    og.gain.setValueAtTime(0.0001, t0);
    og.gain.linearRampToValueAtTime(vol * 1.05, t0 + 0.006);
    og.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
    o.connect(og); og.connect(sum); o.start(t0); o.stop(t0 + d + 0.03);
    // Warm skin impact slap
    const sk = c.createBufferSource(); sk.buffer = rack.pinkNoise;
    const sf = c.createBiquadFilter(); sf.type = 'bandpass'; sf.frequency.value = f * 3.8; sf.Q.value = 1.2;
    const sg = c.createGain();
    sg.gain.setValueAtTime(vol * 0.5, t0);
    sg.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.075);
    sk.connect(sf); sf.connect(sg); sg.connect(sum); sk.start(t0); sk.stop(t0 + 0.09);
    route(sum, n.reverb ?? 0.58, 0);
    return;
  }

  if (n.inst === 'shaker') {
    const d = Math.max(0.055, dur);
    const ns = c.createBufferSource(); ns.buffer = rack.pinkNoise; ns.loop = true;
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 5400; bp.Q.value = 1.6;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(vol * 0.85, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
    ns.connect(bp); bp.connect(g); ns.start(t0); ns.stop(t0 + d + 0.02);
    route(g, n.reverb ?? 0.18, 0);
    return;
  }

  // ---------- Pitched Expressive Instruments ----------

  const f = clampF(c, mtof(n.midi));

  if (n.inst === 'lute') {
    const sum = c.createGain();
    const o = c.createOscillator();
    o.setPeriodicWave(rack.wave('lute'));
    o.frequency.setValueAtTime(f, t0);
    // Resonant plucked filter envelope: bright wooden attack -> warm mellow sustain
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 1.3;
    lp.frequency.setValueAtTime(clampF(c, Math.min(6200, f * 9.5 * bright)), t0);
    lp.frequency.exponentialRampToValueAtTime(clampF(c, Math.max(320, f * 1.9 * bright)), t0 + Math.min(0.22, dur * 0.65));
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur + 0.06);
    o.connect(lp); lp.connect(g); g.connect(sum);
    o.start(t0); o.stop(t0 + dur + 0.09);
    // Subtle fingernail/pick transient
    const pk = c.createBufferSource(); pk.buffer = rack.whiteNoise;
    const pf = c.createBiquadFilter(); pf.type = 'bandpass'; pf.frequency.value = clampF(c, f * 4.5); pf.Q.value = 2.2;
    const pg = c.createGain();
    pg.gain.setValueAtTime(vol * 0.2, t0);
    pg.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.014);
    pk.connect(pf); pf.connect(pg); pg.connect(sum); pk.start(t0); pk.stop(t0 + 0.02);
    route(sum, n.reverb ?? 0.45, n.delay ?? 0.3);
    return;
  }

  if (n.inst === 'harp') {
    const sum = c.createGain();
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur + 0.14);
    const lp = c.createBiquadFilter(); lp.type = 'lowpass';
    lp.frequency.setValueAtTime(clampF(c, Math.min(7200, f * 8 * bright)), t0);
    lp.frequency.exponentialRampToValueAtTime(clampF(c, f * 2.2), t0 + Math.min(0.32, dur));
    const o1 = c.createOscillator(); o1.type = 'triangle'; o1.frequency.value = f;
    const o2 = c.createOscillator(); o2.type = 'sine'; o2.frequency.value = f * 2;
    const g2 = c.createGain(); g2.gain.value = 0.24;
    o1.connect(lp); o2.connect(g2); g2.connect(lp);
    lp.connect(g); g.connect(sum);
    const end = t0 + dur + 0.18;
    o1.start(t0); o1.stop(end); o2.start(t0); o2.stop(end);
    route(sum, n.reverb ?? 0.65, n.delay ?? 0.48);
    return;
  }

  if (n.inst === 'harpsi') {
    const sum = c.createGain();
    const o = c.createOscillator();
    o.setPeriodicWave(rack.wave('harpsi'));
    o.frequency.value = f;
    const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 260;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 1.6;
    lp.frequency.setValueAtTime(clampF(c, Math.min(8200, f * 12 * bright)), t0);
    lp.frequency.exponentialRampToValueAtTime(clampF(c, f * 2.6), t0 + Math.min(0.14, dur * 0.7));
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur + 0.04);
    o.connect(hp); hp.connect(lp); lp.connect(g); g.connect(sum);
    o.start(t0); o.stop(t0 + dur + 0.07);
    route(sum, n.reverb ?? 0.48, n.delay ?? 0.35);
    return;
  }

  if (n.inst === 'organ') {
    const sum = c.createGain();
    const lp = c.createBiquadFilter(); lp.type = 'lowpass';
    lp.frequency.value = clampF(c, 2200 * bright);
    const g = c.createGain();
    const atk = Math.min(0.08, dur * 0.12);
    const rel = Math.min(0.25, dur * 0.2);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + atk);
    g.gain.setValueAtTime(vol * 0.92, t0 + Math.max(atk + 0.02, dur - rel));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur + 0.08);
    const end = t0 + dur + 0.12;
    for (const det of [-5.5, 5.5]) {
      const o = c.createOscillator();
      o.setPeriodicWave(rack.wave('organ'));
      o.frequency.value = f;
      o.detune.value = det;
      o.connect(lp);
      o.start(t0); o.stop(end);
    }
    lp.connect(g); g.connect(sum);
    route(sum, n.reverb ?? 0.78, 0);
    return;
  }

  if (n.inst === 'strings') {
    const sum = c.createGain();
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 0.8;
    const atk = Math.min(0.55, dur * 0.32);
    lp.frequency.setValueAtTime(clampF(c, 380 * bright), t0);
    lp.frequency.exponentialRampToValueAtTime(clampF(c, 1550 * bright), t0 + atk * 1.15);
    lp.frequency.exponentialRampToValueAtTime(clampF(c, 680 * bright), t0 + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + atk);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur + 0.12);
    const end = t0 + dur + 0.16;
    for (const [wave, det] of [['sawtooth', -10], ['triangle', 0], ['sawtooth', 10]] as const) {
      const o = c.createOscillator(); o.type = wave;
      o.frequency.value = f; o.detune.value = det;
      o.connect(lp); o.start(t0); o.stop(end);
    }
    lp.connect(g); g.connect(sum);
    route(sum, n.reverb ?? 0.76, 0);
    return;
  }

  if (n.inst === 'brass') {
    const sum = c.createGain();
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 1.6;
    const atk = Math.min(0.07, dur * 0.2);
    lp.frequency.setValueAtTime(clampF(c, 320 * bright), t0);
    lp.frequency.exponentialRampToValueAtTime(clampF(c, 2500 * bright), t0 + atk * 1.2);
    lp.frequency.exponentialRampToValueAtTime(clampF(c, 980 * bright), t0 + Math.max(atk * 1.3, dur * 0.85));
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + atk);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur + 0.08);
    const end = t0 + dur + 0.12;
    for (const det of [-6, 6]) {
      const o = c.createOscillator();
      o.setPeriodicWave(rack.wave('brass'));
      // Authentic brass attack lip scoop (-20 cents -> 0)
      o.frequency.setValueAtTime(f * 0.988, t0);
      o.frequency.exponentialRampToValueAtTime(f, t0 + 0.036);
      o.detune.value = det;
      o.connect(lp); o.start(t0); o.stop(end);
    }
    const sub = c.createOscillator(); sub.type = 'triangle'; sub.frequency.value = f * 0.5;
    const sg = c.createGain(); sg.gain.value = 0.25;
    sub.connect(sg); sg.connect(lp); sub.start(t0); sub.stop(end);
    lp.connect(g); g.connect(sum);
    route(sum, n.reverb ?? 0.58, n.delay ?? 0.15);
    return;
  }

  if (n.inst === 'bass') {
    const sum = c.createGain();
    // Sub sine anchor (always clean & fat)
    const sub = c.createOscillator(); sub.type = 'sine'; sub.frequency.value = f;
    const subG = c.createGain();
    subG.gain.setValueAtTime(0.0001, t0);
    subG.gain.linearRampToValueAtTime(vol * 0.72, t0 + 0.008);
    subG.gain.exponentialRampToValueAtTime(0.0001, t0 + dur + 0.04);
    sub.connect(subG); subG.connect(sum);
    // Punchy filtered sawtooth pluck layer (cuts through iPad speakers)
    const saw = c.createOscillator(); saw.type = 'sawtooth'; saw.frequency.value = f;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 1.6;
    lp.frequency.setValueAtTime(clampF(c, 1350 * bright), t0);
    lp.frequency.exponentialRampToValueAtTime(clampF(c, 220 * bright), t0 + Math.min(0.11, dur * 0.6));
    const sawG = c.createGain();
    sawG.gain.setValueAtTime(0.0001, t0);
    sawG.gain.linearRampToValueAtTime(vol * 0.55, t0 + 0.006);
    sawG.gain.exponentialRampToValueAtTime(0.0001, t0 + dur + 0.03);
    saw.connect(lp); lp.connect(sawG); sawG.connect(sum);
    const end = t0 + dur + 0.06;
    sub.start(t0); sub.stop(end); saw.start(t0); saw.stop(end);
    route(sum, n.reverb ?? 0.12, 0);
    return;
  }

  if (n.inst === 'bell') {
    // True cathedral tubular bell: inharmonic metallic partials decaying faster than fundamental
    const sum = c.createGain();
    const partials: Array<[number, number, number]> = [
      [1.0, 0.72, 1.0],
      [2.0, 0.34, 0.65],
      [2.756, 0.24, 0.42],
      [4.07, 0.12, 0.24],
    ];
    for (const [ratio, amp, decayScale] of partials) {
      const pf = f * ratio;
      if (pf > c.sampleRate * 0.44) continue;
      const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = pf;
      const pg = c.createGain();
      const pd = Math.max(0.08, (dur + 0.3) * decayScale);
      pg.gain.setValueAtTime(0.0001, t0);
      pg.gain.linearRampToValueAtTime(vol * amp, t0 + 0.004);
      pg.gain.exponentialRampToValueAtTime(0.0001, t0 + pd);
      o.connect(pg); pg.connect(sum); o.start(t0); o.stop(t0 + pd + 0.04);
    }
    route(sum, n.reverb ?? 0.85, n.delay ?? 0.5);
    return;
  }

  // Default: 'lead' (expressive solo fiddle/flute/synth-guitar with delayed vibrato & filter contour)
  const sum = c.createGain();
  const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 1.2;
  const atk = Math.min(0.04, dur * 0.15);
  lp.frequency.setValueAtTime(clampF(c, Math.min(4800, f * 5.2 * bright)), t0);
  lp.frequency.exponentialRampToValueAtTime(clampF(c, Math.min(3400, f * 3.1 * bright)), t0 + Math.max(0.08, dur * 0.7));
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.linearRampToValueAtTime(vol, t0 + atk);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur + 0.08);

  const o = c.createOscillator();
  o.setPeriodicWave(rack.wave('lead'));
  o.frequency.value = f;

  // Delayed expressive vibrato on sustained notes (> 0.28 s)
  const end = t0 + dur + 0.12;
  if (dur > 0.28) {
    const lfo = c.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 5.4;
    const lfoG = c.createGain();
    lfoG.gain.setValueAtTime(0, t0);
    lfoG.gain.linearRampToValueAtTime(0, t0 + 0.11);
    lfoG.gain.linearRampToValueAtTime(f * 0.0075, t0 + Math.min(dur, 0.34));
    lfo.connect(lfoG); lfoG.connect(o.frequency);
    lfo.start(t0); lfo.stop(end);
  }
  o.connect(lp); lp.connect(g); g.connect(sum);
  o.start(t0); o.stop(end);
  route(sum, n.reverb ?? 0.58, n.delay ?? 0.45);
}
