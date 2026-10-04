import { SmoothedPosition } from '../clock';
import { autoAt, progTime, rateAt, songTime, type MixPlan, type PlanEntry } from '../mix/plan';
import { encodeWav } from './wav';

/**
 * Plays a MixPlan on DJ-style decks (browser only). Each deck: <audio> → MediaElementSource → 3-band EQ →
 * gain → master; an echo send for echo-outs.
 *
 * The deck that owns the program is the master clock: the program position is read from it (smoothed) and it
 * is never nudged, so a single song plays untouched. Only a deck that overlaps it (an automix incoming/outgoing
 * song) is corrected, and gently: an occasional small rate change, or a seek while it's inaudible. Browsers
 * (Safari especially) glitch when playbackRate or currentTime is written often, so every write is rate-limited.
 */
export interface EngineOpts {
  resolveUrl(id: string): Promise<string>;
  ctx?: AudioContext;
  /** Extra output-latency calibration in seconds (Settings). */
  latencyS?: () => number;
}
export type EngineState = 'idle' | 'starting' | 'playing' | 'paused' | 'ended';

const PRELOAD_S = 8, TICK_MS = 40;

/** What to do with a deck that should follow the program (pure; tested). err = deck time − target, seconds. */
export function followerAction(o: { err: number; audible: boolean; sinceSeekS: number; sinceRateS: number; planned: number; current: number }): { seek?: true; rate?: number } {
  if (o.sinceSeekS < 0.6) return {};                                   // still settling after a seek
  if (Math.abs(o.err) > (o.audible ? 0.5 : 0.08)) return { seek: true }; // far off (audible decks only when badly off)
  if (o.sinceRateS < 1) return {};
  const want = Math.abs(o.err) < 0.02 ? o.planned
    : Math.round(o.planned * (1 - Math.max(-0.02, Math.min(0.02, o.err * 0.5))) * 400) / 400;
  return Math.abs(want - o.current) >= 0.002 ? { rate: want } : {};
}
/** The master deck only follows the plan's rate (tempo ramps), in coarse, infrequent steps. */
export function ownerRate(planned: number, current: number, sinceRateS: number): number | null {
  return sinceRateS >= 0.5 && Math.abs(planned - current) >= 0.002 ? Math.round(planned * 1000) / 1000 : null;
}

class Deck {
  readonly el: HTMLAudioElement;
  readonly low: BiquadFilterNode; readonly mid: BiquadFilterNode; readonly high: BiquadFilterNode;
  readonly gain: GainNode; readonly echoSend: GainNode; readonly delay: DelayNode; readonly feedback: GainNode;
  entry = -1; id = ''; loading: Promise<void> | null = null; echoFired = false; wantPlay = false;
  lastSeek = -1e9; lastRate = -1e9; lastPlayTry = -1e9;
  private params = new Map<AudioParam, number>();
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
  /** Song time, smoothed against a fine clock. */
  time(fine: number): number { return this.smooth.update(this.el.currentTime, fine, this.el.playbackRate, !this.el.paused); }
  playingOk(): boolean { return !this.loading && !this.el.paused && !this.el.seeking && this.el.readyState >= 3; }
  seek(s: number, fine: number) { try { this.el.currentTime = Math.max(0, s); } catch { /* not seekable yet */ } this.smooth.reset(); this.lastSeek = fine; }
  setRate(r: number, fine: number) { this.el.playbackRate = r; this.lastRate = fine; }
  /** Schedule an AudioParam change only when the value really changes (Safari keeps every scheduled event). */
  set(param: AudioParam, v: number, eps = 0.004) {
    const prev = this.params.get(param);
    if (prev !== undefined && Math.abs(prev - v) < eps) return;
    this.params.set(param, v);
    param.cancelScheduledValues(this.ctx.currentTime);
    param.setTargetAtTime(v, this.ctx.currentTime, 0.02);
  }
  release() {
    this.el.pause(); this.wantPlay = false; this.entry = -1; this.id = ''; this.echoFired = false;
    this.set(this.gain.gain, 0); this.lastSeek = this.lastRate = this.lastPlayTry = -1e9;
  }
}

