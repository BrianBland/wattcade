// Pure: carrying the overworld (warm-up lobby) into a game and back. A game that wants a seamless hand-off reads
// `simOpts.lobby` ({ biome, v }) and reports the biome it ends in as `snapshot().hooks.lobbyBiome`; games that don't, ignore both.
import { BIOMES, type BiomeId } from '../games/warmup/sim/terrain';

export interface LobbyExit { biome: BiomeId; v: number; biomeM: number }

/** The lobby's `startBiome` that puts `biome` under the wheels at road distance `d` (biomes cycle every `biomeM`). */
export function startBiomeFor(biome: string, d: number, biomeM: number): number | null {
  const i = (BIOMES as readonly string[]).indexOf(biome);
  if (i < 0 || !(biomeM > 0)) return null;
  const n = BIOMES.length, seg = Math.floor(Math.max(0, d) / biomeM);
  return (((i - seg) % n) + n) % n;
}

/** The biome a finished game asked the overworld to resume in, if any. */
export function lobbyBiomeOf(snapshot: unknown): string | null {
  const b = (snapshot as { hooks?: { lobbyBiome?: unknown } } | null)?.hooks?.lobbyBiome;
  return typeof b === 'string' && (BIOMES as readonly string[]).includes(b) ? b : null;
}
