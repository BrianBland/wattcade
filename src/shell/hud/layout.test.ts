import { expect, it } from 'vitest';
import { controllerPresent, resolveHudLayout } from './layout';

it('detects idle Ride and gamepad connections without using the last input source', () => {
  expect(controllerPresent(true)).toBe(true);
  expect(controllerPresent(false, [null, { connected: true }])).toBe(true);
  expect(controllerPresent(false, [{ connected: false }, null])).toBe(false);
  expect(controllerPresent(false)).toBe(false);
});
it('auto follows presence and manual touch/controller preferences take precedence', () => {
  expect(resolveHudLayout('auto', true)).toBe('controller');
  expect(resolveHudLayout('auto', false)).toBe('touch');
  expect(resolveHudLayout('touch', true)).toBe('touch');
  expect(resolveHudLayout('controller', false)).toBe('controller');
});
