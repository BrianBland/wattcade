// @vitest-environment jsdom
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, expect, it, vi } from 'vitest';
import { UiButton, UiProgress, UiTabs, UiToggle, UiTooltip } from './components';
let host: HTMLDivElement;
afterEach(() => {
  if (host) {
    act(() => render(null, host));
    host.remove();
  }
});
it('exposes bounded progress to assistive technology', () => {
  host = document.createElement('div');
  act(() => render(<UiProgress value={2} label="Recharge" />, host));
  expect(host.querySelector('[role=progressbar]')?.getAttribute('aria-valuenow')).toBe('100');
});
it('keeps native button activation out of the global controller menu listener', () => {
  host = document.createElement('div');
  document.body.append(host);
  const global = vi.fn();
  window.addEventListener('keydown', global);
  try {
    act(() => render(<UiButton>Continue</UiButton>, host));
    host.querySelector('button')!.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Enter',
      bubbles: true
    }));
    expect(global).not.toHaveBeenCalled();
  } finally {
    window.removeEventListener('keydown', global);
  }
});
it('uses arrow keys to skip disabled tabs and focus the next usable tab', () => {
  host = document.createElement('div');
  document.body.append(host);
  const change = vi.fn();
  act(() => render(<UiTabs label="View" value="a" items={[{
    value: 'a',
    label: 'A'
  }, {
    value: 'b',
    label: 'B',
    disabled: true
  }, {
    value: 'c',
    label: 'C'
  }]} onChange={change} />, host));
  act(() => {
    host.querySelector('button')!.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'ArrowRight',
      bubbles: true
    }));
  });
  expect(change).toHaveBeenCalledWith('c');
  expect(document.activeElement).toBe(host.querySelectorAll('button')[2]);
});
it('exposes toggle state and prevents an unavailable action', () => {
  host = document.createElement('div');
  const change = vi.fn(),
    click = vi.fn();
  act(() => render(<><UiToggle on onChange={change} /><UiButton disabled onClick={click}>Disabled</UiButton></>, host));
  expect(host.querySelector('[role=switch]')?.getAttribute('aria-checked')).toBe('true');
  act(() => host.querySelector<HTMLButtonElement>('[role=switch]')!.click());
  expect(change).toHaveBeenCalledWith(false);
  host.querySelectorAll('button')[1].click();
  expect(click).not.toHaveBeenCalled();
});
it('keeps portaled help open while its toolbar scrolls and closes on Escape', () => {
  host = document.createElement('div');
  document.body.append(host);
  act(() => render(<UiTooltip label="Help">Extra instructions</UiTooltip>, host));
  act(() => host.querySelector('button')!.click());
  expect(document.querySelector('[role=tooltip]')?.textContent).toBe('Extra instructions');
  act(() => {
    window.dispatchEvent(new Event('scroll'));
  });
  expect(document.querySelector('[role=tooltip]')).not.toBeNull();
  act(() => {
    host.querySelector('button')!.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true
    }));
  });
  expect(document.querySelector('[role=tooltip]')).toBeNull();
});
