import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MixEngine } from '../player/engine';
import { RollingQueue, estimatedAnalysis, type RangeSource } from '../online/rolling';

/** Web Audio nodes are inert here; exercise the actual engine clock and buffering state. */
function audioContext() {
  const param = () => ({ value: 0, cancelScheduledValues() {}, setValueAtTime() {}, setTargetAtTime() {}, linearRampToValueAtTime() {} });
  const node = () => ({ gain: param(), frequency: param(), Q: param(), delayTime: param(),
    connect() { return this; }, disconnect() {} });
  return { currentTime: 0, state: 'running', baseLatency: 0, destination: node(),
    createGain: node, createBiquadFilter: node, createDelay: node, close: async () => {} };
}

let engine: MixEngine;
beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { engine?.dispose(); vi.useRealTimers(); });

function setup(durationS = 600) {
  const ctx = audioContext();
  const queue = new RollingQueue([{ id: 'stream', title: '', artist: '', analysis: estimatedAnalysis(durationS) }], 'continuous', 180,
    async () => { throw new Error('unused'); });
  let through = 180;
  const ranges: RangeSource = { prepare: vi.fn(async () => {}), windows: () => [], readyThrough: () => through,
    evict() {}, cancel() {}, dispose() {}, debug: () => ({}) };
  engine = new MixEngine({ ctx: ctx as unknown as AudioContext, resolveUrl: async () => { throw new Error('ranges only'); } });
  engine.load(queue.plan, ranges);
  return { ctx, ranges, readyThrough: (p: number) => { through = p; }, tick: () => vi.advanceTimersByTime(100) };
}

it('holds both clocks below 90 seconds of analyzed lookahead and waits for 120 before resuming', async () => {
  const { ctx, readyThrough, tick } = setup();
  await engine.start();
  ctx.currentTime = 90.1; tick();
  expect(engine.getState()).toBe('playing');
  ctx.currentTime = 90.3; tick();
  expect(engine.getState()).toBe('buffering');
  const held = engine.positionS()!;
  readyThrough(held + 119);
  ctx.currentTime = 300; tick();
  expect(engine.getState()).toBe('buffering');
  expect(engine.positionS()).toBe(held);
  readyThrough(held + 120); tick();
  expect(engine.getState()).toBe('playing');
  ctx.currentTime += 1; tick();
  expect(engine.positionS()).toBeCloseTo(held + 0.9);
});

it('plays a fully analyzed queue ending sooner than the lookahead reserve', async () => {
  const { ctx, tick } = setup(180);
  await engine.start(150);
  ctx.currentTime = 10.1; tick();
  expect(engine.getState()).toBe('playing');
  ctx.currentTime = 30.1; tick();
  expect(engine.getState()).toBe('ended');
});

it('recovers from a failed startup once the remaining short queue is analyzed', async () => {
  const { ranges, readyThrough, tick } = setup(80);
  vi.mocked(ranges.prepare).mockRejectedValueOnce(new Error('temporary failure'));
  readyThrough(60);
  await engine.start();
  expect(engine.getState()).toBe('buffering');
  tick(); expect(engine.getState()).toBe('buffering');
  readyThrough(80); tick();
  expect(engine.getState()).toBe('playing');
});

it('starts after four windows in two pairs and fills the configured six-window buffer while playing', async () => {
  const ctx = audioContext(), starts: number[] = [];
  const q = new RollingQueue([{ id: 'stream', title: '', artist: '', analysis: estimatedAnalysis(3000) }], 'continuous', 180,
    async (_, start, duration) => {
      starts.push(start); await new Promise(r => setTimeout(r, 30000));
      return { buffer: { duration } as AudioBuffer, analysis: estimatedAnalysis(duration) };
    }, 2);
  const ranges: RangeSource = { prepare: q.prepare.bind(q), readyThrough: q.readyThrough.bind(q), windows: () => [],
    evict: q.evict.bind(q), cancel: q.cancel.bind(q), dispose: q.dispose.bind(q), debug: q.debug.bind(q) };
  engine = new MixEngine({ ctx: ctx as unknown as AudioContext, resolveUrl: async () => '' });
  engine.load(q.plan, ranges); engine.preload();
  const task = engine.start();
  expect(starts).toEqual([0, 28]);
  expect(engine.bufferProgress()).toEqual({ readyS: 0, targetS: 120 });
  await vi.advanceTimersByTimeAsync(30000);
  expect(engine.getState()).toBe('starting');
  expect(engine.bufferProgress()!.readyS).toBeCloseTo(60);
  expect(engine.bufferProgress()!.targetS).toBe(120);
  await vi.advanceTimersByTimeAsync(30000); await task;
  expect(engine.getState()).toBe('playing');
  expect(starts).toEqual([0, 28, 58, 88]);
  expect(q.readyThrough(0)).toBe(120);
  await vi.advanceTimersByTimeAsync(30100);
  expect(starts).toEqual([0, 28, 58, 88, 118, 148]);
  expect(q.readyThrough(0)).toBe(180);
});
it('clips progress to a short remaining queue and never reports more than 100 percent', async () => {
  const { readyThrough } = setup(80);
  readyThrough(100); await engine.start();
  expect(engine.bufferProgress()).toEqual({ readyS: 80, targetS: 80 });
});
