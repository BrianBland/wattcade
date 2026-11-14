// Bridge decks: where the road crosses itself, the later pass rides a deck over the earlier one (level.bridges).
// Pure geometry for the renderer: the deck's centre line, and which road stretches run on and under it.
import { levelGeometry, type Pt, type TdLevel } from '../../sim/level';

export interface Deck {
  at: Pt;
  /** The over pass's centre line across the deck (world units). */
  line: Pt[];
  /** Deck width across the road (units). */
  width: number;
  /** Walk distances (from the spawn edge) of the stretch under the deck and the one on it. */
  under: [number, number];
  over: [number, number];
}

const cache = new WeakMap<TdLevel, Deck[]>();
/** The level's decks; none for a level without bridges. */
export function decks(level: TdLevel): Deck[] {
  const hit = cache.get(level); if (hit) return hit;
  const geo = levelGeometry(level), hw = level.roadHalfWidth, reach = hw * 3.4, step = 0.5;
  const out: Deck[] = [];
  for (const b of level.bridges ?? []) {
    // runs of the walk within reach of the crossing: the first is under, the last is on the deck
    const runs: Array<[number, number]> = [];
    for (let d = 0; d <= geo.roadLength; d += step) {
      const p = geo.roadAt(d), inside = Math.hypot(p.x - b.x, p.y - b.y) < reach, last = runs[runs.length - 1];
      if (!inside) continue;
      if (last && d - last[1] <= step * 1.5) last[1] = d; else runs.push([d, d]);
    }
    if (runs.length < 2) continue;
    const under = runs[0], over = runs[runs.length - 1], line: Pt[] = [];
    for (let d = over[0]; d <= over[1] + 1e-6; d += 1) { const p = geo.roadAt(d); line.push({ x: p.x, y: p.y }); }
    out.push({ at: b, line, width: hw * 2 + 2.2, under, over });
  }
  cache.set(level, out);
  return out;
}

/** True when a walker at walk distance `d` is under one of the decks (hidden by it). */
export function underDeck(ds: readonly Deck[], d: number): boolean {
  return ds.some(k => d >= k.under[0] && d <= k.under[1]);
}
/** True when a point is on a deck's footprint (where a deck hides what is below it). */
export function onDeck(ds: readonly Deck[], p: Pt, margin = 0): boolean {
  return ds.some(k => Math.hypot(p.x - k.at.x, p.y - k.at.y) < Math.hypot(k.width, (k.over[1] - k.over[0])) / 2 + margin);
}
