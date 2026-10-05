/**
 * Keeps the fixed-step sim locked to the music (pure). The shell calls update() every frame with the
 * player's program position and the sim's; the result multiplies the loop's time scale:
 *   in step → 1 ± up to `maxTrim` (a gentle proportional nudge),
 *   sim ahead (or audio stalled / paused) → 0 (hold),
 *   sim far behind → `catchUp` (fast-forward).
 */
export interface SyncOpts { gain?: number; maxTrim?: number; holdAheadS?: number; catchUpS?: number; catchUp?: number }

export class ProgramSync {
  readonly gain: number; readonly maxTrim: number; readonly holdAheadS: number; readonly catchUpS: number; readonly catchUp: number;
  /** Last error (audio − sim), seconds; for the debug overlay. */
  errS = 0;
  trim = 1;
  constructor(o: SyncOpts = {}) {
    this.gain = o.gain ?? 0.5; this.maxTrim = o.maxTrim ?? 0.02;
    this.holdAheadS = o.holdAheadS ?? 0.25; this.catchUpS = o.catchUpS ?? 0.5; this.catchUp = o.catchUp ?? 4;
  }

  update(audioPosS: number | null, simPosS: number, playing: boolean): number {
    if (!playing || audioPosS === null) { this.trim = 0; return 0; }
    const err = audioPosS - simPosS;
    this.errS = err;
    if (err < -this.holdAheadS) this.trim = 0;
    else if (err > this.catchUpS) this.trim = this.catchUp;
    else this.trim = 1 + Math.max(-this.maxTrim, Math.min(this.maxTrim, this.gain * err));
    return this.trim;
  }
}

/**
 * Smooth a coarse, jittery media clock (currentTime) against a fine monotonic clock: a small phase-locked
 * estimate that advances at the playback rate, eases toward the readings, and snaps only on a real jump (seek).
 */
export class SmoothedPosition {
  private est = 0; private lastFine = 0; private has = false;
  update(mediaS: number, fineS: number, rate: number, playing: boolean): number {
    if (!this.has || !playing) { this.est = mediaS; this.lastFine = fineS; this.has = playing; return mediaS; }
    this.est += Math.max(0, fineS - this.lastFine) * rate; this.lastFine = fineS;
    const err = mediaS - this.est;
    if (Math.abs(err) > 0.5) this.est = mediaS; else this.est += err * 0.08;
    return this.est;
  }
  reset(): void { this.has = false; }
}
