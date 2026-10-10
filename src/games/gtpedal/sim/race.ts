// Underground street races: routes, gates, payouts, rubber-banding. Pure + deterministic.
import type { BikeKind } from './bikes';

export interface Route { id: string; name: string; district: string; start: { x: number; z: number; heading: number }; gates: Array<[number, number]>; laps: number; buyIn: number; prize: number }
/** Gates follow existing paths / tram tracks / the drawbridge; rivals cut straight between them (shortcuts). */
export const ROUTES: Route[] = [
  { id: 'canal', name: 'Drawbridge Dash', district: 'canal', start: { x: 4, z: -96, heading: 0 }, laps: 1, buyIn: 20, prize: 80,
    gates: [[0, -60], [0, -15], [0, 30], [0, 70], [30, 86], [90, 86], [126, 100], [126, 130]] },
  { id: 'oldtown', name: 'Old Town Loop', district: 'oldTown', start: { x: -60, z: 100, heading: 0 }, laps: 2, buyIn: 40, prize: 140,
    gates: [[-64, 124], [0, 124], [64, 124], [64, 179], [0, 179], [-64, 179], [-64, 150]] },
  { id: 'market', name: 'Market Grind', district: 'market', start: { x: -86, z: -114, heading: Math.PI }, laps: 1, buyIn: 30, prize: 100,
    gates: [[-90, -140], [-50, -150], [0, -150], [50, -150], [90, -150], [90, -120], [40, -110], [-20, -110]] },
  { id: 'hill', name: 'Hillside Scramble', district: 'hillside', start: { x: -104, z: 4, heading: -Math.PI / 2 }, laps: 1, buyIn: 0, prize: 60,
    gates: [[-125, 15], [-140, 30], [-170, 0], [-140, -30], [-175, -60], [-150, -100], [-185, -130]] },
];
export const GATE_R = 7;
export const RIVAL_KINDS: BikeKind[] = ['fixie', 'scooter', 'bmx', 'ebike', 'city'];
export const RIVAL_NAMES = ['Knuckles', 'Razor Rita', 'Dumpster Dave', 'Sprocket', 'Lil Spoke'];
/** Rival cruise speed (m/s) per difficulty: about what you hold at ~0.6 / 0.75 / 0.95 × FTP on a city bike. */
export const RIVAL_PACE = [14.5, 16, 17.6];
/** Payout by finishing place (0 = first): prize + share of the pot (your buy-in × field size). */
export function payout(route: Route, place: number, field: number): number {
  const pot = route.buyIn * field, share = [0.6, 0.25, 0.15][place] ?? 0;
  return place === 0 ? route.prize + Math.round(pot * share) : Math.round(pot * share);
}
/** Rubber band: rivals ahead ease off, rivals behind push (±strength at 60 m of gap). */
export function rubberBand(gapM: number, strength: number): number {
  return 1 - Math.max(-1, Math.min(1, gapM / 60)) * strength;
}
/** Progress along a route: completed gates (incl. laps) minus remaining fraction to the next gate. */
export function progress(route: Route, passed: number, x: number, z: number): number {
  const n = route.gates.length, i = passed % n;
  const [gx, gz] = route.gates[i], [px, pz] = i === 0 ? (passed === 0 ? [route.start.x, route.start.z] : route.gates[n - 1]) : route.gates[i - 1];
  const seg = Math.max(1, Math.hypot(gx - px, gz - pz)), d = Math.hypot(gx - x, gz - z);
  return passed + Math.max(0, 1 - d / seg);
}
/** Missed-checkpoint test: the gate after next is clearly closer than the one you owe, and you're well clear of it. */
export function skipping(route: Route, passed: number, x: number, z: number): boolean {
  const n = route.gates.length, total = n * route.laps; if (passed + 1 >= total) return false;
  const [gx, gz] = route.gates[passed % n], [hx, hz] = route.gates[(passed + 1) % n], dG = Math.hypot(gx - x, gz - z);
  return dG > GATE_R * 2.5 && Math.hypot(hx - x, hz - z) < dG - 10;
}
