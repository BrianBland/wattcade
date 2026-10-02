// Town rules: building catalogue, levels, neighbour bonuses, districts, lighthouse lens tiers. Pure data + functions.
import { PLOTS, type DistrictId } from './layout';

export type BuildingType = 'cottage' | 'garden' | 'orchard' | 'pier' | 'market' | 'bell' | 'lamp2' | 'mill' | 'shipyard' | 'lifeboat';
export const BUILDING_TYPES: BuildingType[] = ['cottage', 'garden', 'orchard', 'pier', 'market', 'mill', 'bell', 'shipyard', 'lifeboat', 'lamp2'];

export interface BuildingDef {
  names: string[];            // one per level
  icon: string;
  cost: { coin: number; timber: number };
  max: number;
  shore?: boolean;            // must go on a beach plot
  effects: string[];          // one per level
}
export const BUILDINGS: Record<BuildingType, BuildingDef> = {
  cottage: { names: ['Cottage', 'House', 'Inn'], icon: '🏠', cost: { coin: 25, timber: 8 }, max: 8, effects: ['Villagers move in; +coin', 'Coin x2.2; more villagers', 'Coin x3.6; travellers stay'] },
  garden: { names: ['Garden', 'Flower Garden', 'Glasshouse'], icon: '🌷', cost: { coin: 15, timber: 3 }, max: 4, effects: ['Nearby homes +20%; island blooms faster', 'Blooms 2x faster', 'Blooms 3x faster'] },
  orchard: { names: ['Orchard', 'Cider Orchard'], icon: '🍎', cost: { coin: 40, timber: 10 }, max: 3, effects: ['+coin, +timber; nearby homes +20%', 'Double harvest'] },
  pier: { names: ['Pier', 'Long Pier', 'Fishery'], icon: '⚓', cost: { coin: 60, timber: 15 }, max: 2, shore: true, effects: ['Ships dock in rougher, foggier water', 'Wider docking tolerance', 'Fishers sell their catch: +coin'] },
  market: { names: ['Market', 'Bazaar', 'Trade Hall'], icon: '🧺', cost: { coin: 120, timber: 25 }, max: 1, effects: ['All coin x1.25; nearby homes +25%', 'All coin x1.4', 'All coin x1.6'] },
  mill: { names: ['Windmill', 'Great Windmill'], icon: '🌬️', cost: { coin: 70, timber: 10 }, max: 2, effects: ['+timber over time (+50% next to an orchard)', 'Timber x1.8'] },
  bell: { names: ['Fog Bell', 'Bell Tower'], icon: '🔔', cost: { coin: 80, timber: 20 }, max: 2, effects: ['Fog rises slower', 'Fog rises much slower'] },
  shipyard: { names: ['Shipyard', 'Dry Dock'], icon: '🛠️', cost: { coin: 160, timber: 50 }, max: 1, shore: true, effects: ['Bigger ships: cargo x1.3, more steamers', 'Cargo x1.6, ships call more often'] },
  lifeboat: { names: ['Lifeboat Station'], icon: '🛟', cost: { coin: 90, timber: 30 }, max: 1, shore: true, effects: ['Rescues a ship in trouble (every 4 min)'] },
  lamp2: { names: ['Beacon', 'Great Beacon'], icon: '🔥', cost: { coin: 150, timber: 40 }, max: 1, effects: ['Stronger lamp, clears fog faster (needs 5 homes)', 'Even stronger lamp'] },
};
export const maxLevel = (b: BuildingType) => BUILDINGS[b].names.length;
/** Cost to raise a building from `level` to `level + 1`. */
export function upgradeCost(b: BuildingType, level: number) {
  const m = level === 1 ? 3 : 7, c = BUILDINGS[b].cost;
  return { coin: Math.round(c.coin * m), timber: Math.round(c.timber * m) };
}
/** Growth (0..1) the surroundings need before upgrading from `level`. */
export const upgradeGrow = (level: number) => (level === 1 ? 0.5 : 1);

// ---------- neighbours ----------
export const NEAR = 8.5;
const NEIGHBOURS = PLOTS.map((p, plot) => PLOTS.map((_, i) => i).filter((i) => i !== plot && Math.hypot(PLOTS[i].x - p.x, PLOTS[i].z - p.z) <= NEAR));
export const neighbours = (plot: number): readonly number[] => NEIGHBOURS[plot];
type Town = ReadonlyArray<BuildingType | null>;
const near = (town: Town, plot: number, kinds: BuildingType[]) => neighbours(plot).filter((i) => town[i] && kinds.includes(town[i]!));

