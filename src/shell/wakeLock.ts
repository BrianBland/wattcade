/**
 * Keeps the screen on while something holds it (the game host, the lobby). The rider pedals and rarely touches
 * the iPad, so the OS idle timer must not dim or lock it.
 *
 * - Screen Wake Lock API where it exists. The OS drops the lock whenever the page hides, so it is asked for again
 *   on visibilitychange and on any tap/key (some WebKit builds only grant it inside a gesture).
 * - A tiny muted, inline, looping video as the fallback: when the API is missing or refuses, and always on
 *   iOS/iPadOS, where in-app browsers (Bluefy is a WKWebView) and home-screen apps can expose the API without it
 *   working. A playing video keeps iOS awake on every version that supports inline playback.
 *
 * Holders are counted, so overlapping screens (lobby behind a menu, game host) share one lock.
 */

/** 16×16 black H.264 baseline clip, 4 s at 2 fps, no audio track (generated with ffmpeg for this file). */
export const KEEP_AWAKE_MP4 = 'data:video/mp4;base64,AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDEAAANDbW9vdgAAAGxtdmhkAAAAAAAAAAAAAAAAAAAD6AAAD6AAAQAAAQAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgAAAm10cmFrAAAAXHRraGQAAAADAAAAAAAAAAAAAAABAAAAAAAAD6AAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAABAAAAAQAAAAAAAkZWR0cwAAABxlbHN0AAAAAAAAAAEAAA+gAAAAAAABAAAAAAHlbWRpYQAAACBtZGhkAAAAAAAAAAAAAAAAAABAAAABAABVxAAAAAAALWhkbHIAAAAAAAAAAHZpZGUAAAAAAAAAAAAAAABWaWRlb0hhbmRsZXIAAAABkG1pbmYAAAAUdm1oZAAAAAEAAAAAAAAAAAAAACRkaW5mAAAAHGRyZWYAAAAAAAAAAQAAAAx1cmwgAAAAAQAAAVBzdGJsAAAAuHN0c2QAAAAAAAAAAQAAAKhhdmMxAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAABAAEABIAAAASAAAAAAAAAABFUxhdmM2MC4zMS4xMDIgbGlieDI2NAAAAAAAAAAAAAAAGP//AAAALmF2Y0MBQsAe/+EAFmdCwB7ZHsBEAAADAAQAAAMAEDxYuSABAAVoy4PLIAAAABBwYXNwAAAAAQAAAAEAAAAUYnRydAAAAAAAAAWOAAAFjgAAABhzdHRzAAAAAAAAAAEAAAAIAAAgAAAAABRzdHNzAAAAAAAAAAEAAAABAAAAHHN0c2MAAAAAAAAAAQAAAAEAAAAIAAAAAQAAADRzdHN6AAAAAAAAAAAAAAAIAAAChgAAAAoAAAAKAAAACQAAAAkAAAAJAAAACQAAAAkAAAAUc3RjbwAAAAAAAAABAAADcwAAAGJ1ZHRhAAAAWm1ldGEAAAAAAAAAIWhkbHIAAAAAAAAAAG1kaXJhcHBsAAAAAAAAAAAAAAAALWlsc3QAAAAlqXRvbwAAAB1kYXRhAAAAAQAAAABMYXZmNjAuMTYuMTAwAAAACGZyZWUAAALPbWRhdAAAAnAGBf//bNxF6b3m2Ui3lizYINkj7u94MjY0IC0gY29yZSAxNjQgcjMxMDggMzFlMTlmOSAtIEguMjY0L01QRUctNCBBVkMgY29kZWMgLSBDb3B5bGVmdCAyMDAzLTIwMjMgLSBodHRwOi8vd3d3LnZpZGVvbGFuLm9yZy94MjY0Lmh0bWwgLSBvcHRpb25zOiBjYWJhYz0wIHJlZj0zIGRlYmxvY2s9MTowOjAgYW5hbHlzZT0weDE6MHgxMTEgbWU9aGV4IHN1Ym1lPTcgcHN5PTEgcHN5X3JkPTEuMDA6MC4wMCBtaXhlZF9yZWY9MSBtZV9yYW5nZT0xNiBjaHJvbWFfbWU9MSB0cmVsbGlzPTEgOHg4ZGN0PTAgY3FtPTAgZGVhZHpvbmU9MjEsMTEgZmFzdF9wc2tpcD0xIGNocm9tYV9xcF9vZmZzZXQ9LTIgdGhyZWFkcz0xIGxvb2thaGVhZF90aHJlYWRzPTEgc2xpY2VkX3RocmVhZHM9MCBucj0wIGRlY2ltYXRlPTEgaW50ZXJsYWNlZD0wIGJsdXJheV9jb21wYXQ9MCBjb25zdHJhaW5lZF9pbnRyYT0wIGJmcmFtZXM9MCB3ZWlnaHRwPTAga2V5aW50PTI1MCBrZXlpbnRfbWluPTIgc2NlbmVjdXQ9NDAgaW50cmFfcmVmcmVzaD0wIHJjX2xvb2thaGVhZD00MCByYz1jcmYgbWJ0cmVlPTEgY3JmPTIzLjAgcWNvbXA9MC42MCBxcG1pbj0wIHFwbWF4PTY5IHFwc3RlcD00IGlwX3JhdGlvPTEuNDAgYXE9MToxLjAwAIAAAAAOZYiEBX///w9FAAFC34AAAAAGQZo4CvqAAAAABkGaVAK+oAAAAAVBmmAV9QAAAAVBmoAU9QAAAAVBmqAU9QAAAAVBmsAU9QAAAAVBmuAS9Q==';

