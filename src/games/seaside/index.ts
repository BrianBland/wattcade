import type { GameModule } from '../../contracts';
import { migrateSave } from './sim/save';
import { createSeasideSim, type SeasideOpts } from './sim/sim';

export const module: GameModule = {
  id: 'seaside',
  title: 'Seaside',
  blurb: 'A slow ride down Highway 1 with a fishing rod. Two hours, three chapters.',
  tags: ['zone2'],
  createSim(ctx, opts) {
    return createSeasideSim(ctx, opts as SeasideOpts | undefined);
  },
  async loadRenderer() {
    const { SeasideRenderer } = await import('./render/renderer');
    return new SeasideRenderer();
  },
  progressLine(raw) {
    const s = migrateSave(raw);
    if (s.checkpoint) return 'Ride in progress';
    return s.rides ? `${s.rides} ride${s.rides === 1 ? '' : 's'} home` : null;
  },
};
