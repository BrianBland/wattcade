import type { GameModule } from '../../contracts';
import { achievements } from './achievements';
import { createLighthouseSim, type SimOpts } from './sim/sim';
import { drawCard, progressLine } from './card';
import { saveSchema } from './sim/save';

export const module: GameModule = {
  save: saveSchema,
  achievements,
  id: 'lighthouse',
  title: "Keeper's Light",
  blurb: 'Hold Zone 2 to keep the lamp bright, guide ships home, and watch your island town bloom. Survive the storms.',
  progressLine, drawCard,
  tags: ['zone2', 'intervals'],
  createSim(ctx, opts) {
    return createLighthouseSim(ctx, opts as SimOpts | undefined);
  },
  async loadRenderer() {
    const { LighthouseRenderer } = await import('./render/renderer');
    return new LighthouseRenderer();
  },
};
