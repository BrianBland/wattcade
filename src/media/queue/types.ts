import type { SongMeta } from '../library/store';
import type { QueueMode } from '../types';

/** Persisted queue schema. Anything without `v === QUEUE_SCHEMA` is ignored and cleared (no migration, owner decision). */
export const QUEUE_SCHEMA = 2;
/** Saved selection record version. Records with another `v` are skipped, never overwritten. */
export const SELECTION_SCHEMA = 1;
/** Playlist import cap (owner decision: 100). Matches the resolver's MAX_PLAYLIST_ITEMS; raise both together. */
export const PLAYLIST_IMPORT_LIMIT = 100;

export type TrackOrigin =
  | { kind: 'manual' }
  | { kind: 'library' }
  | { kind: 'playlist'; provider: 'youtube'; playlistId: string; url: string; title?: string; index: number; importedAt: number }
  | { kind: 'selection'; selectionId: string }
  /** Reserved for later radio-style discovery. */
  | { kind: 'radio'; seedId: string; sessionId: string };

/** Provenance is per queue entry: the same song may be queued from a playlist and by hand. */
export interface QueueEntry { songId: string; origin: TrackOrigin }

export type SkipReason = 'unavailable' | 'private' | 'duplicate' | 'limit' | 'error';
export interface BatchSkip { ref: string; title?: string; reason: SkipReason; detail?: string }

export interface TrackBatch {
  /** Batch-level origin; used for every song unless `origins[i]` is given (e.g. per-entry playlist index). */
  origin: TrackOrigin;
  songs: SongMeta[];
  origins?: TrackOrigin[];
  /** Entries already skipped upstream (e.g. resolver partial import); passed through to the result. */
  skipped: BatchSkip[];
}

export type InsertAt = 'append' | 'replace' | { after: number };
export interface ApplyOpts { at: InsertAt; dedupe: 'skip' | 'allow'; maxTracks?: number }
export interface ApplyResult { queue: QueueEntry[]; added: number; skipped: BatchSkip[] }

export interface PersistedQueue { v: typeof QUEUE_SCHEMA; entries: QueueEntry[]; mode: QueueMode }

/** Playlist selections are snapshots: restoring uses the stored entries, never a fresh fetch. */
export interface SavedSelection {
  v: typeof SELECTION_SCHEMA; id: string; profileId: string; name: string; favorite?: boolean;
  entries: QueueEntry[]; mode: QueueMode;
  createdAt: number; updatedAt: number; lastRiddenAt?: number;
}
