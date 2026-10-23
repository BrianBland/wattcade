import type { Profile } from '../contracts';
import { COSMETICS_VERSION, ITEMS, itemKey } from './catalog';
import { ORIGINAL_ITEMS } from './legacyCatalog';
import { ROTATION } from './rotation';
import { loadout } from './unlocks';
import { SLOTS, type Slot } from './types';

/** Translate old reward choices, drop retired equipment, and remove ownership snapshots. */
export function migrateCosmetics<T extends Pick<Profile, 'level' | 'achievements' | 'cosmetics'>>(p: T): T {
  const previous = p.cosmetics as (NonNullable<Profile['cosmetics']> & { legacy?: unknown }) | undefined;
  if ((previous?.rotation ?? 0) >= COSMETICS_VERSION && !('legacy' in (previous ?? {}))) return p;
  const { legacy: _removed, ...cosmetics } = previous ?? {};
  const pickMap = new Map(ORIGINAL_ITEMS.filter(it => 'pick' in it.source).map(it => [it.id, ROTATION[itemKey(it)]?.id ?? it.id]));
  const pickIds = new Set(ITEMS.filter(it => 'pick' in it.source).map(it => it.id));
  const picks = Object.fromEntries(Object.entries(cosmetics.picks ?? {}).map(([level, id]) =>
    [level, (previous?.rotation ?? 0) < 1 ? pickMap.get(id) ?? id : id],
  ).filter(([, id]) => pickIds.has(id)));
  const next = { ...p, cosmetics: { ...cosmetics, rotation: COSMETICS_VERSION, picks } };
  const worn = loadout({ ...next, color: '' });
  next.cosmetics.loadout = Object.fromEntries(Object.entries(cosmetics.loadout ?? {}).filter(([slot, id]) =>
    slot === 'ship' || (SLOTS as readonly string[]).includes(slot) && worn[slot as Slot] === id,
  ));
  return next;
}
