import { expect, it } from 'vitest';
import { buildPad } from './padModel';

it('merges a group hint into one centered label', () => {
  const p = buildPad([{ button: 'dpad', label: 'Move' }], false);
  expect(p.left.stick.label).toBe('Move');
  expect(p.left.stick.buttons.every((b) => b.mapped)).toBe(true);
  expect(p.right.stick.mapped).toBe(false);
});

it('keeps per-button labels when they differ, and fades unmapped ones', () => {
  const p = buildPad([{ button: 'shiftUpR', label: 'Dash', active: true }, { button: 'shiftDnR', label: 'Potion' }, { button: 'a', label: 'Fire' }], false);
  expect(p.right.shift!.label).toBeUndefined();
  expect(p.right.shift!.buttons.map((b) => b.label)).toEqual(['Dash', 'Potion']);
  expect(p.right.stick.buttons.map((b) => b.mapped)).toEqual([false, false, true, false]); // y z a b
});

it('merges four identical face buttons', () => {
  const p = buildPad(['a', 'b', 'y', 'z'].map((button) => ({ button: button as any, label: 'Fire' })), false);
  expect(p.right.stick.label).toBe('Fire');
});

it('maps gears to shifters while preserving right-side game actions', () => {
  const g = buildPad([{ button: 'shiftersL', label: 'Gear' }, { button: 'shiftersR', label: 'Gears' }], true);
  expect(g.left.shift?.gears).toBe(true); expect(g.right.shift?.gears).toBe(true);
  expect(g.left.shift?.buttons.every((b) => b.mapped)).toBe(true);
  const d = buildPad([{ button: 'shiftUpR', label: 'Dash' }, { button: 'shiftDnR', label: 'Potion' }], true);
  expect(d.left.shift?.gears).toBe(true); expect(d.right.shift?.gears).not.toBe(true);
  expect(d.right.shift?.buttons.map((b) => b.label)).toEqual(['Dash', 'Potion']);
  const defaultGears = buildPad([], true);
  expect(defaultGears.right.shift?.gears).toBe(true);
});

it('paddles hint applies to both hoods', () => {
  const p = buildPad([{ button: 'paddles', label: 'Aim' }], false);
  expect(p.left.paddle).toEqual({ label: 'Aim', mapped: true });
});
