import type { AchievementDef, SessionRecord } from '../contracts';

/**
 * Helpers for writing achievements (games import this from their `achievements.ts`). Keep it free of
 * registry/game imports: `achievements.ts` here imports the registry, and games import this file.
 */
type Rec = Readonly<SessionRecord>;

/** A summary number (missing or non-numeric = 0). */
export const num = (r: Rec, key: string): number => { const v = Number(r.gameSummary?.[key] ?? 0); return Number.isFinite(v) ? v : 0; };

export const hasEvent = (r: Rec, type: string, pred?: (d: Record<string, number | string | boolean>) => boolean): boolean =>
  r.events.some((e) => e.type === type && (!pred || pred(e.data ?? {})));
export const countEvents = (r: Rec, type: string, pred?: (d: Record<string, number | string | boolean>) => boolean): number =>
  r.events.filter((e) => e.type === type && (!pred || pred(e.data ?? {}))).length;

/** A per-ride feat that only counts in `game`. */
export const feat = (game: string, a: Omit<AchievementDef, 'check'> & { check(r: Rec): boolean }): AchievementDef => ({
  ...a, check: (_p, r) => r.gameId === game && a.check(r),
});

/** A goal on a number accumulated across rides of `game` (`sum`) or the best single ride (`max`). */
export function tally(game: string, key: string, of: (r: Rec) => number, agg: 'sum' | 'max' | 'bits' = 'sum') {
  return (a: Omit<AchievementDef, 'count'> & { goal: number }): AchievementDef => ({
    ...a, count: { key: `${game}.${key}`, agg, of: (r) => (r.gameId === game ? of(r) : 0) },
  });
}
