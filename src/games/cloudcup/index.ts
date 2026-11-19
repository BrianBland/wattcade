import type { GameModule } from '../../contracts';
import { createRace } from './sim/race';
import { drawCard } from './art';

export const module: GameModule = {
  id: 'cloudcup',
  title: 'Cloudcup',
  accent: '#ffad57',
  blurb:
    'Fly the Windmill Isles. Hold either paddle to steer, catch gold boost strips and scoop up gusts to blow past three rival skiffs.',
  tags: ['intervals'],
  drawCard,
  createSim: (ctx) => createRace(ctx),
  progressLine(raw) {
    const best = (raw as { bestPlace?: number } | undefined)?.bestPlace;
    return best ? 'Best finish · ' + best + ' / 4' : null;
  },
  async loadRenderer() {
    return new (await import('./render/renderer')).Renderer();
  },
};
