import type { MixPlan, PlanEntry } from '../mix/plan';
import { progTime } from '../mix/plan';
import type { RangeSource } from '../online/rolling';
import { STREAM_PAUSE_LEAD_S, STREAM_RESUME_LEAD_S } from '../online/buffer';
import { scheduleDeck, type ParamEvent } from './schedule';

/**
 * Plays a MixPlan from decoded buffers on the AudioContext clock (browser only).
 *
 * Why buffers and not <audio>: Safari makes a media element routed through Web Audio choppy whenever its
 * playbackRate isn't 1 (WebKit bug 240405), and media-element timing is too loose for beat matching anyway.
 * Here every deck is an AudioBufferSourceNode scheduled sample-accurately: start time, offset, tempo ramps
 * (playbackRate automation; pitch follows tempo like a turntable), gain/EQ automation and the echo-out are
 * all set up front from the plan. The program clock is simply the context clock, so nothing drifts and
 * there is nothing to correct. Only the current and next songs are kept decoded (~85 MB each).
 *
 * Deck: source → low shelf → peaking mid → high shelf → gain → master; echo send from the EQ into a feedback delay.
 * Master → game FX (gentle lowpass) → out. FX are bypassed (flat) unless a game sets them.
 */
export interface EngineOpts {
  resolveUrl(id: string): Promise<string>;
  ctx?: AudioContext;
  /** Extra output-latency calibration in seconds (Settings). */
  latencyS?: () => number;
}
export type EngineState = 'idle' | 'starting' | 'playing' | 'paused' | 'buffering' | 'ended';

const PRELOAD_S = 40, LOOKAHEAD_S = 1.5, TICK_MS = 100;

class Deck {
  readonly low: BiquadFilterNode; readonly mid: BiquadFilterNode; readonly high: BiquadFilterNode;
  readonly gain: GainNode; readonly echoSend: GainNode; readonly delay: DelayNode;
  src: AudioBufferSourceNode | null = null;
  private sources = new Set<AudioBufferSourceNode>();
  entry = -1;
  constructor(private ctx: AudioContext, dest: AudioNode) {
    this.low = Object.assign(ctx.createBiquadFilter(), { type: 'lowshelf' }); this.low.frequency.value = 180;
    this.mid = Object.assign(ctx.createBiquadFilter(), { type: 'peaking' }); this.mid.frequency.value = 1000; this.mid.Q.value = 0.7;
    this.high = Object.assign(ctx.createBiquadFilter(), { type: 'highshelf' }); this.high.frequency.value = 4500;
    this.gain = ctx.createGain(); this.gain.gain.value = 0;
    this.low.connect(this.mid).connect(this.high).connect(this.gain).connect(dest);
    this.echoSend = ctx.createGain(); this.echoSend.gain.value = 0;
    this.delay = ctx.createDelay(2);
    const fb = ctx.createGain(); fb.gain.value = 0.45;
    const wet = ctx.createGain(); wet.gain.value = 0.7;
    this.high.connect(this.echoSend).connect(this.delay).connect(fb).connect(this.delay);
    this.delay.connect(wet).connect(dest);
  }
  play(buf: AudioBuffer, e: PlanEntry, fromP: number, toCtx: (p: number) => number, bufferStartS = 0, endP?: number) {
    const same = this.entry === e.index && endP !== undefined;
    if (!same) this.stop();
    const sch = scheduleDeck(e, fromP, toCtx);
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    apply(src.playbackRate, sch.rate); if (!same) apply(this.gain.gain, sch.gain);
    if (!same) { apply(this.low.gain, sch.low); apply(this.mid.gain, sch.mid); apply(this.high.gain, sch.high); }
    if (!same && sch.echoAt !== undefined) {
      this.delay.delayTime.value = Math.min(1.9, e.beatS * 0.75);
      this.echoSend.gain.cancelScheduledValues(0);
      this.echoSend.gain.setValueAtTime(0, this.ctx.currentTime);
      this.echoSend.gain.setValueAtTime(1, sch.echoAt); this.echoSend.gain.setValueAtTime(0, sch.echoAt + e.beatS);
    }
    src.connect(this.low);
    src.start(Math.max(this.ctx.currentTime, sch.when), Math.max(0, Math.min(sch.offset - bufferStartS, buf.duration - 0.01)));
    src.stop(endP === undefined ? sch.stopAt : toCtx(Math.min(endP, e.endP)));
    this.sources.add(src);
    src.onended = () => { this.sources.delete(src); src.disconnect(); };
    this.src = src; this.entry = e.index;
  }
  stop() {
    for (const src of this.sources) { try { src.stop(); } catch { /* not started */ } src.disconnect(); }
    this.sources.clear(); this.src = null;
    const now = this.ctx.currentTime;
    for (const p of [this.gain.gain, this.echoSend.gain]) { p.cancelScheduledValues(0); p.setValueAtTime(0, now); }
    this.entry = -1;
  }
}

