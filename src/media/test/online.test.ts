import { expect, it } from 'vitest';
import { MediaLibrary } from '../library/library';
import { MemoryStorage, type SongMeta } from '../library/store';
import { scoreAnalysis } from '../synth/truth';
import { makeScore } from '../synth/score';
const song: SongMeta = { id: 'youtube:BaW_jenozKc', source: 'youtube', title: 'Test', artist: 'Artist', durationS: 120,
  addedAt: 0, status: 'remote', sourceUrl: 'https://www.youtube.com/watch?v=BaW_jenozKc', credit: { text: 'via YouTube', url: 'https://youtu.be/BaW_jenozKc' } };
const analysis = scoreAnalysis(makeScore('edm', 1, { short: true }));
it('shares extracted audio for analysis/playback, reuses analysis after reload, keeps audio out of persistent storage', async () => {
  const storage = new MemoryStorage(); let loads = 0, analyses = 0;
  const opts = { storage, loadOnlineAudio: async () => { loads++; return new Blob(['MP3'], { type: 'audio/mpeg' }); },
    analyze: async (blob: Blob) => { analyses++; expect(await blob.text()).toBe('MP3'); return analysis; } };
  const lib = new MediaLibrary(opts);
  await lib.prepareOnline(song); await lib.idle();
  expect((await lib.get(song.id))?.status).toBe('ready');
  expect((await lib.mixItem(song.id))?.credit?.text).toBe('via YouTube');
  expect(await storage.getBlob(`audio:${song.id}`)).toBeUndefined();
  await lib.audioUrl(song.id); expect(loads).toBe(1);
  const reload = new MediaLibrary(opts); await reload.prepareOnline(song); await reload.idle();
  const urls = await Promise.all([reload.audioUrl(song.id), reload.audioUrl(song.id)]);
  expect(urls[0]).toBe(urls[1]); expect(loads).toBe(2); expect(analyses).toBe(1);
  await reload.remove(song.id); expect(await reload.get(song.id)).toBeUndefined(); expect(await storage.getAnalysis(song.id)).toBeUndefined();
});
it('reports extraction failures and retries through the same worker queue', async () => {
  let fail = true;
  const lib = new MediaLibrary({ storage: new MemoryStorage(), analyze: async () => analysis,
    loadOnlineAudio: async () => { if (fail) throw new Error('Source unavailable'); return new Blob(['MP3']); } });
  await lib.prepareOnline(song); await lib.idle();
  expect(await lib.get(song.id)).toMatchObject({ status: 'error', error: 'Source unavailable' });
  fail = false; lib.retry(song.id); await lib.idle(); expect((await lib.get(song.id))?.status).toBe('ready');
});
it('does not restore audio or analysis if a song is removed during extraction', async () => {
  let release!: (blob: Blob) => void, started!: () => void;
  const ready = new Promise<void>((r) => { started = r; }); const audio = new Promise<Blob>((r) => { release = r; });
  const storage = new MemoryStorage();
  const lib = new MediaLibrary({ storage, analyze: async () => analysis, loadOnlineAudio: async () => { started(); return audio; } });
  await lib.prepareOnline(song); await ready; await lib.remove(song.id); release(new Blob(['MP3'])); await lib.idle();
  expect(await lib.get(song.id)).toBeUndefined(); expect(await storage.getAnalysis(song.id)).toBeUndefined();
});

it('remembers streaming metadata without extracting audio or enqueueing full-file analysis', async () => {
  const storage = new MemoryStorage(); let calls = 0;
  const lib = new MediaLibrary({ storage, analyze: async () => { calls++; return analysis; }, loadOnlineAudio: async () => { calls++; return new Blob(['MP3']); } });
  await lib.rememberOnline(song); await lib.idle();
  expect(await lib.get(song.id)).toMatchObject({ status: 'remote', sourceUrl: song.sourceUrl });
  const reloaded = new MediaLibrary({ storage, analyze: async () => { calls++; return analysis; } });
  await reloaded.resume(); await reloaded.idle();
  expect(calls).toBe(0); expect(await storage.getAnalysis(song.id)).toBeUndefined();
});
