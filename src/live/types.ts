// Live updates: what every version of the app (one per push to main) publishes. See NOTES.md.

/** A tunable's default in one version (values the TuningRegistry applies live). */
export interface TuneDefault { d: number | boolean | string; min?: number; max?: number }

/** One game in one version. Hashes compare equal when that layer didn't change. */
export interface LiveGameEntry {
  /** Entry chunk (exports `module: GameModule`), relative to the version's base URL. */
  entry: string;
  /** Content hash of the sim side (tunable defaults blanked), of the renderer side, and of the tunable defaults. */
  sim: string; render: string; tuning: string;
  /** GameModule.snapshotFormat (default 1): a renderer only draws snapshots of its own format. */
  snapshot: number;
}

export interface LiveVersion {
  sha: string; short: string; message: string;
  /** Commit time, epoch ms. */
  time: number;
  /** Absolute URL this version is served from (ends with /). */
  base: string;
  /** Hash of everything outside the games (shell, core, devices, shared audio): a change needs a reload. */
  shell: string;
  games: Record<string, LiveGameEntry>;
}

/** live/feed.json on the `live` alias: recent versions, oldest first. */
export interface LiveFeed { versions: LiveVersion[] }

/** live/manifest.json in each version: its feed entry plus every game's tunable defaults. */
export interface LiveManifest extends LiveVersion { tuning: Record<string, Record<string, TuneDefault>> }

export const FEED_MAX = 60;
