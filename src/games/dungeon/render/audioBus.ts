// Shared studio DSP rack, pre-rendered Karplus-Strong plucked-string bank, and harmonic wavetables
// for Purgatour's music and SFX. Works identically on live AudioContext and OfflineAudioContext.
// Safe to import in Node: allocates zero WebAudio resources until constructed.

export type WaveName = 'lute' | 'organ' | 'brass' | 'harpsi' | 'lead' | 'fiddle' | 'reed' | 'flute' | 'guitar';
export type PluckKind = 'lute' | 'harp' | 'harpsi' | 'oud' | 'chug';

interface PluckAnchor {
  freq: number;
  buffer: AudioBuffer;
}

export class DungeonAudioBus {
  readonly ctx: BaseAudioContext;
  readonly musicIn: GainNode;
  readonly musicRoomSend: GainNode;
  readonly musicRevSend: GainNode;
  readonly musicDlySend: GainNode;
  readonly sfxIn: GainNode;
  readonly sfxRevSend: GainNode;
  readonly whiteNoise: AudioBuffer;
  readonly pinkNoise: AudioBuffer;
  readonly ampCurve: Float32Array<ArrayBuffer>;
  readonly crunchCurve: Float32Array<ArrayBuffer>;

  private readonly musicTone: BiquadFilterNode;
  private readonly musicDuck: GainNode;
  private readonly musicMaster: GainNode;
  private readonly sfxMaster: GainNode;
  private readonly dlyL: DelayNode;
  private readonly dlyR: DelayNode;
  private readonly allNodes: AudioNode[] = [];
  private readonly waves: Record<WaveName, PeriodicWave>;
  private readonly plucks: Record<PluckKind, PluckAnchor[]>;
  private disposed = false;

