import { defineSaveSchema, saveArray, saveChoice, saveNumber, saveString, SaveReadError } from '../../../core/saveSchema';
import { ERAS, GENS, PEPTIDES, VIBES } from './data';
import type { HamsterSave } from './sim';

// Energy is intentionally allowed to exceed safe-integer range in this idle empire.
const energy = (v: unknown, field: string) => saveNumber(v, 0, field, Number.MAX_VALUE, false);
export const saveSchema = defineSaveSchema<HamsterSave>({
  version: 1, migrations: {},
  parse(s) {
    const gens = saveArray(s.gens, [], 'generators', (value) => {
      const n = energy(value, 'generator count');
      if (!Number.isInteger(n)) throw new SaveReadError('invalid-data', 'Invalid generator count. Your stored progress has been kept.');
      return n;
    }, GENS.length);
    return { ...s, v: 1, gens: GENS.map((_, i) => gens[i] ?? 0),
      upg: saveArray(s.upg, [], 'upgrades', (v) => saveString(v, 'upgrade id')),
      bank: energy(s.bank, 'bank'), life: energy(s.life, 'life energy'), all: energy(s.all, 'lifetime energy'),
      seeds: saveNumber(s.seeds, 0, 'seeds'), rebirths: saveNumber(s.rebirths, 0, 'rebirths'),
      vibes: saveArray(s.vibes, [], 'vibes', (v) => saveChoice(v, VIBES[0].id, VIBES.map((d) => d.id), 'vibe')),
      vibesOn: saveArray(s.vibesOn, [], 'active vibes', (v) => saveChoice(v, VIBES[0].id, VIBES.map((d) => d.id), 'vibe')),
      miles: saveArray(s.miles, [], 'milestones', (v) => saveString(v, 'milestone')),
      peakW: energy(s.peakW, 'peak output'), rideS: energy(s.rideS, 'ride seconds'),
      pepUses: saveNumber(s.pepUses, 0, 'peptide uses'), goldens: saveNumber(s.goldens, 0, 'goldens'),
      strikes: saveNumber(s.strikes, 0, 'strikes'), trials: saveNumber(s.trials, 0, 'trials'),
      maxEra: saveNumber(s.maxEra, 0, 'era', ERAS.length - 1),
      unlocks: saveArray(s.unlocks, [], 'unlocks', (v) => saveString(v, 'unlock id')),
      ...(s.lastPep === undefined ? {} : { lastPep: saveChoice(s.lastPep, 'seeds', PEPTIDES.map((p) => p.id), 'peptide') }) };
  },
});
