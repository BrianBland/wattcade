// Intensity tiers I–V: the shifters pick a tier, the trainer's resistance follows it, and every turret weapon
// spends it in its own shape. Pure tables + math; no DOM, no rng.

export type Tier = 1 | 2 | 3 | 4 | 5;
export const TIER_COUNT = 5;
export const ROMAN = ['I', 'II', 'III', 'IV', 'V'] as const;
export const roman = (t: number) => ROMAN[clampTier(t) - 1];
export const clampTier = (t: number): Tier => Math.min(5, Math.max(1, Math.round(t))) as Tier;
const at = <T>(table: readonly T[], t: number): T => table[clampTier(t) - 1];

/** Default rated power per tier (ftpFraction at the gearbox reference cadence, Steady intensity). Tunable in the sim. */
export const TIER_FTP_DEFAULT = [0.45, 0.6, 0.75, 0.9, 1.05] as const;

/** Gatling: pellet damage x today's `gatlingDamage`; targets a pellet passes through; splash radius (field units). */
export const GATLING = {
  dmg: [0.6, 1, 1.3, 1.65, 2],
  pierce: [1, 1, 2, 2, 3],
  splash: [0, 0, 0, 1.5, 2.5],
} as const;
/** Fireball: burst / burning-ground radius, burn seconds, share of the damage dealt by the burning ground. */
export const FIREBALL = {
  radius: [4, 5, 6, 7.5, 9],
  burnS: [2, 3, 4, 5, 6],
  burnShare: [0.5, 0.55, 0.6, 0.65, 0.7],
} as const;
/** Railgun pulse: damage per enemy, enemies it passes through, beam width (field units). */
export const RAIL = {
  dmg: [260, 390, 550, 730, 940],
  pierce: [1, 2, 3, 5, Infinity],
  width: [1, 1.5, 2, 3, 4],
} as const;

export const gatlingShape = (t: number) => ({ dmg: at(GATLING.dmg, t), pierce: at(GATLING.pierce, t), splash: at(GATLING.splash, t) });
export const fireballShape = (t: number) => ({ radius: at(FIREBALL.radius, t), burnS: at(FIREBALL.burnS, t), burnShare: at(FIREBALL.burnShare, t) });
export const railShape = (t: number) => ({ dmg: at(RAIL.dmg, t), pierce: at(RAIL.pierce, t), width: at(RAIL.width, t) });

/**
 * How much of the tier's rated output the rider is delivering: watts over the tier's rated watts, capped.
 * On a real trainer the gearbox makes the tier's watts at the reference cadence, so this is mostly a cadence
 * factor (spin under it and the shots shrink); it also stops a high tier from paying out at low effort.
 */
export function effortFactor(ftpFraction: number, ratedFtp: number, cap = 1.2): number {
  if (!(ratedFtp > 0)) return 0;
  return Math.min(cap, Math.max(0, ftpFraction / ratedFtp));
}

/** Fireball lob period: `base` at the reference cadence, quicker when spinning faster (bounded). */
export function fireballPeriod(base: number, cadence: number, refRpm: number): number {
  return base * Math.min(1.7, Math.max(0.65, refRpm / Math.max(1, cadence)));
}

/** The tier a rider making `ftpFraction` belongs in: the highest tier rated at or under it (+8 % slack). */
export function riderTier(ftpFraction: number, rated: (t: Tier) => number): Tier {
  let best: Tier = 1;
  for (let t = 1 as Tier; t <= 5; t = (t + 1) as Tier) if (rated(t) <= ftpFraction * 1.08) best = t;
  return best;
}

export interface BeamTarget { x: number; y: number; r: number }
/**
 * Indices of the targets a straight beam from (ox, oy) along `angle` hits (angle 0 = up the screen, as the
 * turret aims), nearest first, at most `pierce` of them. A target is hit when its circle overlaps the beam.
 */
export function beamHits(targets: readonly BeamTarget[], ox: number, oy: number, angle: number, width: number, reach: number, pierce: number): number[] {
  const sx = Math.sin(angle), sy = -Math.cos(angle);
  const hits: Array<{ i: number; along: number }> = [];
  targets.forEach((e, i) => {
    const dx = e.x - ox, dy = e.y - oy;
    const along = dx * sx + dy * sy, perp = Math.abs(dx * sy - dy * sx);
    if (along > 0 && along <= reach + e.r && perp <= width / 2 + e.r) hits.push({ i, along });
  });
  hits.sort((a, b) => a.along - b.along);
  return hits.slice(0, Number.isFinite(pierce) ? Math.max(1, Math.floor(pierce)) : hits.length).map((h) => h.i);
}
