import type { GameModule } from '../../contracts';
import { createRace } from './sim/race';
import { drawCard } from './art';

export const module: GameModule = {
  id: 'cloudcup',
  title: 'Scrapjet Rally',
  accent: '#ffad57',
  blurb:
    'Race five scrapyard circuits, from Cinder Bowl’s derby oval to the branching climb on Cablehead Pass. Choose a quick heat or an endurance ride, draft a rival and swing your chain on either flank.',
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
