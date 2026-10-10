import type { GameModule } from '../../contracts';
import { createGtpSim, type SimOpts } from './sim/sim';
import { achievements } from './achievements';
import { drawCard, progressLine } from './card';

export const module: GameModule = {
  id: 'gtpedal',
  title: 'Grand Theft Pedal',
  blurb: 'Steal bikes, launch off park berms, grind the tram tracks and jump the drawbridge in a car-free utopia. Your watts are the getaway.',
  tags: ['sprint'],
  achievements, progressLine, drawCard,
  createSim(ctx, opts) {
    return createGtpSim(ctx, opts as SimOpts | undefined);
  },
  async loadRenderer() {
    const { GtpRenderer } = await import('./render/renderer');
    return new GtpRenderer();
  },
};
