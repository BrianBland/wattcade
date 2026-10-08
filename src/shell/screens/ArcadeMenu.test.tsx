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
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
  const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  const profile = defaultProfile('Test');
  host = document.createElement('div'); document.body.appendChild(host);
  const show = (visible: boolean) => act(() => render(<ArcadeMenu games={games} profile={profile} visible={visible} onPlay={() => {}} onNav={() => {}} onBack={() => {}} />, host!));
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
