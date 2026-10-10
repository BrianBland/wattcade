import type { CraftId, SfSave } from './types';
import { UPGRADES, upgradeCost } from './meta';
export function migrateSave(raw?: Record<string, unknown>): SfSave {
  if (raw?.v === 3) return { ...raw, totals: { kills: (raw.totals as SfSave['totals'])?.kills ?? 0, bosses: (raw.totals as SfSave['totals'])?.bosses ?? 0 } } as unknown as SfSave;
  const levels = raw?.upgrades as Record<string, number> | undefined;
  let invested = 0;
  for (const def of UPGRADES) for (let i = 0; i < Math.min(def.max, Math.max(0, levels?.[def.id] ?? 0)); i++) invested += upgradeCost(def, i);
  const oldTotals = raw?.totals as { kills?: number; bosses?: number; bossesDefeated?: number } | undefined;
  return { v: 3, best: 0, legacyBest: Number(raw?.best ?? 0), runs: Number(raw?.runs ?? 0), onTargetS: 0,
    unlockCredit: Math.max(0, Number(raw?.bank ?? 0)) + invested, craft: 'cruiser',
    totals: { kills: oldTotals?.kills ?? 0, bosses: oldTotals?.bossesDefeated ?? oldTotals?.bosses ?? 0 }, ...(raw ? { legacy: structuredClone(raw) } : {}) };
}
export const escortAvailable = (save: SfSave) => save.onTargetS >= 600 || save.unlockCredit >= 1000;
export const craftName = (craft: CraftId) => craft === 'escort' ? 'Resonance Escort' : 'Cadence Cruiser';
