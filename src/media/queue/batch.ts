import type { SongMeta } from '../library/store';
import type { ApplyOpts, ApplyResult, BatchSkip, QueueEntry, TrackBatch, TrackOrigin } from './types';

const PROVIDER_ID = /^(youtube|soundcloud):(.+)$/;
/** Identity for dedupe: provider+providerId when known, else the song id. Online ids are already `<provider>:<providerId>`. */
export function songKey(s: Pick<SongMeta, 'id'> & Partial<Pick<SongMeta, 'provider' | 'providerId'>>): string {
  if (s.provider && s.providerId) return `${s.provider}:${s.providerId}`;
  return s.id;
}
export const entryKey = (e: QueueEntry): string => { const m = PROVIDER_ID.exec(e.songId); return m ? `${m[1]}:${m[2]}` : e.songId; };

/** Pure: insert a batch into a queue. Never mutates its inputs. */
export function applyBatch(queue: readonly QueueEntry[], batch: TrackBatch, o: ApplyOpts): ApplyResult {
  const skipped: BatchSkip[] = [...batch.skipped];
  const base = o.at === 'replace' ? [] : [...queue];
  const at = o.at === 'append' || o.at === 'replace' ? base.length : Math.max(0, Math.min(base.length, Math.floor(o.at.after) + 1));
  const max = o.maxTracks === undefined ? Infinity : Math.max(0, Math.floor(o.maxTracks));
  const seen = new Set(o.dedupe === 'skip' ? base.map(entryKey) : []);
  const add: QueueEntry[] = [];
  batch.songs.forEach((song, i) => {
    const key = songKey(song);
    if (o.dedupe === 'skip' && seen.has(key)) { skipped.push({ ref: song.id, title: song.title, reason: 'duplicate' }); return; }
    if (base.length + add.length >= max) { skipped.push({ ref: song.id, title: song.title, reason: 'limit' }); return; }
    seen.add(key);
    const origin: TrackOrigin = batch.origins?.[i] ?? batch.origin;
    add.push({ songId: song.id, origin });
  });
  return { queue: [...base.slice(0, at), ...add, ...base.slice(at)], added: add.length, skipped };
}

/** A one-song manual batch, so single adds share the same path. */
export const manualBatch = (song: SongMeta): TrackBatch => ({ origin: { kind: 'manual' }, songs: [song], skipped: [] });
export const queueIds = (q: readonly QueueEntry[]): string[] => q.map((e) => e.songId);
