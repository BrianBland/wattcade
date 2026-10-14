// The eight cut-out aliens: which sim kind each draws, its puppet folder, motion settings and display scale.
// Pure data (no DOM): shared by the renderer, the pose math and scripts/td-pack-aliens.ts.
import type { Kind } from '../../sim/defs';

export type SpeciesId = 'skitter' | 'glider' | 'warrior' | 'ram' | 'bulwark' | 'broodmother' | 'stalker' | 'tyrant';

export interface Species {
  id: SpeciesId; kind: Kind; name: string;
  /** Source folder under docs/towerdefense/concept/codex/ (branch towerdefense-concept-art). */
  source: string;
  /** Downscale applied when packing: ~2x the largest on-screen size on a 2x iPad Pro, with headroom. */
  packScale: number;
  /** Display length multiplier on top of the shared radius rule (see alienLengthUnits). */
  display: number;
  /** Fraction of its own body length a walker travels per gait cycle (feet stay planted); fliers use gaitHz (wingbeats/s). */
  stride: number; gaitHz: number;
  legAmp: number; bodyAmp: number; tailAmp: number;
  flying?: boolean; thud?: boolean; tint?: boolean;
  /** Composed live every frame (a single boss on screen) instead of from cached frames. */
  live?: boolean;
}

export const SPECIES: Record<SpeciesId, Species> = {
  skitter: { id: 'skitter', kind: 'mini', name: 'Skitter', source: 'skitter-parts', packScale: 0.27, display: 1.3, stride: 0.146, gaitHz: 2.6, legAmp: 1, bodyAmp: 0.8, tailAmp: 7 },
  glider: { id: 'glider', kind: 'dart', name: 'Glider', source: 'glider-parts', packScale: 0.24, display: 1.15, stride: 0, gaitHz: 1.1, legAmp: 0.4, bodyAmp: 0.5, tailAmp: 6, flying: true },
  warrior: { id: 'warrior', kind: 'brute', name: 'Warrior', source: 'warrior-parts', packScale: 0.4, display: 1, stride: 0.167, gaitHz: 1.5, legAmp: 1, bodyAmp: 1, tailAmp: 3 },
  ram: { id: 'ram', kind: 'charger', name: 'Ram', source: 'ram-parts', packScale: 0.36, display: 1, stride: 0.167, gaitHz: 1.4, legAmp: 1.5, bodyAmp: 0.5, tailAmp: 2, thud: true },
  bulwark: { id: 'bulwark', kind: 'armor', name: 'Bulwark', source: 'bulwark-parts', packScale: 0.47, display: 1, stride: 0.094, gaitHz: 1.1, legAmp: 1.1, bodyAmp: 0.35, tailAmp: 2 },
  broodmother: { id: 'broodmother', kind: 'carrier', name: 'Broodmother', source: 'broodmother-parts', packScale: 0.53, display: 1, stride: 0.115, gaitHz: 1, legAmp: 0.85, bodyAmp: 0.6, tailAmp: 2 },
  stalker: { id: 'stalker', kind: 'prism', name: 'Stalker', source: 'stalker-parts', packScale: 0.39, display: 1, stride: 0.177, gaitHz: 1.8, legAmp: 1, bodyAmp: 1.2, tailAmp: 7, tint: true },
  tyrant: { id: 'tyrant', kind: 'boss', name: 'Hive Tyrant', source: 'hive-tyrant-parts', packScale: 0.76, display: 1, stride: 0.146, gaitHz: 0.8, legAmp: 0.9, bodyAmp: 0.8, tailAmp: 4, live: true },
};
export const SPECIES_LIST: Species[] = Object.values(SPECIES);
export const SPECIES_OF_KIND = Object.fromEntries(SPECIES_LIST.map((s) => [s.kind, s])) as Record<Kind, Species>;

/** Shared size rule: body length (head to tail, field units) = collision radius x 2.6 x ALIEN_SCALE x species display. */
export const ALIEN_SCALE = 1.25;
export const alienLengthUnits = (radius: number, s: Species): number => radius * 2.6 * ALIEN_SCALE * s.display;
/** Soft brood-colour outline strength baked into cached frames (0 = off). */
export const OUTLINE_ALPHA = 0.25;
