import { SmoothedPosition } from '../clock';
import { autoAt, progTime, rateAt, songTime, type MixPlan, type PlanEntry } from '../mix/plan';
import { encodeWav } from './wav';

/**
 * Plays a MixPlan on DJ-style decks (browser only). Each deck: <audio> → MediaElementSource → 3-band EQ →
 * gain → master; an echo send for echo-outs. The program clock runs on the AudioContext clock and every
 * deck is slaved to it (hard seek when far off, a tiny rate nudge when close), so overlapping songs stay
 * beat-locked. A stalled deck that owns the program freezes the clock until it plays again.
 */
export interface EngineOpts {
  resolveUrl(id: string): Promise<string>;
  ctx?: AudioContext;
  /** Extra output-latency calibration in seconds (Settings). */
  latencyS?: () => number;
}
export type EngineState = 'idle' | 'starting' | 'playing' | 'paused' | 'ended';

const PRELOAD_S = 8, TICK_MS = 25, HARD_SEEK_S = 0.15, NUDGE = 0.6, MAX_NUDGE = 0.04;

class Deck {
  readonly el: HTMLAudioElement;
  readonly low: BiquadFilterNode; readonly mid: BiquadFilterNode; readonly high: BiquadFilterNode;
  readonly gain: GainNode; readonly echoSend: GainNode; readonly delay: DelayNode; readonly feedback: GainNode;
  entry = -1; id = ''; loading: Promise<void> | null = null; settleUntil = 0; echoFired = false; wantPlay = false;
  readonly smooth = new SmoothedPosition();
  constructor(private ctx: AudioContext, dest: AudioNode) {
    const el = new Audio();
    el.preload = 'auto'; el.crossOrigin = 'anonymous'; el.setAttribute('playsinline', '');
    (el as any).preservesPitch = true; (el as any).webkitPreservesPitch = true;
    this.el = el;
    const src = ctx.createMediaElementSource(el);
    this.low = Object.assign(ctx.createBiquadFilter(), { type: 'lowshelf' }); this.low.frequency.value = 180;
    this.mid = Object.assign(ctx.createBiquadFilter(), { type: 'peaking' }); this.mid.frequency.value = 1000; this.mid.Q.value = 0.7;
    this.high = Object.assign(ctx.createBiquadFilter(), { type: 'highshelf' }); this.high.frequency.value = 4500;
    this.gain = ctx.createGain(); this.gain.gain.value = 0;
    src.connect(this.low).connect(this.mid).connect(this.high).connect(this.gain).connect(dest);
    this.echoSend = ctx.createGain(); this.echoSend.gain.value = 0;
    this.delay = ctx.createDelay(2); this.feedback = ctx.createGain(); this.feedback.gain.value = 0.45;
    const wet = ctx.createGain(); wet.gain.value = 0.7;
    this.high.connect(this.echoSend).connect(this.delay).connect(this.feedback).connect(this.delay);
    this.delay.connect(wet).connect(dest);
  }
  /** Song time, smoothed against the AudioContext clock (Safari's currentTime is steppy). */
  time(): number { return this.smooth.update(this.el.currentTime, this.ctx.currentTime, this.el.playbackRate, !this.el.paused); }
  ready(): boolean { return this.el.readyState >= 3 && !this.el.seeking; }
  seek(s: number, now: number) { try { this.el.currentTime = Math.max(0, s); } catch { /* not seekable yet */ } this.smooth.reset(); this.settleUntil = now + 0.35; }
  set(param: AudioParam, v: number) { param.setTargetAtTime(v, this.ctx.currentTime, 0.02); }
  release() { this.el.pause(); this.wantPlay = false; this.entry = -1; this.id = ''; this.echoFired = false; this.set(this.gain.gain, 0); }
}

export class MixEngine {
  readonly ctx: AudioContext;
  private master: GainNode;
  private decks: Deck[] = [];
  private plan: MixPlan | null = null;
  private state: EngineState = 'idle';
  private anchorP = 0; private anchorCtx = 0; private frozen = true;
  private timer: ReturnType<typeof setInterval> | null = null;
  private endedCbs = new Set<() => void>();
  private blessed = false;
  lastError = '';

