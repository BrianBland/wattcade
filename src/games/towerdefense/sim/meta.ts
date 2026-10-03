// Garage: parts are banked across runs and spent on permanent upgrades between runs.
export type UpgradeId = 'plating' | 'barrels' | 'burner' | 'capacitor' | 'capacity' | 'servos' | 'salvage' | 'foundry' | 'stockpile' | 'headstart';
export interface UpgradeDef { id: UpgradeId; name: string; desc: string; max: number; base: number; growth: number }

export const UPGRADES: UpgradeDef[] = [
  { id: 'plating',   name: 'Hull Plating',   desc: '+10% base HP',                       max: 20, base: 120,  growth: 1.35 },
  { id: 'barrels',   name: 'Hot Barrels',    desc: '+8% Gatling damage',                 max: 20, base: 120,  growth: 1.35 },
  { id: 'burner',    name: 'Afterburner',    desc: '+8% Flame damage',                   max: 20, base: 120,  growth: 1.35 },
  { id: 'capacitor', name: 'Capacitors',     desc: 'Rail charges 10% faster',            max: 12, base: 160,  growth: 1.4 },
  { id: 'capacity',  name: 'Capacitor Bank', desc: '+1 max rail charge',                 max: 2,  base: 1200, growth: 3 },
  { id: 'servos',    name: 'Quick Servos',   desc: '-10% weapon swap time',              max: 6,  base: 200,  growth: 1.5 },
  { id: 'salvage',   name: 'Salvage Rig',    desc: '+10% scrap',                         max: 15, base: 150,  growth: 1.4 },
  { id: 'foundry',   name: 'Foundry',        desc: '-5% tower costs',                    max: 8,  base: 220,  growth: 1.45 },
  { id: 'stockpile', name: 'Stockpile',      desc: '+40 starting scrap',                 max: 10, base: 180,  growth: 1.4 },
  { id: 'headstart', name: 'Forward Base',   desc: 'Start 2 waves later (up to best - 2)', max: 10, base: 600,  growth: 1.5 },
];

export type Levels = Partial<Record<UpgradeId, number>>;
export const lvl = (l: Levels, id: UpgradeId): number => l[id] ?? 0;
export const upgradeCost = (def: UpgradeDef, level: number): number => Math.round(def.base * Math.pow(def.growth, level));

export interface MetaMods {
  hpMult: number; gatlingMult: number; flameMult: number; railRate: number; railExtra: number; swapMult: number;
  scrapMult: number; towerCostMult: number; startScrap: number; maxStartWave: number;
}
export function metaMods(l: Levels, bestWave: number): MetaMods {
  return {
    hpMult: 1 + 0.1 * lvl(l, 'plating'),
    gatlingMult: 1 + 0.08 * lvl(l, 'barrels'),
    flameMult: 1 + 0.08 * lvl(l, 'burner'),
    railRate: 1 + 0.1 * lvl(l, 'capacitor'),
    railExtra: lvl(l, 'capacity'),
    swapMult: Math.max(0.3, 1 - 0.1 * lvl(l, 'servos')),
    scrapMult: 1 + 0.1 * lvl(l, 'salvage'),
    towerCostMult: Math.max(0.5, 1 - 0.05 * lvl(l, 'foundry')),
    startScrap: 40 * lvl(l, 'stockpile'),
    maxStartWave: Math.max(1, Math.min(1 + 2 * lvl(l, 'headstart'), bestWave - 2)),
  };
}

/** Parts banked for clearing wave `w` (boss kills add more in the sim). */
export const partsForWave = (w: number): number => 4 + Math.round(w * 1.5);

/** Spend the bank on the cheapest affordable upgrades (keeps the build balanced). */
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
