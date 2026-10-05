// Playback watchdog (pure): turns <video> events into "do nothing / reload / skip to the next channel".

export type PlayEvent = 'loaded' | 'playing' | 'stalled' | 'error' | 'ended' | 'timeout';
export type PlayAction = 'none' | 'retry' | 'skip';
export interface PlayState { fails: number; played: boolean }
export const FRESH: PlayState = { fails: 0, played: false };
/** After this many failures in a row on one channel it is skipped (and marked unavailable). */
export const MAX_FAILS = 3;
/** No `playing` this long after a load counts as a failure. */
export const START_TIMEOUT_MS = 12000;
export const retryDelayMs = (fails: number) => Math.min(6000, 1200 * Math.max(1, fails));

export function onPlayEvent(st: PlayState, ev: PlayEvent): { st: PlayState; action: PlayAction } {
  if (ev === 'loaded') return { st: { ...st, played: false }, action: 'none' };
  if (ev === 'playing') return { st: { fails: 0, played: true }, action: 'none' };
  // ended after playing: reload the same URL for a fresh playlist (not a failure); an "ended" that never played is one
  if (ev === 'ended' && st.played) return { st: { ...st, played: false }, action: 'retry' };
  const fails = st.fails + 1;
  return fails >= MAX_FAILS ? { st: FRESH, action: 'skip' } : { st: { fails, played: false }, action: 'retry' };
}
