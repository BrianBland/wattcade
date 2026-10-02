import type { GameModule } from '../../contracts';
import { createLighthouseSim, type SimOpts } from './sim/sim';

export const module: GameModule = {
  id: 'lighthouse',
  title: "Keeper's Light",
  blurb: 'Hold Zone 2 to keep the lamp bright and guide ships home. Survive the storms.',
  tags: ['zone2', 'intervals'],
  createSim(ctx, opts) {
    return createLighthouseSim(ctx, opts as SimOpts | undefined);
  },
  async loadRenderer() {
    const { LighthouseRenderer } = await import('./render/renderer');
    return new LighthouseRenderer();
  },
};
