import type { Rarity, WeaponStyle } from './loot';
import { STANCE_ORDER, stanceOfStyle, type StanceId } from './stances';

/** Collection survives automatic equipment changes, but never a new descent. */
export function createArsenalCollection() {
  const collected = new Set<StanceId>();
  return {
    reset: () => collected.clear(),
    /** True only on the pickup that completes the collection. Sold pickups count too. */
    collect(style: WeaponStyle, rarity: Rarity, arcanistUnlocked: boolean): boolean {
      if (rarity < 3 || !arcanistUnlocked || collected.size === STANCE_ORDER.length) return false;
      collected.add(stanceOfStyle(style, arcanistUnlocked));
      return collected.size === STANCE_ORDER.length;
    },
  };
}
