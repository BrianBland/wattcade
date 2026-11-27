import type { GameModule } from '../../contracts';
import { achievements } from './achievements';
import { createDungeonSim, type DungeonOpts } from './sim/sim';
import { drawCard, progressLine } from './card';

export const module: GameModule = {
  achievements,
  id: 'dungeon',
  // 3: Hero Archetypes, 3-branch Diablo skill trees, and mid-ride Pace Control (Cool Off / Cruise / Push)
  snapshotFormat: 3,
  accent: '#b26bff',
  title: 'Purgatour',
  blurb: 'Cycling ARPG descent: pick a Hero Archetype to shape your workout, level up across 3 forked skill trees, and push hard or cool off mid-ride.',
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
