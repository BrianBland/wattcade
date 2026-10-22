// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { HamsterRenderer } from '../render/renderer';
import type { Profile } from '../../../contracts';
vi.mock('../../../audio/sfx', () => ({ play: vi.fn(), unlockAudio: vi.fn() }));
let renderer: HamsterRenderer, host: HTMLDivElement, canvas: HTMLCanvasElement;
const send = vi.fn();
// Seed a visible list without coupling input tests to canvas artwork.
const state = () => renderer as unknown as { scroll: number; maxScroll: number; listRect: { x: number; y: number; w: number; h: number }; rowRects: Array<{ x: number; y: number; w: number; h: number; i: number }>; tabRects: Array<{ x: number; y: number; w: number; h: number; i: number }> };
function pointer(type: string, x: number, y: number, id = 1) {
  const e = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(e, { clientX: { value: x }, clientY: { value: y }, pointerId: { value: id } });
  canvas.dispatchEvent(e);
}
beforeEach(() => {
  send.mockClear(); vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({} as CanvasRenderingContext2D);
  host = document.createElement('div'); document.body.append(host); renderer = new HamsterRenderer();
  renderer.mount(host, { profile: {} as Profile, send }); canvas = host.querySelector('canvas')!;
  Object.assign(state(), { maxScroll: 500, listRect: { x: 0, y: 100, w: 300, h: 300 }, rowRects: [{ x: 0, y: 100, w: 300, h: 68, i: 2 }], tabRects: [{ x: 0, y: 40, w: 80, h: 50, i: 1 }] });
});
afterEach(() => { renderer.unmount(); host.remove(); vi.restoreAllMocks(); });
it('defers row selection until release and emits exactly one tap', () => {
  pointer('pointerdown', 30, 130); expect(send).not.toHaveBeenCalled();
  pointer('pointerup', 30, 130); expect(send).toHaveBeenCalledExactlyOnceWith({ type: 'row', i: 2 });
});
it('scrolls continuously without buying, including movement beyond the list', () => {
  pointer('pointerdown', 30, 150); pointer('pointermove', 30, 110); expect(state().scroll).toBe(40);
  pointer('pointermove', 30, -10); expect(state().scroll).toBe(160);
  pointer('pointerup', 30, -10); expect(send).not.toHaveBeenCalled();
});
it('clamps wheel scrolling to content and ignores wheel input outside the list', () => {
  canvas.dispatchEvent(new WheelEvent('wheel', { clientX: 30, clientY: 130, deltaY: 900, cancelable: true })); expect(state().scroll).toBe(500);
  canvas.dispatchEvent(new WheelEvent('wheel', { clientX: 30, clientY: 30, deltaY: -900, cancelable: true })); expect(state().scroll).toBe(500);
  canvas.dispatchEvent(new WheelEvent('wheel', { clientX: 30, clientY: 130, deltaY: -900, cancelable: true })); expect(state().scroll).toBe(0);
  expect(send).not.toHaveBeenCalled();
});
it('cancels on pointer cancellation, blur, and resize without purchasing', () => {
  for (const cancel of ['pointercancel', 'blur', 'resize']) {
    pointer('pointerdown', 30, 130);
    if (cancel === 'blur') window.dispatchEvent(new Event('blur'));
    else if (cancel === 'resize') renderer.resize(390, 844);
    else pointer('pointercancel', 30, 130);
    pointer('pointerup', 30, 130);
  }
  expect(send).not.toHaveBeenCalled();
});
it('keeps native tab taps and does not treat horizontal drags as purchases', () => {
  pointer('pointerdown', 30, 60); expect(send).toHaveBeenCalledExactlyOnceWith({ type: 'tab', i: 1 }); send.mockClear();
  pointer('pointerdown', 30, 130); pointer('pointermove', 100, 130); pointer('pointerup', 100, 130); expect(send).not.toHaveBeenCalled();
});
