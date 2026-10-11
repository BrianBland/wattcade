import type { MediaContext } from '../../../contracts';
import type { Track } from './track';

/** Covers the effort/launch lead-in and the near road's steering targets. */
export const CUE_LOOKAHEAD_S = 10;
export interface TrackCue { id: string; t: number }

/** Identity comes from the target itself, never its index in a revised array. */
export function trackCues(track: Track): TrackCue[] {
  return [
    ...track.rideBlocks.map((b) => ({ id: `cadenza:effort:${b.t0}:${b.phase}:${b.target.min}:${b.target.max}`, t: b.t0 })),
    ...track.stunts.map((s) => ({ id: `cadenza:${s.kind}:${s.t0}`, t: s.t0 })),
    ...track.blocks.map((b) => ({ id: `cadenza:block:${b.t}:${b.lane}:${b.color}`, t: b.t })),
  ].sort((a, b) => a.t - b.t);
}

/** Keep a local horizon too: announce is optional and a source may publish several revisions between frames. */
export class Announcements {
  private seen = new Set<string>();
  private pending: TrackCue[] = [];
  private cursor = 0;
  untilS = 0;

  constructor(private media: MediaContext | undefined) {}

  setTrack(track: Track, p: number) {
    if (!this.media || (!this.media.announce && this.media.timeline.coverage === undefined
      && this.media.timeline.frozenUntilS === undefined)) return;
    this.pending = trackCues(track).filter((c) => c.t >= p);
    // The current effort is shown even when a ride attaches after its start.
    const current = track.rideBlocks.find((b) => b.t0 < p && b.t1 > p);
    if (current) this.pending.unshift({ id: `cadenza:effort:${current.t0}:${current.phase}:${current.target.min}:${current.target.max}`, t: current.t0 });
    this.cursor = 0;
  }

  show(p: number) {
    while (this.cursor < this.pending.length && this.pending[this.cursor].t <= p + CUE_LOOKAHEAD_S) {
      const c = this.pending[this.cursor++];
      if (this.seen.has(c.id)) continue;
      this.seen.add(c.id);
      this.untilS = Math.max(this.untilS, c.t + 0.001);
      this.media?.announce?.(c.id, c.t);
    }
  }
}
