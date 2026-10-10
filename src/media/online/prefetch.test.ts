import { describe, expect, it } from 'vitest';
import type { SongMeta } from '../library/store';
import type { SongAnalysis } from '../types';
import { estimatedAnalysis } from './rolling';
import { PreviewPrefetch } from './prefetch';

const song = (id: string, durationS = 200, online = true): SongMeta => ({ id, source: 'youtube', title: id, artist: 'A', durationS, addedAt: 0, status: 'remote', ...(online ? { sourceUrl: `https://www.youtube.com/watch?v=${id}` } : {}) });
const win = (d: number): SongAnalysis => ({ ...estimatedAnalysis(d), bpm: 128, key: { name: 'A minor', camelot: '8A', confidence: 0.7 }, beats: [0.5, 1, 30], sections: [{ t0: 0, t1: d, kind: 'drop', energy: 0.9 }], spec: { hz: 2, bands: 2, data: 'AAAA' } });
function rig(o: { firstTrackWindows?: number } = {}) {
  const calls: Array<{ id: string; start: number; dur: number; signal: AbortSignal; resolve: (a: SongAnalysis) => void; reject: (e: unknown) => void }> = [];
  const timers: Array<() => void> = []; let changes = 0;
  const pf = new PreviewPrefetch({ ...o, retryMs: 10, onChange: () => changes++, setTimer: (fn) => { timers.push(fn); return fn; }, clearTimer: () => {},
    load: (m, start, dur, signal) => new Promise((resolve, reject) => calls.push({ id: m.id, start, dur, signal, resolve, reject })) });
  const flush = () => new Promise((r) => setTimeout(r, 0));
  return { pf, calls, timers, flush, changes: () => changes };
}

describe('PreviewPrefetch', () => {
  it('fetches one window at a time: first chunk of every track, then extra windows for the first track', async () => {
    const { pf, calls, flush } = rig({ firstTrackWindows: 2 });
    pf.setQueue([song('a'), song('local', 100, false), song('b')]);
    expect(calls).toHaveLength(1); expect([calls[0].id, calls[0].start, calls[0].dur]).toEqual(['a', 0, 32]);
    expect(pf.get('a')!.state).toBe('loading'); expect(pf.get('local')).toBeUndefined();
    calls[0].resolve(win(32)); await flush();
    expect(pf.get('a')).toMatchObject({ state: 'partial', coveredS: 30 });
    expect(pf.get('a')!.analysis.bpm).toBe(128); expect(pf.get('a')!.analysis.beats).toEqual([0.5, 1]);
    expect(calls.map((c) => c.id)).toEqual(['a', 'b']);
    calls[1].resolve(win(32)); await flush();
    expect([calls[2].id, calls[2].start, calls[2].dur]).toEqual(['a', 28, 34]);
    calls[2].resolve(win(34)); await flush();
    expect(pf.get('a')!.coveredS).toBe(60); expect(pf.get('a')!.windows).toHaveLength(2);
    expect(calls).toHaveLength(3); // b gets one window only
  });
  it('marks short songs complete and keeps analysis confidence as metadata', async () => {
    const { pf, calls, flush } = rig();
    pf.setQueue([song('s', 20)]); expect(calls[0].dur).toBe(20);
    calls[0].resolve(win(20)); await flush();
    expect(pf.get('s')).toMatchObject({ state: 'complete', coveredS: 20 });
    expect(pf.get('s')!.analysis.confidence).toBe('metadata');
  });
  it('pauses during search and resumes the aborted window', async () => {
    const { pf, calls, flush } = rig();
    pf.setQueue([song('a')]); pf.pause(true);
    expect(calls[0].signal.aborted).toBe(true); expect(pf.get('a')!.state).toBe('waiting');
    calls[0].resolve(win(32)); await flush(); expect(pf.get('a')!.coveredS).toBe(0);
    pf.setQueue([song('a'), song('b')]); expect(calls).toHaveLength(1);
    pf.pause(false); expect(calls).toHaveLength(2); expect(calls[1].id).toBe('a');
  });
  it('treats server busy as retry later, other failures as errors that do not block the rest', async () => {
    const { pf, calls, timers, flush } = rig();
    pf.setQueue([song('a'), song('b')]);
    calls[0].reject(Object.assign(new Error('Resolver is busy. Try again shortly.'), { status: 429 })); await flush();
    expect(pf.get('a')!.state).toBe('busy'); expect(calls).toHaveLength(1);
    timers.shift()!(); expect(calls).toHaveLength(2); expect(calls[1].id).toBe('a');
    calls[1].reject(new Error('The source could not be extracted.')); await flush();
    expect(pf.get('a')).toMatchObject({ state: 'error', error: 'The source could not be extracted.' });
    expect(calls[2].id).toBe('b');
  });
  it('drops removed songs and cancels everything at Start', async () => {
    const { pf, calls } = rig();
    pf.setQueue([song('a'), song('b')]); pf.setQueue([song('b')]);
    expect(calls[0].signal.aborted).toBe(true); expect(pf.get('a')).toBeUndefined(); expect(calls[1].id).toBe('b');
    pf.cancel(); expect(calls[1].signal.aborted).toBe(true); expect(pf.get('b')).toBeUndefined();
    pf.setQueue([song('c')]); expect(calls).toHaveLength(2);
  });
});
