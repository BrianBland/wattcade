import type { GameModule } from '../../contracts';
import { createFullSendSim, type FullSendOpts, type FullSendSave } from './sim/sim';
import { TOURS } from './sim/tour';
import { achievements } from './achievements';
import { drawCard } from './card';

/** Full Send: the warm-up world with a rocket strapped to the bike. A sprint workout of canyon leaps, smash walls, loops, dives and chases. */
export const module: GameModule = {
  id: 'fullsend',
  title: 'Full Send',
  blurb: 'Someone bolted a rocket to your bike. Sprint to clear canyons, smash walls, ride loops and outrun a T. rex.',
  tags: ['sprint', 'intervals'],
  achievements,
  drawCard,
  createSim(ctx, opts) {
    return createFullSendSim(ctx, opts as FullSendOpts | undefined);
  },
  progressLine(save: unknown) {
    const sv = save as FullSendSave | undefined;
    if (!sv?.best) return null;
    const parts = Object.entries(sv.best).map(([id, b]) => `${TOURS[id]?.name ?? id}: ${b.golds} gold`);
    if (sv.moonVisits) parts.push(`moon ×${sv.moonVisits}`);
    return parts.join(' · ') || null;
  },
  loadRenderer() {
    return import('./render/renderer').then((m) => new m.FullSendRenderer());
  },
};
