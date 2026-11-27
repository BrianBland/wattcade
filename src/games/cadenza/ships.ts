import type { Profile } from '../../contracts';

/**
 * Every ship slides at the same rate. They differ in how they meet a block:
 * `catch` widens the coloured-block window past the nearest lane, `mine` narrows how close a gray must be to bite.
 * Triad is the old nearest-lane judge. Lancer must be on the block and slips a mine it only clips. Manta scoops a graze.
 */
export const SHIPS = [
  { id: 'triad', name: 'Triad', achievement: null, hint: 'Starter ship · 3 lanes, picks up the one you are in', lanes: 3, catch: 0, mine: 0.5 },
  { id: 'lancer', name: 'Lancer', achievement: 'cz_sets', hint: 'Encore · finish 10 sets · 5 lanes, slips a mine it only clips', lanes: 5, catch: 0, mine: 0.28 },
  { id: 'manta', name: 'Manta', achievement: 'cz_launches', hint: 'Launch Pad · 25 perfect launches · 3 lanes, wide scoop', lanes: 3, catch: 0.34, mine: 0.72 },
] as const;
export type ShipId = typeof SHIPS[number]['id'];
export const unlockedShips = (p: Pick<Profile, 'achievements'>) => SHIPS.filter(s => !s.achievement || p.achievements.includes(s.achievement));
/** Read the old shared loadout as a fallback until this game's menu is saved. */
export function selectedShip(p: Pick<Profile, 'achievements' | 'cosmetics' | 'gameData'>): ShipId {
  const saved = (p.gameData?.cadenza as { ship?: string } | undefined)?.ship ?? p.cosmetics?.loadout?.ship;
  return unlockedShips(p).find(s => s.id === saved)?.id ?? 'triad';
}
export const shipHandling = (id: ShipId) => SHIPS.find(s => s.id === id) ?? SHIPS[0];
