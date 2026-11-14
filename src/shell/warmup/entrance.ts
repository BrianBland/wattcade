// Pure: where the shell puts a game's entrance on the overworld road, and what it draws.
import type { GameModule } from '../../contracts';

/** Seconds of riding to reach an entrance that spawns just off screen; beyond this it appears nearer, inside the view. */
export const MAX_APPROACH_S = 4.5;
/** Metres beyond the right edge of the view where an entrance spawns (so it scrolls in rather than popping up). */
export const OFFSCREEN_M = 4;

/**
 * How far ahead of the rider (m) a new entrance stands. It spawns just past the right edge when the rider would reach it
 * within MAX_APPROACH_S at speed `v` (m/s); slower riders get it nearer, never closer than 60% of the visible road ahead.
 */
export function spawnAheadM(v: number, aheadM: number, maxS = MAX_APPROACH_S): number {
  const offscreen = aheadM + OFFSCREEN_M, minM = aheadM * 0.6;
  return Math.max(minM, Math.min(offscreen, Math.max(0, v) * maxS));
}

/** Seconds to ride to a newly spawned entrance at speed `v` (m/s), given the visible road ahead. */
export function approachS(v: number, aheadM: number, maxS = MAX_APPROACH_S): number {
  return spawnAheadM(v, aheadM, maxS) / Math.max(0.5, v);
}
/** Load estimates are stretched by this much, so the rider reaches the entrance after the game is ready. */
export const LOAD_MARGIN = 1.25;
/** Spawn the entrance now? Yes once the rider would reach it no sooner than the (padded) load is expected to finish. */
export function spawnNow(elapsedS: number, estimateS: number, approach: number, margin = LOAD_MARGIN): boolean {
  return elapsedS + approach >= estimateS * margin;
}
/** Metres an entrance that is still loading keeps ahead of the rider (it drifts along rather than letting them in). */
export const HOLD_GAP_M = 3;

/** What the shell asks the overworld to show: entering a game, or coming back out of one. */
export interface StageEntrance {
  /** Changes for every new entrance. */
  key: number;
  kind: 'enter' | 'exit';
  style: 'portal' | 'gate';
  color: string;
  label: string;
  art?: (g: CanvasRenderingContext2D, w: number, h: number, t: number) => void;
  /** Enter now (A): the entrance jumps to the rider. */
  jump?: boolean;
  /** Let go of what `art` holds (its clip) once the entrance is gone. */
  dispose?: () => void;
  /** The game is still loading: keep the entrance HOLD_GAP_M ahead of a rider who catches up with it. */
  hold?: boolean;
}

/**
 * What a game's entrance looks like. A portal's window plays the game's recorded card clip (`clip`: the .mp4 and its
 * .webp poster, the same ones the arcade card shows): the poster until the video has a frame. With neither (local dev, a
 * game not recorded yet) the window is the accent-coloured swirl. drawCard's vector art is never used here.
 */
export function entranceFor(game: GameModule, kind: StageEntrance['kind'], key = Date.now(), clip?: { mp4: string; poster: string }): StageEntrance {
  const style = game.entry ?? 'portal';
  const video = kind === 'enter' && style === 'portal' && clip ? openClip(clip.mp4) : null;
  const poster = video && clip ? openPoster(clip.poster) : null;
  const art = video ? (g: CanvasRenderingContext2D, w: number, h: number) => { if (!drawCover(g, video, w, h) && poster) drawCover(g, poster, w, h); } : null;
  return {
    key, kind, style, color: game.accent ?? '#ffffff', label: game.title,
    ...(art ? { art } : {}),
    ...(video ? { dispose: () => { video.pause(); video.removeAttribute('src'); video.load(); } } : {}),
  };
}

function openPoster(src: string): HTMLImageElement | null {
  if (typeof Image === 'undefined') return null;
  const i = new Image(); i.src = src; return i;
}

function openClip(src: string): HTMLVideoElement | null {
  if (typeof document === 'undefined') return null;
  const v = document.createElement('video');
  v.muted = true; v.loop = true; v.playsInline = true; v.preload = 'auto';
  v.setAttribute('muted', ''); v.setAttribute('playsinline', '');
  v.src = src;
  void v.play()?.catch?.(() => {});
  return v;
}

/** Draw a video frame or image to cover w×h, centred; false when it has nothing to show yet (or failed to load). */
function drawCover(g: CanvasRenderingContext2D, m: HTMLVideoElement | HTMLImageElement, w: number, h: number): boolean {
  const v = m instanceof HTMLVideoElement;
  const mw = v ? m.videoWidth : m.naturalWidth, mh = v ? m.videoHeight : m.naturalHeight;
  if (!mw || !mh || (v ? m.readyState < 2 || !!m.error : !m.complete)) return false;
  const s = Math.max(w / mw, h / mh), dw = mw * s, dh = mh * s;
  try { g.drawImage(m, (w - dw) / 2, (h - dh) / 2, dw, dh); return true; } catch { return false; }
}
