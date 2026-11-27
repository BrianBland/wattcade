import type { Item, Slot } from './types';
import { ORIGINAL_ITEMS } from './legacyCatalog';
import { ROTATION } from './rotation';
export { LAST_LEVEL, PICK_EVERY } from './legacyCatalog';
export const COSMETICS_VERSION = 2;
export const itemKey = (it: Pick<Item, 'slot' | 'id'>) => `${it.slot}:${it.id}`;

/**
 * Rewards whose achievement was retired and that moved to a successor (Dynamo Defense levels and continuous combat, Nov 2026). Owning
 * them follows the new achievement; a rider who only had the retired one loses the item with it.
 */
const RESOURCED: Record<string, string> = {
  'pet:robodog': 'td_levels5', 'jersey:hazard': 'td_levels15', 'title:w_unbreakable': 'td_levels30',
  'bottoms:w_spotless_overalls': 'td_three_stars', 'trail:embers': 'td_hard', 'pet:turret': 'td_double_shift',
  // Called efforts retired (continuous combat, Nov 2026)
  'feet:w_insulated_boots': 'td_quick_change', 'back:w_dynamo_coil_pack': 'td_top_gear', 'pet:ember': 'td_redline', 'back:w_twin_air_tanks': 'td_long_haul',
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
  // Purgatour's finished descent (Nov 2026): the Grim Sweeper's broom-wagon colours, and a rainbow-gold paint for the top Category.
  { slot: 'jersey', id: 'broom_wagon', name: 'Broom Wagon', source: { achievement: 'dg_finish' },
    look: { pattern: 'chevrons', base: '#1a1524', ink: '#c42a2a' } },
  { slot: 'paint', id: 'world_tour', name: 'World Tour', source: { achievement: 'dg_world_tour' },
    look: { frame: '#ffd84a', frame2: '#3a7bd5', kind: 'fade' } },
  { slot: 'paint', id: 'night_watch', name: 'Night Watch', source: { achievement: 'td_night_watch' },
    look: { frame: '#16205a', frame2: '#7df9ff', kind: 'glow' } },
  // Full Send (Nov 2026): new art for the big ones (jet wings, pet boulder, astronaut helmet, re-entry trail, pocket rocket), recolours for the rest, and its title.
  { slot: 'jersey', id: 'fs_booster', name: 'Booster Pad', source: { achievement: 'fs_first_tour' }, look: { pattern: 'chevrons', base: '#1b1b2a', ink: '#ffd23b' } },
  { slot: 'back', id: 'fs_jet_wings', name: 'Jet wings', source: { achievement: 'fs_sky' }, look: { kind: 'jetwings', base: '#c9d0dc', ink: '#3c4256', accent: '#ff4d6d' } },
  { slot: 'eyewear', id: 'fs_flip_goggles', name: 'Flip goggles', source: { achievement: 'fs_flip' }, look: { kind: 'goggles', base: '#ff7a1a', ink: '#ffe68c' } },
  { slot: 'jersey', id: 'fs_loop_hoops', name: 'Loop Hoops', source: { achievement: 'fs_loop' }, look: { pattern: 'hoops', base: '#2f7a3a', ink: '#ffd23b' } },
  { slot: 'pet', id: 'boulder', name: 'Pet boulder', source: { achievement: 'fs_cave' }, flavor: 'A chip off the one that chased you into the cave.' },
  { slot: 'hands', id: 'fs_flip_mitts', name: 'Wheel mitts', source: { achievement: 'fs_flips' }, look: { kind: 'wheel', base: '#ff4d6d', ink: '#ffffff', accent: '#ffd23b' } },
  { slot: 'hat', id: 'astronaut', name: 'Astronaut helmet', source: { achievement: 'fs_moon' }, flavor: 'Gold visor down: the sun is brutal up there.' },
  { slot: 'trail', id: 'reentry', name: 'Re-entry', source: { achievement: 'fs_reentry' }, flavor: 'You came down from the moon and brought the burn with you.' },
  { slot: 'jersey', id: 'fs_classic_kit', name: 'Classic Kit', source: { achievement: 'fs_classic' }, look: { pattern: 'retro', base: '#c8102e', ink: '#ffffff' } },
  { slot: 'eyewear', id: 'fs_bullet_shades', name: 'Bullet-time shades', source: { achievement: 'fs_matrix' }, flavor: 'Time slows down. Mostly for you.', look: { kind: 'stopwatch', base: '#0b0b0b', ink: '#15151c', accent: '#2de2a6' } },
  { slot: 'paint', id: 'fs_gold_rush', name: 'Gold Rush', source: { achievement: 'fs_golds' }, look: { frame: '#ffd23b', frame2: '#fff3a0', kind: 'glow' } },
  { slot: 'title', id: 't_full_send', name: 'Full Send', source: { achievement: 'fs_golden' } },
  { slot: 'pet', id: 'pocketrocket', name: 'Pocket rocket', source: { achievement: 'fs_hours' }, flavor: 'Ten hours of sprints and it has started following you home.' },
  { slot: 'jersey', id: 'fs_triple_star', name: 'Triple Star', source: { achievement: 'fs_triple' }, look: { pattern: 'stars', base: '#16205a', ink: '#ffd23b' } },
  // Watershed campaign (Nov 2026): recolours, no new art.
  { slot: 'jersey', id: 'ws_raindrop', name: 'Raindrop', source: { achievement: 'ws_level_clear' }, look: { pattern: 'hoops', base: '#2f7fb8', ink: '#bfeaff' } },
  { slot: 'paint', id: 'ws_full_bucket', name: 'Full Bucket', source: { achievement: 'ws_full_bucket' }, look: { frame: '#2de2a6', frame2: '#3d97d3', kind: 'fade' } },
  { slot: 'jersey', id: 'ws_keeper', name: 'Watershed Keeper', source: { achievement: 'ws_campaign' }, look: { pattern: 'stars', base: '#1f5e4a', ink: '#bfeaff' } },
  { slot: 'hat', id: 'none', name: 'No headwear', source: { default: true } },
  ...(['bottoms', 'hands', 'feet', 'eyewear', 'back'] as const).map(slot => ({
    slot, id: 'none', name: ({bottoms: 'Classic shorts', hands: 'Bare hands', feet: 'Basic shoes', eyewear: 'No eyewear', back: 'No back item'})[slot],
    source: { default: true } as const,
    look: { kind: slot === 'bottoms' ? 'shorts' : 'none', base: '#22222b', ink: '#aab8c7' },
  })),
]);