  constructor(private o: EngineOpts) {
    const Ctx: typeof AudioContext = (globalThis as any).AudioContext ?? (globalThis as any).webkitAudioContext;
    this.ctx = o.ctx ?? new Ctx({ latencyHint: 'playback' });
    this.master = this.ctx.createGain();
    this.master.connect(this.ctx.destination);
    for (let i = 0; i < 3; i++) this.decks.push(new Deck(this.ctx, this.master));
  }

  /** Call from a user gesture (tap/key): resumes audio and "blesses" the decks so iOS lets them play later. */
  unlock(): void {
    void this.ctx.resume().catch(() => {});
    if (this.blessed) return;
    this.blessed = true;
    const url = URL.createObjectURL(new Blob([encodeWav(new Float32Array(800), 8000) as BlobPart], { type: 'audio/wav' }));
    for (const d of this.decks) { d.el.src = url; d.el.play().then(() => d.el.pause()).catch(() => {}); }
  }

  load(plan: MixPlan): void { this.stop(); this.plan = plan; this.state = 'idle'; }
  getState(): EngineState { return this.state; }
  playing(): boolean { return this.state === 'playing' && !this.frozen; }
  onEnded(cb: () => void): () => void { this.endedCbs.add(cb); return () => { this.endedCbs.delete(cb); }; }
  setVolume(v: number): void { this.master.gain.setTargetAtTime(Math.max(0, Math.min(1, v)), this.ctx.currentTime, 0.05); }

  /** Program position the rider is *hearing* (output latency and calibration removed), or null before it starts. */
  positionS(): number | null {
    if (this.state !== 'playing' && this.state !== 'paused') return null;
    const lat = ((this.ctx as any).outputLatency ?? this.ctx.baseLatency ?? 0) + (this.o.latencyS?.() ?? 0);
    return Math.max(0, this.programNow() - lat);
  }

  async start(p0 = 0): Promise<void> {
    if (!this.plan) throw new Error('no plan loaded');
    await this.ctx.resume().catch(() => {});
    this.anchorP = p0; this.frozen = true; this.state = 'starting';
    this.ensureTimer(); this.tick();
  }
  pause(): void {
    if (this.state !== 'playing' && this.state !== 'starting') return;
    this.anchorP = this.programNow(); this.frozen = true; this.state = 'paused';
    for (const d of this.decks) d.el.pause();
  }
  resume(): void { if (this.state === 'paused') { this.state = 'starting'; this.ensureTimer(); this.tick(); } }
  seek(p: number): void { this.anchorP = Math.max(0, p); this.frozen = true; for (const d of this.decks) d.release(); if (this.state === 'playing') this.state = 'starting'; }
  stop(): void {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    for (const d of this.decks) d.release();
    this.state = 'idle'; this.frozen = true; this.anchorP = 0;
  }
  dispose(): void { this.stop(); for (const d of this.decks) { d.el.removeAttribute('src'); d.el.load(); } void this.ctx.close?.().catch(() => {}); }

  debug(): Record<string, number | string | boolean> {
    const p = this.programNow();
    const out: Record<string, number | string | boolean> = { state: this.state, p: +p.toFixed(2), frozen: this.frozen };
    this.decks.forEach((d, i) => { if (d.entry >= 0) out[`deck${i}`] = `#${d.entry} t${d.el.currentTime.toFixed(2)} r${d.el.playbackRate.toFixed(3)} g${d.gain.gain.value.toFixed(2)}${d.ready() ? '' : ' …'}`; });
    if (this.lastError) out.error = this.lastError;
    return out;
  }

