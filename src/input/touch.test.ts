// @vitest-environment jsdom
import { it, expect } from 'vitest';
import { InputHub } from './index';

it('touch overlay hidden by default, presses register', () => {
  const h = new InputHub(); const c = document.createElement('div'); document.body.appendChild(c);
  const off = h.attachTouch(c);
  const root = c.querySelector('[data-wattcade]') as HTMLElement;
  expect(root.style.display).toBe('none');
  h.showTouch(true); expect(root.style.display).toBe('block');
  const a = c.querySelector('[data-btn="a"]')!;
  a.dispatchEvent(new Event('pointerdown', { cancelable: true, bubbles: true }));
  h.beginTick(0.03); expect(h.state().held.has('a')).toBe(true); expect(h.state().source).toBe('touch');
  a.dispatchEvent(new Event('pointerup'));
  h.beginTick(0.03); expect(h.state().held.has('a')).toBe(false);
  off(); expect(c.querySelector('[data-wattcade]')).toBeNull();
});

it('triple-tap top-left corner -> toggleDebug', () => {
  let t = 0; const h = new InputHub({ now: () => t }); const got: string[] = [];
  h.onSystem((a) => got.push(a));
  const c = document.createElement('div'); document.body.appendChild(c); h.attachTouch(c);
  for (let i = 0; i < 3; i++) { c.dispatchEvent(Object.assign(new Event('pointerdown'), { clientX: 10, clientY: 10 })); t += 200; }
  expect(got).toEqual(['toggleDebug']);
  c.dispatchEvent(Object.assign(new Event('pointerdown'), { clientX: 300, clientY: 300 }));
  expect(got.length).toBe(1);
});
