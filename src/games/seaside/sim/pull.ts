// Sprints: fishing pulls and set-piece sprints. Pure; the sim feeds it power as a fraction of FTP.

export interface PullTuning {
  /** Target for the smallest / largest fish (fraction of FTP). */
  minFtp: number; maxFtp: number;
  /** Pull length at the target for the smallest / largest fish (s). */
  minS: number; maxS: number;
  /** Below the target the fish still tires, at this fraction of the rate (catches are easy). */
  softRate: number;
  /** A fish that is still fighting after this long slips the hook, so a stopped rider never soft-locks. */
  giveUpS: number;
}

/** Storyboard defaults (110–150 % FTP × 6–25 s); story.ts sizes its effort plan with these. */
export const PULL_DEFAULTS: PullTuning = { minFtp: 1.1, maxFtp: 1.5, minS: 6, maxS: 25, softRate: 0.5, giveUpS: 90 };

const lerp = (a: number, b: number, k: number) => a + (b - a) * Math.max(0, Math.min(1, k));

/** A sprint's target for a fish (or set piece) of `size` 0..1. */
export const pullTarget = (size: number, t: Pick<PullTuning, 'minFtp' | 'maxFtp' | 'minS' | 'maxS'>) =>
  ({ ftp: lerp(t.minFtp, t.maxFtp, size), s: lerp(t.minS, t.maxS, size) });

export type PullResult = 'pulling' | 'landed' | 'escaped';

/**
 * `fish`: the scene waits while the fish fights; its stamina drains with work (full rate at or above the target,
 * `softRate` × power/target below it) and it lands at 0, or escapes after `giveUpS`.
 * `setPiece` (the Big One, breakthrough, re-entry): un-winnable, always resolves after its window; effort only
 * scales the spectacle (mean power / target, capped at 1.5).
 */
export class Pull {
  t = 0;
  stamina = 1;
  /** Seconds at or above the target. */
  onTargetS = 0;
  private sum = 0;
  constructor(readonly size: number, readonly ftp: number, readonly durS: number, readonly setPiece: boolean) {}

  tick(dt: number, ftpFrac: number, giveUpS: number, softRate: number): PullResult {
    this.t += dt;
    const k = Math.max(0, ftpFrac) / this.ftp;
    if (k >= 1) this.onTargetS += dt;
    if (this.setPiece) {
      this.sum += Math.min(1.5, k) * dt;
      return this.t >= this.durS ? 'landed' : 'pulling';
    }
    this.stamina -= ((k >= 1 ? k : softRate * k) * dt) / this.durS;
    if (this.stamina <= 0) { this.stamina = 0; return 'landed'; }
    return this.t >= giveUpS ? 'escaped' : 'pulling';
  }

  /** Mean power / target over the window (set pieces) or the fight (fish). */
  spectacle(): number { return this.setPiece ? this.sum / Math.max(1e-6, Math.min(this.t, this.durS)) : 1 - this.stamina; }
  /** Held the target for at least half the planned sprint. */
  hit(): boolean { return this.onTargetS >= 0.5 * this.durS; }
}