interface Sentinel { release(): Promise<void>; addEventListener?(type: 'release', cb: () => void): void }
interface VideoLike {
  paused: boolean; muted: boolean; loop: boolean; playsInline?: boolean; src: string;
  play(): Promise<void> | void; pause(): void; setAttribute(k: string, v: string): void; remove(): void;
  style: Partial<CSSStyleDeclaration>;
}
export interface WakeEnv {
  nav: { wakeLock?: { request(type: 'screen'): Promise<Sentinel> }; userAgent: string; maxTouchPoints?: number };
  doc: {
    visibilityState: string;
    addEventListener(t: string, cb: () => void, o?: unknown): void; removeEventListener(t: string, cb: () => void, o?: unknown): void;
    createElement(t: 'video'): VideoLike; body: { appendChild(v: VideoLike): unknown } | null;
  };
}

/** iPhone/iPod/iPad, including iPadOS that reports a Mac user agent. */
export function isAppleTouch(nav: WakeEnv['nav']): boolean {
  return /iPad|iPhone|iPod/.test(nav.userAgent) || (/Macintosh/.test(nav.userAgent) && (nav.maxTouchPoints ?? 0) > 1);
}

const GESTURES = ['pointerdown', 'touchend', 'keydown'] as const;

export class ScreenWake {
  private holders = 0;
  private sentinel: Sentinel | null = null;
  private pending = false;
  private nativeFailed = false;
  private video: VideoLike | null = null;
  private readonly ensure = () => this.refresh();
  private readonly onVis = () => this.refresh();

  constructor(private readonly env: WakeEnv) {}

  /** Hold the screen awake until the returned function is called (idempotent). */
  hold(): () => void {
    if (++this.holders === 1) this.start();
    let held = true;
    return () => { if (held) { held = false; if (--this.holders === 0) this.stop(); } };
  }

  /** For tests and the debug overlay. */
  state(): { holders: number; native: boolean; video: boolean } {
    return { holders: this.holders, native: !!this.sentinel, video: !!this.video && !this.video.paused };
  }

  private useVideo(): boolean {
    return !this.env.nav.wakeLock || this.nativeFailed || isAppleTouch(this.env.nav);
  }

  private start(): void {
    this.env.doc.addEventListener('visibilitychange', this.onVis);
    for (const g of GESTURES) this.env.doc.addEventListener(g, this.ensure, { capture: true, passive: true });
    this.refresh();
  }

  private stop(): void {
    this.env.doc.removeEventListener('visibilitychange', this.onVis);
    for (const g of GESTURES) this.env.doc.removeEventListener(g, this.ensure, { capture: true, passive: true } as unknown);
    const s = this.sentinel; this.sentinel = null; void s?.release().catch(() => {});
    if (this.video) { this.video.pause(); this.video.remove(); this.video = null; }
  }

  private refresh(): void {
    if (this.holders === 0 || this.env.doc.visibilityState !== 'visible') return;
    const wl = this.env.nav.wakeLock;
    if (wl && !this.sentinel && !this.pending) {
      this.pending = true;
      let p: Promise<Sentinel>;
      try { p = wl.request('screen'); } catch (e) { p = Promise.reject(e); }
      p.then((s) => {
        this.pending = false;
        if (this.holders === 0) { void s.release().catch(() => {}); return; }
        this.sentinel = s; this.nativeFailed = false;
        s.addEventListener?.('release', () => { if (this.sentinel === s) this.sentinel = null; });
      }, () => { // asked again only on the next gesture or visibility change, never in a loop
        this.pending = false; this.nativeFailed = true;
        if (this.holders > 0 && this.env.doc.visibilityState === 'visible') this.playVideo();
      });
    }
    if (this.useVideo()) this.playVideo();
  }

  private playVideo(): void {
    let v = this.video;
    if (!v) {
      v = this.env.doc.createElement('video');
      v.muted = true; v.loop = true; v.playsInline = true;
      v.setAttribute('muted', ''); v.setAttribute('playsinline', ''); v.setAttribute('webkit-playsinline', '');
      v.setAttribute('aria-hidden', 'true'); v.setAttribute('data-keep-awake', '');
      Object.assign(v.style, { position: 'fixed', left: '0', top: '0', width: '1px', height: '1px', opacity: '0', pointerEvents: 'none', zIndex: '-1' });
      v.src = KEEP_AWAKE_MP4;
      this.env.doc.body?.appendChild(v);
      this.video = v;
    }
    if (v.paused) { try { void Promise.resolve(v.play()).catch(() => {}); } catch { /* retried on the next gesture */ } }
  }
}

let shared: ScreenWake | null = null;
/** Hold the screen awake app-wide; returns the release. No-op outside a browser. */
export function keepScreenAwake(): () => void {
  if (typeof document === 'undefined' || typeof navigator === 'undefined') return () => {};
  shared ??= new ScreenWake({ nav: navigator as unknown as WakeEnv['nav'], doc: document as unknown as WakeEnv['doc'] });
  return shared.hold();
}
