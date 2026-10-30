import { orderedLoads } from './ordered';
import type { MediaCoverage, MediaTimeline } from '../../contracts';
import { freezeHorizon, freezeMerge, songCoverage } from './freeze';
import { ANALYSIS_VERSION, CURVE_HZ, type QueueMode, type SongAnalysis } from '../types';
import { buildTimeline } from '../mix/timeline';
import { foldTempo } from '../analysis/tempo';
import { structureFromBeats, type BeatFeature } from '../analysis/structure';
import { planMix, progTime, songTime, type MixItem, type PlanEntry } from '../mix/plan';

export const CHUNK_S = 30, CONTEXT_S = 2;
export interface AudioWindow { startS: number; endS: number; bufferStartS: number; buffer: AudioBuffer }
export interface RangeSource {
  prepare(p: number, targetS?: number): Promise<void>;
  windows(e: PlanEntry): AudioWindow[];
  readyThrough(p: number): number;
  evict(p: number): void;
  cancel(): void;
  dispose(): void;
  debug(): Record<string, number | string>;
  /** Register a cue a game has shown (program time); later revisions never move it (MediaContext.announce). */
  announce?(id: string, t: number): void;
}
export interface WindowResult { buffer: AudioBuffer; analysis: SongAnalysis; /** Per-beat features (times relative to the buffer start). */ beats?: BeatFeature[] }
/** A window already analysed elsewhere (picker preview), in the ride's own format; seeds analysis and, when retained, decoded audio. */
export interface SeedWindow { startS: number; endS: number; bufferStartS: number; analysis: SongAnalysis; beats: BeatFeature[]; buffer?: AudioBuffer }
export type WindowLoader = (index: number, startS: number, durationS: number, signal: AbortSignal, hint?: { bpm: number }) => Promise<WindowResult | ((hint?: { bpm: number }) => Promise<WindowResult>)>;

/** Honest placeholders: no invented beats or drops; only duration is known. */
export function estimatedAnalysis(durationS: number): SongAnalysis {
  const n = Math.ceil(durationS * CURVE_HZ), curve = () => new Array(n).fill(0.5);
  return { v: ANALYSIS_VERSION, durationS, bpm: 0, beats: [], downbeats: [], phrases: [], onsets: [], intensity: curve(), bands: [curve(), curve(), curve()],
    sections: [{ t0: 0, t1: durationS, kind: 'verse', energy: 0.5 }], key: { name: 'Unknown', camelot: '', confidence: 0 },
    spec: { hz: 1, bands: 1, data: '' }, confidence: 'metadata' };
}

/** Windows shorter than this (core seconds) never set song tempo/key on their own: too little audio. */
export const MIN_ESTIMATE_S = 10;
const songEstimates = new WeakMap<SongAnalysis, { bpmW: number; bpmSum: number; keys: Map<string, { w: number; key: SongAnalysis['key'] }> }>();
export { foldTempo };
/**
 * Song-level tempo/key from many windows: duration-weighted, half/double folded onto the running estimate,
 * short tail windows ignored (they used to overwrite the song's BPM, e.g. 108 → 58 from a 0.4 s final window).
 */
function foldSongEstimates(target: SongAnalysis, a: SongAnalysis, coreS: number): void {
  let st = songEstimates.get(target);
  if (!st) { st = { bpmW: 0, bpmSum: 0, keys: new Map() }; songEstimates.set(target, st); }
  const weight = coreS >= MIN_ESTIMATE_S ? coreS : st.bpmW === 0 && !(target.bpm > 0) ? coreS * 0.01 : 0;
  if (weight > 0 && a.bpm > 0) {
    const bpm = st.bpmW > 0 ? foldTempo(a.bpm, st.bpmSum / st.bpmW) : a.bpm;
    st.bpmSum += bpm * weight; st.bpmW += weight; target.bpm = Math.round((st.bpmSum / st.bpmW) * 100) / 100;
  }
  if (weight > 0 && a.key.camelot) {
    const k = st.keys.get(a.key.camelot) ?? { w: 0, key: a.key };
    k.w += weight * Math.max(0.05, a.key.confidence); k.key = a.key.confidence >= k.key.confidence ? a.key : k.key; st.keys.set(a.key.camelot, k);
    target.key = [...st.keys.values()].reduce((x, y) => (y.w > x.w ? y : x)).key;
  }
}

