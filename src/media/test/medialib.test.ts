import { describe, expect, it } from 'vitest';
import { MediaLibrary, matchesQuery, sha256Hex, DEMO_SONGS } from '../library/library';
import { MemoryStorage } from '../library/store';
import { makeScore } from '../synth/score';
import { scoreAnalysis } from '../synth/truth';
import { planMix } from '../mix/plan';
import { buildTimeline } from '../mix/timeline';
import { rateQueue } from '../rating';
import { encodeWav } from '../player/wav';

const fakeAnalyzer = async (_b: Blob, progress: (p: number, s: string) => void) => {
  progress(0.5, 'rhythm');
  return scoreAnalysis(makeScore('edm', 9, { short: true }));
};
const file = (name: string, bytes: number[], type = 'audio/mpeg') => new File([Uint8Array.from(bytes)], name, { type });

describe('MediaLibrary', () => {
  it('imports, dedupes by content, analyses in the background, removes', async () => {
    const storage = new MemoryStorage();
    const lib = new MediaLibrary({ storage, analyze: fakeAnalyzer, now: () => 42 });
    let changes = 0; lib.subscribe(() => changes++);
    const [a] = await lib.importFiles([file('01 - Some Band - First.mp3', [1, 2, 3])]);
    expect(a).toMatchObject({ source: 'local', title: 'First', artist: 'Some Band', track: 1, status: 'pending', addedAt: 42 });
    const again = await lib.importFiles([file('copy.mp3', [1, 2, 3])]);
    expect(again[0].id).toBe(a.id);
    await lib.idle();
    const ready = await lib.get(a.id);
    expect(ready?.status).toBe('ready');
    expect(ready?.bpm).toBeGreaterThan(100);
    expect(ready?.palette?.length).toBe(5); // key fallback (no art)
    expect((await lib.mixItem(a.id))?.analysis.beats.length).toBeGreaterThan(0);
    expect(changes).toBeGreaterThan(1);
    expect(await lib.localSongs()).toHaveLength(1);
    await lib.remove(a.id);
    expect(await lib.localSongs()).toHaveLength(0);
    expect(await storage.getBlob(`audio:${a.id}`)).toBeUndefined();
  });

  it('marks songs it cannot analyse, and retries', async () => {
    let fail = true;
    const lib = new MediaLibrary({ storage: new MemoryStorage(), analyze: async (b, p) => { if (fail) throw new Error('bad file'); return fakeAnalyzer(b, p); } });
    const [a] = await lib.importFiles([file('x.mp3', [9])]);
    await lib.idle();
    expect((await lib.get(a.id))?.status).toBe('error');
    expect((await lib.get(a.id))?.error).toBe('bad file');
    fail = false; lib.retry(a.id); await lib.idle();
    expect((await lib.get(a.id))?.status).toBe('ready');
  });

  it('resumes analysis interrupted by a reload', async () => {
    const storage = new MemoryStorage();
    await storage.putMeta({ id: 'local:abc', source: 'local', title: 'T', artist: 'A', durationS: 0, addedAt: 1, status: 'analyzing' });
    await storage.putBlob('audio:local:abc', new Blob([new Uint8Array(4)]));
    const lib = new MediaLibrary({ storage, analyze: fakeAnalyzer });
    await lib.resume(); await lib.idle();
    expect((await lib.get('local:abc'))?.status).toBe('ready');
  });

  it('has a ready demo set with exact analyses and playable audio', async () => {
    const lib = new MediaLibrary({ storage: new MemoryStorage(), analyze: fakeAnalyzer, renderSynth: async () => new Blob([encodeWav(new Float32Array(10), 8000) as BlobPart], { type: 'audio/wav' }) });
    const demos = lib.demoSongs();
    expect(demos).toHaveLength(DEMO_SONGS.length);
    expect(demos.every((d) => d.status === 'ready' && d.durationS > 60 && (d.drops ?? 0) >= 1)).toBe(true);
    const items = await Promise.all(demos.slice(0, 3).map((d) => lib.mixItem(d.id)));
    const tl = buildTimeline(planMix(items.map((i) => i!), 'automix'), items.map((i) => i!));
    expect(tl.songs.map((s) => s.title)).toEqual(demos.slice(0, 3).map((d) => d.title));
    expect(await lib.audioUrl(demos[0].id)).toMatch(/^blob:/);
    const r = rateQueue(tl);
    expect(r.songs).toBe(3); expect(r.drops).toBeGreaterThan(2); expect(r.stars).toBeGreaterThanOrEqual(1); expect(r.stars).toBeLessThanOrEqual(5);
  });
});

describe('helpers', () => {
  it('search matches every word, ignoring accents and case', () => {
    const m = { title: 'Café del Mar', artist: 'Energy 52', album: 'Ibiza' };
    expect(matchesQuery(m, 'cafe 52')).toBe(true);
    expect(matchesQuery(m, 'ibiza CAFÉ')).toBe(true);
    expect(matchesQuery(m, 'cafe moon')).toBe(false);
    expect(matchesQuery(m, '   ')).toBe(true);
  });
  it('hashes content stably', async () => {
    const a = await sha256Hex(Uint8Array.from([1, 2, 3]).buffer), b = await sha256Hex(Uint8Array.from([1, 2, 3]).buffer);
    expect(a).toBe(b); expect(a).toHaveLength(32);
    expect(await sha256Hex(Uint8Array.from([1, 2, 4]).buffer)).not.toBe(a);
  });
  it('writes a valid WAV header', () => {
    const w = encodeWav(Float32Array.from([0, 1, -1]), 22050), v = new DataView(w.buffer);
    expect(String.fromCharCode(...w.slice(0, 4))).toBe('RIFF');
    expect(v.getUint32(24, true)).toBe(22050);
    expect(v.getInt16(46, true)).toBe(32767);
    expect(v.getInt16(48, true)).toBe(-32767);
  });
});
