import type { CraftId, SfSave } from './types';
import { UPGRADES, upgradeCost } from './meta';
import { craftLevel, ESCORT_UNLOCK_LEVEL, STRIKER_UNLOCK } from './progression';
export function migrateSave(raw?: Record<string, unknown>): SfSave {
  if (raw?.v === 3) {
    const save = { ...raw, totals: { kills: (raw.totals as SfSave['totals'])?.kills ?? 0, bosses: (raw.totals as SfSave['totals'])?.bosses ?? 0 } } as unknown as SfSave;
    // Early v3 saves predate craft levels: seed the Cruiser with all groove time and keep an Escort earned under the old 10-minute rule.
    const craftS = raw.craftS as Partial<SfSave['craftS']> | undefined;
    save.craftS = { cruiser: craftS?.cruiser ?? save.onTargetS ?? 0, escort: craftS?.escort ?? 0, striker: craftS?.striker ?? 0 };
    save.unlocked = Array.isArray(raw.unlocked) ? [...raw.unlocked] as SfSave['unlocked'] : ['cruiser', ...(save.onTargetS >= 600 || save.unlockCredit >= 1000 ? ['escort' as const] : [])];
    return save;
  }
  const levels = raw?.upgrades as Record<string, number> | undefined;
  let invested = 0;
  for (const def of UPGRADES) for (let i = 0; i < Math.min(def.max, Math.max(0, levels?.[def.id] ?? 0)); i++) invested += upgradeCost(def, i);
  const oldTotals = raw?.totals as { kills?: number; bosses?: number; bossesDefeated?: number } | undefined;
  return { v: 3, best: 0, legacyBest: Number(raw?.best ?? 0), runs: Number(raw?.runs ?? 0), onTargetS: 0,
    unlockCredit: Math.max(0, Number(raw?.bank ?? 0)) + invested, craft: 'cruiser',
    totals: { kills: oldTotals?.kills ?? 0, bosses: oldTotals?.bossesDefeated ?? oldTotals?.bosses ?? 0 }, ...(raw ? { legacy: structuredClone(raw) } : {}),
    craftS: { cruiser: 0, escort: 0, striker: 0 }, unlocked: ['cruiser'] };
}
/** New riders start with the Cruiser; the Escort unlocks at Cruiser level 3 (or with converted legacy credit). */
export const escortAvailable = (save: SfSave) => save.unlocked.includes('escort') || save.unlockCredit >= 1000 || craftLevel(save.craftS.cruiser).level >= ESCORT_UNLOCK_LEVEL;
/** The Tempo Striker unlocks at Cruiser level 5 or Escort level 3, and stays unlocked. */
export const strikerAvailable = (save: SfSave) => save.unlocked.includes('striker') || craftLevel(save.craftS.cruiser).level >= STRIKER_UNLOCK.cruiser
  || craftLevel(save.craftS.escort).level >= STRIKER_UNLOCK.escort;
export const craftName = (craft: CraftId) => craft === 'escort' ? 'Resonance Escort' : craft === 'striker' ? 'Tempo Striker' : 'Cadence Cruiser';
