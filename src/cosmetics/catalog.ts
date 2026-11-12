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
  // Full Send (Nov 2026): new art for the big ones (jet wings, pet boulder, astronaut helmet, re-entry trail, pocket rocket), recolours for the rest, and its title.
  { slot: 'jersey', id: 'fs_booster', name: 'Booster Pad', source: { achievement: 'fs_first_tour' }, look: { pattern: 'chevrons', base: '#1b1b2a', ink: '#ffd23b' } },
  { slot: 'back', id: 'fs_jet_wings', name: 'Jet wings', source: { achievement: 'fs_sky' }, look: { kind: 'jetwings', base: '#e8ecf2', ink: '#7fd4ff', accent: '#3c4256' } },
  { slot: 'eyewear', id: 'fs_flip_goggles', name: 'Flip goggles', source: { achievement: 'fs_flip' }, look: { kind: 'goggles', base: '#ff7a1a', ink: '#ffe68c' } },
  { slot: 'jersey', id: 'fs_loop_hoops', name: 'Loop Hoops', source: { achievement: 'fs_loop' }, look: { pattern: 'hoops', base: '#2f7a3a', ink: '#ffd23b' } },
  { slot: 'pet', id: 'boulder', name: 'Pet boulder', source: { achievement: 'fs_cave' }, flavor: 'A chip off the one that chased you into the cave.' },
  { slot: 'hands', id: 'fs_flip_mitts', name: 'Flip mitts', source: { achievement: 'fs_flips' }, look: { kind: 'mitts', base: '#ff4d6d', ink: '#ffffff' } },
  { slot: 'hat', id: 'astronaut', name: 'Astronaut helmet', source: { achievement: 'fs_moon' }, flavor: 'Gold visor down: the sun is brutal up there.' },
  { slot: 'trail', id: 'reentry', name: 'Re-entry', source: { achievement: 'fs_reentry' }, flavor: 'You came down from the moon and brought the burn with you.' },
  { slot: 'jersey', id: 'fs_classic_kit', name: 'Classic Kit', source: { achievement: 'fs_classic' }, look: { pattern: 'retro', base: '#c8102e', ink: '#ffffff' } },
  { slot: 'eyewear', id: 'fs_bullet_shades', name: 'Bullet-time shades', source: { achievement: 'fs_matrix' }, look: { kind: 'shades', base: '#0b0b0b', ink: '#2de2a6' } },
  { slot: 'paint', id: 'fs_gold_rush', name: 'Gold Rush', source: { achievement: 'fs_golds' }, look: { frame: '#ffd23b', frame2: '#fff3a0', kind: 'glow' } },
  { slot: 'title', id: 't_full_send', name: 'Full Send', source: { achievement: 'fs_golden' } },
  { slot: 'pet', id: 'pocketrocket', name: 'Pocket rocket', source: { achievement: 'fs_hours' }, flavor: 'Ten hours of sprints and it has started following you home.' },
  { slot: 'jersey', id: 'fs_triple_star', name: 'Triple Star', source: { achievement: 'fs_triple' }, look: { pattern: 'stars', base: '#16205a', ink: '#ffd23b' } },
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
