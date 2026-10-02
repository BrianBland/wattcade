import type { GameModule } from '../../contracts';
import { createTdSim, type TdOpts } from './sim/sim';

export const module: GameModule = {
  id: 'towerdefense',
  title: 'Dynamo Defense',
  blurb: 'Match weapon to enemy color. Each weapon loads the trainer differently.',
  tags: ['sprint', 'intervals'],
  createSim(ctx, opts) {
    return createTdSim(ctx, opts as TdOpts | undefined);
  },
  loadRenderer() {
    return import('./render/renderer').then(m => new m.TdRenderer());
  },
};
