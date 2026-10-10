import type { GameModule } from '../../contracts';
import { achievements } from './achievements';
import { createSfSim, type SfOpts } from './sim/sim';
import { drawCard, progressLine } from './card';

// id stays 'starfighter' so existing saves (best score) carry over after the rename from "Crank Fighter".
export const module: GameModule = {
  achievements,
  id: 'starfighter',
  title: 'Sprocket Squadron',
  blurb: 'Hold the groove. Ride Zone 2 through your music while your squadron flies and fires. Grow your arsenal, break flagships, and unlock craft with different riding styles.',
  progressLine, drawCard,
  tags: ['zone2', 'erg'],
  requires: { media: ['pcm'] },
  createSim(ctx, opts) {
    return createSfSim(ctx, opts as SfOpts | undefined);
  },
  loadRenderer() {
    return import('./render/renderer').then(m => new m.SfRenderer());
  },
};
