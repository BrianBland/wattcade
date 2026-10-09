import { describe, expect, it } from 'vitest';
import { writeFile, access } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { extractRange, extractAudio, mapTrack, search, trackUrl, type RunExtractor } from './service';

const id = 'BaW_jenozKc';
describe('audio resolver', () => {
  it('normalizes supported track URLs and rejects other destinations/playlists', () => {
    expect(trackUrl(`https://youtu.be/${id}?t=5`).url).toBe(`https://www.youtube.com/watch?v=${id}`);
    expect(trackUrl('https://soundcloud.com/artist/song?in=album').url).toBe('https://soundcloud.com/artist/song');
    for (const url of ['http://youtube.com/watch?v=' + id, 'https://youtube.com.evil.test/watch?v=' + id,
      'https://localhost/audio', 'https://youtube.com/playlist?list=abc', 'https://soundcloud.com/a/sets',
      'https://user:pass@soundcloud.com/a/b', 'https://soundcloud.com:8080/a/b']) expect(() => trackUrl(url)).toThrow();
  });
  it('filters live/DRM/long/malformed results and safely passes searches as one argument', async () => {
    const t = { id, title: 'A song', uploader: 'Artist', duration: 120 };
    expect(mapTrack(t, 'youtube')).toMatchObject({ id: `youtube:${id}`, artist: 'Artist' });
    for (const over of [{ is_live: true }, { has_drm: true }, { duration: 3600 }, { duration: null }, { id: 'bad' }])
      expect(mapTrack({ ...t, ...over }, 'youtube')).toBeNull();
    const calls: string[][] = [];
    const run: RunExtractor = async (args) => { calls.push(args); return JSON.stringify({ entries: [t, { ...t, is_live: true }] }); };
    expect(await search('youtube', 'song; $(echo nope)', run)).toHaveLength(1);
    expect(calls[0].at(-1)).toBe('ytsearch10:song; $(echo nope)');
    expect(calls[0].at(-2)).toBe('--');
    await expect(search('soundcloud', `https://youtu.be/${id}`, run)).rejects.toThrow('matching');
  });
  it('returns MP3 and cleans temporary files on success and failure', async () => {
    let dir = '';
    const run: RunExtractor = async (args) => {
      dir = dirname(args[args.indexOf('-o') + 1]);
      expect(args).toContain('--max-filesize'); expect(args).toContain('--match-filters');
      await writeFile(join(dir, 'track.mp3'), Buffer.from('test MP3')); return '';
    };
    expect((await extractAudio(`https://youtu.be/${id}`, run)).toString()).toBe('test MP3');
    await expect(access(dir)).rejects.toThrow();
    await expect(extractAudio(`https://youtu.be/${id}`, async (args) => {
      dir = dirname(args[args.indexOf('-o') + 1]); throw new Error('source unavailable');
    })).rejects.toThrow('source unavailable');
    await expect(access(dir)).rejects.toThrow();
  });
});

it('extracts bounded exact audio windows and cleans up after range failures', async () => {
  let dir = '';
  const run: RunExtractor = async (args) => {
    dir = dirname(args[args.indexOf('-o') + 1]);
    expect(args[args.indexOf('--download-sections') + 1]).toBe('*28-62');
    expect(args).toContain('--force-keyframes-at-cuts');
    expect(args[args.indexOf('--audio-format') + 1]).toBe('wav');
    await writeFile(join(dir, 'track.wav'), Buffer.from('WAV')); return '';
  };
  expect((await extractRange(`https://youtu.be/${id}`, 28, 34, run)).toString()).toBe('WAV');
  await expect(access(dir)).rejects.toThrow();
  for (const [start, duration] of [[-1, 30], [0, 41], [0, 0], [1800, 30], [NaN, 1]]) await expect(extractRange(`https://youtu.be/${id}`, start, duration, run)).rejects.toThrow('range');
  await expect(extractRange(`https://youtu.be/${id}`, 28, 34, async (args) => { dir = dirname(args[args.indexOf('-o') + 1]); throw new Error('timeout'); })).rejects.toThrow('timeout');
  await expect(access(dir)).rejects.toThrow();
});

it('explains why a direct long mixtape or a search with only filtered results cannot be queued', async () => {
  const long = { id: '412AHrISlqg', title: 'Lane 8 Fall mixtape', duration: 4 * 3600 };
  await expect(search('youtube', `https://www.youtube.com/watch?v=${long.id}`, async () => JSON.stringify(long))).rejects.toThrow('240 minutes');
  await expect(search('youtube', 'mixtape', async () => JSON.stringify({ entries: [long, { ...long, id, duration: null }] }))).rejects.toThrow('30-minute limit');
  await expect(search('soundcloud', 'song', async () => JSON.stringify({ entries: [{ id: '123', title: 'Song', webpage_url: 'https://soundcloud.com/artist/song', duration: null }] }))).rejects.toThrow('usable track duration');
});
it('distinguishes genuinely empty searches and keeps valid songs when other results are filtered', async () => {
  expect(await search('youtube', 'unknown', async () => JSON.stringify({ entries: [] }))).toEqual([]);
  const t = { id, title: 'Song', duration: 120 };
  expect(await search('youtube', 'song', async () => JSON.stringify({ entries: [null, t, { ...t, duration: 14400 }] }))).toHaveLength(1);
  await expect(search('youtube', 'song', async () => JSON.stringify({ entries: {} }))).rejects.toThrow('invalid search response');
  await expect(search('youtube', `https://youtu.be/${id}`, async () => JSON.stringify({ ...t, is_live: true }))).rejects.toThrow('live or upcoming');
});
