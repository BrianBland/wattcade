import type { MediaTimeline } from '../contracts';

/** Game-neutral numbers for a queue preview (pure). Games add their own effort estimate via mediaPreview. */
export interface QueueRating {
  durationS: number; songs: number; drops: number; builds: number;
  /** Mean intensity 0..1. */
  energy: number;
  /** Share of the program inside drops. */
  dropShare: number;
  bpmMin: number; bpmMax: number;
  /** 1..5 intensity stars. */
  stars: number;
}

export function rateQueue(tl: MediaTimeline): QueueRating {
  const dur = tl.durationS || 1;
  const energy = tl.intensity.length ? tl.intensity.reduce((s, x) => s + x, 0) / tl.intensity.length : 0;
  const dropS = tl.sections.filter((s) => s.kind === 'drop').reduce((s, x) => s + (x.t1 - x.t0), 0);
  const bpms = tl.songs.map((s) => s.bpm).filter((b) => b > 0);
  const dropShare = dropS / dur;
  const score = 0.55 * energy + 0.45 * Math.min(1, dropShare * 2);
  return {
    durationS: tl.durationS, songs: tl.songs.length,
    drops: tl.sections.filter((s) => s.kind === 'drop').length, builds: tl.sections.filter((s) => s.kind === 'build').length,
    energy: Math.round(energy * 100) / 100, dropShare: Math.round(dropShare * 100) / 100,
    bpmMin: bpms.length ? Math.round(Math.min(...bpms)) : 0, bpmMax: bpms.length ? Math.round(Math.max(...bpms)) : 0,
    stars: Math.max(1, Math.min(5, Math.round(1 + score * 5))),
  };
}
