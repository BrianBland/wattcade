// The criminal underworld: locations + pure pricing/rotation helpers. Deterministic (hash-based, no rng).
import type { BikeKind } from './bikes';
import type { WeaponKind } from './weapons';

/** Chop shop forecourt (ride a stolen bike in, stop, Ⓐ to sell). Garage canopy sits over it. */
export const FENCE = { x: 100, z: -36, r: 4.5, name: 'Spokey Joe’s Chop Shop' };
/** Shady dealer beside a beat-up van in a back lot. */
export const DEALER = { x: -108, z: -104, r: 3.6, heading: Math.PI / 2, name: 'Van Guy' };
export const DEALER_VAN = { x0: -113.2, z0: -107, x1: -110.6, z1: -101, h: 2.3 };
/** The Gearheads' turf: a crew of matching-jacket riders. */
export const TURF = { x: 126, z: 18, r: 26, name: 'Deck Rats turf' };
/** The Deck Rats: a Razor-scooter crew in matching mustard helmets + jackets. */
export const GANG = { colour: 0xc9a227, accent: 0x2b2a24, size: 4, name: 'Deck Rats' };

export const BIKE_VALUE: Record<BikeKind, number> = { city: 40, fixie: 70, bmx: 55, cargo: 90, tandem: 120, ebike: 160, scooter: 30 };
export const HOT_PERIOD = 120;
export const HOT_BONUS = 1.6;
const KINDS: BikeKind[] = ['city', 'fixie', 'bmx', 'cargo', 'tandem', 'ebike', 'scooter'];
const h = (a: number, b: number) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };
/** The fence's 'hot list': two wanted bike types, rotating every HOT_PERIOD s (deterministic per seed). */
export function hotList(t: number, seed = 0): BikeKind[] {
  const slot = Math.floor(t / HOT_PERIOD);
  return [...KINDS].sort((a, b) => h(slot, seed + KINDS.indexOf(a)) - h(slot, seed + KINDS.indexOf(b))).slice(0, 2);
}
/** What the fence pays: base by type/rarity, flats knock it down, hot-list types pay a bonus. */
export function fencePrice(kind: BikeKind, flat: boolean, hot: boolean): number {
  return Math.round(BIKE_VALUE[kind] * (flat ? 0.45 : 1) * (hot ? HOT_BONUS : 1));
}
export interface StockItem { w: WeaponKind; qty: number; price: number }
export const DEALER_STOCK: StockItem[] = [
  { w: 'bottle', qty: 4, price: 15 }, { w: 'molotov', qty: 3, price: 45 }, { w: 'oil', qty: 2, price: 25 }, { w: 'grenade', qty: 3, price: 60 }, { w: 'bazooka', qty: 2, price: 120 },
];
export const GANG_REWARD = { beat: 150, escape: 40, rep: { beat: 3, escape: 1 } };
/** Heckles / shouts the crowd throws at you (render shows them as speech bubbles). */
export const HECKLES = ['Nice bike, THIEF!', 'Get a job!', 'I’m calling the cops!', 'Ride on the path, jerk!', 'Is that MY bike?!', 'Learn to signal!', 'Bike lane hog!'];
export const SHOUTS = ['HEY!', 'WATCH IT!', 'Whoa!', 'Jerk!', 'Hey!!'];
/** How much of a crime's heat lands right away; the rest only if a witness calls it in. */
export const UNWITNESSED = 0.35;
