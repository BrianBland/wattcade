export type HostPhase = 'intro' | 'menu' | 'count' | 'play' | 'ending';

/**
 * Where a "start" request (A button, tap, or the intro auto-timer) leads. The 3-2-1-GO countdown must never
 * run while the game still shows its own pre-game menu (variant, loadout): that goes to 'menu' first, and the
 * countdown starts only once the sim reports `inMenu() === false`.
 */
/**
 * A game with its own pre-game menu (variant, loadout, difficulty) opens straight into it: that menu replaces the
 * shell's generic intro card, whose blurb and controls stay one tap away under Pause → Controls.
 */
export function openingPhase(simInMenu: boolean): 'intro' | 'menu' {
  return simInMenu ? 'menu' : 'intro';
}

/** The pause menu is available while riding and on a game's own pre-game menu (where Quit goes back to the arcade). */
export const canPause = (phase: HostPhase) => phase === 'play' || phase === 'menu';

export function startTarget(phase: HostPhase, simInMenu: boolean): 'menu' | 'count' | null {
  if (phase !== 'intro' && phase !== 'menu') return null;
  if (simInMenu) return phase === 'intro' ? 'menu' : null;
  return 'count';
}
