// World definitions as data: terrain (heightfield or shape function), palette, route + path corridor, prop scatter,
// baked sun and sky. Pure (no three.js, no DOM) so tile workers can rebuild the same world from its id.
import type { VoxelGrid } from '../voxel/grid';
import type { RouteSpline } from './route';
import type { PatchSpec, ShadowLevel } from './sunShadow';

export interface Region { x0: number; x1: number; z0: number; z1: number }

/**
 * What a ridden surface looks like across its width: for lateral offset d (m, + right), route distance s, the voxel
 * `below` the top (0 = surface) and a per-voxel hash in [0, 1) → surface height offset (m) and palette index.
 */
export type SurfaceFn = (d: number, s: number, below: number, r: number, voxel: number) => { dy: number; c: number };

/** A path corridor: the ridden surface, voxelized apart from the terrain at a fixed fine size so it stays flat to the horizon. */
export interface CorridorDef {
  /** Half-width (m). */ half: number;
  surface: SurfaceFn;
  /** Up to `end` (m), lay the surface as voxels sheared to the route's grade (world/roadMesh.ts) instead of world-aligned
   *  voxel steps; ends before sections that stay world-aligned, such as a plank pier. */
  graded?: { end: number };
  /** 'ground' sits on the terrain (terrain under it is skipped); 'span' crosses a void (terrain below is kept). */
  support: 'ground' | 'span';
  /** No corridor before this route distance (m): the path is the terrain until then (the cave floor before a bridge). */
  start?: number;
  /** Ground corridors that cross a void for part of their length (bridge decks, piers): true where s spans. */
  span?(s: number): boolean;
  /** Bed thickness under the surface (m). */ thickness: number;
  /** Terrain is carved this high above the surface (m), so nothing pokes through. */ clearance: number;
  /** Ground corridors: walls this deep (m) at the edges to meet the terrain. */ edgeSkirt?: number;
  /** Voxel size near the rider and past `near` metres (m). */ voxel?: number; farVoxel?: number; near?: number;
  /** Segment length along the route (m) and how far ahead/behind segments are kept. */ seg?: number; range?: number;
}

/** Corridor carving handed to terrain fills: where columns must stop below the path (null = untouched). */
export interface CorridorCarve {
  /** For a column at (x, z) of voxel size s: 'skip' (inside a ground corridor), a cap height (m), or null. */
  at(x: number, z: number, s: number): 'skip' | number | null;
  /** Bed height beneath skipped ground columns; adjacent terrain walls must reach this depth. */
  bedAt?(x: number, z: number, s: number): number | null;
}

export interface TerrainFill {
  /** Fine detail: road lines, step dithering. */ lines: boolean;
  skipSea: boolean; scrub: boolean;
  /** Extra voxels of wall below border columns (hides LOD cracks). */ skirt?: number;
  corridor?: CorridorCarve | null;
  /** Half-size cubes for geometric detail (same origin, half the voxel size), density 0..1. */
  decor?: { grid: VoxelGrid; density: number };
}

export type TerrainDef =
  | { kind: 'height'; fill(g: VoxelGrid, reg: Region, o: TerrainFill): void; /** surface height incl. water */ height(x: number, z: number): number }
  | { kind: 'shape'; y0: number; y1: number; /** palette index of the voxel centred at (x, y, z), 0 = empty */ voxel(x: number, y: number, z: number): number };

/** A prop placed every `every` metres along the route at lateral offset d (± jitter), built on route segments in workers. */
export interface ScatterRule {
  id: string; every: number; d: number | readonly [number, number];
  /** Voxel size of the prop grid (m). */ voxel: number;
  chance?: number; offset?: number;
  /** Skip placements at these route distances. */ skip?(s: number): boolean;
  place(g: VoxelGrid, p: { x: number; y: number; z: number; s: number; d: number; tx: number; tz: number; seed: number }): void;
}

export interface SkyDef {
  zenith: number; horizon: number; fog: number; fogDensity: number;
  /** Direction toward the sun. */ sunDir: readonly [number, number, number]; sunColor: number; sunI: number;
  hemiSky: number; hemiGround: number; hemiI: number;
  /** Point lights (bioluminescence, lava glow). */ lights?: Array<{ p: readonly [number, number, number]; color: number; intensity: number; dist: number }>;
  /** Flat backdrop plane under the world (open sea), at y. */ plane?: { y: number; color: number };
  /** Live sun shadows for props. */ shadows?: boolean;
}

export interface LodDef {
  res: number; minTile: number; splitK: number; skirt: number; flatAOFrom: number; routeAlpha: number;
  hysteresis: number; fade: number; decor: number; decorMax: number; cluster: number;
}

export interface WorldDef {
  id: string;
  palette: { linear: Float32Array };
  /** Random colour variants folded into their base colour for greedy meshing. */ fold?: Uint8Array;
  isWater(v: number): boolean;
  /** Unlit, bloom-bright voxels (bioluminescence, lava). */ isGlow?(v: number): boolean;
  glowIntensity?: number;
  bounds: Region;
  route: RouteSpline;
  /** Camera height above the route (m). */ eye: number;
  /** Riding line (m right of the route centre) and where the eye rests: a point `ahead` m on, `d` m across, `dy` m up. */
  rig?: { lane: number; gaze: { ahead: number; d: number; dy: number } };
  terrain: TerrainDef;
  corridor?: CorridorDef;
  scatter?: ScatterRule[];
  /** Baked terrain self-shadowing: a coarse level over the bounds plus route-anchored patch levels (finest last). */
  sun?: { coarse: ShadowLevel; patches: PatchSpec[] };
  /** Water swell amplitude (m). */ waterAmp?: number;
  sky: SkyDef;
  /** Default look preset (render/looks.ts). */ look: string;
  lod?: Partial<LodDef>;
}

export const LOD_DEFAULTS: LodDef = {
  res: 32, minTile: 4, splitK: 0.85, skirt: 2, flatAOFrom: 1, routeAlpha: 3, hysteresis: 1.3, fade: 0.5, decor: 0.25, decorMax: 0.25, cluster: 2,
};
export const lodOf = (w: WorldDef): LodDef => ({ ...LOD_DEFAULTS, ...w.lod });
