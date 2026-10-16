import { defineSaveSchema, saveArray, saveChoice, saveNumber, saveObject, SaveReadError } from '../../../core/saveSchema';
import { PLOT_COUNT, type DistrictId } from './layout';
import { BUILDING_TYPES, DISTRICTS, LENS, maxLevel, type BuildingType } from './town';
import { DECOR_IDS, VISITORS, decorMax, type DecorId, type GiftId } from './extras';

export interface LighthouseSave {
  v: 2; buildings: Array<BuildingType | null>; levels?: number[]; grow: number[]; coin: number; timber: number; meadow: number; lens?: number;
  shipsDockedTotal: number; stormsWeatheredTotal: number;
  open?: DistrictId[]; rides?: number; decor?: Partial<Record<DecorId, number>>; gifts?: GiftId[]; festivals?: number;
}

export const saveSchema = defineSaveSchema<LighthouseSave>({
  version: 2,
  // The old 14-plot town cannot be mapped safely by this reader. Keep it intact, rather than silently resetting it.
  migrations: {},
  parse(s) {
    const buildings = saveArray(s.buildings, [], 'buildings', (v) => v === null ? null : saveChoice(v, 'garden', BUILDING_TYPES, 'building'), PLOT_COUNT);
    const rawLevels = saveArray(s.levels, [], 'building levels', (v) => saveNumber(v, 0, 'building level'), PLOT_COUNT);
    const grow = saveArray(s.grow, [], 'growth', (v) => saveNumber(v, 0, 'growth', 1, false), PLOT_COUNT);
    const levels = Array.from({ length: PLOT_COUNT }, (_, i) => {
      const building = buildings[i];
      if (!building) return 0;
      const level = saveNumber(rawLevels[i], 1, 'building level', maxLevel(building));
      if (level < 1) throw new SaveReadError('invalid-data', 'Invalid building level. Your stored progress has been kept.');
      return level;
    });
    const decor: Partial<Record<DecorId, number>> = {};
    for (const [id, value] of Object.entries(saveObject(s.decor, 'decorations'))) {
      if (!DECOR_IDS.includes(id as DecorId)) throw new SaveReadError('invalid-data', 'Unknown decoration. Your stored progress has been kept.');
      decor[id as DecorId] = saveNumber(value, 0, 'decoration level', decorMax(id as DecorId));
    }
    const lens = saveNumber(s.lens, 1, 'lens', LENS.length);
    if (lens < 1) throw new SaveReadError('invalid-data', 'Invalid lens. Your stored progress has been kept.');
    return { ...s, v: 2, buildings: Array.from({ length: PLOT_COUNT }, (_, i) => buildings[i] ?? null), levels,
      grow: Array.from({ length: PLOT_COUNT }, (_, i) => grow[i] ?? 0),
      coin: saveNumber(s.coin, 20, 'coins', Number.MAX_SAFE_INTEGER, false), timber: saveNumber(s.timber, 10, 'timber', Number.MAX_SAFE_INTEGER, false),
      meadow: saveNumber(s.meadow, 0, 'meadow', Number.MAX_SAFE_INTEGER, false), lens,
      shipsDockedTotal: saveNumber(s.shipsDockedTotal, 0, 'ships docked'), stormsWeatheredTotal: saveNumber(s.stormsWeatheredTotal, 0, 'storms'),
      open: saveArray(s.open, [], 'districts', (v) => saveChoice(v, 'harbour', DISTRICTS.map((d) => d.id), 'district')),
      rides: saveNumber(s.rides, 0, 'rides'), decor,
      gifts: saveArray(s.gifts, [], 'gifts', (v) => saveChoice(v, 'carousel', Object.values(VISITORS).map((d) => d.gift), 'gift')),
      ...(s.festivals === undefined ? {} : { festivals: saveNumber(s.festivals, 0, 'festivals') }) };
  },
});
