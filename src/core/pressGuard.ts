// Commit-press debounce (pure; safe in sims). A menu "commit" (buy, confirm, open, start, back) re-arms the guard;
// another commit inside the hold window is swallowed, so a double tap or a bouncing button acts once.
// Navigation (D-pad, steppers) should not go through a guard. Time is whatever clock the caller passes:
// sims pass their own sim seconds, the shell passes performance.now() / 1000.

/** Default hold between two accepted commits, in seconds. */
export const COMMIT_GUARD_S = 0.25;

export class PressGuard {
  private last = -Infinity;
  constructor(public holdS = COMMIT_GUARD_S) {}
  /** True (and re-arms) when `now` is at least the hold after the last accepted commit; false swallows this one. */
  pass(now: number, holdS = this.holdS): boolean {
    if (holdS > 0 && now >= this.last && now - this.last < holdS) return false;
    this.last = now;
    return true;
  }
  /** Start a hold without a commit (e.g. a menu that just appeared under the rider's finger). */
  arm(now: number): void { this.last = now; }
  /** Forget the last commit (the next one always passes). */
  reset(): void { this.last = -Infinity; }
}
