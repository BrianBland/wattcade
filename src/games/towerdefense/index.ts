import type { GameModule } from '../../contracts';
import { createTdSim, type TdOpts } from './sim/sim';
import { drawCard, progressLine } from './card';

export const module: GameModule = {
  id: 'towerdefense',
  title: 'Dynamo Defense',
  blurb: 'Your pedalling powers the base. Match weapons to enemy colours, build towers, sprint for Overdrive.',
  progressLine, drawCard,
  tags: ['sprint', 'intervals'],
  createSim(ctx, opts) {
    return createTdSim(ctx, opts as TdOpts | undefined);
  },
  loadRenderer() {
    return import('./render/renderer').then(m => new m.TdRenderer());
  },
};
