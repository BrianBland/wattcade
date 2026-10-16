// Wave-end salvage sweep: glints rise from the round's husks and stream into the outpost while a tally card counts up.
// Scrap was already credited during the wave (so mid-wave builds stay possible); this is the presentation. Pure helpers.
export const SWEEP_S = 0.9, RISE_S = 0.3, FLY_S = 1.0, STAGGER_S = 0.035, CARD_S = 3, MAX_GLINTS = 28;

export interface Pt { x: number; y: number }
export interface Glint { from: Pt; delay: number; /** share of the wave's salvage this glint carries */ value: number }

/** Spreads the wave's salvage over up to MAX_GLINTS glints, one per husk (cycled if fewer husks than glints). */
export function planGlints(husks: readonly Pt[], kills: number, salvage: number, fallback: Pt): Glint[] {
  const n = Math.max(1, Math.min(MAX_GLINTS, kills || 1)), src = husks.length ? husks : [fallback];
  return Array.from({ length: n }, (_, i) => ({ from: src[i % src.length], delay: i * STAGGER_S, value: salvage / n }));
}

/** Glint position at `age` seconds: rises off the husk, then arcs into `to` (the outpost). Null before start / after landing. */
export function glintAt(g: Glint, to: Pt, age: number): { x: number; y: number; lift: number; landed: boolean } | null {
  const a = age - g.delay;
  if (a < 0) return null;
  if (a < RISE_S) { const k = a / RISE_S; return { x: g.from.x, y: g.from.y, lift: 3 * Math.sin((k * Math.PI) / 2), landed: false }; }
  const k = Math.min(1, (a - RISE_S) / FLY_S), e = k * k * (3 - 2 * k);
  const cx = (g.from.x + to.x) / 2, cy = Math.min(g.from.y, to.y) - 12; // arc over the field
  const u = 1 - e, x = u * u * g.from.x + 2 * u * e * cx + e * e * to.x, y = u * u * g.from.y + 2 * u * e * cy + e * e * to.y;
  return { x, y, lift: 3 * (1 - e), landed: k >= 1 };
}

/** Salvage shown on the card at `age`: the sum of landed glints. */
export function landedValue(glints: readonly Glint[], to: Pt, age: number): number {
  let v = 0;
  for (const g of glints) { const p = glintAt(g, to, age); if (p?.landed) v += g.value; }
  return v;
}
/** When the last glint lands. */
export const sweepEnd = (glints: readonly Glint[]) => (glints.length ? glints[glints.length - 1].delay : 0) + RISE_S + FLY_S + 1e-6;

/** The trench light sweep: the lit head's lane fraction (0 at the spawn, 1 at the outpost) at `age`, or null when done. */
export const sweepHead = (age: number) => (age < 0 || age > SWEEP_S ? null : age / SWEEP_S);

/** Card opacity: in fast, hold, out over the last 0.4 s of CARD_S (or of a skip). */
export function cardAlpha(age: number, skippedAt = Infinity): number {
  const end = Math.min(CARD_S, skippedAt + 0.25);
  if (age < 0 || age >= end) return 0;
  return Math.min(1, age / 0.15, (end - age) / 0.4);
}
