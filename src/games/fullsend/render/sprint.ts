// Pure helpers for the sprint screen and the end-of-tour card: pace, the set piece seen from afar, escalation, the ghost
// call-out and the results rows. Kept out of the renderer so they are unit tested in Node.
import type { FullSendSnapshot, PieceView, SetResult } from '../sim/sim';
import { MEDAL_NAMES, medalFor, type Medal } from '../sim/physics';

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

/** The medal your sprint is on course for: mean power so far against the targets (the whole sprint counts). */
export const pace = (p: Pick<PieceView, 'live' | 'th'>): Medal => medalFor(p.live, p.th);
export const PACE_TEXT = ['PUSH!', 'BRONZE PACE', 'SILVER PACE', 'GOLD PACE'] as const;

/**
 * The set piece you are sprinting for, while it is still beyond the view: it sits on the horizon from GO and grows and
 * slides toward the right edge as you close in (apparent size ∝ 1 / distance), then hands over to the real one entering
 * from the right. Buffer px; `viewAheadM` = metres of road visible ahead of the rider. Null when not shown.
 */
export function horizonPreview(d: number, viewAheadM: number, W: number, horizonY: number, roadY: number):
  { x: number; y: number; sc: number; alpha: number } | null {
  if (!(d > viewAheadM) || !(viewAheadM > 0)) return null;
  const k = clamp(viewAheadM / d, 0, 1); // 1 = at the edge of the view
  const alpha = clamp((k - 0.02) / 0.08, 0, 1) * (1 - clamp((k - 0.8) / 0.2, 0, 1));
  if (alpha <= 0) return null;
  return { x: W * (0.6 + 0.4 * k), y: horizonY + (roadY - horizonY) * k, sc: k, alpha };
}

/** How hard the sprint is going, 0..1, for the escalation (speed lines, heat, shake, music): your pace and your power now. */
export function sprintIntensity(s: Pick<FullSendSnapshot, 'phase' | 'ftpFrac'>, p: Pick<PieceView, 'live' | 'th'> | null): number {
  if (s.phase !== 'effort' || !p) return 0;
  const lo = p.th[0] * 0.75, span = Math.max(0.05, p.th[2] - lo);
  return clamp(0.6 * clamp((p.live - lo) / span, 0, 1) + 0.4 * clamp((s.ftpFrac - lo) / span, 0, 1), 0, 1);
}

/** Your gap to the ghost of your best run on this tour, as a short call-out (null without a ghost). */
export function ghostCall(x: number, ghostX: number | null): { text: string; ahead: boolean } | null {
  if (ghostX == null || !Number.isFinite(ghostX)) return null;
  const gap = Math.round(x - ghostX);
  if (Math.abs(gap) < 5) return { text: 'LEVEL WITH YOUR BEST', ahead: true };
  const km = Math.abs(gap) >= 1000;
  const n = km ? `${(Math.abs(gap) / 1000).toFixed(1)} km` : `${Math.abs(gap)} m`;
  return gap > 0 ? { text: `+${n} ON YOUR BEST`, ahead: true } : { text: `${n} BEHIND YOUR BEST`, ahead: false };
}

export interface CardRow { title: string; medal: Medal; medalName: string; watts: string; pb: boolean }
/** One row per set piece on the end-of-tour card: what it was, the medal, mean / peak watts, and a new best. */
export function cardRows(results: readonly SetResult[]): CardRow[] {
  return results.map((r) => ({
    title: r.title, medal: r.medal, medalName: MEDAL_NAMES[r.medal],
    watts: r.avgW > 0 ? `${r.avgW} W avg · ${r.peakW} W peak · ${r.effortS} s` : `${r.effortS} s`, pb: r.pb,
  }));
}
/** The card's headline: score, and how it compares with your best on this tour. */
export function cardHeadline(score: number, bestScore: number): string {
  if (!bestScore) return `${score} PTS · FIRST RIDE OF THIS TOUR`;
  return score > bestScore ? `${score} PTS · NEW BEST (+${score - bestScore})` : `${score} PTS · BEST ${bestScore}`;
}
/** The end-of-tour card shows once the last set piece is done (through the cool-down and after). */
export const cardVisible = (s: Pick<FullSendSnapshot, 'phase' | 'phaseT' | 'results' | 'setCount' | 'menu'>) =>
  !s.menu && ((s.phase === 'cooldown' && s.phaseT > 4) || s.phase === 'done') && s.results.length > 0;
