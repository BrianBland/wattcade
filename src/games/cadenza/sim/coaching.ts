export type Direction = 'harder' | 'easier' | null;
export interface Coaching { direction: Direction; pending: Direction; pendingS: number; clearS: number }
export const freshCoaching = (): Coaching => ({ direction: null, pending: null, pendingS: 0, clearS: 0 });

/** Require sustained deviation, then a little time back in range before clearing the cue. */
export function advanceCoaching(state: Coaching, wanted: Direction, dt: number): Coaching {
  const next = { ...state };
  if (wanted === null) {
    next.pending = null; next.pendingS = 0; next.clearS += dt;
    if (next.clearS >= 0.6) next.direction = null;
  } else {
    next.clearS = 0;
    if (next.pending !== wanted) { next.pending = wanted; next.pendingS = 0; }
    next.pendingS += dt;
    if (next.pendingS >= 1.5) next.direction = wanted;
  }
  return next;
}
