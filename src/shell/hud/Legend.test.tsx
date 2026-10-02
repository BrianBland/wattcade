// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { render } from 'preact';
import { Legend } from './Legend';

it('lays the hoods out like the Ride: D-pad left, ABYZ diamond right, shifters inboard', () => {
  const el = document.createElement('div');
  render(<Legend controls={[{ button: 'a', label: 'Fire' }]} held={new Set(['y'])} paddles={[0, 0.5]} expanded />, el);
  const [left, right] = [...el.querySelectorAll('.lg-hood')];
  const at = (hood: Element, pos: string) => hood.querySelector(`.lg-diamond .${pos} b`)!.textContent;
  expect(['top', 'lft', 'rgt', 'bot'].map((p) => at(left, p))).toEqual(['▲', '◀', '▶', '▼']);
  expect(['top', 'lft', 'rgt', 'bot'].map((p) => at(right, p))).toEqual(['Y', 'Z', 'A', 'B']);
  expect(left.querySelector('.lg-shift')!.textContent).toContain('Shift L');
  expect(right.querySelector('.lg-shift')!.textContent).toContain('Shift R');
  expect(right.querySelector('.rgt')!.className).toContain('mapped');
  expect(right.querySelector('.top')!.className).toContain('held');
  expect(left.querySelector('.lg-paddle')!.className).not.toContain('held');
  expect(right.querySelector('.lg-paddle')!.className).toContain('held');
});
