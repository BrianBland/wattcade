import type { GameModule } from '../../contracts';
import { createWattsurfSim, type WattsurfOpts } from './sim/sim';
import { drawCard, mediaPreview, progressLine } from './card';

export const module: GameModule = {
  id: 'wattsurf',
  title: 'Wattsurf',
  blurb: 'Ride your music. Builds climb, drops dive into sprints; steer through the beat and keep your shield up with your legs.',
  progressLine, drawCard, mediaPreview,
  tags: ['intervals', 'sprint'],
  requires: { media: ['pcm'] },
  createSim(ctx, opts) {
    return createWattsurfSim(ctx, opts as WattsurfOpts | undefined);
  },
  async loadRenderer() {
    const { WattsurfRenderer } = await import('./render/renderer');
    return new WattsurfRenderer();
  },
};