  private programNow(): number { return this.frozen ? this.anchorP : this.anchorP + (this.ctx.currentTime - this.anchorCtx); }
  private ensureTimer() { if (!this.timer) this.timer = setInterval(() => this.tick(), TICK_MS); }
  private deckFor(e: PlanEntry): Deck | null {
    const have = this.decks.find((d) => d.entry === e.index);
    if (have) return have;
    const free = this.decks.find((d) => d.entry < 0); if (!free) return null;
    free.entry = e.index; free.id = e.id; free.echoFired = false; free.wantPlay = false;
    free.loading = this.o.resolveUrl(e.id).then((url) => { if (free.entry === e.index) { free.el.src = url; free.el.load(); } })
      .catch((err) => { this.lastError = String(err?.message ?? err); }).finally(() => { free.loading = null; });
    return free;
  }

  private tick(): void {
    const plan = this.plan;
    if (!plan || (this.state !== 'playing' && this.state !== 'starting')) return;
    const now = this.ctx.currentTime;
    const p = this.programNow();
    if (p >= plan.durationS) { this.finish(); return; }
    const owner = plan.entries.find((e) => p >= e.own[0] && p < e.own[1]) ?? plan.entries.find((e) => p >= e.startP && p < e.endP);
    const live = new Set<number>();
    for (const e of plan.entries) {
      if (p < e.startP - PRELOAD_S || p > e.endP + 4) continue;
      const d = this.deckFor(e); if (!d) continue;
      live.add(e.index);
      if (d.loading) continue;
      const inside = p >= e.startP && p < e.endP;
      if (!inside) {
        if (p < e.startP && d.el.paused && d.el.readyState >= 1 && Math.abs(d.el.currentTime - songTime(e.segs, e.startP)) > 0.05) d.seek(songTime(e.segs, e.startP), now);
        if (p >= e.endP) { d.el.pause(); d.wantPlay = false; d.set(d.gain.gain, 0); }
        continue;
      }
      const target = songTime(e.segs, p), rate = rateAt(e.segs, p);
      if (!d.wantPlay || d.el.paused) {
        d.wantPlay = true;
        if (Math.abs(d.el.currentTime - target) > 0.05) d.seek(target + (this.frozen ? 0 : 0.05), now);
        d.el.playbackRate = rate;
        d.el.play().catch((err) => { this.lastError = String(err?.message ?? err); });
      } else if (now >= d.settleUntil && d.ready() && !this.frozen) {
        const err = d.time() - target;
        if (Math.abs(err) > HARD_SEEK_S) d.seek(target, now);
        else d.el.playbackRate = rate * (1 - Math.max(-MAX_NUDGE, Math.min(MAX_NUDGE, NUDGE * err)));
      }
      d.set(d.gain.gain, Math.max(0, autoAt(e.gain, p)));
      d.set(d.low.gain, autoAt(e.low, p)); d.set(d.mid.gain, autoAt(e.mid, p)); d.set(d.high.gain, autoAt(e.high, p));
      if (e.echoAtP !== undefined && p >= e.echoAtP && !d.echoFired) {
        d.echoFired = true;
        const beat = 60 / Math.max(60, 120 * rate);
        d.delay.delayTime.value = Math.min(1.9, beat * 0.75);
        d.echoSend.gain.setValueAtTime(1, now); d.echoSend.gain.setValueAtTime(0, now + beat);
      }
    }
    for (const d of this.decks) if (d.entry >= 0 && !live.has(d.entry)) d.release();
    // the clock follows the deck that owns the program: hold while it buffers, (re)anchor when it plays
    const od = owner && this.decks.find((d) => d.entry === owner.index);
    const ownerOk = !!od && !od.loading && od.ready() && !od.el.paused;
    if (this.frozen && ownerOk && now >= od!.settleUntil - 0.25) {
      this.anchorP = progTime(owner!.segs, od!.el.currentTime); this.anchorCtx = now; this.frozen = false; this.state = 'playing';
    } else if (!this.frozen && owner && !ownerOk && !od?.loading) {
      this.anchorP = p; this.frozen = true;
    }
  }

  private finish() {
    for (const d of this.decks) d.release();
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    this.anchorP = this.plan?.durationS ?? 0; this.frozen = true; this.state = 'ended';
    for (const cb of [...this.endedCbs]) cb();
  }
}
