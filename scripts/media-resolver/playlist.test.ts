import { describe, expect, it } from 'vitest';
import { MAX_PLAYLIST_ITEMS, playlist, playlistUrl, PlaylistChoiceRequired } from './playlist';
import { trackUrl, type RunExtractor } from './service';

const list = 'PLrAXtmErZgOeiKm4sgNOknGvNjby9efdf';
const vid = (n: number) => `vid${String(n).padStart(8, '0')}`;
const entry = (n: number, over: Record<string, unknown> = {}) => ({ id: vid(n), title: `Song ${n}`, channel: 'Ch', duration: 180, ...over });
const fake = (out: unknown, calls: string[][] = []): RunExtractor => async (args) => { calls.push(args); return typeof out === 'string' ? out : JSON.stringify(out); };

describe('playlist URLs', () => {
  it('normalizes public playlist links', () => {
    for (const u of [`https://www.youtube.com/playlist?list=${list}`, `https://music.youtube.com/playlist?list=${list}&si=x`, `https://m.youtube.com/playlist?list=${list}`])
      expect(playlistUrl(u)).toEqual({ listId: list, url: `https://www.youtube.com/playlist?list=${list}` });
  });
  it('rejects malformed and unsupported links', () => {
    for (const u of ['nope', `http://www.youtube.com/playlist?list=${list}`, `https://youtube.com.evil.test/playlist?list=${list}`,
      `https://user:p@youtube.com/playlist?list=${list}`, `https://youtube.com:444/playlist?list=${list}`, 'https://youtube.com/playlist',
      'https://youtube.com/playlist?list=bad!id', `https://youtu.be/${vid(1)}?list=${list}`, `https://soundcloud.com/a/sets/b`,
      'https://youtube.com/playlist?list=RDdQw4w9WgXcQabc', 'https://youtube.com/playlist?list=WLxxxxxxxxxx', `https://youtube.com/channel/x?list=${list}`])
      expect(() => playlistUrl(u)).toThrow();
  });
  it('requires an explicit choice for watch URLs with both v and list', () => {
    const mixed = `https://www.youtube.com/watch?v=${vid(1)}&list=${list}`;
    expect(() => playlistUrl(mixed)).toThrow(PlaylistChoiceRequired);
    expect(() => playlistUrl(mixed, 'track')).toThrow('single tracks');
    expect(playlistUrl(mixed, 'playlist').listId).toBe(list);
    expect(playlistUrl(`https://www.youtube.com/watch?list=${list}`).listId).toBe(list);
    // Single-track resolution is unchanged and ignores list.
    expect(trackUrl(mixed).url).toBe(`https://www.youtube.com/watch?v=${vid(1)}`);
  });
});

describe('playlist extraction', () => {
  it('uses metadata-only, bounded, safe extractor args', async () => {
    const calls: string[][] = [];
    await playlist(`https://www.youtube.com/playlist?list=${list}`, { limit: 5 }, fake({ title: 'P', entries: [entry(1)] }, calls));
    const a = calls[0];
    expect(a).toEqual(expect.arrayContaining(['--yes-playlist', '--flat-playlist', '--skip-download', '--ignore-config', '--no-plugin-dirs']));
    expect(a).not.toContain('--no-playlist');
    expect(a).not.toContain('-x');
    expect(a[a.indexOf('--playlist-items') + 1]).toBe('1:6');
    expect(a.slice(-2)).toEqual(['--', `https://www.youtube.com/playlist?list=${list}`]);
  });
  it('preserves order, stable ids, and reports skipped entries', async () => {
    const out = { title: 'Mix', playlist_count: 6, entries: [entry(1), { id: vid(2), title: '[Deleted video]', duration: null }, entry(3, { availability: 'needs_auth' }),
      entry(1), entry(4, { is_live: true }), null, entry(5, { duration: 50000 }), entry(6)] };
    const r = await playlist(`https://www.youtube.com/playlist?list=${list}`, {}, fake(out));
    expect(r.playlist).toEqual({ id: list, title: 'Mix', url: `https://www.youtube.com/playlist?list=${list}`, reportedCount: 6 });
    expect(r.tracks.map((t) => [t.index, t.id])).toEqual([[1, `youtube:${vid(1)}`], [8, `youtube:${vid(6)}`]]);
    expect(r.skipped.map((s) => [s.index, s.reason])).toEqual([[2, 'unavailable'], [3, 'unavailable'], [4, 'duplicate'], [5, 'live'], [6, 'invalid'], [7, 'too-long']]);
    expect(r.truncated).toBe(false);
  });
  it('enforces limits and flags truncation', async () => {
    const entries = Array.from({ length: 4 }, (_, i) => entry(i + 1));
    const r = await playlist(`https://www.youtube.com/playlist?list=${list}`, { limit: 3 }, fake({ entries }));
    expect(r.tracks).toHaveLength(3); expect(r.truncated).toBe(true);
    for (const limit of [0, -1, 1.5, MAX_PLAYLIST_ITEMS + 1])
      await expect(playlist(`https://www.youtube.com/playlist?list=${list}`, { limit }, fake({ entries }))).rejects.toThrow('limit');
  });
  it('surfaces extractor failures, bad responses and empty playlists', async () => {
    const u = `https://www.youtube.com/playlist?list=${list}`;
    await expect(playlist(u, {}, async () => { throw new Error('The source could not be extracted.'); })).rejects.toThrow('could not be extracted');
    await expect(playlist(u, {}, fake('not json'))).rejects.toThrow('invalid playlist');
    await expect(playlist(u, {}, fake({ entries: 'x' }))).rejects.toThrow('invalid playlist');
    await expect(playlist(u, {}, fake({ entries: [] }))).rejects.toThrow('empty');
    await expect(playlist(u, {}, fake({ entries: [{ id: vid(1), title: '[Private video]' }] }))).rejects.toThrow('No playable');
  });
  it('passes the cancellation signal to the extractor', async () => {
    const ac = new AbortController(); let got: AbortSignal | undefined;
    await playlist(`https://www.youtube.com/playlist?list=${list}`, { signal: ac.signal }, async (_a, _t, s) => { got = s; return JSON.stringify({ entries: [entry(1)] }); });
    expect(got).toBe(ac.signal);
  });
});
