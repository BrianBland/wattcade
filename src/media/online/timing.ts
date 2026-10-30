import type { ProfileSettings } from '../../contracts';

export const MEDIA_STAGES = ['fetch', 'decode', 'downmix', 'analysis', 'commit'] as const;
export type MediaStage = typeof MEDIA_STAGES[number];
export interface MediaTimingRow { stage: MediaStage; count: number; failed: number; active: number; peak: number; totalMs: number; lastMs: number; maxMs: number }
/** Run-local aggregates only. No URLs, titles, sample arrays, console output or persistent telemetry. */
export class MediaTimings {
  private rows = new Map<MediaStage, MediaTimingRow>();
  constructor(private now = () => performance.now()) {}
  private begin(stage: MediaStage) {
    let row = this.rows.get(stage);
    if (!row) { row = { stage, count: 0, failed: 0, active: 0, peak: 0, totalMs: 0, lastMs: 0, maxMs: 0 }; this.rows.set(stage, row); }
    const started = this.now(); row.peak = Math.max(row.peak, ++row.active);
    return (failed: boolean) => {
      const ms = Math.max(0, this.now() - started);
      row.active--; row.count++; if (failed) row.failed++;
      row.totalMs += ms; row.lastMs = ms; row.maxMs = Math.max(row.maxMs, ms);
    };
  }
  async measure<T>(stage: MediaStage, task: () => Promise<T>): Promise<T> {
    const done = this.begin(stage);
    try { const value = await task(); done(false); return value; } catch (e) { done(true); throw e; }
  }
  sync<T>(stage: MediaStage, task: () => T): T {
    const done = this.begin(stage);
    try { const value = task(); done(false); return value; } catch (e) { done(true); throw e; }
  }
  snapshot(): MediaTimingRow[] { return MEDIA_STAGES.map(stage => this.rows.get(stage)).filter((r): r is MediaTimingRow => !!r).map(r => ({ ...r })); }
}
export function createMediaTimings(settings: Pick<ProfileSettings, 'debugStats'>): MediaTimings | undefined {
  return settings.debugStats === true ? new MediaTimings() : undefined;
}
export function measureMedia<T>(timings: MediaTimings | undefined, stage: MediaStage, task: () => Promise<T>): Promise<T> {
  return timings ? timings.measure(stage, task) : task();
}
export function measureMediaSync<T>(timings: MediaTimings | undefined, stage: MediaStage, task: () => T): T {
  return timings ? timings.sync(stage, task) : task();
}
