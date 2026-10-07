import type { GameModule } from '../../contracts';
import { achievements } from './achievements';
import { createDungeonSim, type DungeonOpts } from './sim/sim';
import { drawCard, progressLine } from './card';

export const module: GameModule = {
  achievements,
  id: 'dungeon',
  title: 'Crank Crawler',
  blurb: 'Endless dungeon dive: pedal to shoot, loot ever-better weapons and gear, level up. Zone 2 heals; sprint to crack boss shields.',
  progressLine, drawCard,
  tags: ['zone2', 'sprint'],
  createSim(ctx, opts) {
    return createDungeonSim(ctx, opts as DungeonOpts | undefined);
  },
  async loadRenderer() {
    const m = await import('./render/renderer');
    return m.createRenderer();
  },
};
