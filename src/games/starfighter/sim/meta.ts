// Hangar meta-progression: scrap is banked across runs and spent on permanent ship upgrades.
export type UpgradeId = 'plating' | 'capacitor' | 'cannons' | 'autoloader' | 'magnet' | 'overdrive' | 'salvage' | 'armory' | 'wingman' | 'pod' | 'warp';
export interface UpgradeDef { id: UpgradeId; name: string; desc: string; max: number; base: number; growth: number }

export const UPGRADES: UpgradeDef[] = [
  { id: 'cannons',    name: 'Cannons',       desc: '+8% shot damage',                          max: 25, base: 240,  growth: 1.32 },
  { id: 'plating',    name: 'Hull Plating',  desc: '+10% hull',                                max: 20, base: 240,  growth: 1.32 },
  { id: 'capacitor',  name: 'Shield Cap',    desc: '+10% shield, +8% regen',                   max: 20, base: 300,  growth: 1.32 },
  { id: 'autoloader', name: 'Autoloader',    desc: '+6% fire rate per crank rev',              max: 15, base: 400,  growth: 1.4 },
  { id: 'magnet',     name: 'Scrap Magnet',  desc: '+20% pickup range',                        max: 10, base: 300,  growth: 1.4 },
  { id: 'overdrive',  name: 'Overdrive Coil',desc: '+15% sprint beam damage, wider beam',      max: 15, base: 440,  growth: 1.38 },
  { id: 'salvage',    name: 'Salvage Rig',   desc: '+10% scrap',                               max: 20, base: 400,  growth: 1.38 },
  { id: 'armory',     name: 'Armory',        desc: 'Start each run with +1 gun level',         max: 2,  base: 1800,  growth: 3 },
  { id: 'wingman',    name: 'Wing Bay',      desc: 'Permanent wingman drone (+1 per level)',   max: 2,  base: 3000, growth: 3 },
  { id: 'pod',        name: 'Escape Pod',    desc: '+1 spare ship per run',                    max: 2,  base: 2400, growth: 3 },
  { id: 'warp',       name: 'Warp Drive',    desc: 'Start 1 sector deeper (up to best - 1)',   max: 12, base: 1200,  growth: 1.5 },
];

export type Levels = Partial<Record<UpgradeId, number>>;
export const lvl = (l: Levels, id: UpgradeId) => l[id] ?? 0;
export function upgradeCost(def: UpgradeDef, level: number): number { return Math.round(def.base * Math.pow(def.growth, level)); }

export interface MetaMods {
  dmgMult: number; hullMult: number; shieldMult: number; regenMult: number; fireMult: number; magnetMult: number;
  odMult: number; odWidthMult: number; scrapMult: number; startGun: number; wingmen: number; pods: number; maxStartSector: number;
}
export function metaMods(l: Levels, bestSector: number): MetaMods {
  return {
    dmgMult: 1 + 0.08 * lvl(l, 'cannons'),
    hullMult: 1 + 0.1 * lvl(l, 'plating'),
    shieldMult: 1 + 0.1 * lvl(l, 'capacitor'),
    regenMult: 1 + 0.08 * lvl(l, 'capacitor'),
    fireMult: 1 + 0.06 * lvl(l, 'autoloader'),
    magnetMult: 1 + 0.2 * lvl(l, 'magnet'),
    odMult: 1 + 0.15 * lvl(l, 'overdrive'),
    odWidthMult: 1 + 0.03 * lvl(l, 'overdrive'),
    scrapMult: 1 + 0.1 * lvl(l, 'salvage'),
    startGun: 1 + lvl(l, 'armory'),
    wingmen: lvl(l, 'wingman'),
    pods: lvl(l, 'pod'),
    maxStartSector: Math.max(1, Math.min(1 + lvl(l, 'warp'), bestSector - 1)),
  };
}

/** Spend the bank on the cheapest affordable upgrades (keeps the ship balanced). */
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