function apply(param: AudioParam, evs: ParamEvent[]) {
  param.cancelScheduledValues(0);
  for (const ev of evs) {
    if (ev.ramp) param.linearRampToValueAtTime(ev.v, ev.t); else param.setValueAtTime(ev.v, ev.t);
  }
}

export class MixEngine {
  readonly ctx: AudioContext;
  private master: GainNode;
  private fx: { lp: BiquadFilterNode } | null = null;
  private fxDegrade = 0;
  private decks: Deck[] = [];
  private plan: MixPlan | null = null;
  private ranges: RangeSource | undefined;
  private scheduled = new Set<string>();
  private preparing = false;
  private state: EngineState = 'idle';
  /** Program clock: p = anchorP + (ctx.currentTime − anchorCtx) while playing. */
  private anchorP = 0; private anchorCtx = 0;
  private buffers = new Map<number, AudioBuffer>();
  private loading = new Map<number, Promise<void>>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private endedCbs = new Set<() => void>();
  private epoch = 0; // bumps on pause/seek/stop so a pending start is abandoned
  private gen = 0;   // bumps when the plan changes so stale decodes are dropped
  lastError = '';
  /** Counters for the Music Lab. */
  stats = { decodes: 0, lateStarts: 0, starts: 0 };

  constructor(private o: EngineOpts) {
    const Ctx: typeof AudioContext = (globalThis as any).AudioContext ?? (globalThis as any).webkitAudioContext;
    this.ctx = o.ctx ?? new Ctx({ latencyHint: 'playback' });
    this.master = this.ctx.createGain();
    this.master.connect(this.buildFx() ?? this.ctx.destination);
    for (let i = 0; i < 3; i++) this.decks.push(new Deck(this.ctx, this.master));
  }

  /** Call from a user gesture (tap/key): resumes audio (iOS only allows it from one) and plays through the silent switch. */
  unlock(): void {
    try { const s = (navigator as any).audioSession; if (s && s.type !== 'playback') s.type = 'playback'; } catch { /* Safari < 16.4 */ }
    if (this.ctx.state !== 'running') void this.ctx.resume().catch(() => {});
    const b = this.ctx.createBuffer(1, 1, this.ctx.sampleRate), s = this.ctx.createBufferSource();
    s.buffer = b; s.connect(this.ctx.destination); s.start();
  }

  load(plan: MixPlan, ranges?: RangeSource): void { this.stop(); if (this.ranges !== ranges) this.ranges?.dispose(); this.ranges = ranges; this.plan = plan; this.state = 'idle'; }
  /** Decode the first song now (e.g. during a countdown) so start() is instant. */
  preload(): void { if (this.ranges) { void this.ranges.prepare(0).catch((e) => { this.lastError = String(e.message ?? e); }); return; } const e = this.plan?.entries[0]; if (e) void this.ensureBuffer(e).catch((err) => { this.lastError = String(err?.message ?? err); }); }
  getState(): EngineState { return this.state; }
  playing(): boolean { return this.state === 'playing' && this.ctx.state === 'running'; }
  onEnded(cb: () => void): () => void { this.endedCbs.add(cb); return () => { this.endedCbs.delete(cb); }; }
  setVolume(v: number): void { const g = this.master.gain; g.cancelScheduledValues(0); g.setTargetAtTime(Math.max(0, Math.min(1, v)), this.ctx.currentTime, 0.05); }

  /** Underpowered riding gently muffles music, without hard gain modulation or bit crushing. */
  setFx(o: { degrade: number }): void {
    const d = Number.isFinite(o.degrade) ? Math.max(0, Math.min(1, o.degrade)) : 0, fx = this.fx;
    if (!fx || Math.abs(d - this.fxDegrade) < 0.005) return;
    this.fxDegrade = d;
    fx.lp.frequency.setTargetAtTime(20000 * Math.pow(3000 / 20000, d), this.ctx.currentTime, 0.08);
  }
  private buildFx(): AudioNode | null {
    const c = this.ctx;
    if (typeof c.createBiquadFilter !== 'function') return null;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 20000; lp.Q.value = 0.7;
    lp.connect(c.destination);
    this.fx = { lp };
    return lp;
  }