/** Commit only this window's events, with overlap used for context but never duplicated. */
export function mergeWindow(target: SongAnalysis, a: SongAnalysis, bufferStart: number, start: number, end: number, feats?: readonly BeatFeature[]): void {
  const inside = (t: number) => t >= start - 1e-6 && t < end - 1e-6;
  for (const key of ['beats', 'downbeats', 'phrases'] as const) {
    target[key] = [...target[key].filter((t) => !inside(t)), ...a[key].map((t) => t + bufferStart).filter(inside)].sort((x, y) => x - y);
  }
  target.onsets = [...target.onsets.filter((o) => !inside(o.t)), ...a.onsets.map((o) => ({ ...o, t: o.t + bufferStart })).filter((o) => inside(o.t))].sort((x, y) => x.t - y.t);
  const before = target.sections.filter((s) => s.t0 < start).map((s) => ({ ...s, t1: Math.min(s.t1, start) }));
  const after = target.sections.filter((s) => s.t1 > end).map((s) => ({ ...s, t0: Math.max(s.t0, end) }));
  const sections = a.sections.map((s) => ({ ...s, t0: Math.max(start, s.t0 + bufferStart), t1: Math.min(end, s.t1 + bufferStart),
    kind: (s.kind === 'intro' && start > 0) || (s.kind === 'outro' && end < target.durationS - 0.1) ? 'verse' as const : s.kind })).filter((s) => s.t1 > s.t0);
  target.sections = [...before, ...sections, ...after];
  for (let i = Math.ceil(start * CURVE_HZ); i < Math.ceil(end * CURVE_HZ); i++) {
    const k = Math.max(0, Math.min(a.intensity.length - 1, Math.round((i / CURVE_HZ - bufferStart) * CURVE_HZ)));
    target.intensity[i] = a.intensity[k] ?? 0;
    for (let b = 0; b < 3; b++) target.bands[b][i] = a.bands[b][k] ?? 0;
  }
  foldSongEstimates(target, a, end - start);
  if (feats) mergeStructure(target, feats, bufferStart, start, end);
  // Remains metadata-confidence: estimated song-wide structure and transitions are not a full-file analysis.
}

interface SongStructure { beats: BeatFeature[]; spans: Array<[number, number]> }
const songStructure = new WeakMap<SongAnalysis, SongStructure>();
/** Contiguous analysed coverage from 0 s. */
function coveredFromZero(spans: Array<[number, number]>): number {
  let c = 0; for (const [a, b] of [...spans].sort((x, y) => x[0] - y[0])) { if (a > c + 1e-6) break; c = Math.max(c, b); } return c;
}
/** Remove a duplicate or fill one missing beat where two windows meet (period from the song tempo). */
export function stitchSeam(beats: BeatFeature[], seam: number, period: number): BeatFeature[] {
  if (!(period > 0)) return beats;
  const i = beats.findIndex((b) => b.t >= seam - 1e-6);
  if (i <= 0 || i >= beats.length) return beats;
  const gap = beats[i].t - beats[i - 1].t;
  if (gap < 0.5 * period) return [...beats.slice(0, i), ...beats.slice(i + 1)];
  if (gap > 1.6 * period && gap < 2.4 * period) return [...beats.slice(0, i), { ...beats[i], t: Math.round(((beats[i - 1].t + beats[i].t) / 2) * 1000) / 1000 }, ...beats.slice(i)];
  return beats;
}
/**
 * Memory-light rolling structure: keep compact per-beat features from every committed window (no audio), stitch beats at
 * seams, then recompute downbeats, sections and phrases over the whole analysed stretch from 0 s.
 */
