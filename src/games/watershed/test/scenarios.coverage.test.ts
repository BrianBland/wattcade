import { expect, it } from 'vitest';
import { scenarios } from '../scenarios';

it('every watershed scenario has a vitest case', () => {
  // Keep in sync with scenarios.full/grind/spin/levelsA/levelsB/levelsC.test.ts (CI runs scenarios only through vitest).
  expect(scenarios.map((s) => s.name).sort()).toEqual(['full ride', 'grind digs a gorge', 'idle', 'level 1: First Spring', 'level 2 without steering', 'level 2: The Grist Mill',
    'level 3: Beaver Crew', 'level 4: Breadbasket', 'level 5: Millbrook Flood', 'level 6: Dam Buster', 'level 7: Homecoming', 'level 8: The Delta', 'spin reaches the sea']);
});
