import type { BiomeId } from '../../warmup/sim/terrain';

/** The five set-piece families. Each one is a sprint of a different length (see the design doc). */
export type PieceKind = 'smash' | 'leap' | 'loop' | 'dive' | 'outrun';
export type ChaserKind = 'trex' | 'avalanche' | 'wave' | 'boulder' | 'shark' | 'wheel';

export interface TourSet {
  kind: PieceKind; biome: BiomeId; effortS: number; recoveryS: number; finale?: boolean;
  /** The other branch at the fork before this set: same sprint length, different set piece and scenery. */
  alt?: { kind: PieceKind; biome: BiomeId };
}
/** What a tour trains, said up front: a short focus, one line on why, and the recovery cue between sets. */
export interface TourIntent {
  focus: string; why: string; rest: string;
  /** Short rest is the point (repeatability): recoveries never wait for your heart rate to come down. */
  shortRest?: boolean;
}
export interface Tour { id: string; name: string; warmupS: number; cooldownS: number; sets: TourSet[]; intent: TourIntent }

/** Fixed tours: each set piece lives in a biome that suits it, and the biome changes during the recovery before it. */
export const TOURS: Record<string, Tour> = {
  quick: {
    id: 'quick', name: 'Quick Send', warmupS: 240, cooldownS: 150,
    intent: { focus: 'Mixed sprints', why: 'A bit of everything: a 10 s punch up to a 45 s chase. Hold each zone to the end.', rest: 'Spin easy' },
    sets: [
      { kind: 'smash', biome: 'countryside', effortS: 10, recoveryS: 75, alt: { kind: 'leap', biome: 'seaside' } },
      { kind: 'leap', biome: 'desert', effortS: 15, recoveryS: 90, alt: { kind: 'smash', biome: 'market' } },
      { kind: 'outrun', biome: 'volcano', effortS: 45, recoveryS: 140, alt: { kind: 'dive', biome: 'underwater' } },
      { kind: 'loop', biome: 'jungle', effortS: 25, recoveryS: 110, alt: { kind: 'outrun', biome: 'jungle' } },
      { kind: 'leap', biome: 'snow', effortS: 20, recoveryS: 0, finale: true, alt: { kind: 'loop', biome: 'market' } },
    ],
  },
  classic: {
    id: 'classic', name: 'Classic', warmupS: 300, cooldownS: 240,
    intent: { focus: 'Sprint endurance', why: 'Eight efforts with two long ones late on: hold your zone when you are tired.', rest: 'Spin easy' },
    sets: [
      { kind: 'smash', biome: 'countryside', effortS: 10, recoveryS: 75, alt: { kind: 'leap', biome: 'seaside' } },
      { kind: 'leap', biome: 'desert', effortS: 15, recoveryS: 85, alt: { kind: 'smash', biome: 'autumn' } },
      { kind: 'loop', biome: 'jungle', effortS: 25, recoveryS: 100, alt: { kind: 'outrun', biome: 'jungle' } },
      { kind: 'smash', biome: 'market', effortS: 10, recoveryS: 75, alt: { kind: 'leap', biome: 'snow' } },
      { kind: 'dive', biome: 'underwater', effortS: 45, recoveryS: 130, alt: { kind: 'outrun', biome: 'underwater' } },
      { kind: 'leap', biome: 'snow', effortS: 15, recoveryS: 85, alt: { kind: 'smash', biome: 'snow' } },
      { kind: 'outrun', biome: 'volcano', effortS: 60, recoveryS: 150, alt: { kind: 'dive', biome: 'marsh' } },
      { kind: 'leap', biome: 'volcano', effortS: 20, recoveryS: 0, finale: true, alt: { kind: 'loop', biome: 'jungle' } },
    ],
  },
};
// two focused tours: the same set pieces, built around one training goal each
TOURS.punch = {
  id: 'punch', name: 'Peak Power', warmupS: 180, cooldownS: 180,
  intent: { focus: 'Peak power', why: 'Six short all-out bursts with full rest: go hard from GO, top-end power.', rest: 'Full rest · spin very easy' },
  sets: [
    { kind: 'smash', biome: 'countryside', effortS: 8, recoveryS: 150, alt: { kind: 'leap', biome: 'seaside' } },
    { kind: 'leap', biome: 'desert', effortS: 10, recoveryS: 150, alt: { kind: 'smash', biome: 'market' } },
    { kind: 'smash', biome: 'autumn', effortS: 10, recoveryS: 165, alt: { kind: 'leap', biome: 'snow' } },
    { kind: 'leap', biome: 'volcano', effortS: 12, recoveryS: 165, alt: { kind: 'smash', biome: 'market' } },
    { kind: 'smash', biome: 'snow', effortS: 10, recoveryS: 180, alt: { kind: 'leap', biome: 'seaside' } },
    { kind: 'leap', biome: 'desert', effortS: 12, recoveryS: 0, finale: true, alt: { kind: 'smash', biome: 'countryside' } },
  ],
};
TOURS.repeat = {
  id: 'repeat', name: 'Back to Back', warmupS: 180, cooldownS: 240,
  intent: { focus: 'Repeatability', why: 'Six 30 s efforts on short rest: pace the first so you can hold the last.', rest: 'Short rest · keep spinning', shortRest: true },
  sets: [
    { kind: 'loop', biome: 'jungle', effortS: 30, recoveryS: 70, alt: { kind: 'outrun', biome: 'volcano' } },
    { kind: 'outrun', biome: 'volcano', effortS: 30, recoveryS: 70, alt: { kind: 'leap', biome: 'desert' } },
    { kind: 'dive', biome: 'underwater', effortS: 30, recoveryS: 70, alt: { kind: 'outrun', biome: 'snow' } },
    { kind: 'leap', biome: 'snow', effortS: 30, recoveryS: 70, alt: { kind: 'loop', biome: 'market' } },
    { kind: 'outrun', biome: 'jungle', effortS: 30, recoveryS: 70, alt: { kind: 'dive', biome: 'marsh' } },
    { kind: 'loop', biome: 'market', effortS: 30, recoveryS: 0, finale: true, alt: { kind: 'leap', biome: 'volcano' } },
  ],
};
export const TOUR_IDS = Object.keys(TOURS) as Array<keyof typeof TOURS>;

