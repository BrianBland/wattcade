import type { Item, Slot } from './types';
import { ORIGINAL_ITEMS } from './legacyCatalog';
import { ROTATION } from './rotation';
export { LAST_LEVEL, PICK_EVERY } from './legacyCatalog';
export const COSMETICS_VERSION = 2;
export const itemKey = (it: Pick<Item, 'slot' | 'id'>) => `${it.slot}:${it.id}`;

/**
 * Rewards whose achievement was retired and that moved to a successor (Dynamo Defense levels, Nov 2026). Owning
 * them follows the new achievement; a rider who only had the retired one loses the item with it.
 */
const RESOURCED: Record<string, string> = {
  'pet:robodog': 'td_levels5', 'jersey:hazard': 'td_levels15', 'title:w_unbreakable': 'td_levels30',
  'bottoms:w_spotless_overalls': 'td_three_stars', 'trail:embers': 'td_hard', 'pet:turret': 'td_double_shift',
};
const resourced = (it: Item): Item => RESOURCED[itemKey(it)] ? { ...it, source: { achievement: RESOURCED[itemKey(it)] } } : it;

/** Only the current shared rewards are available; ships belong to Cadenza. */
export const ITEMS: Item[] = ORIGINAL_ITEMS.map(it => resourced(ROTATION[itemKey(it)] ?? it)).filter(it => it.slot !== 'ship').concat([
  { slot: 'jersey', id: 'lh_workshirt', name: 'Island workshirt', source: { achievement: 'lh_foundations' },
    look: { pattern: 'overalls', base: '#526f79', ink: '#d4bf90' } },
  // Dynamo Defense level goals (Nov 2026): recoloured jersey patterns and paints, so they need no new art.
  { slot: 'paint', id: 'tyrant_hide', name: 'Tyrant Hide', source: { achievement: 'td_brood_hunter' },
    look: { frame: '#e8322b', frame2: '#7b3cff', kind: 'fade' } },
  { slot: 'jersey', id: 'road_map', name: 'Road Map', source: { achievement: 'td_cartographer' },
    look: { pattern: 'circuit', base: '#3a4a2a', ink: '#e9d9a6' } },
  { slot: 'jersey', id: 'hi_vis', name: 'Hi-Vis', source: { achievement: 'td_full_shift' },
    look: { pattern: 'hazard', base: '#ff7a1a', ink: '#15151c' } },
  { slot: 'paint', id: 'night_watch', name: 'Night Watch', source: { achievement: 'td_night_watch' },
    look: { frame: '#16205a', frame2: '#7df9ff', kind: 'glow' } },
  { slot: 'hat', id: 'none', name: 'No headwear', source: { default: true } },
  ...(['bottoms', 'hands', 'feet', 'eyewear', 'back'] as const).map(slot => ({
    slot, id: 'none', name: ({bottoms: 'Classic shorts', hands: 'Bare hands', feet: 'Basic shoes', eyewear: 'No eyewear', back: 'No back item'})[slot],
    source: { default: true } as const,
    look: { kind: slot === 'bottoms' ? 'shorts' : 'none', base: '#22222b', ink: '#aab8c7' },
  })),
]);
const BY_ID = new Map(ITEMS.map(it => [itemKey(it), it]));
export const item = (slot: Slot, id: string): Item | undefined => BY_ID.get(`${slot}:${id}`);
export const DEFAULTS: Record<Slot, string> = { bike: 'road', hat: 'road', jersey: 'plain', paint: 'silver', pet: 'none', trail: 'none', ship: 'triad', title: 'none', bottoms: 'none', hands: 'none', feet: 'none', eyewear: 'none', back: 'none' };
export const itemsIn = (slot: Slot): Item[] => ITEMS.filter(it => it.slot === slot);
