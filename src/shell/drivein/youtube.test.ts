// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { embedUrl, loadYouTubeAPI, mountYouTube, type YouTubeOptions, type YouTubePlayer } from './youtube';

let options: YouTubeOptions, muted: boolean, state: number;
let player: YouTubePlayer, construct: ReturnType<typeof vi.fn>;
const callbacks = () => ({ ready: vi.fn(), state: vi.fn(), sound: vi.fn(), error: vi.fn() });
const flush = async () => { await Promise.resolve(); await Promise.resolve(); };

beforeEach(() => {
  vi.useFakeTimers(); muted = true; state = -1;
  player = {
    playVideo: vi.fn(), loadVideoById: vi.fn(), destroy: vi.fn(),
    mute: vi.fn(() => { muted = true; }), unMute: vi.fn(() => { muted = false; }),
    isMuted: () => muted, getVolume: () => 100, setVolume: vi.fn(), getPlayerState: () => state,
  };
  construct = vi.fn(function (_frame: HTMLIFrameElement, opts: YouTubeOptions) { options = opts; return player; });
  window.YT = { Player: construct as unknown as NonNullable<Window['YT']>['Player'] };
});
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); delete window.YT; document.body.replaceChildren(); });

describe('YouTube channel lifecycle', () => {
  it('starts muted, keeps autoplay-blocked players interactive, and syncs user sound changes', async () => {
    const host = document.createElement('div'), cb = callbacks();
    const session = mountYouTube(host, 'h-Z0wCdD3dI', 'Animal Cam', cb);
    await flush(); options.events.onReady({ target: player });
    expect(player.mute).toHaveBeenCalled(); expect(player.playVideo).toHaveBeenCalled();
    options.events.onAutoplayBlocked(); vi.advanceTimersByTime(60000);
    expect(cb.error).not.toHaveBeenCalled();
    session.unmute(); expect(cb.sound).toHaveBeenLastCalledWith(true);
    state = 1; options.events.onStateChange({ data: 1, target: player });
    expect(cb.state).toHaveBeenLastCalledWith(true, false);
    muted = true; vi.advanceTimersByTime(500);
    expect(cb.sound).toHaveBeenLastCalledWith(false);
    session.destroy(); expect(player.destroy).toHaveBeenCalled(); expect(host.childElementCount).toBe(0);
  });
  it('cancels before the API resolves without creating a background player', async () => {
    const host = document.createElement('div'), cb = callbacks();
    const session = mountYouTube(host, 'jfKfPfyJRdk', 'Lofi Girl', cb);
    session.destroy(); await flush(); vi.advanceTimersByTime(25000);
    expect(construct).not.toHaveBeenCalled(); expect(cb.error).not.toHaveBeenCalled();
  });
  it('replays finished videos, skips unavailable embeds, and bounds transient retries', async () => {
    const cb = callbacks(), session = mountYouTube(document.createElement('div'), 'video', 'Video', cb);
    await flush(); options.events.onReady({ target: player });
    options.events.onStateChange({ data: 0, target: player });
    expect(player.loadVideoById).toHaveBeenCalledWith('video');
    options.events.onError({ data: 5 }); vi.advanceTimersByTime(1200);
    options.events.onError({ data: 5 }); vi.advanceTimersByTime(2400);
    expect(cb.error).not.toHaveBeenCalled();
    options.events.onError({ data: 5 }); expect(cb.error).toHaveBeenCalledTimes(1);
    expect(cb.error).toHaveBeenCalledWith('YouTube playback failed', 5);
    options.events.onError({ data: 150 }); expect(cb.error).toHaveBeenCalledTimes(1);
    session.destroy();
  });
  it('reports the specific embedding error rather than silently skipping', async () => {
    const cb = callbacks(), session = mountYouTube(document.createElement('div'), 'video', 'Video', cb);
    await flush(); options.events.onReady({ target: player });
    options.events.onError({ data: 150 });
    expect(cb.error).toHaveBeenCalledWith('This video cannot play in an embedded player', 150);
    session.destroy();
  });
  it('includes origin and inline muted playback while retaining native controls and referrer', async () => {
    const url = new URL(embedUrl('h-Z0wCdD3dI', 'https://wattcade.brianb.land'));
    expect(url.pathname).toBe('/embed/h-Z0wCdD3dI');
    expect(url.searchParams.get('origin')).toBe('https://wattcade.brianb.land');
    expect(url.searchParams.get('mute')).toBe('1'); expect(url.searchParams.get('controls')).toBe('1');
    const host = document.createElement('div'), session = mountYouTube(host, 'video', 'Kittens', callbacks());
    expect(host.querySelector('iframe')?.title).toContain('Kittens');
    expect(host.querySelector('iframe')?.referrerPolicy).toBe('strict-origin-when-cross-origin');
    session.destroy(); await flush();
  });
  it('times out a failed API download and can retry it on the next channel', async () => {
    delete window.YT;
    const first = loadYouTubeAPI(), second = loadYouTubeAPI();
    expect(first).toBe(second);
    const rejected = expect(first).rejects.toThrow('unavailable');
    vi.advanceTimersByTime(15000); await rejected;
    expect(document.querySelector('script[src="https://www.youtube.com/iframe_api"]')).toBeNull();
    const next = loadYouTubeAPI();
    window.YT = { Player: construct as unknown as NonNullable<Window['YT']>['Player'] };
    window.onYouTubeIframeAPIReady?.(); await expect(next).resolves.toBe(window.YT);
  });
});
