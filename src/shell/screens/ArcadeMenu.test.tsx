// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { afterEach, expect, it, vi } from 'vitest';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { ArcadeMenu } from './ArcadeMenu';
import { games } from '../../games/registry';
import { defaultProfile } from '../../progression';

let host: HTMLDivElement | undefined;
afterEach(() => {
  if (host) { act(() => render(null, host!)); host.remove(); }
  vi.restoreAllMocks(); vi.unstubAllGlobals();
});

it('pauses the selected clip when asleep or hidden and resumes the same clip on wake', async () => {
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(1000);
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
  const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  const profile = defaultProfile('Test');
  host = document.createElement('div'); document.body.appendChild(host);
  const show = (visible: boolean) => act(() => render(<ArcadeMenu games={games} profile={profile} visible={visible} onPlay={() => {}} onNav={() => {}} onEndRide={() => {}} />, host!));
  await show(true);
  const video = host.querySelector('video');
  expect(video).not.toBeNull(); expect(play).toHaveBeenCalled();
  await show(false);
  expect(pause).toHaveBeenCalled(); expect(host.querySelector('video')).toBe(video);
  play.mockClear(); await show(true); expect(play).toHaveBeenCalled();
  pause.mockClear();
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
  await act(() => { document.dispatchEvent(new Event('visibilitychange')); });
  expect(pause).toHaveBeenCalled();
  play.mockClear();
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  await act(() => { document.dispatchEvent(new Event('visibilitychange')); });
  expect(play).toHaveBeenCalled(); expect(host.querySelector('video')).toBe(video);
});

it('has one End ride action that confirms before ending', async () => {
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(1000);
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
  const onEndRide = vi.fn();
  host = document.createElement('div'); document.body.appendChild(host);
  await act(() => render(<ArcadeMenu games={games} profile={defaultProfile('Test')} onPlay={() => {}} onNav={() => {}} onEndRide={onEndRide} endRideStatus={() => ({ kind: 'save', activeS: 300 })} />, host!));
  const labels = [...host.querySelectorAll('.topbar button')].map((b) => b.textContent ?? '');
  expect(labels.filter((l) => /End ride/.test(l))).toHaveLength(1);
  expect(labels.some((l) => /Switch rider/.test(l))).toBe(false);
  const end = [...host.querySelectorAll<HTMLButtonElement>('.topbar button')].find((b) => /End ride/.test(b.textContent ?? ''))!;
  await act(() => end.click());
  expect(onEndRide).not.toHaveBeenCalled();
  const confirm = [...host.querySelectorAll<HTMLButtonElement>('.end-ride-confirm button')].find((b) => /End & save/.test(b.textContent ?? ''))!;
  await act(() => confirm.click());
  expect(onEndRide).toHaveBeenCalledTimes(1);
  expect(host.querySelector('.end-ride-confirm')).toBeNull();
});
