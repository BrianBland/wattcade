import type { Item, Slot } from './types';
import { ORIGINAL_ITEMS } from './legacyCatalog';
import { ROTATION } from './rotation';
export { LAST_LEVEL, PICK_EVERY } from './legacyCatalog';
export const COSMETICS_VERSION = 2;
export const itemKey = (it: Pick<Item, 'slot' | 'id'>) => `${it.slot}:${it.id}`;

/** Only the current shared rewards are available; ships belong to Cadenza. */
export const ITEMS: Item[] = ORIGINAL_ITEMS.map(it => ROTATION[itemKey(it)] ?? it).filter(it => it.slot !== 'ship').concat([
  { slot: 'jersey', id: 'lh_workshirt', name: 'Island workshirt', source: { achievement: 'lh_foundations' },
    look: { pattern: 'overalls', base: '#526f79', ink: '#d4bf90' } },
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
