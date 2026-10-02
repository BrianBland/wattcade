import type { GameModule } from '../../contracts';
import { createDungeonSim, type DungeonOpts } from './sim/sim';

export const module: GameModule = {
  id: 'dungeon',
  title: 'Crank Crawler',
  blurb: 'Endless dungeon dive: pedal to shoot, loot ever-better weapons and gear, level up. Zone 2 heals; sprint to crack boss shields.',
  tags: ['zone2', 'sprint'],
  createSim(ctx, opts) {
    return createDungeonSim(ctx, opts as DungeonOpts | undefined);
  },
  async loadRenderer() {
    const m = await import('./render/renderer');
    return m.createRenderer();
  },
};
