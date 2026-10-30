import { expect, it, vi } from 'vitest';
import { createMediaTimings, MediaTimings, measureMedia, measureMediaSync } from './timing';
it('does not allocate collectors or read the clock unless the player explicitly opts in', async () => {
  const clock = vi.spyOn(performance, 'now').mockImplementation(() => { throw new Error('disabled clock'); });
  try {
    expect(createMediaTimings({})).toBeUndefined();
    const off = createMediaTimings({ mediaTimingDebug: false });
    expect(await measureMedia(off, 'fetch', async () => 7)).toBe(7);
    expect(measureMediaSync(off, 'commit', () => 8)).toBe(8);
    expect(clock).not.toHaveBeenCalled();
  } finally { clock.mockRestore(); }
});
it('aggregates stage latency, failure and concurrency without retaining per-window data', async () => {
  let now = 0; const timings = new MediaTimings(() => now);
  let finish!: () => void;
  const a = timings.measure('fetch', () => new Promise<void>(r => { finish = r; }));
  now = 10;
  await timings.measure('fetch', async () => { now = 30; });
  now = 50; finish(); await a;
  await expect(timings.measure('analysis', async () => { now = 60; throw new Error('failed'); })).rejects.toThrow('failed');
  expect(timings.snapshot()).toEqual([
    { stage: 'fetch', count: 2, failed: 0, active: 0, peak: 2, totalMs: 70, lastMs: 50, maxMs: 50 },
    { stage: 'analysis', count: 1, failed: 1, active: 0, peak: 1, totalMs: 10, lastMs: 10, maxMs: 10 },
  ]);
  const copy = timings.snapshot(); copy[0].totalMs = 0;
  expect(timings.snapshot()[0].totalMs).toBe(70);
  expect(createMediaTimings({ mediaTimingDebug: true })!.snapshot()).toEqual([]);
});
