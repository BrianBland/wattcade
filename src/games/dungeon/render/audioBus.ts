// Shared studio DSP rack & cached harmonic wavetables for Purgatour's music and SFX.
// Works on both live AudioContext (via audioOut()/sfxGraph()) and OfflineAudioContext (for offline audio audits).
// Safe to import in Node: allocates zero WebAudio resources until constructed.

export type WaveName = 'lute' | 'organ' | 'brass' | 'harpsi' | 'lead';

export class DungeonAudioBus {
  readonly ctx: BaseAudioContext;
  readonly musicIn: GainNode;
  readonly musicRevSend: GainNode;
  readonly musicDlySend: GainNode;
  readonly sfxIn: GainNode;
  readonly sfxRevSend: GainNode;
  readonly whiteNoise: AudioBuffer;
  readonly pinkNoise: AudioBuffer;

  private readonly musicDuck: GainNode;
  private readonly musicMaster: GainNode;
  private readonly sfxMaster: GainNode;
  private readonly dlyL: DelayNode;
  private readonly dlyR: DelayNode;
  private readonly allNodes: AudioNode[] = [];
  private readonly waves: Record<WaveName, PeriodicWave>;
  private disposed = false;

  constructor(ctx: BaseAudioContext, dest: AudioNode, sharedWhiteNoise?: AudioBuffer) {
    this.ctx = ctx;

    // 1. Shared noise buffers (white for transients/snares/hats, pink for organic fire/wind/rumbles)
    this.whiteNoise = sharedWhiteNoise ?? makeNoiseBuffer(ctx, 1.0, false);
    this.pinkNoise = makeNoiseBuffer(ctx, 1.2, true);

    // 2. Cached PeriodicWaves (computed once per AudioContext)
    this.waves = {
      lute: makeWave(ctx, [0, 1.0, 0.72, 0.48, 0.28, 0.16, 0.09, 0.05, 0.025]),
      organ: makeWave(ctx, [0, 1.0, 0.82, 0.62, 0.54, 0.24, 0.36, 0.08, 0.28, 0.04, 0.12, 0.02, 0.08]),
      brass: makeWave(ctx, [0, 0.9, 1.0, 0.85, 0.62, 0.45, 0.32, 0.22, 0.14, 0.08, 0.04]),
      harpsi: makeWave(ctx, [0, 0.7, 0.95, 0.88, 0.72, 0.58, 0.46, 0.36, 0.26, 0.18, 0.12, 0.08]),
      lead: makeWave(ctx, [0, 1.0, 0.64, 0.52, 0.3, 0.22, 0.14, 0.08, 0.04]),
    };

    // 3. Shared stereo dungeon-hall convolution reverb (early stone reflections + warm damped diffuse tail)
    const rev = ctx.createConvolver();
    rev.buffer = makeHallImpulse(ctx, 1.85);
    const revTone = ctx.createBiquadFilter();
    revTone.type = 'lowpass';
    revTone.frequency.value = 3400;
    const revHp = ctx.createBiquadFilter();
    revHp.type = 'highpass';
    revHp.frequency.value = 130;

    // 4. Stereo ping-pong delay for cinematic width on plucks, bells, and leads
    this.dlyL = ctx.createDelay(1.2);
    this.dlyR = ctx.createDelay(1.2);
    this.dlyL.delayTime.value = 0.25;
    this.dlyR.delayTime.value = 0.375;
    const dlyLpL = ctx.createBiquadFilter(); dlyLpL.type = 'lowpass'; dlyLpL.frequency.value = 2100;
    const dlyLpR = ctx.createBiquadFilter(); dlyLpR.type = 'lowpass'; dlyLpR.frequency.value = 1850;
    const fbL = ctx.createGain(); fbL.gain.value = 0.28;
    const fbR = ctx.createGain(); fbR.gain.value = 0.26;
    const panL = makePanner(ctx, -0.68);
    const panR = makePanner(ctx, 0.68);
    const dlyReturn = ctx.createGain(); dlyReturn.gain.value = 0.34;

    // 5. Music chain: musicIn + reverb + delay -> warm soft saturator -> glue compressor -> sidechain duck -> master -> dest
    this.musicIn = ctx.createGain();
    this.musicRevSend = ctx.createGain(); this.musicRevSend.gain.value = 0.34;
    this.musicDlySend = ctx.createGain(); this.musicDlySend.gain.value = 0.9;

    const musicSum = ctx.createGain();
    const musicWarm = ctx.createWaveShaper();
    musicWarm.curve = makeSoftCurve(1.32) as Float32Array<ArrayBuffer>;
    musicWarm.oversample = 'none';

    const musicComp = ctx.createDynamicsCompressor();
    musicComp.threshold.value = -14;
    musicComp.knee.value = 12;
    musicComp.ratio.value = 3.2;
    musicComp.attack.value = 0.008;
    musicComp.release.value = 0.18;

    this.musicDuck = ctx.createGain();
    this.musicDuck.gain.value = 1;
    this.musicMaster = ctx.createGain();
    this.musicMaster.gain.value = 1;

    // Wire music dry + sends
    this.musicIn.connect(musicSum);
    this.musicRevSend.connect(rev);
    rev.connect(revHp); revHp.connect(revTone);

    const musicRevRet = ctx.createGain(); musicRevRet.gain.value = 0.65;
    revTone.connect(musicRevRet); musicRevRet.connect(musicSum);

    // Wire ping-pong delay
    this.musicDlySend.connect(this.dlyL);
    this.dlyL.connect(dlyLpL); dlyLpL.connect(panL); panL.connect(dlyReturn);
    dlyLpL.connect(fbL); fbL.connect(this.dlyR);
    this.dlyR.connect(dlyLpR); dlyLpR.connect(panR); panR.connect(dlyReturn);
    dlyLpR.connect(fbR); fbR.connect(this.dlyL);
    dlyReturn.connect(musicSum);

    musicSum.connect(musicWarm);
    musicWarm.connect(musicComp);
    musicComp.connect(this.musicDuck);
    this.musicDuck.connect(this.musicMaster);
    this.musicMaster.connect(dest);

    // 6. SFX chain: sfxIn + light stone-room reverb send -> protective limiter -> sfxMaster -> dest
    this.sfxIn = ctx.createGain();
    this.sfxRevSend = ctx.createGain(); this.sfxRevSend.gain.value = 0.22;
    const sfxRev = ctx.createConvolver();
    sfxRev.buffer = makeHallImpulse(ctx, 0.95);
    const sfxRevLp = ctx.createBiquadFilter(); sfxRevLp.type = 'lowpass'; sfxRevLp.frequency.value = 3000;
    const sfxSum = ctx.createGain();
    const sfxLim = ctx.createDynamicsCompressor();
    sfxLim.threshold.value = -10;
    sfxLim.knee.value = 8;
    sfxLim.ratio.value = 5.5;
    sfxLim.attack.value = 0.003;
    sfxLim.release.value = 0.11;
    this.sfxMaster = ctx.createGain();
    this.sfxMaster.gain.value = 0.95;

    this.sfxIn.connect(sfxSum);
    this.sfxRevSend.connect(sfxRev); sfxRev.connect(sfxRevLp); sfxRevLp.connect(sfxSum);
    sfxSum.connect(sfxLim);
    sfxLim.connect(this.sfxMaster);
    this.sfxMaster.connect(dest);

    this.allNodes.push(
      this.musicIn, this.musicRevSend, this.musicDlySend, musicSum, musicWarm, musicComp,
      this.musicDuck, this.musicMaster, rev, revHp, revTone, musicRevRet,
      this.dlyL, this.dlyR, dlyLpL, dlyLpR, fbL, fbR, panL, panR, dlyReturn,
      this.sfxIn, this.sfxRevSend, sfxRev, sfxRevLp, sfxSum, sfxLim, this.sfxMaster,
    );
  }

