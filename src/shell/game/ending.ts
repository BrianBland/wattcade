// Ride-end timeline: an optional game recap (GameRenderer.ending), a beat on the final frame, then the rider rides
// back out to the overworld (the summary follows there).
/** Longest recap a game may ask for (seconds). */
export const MAX_RECAP_S = 15;
/** The final frame stays up at least this long, so the end registers before the rider rides out. */
export const MIN_END_S = 1.2;
/** A press this soon after the end doesn't count (it was meant for the game). */
const A_GRACE_S = 0.6;

/**
 * Whether to leave the game `elapsed` seconds into its ending, given the game's recap length `holdS`.
 * The rider leaves after the recap (or MIN_END_S without one); A skips ahead once the grace has passed.
 */
export function endingStep(elapsed: number, holdS: number, pressedA: boolean): { leave: boolean } {
  const hold = Math.max(MIN_END_S, Math.min(MAX_RECAP_S, holdS));
  return { leave: elapsed >= hold || (pressedA && elapsed > A_GRACE_S) };
}
