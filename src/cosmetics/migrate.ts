import type { Profile } from '../contracts';
import { COSMETICS_VERSION, itemKey } from './catalog';
import { ORIGINAL_ITEMS } from './legacyCatalog';
import { ROTATION } from './rotation';

/** Freeze old ownership once, before changing sources or remapping chosen picks. */
export function migrateCosmetics<T extends Pick<Profile, 'level' | 'achievements' | 'cosmetics'>>(p: T): T {
  if ((p.cosmetics?.rotation ?? 0) >= COSMETICS_VERSION) return p;
  const picks = p.cosmetics?.picks ?? {};
  const chosen = new Set(Object.values(picks));
  const owned = ORIGINAL_ITEMS.filter(it => {
    const s = it.source;
    return 'default' in s || ('level' in s ? p.level >= s.level : 'achievement' in s ? p.achievements.includes(s.achievement) : chosen.has(it.id));
  });
  const pickMap = new Map(ORIGINAL_ITEMS.filter(it => 'pick' in it.source).map(it => [it.id, ROTATION[itemKey(it)]?.id ?? it.id]));
  return { ...p, cosmetics: {
    ...p.cosmetics, rotation: COSMETICS_VERSION,
    legacy: [...new Set([...(p.cosmetics?.legacy ?? []), ...owned.map(itemKey)])],
    picks: Object.fromEntries(Object.entries(picks).map(([level, id]) => [level, pickMap.get(id) ?? id])),
  } };
}
