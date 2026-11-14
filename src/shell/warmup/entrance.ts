// Pure: where the shell puts a game's entrance on the overworld road, and what it draws.
import type { GameModule, Profile } from '../../contracts';

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
}

export function entranceFor(game: GameModule, kind: StageEntrance['kind'], profile: Pick<Profile, 'color'> | null, key = Date.now()): StageEntrance {
  const draw = game.drawCard, color = profile?.color ?? '#ffffff';
  return {
    key, kind, style: game.entry ?? 'portal', color: game.accent ?? '#ffffff', label: game.title,
    ...(draw ? { art: (g: CanvasRenderingContext2D, w: number, h: number, t: number) => draw(g, w, h, t, color) } : {}),
  };
}
