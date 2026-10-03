import type { GameModule } from '../../contracts';
import { createSfSim, type SfOpts } from './sim/sim';
import { drawCard, progressLine } from './card';

// id stays 'starfighter' so existing saves (best score) carry over after the rename from "Crank Fighter".
export const module: GameModule = {
  id: 'starfighter',
  title: 'Sprocket Squadron',
  blurb: 'Shoot-em-up: shifters fire your left/right guns, cadence reloads, power thrusts, sprints fire the overdrive beam. Climb through sectors, beat the bosses, upgrade your ship.',
  progressLine, drawCard,
  tags: ['sprint', 'intervals'],
  createSim(ctx, opts) {
    return createSfSim(ctx, opts as SfOpts | undefined);
  },
  loadRenderer() {
    return import('./render/renderer').then(m => new m.SfRenderer());
  },
};
