import type { MediaTimeline } from '../../contracts';
import { ANALYSIS_VERSION, CURVE_HZ, type QueueMode, type SongAnalysis } from '../types';
import { buildTimeline } from '../mix/timeline';
import { planMix, progTime, songTime, type MixItem, type PlanEntry } from '../mix/plan';

export const CHUNK_S = 30, CONTEXT_S = 2;
export interface AudioWindow { startS: number; endS: number; bufferStartS: number; buffer: AudioBuffer }
export interface RangeSource {
  prepare(p: number): Promise<void>;
  windows(e: PlanEntry): AudioWindow[];
  readyThrough(p: number): number;
  evict(p: number): void;
  cancel(): void;
  dispose(): void;
  debug(): Record<string, number | string>;
}
export interface WindowResult { buffer: AudioBuffer; analysis: SongAnalysis }
export type WindowLoader = (index: number, startS: number, durationS: number, signal: AbortSignal) => Promise<WindowResult>;

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
/** Fold a tempo onto the octave of a reference tempo (half/double-time ambiguity). */
export function foldTempo(bpm: number, ref: number): number {
  if (!(bpm > 0) || !(ref > 0)) return bpm;
  let b = bpm; while (b < ref / Math.SQRT2) b *= 2; while (b > ref * Math.SQRT2) b /= 2; return b;
}
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
export function mergeWindow(target: SongAnalysis, a: SongAnalysis, bufferStart: number, start: number, end: number): void {
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
  // Remains metadata-confidence: estimated song-wide structure and transitions are not a full-file analysis.
}

/** Bounded playback cache plus an append-only record of committed per-window analysis. */
export class RollingQueue implements RangeSource {
  readonly plan; readonly timeline: MediaTimeline;
  private cache = new Map<string, AudioWindow>();
  private committed = new Set<string>();
  private controller = new AbortController();
  private busy: Promise<void> | null = null;
  private wantedP = 0;
  private error = '';
  private alive = true;
  constructor(readonly items: MixItem[], mode: QueueMode, readonly bufferS: number, private load: WindowLoader) {
    this.plan = planMix(items, mode === 'continuous' ? mode : 'crossfade');
    this.plan.mode = mode;
    for (const t of this.plan.transitions) t.why = 'Estimated from song duration; rolling analysis does not claim phrase or beat matching.';
    this.timeline = { ...buildTimeline(this.plan, items), revision: 0, updateFromS: 0 };
  }
  private key(index: number, start: number) { return `${index}:${start}`; }
  windows(e: PlanEntry): AudioWindow[] { return [...this.cache.entries()].filter(([k]) => k.startsWith(`${e.index}:`)).map(([, w]) => w).sort((a, b) => a.startS - b.startS); }
  prepare(p: number): Promise<void> {
    if (!this.alive) return Promise.reject(new Error('Media queue was closed.'));
    this.wantedP = p;
    if (this.busy) return this.busy;
    const task = this.pump().finally(() => { if (this.busy === task) this.busy = null; });
    this.busy = task; return task;
  }
  private async pump() {
    const controller = this.controller;
    while (this.alive && controller === this.controller) {
      const p = this.wantedP, horizon = Math.min(this.plan.durationS, p + this.bufferS);
      let pending: { e: PlanEntry; start: number; end: number; due: number } | undefined;
      for (const e of this.plan.entries) {
        if (e.endP <= p || e.startP >= horizon) continue;
        const duration = this.items[e.index].analysis.durationS;
        const from = Math.max(0, Math.floor(Math.max(0, songTime(e.segs, Math.max(p, e.startP))) / CHUNK_S) * CHUNK_S);
        for (let start = from; start < Math.min(duration, songTime(e.segs, horizon)) - 1e-5; start += CHUNK_S) {
          if (this.cache.has(this.key(e.index, start))) continue;
          const due = progTime(e.segs, start);
          if (!pending || due < pending.due) pending = { e, start, end: Math.min(duration, start + CHUNK_S), due };
          break;
        }
      }
      if (!pending) { this.error = ''; return; }
      const { e, start, end } = pending, bufferStart = Math.max(0, start - CONTEXT_S);
      const requestedEnd = Math.min(this.items[e.index].analysis.durationS, end + CONTEXT_S);
      try {
        const result = await this.load(e.index, bufferStart, requestedEnd - bufferStart, controller.signal);
        if (!this.alive || controller !== this.controller) return;
        // Search durations can be rounded to whole seconds. Only the final window may end slightly early.
        const tolerance = end === this.items[e.index].analysis.durationS ? 1 : 0.1;
        if (result.buffer.duration + tolerance < end - bufferStart) throw new Error('The server returned an incomplete audio window.');
        const key = this.key(e.index, start);
        this.cache.set(key, { startS: start, endS: end, bufferStartS: bufferStart, buffer: result.buffer });
        if (!this.committed.has(key)) {
          mergeWindow(this.items[e.index].analysis, result.analysis, bufferStart, start, end);
          const revision = (this.timeline.revision ?? 0) + 1;
          Object.assign(this.timeline, buildTimeline(this.plan, this.items), { revision, updateFromS: Math.min(this.timeline.updateFromS ?? Infinity, Math.max(0, progTime(e.segs, start))) });
          this.committed.add(key);
        }
      } catch (e) { if (controller !== this.controller || !this.alive) return; this.error = e instanceof Error ? e.message : String(e); throw e; }
    }
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
