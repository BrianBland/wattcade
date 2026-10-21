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
  expect(keys[2].textContent).toBe('Fire');
  expect(keys[2].getAttribute('aria-label')).toBe('Fire');
  expect(keys[0].textContent).toBe('Y'); // unmapped keys retain the subdued physical reference
  expect(el.textContent).toContain('Dash');
  const ev = (type: string) => { const e = new Event(type, { bubbles: true, cancelable: true }); Object.defineProperty(e, 'pointerId', { value: 7 }); return e; };
  keys[2].dispatchEvent(ev('pointerdown'));
  input.beginTick(0.03);
  expect(input.state().held.has('a')).toBe(true);
  keys[2].dispatchEvent(ev('pointerup'));
  input.beginTick(0.03);
  expect(input.state().held.has('a')).toBe(false);
  const shared = buildPad(['a', 'b', 'y', 'z'].map(button => ({ button: button as 'a' | 'b' | 'y' | 'z', label: 'Release charged shot', shortLabel: 'Fire' })), false);
  render(<Hood side="R" model={shared.right} held={new Set()} paddle={0} />, el);
  expect([...el.querySelectorAll('.pc.face button')].map(key => key.textContent)).toEqual(['Fire', 'Fire', 'Fire', 'Fire']);
  expect([...el.querySelectorAll('.pc.face button')].every(key => key.getAttribute('aria-label') === 'Release charged shot')).toBe(true);
  render(null, el);
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

it('omits duplicate gear shifters while preserving game-specific shifter actions', () => {
  const pad = buildPad([], true);
  const el = document.createElement('div');
  render(<Hood side="L" model={pad.left} held={new Set()} paddle={0} />, el);
  expect(el.querySelector('.pc.shift')).toBeNull();
  const dungeon = buildPad([{ button: 'shiftUpR', label: 'Dash' }, { button: 'shiftDnR', label: 'Potion' }], true);
  render(<Hood side="R" model={dungeon.right} held={new Set()} paddle={0} />, el);
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
    { button: 'a', label: 'Strike the enemy', shortLabel: 'Strike', cooldown: { fill: 0.4, ready: false, tint: '#ffd23b', flourish: 0.75 } },
    { button: 'b', label: 'Ward', active: true, cooldown: { fill: 1, ready: true } },
    { button: 'y', label: 'Rally' },
  ], false);
  const el = document.createElement('div');
  render(<Hood side="R" model={pad.right} held={new Set()} paddle={0} />, el);
  const k = (l: string) => el.querySelector<HTMLButtonElement>(`[aria-label="${l}"]`)!;
  expect(k('Strike the enemy').className).toMatch(/\bcd\b/); expect(k('Strike the enemy').className).not.toMatch(/\bready\b/);
  expect(k('Strike the enemy').className).toContain('hot');
  expect(k('Strike the enemy').style.getPropertyValue('--fill')).toBe('40%');
  expect(k('Strike the enemy').style.getPropertyValue('--tint')).toBe('#ffd23b');
  expect(k('Strike the enemy').querySelector('.pk-fill')).not.toBeNull();
  expect(k('Strike the enemy').textContent).toBe('Strike');
  expect(k('Strike the enemy').title).toBe('Strike the enemy');
  expect(k('Ward').className).toMatch(/\bcd ready\b/);
  expect(k('Rally').className).not.toMatch(/\bcd\b/);
  expect(k('Rally').querySelector('.pk-fill')).toBeNull();
  render(<PadKey b={pad.right.stick.buttons.find(b => b.id === 'a')!} held={new Set()} block />, el);
  expect(el.querySelector('button')?.textContent).toBe('Strike');
  expect(el.querySelector('button')?.getAttribute('aria-label')).toBe('Strike the enemy');
  render(null, el);
});


it('keeps physical button letters and gear shifters visible in the read-only controller diagram', () => {
  const el=document.createElement('div');
  const pad=buildPad([{button:'a',label:'Construction'},{button:'b',label:'Overcharge'},{button:'y',label:'Slow field'},{button:'z',label:'Rail'}],true);
  render(<Hood side="R" model={pad.right} held={new Set()} paddle={0} disabled reference />,el);
  expect([...el.querySelectorAll('.face button')].map(b=>b.textContent)).toEqual(['Y','Z','A','B']);
  expect(el.querySelector('[aria-label="A: Construction"]')).not.toBeNull();
  expect(el.querySelectorAll('.shift button')).toHaveLength(2);
  expect([...el.querySelectorAll('button')].every(b=>(b as HTMLButtonElement).disabled)).toBe(true);
  render(null,el);
});

it('shows action names without controller letters on compact touch controls', () => {
  const el = document.createElement('div');
  const b = buildPad([{ button: 'b', label: 'Buy ×10' }], false).right.stick.buttons.find(b => b.id === 'b')!;
  act(() => render(<PadKey b={b} held={new Set()} compact />, el));
  expect(el.querySelector('button')?.textContent).toBe('Buy ×10');
  expect(el.querySelector('button b')).toBeNull();
  act(() => render(<PadKey b={b} held={new Set()} reference />, el));
  expect(el.querySelector('button b')?.textContent).toBe('B');
  act(() => render(null, el));
});


it('omits the inert paddle legend from live touch controls', () => {
  const el = document.createElement('div'), pad = buildPad([{ button: 'paddles', label: 'Steer' }, { button: 'left', label: 'Steer left' }], false);
  act(() => render(<Hood side="L" model={pad.left} held={new Set()} paddle={0} compact />, el));
  expect(el.querySelector('.compact-paddles')).toBeNull();
  expect(el.querySelector('[aria-label="Steer left"]')).not.toBeNull();
  act(() => render(null, el));
});
