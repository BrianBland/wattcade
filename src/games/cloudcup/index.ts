import type { GameModule } from '../../contracts';
import { createRace } from './sim/race';
import { drawCard } from './art';

export const module: GameModule = {
  id: 'cloudcup',
  title: 'Scrapjet Rally',
  accent: '#ffad57',
  blurb:
    'Race the breaker crew on Magnet Mile or Kiln Switchbacks. Choose a short heat or an endurance ride. Draft their point rider, lean through the banks and sweep either flank with your salvage chain.',
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
