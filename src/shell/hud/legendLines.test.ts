import { expect, it } from 'vitest';
import { legendLines } from './legendLines';

it('merges identical labels and puts active first', () => {
  const l = legendLines([
    { button: 'a', label: 'Fire' }, { button: 'shiftersL', label: 'Left gun', active: true },
    { button: 'b', label: 'Fire' }, { button: 'paddles', label: 'Aim' },
  ]);
  expect(l.map((x) => x.label)).toEqual(['Left gun', 'Fire', 'Aim']);
  expect(l[1].keys).toEqual(['a', 'b']);
});
