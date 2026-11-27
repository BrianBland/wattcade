// Perks: after each boss the rider takes one of three cards for the rest of the descent (pure, no DOM).
// The deal has three slots, so a random offer still fits how you ride (the only input is the pick):
//   stance card  - the line for the stance you are in; it only works in that stance (rank 3 = its evolution)
//   ride card    - weighted by how you rode the floor: steady zone 2, spinning 95+ rpm, sprints, boss surges
//   wildcard     - anything else not dealt, rares and legendaries (legendaries carry pity across dry offers)
// Everything rolls from the sim's seeded rng.
import type { StanceId } from './stances';

export type PerkId = 'aero' | 'lube' | 'discs' | 'sealant' | 'musette' | 'tailwind' | 'headlamp' | 'domestique' | 'polka' | 'green' | 'yellow' | 'rainbow';
export type PerkCat = 'attack' | 'defense' | 'tempo';
export type PerkSlot = 'stance' | 'ride' | 'wild';
export type RideStyle = 'steady' | 'spinner' | 'sprinter' | 'climber';
/** 0 common, 1 rare, 2 legendary */
export type PerkRarity = 0 | 1 | 2;
export interface PerkDef {
  id: PerkId; name: string; rarity: PerkRarity; cat: PerkCat; max: number; color: string; blurb: string;
  slot: PerkSlot; stance?: StanceId; style?: RideStyle; desc: (rank: number, k: number) => string;
}
export type PerkRanks = Partial<Record<PerkId, number>>;
export type KitId = 'green' | 'polka' | 'yellow' | 'rainbow';

const pct = (v: number) => `${Math.round(v * 100)}%`;
/** Per-rank effects (scaled by the `perkStrength` tunable, k). */
export const PERK_FX = {
  discsTaken: 0.12, discsDmg: 0.1, discsGrind: 0.15, grindRpm: 80,
  aeroDmg: 0.12, aeroRange: 0.1,
  tailSpeed: 0.08, tailFire: 0.12, tailRefill: 0.3,
  lampDmg: 0.1, lampCrit: 0.06, lampLight: 0.35, lampExposedS: 1,
  sealantRegen: 0.005, musetteHeal: 0.3, lubeFire: 0.1, lubeSpin: 0.15, spinRpm: 95,
  polkaBoss: 0.5, polkaExposedS: 1, greenHeal: 0.35, greenFired: 0.35, yellowSw: 1, yellowHeal: 0.8,
  rainbowDmg: 0.18, rainbowTaken: 0.15, rainbowSpeed: 0.08, droneDmg: 0.6, droneEveryS: 0.8,
};
const F = PERK_FX;
const ev = (r: number, s: string) => (r >= 3 ? `. ${s}` : '');
export const PERKS: Record<PerkId, PerkDef> = {
  discs:      { id: 'discs', name: 'Disc Brakes', rarity: 0, cat: 'defense', max: 3, color: '#aba09c', slot: 'stance', stance: 'vanguard', blurb: 'Stop on a dime. Hit like a truck.',
    desc: (r, k) => `In Vanguard: -${pct(1 - Math.pow(1 - F.discsTaken * k, r))} damage taken, +${pct(F.discsDmg * k * r)} damage${ev(r, `Grinding under ${F.grindRpm} rpm: +${pct(F.discsGrind * k)} more`)}` },
  aero:       { id: 'aero', name: 'Aero Helmet', rarity: 0, cat: 'attack', max: 3, color: '#e8e0d0', slot: 'stance', stance: 'ranger', blurb: 'Free speed, they said.',
    desc: (r, k) => `In Ranger: +${pct(F.aeroDmg * k * r)} damage, +${pct(F.aeroRange * r)} range${ev(r, 'Shots pierce one more foe')}` },
  tailwind:   { id: 'tailwind', name: 'Tailwind', rarity: 0, cat: 'tempo', max: 3, color: '#a6d0ff', slot: 'stance', stance: 'skirmisher', blurb: 'Feels like flying. Is luck.',
    desc: (r, k) => `In Skirmisher: +${pct(F.tailSpeed * k * r)} move, +${pct(F.tailFire * k * r)} fire rate${ev(r, `Actions refill +${pct(F.tailRefill * k)}`)}` },
  headlamp:   { id: 'headlamp', name: 'Headlamp', rarity: 0, cat: 'attack', max: 3, color: '#ffd45a', slot: 'stance', stance: 'arcanist', blurb: 'See the pothole before it sees you.',
    desc: (r, k) => `In Arcanist: +${pct(F.lampDmg * k * r)} damage, +${pct(F.lampCrit * k * r)} crit, brighter torch${ev(r, `Exposed windows +${F.lampExposedS} s`)}` },
  sealant:    { id: 'sealant', name: 'Tubeless Sealant', rarity: 0, cat: 'defense', max: 3, color: '#7ee07a', slot: 'ride', style: 'steady', blurb: 'Seals small holes, even mid-fight.',
    desc: (r, k) => `Heal ${(F.sealantRegen * k * r * 100).toFixed(1)}% HP/s in combat, double in zone 2` },
  musette:    { id: 'musette', name: 'Musette', rarity: 0, cat: 'defense', max: 2, color: '#cfc4b8', slot: 'ride', style: 'steady', blurb: 'Rice cakes from the feed zone.',
    desc: (r, k) => `+${r} potion slot${r > 1 ? 's' : ''}, potions heal +${pct(F.musetteHeal * k * r)}` },
  lube:       { id: 'lube', name: 'Chain Lube', rarity: 0, cat: 'attack', max: 3, color: '#f0b030', slot: 'ride', style: 'spinner', blurb: 'Every rev counts. Spin it.',
    desc: (r, k) => `+${pct(F.lubeFire * k * r)} fire rate, +${pct(F.lubeSpin * k * r)} more above ${F.spinRpm} rpm` },
  green:      { id: 'green', name: 'Green Jersey', rarity: 1, cat: 'tempo', max: 1, color: '#3dae4e', slot: 'ride', style: 'sprinter', blurb: 'Points for every sprint.',
    desc: (_r, k) => `Sprints heal +${pct(F.greenHeal * k)} more, Fired Up +${pct(F.greenFired * k)} damage` },
  polka:      { id: 'polka', name: 'Polka Dot Jersey', rarity: 1, cat: 'attack', max: 1, color: '#c23a3a', slot: 'ride', style: 'climber', blurb: 'King of the Mountains.',
    desc: (_r, k) => `+${pct(F.polkaBoss * k)} damage to bosses, Exposed +${F.polkaExposedS} s` },
  domestique: { id: 'domestique', name: 'Domestique', rarity: 1, cat: 'attack', max: 2, color: '#4c8ae0', slot: 'wild', blurb: 'A loyal bidon that fights for you.',
    desc: (r) => (r > 1 ? 'Two bottle drones shoot beside you' : 'A bottle drone shoots beside you') },
  yellow:     { id: 'yellow', name: 'Yellow Jersey', rarity: 2, cat: 'defense', max: 1, color: '#f4d22c', slot: 'wild', blurb: 'Leader of the race.',
    desc: () => `Second Wind recharges ${1 + F.yellowSw}x faster and heals ${pct(F.yellowHeal)}` },
  rainbow:    { id: 'rainbow', name: 'Rainbow Bands', rarity: 2, cat: 'attack', max: 1, color: '#ffffff', slot: 'wild', blurb: 'World champion. For now.',
    desc: (_r, k) => `+${pct(F.rainbowDmg * k)} damage, -${pct(F.rainbowTaken * k)} taken, +${pct(F.rainbowSpeed * k)} move` },
};
export const PERK_IDS = Object.keys(PERKS) as PerkId[];
export const RARITY_NAMES = ['Common', 'Rare', 'Legendary'] as const;
export const SLOT_NAMES: Record<PerkSlot, string> = { stance: 'Stance', ride: 'Your riding', wild: 'Wildcard' };
export const STYLE_NAMES: Record<RideStyle, string> = { steady: 'Steady zone 2', spinner: 'Spinner', sprinter: 'Sprinter', climber: 'Climber' };

