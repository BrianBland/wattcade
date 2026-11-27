import type { GameModule } from '../../contracts';
import { achievements } from './achievements';
import { createDungeonSim, type DungeonOpts } from './sim/sim';
import { drawCard, progressLine } from './card';

export const module: GameModule = {
  achievements,
  id: 'dungeon',
  // 2: the fixed descent (boss variant 6, the Grim Sweeper; an older renderer would draw him as King Gel)
  snapshotFormat: 2,
  accent: '#b26bff',
  title: 'Purgatour',
  blurb: 'Endless dungeon dive: pedal to fire, swap stances, pick post-boss perks, and sprint during Exposed windows. Zone 2 heals between fights.',
  progressLine, drawCard,
  tags: ['zone2', 'intervals', 'sprint', 'erg'],
  createSim(ctx, opts) {
    return createDungeonSim(ctx, opts as DungeonOpts | undefined);
  },
  async loadRenderer() {
    const m = await import('./render/renderer');
    return m.createRenderer();
  },
};
