import type { CraftId, SfSave } from './types';
import { defineSaveSchema, saveArray, saveChoice, saveLevels, saveNumber, saveObject } from '../../../core/saveSchema';
import { UPGRADES, upgradeCost } from './meta';
import { craftLevel, ESCORT_UNLOCK_LEVEL } from './progression';
function convertLegacy(s: Record<string, unknown>): Record<string, unknown> {
  const source = saveObject(s.legacy === undefined ? s : s.legacy, 'legacy save');
  const levels = saveLevels(source.upgrades, UPGRADES);
  let invested = 0;
  for (const def of UPGRADES) for (let i = 0; i < (levels[def.id] ?? 0); i++) invested += upgradeCost(def, i);
  const totals = saveObject(source.totals, 'legacy totals');
  return { best: 0, legacyBest: saveNumber(source.best, 0, 'legacy best'), runs: saveNumber(source.runs, 0, 'runs'), onTargetS: 0,
    unlockCredit: saveNumber(source.bank, 0, 'bank') + invested, craft: 'cruiser', legacy: source,
    totals: { kills: saveNumber(totals.kills, 0, 'kills'), bosses: saveNumber(totals.bossesDefeated ?? totals.bosses, 0, 'bosses') },
    craftS: { cruiser: 0, escort: 0 }, unlocked: ['cruiser'] };
}

export const saveSchema = defineSaveSchema<SfSave>({
  version: 3,
  migrations: { 1: (s) => ({ ...s, legacy: structuredClone(s) }), 2: convertLegacy },
  parse(s) {
    const totals = saveObject(s.totals, 'totals'), craftS = saveObject(s.craftS, 'craft seconds');
    const onTargetS = saveNumber(s.onTargetS, 0, 'on-target seconds', Number.MAX_SAFE_INTEGER, false);
    const unlockCredit = saveNumber(s.unlockCredit, 0, 'unlock credit');
    return { ...s, v: 3, best: saveNumber(s.best, 0, 'best'), legacyBest: saveNumber(s.legacyBest, 0, 'legacy best'),
      runs: saveNumber(s.runs, 0, 'runs'), onTargetS, unlockCredit,
      craft: saveChoice(s.craft, 'cruiser', ['cruiser', 'escort'] as const, 'craft'),
      totals: { ...totals, kills: saveNumber(totals.kills, 0, 'kills'), bosses: saveNumber(totals.bosses, 0, 'bosses') },
      craftS: { cruiser: saveNumber(craftS.cruiser, onTargetS, 'Cruiser seconds', Number.MAX_SAFE_INTEGER, false),
        escort: saveNumber(craftS.escort, 0, 'Escort seconds', Number.MAX_SAFE_INTEGER, false) },
      unlocked: saveArray(s.unlocked, ['cruiser', ...(onTargetS >= 600 || unlockCredit >= 1000 ? ['escort'] : [])], 'unlocked craft',
        (v) => saveChoice(v, 'cruiser', ['cruiser', 'escort'] as const, 'unlocked craft')),
      ...(s.legacy === undefined ? {} : { legacy: saveObject(s.legacy, 'legacy save') }) };
  },
});
export const migrateSave = (raw?: Record<string, unknown>): SfSave => saveSchema.read(raw);
/** New riders start with the Cruiser; the Escort unlocks at Cruiser level 3 (or with converted legacy credit). */
export const escortAvailable = (save: SfSave) => save.unlocked.includes('escort') || save.unlockCredit >= 1000 || craftLevel(save.craftS.cruiser).level >= ESCORT_UNLOCK_LEVEL;
export const craftName = (craft: CraftId) => craft === 'escort' ? 'Resonance Escort' : 'Cadence Cruiser';
