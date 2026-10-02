// Weapon & gear generation. Pure; uses only the supplied rng.
export type Rarity = 0 | 1 | 2 | 3 | 4 | 5; // common, magic, rare, epic, legendary, unique
export const RARITY_NAMES = ['Common', 'Magic', 'Rare', 'Epic', 'Legendary', 'Unique'];
export const RARITY_COLORS = ['#d8d8d8', '#5aa9ff', '#ffd84a', '#c77dff', '#ff8c2a', '#ff4fd8'];
const RARITY_MULT = [1, 1.12, 1.26, 1.42, 1.62, 1.75];

/** Unique weapons: fixed name + a special behaviour the sim implements. */
export type UniqueFx = 'homing' | 'orbit' | 'split' | 'nova' | 'ricochet';
export const UNIQUES: Array<{ fx: UniqueFx; name: string; base: WeaponStyle; element: Element; blurb: string }> = [
  { fx: 'homing', name: 'Wyrmseeker', base: 'bolt', element: 'arcane', blurb: 'bolts hunt their prey' },
  { fx: 'orbit', name: 'Halo of Blades', base: 'star', element: 'storm', blurb: 'three blades orbit you' },
  { fx: 'split', name: 'Mother of Storms', base: 'orb', element: 'frost', blurb: 'orbs burst into shards' },
  { fx: 'nova', name: 'Heart of the Tempest', base: 'spark', element: 'storm', blurb: 'every 5th shot is a nova' },
  { fx: 'ricochet', name: 'Ricochet Ballista', base: 'arrow', element: 'fire', blurb: 'bolts leap between foes' },
];

export type Element = 'arcane' | 'fire' | 'frost' | 'venom' | 'storm';
export const ELEMENT_COLORS: Record<Element, string> = { arcane: '#c77dff', fire: '#ff7a2a', frost: '#7fe7ff', venom: '#7dff5a', storm: '#fff36a' };
export type WeaponStyle = 'bolt' | 'pellet' | 'arrow' | 'flame' | 'spark' | 'orb' | 'star';

export interface Weapon {
  name: string; base: WeaponStyle; level: number; rarity: Rarity; element: Element;
  dmg: number;        // per projectile, before bike/level multipliers
  rate: number;       // shots per (revsPerShot) crank interval
  count: number;      // projectiles per shot
  spread: number;     // total fan angle (rad)
  speed: number;      // tiles/s
  range: number;      // tiles
  pierce: number;     // extra enemies a projectile passes through
  chain: number;      // lightning jumps
  blast: number;      // explosion radius (tiles), 0 = none
  bounce: number;     // wall bounces
  plus: number;       // shrine upgrades (+6% dmg each)
  unique?: UniqueFx;
  score: number;
}

