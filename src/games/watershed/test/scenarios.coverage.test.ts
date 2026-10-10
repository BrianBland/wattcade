import { expect, it } from 'vitest';
import { scenarios } from '../scenarios';

it('every watershed scenario has a vitest case', () => {
  // Keep in sync with scenarios.full/grind/spin.test.ts (CI runs scenarios only through vitest).
  expect(scenarios.map((s) => s.name).sort()).toEqual(['full ride', 'grind digs a gorge', 'idle', 'spin reaches the sea']);
});