export interface PerkMods {
  dmg: number; bossDmg: number; fireRate: number; taken: number; regen: number; potionCap: number; potionHeal: number;
  speed: number; cdRefill: number; light: number; crit: number; drones: number; exposedS: number; sprintHeal: number;
  firedUp: number; swRate: number; swHeal: number; range: number; pierce: number;
}
/** What the rider is doing right now: stance lines work only in their stance; some perks read cadence or zone. */
export interface PerkCtx { stance: StanceId; cadence: number; zone2: boolean }
/** Every perk's effect folded into multipliers/additions the sim applies. k = perkStrength (1 = as designed). */
export function perkMods(r: PerkRanks, k = 1, c?: PerkCtx): PerkMods {
  const n = (id: PerkId) => Math.min(PERKS[id].max, r[id] ?? 0);
  const inSt = (id: PerkId) => (c && c.stance === PERKS[id].stance ? n(id) : 0);
  const disc = inSt('discs'), aero = inSt('aero'), tail = inSt('tailwind'), lamp = inSt('headlamp');
  const cad = c?.cadence ?? 90;
  return {
    dmg: F.discsDmg * k * disc + (disc >= 3 && cad < F.grindRpm ? F.discsGrind * k : 0) + F.aeroDmg * k * aero + F.lampDmg * k * lamp + F.rainbowDmg * k * n('rainbow'),
    bossDmg: F.polkaBoss * k * n('polka'),
    fireRate: F.tailFire * k * tail + F.lubeFire * k * n('lube') + (cad >= F.spinRpm ? F.lubeSpin * k * n('lube') : 0),
    taken: Math.pow(1 - F.discsTaken * k, disc) * (1 - F.rainbowTaken * k * n('rainbow')),
    regen: F.sealantRegen * k * n('sealant') * (c?.zone2 ? 2 : 1),
    potionCap: n('musette'), potionHeal: F.musetteHeal * k * n('musette'),
    speed: F.tailSpeed * k * tail + F.rainbowSpeed * k * n('rainbow'),
    cdRefill: tail >= 3 ? F.tailRefill * k : 0,
    light: F.lampLight * lamp, crit: F.lampCrit * k * lamp,
    drones: n('domestique'), exposedS: F.polkaExposedS * n('polka') + (lamp >= 3 ? F.lampExposedS : 0),
    sprintHeal: F.greenHeal * k * n('green'), firedUp: 1 + F.greenFired * k * n('green'),
    swRate: 1 + F.yellowSw * n('yellow'), swHeal: n('yellow') ? F.yellowHeal : 0,
    range: F.aeroRange * aero, pierce: aero >= 3 ? 1 : 0,
  };
}

