// @vitest-environment jsdom
import { h, render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { BufferProgress } from './BufferProgress';
let host: HTMLDivElement;
beforeEach(() => { vi.useFakeTimers(); host = document.createElement('div'); document.body.append(host); });
afterEach(() => { act(() => render(null, host)); host.remove(); vi.useRealTimers(); });
it('shows real progress only after five seconds and updates it without restarting the delay', async () => {
  let readyS = 30;
  act(() => render(<BufferProgress read={() => ({ readyS, targetS: 120 })} />, host));
  await act(async () => { await vi.advanceTimersByTimeAsync(4999); });
  expect(host.querySelector('progress')).toBeNull();
  await act(async () => { await vi.advanceTimersByTimeAsync(1); });
  expect(host.querySelector('progress')?.value).toBe(30);
  expect(host.querySelector('progress')?.max).toBe(120);
  expect(host.textContent).toContain('25% · 30 of 120 seconds ready');
  readyS = 90;
  act(() => render(<BufferProgress read={() => ({ readyS, targetS: 120 })} />, host));
  await act(async () => { await vi.advanceTimersByTimeAsync(250); });
  expect(host.textContent).toContain('75%');
  act(() => render(null, host)); expect(vi.getTimerCount()).toBe(0);
});
it('uses an indeterminate bar when progress is unknown, and resets for a later wait', async () => {
  act(() => render(<BufferProgress read={() => null} />, host));
  await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
  expect(host.querySelector('progress')?.hasAttribute('value')).toBe(false);
  expect(host.textContent).not.toContain('%');
  act(() => render(null, host));
  act(() => render(<BufferProgress read={() => ({ readyS: 0, targetS: 80 })} />, host));
  expect(host.querySelector('progress')).toBeNull();
  act(() => render(null, host)); expect(vi.getTimerCount()).toBe(0);
});
