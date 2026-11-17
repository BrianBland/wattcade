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

/**
 * Seconds to ride to a newly spawned entrance at speed `v` (m/s), given the visible road ahead. Conservative: it assumes
 * the rider may speed up by `speedUp` on the way.
 */
export function approachS(v: number, aheadM: number, maxS = MAX_APPROACH_S, speedUp = 1.3): number {
  return spawnAheadM(v, aheadM, maxS) / Math.max(0.5, v * speedUp);
}
/** Load estimates are stretched by this much and padded by LOAD_PAD_S, so the rider reaches the entrance after the game is ready. */
export const LOAD_MARGIN = 1.5;
export const LOAD_PAD_S = 0.75;
/**
 * Spawn the entrance now, before the game has loaded? Only with an estimate (`estimateS`: this device's past loads of
 * the game; null when it has never loaded here, and then the entrance waits for the load), and only once the rider
 * could not reach it before the padded estimate is up.
 */
export function spawnNow(elapsedS: number, estimateS: number | null, approach: number, margin = LOAD_MARGIN, padS = LOAD_PAD_S): boolean {
  return estimateS != null && elapsedS + approach >= estimateS * margin + padS;
}
/** If the rider still catches an entrance that is loading: it never comes nearer than this (m)... */
export const HOLD_GAP_M = 4;
/** ...and within HOLD_EASE_M it backs away at HOLD_DRIFT of the rider's speed, so they close on it slowly instead of pinning it in place. */
export const HOLD_EASE_M = 14;
export const HOLD_DRIFT = 0.8;
/** Where a loading entrance at `x` stands after the rider moves from `d0` to `d` (m). */
export function holdX(x: number, d0: number, d: number): number {
  const moved = Math.max(0, d - d0);
  const eased = x - d < HOLD_EASE_M ? x + moved * HOLD_DRIFT : x;
  return Math.max(eased, d + HOLD_GAP_M);
}

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
