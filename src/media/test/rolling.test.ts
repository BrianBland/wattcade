import { expect, it } from 'vitest';
import { RollingQueue, estimatedAnalysis, mergeWindow } from '../online/rolling';
import type { MixItem } from '../mix/plan';
import { DEFAULT_STREAM_BUFFER_S } from '../online/buffer';
const item = (id: string, durationS = 180): MixItem => ({ id, title: id, artist: '', analysis: estimatedAnalysis(durationS) });
const buffer = (duration: number) => ({ duration } as AudioBuffer);
const analysis = (duration: number) => ({ ...estimatedAnalysis(duration), bpm: 120, beats: [0, 2, 29, 30, 31], onsets: [{ t: 2, s: 0.9, band: 0 as const }] });
it('analyzes three minutes across a song handover while keeping decoded windows bounded', async () => {
  const q = new RollingQueue([item('a', 120), item('b', 600)], 'automix', DEFAULT_STREAM_BUFFER_S,
    async (_, __, duration) => ({ buffer: buffer(duration), analysis: analysis(duration) }));
  await q.prepare(0);
  expect(q.readyThrough(0)).toBeGreaterThanOrEqual(180);
  expect(q.windows(q.plan.entries[1]).length).toBeGreaterThan(0);
  expect(q.items[1].analysis.beats.length).toBeGreaterThan(0);
  await q.prepare(200); q.evict(200);
  expect(q.readyThrough(200)).toBeGreaterThanOrEqual(380);
  expect(q.windows(q.plan.entries[0])).toHaveLength(0);
  expect(q.windows(q.plan.entries[1]).length).toBeLessThanOrEqual(8);
  q.dispose();
});
it('loads just the horizon, merges contextual events once and evicts old PCM', async () => {
  const calls: number[][] = [];
  const q = new RollingQueue([item('a')], 'automix', 60, async (_, start, duration) => {
    calls.push([start, duration]); return { buffer: buffer(duration), analysis: analysis(duration) };
  });
  await q.prepare(0);
  expect(calls).toEqual([[0, 32], [28, 34]]);
  expect(q.readyThrough(0)).toBeCloseTo(60);
  expect(q.windows(q.plan.entries[0])).toHaveLength(2);
  expect(q.items[0].analysis.beats).toEqual([0, 2, 29, 30, 57, 58, 59]);
  expect(q.timeline.updateFromS).toBe(0);
  q.timeline.updateFromS = undefined;
  await q.prepare(31); q.evict(63);
  expect(q.timeline.updateFromS).toBeCloseTo(60);
  expect(q.windows(q.plan.entries[0]).every((w) => w.endS >= 61)).toBe(true);
  expect(q.timeline.confidence).toBe('metadata');
  q.dispose(); await expect(q.prepare(0)).rejects.toThrow('closed');
});
it('prepares both decks before an estimated overlap and keeps the plan fixed as BPM arrives', async () => {
  const calls: number[] = [];
  const q = new RollingQueue([item('a', 64), item('b', 80)], 'automix', 60, async (index, _, duration) => {
    calls.push(index); return { buffer: buffer(duration), analysis: analysis(duration) };
  });
  const plan = JSON.stringify(q.plan);
  await q.prepare(1);
  expect(calls).toContain(1);
  expect(q.readyThrough(1)).toBeGreaterThanOrEqual(61);
  expect(JSON.stringify(q.plan)).toBe(plan);
  expect(q.plan.transitions[0].kind).toBe('crossfade');
  expect(q.plan.entries.every((e) => e.segs.every((s) => s.r0 === 1 && s.r1 === 1))).toBe(true);
});
it('does not publish incomplete audio and permits a failed window to be retried', async () => {
  let failures = 1;
  const q = new RollingQueue([item('a')], 'continuous', 60, async (_, __, duration) => {
    if (failures-- > 0) throw new Error('source temporarily unavailable');
    return { buffer: buffer(duration), analysis: analysis(duration) };
  });
  await expect(q.prepare(0)).rejects.toThrow('unavailable'); expect(q.readyThrough(0)).toBeCloseTo(0);
  await q.prepare(0); expect(q.readyThrough(0)).toBeCloseTo(60);
  const short = new RollingQueue([item('a')], 'continuous', 60, async () => ({ buffer: buffer(3), analysis: analysis(3) }));
  await expect(short.prepare(0)).rejects.toThrow('incomplete'); expect(short.timeline.revision).toBe(0);
});
it('window commits retain past events and clip analysis context to the core range', () => {
  const a = estimatedAnalysis(100); a.beats = [1, 4, 70];
  mergeWindow(a, analysis(34), 28, 30, 60);
  expect(a.beats).toEqual([1, 4, 30, 57, 58, 59, 70]);
  expect(a.sections.every((s) => s.t1 > s.t0)).toBe(true);
});
it('cancels stale preparation without publishing it and can restart the same queue', async () => {
  let release!: (value: { buffer: AudioBuffer; analysis: ReturnType<typeof analysis> }) => void;
  let calls = 0;
  const old = new Promise<{ buffer: AudioBuffer; analysis: ReturnType<typeof analysis> }>((r) => { release = r; });
  const q = new RollingQueue([item('a')], 'continuous', 60, async (_, __, duration) => {
    if (calls++ === 0) return old;
    return { buffer: buffer(duration), analysis: analysis(duration) };
  });
  const first = q.prepare(0);
  q.cancel();
  const restarted = q.prepare(0);
  release({ buffer: buffer(32), analysis: analysis(32) });
  await Promise.all([first, restarted]);
  expect(q.windows(q.plan.entries[0])).toHaveLength(2);
  expect(q.timeline.revision).toBe(2);
  expect(q.readyThrough(0)).toBeCloseTo(60);
});

