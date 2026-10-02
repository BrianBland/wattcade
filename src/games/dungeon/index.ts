import type { GameModule } from '../../contracts';
import { createDungeonSim } from './sim/sim';

export const module: GameModule = {
  id: 'dungeon',
  title: 'Crank Crawler',
  blurb: 'Pedal to move and shoot. Stay in zone 2 to heal; sprint to crack the boss shield.',
  tags: ['zone2', 'sprint'],
  createSim(ctx, opts) {
    return createDungeonSim(ctx, opts as { seed?: number; autopilot?: boolean } | undefined);
  },
  async loadRenderer() {
    const m = await import('./render/renderer');
    return m.createRenderer();
  },
};
