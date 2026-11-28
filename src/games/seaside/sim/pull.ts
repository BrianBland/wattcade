// Sprints: fishing pulls and set-piece sprints. Pure; the sim feeds it power as a fraction of FTP.

export interface PullTuning {
  /** Target for the smallest / largest fish (fraction of FTP). */
  minFtp: number; maxFtp: number;
  /** Pull length at the target for the smallest / largest fish (s). */
  minS: number; maxS: number;
  /** Below the target the fish only tires on its own while you keep pedalling: the smallest / largest fish
   *  takes this long (s). Not sprinting costs time, never the catch. */
  tireMinS: number; tireMaxS: number;
  /** "Pedalling" for that: power at or above this fraction of FTP. */
  pedalFtp: number;
  /** A fish that is still fighting after this long slips the hook, so a stopped rider never soft-locks. */
  giveUpS: number;
  /** Personal target (fraction of FTP) for a sprint of `size` lasting `durS`, from the shared power profile; null
   *  (or absent) keeps the FTP band above. */
  personal?: (size: number, durS: number) => number | null;
}

/** Storyboard defaults (110–150 % FTP × 6–25 s); story.ts sizes its effort plan with these. */
export const PULL_DEFAULTS: PullTuning = { minFtp: 1.1, maxFtp: 1.5, minS: 6, maxS: 25, tireMinS: 110, tireMaxS: 190, pedalFtp: 0.3, giveUpS: 240 };

const lerp = (a: number, b: number, k: number) => a + (b - a) * Math.max(0, Math.min(1, k));

/** How long a fish of `size` takes to tire on its own (no sprint). */
export const tireS = (size: number, t: Pick<PullTuning, 'tireMinS' | 'tireMaxS'>) => lerp(t.tireMinS, t.tireMaxS, size);

/** A sprint's target for a fish (or set piece) of `size` 0..1. */
export const pullTarget = (size: number, t: Pick<PullTuning, 'minFtp' | 'maxFtp' | 'minS' | 'maxS' | 'personal'>) => {
  const s = lerp(t.minS, t.maxS, size);
  return { ftp: t.personal?.(size, s) ?? lerp(t.minFtp, t.maxFtp, size), s };
};

export interface PersonalPullTuning {
  /** Share of your best mean power for the sprint's length that the smallest / largest fish asks for. */
  shareMin: number; shareMax: number;
  /** Personal targets stay inside this band (fraction of FTP). */
  floorFtp: number; ceilFtp: number;
}
/** Defaults chosen so a rider with a typical curve gets the storyboard 110–150 % FTP targets back. */
export const PERSONAL_PULL_DEFAULTS: PersonalPullTuning = { shareMin: 0.49, shareMax: 0.9, floorFtp: 1, ceilFtp: 2.2 };
/** The personal share of your best for a fish of `size`. */
export const personalShare = (size: number, t: Pick<PersonalPullTuning, 'shareMin' | 'shareMax'>) => lerp(t.shareMin, t.shareMax, size);

export type PullResult = 'pulling' | 'landed' | 'escaped';

/**
 * `fish`: the scene waits while the fish fights. At or above the target its stamina drains with work (a held
 * target lands it in `durS`); below it, the fish only tires on its own (over `tireS`) while you pedal. It lands at 0,
 * or escapes after `giveUpS`.
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

  tick(dt: number, ftpFrac: number, t: Pick<PullTuning, 'tireMinS' | 'tireMaxS' | 'pedalFtp' | 'giveUpS'>): PullResult {
    this.t += dt;
    const k = Math.max(0, ftpFrac) / this.ftp;
    if (k >= 1) this.onTargetS += dt;
    if (this.setPiece) {
      this.sum += Math.min(1.5, k) * dt;
      return this.t >= this.durS ? 'landed' : 'pulling';
    }
    if (k >= 1) this.stamina -= (k * dt) / this.durS;
    else if (ftpFrac >= t.pedalFtp) this.stamina -= dt / tireS(this.size, t);
    if (this.stamina <= 0) { this.stamina = 0; return 'landed'; }
    return this.t >= t.giveUpS ? 'escaped' : 'pulling';
  }

  /** Mean power / target over the window (set pieces) or the fight (fish). */
  spectacle(): number { return this.setPiece ? this.sum / Math.max(1e-6, Math.min(this.t, this.durS)) : 1 - this.stamina; }
  /** Held the target for at least half the planned sprint. */
  hit(): boolean { return this.onTargetS >= 0.5 * this.durS; }
}
