// Load a game while the rider rides toward its entrance: import the renderer, mount it in a hidden layer, wait for its
// assets, and draw one frame from a throwaway sim so shaders and caches are built. GameHost adopts the mounted renderer
// (the layer moves into its mount), so riding through the portal starts the game with no load at all.
import type { GameModule, GameRenderer, Insets, MediaTimeline, MusicFx, Profile } from '../../contracts';
import { readHudInsets } from '../hud/insets';
import { createGameSession, NullInput } from '../../core';
import { input } from '../services';

export interface WarmGame {
  gameId: string; profileId: string;
  renderer: GameRenderer;
  /** The layer the renderer is mounted in (GameHost moves it into its own mount). */
  host: HTMLDivElement;
  /** Connect the renderer's `send` and `musicFx` to the real session and music. Actions the warm-up frame sent (a
   *  level announcing itself, say) are replayed into it: the stand-in sim started from the same seed and state. */
  attach(send: (a: unknown) => void, musicFx?: (fx: MusicFx) => void): void;
}

/** Resolve after the page has drawn a frame (or a moment, when it is hidden). */
const nextFrame = () => new Promise<void>((r) => { let done = false; const go = () => { if (!done) { done = true; r(); } }; requestAnimationFrame(() => setTimeout(go, 0)); setTimeout(go, 100); });
/** The HUD insets over the overworld right now (the game's HUD sits in the same place). */
function lobbyInsets(): Insets {
  const stage = document.querySelector<HTMLElement>('.game-host.stage');
  return readHudInsets(stage?.querySelector<HTMLElement>('.mount') ?? null, stage?.querySelector<HTMLElement>('.hud-probe') ?? null);
}

let pending: { gameId: string; profileId: string; promise: Promise<WarmGame | null>; cancelled: boolean } | null = null;

const HIDDEN = 'position:fixed;inset:0;opacity:0;pointer-events:none;z-index:-1;overflow:hidden';

/** Start loading `game` in the background (replacing any other); resolves once it is ready to show (null on failure). */
export function prewarmGame(game: GameModule, profile: Profile, media?: { timeline: MediaTimeline }): Promise<WarmGame | null> {
  cancelPrewarm();
  const job = { gameId: game.id, profileId: profile.id, cancelled: false, promise: null as unknown as Promise<WarmGame | null> };
  job.promise = (async () => {
    const host = document.createElement('div');
    host.className = 'prewarm';
    host.style.cssText = HIDDEN;
    host.setAttribute('aria-hidden', 'true');
    document.body.appendChild(host);
    let renderer: GameRenderer | null = null;
    try {
      renderer = await game.loadRenderer();
      if (job.cancelled) throw new Error('cancelled');
      let send: ((a: unknown) => void) | null = null, fxOut: ((fx: MusicFx) => void) | undefined;
      const queued: unknown[] = [];
      const attach = (s: (a: unknown) => void, fx?: (fx: MusicFx) => void) => { send = s; fxOut = fx; for (const a of queued.splice(0)) s(a); };
      // each step gets frames of its own, so the overworld keeps moving between them
      await nextFrame();
      const insets = lobbyInsets(); // the HUD the game will have: a game sized for it doesn't re-prepare after the portal
      renderer.mount(host, { profile, send: (a) => { if (send) send(a); else if (queued.length < 200) queued.push(a); }, insets, musicFx: (fx) => fxOut?.(fx), hudControls: true });
      renderer.setInsets?.(insets);
      await nextFrame();
      await renderer.ready?.();
      if (job.cancelled) throw new Error('cancelled');
      try { // one frame from a stand-in sim: builds the scene, compiles shaders and fills caches while the real ride still runs
        const s = createGameSession({ game, profile, input: new NullInput(), fake: {}, ...(media ? { media: { timeline: media.timeline } } : {}) });
        const snap = s.sim.snapshot();
        await nextFrame();
        await renderer.prepare?.(snap);
        if (job.cancelled) throw new Error('cancelled');
        await nextFrame();
        renderer.render(snap, s.ctx.bike(), input.state());
      } catch (e) { if (job.cancelled) throw e; /* best effort: the game still starts warm */ }
      return { gameId: game.id, profileId: profile.id, renderer, host, attach };
    } catch {
      try { renderer?.unmount(); } catch { /* ignore */ }
      host.remove();
      return null;
    }
  })();
  pending = job;
  return job.promise;
}

/** Drop a background load that won't be used (the rider cancelled). */
export function cancelPrewarm() {
  const job = pending; pending = null;
  if (!job) return;
  job.cancelled = true;
  void job.promise.then((w) => { if (w) disposeWarm(w); });
}

/** GameHost: the loaded game for this rider, if one is waiting (it is then GameHost's to unmount). */
export function takeWarmGame(gameId: string, profileId: string): Promise<WarmGame | null> | null {
  const job = pending;
  if (!job || job.gameId !== gameId || job.profileId !== profileId) return null;
  pending = null;
  return job.promise;
}

export function disposeWarm(w: WarmGame) {
  try { w.renderer.unmount(); } catch { /* ignore */ }
  w.host.remove();
}

/** Move the warmed layer into GameHost's mount, filling it. */
export function adoptWarm(w: WarmGame, mount: HTMLElement) {
  w.host.style.cssText = 'position:absolute;inset:0;overflow:hidden';
  w.host.removeAttribute('aria-hidden');
  mount.appendChild(w.host);
}
