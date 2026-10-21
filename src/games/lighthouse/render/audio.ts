// Keeper's Light mix, relative to the shared sound recipes. Keep island balance local to this game.
import { play, type SfxName } from '../../../audio/sfx';

const effects: Partial<Record<SfxName, number>> = {
  // Quiet scenery needs to read above the music and the trainer.
  shoreBreak: 1.5, windGust: 1.4, thunderRoll: 1.2,
  gull: 1.7, baa: 2, puffin: 2, giggle: 1.7, songbird: 1.8, birdTrill: 1.7, whale: 1.5, cheer: 1.3,
  // Long horns, repeated coin showers and bright stings should not dominate the island.
  horn: 0.65, foghorn: 0.65, bell: 0.8, thunder: 0.75,
  build: 0.85, upgrade: 0.8, unlock: 0.75, reward: 0.65, festival: 0.75,
  chime: 0.9, coin: 0.6, select: 0.75, deny: 0.8,
  surge: 0.7, lampOut: 0.8, rescue: 0.8, wreck: 0.75, splash: 0.9, shrine: 0.75,
};

export const ISLAND_MIX = {
  music: { calm: 0.3, festival: 0.28, storm: 0.26 },
  beds: { sea: 1.4, wind: 0.75, rain: 0.75 },
  effects,
};

/** Preserve per-event distance/pitch/rate limits, then apply the game's relative level. */
export function playIsland(name: SfxName, opts: NonNullable<Parameters<typeof play>[1]> = {}) {
  play(name, { ...opts, vol: (opts.vol ?? 1) * (ISLAND_MIX.effects[name] ?? 1) });
}
