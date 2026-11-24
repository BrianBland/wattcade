import type { Profile } from '../../contracts';

export const SHIPS = [
  { id: 'triad', name: 'Triad', achievement: null, hint: 'Starter ship', lanes: 3 },
  { id: 'lancer', name: 'Lancer', achievement: 'cz_sets', hint: 'Encore · finish 10 sets', lanes: 3 },
  { id: 'manta', name: 'Manta', achievement: 'cz_launches', hint: 'Launch Pad · 25 perfect launches', lanes: 5 },
] as const;
export type ShipId = typeof SHIPS[number]['id'];
export const unlockedShips = (p: Pick<Profile, 'achievements'>) => SHIPS.filter(s => !s.achievement || p.achievements.includes(s.achievement));
/** Read the old shared loadout as a fallback until this game's menu is saved. */
export function selectedShip(p: Pick<Profile, 'achievements' | 'cosmetics' | 'gameData'>): ShipId {
  const saved = (p.gameData?.cadenza as { ship?: string } | undefined)?.ship ?? p.cosmetics?.loadout?.ship;
  return unlockedShips(p).find(s => s.id === saved)?.id ?? 'triad';
}
/** Road width is the ship's perk (difficulty sets density, not lanes): Manta flies 5 lanes, the others 3. */
export type ShipLanes = typeof SHIPS[number]['lanes'];
export const shipLanes = (id: ShipId): ShipLanes => SHIPS.find(s => s.id === id)?.lanes ?? 3;
