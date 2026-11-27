/**
 * Lazy level catalog for Penrose Pedals. Resolves any campaign index into a SimLevelDef
 * on demand in <1 ms (zero upfront CPU planning on mount) and supplies instant chapter metadata.
 */

import { CAMPAIGN } from '../campaign';
import { composePlan, makeComposeLevelDef } from './compose';
import { makeCubeLevelDef } from './cube';
import { CH1_TO_4_LEVELS } from './levelsCh1to4';
import { CH5_TO_8_LEVELS } from './levelsCh5to8';
import type { SimLevelDef } from './types';

export interface CatalogEntry {
  index: number;
  chapterIndex: number;
  chapterName: string;
  vibe: string;
  item: string;
  id: string;
}

const HAND_POOL: Record<string, (chapter: string, chapterIndex: number) => SimLevelDef> = {
  ...CH1_TO_4_LEVELS,
  ...CH5_TO_8_LEVELS,
  'x-cube': makeCubeLevelDef,
};

const flatEntries: CatalogEntry[] = [];
const chapterLevelIds: string[][] = CAMPAIGN.map(() => []);

CAMPAIGN.forEach((ch, ci) => {
  for (const item of ch.levels) {
    const id = item.startsWith('bc:') ? `bc-${item.slice(3)}` : item;
    flatEntries.push({
      index: flatEntries.length,
      chapterIndex: ci,
      chapterName: ch.name,
      vibe: ch.vibe,
      item,
      id,
    });
    chapterLevelIds[ci].push(id);
  }
});

export const LEVEL_CATALOG: readonly CatalogEntry[] = flatEntries;
export const CHAPTER_LEVEL_IDS: readonly (readonly string[])[] = chapterLevelIds;
export const LEVEL_COUNT = flatEntries.length;

const defCache = new Map<number, SimLevelDef>();

export function wrapLevelIndex(i: number): number {
  return ((Math.floor(i) % LEVEL_COUNT) + LEVEL_COUNT) % LEVEL_COUNT;
}

export function getLevelDef(index: number): SimLevelDef {
  const idx = wrapLevelIndex(index);
  const cached = defCache.get(idx);
  if (cached) return cached;
  const entry = flatEntries[idx];
  let def: SimLevelDef | null = null;
  const hand = HAND_POOL[entry.item];
  if (hand) {
    def = hand(entry.chapterName, entry.chapterIndex);
  } else if (entry.item.startsWith('bc:')) {
    const seed = Number(entry.item.slice(3));
    const plan = composePlan(seed);
    if (!plan) throw new Error(`Penrose campaign seed ${entry.item} failed to plan`);
    def = makeComposeLevelDef(plan, entry.chapterName, entry.chapterIndex);
  }
  if (!def) throw new Error(`Unknown Penrose campaign item: ${entry.item}`);
  defCache.set(idx, def);
  return def;
}
