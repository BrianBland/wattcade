import type { GameModule } from '../../contracts';
import { createRace } from './sim/race';
import type { RallySave } from './sim/timing';
import { drawCard } from './art';

export const module: GameModule = {
  id: 'cloudcup',
  title: 'Scrapjet Rally',
  accent: '#ffad57',
  blurb:
    'Race five scrapyard circuits, from Cinder Bowl’s derby oval to the branching climb on Cablehead Pass. Race the pack or ride an 18-minute FTP pursuit with three timed duels, easy recoveries and a cool-down.',
  tags: ['intervals'],
  drawCard,
  createSim: (ctx) => createRace(ctx),
  progressLine(raw) {
    const save = raw as RallySave | undefined;
    const flags = Object.values(save?.pursuits ?? {}).map((row) => row.flags);
    const results = save?.bestPlace ? ['Best finish · ' + save.bestPlace + ' / 4'] : [];
    if (flags.length) results.push('Pursuit · ' + Math.max(...flags) + '/3 flags');
    return results.join('   ·   ') || null;
  },
  async loadRenderer() {
    return new (await import('./render/renderer')).Renderer();
  },
};
