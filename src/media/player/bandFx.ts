/**
 * Optional master-bus band FX for music games (MusicFx.bands / flow / beatS), built lazily the first time a game asks.
 *
 * input → 3-way Linkwitz-Riley (LR4) crossover at 150 Hz / 2 kHz → per-band gains → sum → output, plus two flow sends:
 *  - echo: mids + highs only → tempo-synced delay (¾ beat) with a 5 kHz lowpass in a 0.35 feedback loop;
 *  - reverb: a cheap algorithmic room (4 parallel damped feedback delays, 29/37/43/53 ms, fb 0.7).
 * Crossover: low = LP150²·AP2k, mid = HP150²·LP2k², high = HP150²·HP2k². LR4 low + high pairs sum to a 2nd-order
 * allpass, so the three bands sum flat (magnitude) at unity gains: 9 biquads. Sends are disconnected while flow is 0
 * (after the tails ring out) so the effects cost nothing when unused. Works on any BaseAudioContext (iPad Safari too).
 */
export const CROSSOVER_HZ = [150, 2000] as const;
export const ECHO = { feedback: 0.35, lowpassHz: 5000, send: 0.25, maxS: 1.9 } as const;
export const REVERB = { delaysMs: [29, 37, 43, 53], feedback: 0.7, dampHz: 4200, send: 0.15 } as const;
/** Smoothing time constant for gain changes and the smallest change worth sending. */
export const GAIN_TAU = 0.04, MIN_STEP = 0.005;
/**
 * Butterworth (Q = 1/√2) per the Web Audio spec: lowpass / highpass Q is in dB (α = sin ω0 / (2·10^(Q/20))), allpass Q is
 * linear. Getting this wrong leaves the bands summing ~1.7 dB hot.
 */
export const BUTTERWORTH_Q = { pass: 20 * Math.log10(Math.SQRT1_2), allpass: Math.SQRT1_2 } as const;
const TAIL_S = 4;

const clamp = (x: number, a: number, b: number) => (Number.isFinite(x) ? Math.max(a, Math.min(b, x)) : a);

export class BandFx {
  readonly input: GainNode; readonly output: GainNode; private mix: GainNode;
  readonly gains: [GainNode, GainNode, GainNode];
  readonly filters: BiquadFilterNode[] = [];
  private echoSend: GainNode; private echoDelay: DelayNode; private echoWet: GainNode;
  private revSend: GainNode; private revWet: GainNode;
  private values: [number, number, number] = [1, 1, 1];
  private flowV = 0; private beatS = 0;
  private sendsOn = false; private quietSince = 0;
  constructor(private ctx: BaseAudioContext) {
    const c = ctx;
    this.input = c.createGain(); this.output = c.createGain(); this.mix = c.createGain();
    this.mix.connect(this.output);
    const bq = (type: BiquadFilterType, f: number) => {
      const n = c.createBiquadFilter(); n.type = type; n.frequency.value = f; n.Q.value = type === 'allpass' ? BUTTERWORTH_Q.allpass : BUTTERWORTH_Q.pass; this.filters.push(n); return n;
    };
    const [a, b] = CROSSOVER_HZ;
    this.gains = [c.createGain(), c.createGain(), c.createGain()];
    // low: LP a ×2 → allpass b (phase match for the b split)
    this.input.connect(bq('lowpass', a)).connect(bq('lowpass', a)).connect(bq('allpass', b)).connect(this.gains[0]);
    // the rest: HP a ×2, then split at b
    const hp = this.input.connect(bq('highpass', a)).connect(bq('highpass', a));
    hp.connect(bq('lowpass', b)).connect(bq('lowpass', b)).connect(this.gains[1]);
    hp.connect(bq('highpass', b)).connect(bq('highpass', b)).connect(this.gains[2]);
    for (const g of this.gains) g.connect(this.mix);

    // echo: mids + highs
    this.echoSend = c.createGain(); this.echoSend.gain.value = 0;
    this.echoDelay = c.createDelay(2); this.echoDelay.delayTime.value = 0.375;
    const echoLp = c.createBiquadFilter(); echoLp.type = 'lowpass'; echoLp.frequency.value = ECHO.lowpassHz; echoLp.Q.value = BUTTERWORTH_Q.pass;
    const echoFb = c.createGain(); echoFb.gain.value = ECHO.feedback;
    this.echoWet = c.createGain(); this.echoWet.gain.value = 1;
    this.echoSend.connect(this.echoDelay).connect(echoLp).connect(echoFb).connect(this.echoDelay);
    echoLp.connect(this.echoWet);

    // reverb: parallel damped combs on the whole (ducked) mix
    this.revSend = c.createGain(); this.revSend.gain.value = 0;
    this.revWet = c.createGain(); this.revWet.gain.value = 1 / REVERB.delaysMs.length;
    for (const ms of REVERB.delaysMs) {
      const d = c.createDelay(0.1); d.delayTime.value = ms / 1000;
      const damp = c.createBiquadFilter(); damp.type = 'lowpass'; damp.frequency.value = REVERB.dampHz; damp.Q.value = BUTTERWORTH_Q.pass;
      const fb = c.createGain(); fb.gain.value = REVERB.feedback;
      this.revSend.connect(d).connect(damp).connect(fb).connect(d);
      damp.connect(this.revWet);
    }
  }

  /** Band gains (linear, 0..1.5), flow wet 0..1 and the beat length (s) for the echo. */
  set(bands: readonly number[] | undefined, flow: number | undefined, beatS: number | undefined): void {
    const now = this.ctx.currentTime;
    const want = [0, 1, 2].map((i) => clamp(bands?.[i] ?? 1, 0, 1.5));
    want.forEach((v, i) => {
      if (Math.abs(v - this.values[i]) < MIN_STEP) return;
      this.values[i] = v; this.gains[i].gain.setTargetAtTime(v, now, GAIN_TAU);
    });
    const f = clamp(flow ?? 0, 0, 1);
    if (beatS !== undefined && beatS > 0) {
      const d = clamp(0.75 * beatS, 0.05, ECHO.maxS);
      if (Math.abs(d - this.beatS) > 0.01) { this.beatS = d; this.echoDelay.delayTime.setTargetAtTime(d, now, 0.1); }
    }
    if (f > 0 && !this.sendsOn) this.connectSends(true);
    if (Math.abs(f - this.flowV) >= MIN_STEP || (f === 0 && this.flowV !== 0)) {
      this.flowV = f;
      this.echoSend.gain.setTargetAtTime(ECHO.send * f, now, GAIN_TAU);
      this.revSend.gain.setTargetAtTime(REVERB.send * f, now, GAIN_TAU);
      if (f === 0) this.quietSince = now;
    }
    if (this.sendsOn && this.flowV === 0 && now - this.quietSince > TAIL_S) this.connectSends(false);
  }
  /** Whether the flow sends are wired (for tests / debug). */
  get sendsConnected() { return this.sendsOn; }
  get bandValues(): readonly number[] { return this.values; }

  private connectSends(on: boolean) {
    this.sendsOn = on;
    if (on) {
      this.gains[1].connect(this.echoSend); this.gains[2].connect(this.echoSend); this.mix.connect(this.revSend);
      this.echoWet.connect(this.output); this.revWet.connect(this.output);
    } else {
      try { this.gains[1].disconnect(this.echoSend); this.gains[2].disconnect(this.echoSend); this.mix.disconnect(this.revSend); } catch { /* already */ }
      try { this.echoWet.disconnect(); this.revWet.disconnect(); } catch { /* already */ }
    }
  }
  dispose(): void { try { this.input.disconnect(); this.output.disconnect(); } catch { /* already */ } }
}
