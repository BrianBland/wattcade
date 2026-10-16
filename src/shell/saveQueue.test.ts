import { expect, it, vi } from 'vitest';
import { GameSaveQueue } from './saveQueue';

it('serializes detached checkpoints and coalesces only pending saves for the same game', async () => {
  let release!: () => void;
  const first = new Promise<void>((r) => { release = r; });
  const calls: unknown[] = [];
  const queue = new GameSaveQueue(async (p, g, data) => { calls.push([p, g, data]); if (calls.length === 1) await first; }, vi.fn());
  const data = { bank: 1 };
  queue.enqueue('p', 'td', data); data.bank = 999;
  queue.enqueue('p', 'td', { bank: 2 }); queue.enqueue('p', 'td', { bank: 3 });
  queue.enqueue('p', 'sf', { score: 8 });
  release(); await queue.flush();
  expect(calls).toEqual([['p', 'td', { bank: 1 }], ['p', 'td', { bank: 3 }], ['p', 'sf', { score: 8 }]]);
});

it('reports a failed checkpoint and retains it for an explicit retry', async () => {
  const write = vi.fn().mockRejectedValueOnce(new Error('quota')).mockResolvedValue(undefined), onError = vi.fn();
  const queue = new GameSaveQueue(write, onError);
  queue.enqueue('p', 'td', { bank: 9 });
  await expect(queue.flush()).rejects.toThrow('quota');
  expect(onError).toHaveBeenCalledOnce();
  await queue.flush();
  expect(write).toHaveBeenCalledTimes(2);
  expect(write).toHaveBeenLastCalledWith('p', 'td', { bank: 9 }, undefined);
});

it('retries with the newest checkpoint while preserving other pending games', async () => {
  const write = vi.fn().mockRejectedValueOnce(new Error('quota')).mockResolvedValue(undefined);
  const queue = new GameSaveQueue(write, vi.fn());
  queue.enqueue('p', 'td', { bank: 9 }); queue.enqueue('p', 'sf', { score: 8 });
  await expect(queue.flush()).rejects.toThrow();
  queue.enqueue('p', 'td', { bank: 10 }); await queue.flush();
  expect(write.mock.calls).toEqual([['p', 'td', { bank: 9 }, undefined], ['p', 'td', { bank: 10 }, undefined], ['p', 'sf', { score: 8 }, undefined]]);
});
