import type { GameModule } from '../../contracts';
import { achievements } from './achievements';
import { createWatershedSim, type WatershedOpts } from './sim/sim';
import { drawCard, progressLine } from './card';
import { saveSchema } from './sim/save';

export const module: GameModule = {
  save: saveSchema,
  achievements,
  id: 'watershed',
  title: 'Watershed',
  blurb: 'You are the river. ERG sets how much water you are; your cadence decides if it carves gorges or races silt to the sea.',
  progressLine, drawCard,
  tags: ['erg', 'intervals'],
  requires: { erg: true },
  createSim(ctx, opts) {
    return createWatershedSim(ctx, opts as WatershedOpts | undefined);
  },
  async loadRenderer() {
    const { WatershedRenderer } = await import('./render/renderer');
    return new WatershedRenderer();
  },
};