it('tolerates subsecond rounding in the final song duration without accepting incomplete interior windows', async () => {
  const q = new RollingQueue([item('a', 64)], 'continuous', 60, async (_, start, duration) => ({ buffer: buffer(start === 58 ? duration - 0.4 : duration), analysis: analysis(duration) }));
  await q.prepare(1);
  expect(q.readyThrough(1)).toBeCloseTo(64);
});

it('starts and seeks near the end of a four-hour video with only the configured PCM horizon', async () => {
  const calls: number[][] = [];
  const q = new RollingQueue([item('long', 14400)], 'continuous', 60, async (_, start, duration) => {
    calls.push([start, duration]); return { buffer: buffer(duration), analysis: analysis(duration) };
  });
  await q.prepare(0); expect(calls).toEqual([[0, 32], [28, 34]]);
  q.cancel(); calls.length = 0;
  await q.prepare(14340); q.evict(14340);
  expect(calls).toEqual([[14338, 34], [14368, 32]]);
  expect(q.windows(q.plan.entries[0])).toHaveLength(2);
  expect(q.readyThrough(14340)).toBe(14400);
  q.dispose();
});

it('seeds preview analysis: coverage and beats from the start, audio still fetched, seeded windows never re-analysed', async () => {
  const calls: number[] = [];
  const q = new RollingQueue([item('a')], 'automix', 60, async (_, start, duration) => {
    calls.push(start); return { buffer: buffer(duration), analysis: { ...analysis(duration), beats: [5] }, beats: [] };
  });
  const seeded = q.seed(0, [
    { startS: 0, endS: 30, bufferStartS: 0, analysis: analysis(32), beats: [] },
    { startS: 7, endS: 37, bufferStartS: 5, analysis: analysis(32), beats: [] }, // off the chunk grid: ignored
  ]);
  expect(seeded).toBe(1);
  expect(q.timeline.revision).toBe(1);
  expect(q.timeline.coverage?.[0]).toMatchObject({ t0: 0 });
  expect(q.timeline.coverage?.[0].t1).toBeCloseTo(30);
  const before = [...q.items[0].analysis.beats];
  await q.prepare(0);
  expect(calls).toEqual([0, 28]); // audio for the seeded window is still loaded for playback
  expect(q.items[0].analysis.beats.filter((t) => t < 30)).toEqual(before.filter((t) => t < 30)); // not re-merged
  expect(q.readyThrough(0)).toBeCloseTo(60);
  // full-file items are never seeded
  const full = new RollingQueue([{ ...item('f'), analysis: { ...estimatedAnalysis(180), confidence: 'full' as const } }], 'automix', 60, async () => ({ buffer: buffer(32), analysis: analysis(32) }));
  expect(full.seed(0, [{ startS: 0, endS: 30, bufferStartS: 0, analysis: analysis(32), beats: [] }])).toBe(0);
  q.dispose(); full.dispose();
});
