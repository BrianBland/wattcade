import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { themeCss } from './tokens';
it('keeps the checked-in CSS generated from the renderer tokens', () => {
  expect(readFileSync(new URL('./tokens.css', import.meta.url), 'utf8')).toBe(themeCss());
});