function mergeStructure(target: SongAnalysis, feats: readonly BeatFeature[], bufferStart: number, start: number, end: number): void {
  let st = songStructure.get(target);
  if (!st) { st = { beats: [], spans: [] }; songStructure.set(target, st); }
  const inside = (t: number) => t >= start - 1e-6 && t < end - 1e-6;
  st.beats = [...st.beats.filter((b) => !inside(b.t)), ...feats.map((b) => ({ ...b, t: Math.round((b.t + bufferStart) * 1000) / 1000 })).filter((b) => inside(b.t))].sort((x, y) => x.t - y.t);
  st.spans.push([start, end]);
  const period = target.bpm > 0 ? 60 / target.bpm : 0;
  st.beats = stitchSeam(stitchSeam(st.beats, start, period), end, period);
  target.beats = st.beats.map((b) => b.t);
  const covered = coveredFromZero(st.spans);
  if (covered <= 0) return;
  const s = structureFromBeats(st.beats.filter((b) => b.t < covered), target.intensity, CURVE_HZ, covered);
  const after = target.sections.filter((x) => x.t1 > covered).map((x) => ({ ...x, t0: Math.max(x.t0, covered) }));
  const later = (xs: number[]) => xs.filter((t) => t >= covered);
  target.downbeats = [...s.downbeats, ...later(target.downbeats)];
  target.phrases = [...s.phrases, ...later(target.phrases)];
  target.sections = [...s.sections.map((x, i, all) => (i === all.length - 1 && covered < target.durationS - 0.1 && x.kind === 'outro' ? { ...x, kind: 'verse' as const } : x)), ...after];
}
/** Bytes of retained rolling features for a song (payload only: 26 float32 + t + low per beat). */
export function retainedFeatureBytes(target: SongAnalysis): number { return (songStructure.get(target)?.beats.length ?? 0) * (24 * 4 + 5 * 8); }

