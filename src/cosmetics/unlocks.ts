import type { Profile } from '../contracts';
import { DEFAULTS, ITEMS, LAST_LEVEL, PICK_EVERY, item } from './catalog';
import { SLOTS, type Item, type RiderLook, type Slot } from './types';

/** Pure unlock rules. Reads only profile fields (level, achievements, cosmetics), so renderers can use it too. */
type P = Pick<Profile, 'level' | 'achievements' | 'cosmetics' | 'color'> & Partial<Pick<Profile, 'settings'>>;
const key = (it: Item) => `${it.slot}:${it.id}`;
const picksOf = (p: P): Record<string, string> => p.cosmetics?.picks ?? {};

export function isUnlocked(p: P, it: Item): boolean {
  const s = it.source;
  if ('default' in s) return true;
  if ('level' in s) return p.level >= s.level;
  if ('achievement' in s) return p.achievements.includes(s.achievement);
  return Object.values(picksOf(p)).includes(it.id);
}
export const unlockedItems = (p: P): Item[] => ITEMS.filter((it) => isUnlocked(p, it));

export const isPickLevel = (level: number) => level >= PICK_EVERY && level % PICK_EVERY === 0;
const poolItems = () => ITEMS.filter((it) => 'pick' in it.source).sort((a, b) => (a.source as { pick: number }).pick - (b.source as { pick: number }).pick);

/**
 * The three items offered at pick `level`. Up to LAST_LEVEL each pick level has its own trio; after that, the items
 * passed over earlier come back, three at a time (oldest first).
 */
export function pickOptions(p: P, level: number): Item[] {
  if (!isPickLevel(level)) return [];
  if (level <= LAST_LEVEL) return poolItems().filter((it) => (it.source as { pick: number }).pick === level);
  const chosenElsewhere = new Set(Object.entries(picksOf(p)).filter(([l]) => Number(l) !== level).map(([, id]) => id));
  return poolItems().filter((it) => !chosenElsewhere.has(it.id)).slice(0, 3);
}
/** Pick levels reached but not chosen yet, lowest first. */
export function pendingPicks(p: P): number[] {
  const out: number[] = [];
  for (let l = PICK_EVERY; l <= p.level; l += PICK_EVERY) if (picksOf(p)[l] == null && pickOptions(p, l).length) out.push(l);
  return out;
}
/** Record a pick (and equip it). No-op if `id` isn't offered at `level` or the level isn't reached. */
export function choosePick<T extends P>(p: T, level: number, id: string): T {
  const it = pickOptions(p, level).find((x) => x.id === id);
  if (!it || p.level < level || picksOf(p)[level] != null) return p;
  const next = { ...p, cosmetics: { ...p.cosmetics, picks: { ...picksOf(p), [level]: id } } };
  return equip(next, it.slot, it.id);
}

/** Equip an unlocked item (locked or unknown ids are ignored). */
export function equip<T extends P>(p: T, slot: Slot, id: string): T {
  const it = item(slot, id);
  if (!it || !isUnlocked(p, it)) return p;
  return { ...p, cosmetics: { ...p.cosmetics, loadout: { ...p.cosmetics?.loadout, [slot]: id } } };
}
/** Equipped id per slot, falling back to the default for anything missing or no longer unlocked. */
export function loadout(p: P): Record<Slot, string> {
  const out = { ...DEFAULTS };
  for (const s of SLOTS) {
    const id = p.cosmetics?.loadout?.[s], it = id ? item(s, id) : undefined;
    if (it && isUnlocked(p, it)) out[s] = it.id;
  }
  return out;
}

/** What to draw for this rider. */
export function riderLook(p: P): RiderLook {
  const l = loadout(p), color = p.color || '#00f0ff';
  const j = item('jersey', l.jersey), pt = item('paint', l.paint);
  const look = j?.slot === 'jersey' ? j.look : { pattern: 'plain' as const, base: 'rider', ink: '#ffffff' };
  const sub = (c: string) => (c === 'rider' ? color : c);
  return {
    artMode: p.settings?.overworldArt === 'legacy' ? 'legacy' : 'rich',
    bike: l.bike, hat: l.hat, pet: l.pet, trail: l.trail, color,
    jersey: { pattern: look.pattern, base: sub(look.base), ink: sub(look.ink) },
    paint: pt?.slot === 'paint' ? pt.look : { frame: '#d8dbe6' },
  };
}
/** The rider's title text, or null. */
export function titleOf(p: P): string | null {
  const id = loadout(p).title;
  return id === DEFAULTS.title ? null : item('title', id)?.name ?? null;
}

/** Items that `after` has and `before` didn't (levels, achievements, picks). */
export function newUnlocks(before: P, after: P): Item[] {
  const had = new Set(unlockedItems(before).map(key));
  return unlockedItems(after).filter((it) => !had.has(key(it)));
}

/** The next level that brings a reward, with its items (a pick level lists its three options). */
export function nextReward(p: P): { level: number; items: Item[]; pick: boolean } | null {
  for (let l = p.level + 1; l <= p.level + 2 * PICK_EVERY; l++) {
    if (isPickLevel(l)) { const o = pickOptions(p, l); if (o.length) return { level: l, items: o, pick: true }; continue; }
    const items = ITEMS.filter((it) => 'level' in it.source && it.source.level === l);
    if (items.length) return { level: l, items, pick: false };
  }
  return null;
}

/** How to unlock `it`, for locked tiles. `achievementName` resolves ids; secret achievements stay hidden. */
export function unlockHint(it: Item, achievementName: (id: string) => { name: string; secret?: boolean } | undefined): string {
  const s = it.source;
  if ('default' in s) return 'Starter item';
  if ('level' in s) return `Reach level ${s.level}`;
  if ('pick' in s) return `Level ${s.pick} reward pick`;
  const a = achievementName(s.achievement);
  return a?.secret ? 'Secret achievement' : `Earn “${a?.name ?? s.achievement}”`;
}

/** `look` wearing `it` instead (Locker previews; titles change nothing visible). */
export function withItem(look: RiderLook, it: Item): RiderLook {
  const sub = (c: string) => (c === 'rider' ? look.color : c);
  switch (it.slot) {
    case 'bike': return { ...look, bike: it.id };
    case 'hat': return { ...look, hat: it.id };
    case 'jersey': return { ...look, jersey: { pattern: it.look.pattern, base: sub(it.look.base), ink: sub(it.look.ink) } };
    case 'paint': return { ...look, paint: it.look };
    case 'pet': return { ...look, pet: it.id };
    case 'trail': return { ...look, trail: it.id };
    default: return look;
  }
}
