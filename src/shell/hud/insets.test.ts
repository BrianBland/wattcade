// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { readHudInsets } from './insets';

afterEach(() => document.body.replaceChildren());
const bounds = (el: HTMLElement, x: number, y: number, w: number, h: number) => {
  vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({ x, y, left: x, top: y, width: w, height: h, right: x + w, bottom: y + h, toJSON() {} });
};

it('keeps conservative edge insets and supplies clipped HUD bounds relative to the surface', () => {
  const surface = document.createElement('div'), probe = document.createElement('div'), hud = document.createElement('div');
  hud.className = 'hud'; hud.innerHTML = '<div></div><div></div><div></div>';
  document.body.append(surface, probe, hud);
  Object.defineProperty(probe, 'offsetHeight', { value: 188 });
  bounds(surface, 10, 20, 820, 1180);
  bounds(hud.children[0] as HTMLElement, 0, 1012, 100, 188);
  bounds(hud.children[1] as HTMLElement, 110, 1095, 620, 105);
  bounds(hud.children[2] as HTMLElement, 900, 1012, 100, 188); // outside this surface
  expect(readHudInsets(surface, probe)).toEqual({ top: 0, left: 0, right: 0, bottom: 188, occlusions: [
    { x: 0, y: 992, w: 90, h: 188 }, { x: 100, y: 1075, w: 620, h: 105 },
  ] });
});

it('uses the rectangular fallback before the HUD mounts or when the warmup HUD is hidden', () => {
  const surface = document.createElement('div'), probe = document.createElement('div');
  Object.defineProperty(probe, 'offsetHeight', { value: 168, configurable: true });
  expect(readHudInsets(surface, probe)).toEqual({ top: 0, left: 0, right: 0, bottom: 168 });
  Object.defineProperty(probe, 'offsetHeight', { value: 0 });
  expect(readHudInsets(surface, probe)).toEqual({ top: 0, left: 0, right: 0, bottom: 0 });
});
