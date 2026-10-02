import type { GameModule } from '../../contracts';
import { createSfSim, type SfOpts } from './sim/sim';

export const module: GameModule = {
  id: 'starfighter',
  title: 'Crank Fighter',
  blurb: 'Two-button shooter: shifters are your left/right guns. Cadence fires, power thrusts, sprint for overdrive.',
  tags: ['sprint', 'intervals'],
  createSim(ctx, opts) {
    return createSfSim(ctx, opts as SfOpts | undefined);
  },
  loadRenderer() {
    return import('./render/renderer').then(m => new m.SfRenderer());
  },
};
