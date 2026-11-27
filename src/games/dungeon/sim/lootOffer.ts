// Pure loot comparison & stat-delta presentation for Purgatour's timed Loot Choice prompt.
import { UNIQUES, weaponScore, type Element, type Gear, type Rarity, type Slot, type UniqueFx, type Weapon, type WeaponStyle } from './loot';
import { ARCHETYPES, type ArchetypeId } from './archetypes';

export interface StatDelta {
  text: string;
  tone: 'good' | 'bad' | 'neutral';
}

export interface LootOfferView {
  id: number;
  kind: 'weapon' | 'gear';
  name: string;
  rarity: Rarity;
  level: number;
  archetype?: ArchetypeId;
  archetypeName?: string;
  slot?: Slot;
  base?: WeaponStyle;
  element?: Element;
  variant?: number;
  unique?: UniqueFx;
  plus?: number;
  currentName: string;
  defaultChoice: 'equip' | 'drop';
  sellCoins: number;
  leftS: number;
  totalS: number;
  deltas: StatDelta[];
}

const pct = (next: number, cur: number): number => (cur > 0 ? Math.round(((next - cur) / cur) * 100) : 100);
const cap = (s: string): string => (s ? s[0].toUpperCase() + s.slice(1) : s);

/** Human-readable stat deltas comparing a candidate weapon against the slot's current weapon. Pure. */
export function describeWeaponDelta(next: Weapon, cur: Weapon): StatDelta[] {
  const out: StatDelta[] = [];
  const ns = weaponScore(next), cs = weaponScore(cur);
  const dp = pct(ns, cs);
  if (dp !== 0) out.push({ text: `PWR ${dp > 0 ? '+' : ''}${dp}%`, tone: dp > 0 ? 'good' : 'bad' });
  else out.push({ text: 'PWR EVEN', tone: 'neutral' });

  if (next.element !== cur.element) {
    out.push({ text: `${cap(cur.element)}->${cap(next.element)}`, tone: next.element === 'normal' ? 'neutral' : 'good' });
  }
  if (next.count !== cur.count) {
    const d = next.count - cur.count;
    out.push({ text: `SHOTS ${d > 0 ? '+' : ''}${d}`, tone: d > 0 ? 'good' : 'bad' });
  }
  if (next.unique) {
    const u = UNIQUES.find((x) => x.fx === next.unique);
    out.push({ text: u ? u.blurb : `Unique: ${next.unique}`, tone: 'good' });
  } else if (next.pierce !== cur.pierce) {
    const d = next.pierce - cur.pierce;
    out.push({ text: `PIERCE ${d > 0 ? '+' : ''}${d}`, tone: d > 0 ? 'good' : 'bad' });
  } else if (next.chain !== cur.chain) {
    const d = next.chain - cur.chain;
    out.push({ text: `CHAIN ${d > 0 ? '+' : ''}${d}`, tone: d > 0 ? 'good' : 'bad' });
  } else if (Math.abs(next.range - cur.range) >= 1) {
    const d = Math.round(next.range - cur.range);
    out.push({ text: `RNG ${d > 0 ? '+' : ''}${d}`, tone: d > 0 ? 'good' : 'bad' });
  }
  return out.slice(0, 4);
}

/** Human-readable stat deltas comparing a candidate gear piece against the currently equipped piece (or empty slot). Pure. */
export function describeGearDelta(next: Gear, cur?: Gear): StatDelta[] {
  const out: StatDelta[] = [];
  const a = next.stats, b = cur?.stats ?? { maxHp: 0, armor: 0, speed: 0, dmgPct: 0, crit: 0, regen: 0 };
  const add = (label: string, diff: number, isPct = false) => {
    const v = isPct ? Math.round(diff * 100) : Math.round(diff);
    if (v === 0) return;
    out.push({ text: `${label} ${v > 0 ? '+' : ''}${v}${isPct ? '%' : ''}`, tone: v > 0 ? 'good' : 'bad' });
  };
  add('HP', a.maxHp - b.maxHp);
  add('DMG', a.dmgPct - b.dmgPct, true);
  add('ARMOR', a.armor - b.armor, true);
  add('CRIT', a.crit - b.crit, true);
  add('SPD', a.speed - b.speed, true);
  if (Math.abs(a.regen - b.regen) >= 0.1) {
    const d = Math.round((a.regen - b.regen) * 10) / 10;
    out.push({ text: `REGEN ${d > 0 ? '+' : ''}${d}/s`, tone: d > 0 ? 'good' : 'bad' });
  }
  if (!out.length) out.push({ text: cur ? 'SIMILAR STATS' : 'NEW GEAR', tone: cur ? 'neutral' : 'good' });
  return out.slice(0, 4);
}

/**
 * Decide whether a dropped item warrants a Loot Choice prompt (or should silently auto-salvage as junk).
 * Upgrades default to `'equip'`; interesting sidegrades (within 85% score, higher rarity, or unique) default to `'drop'`.
 */
export function evaluateLootOffer(
  item: Weapon | Gear,
  current: Weapon | Gear | undefined,
  sellCoins: number,
  archetypeId: ArchetypeId,
): Omit<LootOfferView, 'id' | 'leftS' | 'totalS'> | null {
  const isWeapon = 'base' in item;
  const curScore = current ? ('base' in current ? weaponScore(current) : current.score) : 0;
  const nextScore = isWeapon ? weaponScore(item) : item.score;
  const better = !current || nextScore > curScore;
  const interestingSidegrade =
    !better &&
    (item.rarity === 5 ||
      (current && item.rarity > current.rarity) ||
      (curScore > 0 && nextScore >= curScore * 0.85));

  if (!better && !interestingSidegrade) return null;

  const deltas = isWeapon
    ? describeWeaponDelta(item, current as Weapon)
    : describeGearDelta(item, current as Gear | undefined);

  return {
    kind: isWeapon ? 'weapon' : 'gear',
    name: item.name,
    rarity: item.rarity,
    level: item.level,
    ...(isWeapon
      ? { archetype: archetypeId, archetypeName: ARCHETYPES[archetypeId].shortName, base: item.base, element: item.element, variant: item.variant, unique: item.unique, plus: item.plus }
      : { slot: item.slot }),
    currentName: current ? current.name : `Empty ${!isWeapon ? item.slot : 'slot'}`,
    defaultChoice: better ? 'equip' : 'drop',
    sellCoins,
    deltas,
  };
}
