import type { Button } from '../contracts';
import { input } from './services';

type Listener = (pressed: ReadonlySet<Button>) => void;
const listeners = new Set<Listener>();
let external = false;
let raf = 0, last = 0;
let gate: ((pressed: ReadonlySet<Button>) => boolean) | null = null;

/**
 * One source of controller presses for every menu. While the warm-up stage runs, it ticks the InputHub
 * (through the lobby session) and hands presses here; otherwise (e.g. the in-game pause menu) we tick it ourselves.
 */
export function onMenuPress(cb: Listener): () => void {
  listeners.add(cb); ensureLoop();
  return () => { listeners.delete(cb); };
}
/** Called by the warm-up stage each frame with the presses its session collected. */
export function deliverMenuPresses(pressed: ReadonlySet<Button>): void {
  if (!pressed.size) return;
  if (gate && !gate(pressed)) return;
  for (const l of [...listeners]) l(pressed);
}
/** The stage claims (true) or releases (false) the InputHub tick. */
export function setExternalMenuDriver(on: boolean): void { external = on; ensureLoop(); }
/** Return false to swallow presses (e.g. the first press that wakes the screensaver). */
export function setMenuGate(fn: ((pressed: ReadonlySet<Button>) => boolean) | null): void { gate = fn; }

function ensureLoop() {
  if (raf || typeof requestAnimationFrame === 'undefined') return;
  last = performance.now();
  const tick = (now: number) => {
    raf = 0;
    if (!listeners.size && !external) return;
    if (!external) {
      input.beginTick(Math.min(0.1, (now - last) / 1000));
      deliverMenuPresses(input.state().pressed);
    }
    last = now;
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
}
