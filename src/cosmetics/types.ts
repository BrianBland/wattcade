/** Cosmetic slots, in Locker order. */
export const SLOTS = ['bike', 'hat', 'jersey', 'paint', 'pet', 'trail', 'ship', 'title'] as const;
export type Slot = (typeof SLOTS)[number];
export const SLOT_NAMES: Record<Slot, string> = { bike: 'Bikes', hat: 'Helmets & hats', jersey: 'Jerseys', paint: 'Paint', pet: 'Pets', trail: 'Trails', ship: 'Ships', title: 'Titles' };

/** How an item is unlocked. `pick` = one of three offered at that level (the rider chooses one). */
export type Source = { default: true } | { level: number } | { achievement: string } | { pick: number };

export type JerseyPattern =
  | 'plain' | 'vstripes' | 'hoops' | 'dots' | 'band' | 'checker' | 'sash' | 'bolt' | 'flames' | 'tiger' | 'zebra' | 'camo'
  | 'galaxy' | 'stars' | 'tux' | 'cape' | 'floral' | 'retro' | 'mail' | 'bones' | 'hazard' | 'suit' | 'hamster' | 'coat'
  | 'eq' | 'disco' | 'waves' | 'overalls' | 'rainbow' | 'argyle' | 'tiedye' | 'leopard' | 'plaid' | 'bee' | 'pajamas'
  | 'circuit' | 'neon' | 'marble' | 'royal' | 'lighthouse';
/** `base`/`ink` 'rider' = the profile colour. */
export interface JerseyLook { pattern: JerseyPattern; base: string; ink: string }
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
  | (Base & { slot: 'title' });

/** What the rider wears, resolved from a loadout (ids → looks). Drawing code reads only this. */
export interface RiderLook {
  bike: string; hat: string; jersey: JerseyLook; paint: PaintLook;
  /** Pet and trail ids ('none' = nothing). */
  pet: string; trail: string;
  /** The profile colour (accents: helmet stripe, rider-coloured jerseys). */
  color: string;
}
