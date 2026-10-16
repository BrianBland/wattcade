import { defineSaveSchema, saveArray, saveBoolean, saveChoice, saveLevels, saveNumber, saveObject } from '../../../core/saveSchema';
import { RETIRED, UPGRADES, spentOn } from './meta';
import { STANCE_ORDER } from './stances';
import type { DungeonSave } from './sim';

export const SAVE_VER = 2;
export const saveSchema = defineSaveSchema<DungeonSave>({
  version: SAVE_VER, versionKey: 'ver',
  migrations: {
    1: (s) => {
      const upgrades = { ...saveObject(s.upgrades, 'upgrades') };
      let bank = saveNumber(s.bank, 0, 'bank');
      for (const [id, def] of Object.entries(RETIRED)) {
        const level = saveNumber(upgrades[id], 0, `retired upgrade ${id}`, 30);
        bank += spentOn(def, level); delete upgrades[id];
      }
      return { ...s, bank, upgrades };
    },
  },
  parse(s) {
    const totals = saveObject(s.totals, 'totals');
    const runs = saveNumber(s.runs, 0, 'runs');
    return { ...s, ver: SAVE_VER, bank: saveNumber(s.bank, 0, 'bank'), upgrades: saveLevels(s.upgrades, UPGRADES),
      bestFloor: saveNumber(s.bestFloor, 1, 'best floor'), runs,
      autoInvest: saveBoolean(s.autoInvest, true, 'auto-invest'), erg: saveBoolean(s.erg, false, 'ERG preference'),
      ...(s.stance === undefined ? {} : { stance: saveChoice(s.stance, 'ranger', STANCE_ORDER, 'stance') }),
      ...(s.stancesUnlocked === undefined ? {} : { stancesUnlocked: saveArray(s.stancesUnlocked, [], 'unlocked stances',
        (v) => saveChoice(v, 'ranger', STANCE_ORDER, 'stance')) }),
      totals: { ...totals, runs: saveNumber(totals.runs, runs, 'total runs'), deaths: saveNumber(totals.deaths, 0, 'deaths'),
        floors: saveNumber(totals.floors, 0, 'floors'), bosses: saveNumber(totals.bosses, 0, 'bosses'), coins: saveNumber(totals.coins, 0, 'coins') } };
  },
});
export const migrateSave = (raw: DungeonSave | null | undefined): DungeonSave => saveSchema.read(raw);
