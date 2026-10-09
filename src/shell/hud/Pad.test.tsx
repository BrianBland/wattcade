// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { render } from 'preact';
import { Hood } from './Pad';
import { buildPad } from './padModel';
import { input } from '../services';

it('renders the right hood and holds buttons while pressed', () => {
  const pad = buildPad([{ button: 'a', label: 'Fire' }, { button: 'shiftUpR', label: 'Dash' }, { button: 'shiftDnR', label: 'Potion' }], false);
  const el = document.createElement('div');
  render(<Hood side="R" model={pad.right} held={new Set(['a'])} paddle={0} />, el);
  const keys = [...el.querySelectorAll<HTMLButtonElement>('.pc.face .pk')];
  expect(keys.map((k) => k.disabled)).toEqual([true, true, false, true]); // y z a b
  expect(keys[2].className).toContain('held');
  expect(el.textContent).toContain('Dash');
  const ev = (type: string) => { const e = new Event(type, { bubbles: true, cancelable: true }); Object.defineProperty(e, 'pointerId', { value: 7 }); return e; };
  keys[2].dispatchEvent(ev('pointerdown'));
  input.beginTick(0.03);
  expect(input.state().held.has('a')).toBe(true);
  keys[2].dispatchEvent(ev('pointerup'));
  input.beginTick(0.03);
  expect(input.state().held.has('a')).toBe(false);
});

it('shows current gear above assigned shifters and shifts through touch input', () => {
  const pad = buildPad([], true);
  const el = document.createElement('div');
  render(<Hood side="L" model={pad.left} held={new Set()} paddle={0} gear={8} />, el);
  expect(el.querySelector('.pc.shift')?.firstElementChild?.textContent).toBe('Gear 8');
  const up = el.querySelector<HTMLButtonElement>('[aria-label="shiftUpL"]')!;
  expect(up.disabled).toBe(false);
  const ev = (type: string) => { const e = new Event(type, { bubbles: true, cancelable: true }); Object.defineProperty(e, 'pointerId', { value: 19 }); return e; };
  up.dispatchEvent(ev('pointerdown'));
  input.beginTick(.03);
  expect(input.state().held.has('shiftUpL')).toBe(true);
  up.dispatchEvent(ev('pointerup'));
  input.beginTick(.03);
  expect(input.state().held.has('shiftUpL')).toBe(false);
  const dungeon = buildPad([{ button: 'shiftUpR', label: 'Dash' }, { button: 'shiftDnR', label: 'Potion' }], true);
  render(<Hood side="R" model={dungeon.right} held={new Set()} paddle={0} gear={8} />, el);
  expect(el.querySelector('.pc-gear')).toBeNull();
  expect(el.textContent).toContain('Dash');
});
