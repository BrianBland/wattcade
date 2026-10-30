// @vitest-environment jsdom
import { h, render } from 'preact';
import { act } from 'preact/test-utils';
import { expect, it, vi } from 'vitest';
import { MediaTimings } from '../../media/online/timing';
import { MediaTimingStats } from './MediaTimingStats';
it('hides diagnostics and stops polling when the player flag is off', async () => {
  vi.useFakeTimers(); const host = document.createElement('div');
  try {
    act(() => render(<MediaTimingStats />, host));
    expect(host.textContent).toBe(''); expect(vi.getTimerCount()).toBe(0);
    let now = 0; const timings = new MediaTimings(() => now);
    act(() => render(<MediaTimingStats timings={timings} />, host));
    await timings.measure('fetch', async () => { now = 40; });
    await act(async () => { await vi.advanceTimersByTimeAsync(500); });
    expect(host.textContent).toContain('Fetch (server + network)'); expect(host.textContent).toContain('40');
    act(() => render(<MediaTimingStats />, host));
    expect(host.textContent).toBe(''); expect(vi.getTimerCount()).toBe(0);
  } finally { act(() => render(null, host)); vi.useRealTimers(); }
});