/**
 * Rewards for games still in `wipGames`, by game id. Progression doesn't award those games' achievements yet, so their
 * items stay out of ITEMS (and the Locker); each achievement still names exactly one (cosmetics.test.ts). When a game
 * ships, move its list into ITEMS; the test fails while a shipped game's list is still here.
 */
export const WIP_ITEMS: Record<string, Item[]> = {
  // Penrose Pedals (Nov 2026): the stair print is a new jersey pattern; the rest are recolours in the game's dusk, brass and sea palettes.
  penrose: [
    { slot: 'jersey', id: 'pp_steps', name: 'Penrose Steps', source: { achievement: 'pp_cartographer' }, look: { pattern: 'steps', base: '#ECE6F6', ink: '#8D82B6' } },
    { slot: 'paint', id: 'pp_cube', name: 'The Cube', source: { achievement: 'pp_cube' }, look: { frame: '#B2A9D2', frame2: '#F7BE3E', kind: 'fade' } },
    { slot: 'title', id: 't_impossible', name: 'Impossible', source: { achievement: 'pp_monument' } },
    { slot: 'jersey', id: 'pp_grand_tour', name: 'Grand Tour', source: { achievement: 'pp_grand_tour' }, look: { pattern: 'chevrons', base: '#2A2640', ink: '#FF8E6E' } },
    { slot: 'hands', id: 'pp_sure_grips', name: 'Sure grips', source: { achievement: 'pp_sure_wheel' }, flavor: 'Painted like the dusk wheel that never once left the road.', look: { kind: 'wheel', base: '#FF8E6E', ink: '#FFF4EC', accent: '#FFD15C' } },
    { slot: 'feet', id: 'pp_clockwork', name: 'Brass clockwork shoes', source: { achievement: 'pp_unbroken' }, look: { kind: 'clockwork', base: '#2A1A08', ink: '#F7BE3E', accent: '#B1332A' } },
    { slot: 'eyewear', id: 'pp_monocle', name: 'Own Eyes monocle', source: { achievement: 'pp_own_eyes' }, flavor: 'One lens, one view, no hints.', look: { kind: 'monocle', base: '#F7BE3E', ink: '#2A2640', accent: '#FF8E6E' } },
    { slot: 'bottoms', id: 'pp_tide_waders', name: 'Spring tide waders', source: { achievement: 'pp_spring_tide' }, look: { kind: 'waders', base: '#3C7FA8', ink: '#BFEAFF', accent: '#2A2640' } },
    { slot: 'paint', id: 'pp_escher', name: 'Escher', source: { achievement: 'pp_escher' }, look: { frame: '#ECE6F6', frame2: '#2A2640', kind: 'fade' } },
    { slot: 'back', id: 'pp_parachute', name: 'Spare parachute', source: { achievement: 'pp_gravity' }, flavor: 'Gravity always wins. This is for next time.', look: { kind: 'chute', base: '#ECE6F6', ink: '#2A2640', accent: '#FF8E6E' } },
  ],
};

const BY_ID = new Map(ITEMS.map(it => [itemKey(it), it]));
export const item = (slot: Slot, id: string): Item | undefined => BY_ID.get(`${slot}:${id}`);
export const DEFAULTS: Record<Slot, string> = { bike: 'road', hat: 'road', jersey: 'plain', paint: 'silver', pet: 'none', trail: 'none', ship: 'triad', title: 'none', bottoms: 'none', hands: 'none', feet: 'none', eyewear: 'none', back: 'none' };
export const itemsIn = (slot: Slot): Item[] => ITEMS.filter(it => it.slot === slot);
