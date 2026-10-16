import type { GameModule } from '../../contracts';
import { achievements } from './achievements';
import { createSfSim, type SfOpts } from './sim/sim';
import { drawCard, progressLine } from './card';
import { saveSchema } from './sim/save';

// id stays 'starfighter' so existing saves (best score) carry over after the rename from "Crank Fighter".
export const module: GameModule = {
  save: saveSchema,
  achievements,
  id: 'starfighter',
  title: 'Sprocket Squadron',
  blurb: 'Hold the groove. Paint targets with your paddles, unleash musical laser volleys, and auto-dodge through bright carrier battles. Ride Zone 2, grow your arsenal, and break flagships.',
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
