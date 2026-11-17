export type HostPhase = 'intro' | 'menu' | 'play' | 'ending';

/**
 * Where a game opens. The controls card ('intro') comes first when the rider needs it, before any pre-game menu,
 * so the menu's choices (mode, loadout, ride length) make sense. Without it, a game with its own menu opens in that
 * menu, and any other game says GO at once (no countdown: resistance eases in via the mixer ramp).
 */
export function openingPhase(showControls: boolean, simInMenu: boolean): 'intro' | 'menu' | 'go' {
  if (showControls) return 'intro';
  return simInMenu ? 'menu' : 'go';
}

/** The pause menu is available while riding and on a game's own pre-game menu (where Quit goes back to the arcade). */
export const canPause = (phase: HostPhase) => phase === 'play' || phase === 'menu';

/**
 * Where a "start" request (A or a tap) leads. GO never happens while the game still shows its own pre-game menu:
 * the controls card hands over to that menu, and GO follows once the sim reports `inMenu() === false`.
 */
export function startTarget(phase: HostPhase, simInMenu: boolean): 'menu' | 'go' | null {
  if (phase !== 'intro' && phase !== 'menu') return null;
  if (simInMenu) return phase === 'intro' ? 'menu' : null;
  return 'go';
}
