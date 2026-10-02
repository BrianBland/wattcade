import type { GameModule } from '../../contracts';
import { createHamsterSim, type HamsterOpts } from './sim/sim';

export const module: GameModule = {
  id: 'hamster',
  title: 'HAMSTERGRID',
  blurb: 'Cookie-clicker idle empire. Your hamsters only run when you do. Hold Zone 2 to go mind-numbingly fast, all the way to a Dyson swarm.',
  tags: ['zone2'],
  createSim(ctx, opts) {
    return createHamsterSim(ctx, opts as HamsterOpts | undefined);
  },
  async loadRenderer() {
    const { HamsterRenderer } = await import('./render/renderer');
    return new HamsterRenderer();
  },
};