  wave(name: WaveName): PeriodicWave {
    return this.waves[name];
  }

  /** Sync stereo ping-pong delay to the active track's tempo (dotted 8th L, quarter R). */
  setTempo(spb: number): void {
    if (this.disposed) return;
    const now = this.ctx.currentTime;
    const tL = Math.max(0.12, Math.min(0.65, spb * 0.75));
    const tR = Math.max(0.16, Math.min(0.85, spb * 0.5));
    this.dlyL.delayTime.setTargetAtTime(tL, now, 0.2);
    this.dlyR.delayTime.setTargetAtTime(tR, now, 0.2);
  }

  /** Briefly duck the music bus under dramatic combat impacts (explosions, boss roars, second wind). */
  duckMusic(depth = 0.55, holdS = 0.28): void {
    if (this.disposed) return;
    const now = this.ctx.currentTime;
    const g = this.musicDuck.gain;
    g.cancelScheduledValues(now);
    g.setValueAtTime(Math.max(0.1, g.value), now);
    g.linearRampToValueAtTime(Math.max(0.18, Math.min(1, depth)), now + 0.018);
    g.setTargetAtTime(1, now + 0.02 + holdS * 0.35, holdS * 0.45);
  }

  /** Create a stereo panner node (gracefully falls back to a Unity GainNode on legacy WebAudio). */
  panner(pan: number): AudioNode {
    return makePanner(this.ctx, pan);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const n of this.allNodes) {
      try { n.disconnect(); } catch { /* already disconnected */ }
    }
    this.allNodes.length = 0;
  }
}