  constructor(ctx: BaseAudioContext, dest: AudioNode, sharedWhiteNoise?: AudioBuffer) {
    this.ctx = ctx;

    // 1. Shared noise buffers (white for transients/snares/hats, pink for organic fire/wind/rumbles)
    this.whiteNoise = sharedWhiteNoise ?? makeNoiseBuffer(ctx, 1.0, false);
    this.pinkNoise = makeNoiseBuffer(ctx, 1.2, true);
    this.ampCurve = makeAmpCurve(5.2) as Float32Array<ArrayBuffer>;
    this.crunchCurve = makeAmpCurve(3.4) as Float32Array<ArrayBuffer>;

    // 2. Cached PeriodicWaves (computed once per AudioContext)
    this.waves = {
      lute: makeWave(ctx, [0, 1.0, 0.72, 0.48, 0.28, 0.16, 0.09, 0.05, 0.025]),
      organ: makeWave(ctx, [0, 1.0, 0.85, 0.68, 0.56, 0.26, 0.4, 0.1, 0.32, 0.05, 0.14, 0.03, 0.1]),
      brass: makeWave(ctx, [0, 0.88, 1.0, 0.88, 0.68, 0.5, 0.36, 0.25, 0.17, 0.11, 0.06, 0.03]),
      harpsi: makeWave(ctx, [0, 0.65, 0.96, 0.9, 0.76, 0.62, 0.5, 0.4, 0.3, 0.22, 0.15, 0.1]),
      lead: makeWave(ctx, [0, 1.0, 0.68, 0.56, 0.36, 0.26, 0.18, 0.11, 0.06]),
      fiddle: makeWave(ctx, [0, 0.92, 1.0, 0.84, 0.72, 0.54, 0.42, 0.32, 0.24, 0.18, 0.13, 0.09, 0.06]),
      reed: makeWave(ctx, [0, 0.78, 0.42, 1.0, 0.34, 0.72, 0.24, 0.48, 0.16, 0.28, 0.1]),
      flute: makeWave(ctx, [0, 1.0, 0.34, 0.12, 0.04, 0.015]),
      guitar: makeWave(ctx, [0, 0.85, 1.0, 0.92, 0.78, 0.64, 0.5, 0.38, 0.28, 0.2, 0.14, 0.09]),
    };

    // 3. Pre-rendered Karplus-Strong physical-model plucked string buffers (multi-sampled in fifths)
    this.plucks = {
      lute: buildPluckBank(ctx, [48, 55, 62, 69], { sec: 1.45, damp: 0.44, decay: 0.9962, pickFrac: 0.22, bodyHz: 235, bodyGain: 0.28, bright: 0.78, seed: 101 }),
      harp: buildPluckBank(ctx, [55, 62, 69, 76], { sec: 2.0, damp: 0.34, decay: 0.9978, pickFrac: 0.42, bodyHz: 310, bodyGain: 0.18, bright: 0.86, seed: 202 }),
      harpsi: buildPluckBank(ctx, [50, 57, 64, 71], { sec: 1.25, damp: 0.2, decay: 0.996, pickFrac: 0.12, bodyHz: 680, bodyGain: 0.22, bright: 0.98, seed: 303 }),
      oud: buildPluckBank(ctx, [48, 55, 62, 69], { sec: 1.35, damp: 0.38, decay: 0.9955, pickFrac: 0.18, bodyHz: 390, bodyGain: 0.32, bright: 0.88, seed: 404 }),
      chug: buildPluckBank(ctx, [36, 43, 50], { sec: 0.42, damp: 0.62, decay: 0.988, pickFrac: 0.16, bodyHz: 185, bodyGain: 0.24, bright: 0.92, seed: 505 }),
    };

    // 4. Dual stereo acoustic spaces: tight stone studio room (drums/plucks) + lush cathedral hall (strings/brass/leads)
    const roomRev = ctx.createConvolver();
    roomRev.buffer = makeHallImpulse(ctx, 0.54, true);
    const roomHp = ctx.createBiquadFilter(); roomHp.type = 'highpass'; roomHp.frequency.value = 180;
    const roomLp = ctx.createBiquadFilter(); roomLp.type = 'lowpass'; roomLp.frequency.value = 5400;
    const roomRet = ctx.createGain(); roomRet.gain.value = 0.46;

    const hallRev = ctx.createConvolver();
    hallRev.buffer = makeHallImpulse(ctx, 2.05, false);
    const hallHp = ctx.createBiquadFilter(); hallHp.type = 'highpass'; hallHp.frequency.value = 230;
    const hallLp = ctx.createBiquadFilter(); hallLp.type = 'lowpass'; hallLp.frequency.value = 4200;
    const hallRet = ctx.createGain(); hallRet.gain.value = 0.54;

    // 5. Focused stereo ping-pong delay (reserved for leads, harps, bells — never smeared by ostinatos)
    this.dlyL = ctx.createDelay(1.2);
    this.dlyR = ctx.createDelay(1.2);
    this.dlyL.delayTime.value = 0.36;
    this.dlyR.delayTime.value = 0.24;
    const dlyHp = ctx.createBiquadFilter(); dlyHp.type = 'highpass'; dlyHp.frequency.value = 340;
    const dlyLpL = ctx.createBiquadFilter(); dlyLpL.type = 'lowpass'; dlyLpL.frequency.value = 2800;
    const dlyLpR = ctx.createBiquadFilter(); dlyLpR.type = 'lowpass'; dlyLpR.frequency.value = 2350;
    const fbL = ctx.createGain(); fbL.gain.value = 0.22;
    const fbR = ctx.createGain(); fbR.gain.value = 0.2;
    const panL = makePanner(ctx, -0.78);
    const panR = makePanner(ctx, 0.78);
    const dlyReturn = ctx.createGain(); dlyReturn.gain.value = 0.3;

    // 6. Studio Mastering Music Chain (unity gain through EQ + saturator + glue comp; master volume applied AFTER!)
    this.musicIn = ctx.createGain();
    this.musicRoomSend = ctx.createGain(); this.musicRoomSend.gain.value = 0.36;
    this.musicRevSend = ctx.createGain(); this.musicRevSend.gain.value = 0.34;
    this.musicDlySend = ctx.createGain(); this.musicDlySend.gain.value = 0.72;

    const musicSum = ctx.createGain();
    const musicHp = ctx.createBiquadFilter(); musicHp.type = 'highpass'; musicHp.frequency.value = 46; musicHp.Q.value = 0.7;
    const eqSub = ctx.createBiquadFilter(); eqSub.type = 'lowshelf'; eqSub.frequency.value = 115; eqSub.gain.value = -4.2;
    const eqMud = ctx.createBiquadFilter(); eqMud.type = 'peaking'; eqMud.frequency.value = 260; eqMud.Q.value = 1.05; eqMud.gain.value = -3.0;
    const eqPres = ctx.createBiquadFilter(); eqPres.type = 'peaking'; eqPres.frequency.value = 2700; eqPres.Q.value = 0.8; eqPres.gain.value = 3.8;
    const eqAir = ctx.createBiquadFilter(); eqAir.type = 'highshelf'; eqAir.frequency.value = 5800; eqAir.gain.value = 4.2;

    this.musicTone = ctx.createBiquadFilter();
    this.musicTone.type = 'lowpass';
    this.musicTone.frequency.value = 18500;
    this.musicTone.Q.value = 0.75;

    const musicWarm = ctx.createWaveShaper();
    musicWarm.curve = makeSoftCurve(1.48) as Float32Array<ArrayBuffer>;
    musicWarm.oversample = 'none';

    const musicComp = ctx.createDynamicsCompressor();
    musicComp.threshold.value = -16;
    musicComp.knee.value = 10;
    musicComp.ratio.value = 3.4;
    musicComp.attack.value = 0.012;
    musicComp.release.value = 0.16;

    this.musicDuck = ctx.createGain();
    this.musicDuck.gain.value = 1;
    this.musicMaster = ctx.createGain();
    this.musicMaster.gain.value = 0.42;

    const musicLim = ctx.createDynamicsCompressor();
    musicLim.threshold.value = -1.5;
    musicLim.knee.value = 2;
    musicLim.ratio.value = 14;
    musicLim.attack.value = 0.002;
    musicLim.release.value = 0.06;

    // Wire music dry + dual reverbs + delay -> mastering rack
    this.musicIn.connect(musicSum);
    this.musicRoomSend.connect(roomRev); roomRev.connect(roomHp); roomHp.connect(roomLp); roomLp.connect(roomRet); roomRet.connect(musicSum);
    this.musicRevSend.connect(hallRev); hallRev.connect(hallHp); hallHp.connect(hallLp); hallLp.connect(hallRet); hallRet.connect(musicSum);

    this.musicDlySend.connect(dlyHp);
    dlyHp.connect(this.dlyL);
    this.dlyL.connect(dlyLpL); dlyLpL.connect(panL); panL.connect(dlyReturn);
    dlyLpL.connect(fbL); fbL.connect(this.dlyR);
    this.dlyR.connect(dlyLpR); dlyLpR.connect(panR); panR.connect(dlyReturn);
    dlyLpR.connect(fbR); fbR.connect(this.dlyL);
    dlyReturn.connect(musicSum);

    musicSum.connect(musicHp);
    musicHp.connect(eqSub);
    eqSub.connect(eqMud);
    eqMud.connect(eqPres);
    eqPres.connect(eqAir);
    eqAir.connect(this.musicTone);
    this.musicTone.connect(musicWarm);
    musicWarm.connect(musicComp);
    musicComp.connect(this.musicDuck);
    this.musicDuck.connect(this.musicMaster);
    this.musicMaster.connect(musicLim);
    musicLim.connect(dest);

    // 7. SFX chain: sfxIn + tight stone-room reverb -> protective limiter -> sfxMaster -> dest
    this.sfxIn = ctx.createGain();
    this.sfxRevSend = ctx.createGain(); this.sfxRevSend.gain.value = 0.22;
    const sfxRev = ctx.createConvolver();
    sfxRev.buffer = makeHallImpulse(ctx, 0.9, true);
    const sfxRevLp = ctx.createBiquadFilter(); sfxRevLp.type = 'lowpass'; sfxRevLp.frequency.value = 3200;
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
      this.musicIn, this.musicRoomSend, this.musicRevSend, this.musicDlySend,
      roomRev, roomHp, roomLp, roomRet, hallRev, hallHp, hallLp, hallRet,
      dlyHp, this.dlyL, this.dlyR, dlyLpL, dlyLpR, fbL, fbR, panL, panR, dlyReturn,
      musicSum, musicHp, eqSub, eqMud, eqPres, eqAir, this.musicTone, musicWarm, musicComp, this.musicDuck, this.musicMaster, musicLim,
      this.sfxIn, this.sfxRevSend, sfxRev, sfxRevLp, sfxSum, sfxLim, this.sfxMaster,
    );
  }

  wave(name: WaveName): PeriodicWave {
    return this.waves[name];
  }

  /** Find the nearest Karplus-Strong pre-rendered plucked buffer and exact playback rate for `freq`. */
  pluckSample(kind: PluckKind, freq: number): { buffer: AudioBuffer; playbackRate: number } {
    const bank = this.plucks[kind];
    let best = bank[0];
    let bestRatio = Math.abs(Math.log2(freq / best.freq));
    for (let i = 1; i < bank.length; i++) {
      const r = Math.abs(Math.log2(freq / bank[i].freq));
      if (r < bestRatio) { best = bank[i]; bestRatio = r; }
    }
    return { buffer: best.buffer, playbackRate: Math.max(0.25, Math.min(4, freq / best.freq)) };
  }

  /** Post-mastering music output volume (keeps saturator & compressor properly driven at unity!). */
  setMusicLevel(level: number, tau = 0.25): void {
    if (this.disposed) return;
    this.musicMaster.gain.setTargetAtTime(Math.max(0, level), this.ctx.currentTime, tau);
  }

  /** Dynamically shape overall music brightness (e.g. ~780 Hz muffled low-pass during Skill Tree overlay). */
  setMusicTone(cutoffHz: number, q = 0.75, tau = 0.22): void {
    if (this.disposed) return;
    const now = this.ctx.currentTime;
    const hz = Math.max(240, Math.min(this.ctx.sampleRate * 0.45, cutoffHz));
    this.musicTone.frequency.setTargetAtTime(hz, now, tau);
    this.musicTone.Q.setTargetAtTime(q, now, tau);
  }

  /** Sync stereo ping-pong delay to the active track's tempo (dotted 8th L, 8th R). */
  setTempo(spb: number): void {
    if (this.disposed) return;
    const now = this.ctx.currentTime;
    const tL = Math.max(0.14, Math.min(0.65, spb * 0.75));
    const tR = Math.max(0.12, Math.min(0.55, spb * 0.5));
    this.dlyL.delayTime.setTargetAtTime(tL, now, 0.22);
    this.dlyR.delayTime.setTargetAtTime(tR, now, 0.22);
  }

  /** Briefly duck the music bus under dramatic combat impacts (explosions, boss roars, second wind). */
  duckMusic(depth = 0.56, holdS = 0.28): void {
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

/** Asymmetric tube-amp waveshaper curve: generates rich 2nd + 3rd harmonics for rock/metal guitar leads & chugs. */
function makeAmpCurve(drive: number): Float32Array {
  const n = 2048;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / (n - 1) - 1;
    const asym = x >= 0 ? Math.tanh(x * drive * 1.15) : Math.tanh(x * drive * 0.92) * 0.94;
    curve[i] = asym;
  }
  return curve;
}

