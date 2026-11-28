import { PressGuard } from '../core/pressGuard';

/**
 * One debounce for every shell menu commit: controller A/B and Enter/Esc (useMenuNav) and taps on `Btn`.
 * Shared across screens, so the press that leaves one screen cannot also act on the next one.
 * (Pure helper from core; no singletons, so this is the one exception to "only services.ts imports core".)
 */
export const SHELL_COMMIT_GUARD_S = 0.15;
const guard = new PressGuard(SHELL_COMMIT_GUARD_S);
const nowS = () => (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;

/** True when this commit may act (and re-arms the guard); false swallows a double tap or button bounce. */
export function shellCommit(now = nowS()): boolean { return guard.pass(now); }
/** Tests: change the hold (vitest's setup sets 0 so screen tests can press at machine speed) and forget the last commit. */
export function setShellCommitGuard(holdS: number): void { guard.holdS = holdS; guard.reset(); }
