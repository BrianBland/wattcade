// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { EndRideConfirm, endRideCopy } from './EndRideConfirm';

let host: HTMLDivElement | undefined;
afterEach(() => { if (host) { act(() => render(null, host!)); host.remove(); host = undefined; } });

it('explains the 2-minute rule before discarding a short ride', () => {
  const c = endRideCopy({ kind: 'short', activeS: 45, leftS: 75 }, 120);
  expect(c.body).toContain('2:00'); expect(c.body).toContain('0:45'); expect(c.body).toContain('1:15');
  expect(c.end).toBe('End without saving');
  expect(endRideCopy({ kind: 'save', activeS: 600 }, 120).end).toMatch(/save/);
  expect(endRideCopy({ kind: 'demo' }, 120).body).toMatch(/aren’t saved/);
});

it('keeps riding or ends, and offers the matching action labels', () => {
  const onEnd = vi.fn(), onCancel = vi.fn();
  host = document.createElement('div'); document.body.appendChild(host);
  act(() => render(<EndRideConfirm status={() => ({ kind: 'short', activeS: 30, leftS: 90 })} minS={120} onEnd={onEnd} onCancel={onCancel} />, host!));
  const buttons = [...host.querySelectorAll('button')];
  expect(buttons.map((b) => b.textContent)).toEqual(['Keep riding', 'End without saving']);
  act(() => buttons[0].click()); expect(onCancel).toHaveBeenCalledTimes(1); expect(onEnd).not.toHaveBeenCalled();
  act(() => buttons[1].click()); expect(onEnd).toHaveBeenCalledTimes(1);
});