  /** Program position the rider is *hearing* (output latency and calibration removed), or null before it starts. */
  positionS(): number | null {
    if (this.state !== 'playing' && this.state !== 'paused' && this.state !== 'buffering') return null;
    const lat = ((this.ctx as any).outputLatency ?? this.ctx.baseLatency ?? 0) + (this.o.latencyS?.() ?? 0);
    return Math.max(0, this.programNow() - lat);
  }

  /** Start at program time p0. Resolves once the first song is decoded and scheduled. */
  async start(p0 = 0): Promise<void> {
    if (!this.plan) throw new Error('no plan loaded');
    if (this.ctx.state !== 'running') await this.ctx.resume().catch(() => {});
    this.anchorP = p0; this.state = 'starting';
    await this.begin();
  }
  pause(): void {
    if (this.state !== 'playing' && this.state !== 'starting' && this.state !== 'buffering') return;
    this.anchorP = this.programNow(); this.state = 'paused'; this.epoch++;
    for (const d of this.decks) d.stop(); this.scheduled.clear();
  }
  resume(): void { if (this.state === 'paused') { this.state = 'starting'; void this.begin(); } }
  seek(p: number): void {
    const was = this.state;
    for (const d of this.decks) d.stop();
    this.scheduled.clear(); this.epoch++; this.anchorP = Math.max(0, p);
    if (was === 'playing' || was === 'starting' || was === 'buffering') { this.state = 'starting'; void this.begin(); }
  }
  stop(): void {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    for (const d of this.decks) d.stop();
    this.ranges?.cancel(); this.epoch++; this.gen++; this.buffers.clear(); this.loading.clear();
    this.scheduled.clear(); this.state = 'idle'; this.anchorP = 0;
  }
  dispose(): void { this.stop(); this.ranges?.dispose(); void this.ctx.close?.().catch(() => {}); }

  debug(): Record<string, number | string | boolean> {
    const out: Record<string, number | string | boolean> = { state: this.state, p: +this.programNow().toFixed(2), ctx: this.ctx.state };
    this.decks.forEach((d, i) => { if (d.entry >= 0) out[`deck${i}`] = `#${d.entry} r${d.src?.playbackRate.value.toFixed(3) ?? '-'} g${d.gain.gain.value.toFixed(2)}`; });
    const mb = [...this.buffers.values()].reduce((s, b) => s + (b.length * b.numberOfChannels * 4) / 1e6, 0);
    out.stats = `decodes ${this.stats.decodes} starts ${this.stats.starts} late ${this.stats.lateStarts} · ${Math.round(mb)} MB decoded`;
    if (this.ranges) Object.assign(out, this.ranges.debug(), { estimatedTransitions: true });
    if (this.lastError) out.error = this.lastError;
    return out;
  }

  private programNow(): number { return this.state === 'playing' ? this.anchorP + (this.ctx.currentTime - this.anchorCtx) : this.anchorP; }
  private toCtx = (p: number) => this.anchorCtx + (p - this.anchorP);

  /** (Re)start playback at anchorP: make sure the current song is decoded, then anchor the clock slightly ahead and schedule. */
  private async begin(): Promise<void> {
    const plan = this.plan!; const ep = this.epoch;
    const cur = plan.entries.find((e) => this.anchorP >= e.startP && this.anchorP < e.endP) ?? plan.entries[0];
    try { if (this.ranges) await this.ranges.prepare(this.anchorP); else await this.ensureBuffer(cur); } catch (e) { this.lastError = String((e as Error)?.message ?? e); if (ep === this.epoch) { this.state = this.ranges ? 'buffering' : 'paused'; if (this.ranges && !this.timer) this.timer = setInterval(() => this.tick(), TICK_MS); } return; }
    if (ep !== this.epoch || this.state !== 'starting') return;
    this.anchorCtx = this.ctx.currentTime + 0.1; // a little headroom so the first samples aren't cut
    this.state = 'playing';
    if (this.ranges) this.scheduleRanges(this.anchorP);
    else for (const e of plan.entries) if (this.anchorP < e.endP && e.startP < this.anchorP + LOOKAHEAD_S) this.schedule(e, this.anchorP);
    if (!this.timer) this.timer = setInterval(() => this.tick(), TICK_MS);
  }

