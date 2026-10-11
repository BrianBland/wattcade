// Roguelite meta-progression: coins are banked across runs and spent at camp on permanent upgrades.
export type UpgradeId = 'vitality' | 'might' | 'regen' | 'flask' | 'fortune' | 'luck' | 'scholar' | 'delve' | 'arcanist';
export interface UpgradeDef { id: UpgradeId; name: string; desc: string; max: number; base: number; growth: number }

export const UPGRADES: UpgradeDef[] = [
  { id: 'might',    name: 'Might',         desc: '+10% damage',                        max: 30, base: 300,  growth: 1.3 },
  { id: 'vitality', name: 'Vitality',      desc: '+12% max HP',                        max: 30, base: 300,  growth: 1.3 },
  { id: 'regen',    name: 'Regeneration',    desc: '+0.4% max HP/s regen in any zone',   max: 10, base: 600,  growth: 1.45 },
  { id: 'flask',    name: 'Deep Flask',    desc: '+1 potion capacity',                 max: 3,  base: 1500, growth: 2.5 },
  { id: 'fortune',  name: 'Fortune',       desc: '+10% coins',                         max: 20, base: 600,  growth: 1.4 },
  { id: 'luck',     name: 'Treasure Nose', desc: '+10% item drops, better rarity',     max: 15, base: 700,  growth: 1.4 },
  { id: 'scholar',  name: 'Scholar',       desc: '+10% XP',                            max: 15, base: 500,  growth: 1.4 },
  { id: 'arcanist', name: 'Arcanist',      desc: 'Unlock the Arcanist stance (orb staves)', max: 1, base: 2500, growth: 1 },
  { id: 'delve',    name: 'Delver',        desc: 'Start 2 floors deeper (up to best - 1)', max: 15, base: 2000, growth: 1.45 },
];

export type Levels = Partial<Record<UpgradeId, number>>;
export const lvl = (l: Levels, id: UpgradeId) => l[id] ?? 0;
export function upgradeCost(def: UpgradeDef, level: number): number { return Math.round(def.base * Math.pow(def.growth, level)); }

export interface MetaMods { hpMult: number; dmgMult: number; speedMult: number; regen: number; potionCap: number; coinMult: number; dropMult: number; rarityBumpChance: number; xpMult: number; maxStartFloor: number; arcanist: boolean }
export function metaMods(l: Levels, bestFloor: number): MetaMods {
  return {
    hpMult: 1 + 0.12 * lvl(l, 'vitality'),
    dmgMult: 1 + 0.1 * lvl(l, 'might'),
    speedMult: 1,
    regen: 0.4 * lvl(l, 'regen'),
    potionCap: 3 + lvl(l, 'flask'),
    coinMult: 1 + 0.1 * lvl(l, 'fortune'),
    dropMult: 1 + 0.1 * lvl(l, 'luck'),
    rarityBumpChance: 0.03 * lvl(l, 'luck'),
    xpMult: 1 + 0.1 * lvl(l, 'scholar'),
    maxStartFloor: Math.max(1, Math.min(1 + 2 * lvl(l, 'delve'), bestFloor - 1)),
    arcanist: lvl(l, 'arcanist') > 0,
  };
}

/** Spend the bank on the cheapest affordable upgrades (keeps the build balanced). Returns new bank. */
export function autoInvest(bank: number, l: Levels): { bank: number; bought: UpgradeId[] } {
  const bought: UpgradeId[] = [];
  for (;;) {
    let best: UpgradeDef | null = null, bestCost = Infinity;
    for (const d of UPGRADES) {
      if (lvl(l, d.id) >= d.max) continue;
      const c = upgradeCost(d, lvl(l, d.id));
      if (c < bestCost) { best = d; bestCost = c; }
    }
    if (!best || bestCost > bank) break;
    bank -= bestCost; l[best.id] = lvl(l, best.id) + 1; bought.push(best.id);
  }
  return { bank, bought };
}

/** Coins spent on `levels` of an upgrade (for refunds). */
export function spentOn(d: { base: number; growth: number }, levels: number): number {
  let c = 0; for (let L = 0; L < levels; L++) c += upgradeCost(d as UpgradeDef, L); return c;
}
/** Retired upgrades, kept only so old saves can be refunded. */
export const RETIRED: Record<string, { base: number; growth: number }> = { swift: { base: 500, growth: 1.5 } };
