// Pure mapping tables and helpers for the input sources.
import type { Button, SystemAction } from '../contracts';

export const KEY_BUTTONS: Record<string, Button> = {
  ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
  KeyL: 'a', KeyK: 'b', KeyI: 'y', KeyJ: 'z', // IJKL diamond = Ride right hood
  KeyQ: 'shiftUpL', KeyA: 'shiftDnL', KeyP: 'shiftUpR', Semicolon: 'shiftDnR',
  Digit1: 'powerUpL', Digit2: 'powerUpR',
};
/** Keyboard paddles (SPEC 3.1): N/M left paddle -1/+1, , and . right paddle. */
export const KEY_PADDLES: Record<string, { side: 'L' | 'R'; dir: -1 | 1 }> = {
  KeyN: { side: 'L', dir: -1 }, KeyM: { side: 'L', dir: 1 },
  Comma: { side: 'R', dir: -1 }, Period: { side: 'R', dir: 1 },
};
export const KEY_SYSTEM: Record<string, SystemAction> = { Escape: 'pause', Backquote: 'toggleDebug', Digit0: 'panic' };

/** Gamepad (standard mapping) button index -> Button (SPEC 3.1). Sticks x -> paddles. */
export const PAD_BUTTONS: Record<number, Button> = {
  1: 'a', 0: 'b', 3: 'y', 2: 'z', // face buttons by position: right/bottom/top/left 4: 'shiftUpL', 5: 'shiftUpR', 6: 'shiftDnL', 7: 'shiftDnR',
  8: 'powerUpL', 9: 'powerUpR', 12: 'up', 13: 'down', 14: 'left', 15: 'right',
};

/** Both powerUp buttons: tapped (<1 s) -> pause, held >= 1 s -> toggleDebug. Not passed to games. */
export const COMBO_HOLD_MS = 1000;

export const SHIFTERS: ReadonlySet<Button> = new Set<Button>(['shiftUpL', 'shiftDnL', 'shiftUpR', 'shiftDnR']);

/** Deadzone then rescale: raw -100..100 -> -1..1, 0 inside the deadzone. */
/** sign(v)·|v|^expo for v in -1..1: keeps 0 and ±1 fixed, softens partial deflection. */
export function applyExpo(v: number, expo: number): number {
  const e = Math.max(1, expo);
  return Math.sign(v) * Math.pow(Math.min(1, Math.abs(v)), e);
}

export function applyDeadzone(raw: number, deadzone: number, invert = false): number {
  const dz = Math.max(0, Math.min(99, deadzone));
  const a = Math.abs(raw);
  if (a <= dz) return 0;
  const v = Math.min(1, (a - dz) / (100 - dz)) * Math.sign(raw);
  return invert ? -v : v;
}