interface Base { label: string[]; dmg: number; rate: number; count: number; spread: number; speed: number; range: number; pierce: number; chain: number; blast: number; bounce: number; eff: number }
const BASES: Record<WeaponStyle, Base> = {
  bolt:   { label: ['Wand', 'Rod', 'Sceptre'], dmg: 1.0, rate: 1.0, count: 1, spread: 0, speed: 13, range: 9, pierce: 0, chain: 0, blast: 0, bounce: 0, eff: 1 },
  pellet: { label: ['Blunderbuss', 'Scattergun', 'Hand Cannon'], dmg: 0.3, rate: 0.75, count: 5, spread: 0.55, speed: 14, range: 5, pierce: 0, chain: 0, blast: 0, bounce: 0, eff: 0.9 },
  arrow:  { label: ['Crossbow', 'Longbow', 'Ballista'], dmg: 1.75, rate: 0.48, count: 1, spread: 0, speed: 22, range: 13, pierce: 2, chain: 0, blast: 0, bounce: 0, eff: 1 },
  flame:  { label: ['Flamecaster', 'Dragon Tongue', 'Pyre Staff'], dmg: 0.12, rate: 2.6, count: 3, spread: 0.4, speed: 7.5, range: 3.6, pierce: 9, chain: 0, blast: 0, bounce: 0, eff: 0.85 },
  spark:  { label: ['Storm Rod', 'Tesla Coil', 'Thunder Glyph'], dmg: 0.55, rate: 1.2, count: 1, spread: 0, speed: 28, range: 8, pierce: 0, chain: 2, blast: 0, bounce: 0, eff: 1 },
  orb:    { label: ['Orb Staff', 'Bomb Lobber', 'Comet Staff'], dmg: 1.25, rate: 0.6, count: 1, spread: 0, speed: 8, range: 9, pierce: 0, chain: 0, blast: 1.8, bounce: 0, eff: 1 },
  star:   { label: ['Shuriken', 'Chakram', 'Star Discs'], dmg: 0.38, rate: 1.3, count: 2, spread: 0.09, speed: 14, range: 11, pierce: 1, chain: 0, blast: 0, bounce: 2, eff: 1 },
};
const STYLES = Object.keys(BASES) as WeaponStyle[];
const ELEMENTS: Element[] = ['arcane', 'fire', 'frost', 'venom', 'storm'];
const PREFIX = [['Rusty', 'Plain', 'Worn'], ['Fine', 'Keen', 'Charged'], ['Runed', 'Gleaming', 'Savage'], ['Ancient', 'Dread', 'Astral'], ['Mythic', 'Godforged', 'Eternal']];
const ELEMENT_SUFFIX: Record<Element, string> = { arcane: 'of Whispers', fire: 'of Embers', frost: 'of Rime', venom: 'of Blight', storm: 'of Thunder' };

/** Item power growth per item level (enemy HP grows a bit faster, so upgrades matter). */
export const levelMult = (lvl: number) => Math.pow(1.17, lvl - 1);

export function rollRarity(rng: () => number, bump = 0): Rarity {
  const r = rng();
  let k = r < 0.5 ? 0 : r < 0.78 ? 1 : r < 0.93 ? 2 : r < 0.985 ? 3 : 4;
  k = Math.min(4, k + bump);
  return k as Rarity;
}

export function weaponScore(w: Pick<Weapon, 'dmg' | 'rate' | 'count' | 'chain' | 'blast' | 'pierce' | 'plus' | 'unique'> & { base: WeaponStyle }): number {
  const b = BASES[w.base];
  return (w.unique ? 1.35 : 1) * w.dmg * (1 + 0.06 * w.plus) * w.rate * w.count * (1 + 0.3 * w.chain) * (1 + 0.2 * w.blast) * (1 + 0.1 * Math.min(3, w.pierce)) * b.eff * 10;
}

export function makeWeapon(rng: () => number, level: number, rarity: Rarity, style?: WeaponStyle): Weapon {
  const base = style ?? STYLES[Math.floor(rng() * STYLES.length)];
  const b = BASES[base];
  const element = ELEMENTS[Math.floor(rng() * ELEMENTS.length)];
  const v = () => 0.88 + rng() * 0.24;
  const m = levelMult(level) * RARITY_MULT[rarity];
  const extra = rarity >= 2 && b.count > 1 ? (b.count % 2 ? 2 : 1) : 0; // keep a centre projectile
  const w: Weapon = {
    name: '', base, level, rarity, element,
    dmg: b.dmg * m * v(), rate: b.rate * v(), count: b.count + extra + (rarity >= 4 && base === 'bolt' ? 1 : 0),
    spread: b.spread * v() + (base === 'bolt' && rarity >= 4 ? 0.12 : 0), speed: b.speed * v(), range: b.range * v(),
    pierce: b.pierce + (rarity >= 3 ? 1 : 0), chain: b.chain + (rarity >= 3 && base === 'spark' ? 1 : 0),
    blast: b.blast ? b.blast * (1 + 0.1 * rarity) : 0, bounce: b.bounce + (rarity >= 3 && base === 'star' ? 1 : 0), plus: 0, score: 0,
  };
  w.name = `${PREFIX[rarity][Math.floor(rng() * 3)]} ${b.label[Math.min(2, Math.floor(rarity / 2 + rng()))]}${rarity >= 1 ? ' ' + ELEMENT_SUFFIX[element] : ''}`;
  w.score = weaponScore(w);
  return w;
}