/** ISO-ish week number from a day count since 1970-01-01 (a Thursday), weeks starting Monday. */
export const weekOf = (day: number) => Math.floor((day + 3) / 7);
const LAND: BiomeId[] = ['countryside', 'seaside', 'desert', 'market', 'volcano', 'jungle', 'snow', 'autumn'];
const WATER: BiomeId[] = ['underwater', 'marsh'];
const WEEK_PLANS = [
  { focus: 'Peak power', why: 'Short all-out bursts with full rest: go hard from GO.', rest: 'Full rest · spin very easy',
    n: 6, effort: [8, 10, 12], recovery: [150, 180], kinds: ['smash', 'leap'] as PieceKind[] },
  { focus: 'Repeatability', why: 'Hard efforts on short rest: pace the first so you can hold the last.', rest: 'Short rest · keep spinning', shortRest: true,
    n: 6, effort: [20, 25, 30], recovery: [60, 75], kinds: ['loop', 'outrun', 'leap', 'dive'] as PieceKind[] },
  { focus: 'Sprint endurance', why: 'Long sprints: settle into your zone and hold it to the line.', rest: 'Spin easy',
    n: 5, effort: [40, 45, 60], recovery: [120, 150], kinds: ['outrun', 'dive', 'loop', 'leap'] as PieceKind[] },
];
/**
 * This week's tour: the same for everyone all week (seeded by the week number), and a different focus each week.
 * Pure: a small local PRNG seeded from the week, so the tour never depends on the ride's rng.
 */
