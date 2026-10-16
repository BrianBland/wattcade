import { defineSaveSchema, saveBoolean, saveChoice, saveNumber, saveObject } from '../../../core/saveSchema';
import { DIFFICULTIES } from './track';
import type { CadenzaSave } from './sim';

// Existing unversioned saves are version 1; adding the marker does not change their content.
export const saveSchema = defineSaveSchema<CadenzaSave>({
  version: 1, migrations: {},
  parse(s) {
    const best = Object.fromEntries(Object.entries(saveObject(s.best, 'best scores')).map(([key, value]) => [key, saveNumber(value, 0, 'best score')]));
    return { ...s, v: 1, plays: saveNumber(s.plays, 0, 'plays'), sets: saveNumber(s.sets, 0, 'sets'),
      bestScore: saveNumber(s.bestScore, 0, 'best score'), best,
      ...(s.lastDifficulty === undefined ? {} : { lastDifficulty: saveChoice(s.lastDifficulty, 'pro', DIFFICULTIES, 'rhythm difficulty') }),
      ...(s.lastMode === undefined ? {} : { lastMode: saveChoice(s.lastMode, 'mono', ['mono', 'classic'] as const, 'mode') }),
      ...(s.reducedFlash === undefined ? {} : { reducedFlash: saveBoolean(s.reducedFlash, false, 'reduced flash') }),
      ...(s.trainer === undefined ? {} : { trainer: saveChoice(s.trainer, 'grade', ['grade', 'erg'] as const, 'trainer preference') }) };
  },
});