export class MixEngine {
  readonly ctx: AudioContext;
  private master: GainNode;
  private decks: Deck[] = [];
  private plan: MixPlan | null = null;
  private state: EngineState = 'idle';
  /** Program clock: last known position and the fine time it was read; frozen = not advancing. */
  private anchorP = 0; private anchorFine = 0; private frozen = true;
  private timer: ReturnType<typeof setInterval> | null = null;
  private endedCbs = new Set<() => void>();
  private blessed = false;
  lastError = '';
  /** Counters for the Music Lab: seeks, playbackRate writes, clock freezes, play() attempts. */
  stats = { seeks: 0, rates: 0, freezes: 0, plays: 0 };

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
  setVolume(v: number): void { this.master.gain.cancelScheduledValues(this.ctx.currentTime); this.master.gain.setTargetAtTime(Math.max(0, Math.min(1, v)), this.ctx.currentTime, 0.05); }

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
    for (const d of this.decks) { d.el.pause(); d.wantPlay = false; }
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
    this.decks.forEach((d, i) => { if (d.entry >= 0) out[`deck${i}`] = `#${d.entry} t${d.el.currentTime.toFixed(2)} r${d.el.playbackRate.toFixed(3)} g${d.gain.gain.value.toFixed(2)}${d.el.paused ? ' paused' : ''}${d.playingOk() || d.el.paused ? '' : ' …'}`; });
    out.stats = `seeks ${this.stats.seeks} rates ${this.stats.rates} freezes ${this.stats.freezes} plays ${this.stats.plays}`;
    if (this.lastError) out.error = this.lastError;
    return out;
  }

  private fine(): number { return performance.now() / 1000; }
  private programNow(): number { return this.frozen ? this.anchorP : this.anchorP + (this.fine() - this.anchorFine); }
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
    const fine = this.fine();
    // 1) the program clock follows the owner deck while it plays; it holds while the owner buffers or starts
    let p = this.programNow();
    const ownerOf = (x: number) => plan.entries.find((e) => x >= e.own[0] && x < e.own[1]) ?? plan.entries.find((e) => x >= e.startP && x < e.endP);
    const owner = ownerOf(p);
    const od = owner && this.decks.find((d) => d.entry === owner.index);
    if (owner && od?.playingOk() && od.wantPlay && fine - od.lastSeek > 0.3) {
      const measured = progTime(owner.segs, od.time(fine));
      // follow the owner: snap when far (seek / start), else ease (its currentTime is noisy)
      p = this.frozen || Math.abs(measured - p) > 0.25 ? measured : p + (measured - p) * 0.1;
      this.anchorP = p; this.anchorFine = fine;
      if (this.frozen) { this.frozen = false; this.state = 'playing'; }
    } else if (!this.frozen && owner) {
      this.anchorP = p; this.frozen = true; this.stats.freezes++;
    }
    if (p >= plan.durationS) { this.finish(); return; }

    // 2) every deck in (or near) its window: load, start, follow, automate
    const live = new Set<number>();
    for (const e of plan.entries) {
      if (p < e.startP - PRELOAD_S || p > e.endP + 4) continue;
      const d = this.deckFor(e); if (!d) continue;
      live.add(e.index);
      if (d.loading) continue;
      const inside = p >= e.startP && p < e.endP;
      if (!inside) {
        // cue the next song at its start point (once) so it can start instantly
        if (p < e.startP && d.el.paused && d.el.readyState >= 1 && fine - d.lastSeek > 2 && Math.abs(d.el.currentTime - songTime(e.segs, e.startP)) > 0.05) d.seek(songTime(e.segs, e.startP), fine);
        if (p >= e.endP && !d.el.paused) { d.el.pause(); d.wantPlay = false; d.set(d.gain.gain, 0); }
        continue;
      }
      const target = songTime(e.segs, p), rate = rateAt(e.segs, p);
      if (d.el.paused) {
        // start (or restart after the browser paused it) — at most once a second, never a seek storm
        if (fine - d.lastPlayTry >= 1) {
          d.lastPlayTry = fine; d.wantPlay = true; this.stats.plays++;
          if (Math.abs(d.el.currentTime - target) > 0.08) { d.seek(target, fine); this.stats.seeks++; }
          d.setRate(rate, fine);
          d.el.play().catch((err) => { this.lastError = String(err?.message ?? err); });
        }
      } else if (d.playingOk()) {
        if (owner && e.index === owner.index) {
          const r = ownerRate(rate, d.el.playbackRate, fine - d.lastRate);
          if (r !== null) { d.setRate(r, fine); this.stats.rates++; }
        } else {
          const a = followerAction({ err: d.time(fine) - target, audible: autoAt(e.gain, p) > 0.05, sinceSeekS: fine - d.lastSeek, sinceRateS: fine - d.lastRate, planned: rate, current: d.el.playbackRate });
          if (a.seek) { d.seek(target, fine); this.stats.seeks++; }
          else if (a.rate !== undefined) { d.setRate(a.rate, fine); this.stats.rates++; }
        }
      }
      d.set(d.gain.gain, Math.max(0, autoAt(e.gain, p)));
      d.set(d.low.gain, autoAt(e.low, p), 0.2); d.set(d.mid.gain, autoAt(e.mid, p), 0.2); d.set(d.high.gain, autoAt(e.high, p), 0.2);
      if (e.echoAtP !== undefined && p >= e.echoAtP && !d.echoFired) {
        d.echoFired = true;
        const beat = 60 / Math.max(60, 120 * rate), now = this.ctx.currentTime;
        d.delay.delayTime.value = Math.min(1.9, beat * 0.75);
        d.echoSend.gain.setValueAtTime(1, now); d.echoSend.gain.setValueAtTime(0, now + beat);
      }
    }
    for (const d of this.decks) if (d.entry >= 0 && !live.has(d.entry)) d.release();
  }

  private finish() {
    for (const d of this.decks) d.release();
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    this.anchorP = this.plan?.durationS ?? 0; this.frozen = true; this.state = 'ended';
    for (const cb of [...this.endedCbs]) cb();
  }
}
