// Small adapter for YouTube's official IFrame API. No watch URLs are passed to <video>.
export interface YouTubePlayer {
  playVideo(): void; loadVideoById(id: string): void; mute(): void; unMute(): void;
  isMuted(): boolean; getVolume(): number; setVolume(volume: number): void; getPlayerState(): number; destroy(): void;
}
export interface YouTubeOptions {
  events: {
    onReady(event: { target: YouTubePlayer }): void;
    onStateChange(event: { data: number; target: YouTubePlayer }): void;
    onError(event: { data: number }): void;
    onAutoplayBlocked(): void;
  };
}
interface YouTubeAPI { Player: new (frame: HTMLIFrameElement, options: YouTubeOptions) => YouTubePlayer }
declare global {
  interface Window { YT?: YouTubeAPI; onYouTubeIframeAPIReady?: () => void }
}

let apiPromise: Promise<YouTubeAPI> | undefined;
export function loadYouTubeAPI(): Promise<YouTubeAPI> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (apiPromise) return apiPromise;
  apiPromise = new Promise<YouTubeAPI>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api';
    const previous = window.onYouTubeIframeAPIReady;
    const cleanup = () => { clearTimeout(timer); window.onYouTubeIframeAPIReady = previous; script.onerror = null; };
    const fail = () => { cleanup(); script.remove(); reject(new Error('YouTube API unavailable')); };
    const timer = window.setTimeout(fail, 15000);
    window.onYouTubeIframeAPIReady = () => {
      cleanup();
      if (window.YT?.Player) resolve(window.YT); else reject(new Error('YouTube API unavailable'));
      previous?.();
    };
    script.onerror = fail;
    document.head.appendChild(script);
  }).catch((error) => { apiPromise = undefined; throw error; });
  return apiPromise;
}

export function embedUrl(videoId: string, origin: string): string {
  const url = new URL(`https://www.youtube.com/embed/${encodeURIComponent(videoId)}`);
  url.search = new URLSearchParams({ enablejsapi: '1', origin, autoplay: '1', mute: '1', playsinline: '1', controls: '1', rel: '0' }).toString();
  return url.href;
}

interface Callbacks {
  ready(): void;
  state(playing: boolean, muted: boolean): void;
  sound(sound: boolean): void;
  error(reason: string, code?: number): void;
}

export function youtubeErrorReason(code: number): string {
  switch (code) {
    case 2: return 'Invalid video link';
    case 5: return 'YouTube playback failed';
    case 100: return 'Video is unavailable or private';
    case 101: case 150: return 'This video cannot play in an embedded player';
    case 153: return 'YouTube could not identify this player';
    default: return 'YouTube player failed';
  }
}

/** Muted start; a gesture unmutes. Destroy also cancels a pending API load and removes the iframe. */
export function mountYouTube(host: HTMLElement, videoId: string, title: string, callbacks: Callbacks) {
  let player: YouTubePlayer | undefined, gone = false, failed = false, ready = false, retries = 0;
  let poll = 0, retry = 0, timeout = 0, observedMuted = true;
  const frame = document.createElement('iframe');
  frame.src = embedUrl(videoId, window.location.origin);
  frame.title = `${title} · YouTube player`;
  frame.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
  frame.allowFullscreen = true;
  frame.referrerPolicy = 'strict-origin-when-cross-origin';
  host.appendChild(frame);
  const fail = (reason: string, code?: number) => {
    if (gone || failed) return;
    failed = true; clearTimeout(timeout); clearTimeout(retry); clearInterval(poll);
    callbacks.error(reason, code);
  };
  const observe = () => {
    if (gone || failed || !ready || !player) return;
    const muted = player.isMuted() || player.getVolume() === 0;
    if (muted !== observedMuted) { observedMuted = muted; callbacks.sound(!muted); }
    callbacks.state(player.getPlayerState() === 1, muted);
  };
  void loadYouTubeAPI().then((api) => {
    if (gone || failed) return;
    // The API download has its own timeout; don't subtract it from the iframe's readiness budget.
    timeout = window.setTimeout(() => { if (!ready) fail('YouTube player took too long to load'); }, 20000);
    player = new api.Player(frame, { events: {
      onReady: ({ target }) => {
        if (gone || failed) return;
        player = target; ready = true; clearTimeout(timeout);
        target.mute(); callbacks.ready(); target.playVideo();
        poll = window.setInterval(observe, 500);
      },
      onStateChange: ({ data, target }) => {
        if (gone || failed) return;
        if (data === 1) { retries = 0; clearTimeout(retry); }
        // Replay completed videos, including highlights; paused/autoplay-blocked players stay interactive.
        if (data === 0) target.loadVideoById(videoId);
        observe();
      },
      onAutoplayBlocked: () => { if (!gone && !failed) callbacks.ready(); },
      onError: ({ data }) => {
        if (gone || failed) return;
        clearTimeout(retry);
        // Only retry transient HTML5 playback failures; removed/private/unembeddable videos are skipped.
        if (data === 5 && ++retries < 3) retry = window.setTimeout(() => player?.loadVideoById(videoId), retries * 1200);
        else fail(youtubeErrorReason(data), data);
      },
    } });
  }).catch(() => fail('YouTube player could not load'));
  return {
    unmute() {
      if (gone || failed || !ready || !player) return;
      if (!player.isMuted() && player.getVolume() > 0) return;
      if (player.getVolume() === 0) player.setVolume(100);
      player.unMute(); player.playVideo(); observe();
    },
    mute() { if (!gone && !failed && ready && player) { player.mute(); observe(); } },
    destroy() {
      gone = true; clearTimeout(timeout); clearTimeout(retry); clearInterval(poll);
      player?.destroy(); frame.remove();
    },
  };
}