  private ensureBuffer(e: PlanEntry): Promise<void> {
    if (this.buffers.has(e.index)) return Promise.resolve();
    let p = this.loading.get(e.index);
    if (!p) {
      const gen = this.gen;
      p = (async () => {
        const url = await this.o.resolveUrl(e.id);
        const data = await (await fetch(url)).arrayBuffer();
        const buf = await new Promise<AudioBuffer>((res, rej) => {
          const r = this.ctx.decodeAudioData(data, res, (err) => rej(err ?? new Error('could not decode')));
          if (r && typeof (r as Promise<AudioBuffer>).then === 'function') (r as Promise<AudioBuffer>).then(res, rej);
        });
        if (gen === this.gen) { this.buffers.set(e.index, buf); this.stats.decodes++; }
      })().finally(() => this.loading.delete(e.index));
      this.loading.set(e.index, p);
    }
    return p;
  }

  private schedule(e: PlanEntry, fromP: number) {
    const buf = this.buffers.get(e.index);
    if (!buf || this.decks.some((d) => d.entry === e.index)) return;
    const deck = this.decks.find((d) => d.entry < 0) ?? this.decks.reduce((a, b) => ((a.entry < b.entry ? a : b)));
    deck.play(buf, e, fromP, this.toCtx);
    this.stats.starts++;
    if (fromP > e.startP + 0.05) this.stats.lateStarts++;
  }

  private tick(): void {
    const plan = this.plan;
    if (!plan || (this.state !== 'playing' && this.state !== 'buffering')) return;
    const p = this.programNow();
    if (p >= plan.durationS) { this.finish(); return; }
    if (this.ranges) {
      const ranges = this.ranges;
      ranges.evict(p);
      if (!this.preparing) {
        this.preparing = true;
        void ranges.prepare(p).then(() => { this.lastError = ''; }).catch((e) => { this.lastError = String(e.message ?? e); }).finally(() => { this.preparing = false; });
      }
      const lead = ranges.readyThrough(p) - p;
      // Reserve analyzed music for the next effort and recovery, freezing both clocks if preparation falls behind.
      if (this.state === 'playing' && lead < Math.min(STREAM_PAUSE_LEAD_S, plan.durationS - p) - 0.1) {
        this.anchorP = p; this.state = 'buffering'; this.scheduled.clear();
        for (const d of this.decks) d.stop();
      } else if (this.state === 'buffering' && lead >= Math.min(STREAM_RESUME_LEAD_S, plan.durationS - p) - 0.1) {
        this.anchorCtx = this.ctx.currentTime + 0.1; this.state = 'playing';
      }
      if (this.state === 'playing') this.scheduleRanges(p);
      return;
    }
    for (const e of plan.entries) {
      // decode ahead; drop buffers we're done with
      if (e.startP - PRELOAD_S <= p && p < e.endP) void this.ensureBuffer(e).catch((err) => { this.lastError = String(err?.message ?? err); });
      if (p > e.endP + 1) { this.buffers.delete(e.index); for (const d of this.decks) if (d.entry === e.index) d.entry = -1; }
      // schedule songs that start soon (or that we're already late for, e.g. a slow decode)
      if (e.startP < p + LOOKAHEAD_S && p < e.endP) this.schedule(e, Math.max(p + 0.05, e.startP));
    }
  }

  private scheduleRanges(p: number) {
    for (const e of this.plan!.entries) {
      if (e.endP <= p || e.startP > p + LOOKAHEAD_S) continue;
      for (const w of this.ranges!.windows(e)) {
        const start = Math.max(e.startP, progTime(e.segs, w.startS)), end = Math.min(e.endP, progTime(e.segs, w.endS));
        const key = `${e.index}:${w.startS}`;
        if (end <= p || start > p + LOOKAHEAD_S || this.scheduled.has(key)) continue;
        const deck = this.decks.find((d) => d.entry === e.index) ?? this.decks.find((d) => d.entry < 0 || this.plan!.entries[d.entry].endP <= p);
        if (!deck) continue;
        deck.play(w.buffer, e, Math.max(start, p), this.toCtx, w.bufferStartS, end);
        this.scheduled.add(key); this.stats.starts++;
      }
    }
  }

  private finish() {
    for (const d of this.decks) d.stop();
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    this.anchorP = this.plan?.durationS ?? 0; this.state = 'ended'; this.buffers.clear();
    for (const cb of [...this.endedCbs]) cb();
  }
}
