import { afterEach, expect, it, vi } from 'vitest';
import { searchOnline } from './client';
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
const config = { url: 'https://media.test', token: '', enabled: true, bufferS: 180 as const };
const busy = () => new Response(JSON.stringify({ error: 'busy' }), { status: 429 });

it('retries a search while cancelled parallel extractions release server slots', async () => {
  vi.useFakeTimers(); vi.stubGlobal('location', { origin: 'https://app.test' });
  const fetch = vi.fn().mockResolvedValueOnce(busy()).mockResolvedValueOnce(busy())
    .mockResolvedValue(new Response(JSON.stringify({ tracks: [] })));
  vi.stubGlobal('fetch', fetch);
  const search = searchOnline('youtube', 'next', config);
  await vi.advanceTimersByTimeAsync(750);
  expect(await search).toEqual([]); expect(fetch).toHaveBeenCalledTimes(3);
});
it('cancels a search during busy backoff without sending another request', async () => {
  vi.useFakeTimers(); vi.stubGlobal('location', { origin: 'https://app.test' });
  const fetch = vi.fn().mockImplementation(async () => busy()); vi.stubGlobal('fetch', fetch);
  const abort = new AbortController();
  const search = searchOnline('youtube', 'next', config, abort.signal);
  const rejected = expect(search).rejects.toThrow('cancelled');
  await vi.advanceTimersByTimeAsync(1); abort.abort(); await rejected;
  await vi.runAllTimersAsync(); expect(fetch).toHaveBeenCalledTimes(1);
});