export function makePanner(ctx: BaseAudioContext, pan: number): AudioNode {
  const clamped = Math.max(-1, Math.min(1, pan));
  if (typeof ctx.createStereoPanner === 'function') {
    const p = ctx.createStereoPanner();
    p.pan.value = clamped;
    return p;
  }
  return ctx.createGain();
}

function makeWave(ctx: BaseAudioContext, harmonics: number[]): PeriodicWave {
  const real = new Float32Array(harmonics.length);
  const imag = new Float32Array(harmonics.length);
  for (let i = 1; i < harmonics.length; i++) imag[i] = harmonics[i];
  return ctx.createPeriodicWave(real, imag, { disableNormalization: false });
}

function makeSoftCurve(drive: number): Float32Array {
  const n = 2048;
  const curve = new Float32Array(n);
  const norm = Math.tanh(drive);
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / (n - 1) - 1;
    curve[i] = Math.tanh(x * drive) / norm;
  }
  return curve;
}

/** Deterministic PRNG for noise & hall impulse generation (identical across runs & offline tests). */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return (s / 0xffffffff) * 2 - 1;
  };
}

function makeNoiseBuffer(ctx: BaseAudioContext, seconds: number, pink: boolean): AudioBuffer {
  const len = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  const rnd = lcg(pink ? 0x51a97f31 : 0x243f6a88);
  if (!pink) {
    for (let i = 0; i < len; i++) d[i] = rnd();
    return buf;
  }
  // Paul Kellet 3-pole pinking approximation
  let b0 = 0, b1 = 0, b2 = 0, peak = 0.001;
  for (let i = 0; i < len; i++) {
    const w = rnd();
    b0 = 0.99765 * b0 + w * 0.0990460;
    b1 = 0.96300 * b1 + w * 0.2965164;
    b2 = 0.57000 * b2 + w * 1.0526913;
    const v = b0 + b1 + b2 + w * 0.1848;
    d[i] = v;
    if (Math.abs(v) > peak) peak = Math.abs(v);
  }
  const inv = 0.92 / peak;
  for (let i = 0; i < len; i++) d[i] *= inv;
  return buf;
}

/**
 * Synthesizes a warm stereo stone-hall convolution impulse response:
 * - Asymmetric early reflections (12-68 ms) for authentic dungeon width
 * - Progressive high-frequency air damping across the decay tail
 */
function makeHallImpulse(ctx: BaseAudioContext, seconds: number): AudioBuffer {
  const sr = ctx.sampleRate;
  const len = Math.max(256, Math.floor(sr * seconds));
  const buf = ctx.createBuffer(2, len, sr);
  const tapsL = [[0.013, 0.52], [0.024, -0.41], [0.039, 0.32], [0.056, -0.24], [0.071, 0.18]];
  const tapsR = [[0.016, -0.48], [0.029, 0.39], [0.044, -0.30], [0.062, 0.23], [0.079, -0.16]];

  for (let ch = 0; ch < 2; ch++) {
    const out = buf.getChannelData(ch);
    const rnd = lcg(ch === 0 ? 0x13579bdf : 0x2468ace1);
    const taps = ch === 0 ? tapsL : tapsR;
    for (const [sec, amp] of taps) {
      const idx = Math.floor(sec * sr);
      if (idx < len) out[idx] += amp;
    }
    let lp = 0;
    const preDelay = Math.floor(0.018 * sr);
    for (let i = preDelay; i < len; i++) {
      const k = (i - preDelay) / (len - preDelay);
      const env = Math.pow(1 - k, 2.75) * (1 - Math.exp(-(i - preDelay) / (0.012 * sr)));
      // Progressive lowpass: starts bright, darkens smoothly over tail
      const alpha = 0.52 - 0.44 * k;
      lp += alpha * (rnd() - lp);
      out[i] += lp * env * 0.42;
    }
    // Normalize channel so convolution stays predictable
    let peak = 0.001;
    for (let i = 0; i < len; i++) if (Math.abs(out[i]) > peak) peak = Math.abs(out[i]);
    const scale = 0.62 / peak;
    for (let i = 0; i < len; i++) out[i] *= scale;
  }
  return buf;
}
