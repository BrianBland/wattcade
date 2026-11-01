import type { GameModule } from '../../contracts';
import { createPenroseSim, type PenroseSave } from './sim/sim';
import { drawCard } from './card';

export const module: GameModule = {
  id: 'penrose',
  title: 'Penrose Pedals',
  blurb: 'Impossible roads and machines you drive with your legs. Turn the world until two roads meet, and the wheel rides across.',
  tags: ['zone2'],
  drawCard,
  progressLine(save) {
    const s = save as Partial<PenroseSave> | undefined;
    const n = Array.isArray(s?.done) ? s.done.length : 0;
    return n ? `${n} level${n === 1 ? '' : 's'} solved` : null;
  },
  createSim(ctx) {
    return createPenroseSim(ctx);
  },
  async loadRenderer() {
    const { PenroseRenderer } = await import('./render/renderer');
    return new PenroseRenderer();
  },
};
