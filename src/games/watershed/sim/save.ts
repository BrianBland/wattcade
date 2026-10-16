import { defineSaveSchema, saveNumber, SaveReadError } from '../../../core/saveSchema';
import type { WatershedSave } from '../card';
import { RIDE_LENGTHS } from './plan';

export const saveSchema = defineSaveSchema<WatershedSave>({
  version: 1, migrations: {},
  parse(s) {
    const lastLength = s.lastLength === undefined ? undefined : saveNumber(s.lastLength, 45, 'ride length');
    if (lastLength !== undefined && !RIDE_LENGTHS.some((n) => n === lastLength)) throw new SaveReadError('invalid-data', 'Invalid ride length. Your stored progress has been kept.');
    return { ...s, v: 1, rides: saveNumber(s.rides, 0, 'rides'), bestCarved: saveNumber(s.bestCarved, 0, 'carved'),
      bestDelta: saveNumber(s.bestDelta, 0, 'delta'), bestSalmon: saveNumber(s.bestSalmon, 0, 'salmon'),
      bestScore: saveNumber(s.bestScore, 0, 'best score'), ...(lastLength === undefined ? {} : { lastLength }) };
  },
});