/** Deterministic PRNG for noise, Karplus-Strong plucks, and hall impulses. */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return (s / 0xffffffff) * 2 - 1;
  };
}

interface PluckCfg {
  sec: number;
  damp: number;
  decay: number;
  pickFrac: number;
  bodyHz: number;
  bodyGain: number;
  bright: number;
  seed: number;
}

function buildPluckBank(ctx: BaseAudioContext, midis: readonly number[], cfg: PluckCfg): PluckAnchor[] {
  return midis.map((m, idx) => {
    const freq = 440 * Math.pow(2, (m - 69) / 12);
    return { freq, buffer: makeKarplusBuffer(ctx, freq, { ...cfg, seed: cfg.seed + idx * 31 }) };
  });
}

/**
 * Physical-model Karplus-Strong plucked string buffer with:
 * - Pick-position comb notch (authentic string plucking geometry)
 * - Fractional delay-line interpolation (exact pitch tuning)
 * - Frequency-dependent string damping + 2-pole wooden acoustic body resonator
 */
function makeKarplusBuffer(ctx: BaseAudioContext, freq: number, cfg: PluckCfg): AudioBuffer {
  const sr = ctx.sampleRate;
  const len = Math.max(512, Math.floor(sr * cfg.sec));
  const buf = ctx.createBuffer(1, len, sr);
  const out = buf.getChannelData(0);
  const rnd = lcg(cfg.seed);

  const periodF = Math.max(8, sr / freq);
  const pInt = Math.floor(periodF);
  const pFrac = periodF - pInt;
  const ring = new Float32Array(pInt + 4);
  const pickDelay = Math.max(1, Math.min(pInt - 1, Math.round(pInt * cfg.pickFrac)));

  // Colored noise pick excitation with comb-filtered pick position
  const raw = new Float32Array(pInt + 2);
  let lpEx = 0;
  for (let i = 0; i < raw.length; i++) {
    const w = rnd();
    lpEx += cfg.bright * (w - lpEx);
    raw[i] = lpEx;
  }
  let mean = 0;
  for (let i = 0; i < pInt; i++) {
    const comb = raw[i] - (i >= pickDelay ? raw[i - pickDelay] * 0.65 : 0);
    ring[i] = comb;
    mean += comb;
  }
  mean /= pInt;
  for (let i = 0; i < pInt; i++) ring[i] -= mean;

  // 2-pole resonant acoustic wood body filter
  const w0 = (2 * Math.PI * cfg.bodyHz) / sr;
  const rBody = Math.exp(-Math.PI * (cfg.bodyHz * 0.45) / sr);
  const a1 = -2 * rBody * Math.cos(w0);
  const a2 = rBody * rBody;
  let by1 = 0, by2 = 0, bx1 = 0;

  // Higher pitches decay slightly faster per sample to keep uniform musical ring time
  const freqDecay = Math.pow(cfg.decay, Math.pow(freq / 220, 0.35));
  let idx = 0, prev = ring[pInt - 1], peak = 0.001;

  for (let i = 0; i < len; i++) {
    const nextIdx = (idx + 1) % pInt;
    const s0 = ring[idx];
    const s1 = ring[nextIdx];
    const interp = s0 * (1 - pFrac) + s1 * pFrac;
    const filtered = ((1 - cfg.damp) * interp + cfg.damp * prev) * freqDecay;
    prev = interp;
    ring[idx] = filtered;
    idx = nextIdx;

    // Resonant wood body contribution
    const body = (filtered - bx1) * 0.35 - a1 * by1 - a2 * by2;
    bx1 = filtered; by2 = by1; by1 = body;
    const sample = filtered + body * cfg.bodyGain;
    out[i] = sample;
    const a = Math.abs(sample);
    if (a > peak) peak = a;
  }

  // Smooth fade-out tail (last 40 ms) and normalize to 0.92
  const fadeN = Math.min(len, Math.floor(sr * 0.04));
  const inv = 0.92 / peak;
  for (let i = 0; i < len; i++) {
    const tail = i > len - fadeN ? (len - i) / fadeN : 1;
    out[i] *= inv * tail;
  }
  return buf;
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
  let b0 = 0, b1 = 0, b2 = 0, peak = 0.001;
  for (let i = 0; i < len; i++) {
    const w = rnd();
    b0 = 0.99765 * b0 + w * 0.099046;
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
 * Synthesizes a stereo acoustic convolution impulse response:
 * - `tight = true`: compact stone studio room (fast early reflections, crisp 0.54 s decay for drums/plucks)
 * - `tight = false`: wide cathedral/stone hall (decorrelated Haas early reflections, silky 2.05 s tail)
 */
function makeHallImpulse(ctx: BaseAudioContext, seconds: number, tight: boolean): AudioBuffer {
  const sr = ctx.sampleRate;
  const len = Math.max(256, Math.floor(sr * seconds));
  const buf = ctx.createBuffer(2, len, sr);
  const tapsL = tight
    ? [[0.007, 0.58], [0.015, -0.44], [0.024, 0.3], [0.036, -0.18]]
    : [[0.014, 0.55], [0.026, -0.42], [0.041, 0.34], [0.062, -0.25], [0.085, 0.18]];
  const tapsR = tight
    ? [[0.009, -0.54], [0.019, 0.4], [0.029, -0.28], [0.042, 0.16]]
    : [[0.019, -0.5], [0.033, 0.4], [0.052, -0.32], [0.074, 0.24], [0.096, -0.16]];

  for (let ch = 0; ch < 2; ch++) {
    const out = buf.getChannelData(ch);
    const rnd = lcg((ch === 0 ? 0x13579bdf : 0x2468ace1) ^ (tight ? 0x77 : 0));
    const taps = ch === 0 ? tapsL : tapsR;
    for (const [sec, amp] of taps) {
      const idx = Math.floor(sec * sr);
      if (idx < len) out[idx] += amp;
    }
    let lp = 0;
    const preDelay = Math.floor((tight ? 0.008 : 0.022) * sr);
    for (let i = preDelay; i < len; i++) {
      const k = (i - preDelay) / (len - preDelay);
      const env = Math.pow(1 - k, tight ? 2.4 : 2.9) * (1 - Math.exp(-(i - preDelay) / ((tight ? 0.006 : 0.015) * sr)));
      const alpha = (tight ? 0.68 : 0.56) - (tight ? 0.42 : 0.46) * k;
      lp += alpha * (rnd() - lp);
      out[i] += lp * env * (tight ? 0.38 : 0.44);
    }
    let peak = 0.001;
    for (let i = 0; i < len; i++) if (Math.abs(out[i]) > peak) peak = Math.abs(out[i]);
    const scale = 0.62 / peak;
    for (let i = 0; i < len; i++) out[i] *= scale;
  }
  return buf;
}
