import type { SongMeta } from '../library/store';
import type { SongAnalysis } from '../types';
import { CHUNK_S, CONTEXT_S, estimatedAnalysis, mergeWindow } from './rolling';

/**
 * Picker-time preview analysis for queued streamed songs (memory only; never persisted, never reused by the ride).
 * One fetch at a time; the first queued streamed track gets `firstTrackWindows`, the rest one window each.
 */
export type PreviewState = 'waiting' | 'loading' | 'partial' | 'complete' | 'busy' | 'error';
export interface PreviewWindow { startS: number; endS: number; bufferStartS: number; spec: SongAnalysis['spec'] }
export interface PartialPreview {
  id: string; durationS: number; state: PreviewState;
  /** Contiguous analyzed span from 0 s. */
  coveredS: number;
  /** Merged analysis; only [0, coveredS) is real. confidence stays 'metadata'. */
  analysis: SongAnalysis;
  windows: PreviewWindow[];
  error?: string;
}
/** Analyze `durationS` seconds of the song starting at `startS`; times in the result are relative to `startS`. */
export type PreviewLoader = (song: SongMeta, startS: number, durationS: number, signal: AbortSignal) => Promise<SongAnalysis>;

export const isBusyError = (e: unknown) => (e as { status?: number })?.status === 429 || /busy/i.test(e instanceof Error ? e.message : String(e));

export interface PrefetchOptions {
  load: PreviewLoader;
  onChange?: () => void;
  firstTrackWindows?: number;
  retryMs?: number;
  setTimer?: (fn: () => void, ms: number) => unknown; clearTimer?: (h: unknown) => void;
}

export class PreviewPrefetch {
  private songs: SongMeta[] = [];
  private previews = new Map<string, PartialPreview>();
  private paused = false; private closed = false;
  private running: { id: string; controller: AbortController } | null = null;
  private retry: unknown = null;
  private readonly firstN: number; private readonly retryMs: number;
  private readonly setT: NonNullable<PrefetchOptions['setTimer']>; private readonly clearT: NonNullable<PrefetchOptions['clearTimer']>;
  constructor(private o: PrefetchOptions) {
    this.firstN = Math.max(1, o.firstTrackWindows ?? 3); this.retryMs = o.retryMs ?? 4000;
    this.setT = o.setTimer ?? ((fn, ms) => setTimeout(fn, ms)); this.clearT = o.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
  }
  get(id: string): PartialPreview | undefined { return this.previews.get(id); }
  get active(): string | null { return this.running?.id ?? null; }

  /** The current queue (in order). Only streamed songs (with sourceUrl) are prefetched; removed songs are dropped from memory. */
  setQueue(queue: readonly SongMeta[]) {
    if (this.closed) return;
    const seen = new Set<string>();
    this.songs = queue.filter((m) => !!m.sourceUrl && m.durationS > 0 && !seen.has(m.id) && !!seen.add(m.id));
    for (const id of [...this.previews.keys()]) if (!seen.has(id)) this.previews.delete(id);
    if (this.running && !seen.has(this.running.id)) this.abortRunning();
    for (const m of this.songs) if (!this.previews.has(m.id)) this.previews.set(m.id, {
      id: m.id, durationS: m.durationS, state: 'waiting', coveredS: 0, analysis: estimatedAnalysis(m.durationS), windows: [] });
    this.changed(); this.pump();
  }
  /** Pause while a search runs (the resolver allows two jobs). Resuming continues where it left off. */
  pause(on: boolean) { if (this.closed) return; this.paused = on; if (on) this.abortRunning(); else this.pump(); }
  /** Start pressed / picker closed: stop everything and free memory. */
  cancel() { this.closed = true; this.abortRunning(); if (this.retry) { this.clearT(this.retry); this.retry = null; } this.previews.clear(); }

  private abortRunning() {
    if (!this.running) return;
    const p = this.previews.get(this.running.id);
    if (p && p.state === 'loading') p.state = p.coveredS > 0 ? 'partial' : 'waiting';
    this.running.controller.abort(); this.running = null; this.changed();
  }
  private changed() { this.o.onChange?.(); }
  private wantWindows(i: number, m: SongMeta) { return Math.min(Math.ceil(m.durationS / CHUNK_S - 1e-6), i === 0 ? this.firstN : 1); }
  /** Next (song, window) to fetch: queue order, first window of every track before the first track's extra windows. */
  private next(): { song: SongMeta; index: number } | null {
    for (const pass of [1, Infinity]) for (const [i, m] of this.songs.entries()) {
      const p = this.previews.get(m.id)!;
      if (p.state === 'error') continue;
      const have = p.windows.length, want = Math.min(pass, this.wantWindows(i, m));
      if (have < want) return { song: m, index: have };
    }
    return null;
  }
  private pump() {
    if (this.closed || this.paused || this.running || this.retry) return;
    const job = this.next(); if (!job) return;
    const { song, index } = job, p = this.previews.get(song.id)!;
    const start = index * CHUNK_S, end = Math.min(song.durationS, start + CHUNK_S);
    const bufferStart = Math.max(0, start - CONTEXT_S), bufferEnd = Math.min(song.durationS, end + CONTEXT_S);
    const controller = new AbortController(); this.running = { id: song.id, controller };
    p.state = 'loading'; p.error = undefined; this.changed();
    this.o.load(song, bufferStart, bufferEnd - bufferStart, controller.signal).then((a) => {
      if (this.running?.controller !== controller || this.previews.get(song.id) !== p) return;
      this.running = null;
      mergeWindow(p.analysis, a, bufferStart, start, end);
      p.windows.push({ startS: start, endS: end, bufferStartS: bufferStart, spec: a.spec });
      p.coveredS = end;
      p.state = end >= song.durationS - 1e-6 ? 'complete' : 'partial';
      this.changed(); this.pump();
    }, (e) => {
      if (this.running?.controller !== controller) return;
      this.running = null;
      if (isBusyError(e)) {
        p.state = 'busy';
        this.retry = this.setT(() => { this.retry = null; if (p.state === 'busy') p.state = p.coveredS ? 'partial' : 'waiting'; this.pump(); }, this.retryMs);
      } else { p.state = 'error'; p.error = e instanceof Error ? e.message : String(e); this.pump(); }
      this.changed();
    });
  }
}
