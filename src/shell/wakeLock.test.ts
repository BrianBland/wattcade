import { describe, expect, it } from 'vitest';
import { isAppleTouch, ScreenWake, type WakeEnv } from './wakeLock';

const flush = () => new Promise((r) => setTimeout(r, 0));

function fakeEnv(opts: { api?: 'ok' | 'reject' | 'none'; ua?: string; touch?: number } = {}) {
  const listeners = new Map<string, Set<() => void>>();
  const sentinels: Array<{ released: boolean; fire(): void }> = [];
  const videos: Array<{ paused: boolean; removed: boolean; plays: number }> = [];
  let requests = 0;
  const api = opts.api ?? 'ok';
  const env: WakeEnv = {
    nav: {
      userAgent: opts.ua ?? 'Mozilla/5.0 (Windows NT 10.0) Chrome/120',
      maxTouchPoints: opts.touch ?? 0,
      ...(api === 'none' ? {} : {
        wakeLock: {
          request: () => {
            requests++;
            if (api === 'reject') return Promise.reject(new Error('NotAllowedError'));
            let cb: (() => void) | null = null;
            const s = {
              released: false,
              fire() { s.released = true; cb?.(); },
              release: async () => { s.released = true; },
              addEventListener: (_: 'release', f: () => void) => { cb = f; },
            };
            sentinels.push(s);
            return Promise.resolve(s);
          },
        },
      }),
    },
    doc: {
      visibilityState: 'visible',
      addEventListener: (t, cb) => { if (!listeners.has(t)) listeners.set(t, new Set()); listeners.get(t)!.add(cb); },
      removeEventListener: (t, cb) => { listeners.get(t)?.delete(cb); },
      createElement: () => {
        const v = {
          paused: true, removed: false, plays: 0, muted: false, loop: false, src: '', style: {}, attrs: {} as Record<string, string>,
          play() { v.plays++; v.paused = false; return Promise.resolve(); },
          pause() { v.paused = true; },
          setAttribute(k: string, val: string) { v.attrs[k] = val; },
          remove() { v.removed = true; },
        };
        videos.push(v);
        return v;
      },
      body: { appendChild: () => undefined },
    },
  };
  const emit = (t: string) => { for (const cb of [...(listeners.get(t) ?? [])]) cb(); };
  const count = () => [...listeners.values()].reduce((n, s) => n + s.size, 0);
  return { env, emit, sentinels, videos, requests: () => requests, listenerCount: count };
}

describe('ScreenWake', () => {
  it('takes the native lock and asks again after the page comes back', async () => {
    const f = fakeEnv();
    const w = new ScreenWake(f.env);
    const release = w.hold();
    await flush();
    expect(w.state()).toMatchObject({ native: true, video: false });
    // iOS/Chrome drop the lock when the page hides
    f.env.doc.visibilityState = 'hidden'; f.sentinels[0].fire(); f.emit('visibilitychange');
    await flush();
    expect(w.state().native).toBe(false);
    expect(f.requests()).toBe(1); // not while hidden
    f.env.doc.visibilityState = 'visible'; f.emit('visibilitychange');
    await flush();
    expect(f.requests()).toBe(2);
    expect(w.state().native).toBe(true);
    release();
    expect(f.sentinels[1].released).toBe(true);
    expect(f.listenerCount()).toBe(0);
  });

  it('falls back to a muted inline looping video when the API is missing', async () => {
    const f = fakeEnv({ api: 'none' });
    const w = new ScreenWake(f.env);
    const release = w.hold();
    expect(f.videos).toHaveLength(1);
    expect(w.state().video).toBe(true);
    // the OS paused it in the background: a gesture or coming back restarts it
    f.videos[0].paused = true; f.emit('pointerdown');
    expect(f.videos[0].plays).toBe(2);
    release();
    expect(f.videos[0]).toMatchObject({ paused: true, removed: true });
  });

  it('falls back to video when the API refuses, and retries the API on a gesture', async () => {
    const f = fakeEnv({ api: 'reject' });
    const w = new ScreenWake(f.env);
    w.hold();
    await flush();
    expect(w.state()).toMatchObject({ native: false, video: true });
    f.emit('keydown'); await flush();
    expect(f.requests()).toBe(2);
    expect(f.videos).toHaveLength(1);
  });

  it('uses both on iPadOS, which can grant the lock without honoring it', async () => {
    const f = fakeEnv({ ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15', touch: 5 });
    const w = new ScreenWake(f.env);
    w.hold(); await flush();
    expect(w.state()).toMatchObject({ native: true, video: true });
  });

  it('shares one lock between holders and releases on the last', async () => {
    const f = fakeEnv();
    const w = new ScreenWake(f.env);
    const a = w.hold(), b = w.hold(); await flush();
    expect(f.requests()).toBe(1);
    a(); a(); // idempotent
    expect(f.sentinels[0].released).toBe(false);
    b();
    expect(f.sentinels[0].released).toBe(true);
    expect(w.state().holders).toBe(0);
  });

  it('releases a lock granted after the last holder left', async () => {
    const f = fakeEnv();
    const w = new ScreenWake(f.env);
    w.hold()(); await flush();
    expect(f.sentinels[0].released).toBe(true);
  });
});

describe('isAppleTouch', () => {
  it('spots iPhone, iPad and desktop-mode iPadOS but not a Mac', () => {
    expect(isAppleTouch({ userAgent: 'Mozilla/5.0 (iPad; CPU OS 15_0 like Mac OS X)' })).toBe(true);
    expect(isAppleTouch({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', maxTouchPoints: 5 })).toBe(true);
    expect(isAppleTouch({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', maxTouchPoints: 0 })).toBe(false);
  });
});
