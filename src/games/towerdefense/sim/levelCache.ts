import type { LevelSpec } from './campaign';
import { BAKED_LEVELS, specKey } from './baked';
import { generateLevel } from './generator';
import type { TdLevel } from './level';

type MapSpec = Pick<LevelSpec, 'seed' | 'roadStyle' | 'ground' | 'pads'>;

/**
 * Generated maps by spec key, shared by every session on the page. A map is a pure function of its key, so a map
 * primed from elsewhere (the renderer's background workers) is exactly the one the sim would generate itself:
 * priming only saves time, it never changes a run.
 */
const CACHE = new Map<string, TdLevel>();

/** The map for `spec` without generating it: baked, cached or primed, else null. */
export function knownLevel(spec: MapSpec): TdLevel | null {
  const key = specKey(spec);
  return CACHE.get(key) ?? BAKED_LEVELS[key] ?? null;
}

/** The map for `spec`, generated (synchronously) the first time it is needed; the name comes from the spec. */
export function levelFor(spec: MapSpec & Pick<LevelSpec, 'name'>): TdLevel {
  let l = knownLevel(spec);
  if (!l) { l = generateLevel(spec.seed, { style: spec.roadStyle, ground: spec.ground, pads: spec.pads }).level; CACHE.set(specKey(spec), l); }
  return { ...l, name: spec.name };
}

/** Store a map generated elsewhere for `spec` (it must come from `generateLevel` for the same spec). */
export function primeLevel(spec: MapSpec, level: TdLevel): void {
  const key = specKey(spec);
  if (!CACHE.has(key) && !BAKED_LEVELS[key]) CACHE.set(key, level);
}
