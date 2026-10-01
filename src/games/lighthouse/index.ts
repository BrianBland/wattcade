// Placeholder stub — replaced by the game agent.
import type { GameModule } from '../../contracts';

export const module: GameModule = {
  id: 'lighthouse',
  title: "Keeper's Light",
  blurb: 'Coming soon.',
  tags: [],
  createSim() {
    return { update() {}, snapshot: () => ({}), isOver: () => true, summary: () => ({}) };
  },
  loadRenderer() {
    return Promise.reject(new Error('not implemented'));
  },
};
