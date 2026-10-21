import type { MediaCoverage, MediaSection, MediaTimeline } from '../../contracts';
import type { SongAnalysis } from '../types';

/** Minimum freeze ahead of the playhead (seconds). */
export const FREEZE_FLOOR_S = 3;
const EPS = 1e-3;

/** The freeze horizon: monotonic, at least playhead + floor, and just past every announced cue. */
export function freezeHorizon(prev: number, playheadS: number, announced: Iterable<number>, coverage?: readonly MediaCoverage[]): number {
  // the floor only freezes what was actually analysed (a not-yet-analysed estimate ahead of the playhead may still fill in)
  const floor = coverage ? Math.min(playheadS + FREEZE_FLOOR_S, coveredThrough(coverage, playheadS)) : playheadS + FREEZE_FLOOR_S;
  let h = Math.max(prev, floor);
  for (const t of announced) h = Math.max(h, t + EPS);
  return h;
}

/**
 * Merge a fresh timeline revision under a freeze horizon: everything starting before `horizon` comes from `prev`
 * unchanged (events, onsets, sections, curve samples); everything from `horizon` on comes from `next`.
 * Song spans, duration and coverage come from `next`. Pure; returns a new timeline.
 */
export function freezeMerge(prev: MediaTimeline, next: MediaTimeline, horizon: number): MediaTimeline {
  const h = Math.min(horizon, next.durationS, prev.durationS);
  if (h <= 0) return { ...next };
  const ev = (a: number[], b: number[]) => [...a.filter((t) => t < h), ...b.filter((t) => t >= h)];
  const kept: MediaSection[] = prev.sections.filter((s) => s.t0 < h).map((s) => ({ ...s }));
  const rest = next.sections.filter((s) => s.t0 >= h).map((s) => ({ ...s }));
  if (kept.length) {
    const last = kept[kept.length - 1];
    // the frozen section keeps its start and kind; its end meets the next fresh section (never before the horizon)
    last.t1 = rest.length ? rest[0].t0 : Math.max(h, next.durationS);
  }
  const n = Math.min(next.intensity.length, prev.intensity.length, Math.ceil(h * next.hz));
  const curve = (a: number[], b: number[]) => [...a.slice(0, n), ...b.slice(n)];
  return {
    ...next,
    beats: ev(prev.beats, next.beats), downbeats: ev(prev.downbeats, next.downbeats), phrases: ev(prev.phrases, next.phrases),
    onsets: [...prev.onsets.filter((o) => o.t < h), ...next.onsets.filter((o) => o.t >= h)],
    sections: [...kept, ...rest],
    intensity: curve(prev.intensity, next.intensity),
    bands: [curve(prev.bands[0], next.bands[0]), curve(prev.bands[1], next.bands[1]), curve(prev.bands[2], next.bands[2])],
    frozenUntilS: h,
  };
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
/** Merge overlapping/abutting [t0, t1] spans. */
export function unionSpans(spans: Array<[number, number]>): Array<[number, number]> {
  const s = [...spans].sort((a, b) => a[0] - b[0]), out: Array<[number, number]> = [];
  for (const [a, b] of s) { const l = out[out.length - 1]; if (l && a <= l[1] + EPS) l[1] = Math.max(l[1], b); else out.push([a, b]); }
  return out;
}

/**
 * Rhythm confidence of song time [t0, t1): how regular the beat grid is (inter-beat-interval spread, gaps excluded)
 * and how close the local tempo is to the song tempo. 0 with fewer than 4 beats.
 */
export function rhythmConfidence(a: SongAnalysis, t0: number, t1: number): number {
  const b = a.beats.filter((t) => t >= t0 && t < t1);
  if (b.length < 4) return 0;
  const ibi = b.slice(1).map((t, i) => t - b[i]).sort((x, y) => x - y), med = ibi[ibi.length >> 1];
  const run = ibi.filter((d) => d < 1.5 * med);
  const mean = run.reduce((s, d) => s + d, 0) / run.length;
  const cv = Math.sqrt(run.reduce((s, d) => s + (d - mean) ** 2, 0) / run.length) / mean;
  const regular = clamp01(1 - cv * 5);
  const local = 60 / mean, song = a.bpm > 0 ? a.bpm : local;
  const ratio = Math.min(local, song) / Math.max(local, song);
  const tempo = [1, 0.5, 2 / 3].reduce((best, r) => Math.max(best, clamp01(1 - Math.abs(ratio - r) * 10)), 0);
  const density = clamp01(run.length / Math.max(1, (t1 - t0) / mean - 1));
  return Math.round(regular * tempo * density * 100) / 100;
}

/** Structure confidence of song time [t0, t1): the least-seen fraction of any section it overlaps, given the analysed spans. */
export function structureConfidence(a: SongAnalysis, spans: Array<[number, number]>, t0: number, t1: number): number {
  let worst = 1;
  for (const s of a.sections) {
    if (s.t1 <= t0 || s.t0 >= t1 || s.t1 - s.t0 <= 0) continue;
    let seen = 0;
    for (const [x, y] of spans) seen += Math.max(0, Math.min(y, s.t1) - Math.max(x, s.t0));
    worst = Math.min(worst, seen / (s.t1 - s.t0));
  }
  return Math.round(clamp01(worst) * 100) / 100;
}

/**
 * Coverage for one song: analysed song-time spans (`windows`, each [start, end)) → per-window confidence, mapped to
 * program time by `map` and clipped to [own0, own1). Adjacent spans keep separate confidences.
 */
export function songCoverage(a: SongAnalysis, windows: Array<[number, number]>, map: (s: number) => number, own0: number, own1: number): MediaCoverage[] {
  const spans = unionSpans(windows), out: MediaCoverage[] = [];
  for (const [s0, s1] of [...windows].sort((x, y) => x[0] - y[0])) {
    const t0 = Math.max(own0, map(s0)), t1 = Math.min(own1, map(s1));
    if (t1 - t0 <= 0.05) continue;
    out.push({ t0: Math.round(t0 * 1000) / 1000, t1: Math.round(t1 * 1000) / 1000, rhythm: rhythmConfidence(a, s0, s1), structure: structureConfidence(a, spans, s0, s1) });
  }
  return out;
}

/** End of the contiguous covered run containing `t` (or `t` itself when `t` is not covered). */
export function coveredThrough(coverage: readonly MediaCoverage[], t: number): number {
  let end = t;
  for (const c of [...coverage].sort((a, b) => a.t0 - b.t0)) if (c.t0 <= end + EPS && c.t1 > end) end = c.t1;
  return end;
}
