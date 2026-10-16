import type { GameModule } from '../../contracts';
import { achievements } from './achievements';
import { createTdSim, type TdOpts } from './sim/sim';
import { drawCard, progressLine } from './card';
import { saveSchema } from './sim/save';

export const module: GameModule = {
  save: saveSchema,
  achievements,
  id: 'towerdefense',
  title: 'Dynamo Defense',
  blurb: 'Your pedaling powers the base. Each wave is one alien brood and brings the weapon to match; build towers for the rest, sprint for Overdrive.',
  progressLine, drawCard,
  tags: ['sprint', 'intervals'],
  createSim(ctx, opts) {
    return createTdSim(ctx, opts as TdOpts | undefined);
  },
  loadRenderer() {
    return import('./render/renderer').then(m => new m.TdRenderer());
  },
};
