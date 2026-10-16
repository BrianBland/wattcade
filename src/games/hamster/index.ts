import type { GameModule } from '../../contracts';
import { achievements } from './achievements';
import { createHamsterSim, type HamsterOpts } from './sim/sim';
import { drawCard, progressLine } from './card';
import { saveSchema } from './sim/save';

export const module: GameModule = {
  save: saveSchema,
  achievements,
  id: 'hamster',
  title: 'HAMSTERGRID',
  blurb: 'Cookie-clicker idle empire. Your hamsters only run when you do. Hold Zone 2 to go mind-numbingly fast, all the way to a Dyson swarm.',
  progressLine, drawCard,
  tags: ['zone2'],
  createSim(ctx, opts) {
    return createHamsterSim(ctx, opts as HamsterOpts | undefined);
  },
  async loadRenderer() {
    const { HamsterRenderer } = await import('./render/renderer');
    return new HamsterRenderer();
  },
};
