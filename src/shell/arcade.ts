// Arcade picker model (pure): game order, per-game ride totals and the carousel layout.
import type { GameModule, Profile, SessionRecord } from '../contracts';

/** Most recently played first (this rider); never-played games keep their registry order (most polished first). */
export function orderGames(games: readonly GameModule[], p: Pick<Profile, 'lastPlayed'>): GameModule[] {
  return games.map((g, i) => ({ g, i, t: p.lastPlayed[g.id] ?? -1 })).sort((a, b) => b.t - a.t || a.i - b.i).map((x) => x.g);
}

export interface GameRides { rides: number; seconds: number; kj: number }

/** Totals per game id from this rider's saved sessions (the store keeps the latest 200). */
export function ridesByGame(records: readonly Pick<SessionRecord, 'gameId' | 'durationS' | 'stats'>[]): Record<string, GameRides> {
  const out: Record<string, GameRides> = {};
  for (const r of records) {
    const g = (out[r.gameId] ??= { rides: 0, seconds: 0, kj: 0 });
    g.rides++; g.seconds += r.durationS || 0; g.kj += r.stats?.kj || 0;
  }
  return out;
}

export interface Slot { x: number; w: number; opacity: number; z: number; /** offset from the selection, wrapped: the row loops */ k: number }
export interface CarouselDims { W: number; activeW: number; sideW: number; gap: number }

/** Offset of card i from the selection on a loop of n: -floor((n-1)/2) .. ceil((n-1)/2). */
export function loopOffset(i: number, active: number, n: number): number {
  const k = (((i - active) % n) + n) % n;
  return k > n / 2 ? k - n : k;
}

/**
 * Horizontal position of each card (left edge, px) in a W-wide strip that loops: the active card is centred and the
 * others line up on either side at sideW by wrapped offset, fading with distance. Cards past the edges are fully
 * transparent (still laid out, so they roll in).
 */
export function carouselSlots(n: number, active: number, d: CarouselDims): Slot[] {
  const cx = d.W / 2, half = d.activeW / 2 + d.gap;
  return Array.from({ length: n }, (_, i) => {
    const k = loopOffset(i, active, n), a = Math.abs(k);
    if (!k) return { x: cx - d.activeW / 2, w: d.activeW, opacity: 1, z: n, k };
    const near = half + (a - 1) * (d.sideW + d.gap);           // distance from centre to the card's near edge
    const x = k > 0 ? cx + near : cx - near - d.sideW;
    const visible = k > 0 ? Math.min(1, (d.W - x) / d.sideW) : Math.min(1, (x + d.sideW) / d.sideW);
    return { x, w: d.sideW, opacity: Math.max(0, Math.min(1, visible)) * Math.max(0.35, 1 - 0.18 * (a - 1)), z: n - a, k };
  });
}

/** Card sizes for a strip W px wide: the focused card takes about half (capped), side cards stay readable. */
export function carouselDims(W: number): CarouselDims {
  const activeW = Math.round(Math.min(640, Math.max(300, W * 0.52)));
  const sideW = Math.round(Math.min(220, Math.max(130, W * 0.17)));
  return { W, activeW: Math.min(activeW, W), sideW, gap: W < 700 ? 10 : 16 };
}

/** "1 h 20 min · 640 kJ" ridden in this game (null before the first ride). The game's own progressLine covers counts and bests. */
export function ridesLine(r: GameRides | undefined): string | null {
  if (!r?.rides) return null;
  const m = Math.round(r.seconds / 60), h = Math.floor(m / 60);
  const time = h ? `${h} h${m % 60 ? ` ${m % 60} min` : ''}` : `${m} min`;
  return `⏱ ${time}${r.kj >= 1 ? ` · ${Math.round(r.kj).toLocaleString('en-US')} kJ` : ''}`;
}
