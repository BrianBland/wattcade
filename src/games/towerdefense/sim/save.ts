// This schema belongs only to Dynamo Defense. Other games keep their own save readers and versions.
import { defineSaveSchema, saveBoolean, saveLevels, saveNumber, saveObject } from '../../../core/saveSchema';
import { UPGRADES, type Levels } from './meta';

export interface TdSave {
  v: 3; bestWave: number; bank: number; upgrades: Levels; runs: number; autoInvest: boolean; autoCrew: boolean;
  totals: { waves: number; kills: number; bosses: number; towers: number; surges: number; runsFallen: number; runsBailed: number };
}

/** Read legacy best-wave-only, v2 and v3 saves without mutating the stored payload. */
export const saveSchema = defineSaveSchema<TdSave>({
  version: 3,
  migrations: {
    1: (s) => s,
    2: (s) => {
      const { cores, coresMax, coreGraceS, ...rest } = s;
      const { coresLost, ...totals } = saveObject(s.totals, 'totals');
      return { ...rest, totals };
    },
  },
  parse(s) {
    const upgrades: Levels = saveLevels(s.upgrades, UPGRADES);
    const totals = saveObject(s.totals, 'totals');
    return {
      ...s, v: 3, bestWave: saveNumber(s.bestWave, 0, 'best wave'), bank: saveNumber(s.bank, 0, 'bank'),
      autoCrew: saveBoolean(s.autoCrew, true, 'auto-crew'),
      upgrades, runs: saveNumber(s.runs, 0, 'runs'), autoInvest: saveBoolean(s.autoInvest, false, 'auto-invest'),
      totals: {
        ...totals,
        waves: saveNumber(totals.waves, 0, 'waves'), kills: saveNumber(totals.kills, 0, 'kills'),
        bosses: saveNumber(totals.bosses, 0, 'bosses'), towers: saveNumber(totals.towers, 0, 'towers'),
        surges: saveNumber(totals.surges, 0, 'surges'), runsFallen: saveNumber(totals.runsFallen, 0, 'runs fallen'),
        runsBailed: saveNumber(totals.runsBailed, 0, 'runs bailed'),
      },
    };
  },
});

export const readSave = (raw: unknown): TdSave => saveSchema.read(raw);
