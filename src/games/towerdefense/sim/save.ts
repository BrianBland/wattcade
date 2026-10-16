// This schema belongs only to Dynamo Defense. Endless-run fields arrive with that change, not here.
import { defineSaveSchema, saveBoolean, saveLevels, saveNumber, saveObject } from '../../../core/saveSchema';
import { UPGRADES, type Levels } from './meta';

export interface TdSave {
  v: 2; bestWave: number; bank: number; upgrades: Levels; runs: number; autoInvest: boolean; autoCrew: boolean;
  totals: { waves: number; kills: number; bosses: number; towers: number; surges: number };
}

/** Read the payload the sim writes today: legacy best-wave-only and v2. */
export const saveSchema = defineSaveSchema<TdSave>({
  version: 2,
  migrations: { 1: (s) => s },
  parse(s) {
    const totals = saveObject(s.totals, 'totals');
    return {
      ...s, v: 2, bestWave: saveNumber(s.bestWave, 0, 'best wave'), bank: saveNumber(s.bank, 0, 'bank'),
      autoCrew: saveBoolean(s.autoCrew, true, 'auto-crew'),
      upgrades: saveLevels(s.upgrades, UPGRADES), runs: saveNumber(s.runs, 0, 'runs'),
      autoInvest: saveBoolean(s.autoInvest, false, 'auto-invest'),
      totals: {
        ...totals,
        waves: saveNumber(totals.waves, 0, 'waves'), kills: saveNumber(totals.kills, 0, 'kills'),
        bosses: saveNumber(totals.bosses, 0, 'bosses'), towers: saveNumber(totals.towers, 0, 'towers'),
        surges: saveNumber(totals.surges, 0, 'surges'),
      },
    };
  },
});

export const readSave = (raw: unknown): TdSave => saveSchema.read(raw);
