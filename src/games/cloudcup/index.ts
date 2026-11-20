import type { GameModule } from '../../contracts';
import { createRace } from './sim/race';
import { drawCard } from './art';

export const module: GameModule = {
  id: 'cloudcup',
  title: 'Scrapjet Rally',
  accent: '#ffad57',
  blurb:
    'Race the breaker crew on Magnet Mile’s broken viaduct, Kiln Switchbacks’ firing drums and Stormglass Causeway’s high-voltage crossing. Choose a quick heat or an endurance ride, draft a rival and swing your chain on either flank.',
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
