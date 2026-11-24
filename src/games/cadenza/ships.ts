import type { Profile } from '../../contracts';

export const SHIPS = [
  { id: 'triad', name: 'Triad', achievement: null, hint: 'Starter ship' },
  { id: 'lancer', name: 'Lancer', achievement: 'cz_sets', hint: 'Encore · finish 10 sets' },
  { id: 'manta', name: 'Manta', achievement: 'cz_launches', hint: 'Launch Pad · 25 perfect launches' },
] as const;
export type ShipId = typeof SHIPS[number]['id'];
export const unlockedShips = (p: Pick<Profile, 'achievements'>) => SHIPS.filter(s => !s.achievement || p.achievements.includes(s.achievement));
/** Read the old shared loadout as a fallback until this game's menu is saved. */
export function selectedShip(p: Pick<Profile, 'achievements' | 'cosmetics' | 'gameData'>): ShipId {
  const saved = (p.gameData?.cadenza as { ship?: string } | undefined)?.ship ?? p.cosmetics?.loadout?.ship;
  return unlockedShips(p).find(s => s.id === saved)?.id ?? 'triad';
}
/** Gameplay behaviours. Ships without an entry play the standard game. Lancer: three frequency-band bars (sim/bands.ts). */
export type ShipBehavior = 'bands';
export const SHIP_BEHAVIOR: Partial<Record<ShipId, ShipBehavior>> = { lancer: 'bands' };
export const shipBehavior = (id: ShipId): ShipBehavior | null => SHIP_BEHAVIOR[id] ?? null;
