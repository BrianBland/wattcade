import type { QueueMode } from '../types';
import { QUEUE_SCHEMA, SELECTION_SCHEMA, type PersistedQueue, type QueueEntry, type SavedSelection, type TrackOrigin } from './types';

const MODES: readonly QueueMode[] = ['continuous', 'automix', 'crossfade'];
const KINDS = ['manual', 'library', 'playlist', 'selection', 'radio'];
const isObj = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);
const isOrigin = (o: unknown): o is TrackOrigin => isObj(o) && KINDS.includes(o.kind);
const isEntry = (e: unknown): e is QueueEntry => isObj(e) && typeof e.songId === 'string' && !!e.songId && isOrigin(e.origin);

export const queueStorageKey = (profileId: string) => `wattcade.media.queue.${profileId}`;

/** Parse a stored queue; returns null for missing, old (pre-v2) or malformed data. */
export function parsePersistedQueue(raw: string | null): PersistedQueue | null {
  if (!raw) return null;
  let v: unknown;
  try { v = JSON.parse(raw); } catch { return null; }
  if (!isObj(v) || v.v !== QUEUE_SCHEMA || !Array.isArray(v.entries) || !MODES.includes(v.mode)) return null;
  return { v: QUEUE_SCHEMA, entries: v.entries.filter(isEntry), mode: v.mode };
}
export const serializeQueue = (entries: readonly QueueEntry[], mode: QueueMode): string =>
  JSON.stringify({ v: QUEUE_SCHEMA, entries: [...entries], mode } satisfies PersistedQueue);

/** Read the profile's queue from a Storage; unrecognised data (incl. the old `{ids, mode}`) is cleared. */
export function loadQueue(storage: Pick<Storage, 'getItem' | 'removeItem'>, profileId: string): PersistedQueue {
  const key = queueStorageKey(profileId), raw = storage.getItem(key);
  const q = parsePersistedQueue(raw);
  if (!q && raw !== null) storage.removeItem(key);
  return q ?? { v: QUEUE_SCHEMA, entries: [], mode: 'automix' };
}

/** Accept a saved selection record only if it is the current version and well-formed. */
export function parseSelection(v: unknown): SavedSelection | null {
  if (!isObj(v) || v.v !== SELECTION_SCHEMA || typeof v.id !== 'string' || typeof v.profileId !== 'string' || typeof v.name !== 'string'
    || !Array.isArray(v.entries) || !v.entries.every(isEntry) || !MODES.includes(v.mode) || typeof v.createdAt !== 'number' || typeof v.updatedAt !== 'number') return null;
  return v as SavedSelection;
}
/** Selections visible to a profile (bound per profile); unknown versions are skipped, not rewritten. */
export const selectionsFor = (records: readonly unknown[], profileId: string): SavedSelection[] =>
  records.map(parseSelection).filter((s): s is SavedSelection => !!s && s.profileId === profileId);
export function makeSelection(o: { id: string; profileId: string; name: string; entries: QueueEntry[]; mode: QueueMode; now: number }): SavedSelection {
  const name = o.name.trim();
  if (!name) throw new Error('Name the selection.');
  return { v: SELECTION_SCHEMA, id: o.id, profileId: o.profileId, name: name.slice(0, 80), entries: o.entries.map((e) => ({ ...e })), mode: o.mode, createdAt: o.now, updatedAt: o.now };
}
