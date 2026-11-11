import type { BiomeId } from '../../warmup/sim/terrain';

/** The five set-piece families. Each one is a sprint of a different length (see the design doc). */
export type PieceKind = 'smash' | 'leap' | 'loop' | 'dive' | 'outrun';
export type ChaserKind = 'trex' | 'avalanche' | 'wave' | 'boulder';

export interface TourSet { kind: PieceKind; biome: BiomeId; effortS: number; recoveryS: number; finale?: boolean }
export interface Tour { id: string; name: string; warmupS: number; cooldownS: number; sets: TourSet[] }

/** Fixed tours: each set piece lives in a biome that suits it, and the biome changes during the recovery before it. */
export const TOURS: Record<string, Tour> = {
  quick: {
    id: 'quick', name: 'Quick Send', warmupS: 240, cooldownS: 150,
    sets: [
      { kind: 'smash', biome: 'countryside', effortS: 10, recoveryS: 75 },
      { kind: 'leap', biome: 'desert', effortS: 15, recoveryS: 90 },
      { kind: 'outrun', biome: 'volcano', effortS: 45, recoveryS: 140 },
      { kind: 'loop', biome: 'jungle', effortS: 25, recoveryS: 110 },
      { kind: 'leap', biome: 'snow', effortS: 20, recoveryS: 0, finale: true },
    ],
  },
  classic: {
    id: 'classic', name: 'Classic', warmupS: 300, cooldownS: 240,
    sets: [
      { kind: 'smash', biome: 'countryside', effortS: 10, recoveryS: 75 },
      { kind: 'leap', biome: 'desert', effortS: 15, recoveryS: 85 },
      { kind: 'loop', biome: 'jungle', effortS: 25, recoveryS: 100 },
      { kind: 'smash', biome: 'market', effortS: 10, recoveryS: 75 },
      { kind: 'dive', biome: 'underwater', effortS: 45, recoveryS: 130 },
      { kind: 'leap', biome: 'snow', effortS: 15, recoveryS: 85 },
      { kind: 'outrun', biome: 'volcano', effortS: 60, recoveryS: 150 },
      { kind: 'leap', biome: 'volcano', effortS: 20, recoveryS: 0, finale: true },
    ],
  },
};
export const TOUR_IDS = Object.keys(TOURS) as Array<keyof typeof TOURS>;

/** Default medal thresholds as FTP fractions: [bronze, silver, gold]. Tunable per kind (`fullsend.<kind>Bronze` …). */
export const MEDAL_FTP: Record<PieceKind, [number, number, number]> = {
  smash: [1.2, 1.5, 1.8],
  leap: [1.1, 1.25, 1.5],
  loop: [1.05, 1.2, 1.4],
  dive: [1.0, 1.1, 1.25],
  outrun: [0.95, 1.05, 1.15],
};

export function chaserFor(biome: BiomeId): ChaserKind {
  if (biome === 'snow') return 'avalanche';
  if (biome === 'seaside' || biome === 'underwater' || biome === 'marsh') return 'wave';
  if (biome === 'moon' || biome === 'sky') return 'boulder';
  return 'trex';
}

export function pieceTitle(kind: PieceKind, biome: BiomeId): string {
  switch (kind) {
    case 'leap': return ({ volcano: 'Lava Canyon', snow: 'Glacier Crevasse', desert: 'Mesa Gap', seaside: 'Pier Gap', sky: 'Island Gap', moon: 'Crater Jump' } as Partial<Record<BiomeId, string>>)[biome] ?? 'Canyon Leap';
    case 'smash': return ({ countryside: 'Hay Bale Wall', market: 'Market Stalls', snow: 'Ice Wall', autumn: 'Leaf Pile Wall', underwater: 'Coral Wall' } as Partial<Record<BiomeId, string>>)[biome] ?? 'Crate Wall';
    case 'loop': return ({ jungle: 'Vine Loop', market: 'Lantern Loop' } as Partial<Record<BiomeId, string>>)[biome] ?? 'Giant Loop';
    case 'dive': return biome === 'underwater' ? 'Air Run' : 'Flooded Tunnel';
    case 'outrun': return ({ trex: 'T. Rex!', avalanche: 'Avalanche!', wave: 'Tidal Wave!', boulder: 'Boulder!' } as const)[chaserFor(biome)];
  }
}

/** What the rider has to do, one short line for the approach banner. */
export const PIECE_VERB: Record<PieceKind, string> = {
  smash: 'Sprint through the wall', leap: 'Sprint to clear the gap', loop: 'Hold it all the way round',
  dive: 'Surface before the air runs out', outrun: 'Stay ahead of it',
};
