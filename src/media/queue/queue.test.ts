import { describe, expect, it } from 'vitest';
import type { SongMeta } from '../library/store';
import { applyBatch, entryKey, loadQueue, makeSelection, manualBatch, parsePersistedQueue, PLAYLIST_IMPORT_LIMIT, queueIds, selectionsFor, serializeQueue, songKey,
  type QueueEntry, type TrackBatch, type TrackOrigin } from './index';

const song = (id: string, over: Partial<SongMeta> = {}): SongMeta => ({ id, source: id.split(':')[0], title: id, artist: 'A', durationS: 180, addedAt: 0, status: 'ready', ...over });
const manual: TrackOrigin = { kind: 'manual' };
const q = (...ids: string[]): QueueEntry[] => ids.map((songId) => ({ songId, origin: manual }));
const pl = (index: number): TrackOrigin => ({ kind: 'playlist', provider: 'youtube', playlistId: 'PL1', url: 'https://www.youtube.com/playlist?list=PL1', index, importedAt: 5 });
const batch = (ids: string[], extra: Partial<TrackBatch> = {}): TrackBatch => ({ origin: { kind: 'library' }, songs: ids.map((i) => song(i)), skipped: [], ...extra });

describe('applyBatch', () => {
  it('appends, replaces and inserts after an index without mutating input', () => {
    const base = q('local:a', 'local:b'); const frozen = JSON.stringify(base);
    expect(queueIds(applyBatch(base, batch(['local:c']), { at: 'append', dedupe: 'skip' }).queue)).toEqual(['local:a', 'local:b', 'local:c']);
    expect(queueIds(applyBatch(base, batch(['local:c']), { at: 'replace', dedupe: 'skip' }).queue)).toEqual(['local:c']);
    expect(queueIds(applyBatch(base, batch(['local:c', 'local:d']), { at: { after: 0 }, dedupe: 'skip' }).queue)).toEqual(['local:a', 'local:c', 'local:d', 'local:b']);
    expect(queueIds(applyBatch(base, batch(['local:c']), { at: { after: -1 }, dedupe: 'skip' }).queue)[0]).toBe('local:c');
    expect(queueIds(applyBatch(base, batch(['local:c']), { at: { after: 99 }, dedupe: 'skip' }).queue).at(-1)).toBe('local:c');
    expect(JSON.stringify(base)).toBe(frozen);
  });
  it('dedupes by song id and provider id, within the batch too, or allows when asked', () => {
    const base = q('youtube:abc', 'local:a');
    const b: TrackBatch = { origin: manual, skipped: [], songs: [song('youtube:abc'), song('local:a'), song('local:n'), song('local:n'), song('yt-alias', { provider: 'youtube', providerId: 'abc' })] };
    const r = applyBatch(base, b, { at: 'append', dedupe: 'skip' });
    expect(queueIds(r.queue)).toEqual(['youtube:abc', 'local:a', 'local:n']);
    expect(r.added).toBe(1); expect(r.skipped.map((s) => [s.ref, s.reason])).toEqual([['youtube:abc', 'duplicate'], ['local:a', 'duplicate'], ['local:n', 'duplicate'], ['yt-alias', 'duplicate']]);
    expect(applyBatch(base, b, { at: 'append', dedupe: 'allow' }).added).toBe(5);
    expect(songKey(song('soundcloud:x'))).toBe('soundcloud:x'); expect(entryKey({ songId: 'youtube:abc', origin: manual })).toBe('youtube:abc');
  });
  it('respects maxTracks and passes upstream skips through', () => {
    const r = applyBatch(q('local:a'), batch(['local:b', 'local:c', 'local:d'], { skipped: [{ ref: 'youtube:gone', reason: 'unavailable' }] }), { at: 'append', dedupe: 'skip', maxTracks: 3 });
    expect(queueIds(r.queue)).toEqual(['local:a', 'local:b', 'local:c']);
    expect(r.skipped.map((s) => s.reason)).toEqual(['unavailable', 'limit']);
    expect(applyBatch([], batch(['local:a']), { at: 'replace', dedupe: 'skip', maxTracks: 0 }).added).toBe(0);
  });
  it('keeps per-entry origins and the batch origin as fallback', () => {
    const r = applyBatch(q('local:a'), batch(['youtube:1', 'youtube:2'], { origin: pl(0), origins: [pl(1)] }), { at: 'append', dedupe: 'skip' });
    expect(r.queue.map((e) => e.origin)).toEqual([manual, pl(1), pl(0)]);
    expect(applyBatch([], manualBatch(song('local:x')), { at: 'append', dedupe: 'skip' }).queue).toEqual(q('local:x'));
    expect(PLAYLIST_IMPORT_LIMIT).toBe(100);
  });
});

describe('persisted queue v2', () => {
  const mem = (init: Record<string, string>) => { const m = new Map(Object.entries(init)); return { m, getItem: (k: string) => m.get(k) ?? null, removeItem: (k: string) => void m.delete(k) }; };
  it('round-trips v2 and drops malformed entries', () => {
    const raw = serializeQueue([...q('local:a'), { songId: 'youtube:1', origin: pl(1) }], 'crossfade');
    expect(parsePersistedQueue(raw)).toEqual({ v: 2, entries: [...q('local:a'), { songId: 'youtube:1', origin: pl(1) }], mode: 'crossfade' });
    expect(parsePersistedQueue(JSON.stringify({ v: 2, mode: 'automix', entries: [{ songId: 'x', origin: { kind: 'bogus' } }, { songId: '', origin: manual }, 7] }))!.entries).toEqual([]);
  });
  it('ignores and clears old {ids, mode} data and garbage, with no migration', () => {
    for (const raw of [JSON.stringify({ ids: ['local:a'], mode: 'automix' }), '{bad', JSON.stringify({ v: 3, entries: [], mode: 'automix' }), JSON.stringify({ v: 2, entries: [], mode: 'disco' })]) {
      const s = mem({ 'wattcade.media.queue.p1': raw });
      expect(loadQueue(s, 'p1')).toEqual({ v: 2, entries: [], mode: 'automix' });
      expect(s.m.has('wattcade.media.queue.p1')).toBe(false);
    }
    const s = mem({ 'wattcade.media.queue.p1': serializeQueue(q('local:a'), 'continuous') });
    expect(loadQueue(s, 'p1').entries).toEqual(q('local:a')); expect(s.m.size).toBe(1);
    expect(loadQueue(mem({}), 'p1').entries).toEqual([]);
  });
});

describe('saved selections', () => {
  it('are profile-bound, versioned snapshots', () => {
    const entries = [{ songId: 'youtube:1', origin: pl(1) }];
    const sel = makeSelection({ id: 's1', profileId: 'p1', name: '  Long ride  ', entries, mode: 'automix', now: 10 });
    expect(sel).toMatchObject({ v: 1, profileId: 'p1', name: 'Long ride', createdAt: 10, updatedAt: 10 });
    entries[0].songId = 'changed';
    expect(sel.entries[0].songId).toBe('youtube:1');
    expect(() => makeSelection({ id: 's', profileId: 'p1', name: ' ', entries: [], mode: 'automix', now: 0 })).toThrow();
    const other = { ...sel, id: 's2', profileId: 'p2' }, future = { ...sel, id: 's3', v: 2 }, broken = { ...sel, id: 's4', entries: [{}] };
    expect(selectionsFor([sel, other, future, broken, null], 'p1').map((s) => s.id)).toEqual(['s1']);
  });
});