export function makeUnique(rng: () => number, level: number): Weapon {
  const u = UNIQUES[Math.floor(rng() * UNIQUES.length)];
  const w = makeWeapon(rng, level, 4, u.base);
  w.rarity = 5; w.unique = u.fx; w.element = u.element; w.name = u.name; w.dmg *= RARITY_MULT[5] / RARITY_MULT[4];
  w.score = weaponScore(w);
  return w;
}

export function starterWeapon(level = 1, rng?: () => number): Weapon {
  if (level > 1 && rng) return makeWeapon(rng, level, 1, 'bolt');
  const b = BASES.bolt;
  const w: Weapon = { name: 'Apprentice Wand', base: 'bolt', level: 1, rarity: 0, element: 'arcane', dmg: 0.9, rate: 1, count: 1, spread: 0, speed: b.speed, range: b.range, pierce: 0, chain: 0, blast: 0, bounce: 0, plus: 0, score: 0 };
  w.score = weaponScore(w);
  return w;
}

// ---------- gear ----------
export type Slot = 'helm' | 'armor' | 'boots' | 'ring';
export const SLOTS: Slot[] = ['helm', 'armor', 'boots', 'ring'];
export interface GearStats { maxHp: number; armor: number; speed: number; dmgPct: number; crit: number; regen: number }
export interface Gear { name: string; slot: Slot; level: number; rarity: Rarity; stats: GearStats; score: number }
const GEAR_NAMES: Record<Slot, string[]> = {
  helm: ['Cap', 'Helm', 'Crown'], armor: ['Tunic', 'Mail', 'Plate'], boots: ['Sandals', 'Boots', 'Greaves'], ring: ['Band', 'Ring', 'Signet'],
};

export function gearScore(s: GearStats): number {
  return s.maxHp * 1 + s.armor * 220 + s.speed * 150 + s.dmgPct * 260 + s.crit * 200 + s.regen * 12;
}

export function makeGear(rng: () => number, level: number, rarity: Rarity, slot?: Slot): Gear {
  const sl = slot ?? SLOTS[Math.floor(rng() * SLOTS.length)];
  const m = Math.pow(1.13, level - 1) * RARITY_MULT[Math.min(4, rarity)];
  const v = () => 0.85 + rng() * 0.3;
  const s: GearStats = { maxHp: 0, armor: 0, speed: 0, dmgPct: 0, crit: 0, regen: 0 };
  if (sl === 'helm') { s.maxHp = 12 * m * v(); if (rarity >= 1) s.regen = 0.3 * m * v(); }
  if (sl === 'armor') { s.maxHp = 18 * m * v(); s.armor = Math.min(0.6, 0.05 * Math.sqrt(m) * v()); }
  if (sl === 'boots') { s.speed = Math.min(0.35, 0.04 * Math.sqrt(m) * v()); s.maxHp = 6 * m * v(); }
  if (sl === 'ring') { s.dmgPct = 0.06 * m * v(); if (rarity >= 1) s.crit = Math.min(0.4, 0.03 * Math.sqrt(m) * v()); }
  if (rarity >= 2) { // bonus affix
    const k = Math.floor(rng() * 3);
    if (k === 0) s.maxHp += 8 * m; else if (k === 1) s.regen += 0.25 * m; else s.dmgPct += 0.03 * m;
  }
  const name = `${PREFIX[Math.min(4, rarity)][Math.floor(rng() * 3)]} ${GEAR_NAMES[sl][Math.min(2, Math.floor(level / 4))]}`;
  return { name, slot: sl, level, rarity, stats: s, score: gearScore(s) };
}

export const sellValue = (level: number, rarity: Rarity) => Math.round((4 + 2 * level) * (1 + rarity));
