import { afterEach, expect, it, vi } from 'vitest';
import { StepTimeoutError, setupWithRetry, withTimeout } from './steps';
afterEach(() => vi.useRealTimers());

it('withTimeout rejects naming the step', async () => {
  vi.useFakeTimers();
  const p = withTimeout(new Promise(() => {}), 8000, 'finding HR service');
  const assertion = expect(p).rejects.toThrow(/finding HR service/);
  await vi.advanceTimersByTimeAsync(8000);
  await assertion;
});
it('withTimeout passes through results', async () => {
  vi.useFakeTimers();
  await expect(withTimeout(Promise.resolve(5), 8000, 's')).resolves.toBe(5);
});
it('retries once then succeeds, cleaning up between', async () => {
  const cleanup = vi.fn(); const logs: string[] = [];
  let n = 0;
  await setupWithRetry(async () => { if (++n === 1) throw new StepTimeoutError('subscribing', 8000); }, cleanup, l => logs.push(l));
  expect(n).toBe(2); expect(cleanup).toHaveBeenCalledTimes(1); expect(logs[0]).toMatch(/subscribing/);
});
it('throws after second failure', async () => {
  const cleanup = vi.fn();
  await expect(setupWithRetry(async () => { throw new Error('boom'); }, cleanup)).rejects.toThrow('boom');
  expect(cleanup).toHaveBeenCalledTimes(2);
});