/** Income multiplier for a cottage from its neighbours. */
export function homeBonus(town: Town, plot: number): number {
  return 1 + 0.2 * Math.min(3, near(town, plot, ['garden', 'orchard']).length) + (near(town, plot, ['market']).length ? 0.25 : 0);
}
/** Cargo bonus a pier gets from a market next door (+20%). */
export const pierBonus = (town: Town, plot: number) => (near(town, plot, ['market']).length ? 1.2 : 1);
export const orchardBonus = (town: Town, plot: number) => (near(town, plot, ['garden']).length ? 1.25 : 1);
export const millBonus = (town: Town, plot: number) => (near(town, plot, ['orchard']).length ? 1.5 : 1);

/** What placing `b` at `plot` would link up with, for the build preview. */
export function preview(town: Town, b: BuildingType, plot: number): { links: number[]; text: string } {
  const n = (kinds: BuildingType[]) => near(town, plot, kinds);
  const pl = (k: number, w: string) => `${k} ${w}${k === 1 ? '' : 's'}`;
  switch (b) {
    case 'cottage': {
      const g = n(['garden', 'orchard']), m = n(['market']);
      const pct = Math.round((homeBonus(town, plot) - 1) * 100);
      return { links: [...g, ...m], text: pct ? `+${pct}% income from ${[g.length ? pl(Math.min(3, g.length), 'garden/orchard') : '', m.length ? 'the market' : ''].filter(Boolean).join(' and ')}` : 'Tip: build next to gardens or the market for a bonus' };
    }
    case 'garden': case 'orchard': {
      const homes = n(['cottage']);
      const extra = b === 'orchard' && n(['garden']).length ? '; +25% harvest from the garden' : '';
      return { links: [...homes, ...(b === 'orchard' ? n(['garden', 'mill']) : n(['orchard']))], text: homes.length ? `${pl(homes.length, 'home')} nearby earn +20%${extra}` : `No homes nearby yet${extra}` };
    }
    case 'market': {
      const homes = n(['cottage']), piers = n(['pier']);
      return { links: [...homes, ...piers], text: `${pl(homes.length, 'home')} +25%${piers.length ? `, ${pl(piers.length, 'pier')} +20% cargo` : ''}` };
    }
    case 'pier': { const m = n(['market']); return { links: m, text: m.length ? 'Market nearby: +20% cargo here' : 'Tip: a market nearby adds +20% cargo' }; }
    case 'mill': { const o = n(['orchard']); return { links: o, text: o.length ? 'Orchard nearby: +50% timber' : 'Tip: next to an orchard for +50% timber' }; }
    default: return { links: [], text: '' };
  }
}

// ---------- districts ----------
export interface DistrictDef { id: DistrictId; name: string; need: { buildings?: number; ships?: number; storms?: number } }
export const DISTRICTS: DistrictDef[] = [
  { id: 'harbour', name: 'The Harbour', need: {} },
  { id: 'hillside', name: 'The Hillside', need: { buildings: 5 } },
  { id: 'hilltop', name: 'The Hilltop', need: { buildings: 10, ships: 25 } },
  { id: 'headland', name: 'The Headland', need: { buildings: 14, ships: 80, storms: 3 } },
  { id: 'islet', name: 'Gull Rock', need: { buildings: 18, ships: 250, storms: 10 } },
];
export interface Progress { buildings: number; ships: number; storms: number }
export const districtOpen = (d: DistrictDef, p: Progress) =>
  p.buildings >= (d.need.buildings ?? 0) && p.ships >= (d.need.ships ?? 0) && p.storms >= (d.need.storms ?? 0);

// ---------- lighthouse lens ----------
export const LENS = [
  { name: 'Oil Lamp', cost: { coin: 0, timber: 0 }, needs: 'harbour' as DistrictId },
  { name: 'Fresnel Lens', cost: { coin: 150, timber: 40 }, needs: 'hillside' as DistrictId },
  { name: 'Twin Beams', cost: { coin: 500, timber: 130 }, needs: 'hilltop' as DistrictId },
  { name: 'Electric Lantern', cost: { coin: 1400, timber: 320 }, needs: 'headland' as DistrictId },
];
export const LENS_EFFECT = 'Lamp brightens faster, clears fog faster, ships dock in thicker fog';
