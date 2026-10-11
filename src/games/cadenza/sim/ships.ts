/**
 * Cadenza's ships: chosen in the pre-game menu, each with a slightly different playstyle. Multipliers apply to the
 * game's tunables (steer rate, catch radius, gray damage, shield recharge, launch bonus); `chainStep` = chain blocks
 * per +0.5 multiplier. The renderer builds the matching hull (render/craft.ts; ids match).
 */
export const SHIP_IDS = ['triad', 'lancer', 'manta'] as const;
export type ShipId = (typeof SHIP_IDS)[number];
export const isShipId = (id: unknown): id is ShipId => (SHIP_IDS as readonly unknown[]).includes(id);

export interface ShipDef {
  id: ShipId; name: string;
  /** One word for the menu, and the playstyle in a sentence. */
  style: string; blurb: string;
  /** Unlocked by a Cadenza achievement (absent = always available). */
  unlock?: { achievement: string; hint: string };
  steer: number; catch: number; greyDamage: number; recharge: number; chainStep: number; launchBonus: number;
}

export const SHIPS: Record<ShipId, ShipDef> = {
  triad: {
    id: 'triad', name: 'Triad', style: 'Steady', blurb: 'Tougher shield: grays hurt less and it recharges faster.',
    steer: 1, catch: 1, greyDamage: 0.75, recharge: 1.3, chainStep: 8, launchBonus: 1,
  },
  lancer: {
    id: 'lancer', name: 'Lancer', style: 'Precise', blurb: 'Quickest lane changes and a faster multiplier, but a narrow catch. Launches pay 50% more.',
    unlock: { achievement: 'cz_sets', hint: 'Earn “Encore”: ride 10 sets to the end' },
    steer: 1.45, catch: 0.8, greyDamage: 1, recharge: 1, chainStep: 6, launchBonus: 1.5,
  },
  manta: {
    id: 'manta', name: 'Manta', style: 'Wide', blurb: 'The wing scoops blocks from further out, but it turns slower and grays are harder to slip past.',
    unlock: { achievement: 'cz_launches', hint: 'Earn “Launch Pad”: 25 perfect launches' },
    steer: 0.8, catch: 1.3, greyDamage: 1, recharge: 1, chainStep: 8, launchBonus: 1,
  },
};

export const shipUnlocked = (id: ShipId, achievements: readonly string[], all = false) => {
  const u = SHIPS[id].unlock;
  return all || !u || achievements.includes(u.achievement);
};
