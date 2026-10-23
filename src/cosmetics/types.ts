/** Cosmetic slots, in Locker order. */
export const SLOTS = ['bike', 'hat', 'eyewear', 'jersey', 'bottoms', 'hands', 'feet', 'back', 'paint', 'pet', 'trail', 'title'] as const;
/** Ship remains readable for old saves and game-local item art, outside the shared Locker. */
export type Slot = (typeof SLOTS)[number] | 'ship';
export type WearSlot = 'bottoms' | 'hands' | 'feet' | 'eyewear' | 'back';
export const SLOT_NAMES: Record<Slot, string> = { bike: 'Bikes', hat: 'Helmets & hats', jersey: 'Tops', bottoms: 'Bottoms', hands: 'Hands', feet: 'Feet', eyewear: 'Eyewear', back: 'Back', paint: 'Paint', pet: 'Pets', trail: 'Trails', ship: 'Ships', title: 'Titles' };
export const SLOT_GROUPS = [
  { name: 'Ride', slots: ['bike', 'paint'] },
  { name: 'Rider', slots: ['hat', 'eyewear', 'jersey', 'bottoms', 'hands', 'feet', 'back'] },
  { name: 'Company & effects', slots: ['pet', 'trail'] },
  { name: 'Identity', slots: ['title'] },
] satisfies Array<{ name: string; slots: Slot[] }>;

/** How an item is unlocked. `pick` = one of three offered at that level (the rider chooses one). */
export type Source = { default: true } | { level: number } | { achievement: string } | { pick: number };

export type JerseyPattern =
  | 'plain' | 'vstripes' | 'hoops' | 'dots' | 'band' | 'checker' | 'sash' | 'bolt' | 'flames' | 'tiger' | 'zebra' | 'camo'
  | 'galaxy' | 'stars' | 'tux' | 'cape' | 'floral' | 'retro' | 'mail' | 'bones' | 'hazard' | 'suit' | 'hamster' | 'coat'
  | 'eq' | 'disco' | 'waves' | 'overalls' | 'rainbow' | 'argyle' | 'tiedye' | 'leopard' | 'plaid' | 'bee' | 'pajamas'
  | 'circuit' | 'neon' | 'marble' | 'royal' | 'lighthouse' | 'embers' | 'scrap' | 'dynamo' | 'chevrons';
/** `base`/`ink` 'rider' = the profile colour. */
export type TopCut = 'jersey' | 'tank' | 'crop' | 'bikini' | 'hoodie' | 'vest' | 'mesh' | 'knotted' | 'coat' | 'jacket' | 'robe';
export interface JerseyLook { pattern: JerseyPattern; base: string; ink: string; cut?: TopCut }
export interface WearLook { kind: string; base: string; ink: string; accent?: string; pattern?: 'stripe' | 'spots' | 'bones' | 'patch' | 'eq' | 'chevron' }
/** Frame colours. `kind` animates: rainbow cycles hue, glow adds a halo, fade blends frame→frame2 along the bike. */
export interface PaintLook { frame: string; frame2?: string; kind?: 'solid' | 'rainbow' | 'glow' | 'fade' }

interface Base { id: string; name: string; source: Source; flavor?: string }
export type Item =
  | (Base & { slot: 'bike' })
  | (Base & { slot: 'hat' })
  | (Base & { slot: 'jersey'; look: JerseyLook })
  | (Base & { slot: 'paint'; look: PaintLook })
  | (Base & { slot: 'pet' })
  | (Base & { slot: 'trail' })
  /** A Cadenza ship (drawn by `draw/ships.ts`, flown by the Cadenza renderer). */
  | (Base & { slot: 'ship' })
  | (Base & { slot: 'title' })
  | WardrobeItem;
export type WardrobeItem = Base & { slot: WearSlot; look: WearLook };

/** Resolved wardrobe art; string aliases keep the original visual study reproducible. */
export interface OutfitLook {
  bottoms?: WearLook | 'club' | 'aurora' | 'disco';
  footwear?: WearLook | 'road' | 'winged' | 'ducks';
  eyewear?: WearLook | 'shades' | 'visor' | 'stars';
  back?: WearLook | 'musette' | 'courier' | 'rocket';
  gloves?: WearLook | 'mitts' | 'gauntlets' | 'claws';
}

/** What the rider wears, resolved from a loadout (ids → looks). Drawing code reads only this. */
export interface RiderLook {
  bike: string; hat: string; jersey: JerseyLook; paint: PaintLook;
  /** Pet and trail ids ('none' = nothing). */
  pet: string; trail: string;
  /** The profile colour (accents: helmet stripe, rider-coloured jerseys). */
  color: string;
  /** Independent garments and accessories. Missing values retain old rider art. */
  outfit?: OutfitLook;
}
