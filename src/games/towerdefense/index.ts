import type { GameModule } from '../../contracts';
import { achievements } from './achievements';
import { createTdSim, type TdOpts } from './sim/sim';
import { drawCard, progressLine } from './card';

export const module: GameModule = {
  achievements,
  id: 'towerdefense',
  title: 'Dynamo Defense',
  blurb: 'Your pedaling powers the base. Match weapons to enemy colors, build towers, sprint for Overdrive.',
  progressLine, drawCard,
  tags: ['sprint', 'intervals'],
  createSim(ctx, opts) {
    return createTdSim(ctx, opts as TdOpts | undefined);
  },
  loadRenderer() {
    return import('./render/renderer').then(m => new m.TdRenderer());
  },
};
