export type HostPhase = 'intro' | 'menu' | 'count' | 'play' | 'ending';

/**
 * Where a "start" request (A button, tap, or the intro auto-timer) leads. The 3-2-1-GO countdown must never
 * run while the game still shows its own pre-game menu (variant, loadout): that goes to 'menu' first, and the
 * countdown starts only once the sim reports `inMenu() === false`.
 */
export function startTarget(phase: HostPhase, simInMenu: boolean): 'menu' | 'count' | null {
  if (phase !== 'intro' && phase !== 'menu') return null;
  if (simInMenu) return phase === 'intro' ? 'menu' : null;
  return 'count';
}
