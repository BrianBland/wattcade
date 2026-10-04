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
    this.holdAheadS = o.holdAheadS ?? 0.25; this.catchUpS = o.catchUpS ?? 1.5; this.catchUp = o.catchUp ?? 4;
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
 * Smooth a coarse media clock (Safari's currentTime can tick in 15–250 ms steps) against a fine monotonic
 * clock: extrapolate from the last anchor at the known rate, re-anchoring when the coarse reading moves away.
 */
export class SmoothedPosition {
  private anchorMedia = 0; private anchorFine = 0; private has = false;
  update(mediaS: number, fineS: number, rate: number, playing: boolean): number {
    if (!this.has || !playing) { this.anchorMedia = mediaS; this.anchorFine = fineS; this.has = true; return mediaS; }
    const pred = this.anchorMedia + (fineS - this.anchorFine) * rate;
    if (Math.abs(mediaS - pred) > 0.08) { this.anchorMedia = mediaS; this.anchorFine = fineS; return mediaS; }
    // drift the anchor gently toward the coarse reading so we never wander
    this.anchorMedia += (mediaS - pred) * 0.05;
    return this.anchorMedia + (fineS - this.anchorFine) * rate;
  }
  reset(): void { this.has = false; }
}
