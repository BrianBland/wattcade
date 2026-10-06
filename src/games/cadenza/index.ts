import type { GameModule } from '../../contracts';
import { createCadenzaSim, type CadenzaOpts } from './sim/sim';
import { drawCard, mediaPreview, progressLine } from './card';

export const module: GameModule = {
  id: 'cadenza',
  title: 'Cadenza',
  blurb: 'Ride your music. Builds climb, drops dive into sprints; steer through the beat and keep your shield up with your legs.',
  progressLine, drawCard, mediaPreview,
  tags: ['intervals', 'sprint'],
  requires: { media: ['pcm'] },
  createSim(ctx, opts) {
    return createCadenzaSim(ctx, opts as CadenzaOpts | undefined);
  },
  async loadRenderer() {
    const { CadenzaRenderer } = await import('./render/renderer');
    return new CadenzaRenderer();
  },
};
