import type { GameModule } from '../../contracts';
import { achievements } from './achievements';
import { createWarmupSim, type WarmupOpts } from './sim/sim';

/** The free ride behind the arcade menus. Not listed in the game picker; the shell runs it as the lobby. */
export const module: GameModule = {
  achievements,
  id: 'warmup',
  title: 'Warm-up Ride',
  blurb: 'Ride through rolling countryside, along the coast and across the Moon. Hills on screen are hills on the trainer.',
  tags: ['zone2'],
  createSim(ctx, opts) {
    return createWarmupSim(ctx, opts as WarmupOpts | undefined);
  },
  loadRenderer() {
    return import('./render/renderer').then((m) => new m.WarmupRenderer());
  },
};