/** The race kit the hero wears: the most prestigious jersey held. */
export function kitOf(r: PerkRanks): KitId | null {
  return r.rainbow ? 'rainbow' : r.yellow ? 'yellow' : r.polka ? 'polka' : r.green ? 'green' : null;
}

/** How the floor was ridden (seconds / counts), measured by the sim. */
export interface FloorRide { t: number; z2: number; spin: number; sprints: number; bossT: number; surge: number }
/** Ride-card weights: 1 + how much of the floor was ridden that way (0..3 extra). */
export function styleWeights(f: FloorRide): Record<RideStyle, number> {
  const T = Math.max(1, f.t);
  return {
    steady: 1 + 3 * Math.min(1, f.z2 / T),
    spinner: 1 + 3 * Math.min(1, (f.spin / T) * 3),
    sprinter: 1 + Math.min(3, f.sprints * 0.75),
    climber: 1 + 3 * Math.min(1, f.surge / Math.max(10, f.bossT * 0.25)),
  };
}

export interface OfferCfg { weights: [number, number, number]; pityStep: number }
export const DEFAULT_OFFER: OfferCfg = { weights: [10, 4, 1.5], pityStep: 0.75 };
export interface OfferCtx { stance: StanceId; stances: readonly StanceId[]; style: Record<RideStyle, number> }

/** Deal [stance card, ride card, wildcard]. pity = offers since a legendary was last dealt (raises its weight). */
export function rollOffer(rng: () => number, ranks: PerkRanks, pity: number, c: OfferCtx, cfg: OfferCfg = DEFAULT_OFFER): { ids: PerkId[]; pity: number } {
  const open = (id: PerkId) => (ranks[id] ?? 0) < PERKS[id].max && (!PERKS[id].stance || c.stances.includes(PERKS[id].stance!));
  const draw = (pool: PerkId[], w: (id: PerkId) => number): PerkId | null => {
    const tot = pool.reduce((a, id) => a + w(id), 0);
    if (!pool.length || tot <= 0) return null;
    let x = rng() * tot;
    for (const id of pool) { x -= w(id); if (x <= 0) return id; }
    return pool[pool.length - 1];
  };
  const ids: PerkId[] = [];
  const free = (id: PerkId) => open(id) && !ids.includes(id);
  // stance card: your stance's line; once it is maxed, another unlocked stance's line
  const mine = PERK_IDS.find((id) => PERKS[id].stance === c.stance);
  const st = mine && free(mine) ? mine : draw(PERK_IDS.filter((id) => PERKS[id].slot === 'stance' && free(id)), () => 1);
  if (st) ids.push(st);
  // ride card: weighted by the floor's riding (rarer jerseys a little less often)
  const ride = draw(PERK_IDS.filter((id) => PERKS[id].slot === 'ride' && free(id)), (id) => c.style[PERKS[id].style!] * (PERKS[id].rarity ? 0.6 : 1));
  if (ride) ids.push(ride);
  // wildcard: anything left, by rarity; legendaries grow with pity
  const w = (id: PerkId) => PERKS[id].rarity === 2 ? cfg.weights[2] * (1 + cfg.pityStep * pity) : cfg.weights[PERKS[id].rarity] * (PERKS[id].slot === 'stance' ? 0.3 : 1);
  const wild = draw(PERK_IDS.filter(free), w);
  if (wild) ids.push(wild);
  while (ids.length < 3) { const x = draw(PERK_IDS.filter(free), w); if (!x) break; ids.push(x); }
  return { ids, pity: ids.some((id) => PERKS[id].rarity === 2) ? 0 : pity + 1 };
}

/** The card the game highlights (and the auto-pick takes): rarity first, then what the last fight says the hero needs. */
export function suggestPerk(ids: PerkId[], ranks: PerkRanks, s: { hpFrac: number; bossFightS: number; deaths: number; stance?: StanceId }): number {
  let best = 0, bv = -Infinity;
  ids.forEach((id, i) => {
    const d = PERKS[id];
    let v = d.rarity * 3 - (ranks[id] ?? 0) * 0.5;
    if (d.stance && d.stance === s.stance) v += 1.5 + (ranks[id] ?? 0) * 1.25;   // committing to a line pays (rank 3 evolves)
    if (d.cat === 'defense' && (s.hpFrac < 0.5 || s.deaths > 0)) v += 3.5;
    if (d.cat === 'attack' && s.bossFightS > 90) v += 1;
    if (v > bv) { bv = v; best = i; }
  });
  return best;
}
