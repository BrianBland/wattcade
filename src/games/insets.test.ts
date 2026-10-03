import { describe, expect, it } from 'vitest';
import { allGames } from './registry';

// The shell HUD floats over the bottom of every game's render surface; renderers must lay out above it (CLAUDE.md).
describe('renderers honor HUD insets', () => {
  for (const g of allGames) {
    it(`${g.id} implements setInsets`, async () => {
      const r = await g.loadRenderer();
      expect(typeof r.setInsets).toBe('function');
    });
  }
});