export function weeklyTour(week: number): Tour {
  let a = (week * 2654435761) >>> 0 || 1;
  const rnd = () => { a ^= a << 13; a >>>= 0; a ^= a >>> 17; a ^= a << 5; a >>>= 0; return a / 4294967296; };
  const pick = <T,>(xs: readonly T[]) => xs[Math.floor(rnd() * xs.length) % xs.length];
  const plan = WEEK_PLANS[((week % WEEK_PLANS.length) + WEEK_PLANS.length) % WEEK_PLANS.length];
  const where = (k: PieceKind, not: BiomeId | null): BiomeId => { const pool = (k === 'dive' ? WATER : LAND).filter((b) => b !== not); return pick(pool); };
  const sets: TourSet[] = [];
  let prev: BiomeId | null = null;
  for (let i = 0; i < plan.n; i++) {
    const kind = pick(plan.kinds), biome = where(kind, prev);
    const altKind = pick(plan.kinds.filter((k) => k !== kind)), alt = { kind: altKind, biome: where(altKind, biome) };
    const last = i === plan.n - 1;
    sets.push({ kind, biome, effortS: pick(plan.effort), recoveryS: last ? 0 : Math.round(plan.recovery[0] + rnd() * (plan.recovery[1] - plan.recovery[0])), ...(last ? { finale: true } : {}), alt });
    prev = biome;
  }
  return { id: 'weekly', name: 'This Week', warmupS: 150, cooldownS: 180, sets, intent: { focus: plan.focus, why: plan.why, rest: plan.rest, ...(plan.shortRest ? { shortRest: true } : {}) } };
}

/** Default medal thresholds as FTP fractions: [bronze, silver, gold]. Tunable per kind (`fullsend.<kind>Bronze` …). */
export const MEDAL_FTP: Record<PieceKind, [number, number, number]> = {
  smash: [1.2, 1.5, 1.8],
  leap: [1.1, 1.25, 1.5],
  loop: [1.05, 1.2, 1.4],
  dive: [1.0, 1.1, 1.25],
  outrun: [0.95, 1.05, 1.15],
};

/** How far (m) each chaser reaches ahead of its feet: where its nose hits the cave bluff. */
export const CHASER_REACH: Record<ChaserKind, number> = { trex: 7.5, shark: 7, wheel: 4, boulder: 3.5, avalanche: 2, wave: 2.5 };
export function chaserFor(biome: BiomeId): ChaserKind {
  if (biome === 'snow') return 'avalanche';
  if (biome === 'underwater') return 'shark';
  if (biome === 'jungle') return 'wheel';
  if (biome === 'seaside' || biome === 'marsh') return 'wave';
  if (biome === 'moon' || biome === 'sky') return 'boulder';
  return 'trex';
}

export function pieceTitle(kind: PieceKind, biome: BiomeId): string {
  switch (kind) {
    case 'leap': return ({ volcano: 'Lava Canyon', snow: 'Glacier Crevasse', desert: 'Mesa Gap', seaside: 'Pier Gap', sky: 'Island Gap', moon: 'Crater Jump' } as Partial<Record<BiomeId, string>>)[biome] ?? 'Canyon Leap';
    case 'smash': return ({ countryside: 'Hay Bale Wall', market: 'Market Stalls', snow: 'Ice Wall', autumn: 'Leaf Pile Wall', underwater: 'Coral Wall' } as Partial<Record<BiomeId, string>>)[biome] ?? 'Crate Wall';
    case 'loop': return ({ jungle: 'Vine Loop', market: 'Lantern Loop' } as Partial<Record<BiomeId, string>>)[biome] ?? 'Giant Loop';
    case 'dive': return biome === 'underwater' ? 'Air Run' : 'Flooded Tunnel';
    case 'outrun': return ({ trex: 'T. Rex!', avalanche: 'Avalanche!', wave: 'Tidal Wave!', boulder: 'Boulder!', shark: 'Shark!', wheel: 'Stone Wheel!' } as const)[chaserFor(biome)];
  }
}

/** What the rider has to do, one short line for the approach banner. */
export const PIECE_VERB: Record<PieceKind, string> = {
  smash: 'Sprint through the wall', leap: 'Sprint to clear the gap', loop: 'Hold it all the way round',
  dive: 'Surface before the air runs out', outrun: 'Stay ahead of it',
};

/** Rough ride length in minutes (default approach and pacing), for the tour picker. */
export function tourMinutes(t: Tour, approachS = 20): number {
  return Math.round((t.warmupS + t.cooldownS + t.sets.reduce((a, s) => a + s.effortS + s.recoveryS + approachS + 4, 0)) / 60);
}