/** Bounded playback cache plus an append-only record of committed per-window analysis. */
export class RollingQueue implements RangeSource {
  readonly plan; readonly timeline: MediaTimeline;
  private cache = new Map<string, AudioWindow>();
  private committed = new Set<string>();
  private controller = new AbortController();
  private busy: Promise<void> | null = null;
  private wantedP = 0;
  private wantedBufferS: number;
  private error = '';
  private alive = true;
  private announced = new Map<string, number>();
  private analysed = new Map<number, Array<[number, number]>>();
  constructor(readonly items: MixItem[], mode: QueueMode, readonly bufferS: number, private load: WindowLoader, private concurrency: 1 | 2 = 1) {
    this.wantedBufferS = bufferS;
    this.plan = planMix(items, mode === 'continuous' ? mode : 'crossfade');
    this.plan.mode = mode;
    for (const t of this.plan.transitions) t.why = 'Estimated from song duration; rolling analysis does not claim phrase or beat matching.';
    this.timeline = { ...buildTimeline(this.plan, items), revision: 0, updateFromS: 0 };
  }
  private key(index: number, start: number) { return `${index}:${start}`; }
  /**
   * Reuse preview analysis (#64 PR 5): commit already-analysed windows of item `index` so coverage and structure are there
   * from the start. Only windows on the ride's own chunk grid, before any audio, on estimated (streamed) items. Retained audio enters the playback cache directly, avoiding extraction, decoding and analysis again.
   */
  seed(index: number, windows: readonly SeedWindow[]): number {
    const item = this.items[index]; if (!item || item.analysis.confidence !== 'metadata') return 0;
    let n = 0; const e = this.plan.entries.find((x) => x.index === index); if (!e) return 0;
    for (const w of [...windows].sort((a, b) => a.startS - b.startS)) {
      const key = this.key(index, w.startS);
      const onGrid = Math.abs(w.startS / CHUNK_S - Math.round(w.startS / CHUNK_S)) < 1e-6 && Math.abs(w.endS - Math.min(item.analysis.durationS, w.startS + CHUNK_S)) < 0.5;
      if (!onGrid || this.committed.has(key)) continue;
      const bufferStart = Math.max(0, w.startS - CONTEXT_S);
      if (w.startS < 0 || w.endS <= w.startS || Math.abs(w.bufferStartS - bufferStart) > 1e-6) continue;
      const tolerance = w.endS === item.analysis.durationS ? 1 : 0.1;
      if (w.buffer && w.buffer.duration + tolerance >= w.endS - bufferStart) {
        this.cache.set(key, { startS: w.startS, endS: w.endS, bufferStartS: w.bufferStartS, buffer: w.buffer });
      }
      mergeWindow(item.analysis, w.analysis, w.bufferStartS, w.startS, w.endS, w.beats);
      this.committed.add(key); n++;
      const spans = this.analysed.get(index) ?? []; spans.push([w.startS, w.endS]); this.analysed.set(index, spans);
    }
    if (n) this.revise(Math.max(0, progTime(e.segs, Math.min(...windows.map((w) => w.startS)))));
    return n;
  }
  windows(e: PlanEntry): AudioWindow[] { return [...this.cache.entries()].filter(([k]) => k.startsWith(`${e.index}:`)).map(([, w]) => w).sort((a, b) => a.startS - b.startS); }
  prepare(p: number, targetS = this.bufferS): Promise<void> {
    if (!this.alive) return Promise.reject(new Error('Media queue was closed.'));
    this.wantedP = p;
    this.wantedBufferS = Math.min(this.bufferS, Math.max(0, targetS));
    if (this.busy) return this.busy;
    const task = this.pump().finally(() => { if (this.busy === task) this.busy = null; });
    this.busy = task; return task;
  }
  private async pump() {
    const controller = this.controller;
    while (this.alive && controller === this.controller) {
      const p = this.wantedP, horizon = Math.min(this.plan.durationS, p + this.wantedBufferS);
      const pending: Array<{ e: PlanEntry; start: number; end: number; due: number }> = [];
      for (const e of this.plan.entries) {
        if (e.endP <= p || e.startP >= horizon) continue;
        const duration = this.items[e.index].analysis.durationS;
        const from = Math.max(0, Math.floor(Math.max(0, songTime(e.segs, Math.max(p, e.startP))) / CHUNK_S) * CHUNK_S);
        for (let start = from; start < Math.min(duration, songTime(e.segs, horizon)) - 1e-5; start += CHUNK_S) {
          if (this.cache.has(this.key(e.index, start))) continue;
          const due = progTime(e.segs, start);
          pending.push({ e, start, end: Math.min(duration, start + CHUNK_S), due });
          if (pending.filter(w => w.e === e).length >= this.concurrency) break;
        }
      }
      if (!pending.length) { this.error = ''; return; }
      const batch = pending.sort((a, b) => a.due - b.due).slice(0, this.concurrency);
      const abort = new AbortController(), cancel = () => abort.abort();
      controller.signal.addEventListener('abort', cancel, { once: true });
      const hint = (index: number) => this.items[index].analysis.bpm > 0 ? { bpm: this.items[index].analysis.bpm } : undefined;
      const loads = orderedLoads(batch.map(({ e, start, end }) => () => {
        const bufferStart = Math.max(0, start - CONTEXT_S);
        return this.load(e.index, bufferStart, Math.min(this.items[e.index].analysis.durationS, end + CONTEXT_S) - bufferStart, abort.signal, hint(e.index));
      }));
      try {
        for (const [i, { e, start, end }] of batch.entries()) {
          const bufferStart = Math.max(0, start - CONTEXT_S), loaded = await loads[i]();
          if (!this.alive || controller !== this.controller) return;
          // Fetches overlap; analysis waits for the previous commit's tempo estimate.
          const result = typeof loaded === 'function' ? await loaded(hint(e.index)) : loaded;
          if (!this.alive || controller !== this.controller) return;
          // Search durations can be rounded to whole seconds. Only the final window may end slightly early.
          const tolerance = end === this.items[e.index].analysis.durationS ? 1 : 0.1;
          if (result.buffer.duration + tolerance < end - bufferStart) throw new Error('The server returned an incomplete audio window.');
          const key = this.key(e.index, start);
          this.cache.set(key, { startS: start, endS: end, bufferStartS: bufferStart, buffer: result.buffer });
          if (!this.committed.has(key)) {
            mergeWindow(this.items[e.index].analysis, result.analysis, bufferStart, start, end, result.beats);
            this.committed.add(key);
            const spans = this.analysed.get(e.index) ?? []; spans.push([start, end]); this.analysed.set(e.index, spans);
            this.revise(Math.max(0, progTime(e.segs, start)));
          }
        }
      } catch (e) { if (controller !== this.controller || !this.alive) return; this.error = e instanceof Error ? e.message : String(e); throw e; }
      finally { controller.signal.removeEventListener('abort', cancel); abort.abort(); }
    }
  }
  /** Apply a new revision under the freeze horizon (playhead + 3 s floor over analysed time, plus every announced cue). */
  private revise(changedFromS: number) {
    const prev = this.timeline, revision = (prev.revision ?? 0) + 1;
    const h = freezeHorizon(prev.frozenUntilS ?? 0, this.wantedP, this.announced.values(), prev.coverage ?? []);
    const next = freezeMerge(prev, { ...buildTimeline(this.plan, this.items), coverage: this.coverage() }, h);
    const from = Math.max(changedFromS, next.frozenUntilS ?? 0);
    const updateFromS = Math.min(prev.updateFromS ?? Infinity, from);
    for (const k of Object.keys(prev) as Array<keyof MediaTimeline>) if (!(k in next)) delete prev[k];
    Object.assign(prev, next, { revision, updateFromS });
  }
  private coverage(): MediaCoverage[] {
    const out: MediaCoverage[] = [];
    for (const e of this.plan.entries) {
      const w = this.analysed.get(e.index);
      if (w) out.push(...songCoverage(this.items[e.index].analysis, w, (s) => progTime(e.segs, s), e.own[0], e.own[1]));
    }
    return out.sort((a, b) => a.t0 - b.t0);
  }
  announce(id: string, t: number) {
    if (this.announced.has(id)) return;   // first announcement wins: a cue's time never changes
    this.announced.set(id, t);
    this.timeline.frozenUntilS = freezeHorizon(this.timeline.frozenUntilS ?? 0, this.wantedP, [t], this.timeline.coverage ?? []);
  }
  readyThrough(p: number): number {
    let end = this.plan.durationS;
    for (const e of this.plan.entries) {
      if (e.endP <= p) continue;
      const duration = this.items[e.index].analysis.durationS;
      const from = Math.max(0, Math.floor(Math.max(0, songTime(e.segs, Math.max(p, e.startP))) / CHUNK_S) * CHUNK_S);
      for (let start = from; start < duration; start += CHUNK_S) if (!this.cache.has(this.key(e.index, start))) { end = Math.min(end, Math.max(e.startP, progTime(e.segs, start))); break; }
    }
    return end;
  }
  evict(p: number) {
    for (const [key, w] of this.cache) {
      const e = this.plan.entries[Number(key.split(':')[0])];
      if (progTime(e.segs, w.endS) < p - 2) this.cache.delete(key);
    }
  }
  cancel() { this.controller.abort(); this.controller = new AbortController(); this.cache.clear(); this.busy = null; }
  dispose() { this.alive = false; this.cancel(); }
  debug() { return { bufferS: this.bufferS, windows: this.cache.size, bufferedThrough: this.readyThrough(this.wantedP), preparation: this.busy ? 'buffering' : 'ready', ...(this.error ? { bufferError: this.error } : {}) }; }
}
