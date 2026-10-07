// Delight catalogue: decorations (coin sinks, placed automatically), special visitor ships and their gifts, bloom festivals,
// seasons and cosmetic weather. Pure data; the sim owns the state and the renderer draws it.

export type DecorId = 'bunting' | 'benches' | 'lanterns' | 'boats' | 'arches' | 'fountain' | 'statue';
export const DECOR_IDS: DecorId[] = ['bunting', 'benches', 'lanterns', 'boats', 'arches', 'fountain', 'statue'];
export interface DecorDef { names: string[]; icon: string; costs: number[]; effects: string[] }
/** Each level costs coin only (decor is where spare coin goes) and is placed around the town by itself. */
export const DECOR: Record<DecorId, DecorDef> = {
  bunting: { names: ['Bunting', 'More Bunting', 'Bunting Everywhere'], icon: '🎏', costs: [40, 90, 180], effects: ['Flags across the square', 'Flags along the harbour', 'Flags from every rooftop'] },
  benches: { names: ['Benches', 'More Benches', 'Picnic Spots'], icon: '🪑', costs: [30, 70, 140], effects: ['Villagers sit and chat', 'Benches by the gardens', 'Picnic blankets on the meadow'] },
  lanterns: { names: ['Path Lanterns', 'Lantern-lit Lanes'], icon: '🏮', costs: [60, 150], effects: ['Lanterns along the main path', 'Lanterns along every lane'] },
  boats: { names: ['Rowing Boats', 'Little Fleet'], icon: '🚣', costs: [50, 120], effects: ['Boats pulled up on the beach', 'Villagers row in the bay'] },
  arches: { names: ['Flower Arches', 'Rose Arbours'], icon: '💐', costs: [80, 200], effects: ['Arches over the garden paths', 'Roses climb every arch'] },
  fountain: { names: ['Fountain'], icon: '⛲', costs: [350], effects: ['A fountain in the square'] },
  statue: { names: ["Keeper's Statue"], icon: '🗿', costs: [500], effects: ['A statue of you, in the square'] },
};
export const decorMax = (d: DecorId) => DECOR[d].costs.length;
/** Decor needs a little town around it. */
export const DECOR_MIN_BUILDINGS = 2;

export type GiftId = 'carousel' | 'bandstand' | 'telescope';
export type VisitorKind = 'circus' | 'royal' | 'research';
export const VISITOR_KINDS: VisitorKind[] = ['circus', 'royal', 'research'];
export interface VisitorDef { ship: string; title: string; gift: GiftId; giftName: string; icon: string; value: number; needBuildings: number; needShips: number }
export const VISITORS: Record<VisitorKind, VisitorDef> = {
  circus: { ship: 'Bellissima', title: 'the Circus Boat', gift: 'carousel', giftName: 'a carousel', icon: '🎪', value: 2.5, needBuildings: 5, needShips: 0 },
  royal: { ship: 'Royal Albatross', title: 'the Royal Yacht', gift: 'bandstand', giftName: 'a royal bandstand', icon: '👑', value: 3, needBuildings: 10, needShips: 20 },
  research: { ship: 'Curious', title: 'a research ship', gift: 'telescope', giftName: 'a telescope for the lighthouse', icon: '🔭', value: 2.5, needBuildings: 7, needShips: 40 },
};

export interface FestivalDef { at: number; name: string }
/** Island bloom milestones; each one throws a festival the moment it's reached. */
export const FESTIVALS: FestivalDef[] = [
  { at: 0.1, name: 'Blossom Fair' }, { at: 0.25, name: 'Midsummer Feast' }, { at: 0.5, name: 'Lantern Festival' },
  { at: 0.75, name: 'Harvest Home' }, { at: 1, name: 'Grand Bloom Jubilee' },
];

export type Season = 'spring' | 'summer' | 'autumn' | 'winter';
export const SEASONS: Season[] = ['spring', 'summer', 'autumn', 'winter'];
export const SEASON_NAME: Record<Season, string> = { spring: 'Spring', summer: 'Summer', autumn: 'Autumn', winter: 'Winter' };
/** Season for the n-th ride (0-based): a new keeper starts in spring. */
export const seasonFor = (ride: number, ridesPerSeason: number) => SEASONS[Math.floor(Math.max(0, ride) / Math.max(1, ridesPerSeason)) % 4];

/** Calm-weather moods. Purely cosmetic: gameplay fog/chop never change with them. */
export type Weather = 'clear' | 'sunny' | 'shower' | 'windy' | 'snow';
export const WEATHER_WEIGHTS: Record<Season, Array<[Weather, number]>> = {
  spring: [['clear', 3], ['sunny', 2], ['shower', 3], ['windy', 2]],
  summer: [['sunny', 5], ['clear', 3], ['windy', 1], ['shower', 1]],
  autumn: [['windy', 4], ['clear', 3], ['shower', 3], ['sunny', 1]],
  winter: [['snow', 4], ['clear', 3], ['windy', 2]],
};
export function pickWeather(season: Season, r: number, not?: Weather): Weather {
  const opts = WEATHER_WEIGHTS[season].filter(([w]) => w !== not);
  let x = r * opts.reduce((s, [, n]) => s + n, 0);
  for (const [w, n] of opts) { if (x < n) return w; x -= n; }
  return opts[0][0];
}
