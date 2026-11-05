import { expect, it, vi } from 'vitest';
import { orderedPipeline } from './ordered';

it('fetches ahead while analysis is blocked, but bounds retained results and commits in order', async () => {
  let next = 0;
  const fetched: number[] = [], consumed: number[] = [];
  const gates: Array<() => void> = [];
  const controller = new AbortController();
  const task = orderedPipeline({ next: () => next < 6 ? { id: next++ } : null, concurrency: 2, signal: controller.signal,
    load: async job => { fetched.push(job.id); return job.id; },
    consume: async (_, value) => { await new Promise<void>(r => gates.push(r)); consumed.push(value); } });
  const flush = () => new Promise(r => setTimeout(r, 0));
  await flush();
  expect(fetched).toEqual([0, 1, 2]); expect(consumed).toEqual([]);
  await flush(); expect(fetched).toHaveLength(3); // two ahead + one being analyzed, no unbounded prefetch
  for (let i = 0; i < 6; i++) { gates[i](); await flush(); }
  await task; expect(consumed).toEqual([0, 1, 2, 3, 4, 5]);
});
it('overlaps 30-second fetches with 10-second analysis: four windows finish at 80 seconds', async () => {
  vi.useFakeTimers();
  try {
    let next = 0, active = 0, peak = 0;
    const before = Date.now();
    const task = orderedPipeline({ next: () => next < 4 ? { id: next++ } : null, concurrency: 2, signal: new AbortController().signal,
      load: async () => { peak = Math.max(peak, ++active); await new Promise(r => setTimeout(r, 30000)); active--; return 0; },
      consume: async () => { await new Promise(r => setTimeout(r, 10000)); } });
    await vi.runAllTimersAsync(); await task;
    expect(peak).toBe(2); expect(Date.now() - before).toBe(80000); // previous paired batches took 100 seconds
  } finally { vi.useRealTimers(); }
});
it('stops scheduling on handoff and drains only started jobs', async () => {
  let next = 0, handoff = false;
  const loads: Array<(value: number) => void> = [], committed: number[] = [];
  const task = orderedPipeline({ next: () => ({ id: next++ }), concurrency: 2, signal: new AbortController().signal,
    canSchedule: () => !handoff,
    load: () => new Promise<number>(resolve => loads.push(resolve)), consume: async (_, value) => { committed.push(value); } });
  handoff = true; loads[1](1); loads[0](0); await task;
  expect(next).toBe(2); expect(committed).toEqual([0, 1]);
});
