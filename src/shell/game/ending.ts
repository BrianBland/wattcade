// Ride-end timeline: an optional game recap (GameRenderer.ending), then the result banner, then leave.
/** Longest recap a game may ask for (seconds). */
export const MAX_RECAP_S = 15;

/**
 * What the ending phase shows `elapsed` seconds in, given the game's recap length `holdS`.
 * A skips the recap (returns the new hold), and on the banner continues once it has been up for a moment.
 */
export function endingStep(elapsed: number, holdS: number, pressedA: boolean, resultS: number): { show: 'recap' | 'banner'; holdS: number; leave: boolean } {
  const hold = Math.max(0, Math.min(MAX_RECAP_S, holdS));
  if (elapsed < hold) return pressedA && elapsed > 0.6 ? { show: 'banner', holdS: elapsed, leave: false } : { show: 'recap', holdS: hold, leave: false };
  const onBanner = elapsed - hold;
  return { show: 'banner', holdS: hold, leave: onBanner > 0.6 && (pressedA || onBanner >= resultS) };
}
