// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { Hood, PadKey } from './Pad';
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

it('cancels semantic holds on pointer cancellation, lost capture, blur and pause without firing on release', () => {
  const el = document.createElement('div'), send = vi.fn();
  const b = buildPad([{ button: 'z', label: 'Rail', touch: { down: { type: 'railDown', epoch: 4 }, up: { type: 'railUp', epoch: 4 }, cancel: { type: 'railCancel', epoch: 4 } } }], false).right.stick.buttons.find(b => b.id === 'z')!;
  const ev = (type: string) => { const e = new Event(type, { bubbles: true, cancelable: true }); Object.defineProperty(e, 'pointerId', { value: 17 }); return e; };
  const show = (disabled = false) => act(() => render(<PadKey b={b} held={new Set()} send={send} disabled={disabled} />, el));
  try {
    show();
    for (const cancel of ['pointercancel', 'lostpointercapture', 'blur', 'pause']) {
      const key = el.querySelector('button')!;
      act(() => { key.dispatchEvent(ev('pointerdown')); });
      if (cancel === 'pause') show(true);
      else act(() => { (cancel === 'blur' ? window : key).dispatchEvent(ev(cancel)); });
      expect(send).toHaveBeenLastCalledWith({ type: 'railCancel', epoch: 4, pointer: 17 });
      act(() => { key.dispatchEvent(ev('pointerup')); });
      expect(send.mock.calls.some(([a]) => a.type === 'railUp')).toBe(false);
    }
  } finally { act(() => render(null, el)); }
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

it('removes unused peripheral controls while retaining assigned paddles and actions', () => {
  const el = document.createElement('div');
  const empty = buildPad([], false);
  render(<Hood side="L" model={empty.left} held={new Set()} paddle={0} />, el);
  expect(el.querySelector('.pp')).toBeNull();
  expect(el.querySelector('.shift')).toBeNull();
  expect(el.querySelectorAll('.pc-grid .pk')).toHaveLength(4);
  const assigned = buildPad([{ button: 'paddles', label: 'Aim' }, { button: 'shiftUpR', label: 'Dash' }], false);
  render(<Hood side="R" model={assigned.right} held={new Set()} paddle={.5} />, el);
  expect(el.querySelector('.pp')?.textContent).toBe('Aim');
  expect(el.querySelector('[aria-label="Dash"]')).not.toBeNull();
  expect(el.querySelector('[aria-label="Right controller"]')).not.toBeNull();
});

it('draws a game cooldown on the key: partial fill tinted by effort, then a ready glow', () => {
  const pad = buildPad([
    { button: 'a', label: 'Strike', cooldown: { fill: 0.4, ready: false, tint: '#ffd23b', flourish: 0.75 } },
    { button: 'b', label: 'Ward', active: true, cooldown: { fill: 1, ready: true } },
    { button: 'y', label: 'Rally' },
  ], false);
  const el = document.createElement('div');
  render(<Hood side="R" model={pad.right} held={new Set()} paddle={0} />, el);
  const k = (l: string) => el.querySelector<HTMLButtonElement>(`[aria-label="${l}"]`)!;
  expect(k('Strike').className).toMatch(/\bcd\b/); expect(k('Strike').className).not.toMatch(/\bready\b/);
  expect(k('Strike').className).toContain('hot');
  expect(k('Strike').style.getPropertyValue('--fill')).toBe('40%');
  expect(k('Strike').style.getPropertyValue('--tint')).toBe('#ffd23b');
  expect(k('Strike').querySelector('.pk-fill')).not.toBeNull();
  expect(k('Ward').className).toMatch(/\bcd ready\b/);
  expect(k('Rally').className).not.toMatch(/\bcd\b/);
  expect(k('Rally').querySelector('.pk-fill')).toBeNull();
});
